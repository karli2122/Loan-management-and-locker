#!/usr/bin/env python3
"""
Focused Loan Setup API Testing for EMI Phone Lock System
Testing specific endpoint: POST /api/loans/{client_id}/setup
"""

import requests
import json
import sys
from datetime import datetime

# Configuration - Using the production URL from frontend .env
BASE_URL = "https://apk-verification.preview.emergentagent.com/api"
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"

class LoanSetupTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.admin_token = None
        self.test_client_id = None
        self.test_results = []
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.log(f"{status} {test_name}: {message}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data
        })
    
    def test_health_check(self):
        """Test health endpoint"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            
            if response.status_code == 200:
                self.log_test("Health Check", True, "API is responding")
                return True
            else:
                self.log_test("Health Check", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Health Check", False, f"Error: {str(e)}")
            return False
    
    def test_admin_login(self):
        """Test admin login to get token"""
        try:
            login_data = {
                "username": ADMIN_USERNAME,
                "password": ADMIN_PASSWORD
            }
            
            response = requests.post(f"{self.base_url}/admin/login", json=login_data, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data:
                    self.admin_token = data["token"]
                    self.log_test("Admin Login", True, "Token obtained successfully")
                    return True
                else:
                    self.log_test("Admin Login", False, "No token in response")
                    return False
            else:
                error_msg = f"Status: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f", Detail: {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f", Text: {response.text[:100]}"
                
                self.log_test("Admin Login", False, error_msg)
                return False
                
        except Exception as e:
            self.log_test("Admin Login", False, f"Error: {str(e)}")
            return False
    
    def test_get_clients(self):
        """Get list of clients to obtain a client ID for testing"""
        try:
            if not self.admin_token:
                self.log_test("Get Clients", False, "No admin token available")
                return False
            
            response = requests.get(
                f"{self.base_url}/clients", 
                params={"limit": 5, "admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                clients = data.get("clients", [])
                
                if clients:
                    self.test_client_id = clients[0]["id"]
                    client_name = clients[0].get("name", "Unknown")
                    self.log_test("Get Clients", True, f"Found client: {client_name} (ID: {self.test_client_id[:8]}...)")
                    return True
                else:
                    # No clients found, create one
                    return self.create_test_client()
            else:
                error_msg = f"Status: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f", Detail: {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f", Text: {response.text[:100]}"
                
                self.log_test("Get Clients", False, error_msg)
                return False
                
        except Exception as e:
            self.log_test("Get Clients", False, f"Error: {str(e)}")
            return False
    
    def create_test_client(self):
        """Create a test client for loan setup testing"""
        try:
            client_data = {
                "name": "Maria Rodriguez",
                "phone": "+34612345678", 
                "email": "maria.rodriguez@email.com"
            }
            
            response = requests.post(
                f"{self.base_url}/clients",
                json=client_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.test_client_id = data["client"]["id"]
                self.log_test("Create Test Client", True, f"Created client ID: {self.test_client_id[:8]}...")
                return True
            else:
                error_msg = f"Status: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f", Detail: {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f", Text: {response.text[:100]}"
                
                self.log_test("Create Test Client", False, error_msg)
                return False
                
        except Exception as e:
            self.log_test("Create Test Client", False, f"Error: {str(e)}")
            return False
    
    def test_loan_setup_full_params(self):
        """Test loan setup with all parameters"""
        try:
            if not self.test_client_id:
                self.log_test("Loan Setup (Full Params)", False, "No test client ID available")
                return False
            
            loan_data = {
                "loan_amount": 500,
                "interest_rate": 12,
                "loan_tenure_months": 6
            }
            
            response = requests.post(
                f"{self.base_url}/loans/{self.test_client_id}/setup",
                json=loan_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                if "loan_details" not in data:
                    self.log_test("Loan Setup (Full Params)", False, "Missing loan_details in response")
                    return False
                
                loan_details = data["loan_details"]
                required_fields = ["monthly_emi", "total_amount", "total_interest"]
                missing_fields = [field for field in required_fields if field not in loan_details]
                
                if missing_fields:
                    self.log_test("Loan Setup (Full Params)", False, f"Missing fields: {missing_fields}")
                    return False
                
                # Verify reasonable EMI calculation
                monthly_emi = loan_details["monthly_emi"]
                total_amount = loan_details["total_amount"]
                total_interest = loan_details["total_interest"]
                
                # For €500 at 12% for 6 months, EMI should be around €90-95
                if monthly_emi < 80 or monthly_emi > 100:
                    self.log_test("Loan Setup (Full Params)", False, f"EMI calculation seems incorrect: €{monthly_emi}")
                    return False
                
                success_msg = f"EMI: €{monthly_emi}, Total: €{total_amount}, Interest: €{total_interest}"
                self.log_test("Loan Setup (Full Params)", True, success_msg)
                return True
            else:
                error_msg = f"Status: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f", Detail: {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f", Text: {response.text[:100]}"
                
                self.log_test("Loan Setup (Full Params)", False, error_msg)
                return False
                
        except Exception as e:
            self.log_test("Loan Setup (Full Params)", False, f"Error: {str(e)}")
            return False
    
    def test_loan_setup_minimal(self):
        """Test loan setup with minimal parameters (only loan_amount)"""
        try:
            if not self.test_client_id:
                self.log_test("Loan Setup (Minimal)", False, "No test client ID available")
                return False
            
            loan_data = {
                "loan_amount": 2000
            }
            
            response = requests.post(
                f"{self.base_url}/loans/{self.test_client_id}/setup",
                json=loan_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                loan_details = data.get("loan_details", {})
                
                # Verify defaults are applied (interest_rate=10.0, tenure=12)
                monthly_emi = loan_details.get("monthly_emi", 0)
                
                # For €2000 at 10% for 12 months, EMI should be around €183
                if monthly_emi < 170 or monthly_emi > 200:
                    self.log_test("Loan Setup (Minimal)", False, f"EMI with defaults seems incorrect: €{monthly_emi}")
                    return False
                
                success_msg = f"EMI with defaults: €{monthly_emi}"
                self.log_test("Loan Setup (Minimal)", True, success_msg)
                return True
            else:
                error_msg = f"Status: {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f", Detail: {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f", Text: {response.text[:100]}"
                
                self.log_test("Loan Setup (Minimal)", False, error_msg)
                return False
                
        except Exception as e:
            self.log_test("Loan Setup (Minimal)", False, f"Error: {str(e)}")
            return False
    
    def test_loan_setup_invalid_client(self):
        """Test loan setup with invalid client ID"""
        try:
            loan_data = {
                "loan_amount": 500
            }
            
            response = requests.post(
                f"{self.base_url}/loans/nonexistent-id/setup",
                json=loan_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 404:
                self.log_test("Loan Setup (Invalid Client)", True, "404 error correctly returned")
                return True
            else:
                self.log_test("Loan Setup (Invalid Client)", False, f"Expected 404, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Loan Setup (Invalid Client)", False, f"Error: {str(e)}")
            return False
    
    def test_loan_setup_missing_amount(self):
        """Test loan setup with missing loan_amount"""
        try:
            if not self.test_client_id:
                self.log_test("Loan Setup (Missing Amount)", False, "No test client ID available")
                return False
            
            loan_data = {
                "interest_rate": 10
            }
            
            response = requests.post(
                f"{self.base_url}/loans/{self.test_client_id}/setup",
                json=loan_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 422:
                self.log_test("Loan Setup (Missing Amount)", True, "422 validation error correctly returned")
                return True
            else:
                self.log_test("Loan Setup (Missing Amount)", False, f"Expected 422, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Loan Setup (Missing Amount)", False, f"Error: {str(e)}")
            return False
    
    def test_existing_endpoints(self):
        """Test that existing endpoints still work"""
        success_count = 0
        total_count = 0
        
        # Test loan plans endpoint
        try:
            total_count += 1
            response = requests.get(
                f"{self.base_url}/loan-plans",
                params={"active_only": "true", "admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_test("Loan Plans Endpoint", True, "Endpoint working")
                success_count += 1
            else:
                self.log_test("Loan Plans Endpoint", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Loan Plans Endpoint", False, f"Error: {str(e)}")
        
        # Test client creation endpoint
        try:
            total_count += 1
            client_data = {
                "name": "Test Client",
                "phone": "123456789",
                "email": "test@test.com"
            }
            
            response = requests.post(
                f"{self.base_url}/clients",
                json=client_data,
                params={"admin_token": self.admin_token},
                timeout=10
            )
            
            if response.status_code == 200:
                self.log_test("Client Creation Endpoint", True, "Endpoint working")
                success_count += 1
            else:
                self.log_test("Client Creation Endpoint", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Client Creation Endpoint", False, f"Error: {str(e)}")
        
        return success_count == total_count
    
    def run_loan_setup_tests(self):
        """Run all loan setup API tests"""
        self.log("🚀 Starting Loan Setup API Testing...")
        
        # Run tests in order
        tests = [
            ("Health Check", self.test_health_check),
            ("Admin Login", self.test_admin_login),
            ("Get/Create Client", self.test_get_clients),
            ("Loan Setup (Full Params)", self.test_loan_setup_full_params),
            ("Loan Setup (Minimal)", self.test_loan_setup_minimal),
            ("Loan Setup (Invalid Client)", self.test_loan_setup_invalid_client),
            ("Loan Setup (Missing Amount)", self.test_loan_setup_missing_amount),
            ("Existing Endpoints", self.test_existing_endpoints)
        ]
        
        results = {}
        for test_name, test_func in tests:
            try:
                results[test_name] = test_func()
            except Exception as e:
                self.log_test(test_name, False, f"Test execution error: {str(e)}")
                results[test_name] = False
        
        # Summary
        passed = sum(1 for result in results.values() if result)
        total = len(results)
        
        self.log(f"\n📊 LOAN SETUP API TEST SUMMARY:")
        self.log(f"   Passed: {passed}/{total}")
        
        if passed == total:
            self.log("🎉 ALL LOAN SETUP TESTS PASSED!")
        else:
            self.log("⚠️  SOME TESTS FAILED:")
            for test_name, result in results.items():
                if not result:
                    self.log(f"   ❌ {test_name}")
        
        return results

if __name__ == "__main__":
    tester = LoanSetupTester()
    results = tester.run_loan_setup_tests()
    
    # Exit with error code if any tests failed
    if not all(results.values()):
        sys.exit(1)