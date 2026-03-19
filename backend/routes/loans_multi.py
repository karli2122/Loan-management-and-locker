"""Loans management - Support for multiple loans per client."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/loans", tags=["loans"])


@router.get("/client/{client_id}")
async def get_client_loans(
    client_id: str,
    admin_token: str = Query(...),
    status: str = Query("active"),  # active, archived, all
):
    """Get all loans for a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Build query
    query = {"client_id": client_id}
    if status == "active":
        query["status"] = "active"
    elif status == "archived":
        query["status"] = "archived"
    # status == "all" means no status filter
    
    loans = await db.loans.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich loans with calculated fields
    for loan in loans:
        # Calculate next payment date if not set
        if not loan.get("next_payment_date") and loan.get("due_date"):
            loan["next_payment_date"] = loan["due_date"]
        
        # Calculate due today amount and outstanding
        if loan.get("given_date") and loan.get("status") == "active":
            from datetime import datetime, timezone
            try:
                given = loan["given_date"]
                if isinstance(given, str):
                    given = datetime.fromisoformat(given.replace("Z", "+00:00"))
                if hasattr(given, 'tzinfo') and given.tzinfo is None:
                    given = given.replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                
                principal = loan.get("loan_amount", 0)
                rate = loan.get("interest_rate", 0)
                tenure = loan.get("tenure_months", 1) or 1
                already_paid = loan.get("total_paid", 0) or 0
                
                # Base interest = principal × rate% × tenure_months
                base_interest = principal * (rate / 100) * tenure
                base_total = principal + base_interest  # What's owed by due date
                
                # Calculate days overdue
                due_date = loan.get("due_date")
                days_overdue = 0
                if due_date:
                    if isinstance(due_date, str):
                        due_date_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    else:
                        due_date_dt = due_date
                    if hasattr(due_date_dt, 'date'):
                        days_overdue = max(0, (now.date() - due_date_dt.date()).days)
                    else:
                        days_overdue = max(0, (now - due_date_dt).days)
                
                loan["days_overdue"] = days_overdue
                
                # Late fee = daily interest × overdue days
                daily_interest = principal * (rate / 100) / 30
                late_fee = daily_interest * days_overdue if days_overdue > 0 else 0
                
                # Due today = base_total + late_fee - already_paid
                due_today = max(0, round(base_total + late_fee - already_paid, 2))
                loan["due_today_amount"] = due_today
                loan["late_fee"] = round(late_fee, 2)
                
                # Outstanding = same calculation (what's owed right now)
                loan["outstanding_balance"] = due_today
                
            except Exception:
                loan["due_today_amount"] = loan.get("outstanding_balance", 0)
                loan["days_overdue"] = 0
        else:
            loan["due_today_amount"] = loan.get("outstanding_balance", 0)
            loan["days_overdue"] = 0
            loan["late_fee"] = 0
        
        # Calculate next payment amount
        if not loan.get("next_payment_amount"):
            loan["next_payment_amount"] = loan.get("emi_amount") or loan.get("outstanding_balance", 0)
        
        # Calculate interest amount and total_amount_due
        loan_amount = loan.get("loan_amount", 0)
        interest_rate = loan.get("interest_rate", 0)
        if loan_amount and interest_rate:
            tenure = loan.get("tenure_months", 1) or 1
            loan["interest_amount"] = loan_amount * (interest_rate / 100) * tenure
        
        # Ensure total_amount_due is set (frontend uses this field)
        if not loan.get("total_amount_due"):
            loan["total_amount_due"] = loan.get("total_amount") or (
                loan_amount + loan.get("interest_amount", 0)
            )
        
        # Ensure loan_given_date is set from given_date for display
        if not loan.get("loan_given_date") and loan.get("given_date"):
            loan["loan_given_date"] = loan["given_date"]
    
    # Calculate summary
    active_loans = [loan for loan in loans if loan.get("status") == "active"]
    summary = {
        "total_loans": len(loans),
        "active_loans": len(active_loans),
        "total_loan_amount": sum(loan.get("loan_amount", 0) for loan in active_loans),
        "total_outstanding": sum(loan.get("outstanding_balance", 0) for loan in active_loans),
        "total_paid": sum(loan.get("total_paid", 0) for loan in active_loans),
    }
    
    return {"loans": loans, "summary": summary}


@router.get("/all")
async def get_all_loans(
    admin_token: str = Query(...),
    status: str = Query("active"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Get all loans for the admin (for loans tab display)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Check if superadmin for hierarchical scoping
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "is_super_admin": 1, "plan": 1})
    is_super = admin.get("is_super_admin", False) if admin else False
    admin_plan = admin.get("plan", "starter") if admin else "starter"
    
    # Build list of admin IDs to include
    admin_ids = [admin_id]
    if is_super or admin_plan in ("enterprise", "custom"):
        created_users = await db.admins.find(
            {"created_by": admin_id},
            {"_id": 0, "id": 1}
        ).to_list(100)
        admin_ids.extend([u["id"] for u in created_users])
    
    # Build query
    query = {"admin_id": {"$in": admin_ids}}
    if status == "active":
        query["status"] = "active"
    elif status == "archived":
        query["status"] = "archived"
    
    # Get total count
    total = await db.loans.count_documents(query)
    
    # Get paginated loans
    skip = (page - 1) * limit
    loans = await db.loans.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "loans": loans,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": total > skip + len(loans)
    }


@router.post("/{loan_id}/payment")
async def record_loan_payment(
    loan_id: str,
    admin_token: str = Query(...),
    amount: float = Query(..., gt=0),
    payment_date: str = Query(None),
    notes: str = Query(""),
):
    """Record a payment for a specific loan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get the loan
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if loan.get("status") != "active":
        raise HTTPException(status_code=400, detail="Cannot record payment for archived loan")
    
    # Calculate due_today_amount (simple interest by day)
    outstanding = loan.get("outstanding_balance", 0)
    loan_amount = loan.get("loan_amount", 0)
    interest_rate = loan.get("interest_rate", 0)
    
    due_today_amount = outstanding  # fallback
    try:
        given = loan.get("given_date")
        if given and interest_rate > 0:
            if isinstance(given, str):
                given = datetime.fromisoformat(given.replace("Z", "+00:00"))
            if hasattr(given, 'tzinfo') and given.tzinfo is None:
                given = given.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if hasattr(given, 'date'):
                days_elapsed = (now.date() - given.date()).days
            else:
                days_elapsed = (now - given).days
            if days_elapsed < 0:
                days_elapsed = 0
            interest_today = loan_amount * (interest_rate / 100) * (days_elapsed / 30)
            total_due_today = round(loan_amount + interest_today, 2)
            already_paid = loan.get("total_paid", 0) or 0
            due_today_amount = max(0, round(total_due_today - already_paid, 2))
    except Exception:
        pass
    
    # Determine if loan should be completed
    # If payment covers due_today_amount (daily interest), loan is fully paid
    if amount >= due_today_amount and due_today_amount > 0:
        new_outstanding = 0
        new_status = "archived"
    elif amount >= outstanding:
        new_outstanding = 0
        new_status = "archived"
    else:
        new_outstanding = max(outstanding - amount, 0)
        new_status = "active"
    
    # Update loan
    current_total_paid = loan.get("total_paid", 0) or 0
    update_data = {
        "outstanding_balance": new_outstanding,
        "total_paid": current_total_paid + amount,
        "status": new_status,
        "last_payment_date": payment_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    if new_status == "archived":
        update_data["archived_at"] = datetime.now(timezone.utc)
    
    await db.loans.update_one({"id": loan_id}, {"$set": update_data})
    
    # Record payment in payments collection
    payment_record = {
        "id": str(uuid.uuid4()),
        "loan_id": loan_id,
        "client_id": loan.get("client_id"),
        "admin_id": admin_id,
        "amount": amount,
        "payment_date": datetime.fromisoformat(payment_date) if payment_date else datetime.now(timezone.utc),
        "payment_method": "bank_transfer",
        "notes": notes or f"Payment for loan {loan_id}",
        "created_at": datetime.now(timezone.utc),
    }
    await db.payments.insert_one(payment_record)
    
    # Update client summary
    client_id = loan.get("client_id")
    if client_id:
        active_loans = await db.loans.find(
            {"client_id": client_id, "status": "active"}
        ).to_list(100)
        
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {
                "total_loan_amount": sum(loan.get("loan_amount", 0) for loan in active_loans),
                "total_outstanding_all_loans": sum(loan.get("outstanding_balance", 0) for loan in active_loans),
                "total_paid_all_loans": sum(loan.get("total_paid", 0) for loan in active_loans),
                "active_loans_count": len(active_loans),
                "has_multiple_loans": len(active_loans) > 1,
            }}
        )
    
    # Update credit score based on payment timing
    credit_score_change = 0
    credit_score_reason = ""
    try:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0}) if client_id else None
        if client:
            days_overdue = client.get("days_overdue", 0)
            is_late = client.get("is_late", False)
            if days_overdue > 0 or is_late:
                credit_score_change = -10
                credit_score_reason = f"late_payment_{days_overdue}_days_overdue"
            else:
                credit_score_change = 5
                credit_score_reason = "on_time_payment"
            
            if new_status == "archived":
                credit_score_change += 20
                credit_score_reason += "_loan_completed"
            
            if credit_score_change != 0:
                from routes.credit_score import update_credit_score
                await update_credit_score(
                    client_id=client_id,
                    change_amount=credit_score_change,
                    reason=credit_score_reason,
                    admin_id=admin_id
                )
    except Exception as e:
        logger.error(f"Credit score update failed for loan {loan_id}: {e}")
    
    return {
        "success": True,
        "loan_id": loan_id,
        "payment_amount": amount,
        "new_outstanding": new_outstanding,
        "loan_fully_paid": new_status == "archived"
    }


@router.get("/{loan_id}")
async def get_loan_details(
    loan_id: str,
    admin_token: str = Query(...),
):
    """Get details of a specific loan."""
    await get_admin_id_from_token(admin_token)
    
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Get payment history for this loan
    payments = await db.payments.find(
        {"loan_id": loan_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return {"loan": loan, "payments": payments}


@router.post("/{loan_id}/archive")
async def archive_loan(
    loan_id: str,
    admin_token: str = Query(...),
):
    """Manually archive a loan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    await db.loans.update_one(
        {"id": loan_id},
        {"$set": {
            "status": "archived",
            "archived_at": datetime.now(timezone.utc),
            "archived_by": admin_id,
        }}
    )
    
    # Update client summary
    client_id = loan.get("client_id")
    if client_id:
        active_loans = await db.loans.find(
            {"client_id": client_id, "status": "active"}
        ).to_list(100)
        
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {
                "total_loan_amount": sum(loan.get("loan_amount", 0) for loan in active_loans),
                "total_outstanding_all_loans": sum(loan.get("outstanding_balance", 0) for loan in active_loans),
                "active_loans_count": len(active_loans),
                "has_multiple_loans": len(active_loans) > 1,
            }}
        )
    
    return {"success": True, "loan_id": loan_id, "status": "archived"}


@router.put("/{loan_id}")
async def update_loan(
    loan_id: str,
    admin_token: str = Query(...),
    loan_amount: float = Query(None),
    interest_rate: float = Query(None),
    loan_given_date: str = Query(None),
    due_date: str = Query(None),
    emi_amount: float = Query(None),
    next_payment_date: str = Query(None),
    next_payment_amount: float = Query(None),
    notes: str = Query(None),
):
    """Update loan details."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Build update data
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if loan_amount is not None:
        update_data["loan_amount"] = loan_amount
        # Recalculate total amount due and outstanding
        rate = interest_rate if interest_rate is not None else loan.get("interest_rate", 0)
        interest_amount = loan_amount * (rate / 100)
        total_due = loan_amount + interest_amount
        update_data["total_amount_due"] = total_due
        paid = loan.get("total_paid", 0)
        update_data["outstanding_balance"] = max(total_due - paid, 0)
        
    if interest_rate is not None:
        update_data["interest_rate"] = interest_rate
        # Recalculate if loan_amount wasn't also updated
        if loan_amount is None:
            principal = loan.get("loan_amount", 0)
            interest_amount = principal * (interest_rate / 100)
            total_due = principal + interest_amount
            update_data["total_amount_due"] = total_due
            paid = loan.get("total_paid", 0)
            update_data["outstanding_balance"] = max(total_due - paid, 0)
    
    if loan_given_date is not None:
        update_data["loan_given_date"] = loan_given_date
    
    if due_date is not None:
        update_data["due_date"] = due_date
    
    if emi_amount is not None:
        update_data["emi_amount"] = emi_amount
    
    if next_payment_date is not None:
        update_data["next_payment_date"] = next_payment_date
    
    if next_payment_amount is not None:
        update_data["next_payment_amount"] = next_payment_amount
    
    if notes is not None:
        update_data["notes"] = notes
    
    await db.loans.update_one({"id": loan_id}, {"$set": update_data})
    
    # Update client summary
    client_id = loan.get("client_id")
    if client_id:
        active_loans = await db.loans.find(
            {"client_id": client_id, "status": "active"}
        ).to_list(100)
        
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {
                "total_loan_amount": sum(l.get("loan_amount", 0) for l in active_loans),
                "total_outstanding_all_loans": sum(l.get("outstanding_balance", 0) for l in active_loans),
            }}
        )
    
    # Fetch updated loan
    updated_loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    
    return {"success": True, "loan": updated_loan}

