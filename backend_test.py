#!/usr/bin/env python3
"""
Backend API Authentication Testing Script
Tests all newly secured endpoints that require admin_token authentication
"""

import requests
import json
import sys
from typing import Optional, Dict, Any

# Configuration
BASE_URL = "https://admin-credits-1.preview.emergentagent.com/api"
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"

class APITester:
    def __init__(self):
        self.admin_token: Optional[str] = None
        self.test_client_id: Optional[str] = None
        self.session = requests.Session()
        self.session.timeout = 30
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": []
        }
    
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        prefix = f"[{level}]"
        print(f"{prefix} {message}")
    
    def test_result(self, test_name: str, expected: bool, actual: bool, details: str = ""):
        """Record test result"""
        if expected == actual:
            self.results["passed"] += 1
            self.log(f"✅ {test_name}: PASS {details}")
        else:
            self.results["failed"] += 1
            error_msg = f"❌ {test_name}: FAIL - Expected {expected}, got {actual} {details}"
            self.log(error_msg, "ERROR")
            self.results["errors"].append(error_msg)
    
    def make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with error handling"""
        url = f"{BASE_URL}{endpoint}"
        try:
            response = self.session.request(method, url, **kwargs)
            self.log(f"{method} {endpoint} -> {response.status_code}")
            return response
        except Exception as e:
            self.log(f"Request failed: {method} {endpoint} - {str(e)}", "ERROR")
            raise
    
    def test_admin_login(self) -> bool:
        """Test admin login and get token"""
        self.log("=== Testing Admin Login ===")
        
        login_data = {
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        }
        
        response = self.make_request("POST", "/admin/login", json=login_data)
        
        if response.status_code == 200:
            data = response.json()
            self.admin_token = data.get("token")
            self.test_result("Admin Login", True, True, f"Token: {self.admin_token[:20]}...")
            return True
        else:
            self.test_result("Admin Login", True, False, f"Status: {response.status_code}")
            return False
    
    def get_test_client(self) -> bool:
        """Get a client for testing"""
        self.log("=== Getting Test Client ===")
        
        if not self.admin_token:
            self.log("No admin token available", "ERROR")
            return False
        
        response = self.make_request("GET", f"/clients?admin_token={self.admin_token}")
        
        if response.status_code == 200:
            data = response.json()
            clients = data.get("clients", [])
            if clients:
                self.test_client_id = clients[0]["id"]
                self.log(f"Using client: {clients[0]['name']} (ID: {self.test_client_id})")
                return True
            else:
                # Create a test client if none exist
                return self.create_test_client()
        else:
            self.log(f"Failed to get clients: {response.status_code}", "ERROR")
            return False
    
    def create_test_client(self) -> bool:
        """Create a test client"""
        self.log("Creating test client...")
        
        client_data = {
            "name": "Auth Test Client",
            "phone": "+1234567890",
            "email": "test@example.com",
            "emi_amount": 100.0,
            "loan_amount": 1000.0
        }
        
        response = self.make_request("POST", f"/clients?admin_token={self.admin_token}", json=client_data)
        
        if response.status_code == 200:
            data = response.json()
            self.test_client_id = data.get("id")
            self.log(f"Created test client: {self.test_client_id}")
            return True
        else:
            self.log(f"Failed to create client: {response.status_code}", "ERROR")
            return False

    def test_lock_device_with_token(self):
        """Test lock device WITH admin token"""
        self.log("=== Testing Lock Device WITH Token ===")
        
        response = self.make_request(
            "POST", 
            f"/clients/{self.test_client_id}/lock?admin_token={self.admin_token}&message=Test lock message"
        )
        
        expected_success = response.status_code == 200
        self.test_result("Lock Device WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_lock_device_without_token(self):
        """Test lock device WITHOUT admin token"""
        self.log("=== Testing Lock Device WITHOUT Token ===")
        
        response = self.make_request("POST", f"/clients/{self.test_client_id}/lock")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Lock Device WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_unlock_device_with_token(self):
        """Test unlock device WITH admin token"""
        self.log("=== Testing Unlock Device WITH Token ===")
        
        response = self.make_request(
            "POST", 
            f"/clients/{self.test_client_id}/unlock?admin_token={self.admin_token}"
        )
        
        expected_success = response.status_code == 200
        self.test_result("Unlock Device WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_unlock_device_without_token(self):
        """Test unlock device WITHOUT admin token"""
        self.log("=== Testing Unlock Device WITHOUT Token ===")
        
        response = self.make_request("POST", f"/clients/{self.test_client_id}/unlock")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Unlock Device WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_warning_with_token(self):
        """Test warning WITH admin token"""
        self.log("=== Testing Warning WITH Token ===")
        
        response = self.make_request(
            "POST", 
            f"/clients/{self.test_client_id}/warning?message=Test warning&admin_token={self.admin_token}"
        )
        
        expected_success = response.status_code == 200
        self.test_result("Warning WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_warning_without_token(self):
        """Test warning WITHOUT admin token"""
        self.log("=== Testing Warning WITHOUT Token ===")
        
        response = self.make_request(
            "POST", 
            f"/clients/{self.test_client_id}/warning?message=Test warning"
        )
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Warning WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_update_client_with_token(self):
        """Test update client WITH admin token"""
        self.log("=== Testing Update Client WITH Token ===")
        
        update_data = {"name": "Updated Test Client"}
        
        response = self.make_request(
            "PUT", 
            f"/clients/{self.test_client_id}?admin_token={self.admin_token}",
            json=update_data
        )
        
        expected_success = response.status_code == 200
        self.test_result("Update Client WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_update_client_without_token(self):
        """Test update client WITHOUT admin token"""
        self.log("=== Testing Update Client WITHOUT Token ===")
        
        update_data = {"name": "Should Not Update"}
        
        response = self.make_request(
            "PUT", 
            f"/clients/{self.test_client_id}",
            json=update_data
        )
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Update Client WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_allow_uninstall_with_token(self):
        """Test allow uninstall WITH admin token"""
        self.log("=== Testing Allow Uninstall WITH Token ===")
        
        response = self.make_request(
            "POST", 
            f"/clients/{self.test_client_id}/allow-uninstall?admin_token={self.admin_token}"
        )
        
        expected_success = response.status_code == 200
        self.test_result("Allow Uninstall WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_allow_uninstall_without_token(self):
        """Test allow uninstall WITHOUT admin token"""
        self.log("=== Testing Allow Uninstall WITHOUT Token ===")
        
        response = self.make_request("POST", f"/clients/{self.test_client_id}/allow-uninstall")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Allow Uninstall WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_reports_clients_with_token(self):
        """Test reports/clients WITH admin token"""
        self.log("=== Testing Reports/Clients WITH Token ===")
        
        response = self.make_request("GET", f"/reports/clients?admin_token={self.admin_token}")
        
        expected_success = response.status_code == 200
        self.test_result("Reports/Clients WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_reports_clients_without_token(self):
        """Test reports/clients WITHOUT admin token"""
        self.log("=== Testing Reports/Clients WITHOUT Token ===")
        
        response = self.make_request("GET", "/reports/clients")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Reports/Clients WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_reports_financial_with_token(self):
        """Test reports/financial WITH admin token"""
        self.log("=== Testing Reports/Financial WITH Token ===")
        
        response = self.make_request("GET", f"/reports/financial?admin_token={self.admin_token}")
        
        expected_success = response.status_code == 200
        self.test_result("Reports/Financial WITH Token", True, expected_success, f"Status: {response.status_code}")

    def test_reports_financial_without_token(self):
        """Test reports/financial WITHOUT admin token"""
        self.log("=== Testing Reports/Financial WITHOUT Token ===")
        
        response = self.make_request("GET", "/reports/financial")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Reports/Financial WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def test_delete_client_without_token(self):
        """Test delete client WITHOUT admin token"""
        self.log("=== Testing Delete Client WITHOUT Token ===")
        
        response = self.make_request("DELETE", f"/clients/{self.test_client_id}")
        
        expected_auth_error = response.status_code in [401, 422]
        self.test_result("Delete Client WITHOUT Token", True, expected_auth_error, f"Status: {response.status_code}")

    def run_all_tests(self):
        """Run all authentication tests"""
        self.log("🚀 Starting Backend Authentication Tests")
        self.log(f"Target URL: {BASE_URL}")
        
        # Step 1: Admin login
        if not self.test_admin_login():
            self.log("Cannot proceed without admin token", "ERROR")
            return False
        
        # Step 2: Get test client
        if not self.get_test_client():
            self.log("Cannot proceed without test client", "ERROR")
            return False
        
        # Step 3: Run all endpoint tests
        self.test_lock_device_with_token()
        self.test_lock_device_without_token()
        
        self.test_unlock_device_with_token()
        self.test_unlock_device_without_token()
        
        self.test_warning_with_token()
        self.test_warning_without_token()
        
        self.test_update_client_with_token()
        self.test_update_client_without_token()
        
        self.test_allow_uninstall_with_token()
        self.test_allow_uninstall_without_token()
        
        self.test_reports_clients_with_token()
        self.test_reports_clients_without_token()
        
        self.test_reports_financial_with_token()
        self.test_reports_financial_without_token()
        
        self.test_delete_client_without_token()
        
        # Summary
        self.print_summary()
        return self.results["failed"] == 0

    def print_summary(self):
        """Print test summary"""
        total = self.results["passed"] + self.results["failed"]
        self.log("=" * 60)
        self.log("🏁 TEST SUMMARY")
        self.log(f"Total Tests: {total}")
        self.log(f"✅ Passed: {self.results['passed']}")
        self.log(f"❌ Failed: {self.results['failed']}")
        
        if self.results["failed"] > 0:
            self.log("\n🔍 FAILED TESTS:")
            for error in self.results["errors"]:
                self.log(f"  {error}")
        
        success_rate = (self.results['passed'] / total * 100) if total > 0 else 0
        self.log(f"\n📊 Success Rate: {success_rate:.1f}%")

def main():
    """Main function"""
    tester = APITester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All authentication tests passed!")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed - check authentication implementation")
        sys.exit(1)

if __name__ == "__main__":
    main()