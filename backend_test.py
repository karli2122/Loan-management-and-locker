#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for EMI Phone Lock System
Tests all backend endpoints and complete flow
"""

import requests
import json
import sys
from datetime import datetime

# Get backend URL from frontend env
BACKEND_URL = "https://emilock-system.preview.emergentagent.com/api"

class EMIBackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.admin_token = None
        self.client_id = None
        self.registration_code = None
        self.test_results = []
        
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data
        })
        
    def test_health_check(self):
        """Test basic API health"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                self.log_test("Health Check", True, "API is running")
                return True
            else:
                self.log_test("Health Check", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False
    
    def test_admin_registration(self):
        """Test admin registration"""
        try:
            admin_data = {
                "username": f"admin_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "password": "SecurePass123!"
            }
            
            response = requests.post(f"{self.base_url}/admin/register", json=admin_data)
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                self.log_test("Admin Registration", True, f"Admin registered with token: {self.admin_token[:10]}...")
                return True
            else:
                self.log_test("Admin Registration", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Registration", False, f"Error: {str(e)}")
            return False
    
    def test_admin_login(self):
        """Test admin login with existing admin"""
        try:
            # First create an admin
            admin_data = {
                "username": f"logintest_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "password": "LoginPass123!"
            }
            
            # Register
            reg_response = requests.post(f"{self.base_url}/admin/register", json=admin_data)
            if reg_response.status_code != 200:
                self.log_test("Admin Login", False, "Failed to create test admin for login")
                return False
            
            # Login
            login_response = requests.post(f"{self.base_url}/admin/login", json=admin_data)
            
            if login_response.status_code == 200:
                data = login_response.json()
                token = data.get("token")
                self.log_test("Admin Login", True, f"Login successful with token: {token[:10]}...")
                return True
            else:
                self.log_test("Admin Login", False, f"Status: {login_response.status_code}, Response: {login_response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Login", False, f"Error: {str(e)}")
            return False
    
    def test_admin_token_verification(self):
        """Test admin token verification"""
        if not self.admin_token:
            self.log_test("Admin Token Verification", False, "No admin token available")
            return False
            
        try:
            response = requests.get(f"{self.base_url}/admin/verify/{self.admin_token}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("valid"):
                    self.log_test("Admin Token Verification", True, f"Token valid for admin: {data.get('admin_id')}")
                    return True
                else:
                    self.log_test("Admin Token Verification", False, "Token marked as invalid")
                    return False
            else:
                self.log_test("Admin Token Verification", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Admin Token Verification", False, f"Error: {str(e)}")
            return False
    
    def test_create_client(self):
        """Test client creation"""
        try:
            client_data = {
                "name": "John Smith",
                "phone": "+1234567890",
                "email": "john.smith@example.com",
                "emi_amount": 15000.0,
                "emi_due_date": "2024-02-15"
            }
            
            response = requests.post(f"{self.base_url}/clients", json=client_data)
            
            if response.status_code == 200:
                data = response.json()
                self.client_id = data.get("id")
                self.registration_code = data.get("registration_code")
                self.log_test("Create Client", True, f"Client created with ID: {self.client_id}, Registration Code: {self.registration_code}")
                return True
            else:
                self.log_test("Create Client", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Create Client", False, f"Error: {str(e)}")
            return False
    
    def test_get_all_clients(self):
        """Test getting all clients"""
        try:
            response = requests.get(f"{self.base_url}/clients")
            
            if response.status_code == 200:
                data = response.json()
                client_count = len(data)
                self.log_test("Get All Clients", True, f"Retrieved {client_count} clients")
                return True
            else:
                self.log_test("Get All Clients", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get All Clients", False, f"Error: {str(e)}")
            return False
    
    def test_get_single_client(self):
        """Test getting single client"""
        if not self.client_id:
            self.log_test("Get Single Client", False, "No client ID available")
            return False
            
        try:
            response = requests.get(f"{self.base_url}/clients/{self.client_id}")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Get Single Client", True, f"Retrieved client: {data.get('name')}")
                return True
            else:
                self.log_test("Get Single Client", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Single Client", False, f"Error: {str(e)}")
            return False
    
    def test_update_client(self):
        """Test client update"""
        if not self.client_id:
            self.log_test("Update Client", False, "No client ID available")
            return False
            
        try:
            update_data = {
                "name": "John Smith Updated",
                "emi_amount": 16000.0
            }
            
            response = requests.put(f"{self.base_url}/clients/{self.client_id}", json=update_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Update Client", True, f"Client updated: {data.get('name')}, EMI: {data.get('emi_amount')}")
                return True
            else:
                self.log_test("Update Client", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Update Client", False, f"Error: {str(e)}")
            return False
    
    def test_device_registration(self):
        """Test device registration"""
        if not self.registration_code:
            self.log_test("Device Registration", False, "No registration code available")
            return False
            
        try:
            device_data = {
                "registration_code": self.registration_code,
                "device_id": "DEVICE123456789",
                "device_model": "Samsung Galaxy S21"
            }
            
            response = requests.post(f"{self.base_url}/device/register", json=device_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Device Registration", True, f"Device registered for client: {data.get('client_id')}")
                return True
            else:
                self.log_test("Device Registration", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Device Registration", False, f"Error: {str(e)}")
            return False
    
    def test_lock_device(self):
        """Test device locking"""
        if not self.client_id:
            self.log_test("Lock Device", False, "No client ID available")
            return False
            
        try:
            lock_message = "Your device has been locked due to overdue EMI payment."
            response = requests.post(f"{self.base_url}/clients/{self.client_id}/lock?message={lock_message}")
            
            if response.status_code == 200:
                self.log_test("Lock Device", True, "Device locked successfully")
                return True
            else:
                self.log_test("Lock Device", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Lock Device", False, f"Error: {str(e)}")
            return False
    
    def test_unlock_device(self):
        """Test device unlocking"""
        if not self.client_id:
            self.log_test("Unlock Device", False, "No client ID available")
            return False
            
        try:
            response = requests.post(f"{self.base_url}/clients/{self.client_id}/unlock")
            
            if response.status_code == 200:
                self.log_test("Unlock Device", True, "Device unlocked successfully")
                return True
            else:
                self.log_test("Unlock Device", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Unlock Device", False, f"Error: {str(e)}")
            return False
    
    def test_send_warning(self):
        """Test sending warning message"""
        if not self.client_id:
            self.log_test("Send Warning", False, "No client ID available")
            return False
            
        try:
            warning_message = "Your EMI payment is due in 3 days. Please make payment to avoid device lock."
            response = requests.post(f"{self.base_url}/clients/{self.client_id}/warning?message={warning_message}")
            
            if response.status_code == 200:
                self.log_test("Send Warning", True, "Warning sent successfully")
                return True
            else:
                self.log_test("Send Warning", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Send Warning", False, f"Error: {str(e)}")
            return False
    
    def test_device_status(self):
        """Test getting device status"""
        if not self.client_id:
            self.log_test("Device Status", False, "No client ID available")
            return False
            
        try:
            response = requests.get(f"{self.base_url}/device/status/{self.client_id}")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Device Status", True, f"Status retrieved - Locked: {data.get('is_locked')}, Warning: {data.get('warning_message')}")
                return True
            else:
                self.log_test("Device Status", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Device Status", False, f"Error: {str(e)}")
            return False
    
    def test_location_update(self):
        """Test location update"""
        if not self.client_id:
            self.log_test("Location Update", False, "No client ID available")
            return False
            
        try:
            location_data = {
                "client_id": self.client_id,
                "latitude": 37.7749,
                "longitude": -122.4194
            }
            
            response = requests.post(f"{self.base_url}/device/location", json=location_data)
            
            if response.status_code == 200:
                self.log_test("Location Update", True, "Location updated successfully")
                return True
            else:
                self.log_test("Location Update", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Location Update", False, f"Error: {str(e)}")
            return False
    
    def test_clear_warning(self):
        """Test clearing warning message"""
        if not self.client_id:
            self.log_test("Clear Warning", False, "No client ID available")
            return False
            
        try:
            response = requests.post(f"{self.base_url}/device/clear-warning/{self.client_id}")
            
            if response.status_code == 200:
                self.log_test("Clear Warning", True, "Warning cleared successfully")
                return True
            else:
                self.log_test("Clear Warning", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Clear Warning", False, f"Error: {str(e)}")
            return False
    
    def test_stats(self):
        """Test stats endpoint"""
        try:
            response = requests.get(f"{self.base_url}/stats")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Stats", True, f"Stats retrieved - Total: {data.get('total_clients')}, Locked: {data.get('locked_devices')}, Registered: {data.get('registered_devices')}")
                return True
            else:
                self.log_test("Stats", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Stats", False, f"Error: {str(e)}")
            return False
    
    def test_admin_management_login(self):
        """Test login with existing admin for management tests"""
        try:
            # Login with existing admin credentials
            login_data = {
                "username": "karli1987",
                "password": "nasvakas123"
            }
            
            response = requests.post(f"{self.base_url}/admin/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                self.log_test("Admin Management Login", True, f"Successfully logged in as {data.get('username')}")
                return True
            else:
                self.log_test("Admin Management Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Management Login", False, f"Error: {str(e)}")
            return False
    
    def test_list_admins_api(self):
        """Test GET /api/admin/list endpoint"""
        if not self.admin_token:
            self.log_test("List Admins API", False, "No admin token available")
            return False
            
        try:
            # Test with valid token
            params = {"admin_token": self.admin_token}
            response = requests.get(f"{self.base_url}/admin/list", params=params)
            
            if response.status_code == 200:
                admins = response.json()
                self.log_test("List Admins API - Valid Token", True, f"Retrieved {len(admins)} admin(s)")
                
                # Verify response structure
                if admins and isinstance(admins, list):
                    first_admin = admins[0]
                    required_fields = ["id", "username", "created_at"]
                    if all(field in first_admin for field in required_fields):
                        self.log_test("List Admins API - Response Structure", True, "Response contains required fields")
                    else:
                        self.log_test("List Admins API - Response Structure", False, f"Missing required fields. Got: {list(first_admin.keys())}")
                
                # Test with invalid token
                params = {"admin_token": "invalid_token"}
                response = requests.get(f"{self.base_url}/admin/list", params=params)
                
                if response.status_code == 401:
                    self.log_test("List Admins API - Invalid Token", True, "Correctly rejected invalid token")
                else:
                    self.log_test("List Admins API - Invalid Token", False, f"Should have rejected invalid token, got status {response.status_code}")
                
                return True
            else:
                self.log_test("List Admins API - Valid Token", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("List Admins API", False, f"Error: {str(e)}")
            return False
    
    def test_create_admin_management(self):
        """Test POST /api/admin/register endpoint with comprehensive scenarios"""
        if not self.admin_token:
            self.log_test("Create Admin Management", False, "No admin token available")
            return False
        
        created_admin_id = None
        
        try:
            # Test 1: Create admin with valid data
            admin_data = {
                "username": f"testadmin_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "password": "securepass123"
            }
            
            params = {"admin_token": self.admin_token}
            response = requests.post(f"{self.base_url}/admin/register", json=admin_data, params=params)
            
            if response.status_code == 200:
                data = response.json()
                created_admin_id = data.get("id")
                self.log_test("Create Admin - Valid Data", True, f"Successfully created admin {data.get('username')}")
            else:
                self.log_test("Create Admin - Valid Data", False, f"Status: {response.status_code}, Response: {response.text}")
            
            # Test 2: Create admin with short password (should fail)
            admin_data_short = {
                "username": f"testadmin2_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "password": "123"  # Less than 6 characters
            }
            
            response = requests.post(f"{self.base_url}/admin/register", json=admin_data_short, params=params)
            
            # Note: The backend doesn't validate password length in the current implementation
            # This test documents the current behavior
            if response.status_code == 200:
                self.log_test("Create Admin - Short Password", False, "Should have rejected short password but didn't (validation missing)")
            else:
                self.log_test("Create Admin - Short Password", True, "Correctly rejected short password")
            
            # Test 3: Create admin with duplicate username (should fail)
            duplicate_data = {
                "username": "karli1987",  # Existing username
                "password": "validpass123"
            }
            
            response = requests.post(f"{self.base_url}/admin/register", json=duplicate_data, params=params)
            
            if response.status_code == 400:
                self.log_test("Create Admin - Duplicate Username", True, "Correctly rejected duplicate username")
            else:
                self.log_test("Create Admin - Duplicate Username", False, f"Should have rejected duplicate username, got status {response.status_code}")
            
            # Test 4: Create admin without token (should fail)
            response = requests.post(f"{self.base_url}/admin/register", json=admin_data)
            
            if response.status_code == 401:
                self.log_test("Create Admin - No Token", True, "Correctly rejected request without token")
            else:
                self.log_test("Create Admin - No Token", False, f"Should have rejected request without token, got status {response.status_code}")
            
            return created_admin_id
            
        except Exception as e:
            self.log_test("Create Admin Management", False, f"Error: {str(e)}")
            return None
    
    def test_change_password_api(self):
        """Test POST /api/admin/change-password endpoint"""
        if not self.admin_token:
            self.log_test("Change Password API", False, "No admin token available")
            return False
            
        try:
            # Test 1: Change password with correct current password
            password_data = {
                "current_password": "nasvakas123",
                "new_password": "newpassword123"
            }
            
            params = {"admin_token": self.admin_token}
            response = requests.post(f"{self.base_url}/admin/change-password", json=password_data, params=params)
            
            if response.status_code == 200:
                self.log_test("Change Password - Valid", True, "Successfully changed password")
                
                # Change it back for other tests
                password_data_back = {
                    "current_password": "newpassword123",
                    "new_password": "nasvakas123"
                }
                requests.post(f"{self.base_url}/admin/change-password", json=password_data_back, params=params)
            else:
                self.log_test("Change Password - Valid", False, f"Status: {response.status_code}, Response: {response.text}")
            
            # Test 2: Change password with wrong current password
            wrong_password_data = {
                "current_password": "wrongpassword",
                "new_password": "newpassword123"
            }
            
            response = requests.post(f"{self.base_url}/admin/change-password", json=wrong_password_data, params=params)
            
            if response.status_code == 401:
                self.log_test("Change Password - Wrong Current", True, "Correctly rejected wrong current password")
            else:
                self.log_test("Change Password - Wrong Current", False, f"Should have rejected wrong password, got status {response.status_code}")
            
            # Test 3: Change password with short new password
            short_password_data = {
                "current_password": "nasvakas123",
                "new_password": "123"  # Less than 6 characters
            }
            
            response = requests.post(f"{self.base_url}/admin/change-password", json=short_password_data, params=params)
            
            # Note: The backend doesn't validate new password length in the current implementation
            if response.status_code == 200:
                self.log_test("Change Password - Short New Password", False, "Should have rejected short new password but didn't (validation missing)")
                # Change back to original
                password_data_back = {
                    "current_password": "123",
                    "new_password": "nasvakas123"
                }
                requests.post(f"{self.base_url}/admin/change-password", json=password_data_back, params=params)
            else:
                self.log_test("Change Password - Short New Password", True, "Correctly rejected short new password")
            
            # Test 4: Change password without token
            response = requests.post(f"{self.base_url}/admin/change-password", json=password_data)
            
            if response.status_code == 422:  # FastAPI validation error for missing query param
                self.log_test("Change Password - No Token", True, "Correctly rejected request without token")
            else:
                self.log_test("Change Password - No Token", False, f"Should have rejected request without token, got status {response.status_code}")
            
            return True
            
        except Exception as e:
            self.log_test("Change Password API", False, f"Error: {str(e)}")
            return False
    
    def test_delete_admin_api(self, test_admin_id=None):
        """Test DELETE /api/admin/{admin_id} endpoint"""
        if not self.admin_token:
            self.log_test("Delete Admin API", False, "No admin token available")
            return False
            
        try:
            # First get current admin ID to test self-deletion prevention
            params = {"admin_token": self.admin_token}
            response = requests.get(f"{self.base_url}/admin/list", params=params)
            
            current_admin_id = None
            if response.status_code == 200:
                admins = response.json()
                # Find the current admin (karli1987)
                for admin in admins:
                    if admin.get("username") == "karli1987":
                        current_admin_id = admin.get("id")
                        break
            
            # Test 1: Try to delete own account (should fail)
            if current_admin_id:
                response = requests.delete(f"{self.base_url}/admin/{current_admin_id}", params=params)
                
                if response.status_code == 400:
                    self.log_test("Delete Admin - Self Deletion", True, "Correctly prevented self-deletion")
                else:
                    self.log_test("Delete Admin - Self Deletion", False, f"Should have prevented self-deletion, got status {response.status_code}")
            
            # Test 2: Delete a test admin (if we created one)
            if test_admin_id:
                response = requests.delete(f"{self.base_url}/admin/{test_admin_id}", params=params)
                
                if response.status_code == 200:
                    self.log_test("Delete Admin - Test Admin", True, "Successfully deleted test admin")
                else:
                    self.log_test("Delete Admin - Test Admin", False, f"Status: {response.status_code}, Response: {response.text}")
            
            # Test 3: Delete non-existent admin
            fake_admin_id = "non-existent-admin-id"
            response = requests.delete(f"{self.base_url}/admin/{fake_admin_id}", params=params)
            
            if response.status_code == 404:
                self.log_test("Delete Admin - Non-existent", True, "Correctly handled non-existent admin")
            else:
                self.log_test("Delete Admin - Non-existent", False, f"Should have returned 404 for non-existent admin, got status {response.status_code}")
            
            # Test 4: Delete admin without token
            response = requests.delete(f"{self.base_url}/admin/{fake_admin_id}")
            
            if response.status_code == 422:  # FastAPI validation error for missing query param
                self.log_test("Delete Admin - No Token", True, "Correctly rejected request without token")
            else:
                self.log_test("Delete Admin - No Token", False, f"Should have rejected request without token, got status {response.status_code}")
            
            return True
            
        except Exception as e:
            self.log_test("Delete Admin API", False, f"Error: {str(e)}")
            return False
    
    def test_delete_client(self):
        """Test client deletion (run last to clean up)"""
        if not self.client_id:
            self.log_test("Delete Client", False, "No client ID available")
            return False
            
        try:
            response = requests.delete(f"{self.base_url}/clients/{self.client_id}")
            
            if response.status_code == 200:
                self.log_test("Delete Client", True, "Client deleted successfully")
                return True
            else:
                self.log_test("Delete Client", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Delete Client", False, f"Error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print(f"🚀 Starting EMI Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test sequence following the complete flow
        tests = [
            self.test_health_check,
            self.test_admin_registration,
            self.test_admin_login,
            self.test_admin_token_verification,
            self.test_create_client,
            self.test_get_all_clients,
            self.test_get_single_client,
            self.test_update_client,
            self.test_device_registration,
            self.test_lock_device,
            self.test_unlock_device,
            self.test_send_warning,
            self.test_device_status,
            self.test_location_update,
            self.test_clear_warning,
            self.test_stats,
            self.test_delete_client
        ]
        
        passed = 0
        failed = 0
        
        for test in tests:
            if test():
                passed += 1
            else:
                failed += 1
            print()  # Add spacing between tests
        
        print("=" * 60)
        print(f"📊 Test Summary: {passed} passed, {failed} failed")
        
        if failed > 0:
            print("\n❌ Failed Tests:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed == 0

if __name__ == "__main__":
    tester = EMIBackendTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)