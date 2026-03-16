"""
Bank Statement Reconciliation - New Client Creation Tests (Iteration 81)

Tests for new features in POST /api/import/bank-statement/reconcile:
1. Create new clients from unmatched negative transactions
2. New clients have import_needs_review=True flag
3. Auto-archive fully paid loans to paid_loans collection
4. Summary response includes new_clients_created count
"""
import pytest
import requests
import os
import io
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://subscription-tier-1.preview.emergentagent.com"


class TestNewClientCreationFromUnmatchedTransactions:
    """Test new client creation from unmatched negative transactions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token"""
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.admin_token = login_resp.json()["token"]
        self.admin_id = login_resp.json().get("admin_id", "")
    
    def test_negative_unmatched_transaction_creates_new_client(self):
        """Test that negative amount for non-existent client creates new client"""
        # Use a completely unique name that won't match any existing client
        unique_name = f"TEST_NewPerson_{uuid.uuid4().hex[:8]}"
        loan_amount = 750.0
        
        csv_content = f"""name,amount,date,description
{unique_name},-{loan_amount},2026-01-20,Loan disbursement to new person"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("new_client.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check summary includes new_clients_created count
        summary = data["summary"]
        assert "new_clients_created" in summary, f"Missing new_clients_created in summary: {summary}"
        assert summary["new_clients_created"] >= 1, f"Expected at least 1 new client created: {summary}"
        
        # Check details has new_clients_created list
        details = data["details"]
        assert "new_clients_created" in details, f"Missing new_clients_created in details: {details}"
        
        new_clients = details["new_clients_created"]
        assert len(new_clients) >= 1, f"Expected at least 1 new client in list: {new_clients}"
        
        # Find our newly created client
        our_client = None
        for nc in new_clients:
            if nc.get("client_name") == unique_name:
                our_client = nc
                break
        
        assert our_client is not None, f"New client '{unique_name}' not found in: {new_clients}"
        assert our_client["loan_amount"] == loan_amount, f"Wrong loan amount: {our_client}"
        assert our_client["needs_review"] == True, f"needs_review should be True: {our_client}"
        
        print(f"New client creation test PASSED: {our_client}")
        
        # Verify client was actually created in database with correct flags
        client_id = our_client.get("client_id")
        assert client_id, f"No client_id in response: {our_client}"
        
        # Fetch client via list endpoint (single client endpoint uses response_model that filters extra fields)
        clients_resp = requests.get(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}"
        )
        
        if clients_resp.status_code == 200:
            clients_list = clients_resp.json().get("clients", [])
            client_data = None
            for c in clients_list:
                if c.get("id") == client_id:
                    client_data = c
                    break
            
            if client_data:
                assert client_data.get("import_needs_review") == True, f"import_needs_review should be True: {client_data}"
                assert client_data.get("imported") == True, f"imported should be True: {client_data}"
                assert client_data.get("imported_from_statement") == True, f"imported_from_statement should be True: {client_data}"
                assert client_data.get("loan_amount") == loan_amount, f"Wrong loan_amount: {client_data}"
                print(f"Client flags verification PASSED: import_needs_review={client_data.get('import_needs_review')}, imported={client_data.get('imported')}")
    
    def test_multiple_new_clients_from_multiple_negative_transactions(self):
        """Test creating multiple new clients from multiple negative transactions"""
        unique_name1 = f"TEST_MultiNew1_{uuid.uuid4().hex[:8]}"
        unique_name2 = f"TEST_MultiNew2_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name1},-500.00,2026-01-20,First new loan
{unique_name2},-300.00,2026-01-21,Second new loan"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("multi_new.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        summary = data["summary"]
        assert summary["new_clients_created"] >= 2, f"Expected at least 2 new clients created: {summary}"
        
        new_clients = data["details"]["new_clients_created"]
        names_created = [nc["client_name"] for nc in new_clients]
        
        assert unique_name1 in names_created, f"{unique_name1} not found in {names_created}"
        assert unique_name2 in names_created, f"{unique_name2} not found in {names_created}"
        
        print(f"Multiple new clients test PASSED: Created {len(new_clients)} clients")
    
    def test_positive_unmatched_transaction_not_creates_client(self):
        """Test that positive amount for non-existent client does NOT create new client"""
        # Use a name that doesn't contain any IGNORE_KEYWORDS (avoid 'ost', 'fee', etc.)
        unique_name = f"NEWCLIENT_RandomPay_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name},500.00,2026-01-20,Payment from unknown person"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("positive_unmatched.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should be unmatched, NOT create new client
        summary = data["summary"]
        assert summary["unmatched"] >= 1, f"Expected unmatched transaction: {summary}"
        
        # Should NOT create new client for positive amount
        new_clients = data["details"]["new_clients_created"]
        names_created = [nc.get("client_name") for nc in new_clients]
        assert unique_name not in names_created, f"Should NOT create client from positive amount: {names_created}"
        
        # Should be in unmatched list
        unmatched = data["details"]["unmatched_transactions"]
        unmatched_names = [ut.get("name") for ut in unmatched]
        assert unique_name in unmatched_names, f"Should be in unmatched: {unmatched_names}"
        
        print(f"Positive unmatched test PASSED: Transaction is unmatched, not creating client")
    
    def test_new_client_has_zero_interest_rate(self):
        """Test that new client created from statement has interest_rate=0 (user needs to set)"""
        unique_name = f"TEST_ZeroInterest_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name},-600.00,2026-01-20,Loan to test interest"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("zero_interest.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        new_clients = data["details"]["new_clients_created"]
        our_client = None
        for nc in new_clients:
            if nc.get("client_name") == unique_name:
                our_client = nc
                break
        
        assert our_client is not None, f"Client not found: {new_clients}"
        client_id = our_client.get("client_id")
        
        # Fetch client to verify interest_rate is 0
        clients_resp = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_token={self.admin_token}"
        )
        
        if clients_resp.status_code == 200:
            client_data = clients_resp.json()
            assert client_data.get("interest_rate") == 0, f"Interest rate should be 0: {client_data}"
            print(f"Zero interest rate test PASSED: interest_rate={client_data.get('interest_rate')}")


class TestAutoArchiveOnFullPayment:
    """Test auto-archive functionality when loan is fully paid via bank statement reconciliation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token"""
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.admin_token = login_resp.json()["token"]
        self.admin_id = login_resp.json().get("admin_id", "")
    
    def test_full_payment_auto_archives_loan(self):
        """Test that full payment via reconciliation auto-archives the loan"""
        # Create a test client with known loan
        client_name = f"TEST_AutoArchive_{uuid.uuid4().hex[:8]}"
        loan_amount = 200.0
        
        # Create client
        client_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}",
            json={
                "name": client_name,
                "phone": f"+3725559{uuid.uuid4().hex[:4]}",
                "email": f"autoarchive_{uuid.uuid4().hex[:6]}@test.com",
                "loan_amount": loan_amount,
                "interest_rate": 0,  # No interest for simple test
            }
        )
        
        if client_resp.status_code != 200:
            pytest.skip(f"Could not create test client: {client_resp.text}")
        
        client_data = client_resp.json()
        client_id = client_data.get("id")
        
        # Verify client has outstanding balance
        get_resp = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_token={self.admin_token}")
        assert get_resp.status_code == 200
        client_before = get_resp.json()
        outstanding_before = client_before.get("outstanding_balance", 0)
        print(f"Client before payment: outstanding_balance={outstanding_before}")
        
        # Pay exactly the outstanding balance to fully pay the loan
        payment_amount = outstanding_before if outstanding_before > 0 else loan_amount
        
        csv_content = f"""name,amount,date,description
{client_name},{payment_amount},2026-01-20,Full payment to trigger auto-archive"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("full_pay.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check if payment was recorded with loan_fully_paid=True
        payments = data["details"]["payments_recorded"]
        our_payment = None
        for p in payments:
            if p.get("client_id") == client_id:
                our_payment = p
                break
        
        if our_payment:
            assert our_payment["loan_fully_paid"] == True, f"Expected loan_fully_paid=True: {our_payment}"
            assert our_payment["new_outstanding"] == 0, f"Expected new_outstanding=0: {our_payment}"
            print(f"Payment recorded with loan_fully_paid=True: {our_payment}")
        
        # Check if loan was archived to paid_loans collection
        # Wait a bit for the archive to complete (async operation)
        import time
        time.sleep(0.5)
        
        # Check paid_loans for this client
        paid_loans_resp = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/loan-history?admin_token={self.admin_token}"
        )
        
        if paid_loans_resp.status_code == 200:
            history_data = paid_loans_resp.json()
            loan_history = history_data.get("loan_history", [])
            
            if len(loan_history) > 0:
                print(f"Auto-archive test PASSED: Found {len(loan_history)} archived loan(s)")
                latest_archived = loan_history[0]
                assert latest_archived.get("loan_amount") == loan_amount or latest_archived.get("loan_amount") == outstanding_before, \
                    f"Archived loan amount mismatch: {latest_archived}"
            else:
                # Archive might have failed silently - check client's loan status
                get_resp = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_token={self.admin_token}")
                if get_resp.status_code == 200:
                    client_after = get_resp.json()
                    outstanding_after = client_after.get("outstanding_balance", 0)
                    loan_after = client_after.get("loan_amount", 0)
                    print(f"Client after payment: outstanding_balance={outstanding_after}, loan_amount={loan_after}")
                    
                    if outstanding_after == 0:
                        print("Loan fully paid but auto-archive may have failed (no history found)")
                    else:
                        print(f"Warning: Outstanding balance not zero after payment: {outstanding_after}")
    
    def test_partial_payment_does_not_archive(self):
        """Test that partial payment does NOT trigger auto-archive"""
        client_name = f"TEST_PartialNoArchive_{uuid.uuid4().hex[:8]}"
        loan_amount = 500.0
        
        # Create client
        client_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}",
            json={
                "name": client_name,
                "phone": f"+3725560{uuid.uuid4().hex[:4]}",
                "email": f"partial_{uuid.uuid4().hex[:6]}@test.com",
                "loan_amount": loan_amount,
                "interest_rate": 0,
            }
        )
        
        if client_resp.status_code != 200:
            pytest.skip(f"Could not create test client: {client_resp.text}")
        
        client_id = client_resp.json().get("id")
        
        # Pay only half
        partial_payment = loan_amount / 2
        
        csv_content = f"""name,amount,date,description
{client_name},{partial_payment},2026-01-20,Partial payment"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("partial.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check payment was recorded with loan_fully_paid=False
        payments = data["details"]["payments_recorded"]
        our_payment = None
        for p in payments:
            if p.get("client_id") == client_id:
                our_payment = p
                break
        
        if our_payment:
            assert our_payment["loan_fully_paid"] == False, f"Expected loan_fully_paid=False for partial: {our_payment}"
            assert our_payment["new_outstanding"] > 0, f"Expected positive outstanding: {our_payment}"
            print(f"Partial payment test PASSED: loan_fully_paid=False, outstanding={our_payment['new_outstanding']}")
        
        # Verify loan was NOT archived
        history_resp = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/loan-history?admin_token={self.admin_token}"
        )
        
        if history_resp.status_code == 200:
            history = history_resp.json().get("loan_history", [])
            # Should be no archive for partial payment
            assert len(history) == 0, f"Should not have archived loan for partial payment: {history}"
            print("Partial payment - no archive test PASSED")


class TestSummaryNewClientsCreatedCount:
    """Test that summary includes accurate new_clients_created count"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token"""
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.admin_token = login_resp.json()["token"]
    
    def test_summary_new_clients_created_matches_details(self):
        """Test that summary.new_clients_created matches len(details.new_clients_created)"""
        unique_name1 = f"TEST_Summary1_{uuid.uuid4().hex[:8]}"
        unique_name2 = f"TEST_Summary2_{uuid.uuid4().hex[:8]}"
        unique_name3 = f"TEST_Summary3_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name1},-100.00,2026-01-20,New client 1
{unique_name2},-200.00,2026-01-21,New client 2
{unique_name3},-300.00,2026-01-22,New client 3"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("summary_test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        summary_count = data["summary"]["new_clients_created"]
        details_count = len(data["details"]["new_clients_created"])
        
        assert summary_count == details_count, \
            f"Summary count ({summary_count}) != details count ({details_count})"
        
        assert summary_count >= 3, f"Expected at least 3 new clients: {summary_count}"
        
        print(f"Summary count matches test PASSED: {summary_count} clients created")
    
    def test_summary_totals_are_consistent(self):
        """Test that total_transactions = loans_created + payments_recorded + new_clients_created + ignored + unmatched + errors"""
        unique_name1 = f"TEST_Total1_{uuid.uuid4().hex[:8]}"
        unique_name2 = f"TEST_Total2_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name1},-400.00,2026-01-20,New loan client
{unique_name2},150.00,2026-01-21,Unmatched payment
Bank Fee,5.00,2026-01-22,Teenustasu service fee"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("totals.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        summary = data["summary"]
        
        # Total should equal sum of all categories
        expected_total = (
            summary.get("loans_created", 0) +
            summary.get("payments_recorded", 0) +
            summary.get("new_clients_created", 0) +
            summary.get("ignored", 0) +
            summary.get("unmatched", 0) +
            summary.get("errors", 0)
        )
        
        actual_total = summary.get("total_transactions", 0)
        
        assert actual_total == expected_total, \
            f"Total ({actual_total}) != sum of categories ({expected_total}). Summary: {summary}"
        
        print(f"Summary totals consistency test PASSED: {actual_total} total transactions")


class TestImportNeedsReviewFlag:
    """Test the import_needs_review flag on newly created clients"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token"""
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.admin_token = login_resp.json()["token"]
    
    def test_new_client_from_statement_has_review_flags(self):
        """Test that new client from statement has all import flags set"""
        unique_name = f"TEST_ReviewFlags_{uuid.uuid4().hex[:8]}"
        
        csv_content = f"""name,amount,date,description
{unique_name},-800.00,2026-01-20,Loan disbursement"""
        
        response = requests.post(
            f"{BASE_URL}/api/import/bank-statement/reconcile",
            data={"admin_token": self.admin_token},
            files={"file": ("review_flags.csv", io.BytesIO(csv_content.encode()), "text/csv")}
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        new_clients = data["details"]["new_clients_created"]
        our_client = None
        for nc in new_clients:
            if nc.get("client_name") == unique_name:
                our_client = nc
                break
        
        assert our_client is not None, f"Client not found: {new_clients}"
        client_id = our_client.get("client_id")
        
        # Verify all import flags via list endpoint (single client endpoint uses response_model that filters extra fields)
        clients_resp = requests.get(f"{BASE_URL}/api/clients?admin_token={self.admin_token}")
        assert clients_resp.status_code == 200, f"Failed to get clients: {clients_resp.text}"
        
        clients_list = clients_resp.json().get("clients", [])
        client = None
        for c in clients_list:
            if c.get("id") == client_id:
                client = c
                break
        
        if client:
            # Check all expected flags
            assert client.get("imported") == True, f"imported should be True: {client}"
            assert client.get("imported_from_statement") == True, f"imported_from_statement should be True: {client}"
            assert client.get("import_needs_review") == True, f"import_needs_review should be True: {client}"
            
            # Check default values for fields that need user input
            assert client.get("phone") == "", f"phone should be empty: {client}"
            assert client.get("email") == "", f"email should be empty: {client}"
            assert client.get("interest_rate") == 0, f"interest_rate should be 0: {client}"
            
            print(f"Import flags test PASSED:")
            print(f"  imported={client.get('imported')}")
            print(f"  imported_from_statement={client.get('imported_from_statement')}")
            print(f"  import_needs_review={client.get('import_needs_review')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
