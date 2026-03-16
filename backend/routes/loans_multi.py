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
    
    # Calculate payment allocation
    outstanding = loan.get("outstanding_balance", 0)
    loan_amount = loan.get("loan_amount", 0)
    interest_rate = loan.get("interest_rate", 0)
    interest_due = loan.get("total_amount_due", 0) - loan_amount
    
    principal_portion = 0
    interest_portion = 0
    extra_interest = 0
    
    if amount >= outstanding:
        # Full payoff or overpayment
        if amount > outstanding:
            extra_interest = round(amount - outstanding, 2)
        principal_portion = loan_amount - (loan.get("total_paid", 0) or 0)
        interest_portion = interest_due + extra_interest
        new_outstanding = 0
        new_status = "archived"  # Auto-archive when fully paid
    else:
        # Partial payment
        if amount <= interest_due:
            interest_portion = amount
        else:
            interest_portion = interest_due
            principal_portion = amount - interest_due
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
        "principal_portion": principal_portion,
        "interest_portion": interest_portion,
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
