"""
Test heartbeat monitoring and silent clients detection endpoints.

Features tested:
1. GET /api/clients/silent - returns clients with stale heartbeats
2. GET /api/device/status/{client_id} - updates last_heartbeat timestamp  
3. POST /api/clients/{client_id}/report-tamper - tamper reporting endpoint
4. Full chain: create client -> check silent -> call status -> check silent again
"""
import pytest
import requests
import time
import uuid
from datetime import datetime

BASE_URL = "https://admin-credits-1.preview.emergentagent.com"

# Test credentials
TEST_USERNAME = "karli1987"
TEST_PASSWORD = "nasvakas123"


class TestHeartbeatAndSilentClients:
    """Test heartbeat monitoring and silent client detection"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def admin_id(self, admin_token):
        """Get admin ID from token verification"""
        response = requests.get(f"{BASE_URL}/api/admin/verify/{admin_token}")
        assert response.status_code == 200, f"Token verification failed: {response.text}"
        data = response.json()
        return data["admin_id"]
    
    @pytest.fixture
    def test_client(self, admin_token, admin_id):
        """Create a test client and clean up after test"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_HeartbeatClient_{unique_id}",
            "phone": f"+1555{unique_id[:7]}",
            "email": f"test_heartbeat_{unique_id}@example.com",
            "admin_id": admin_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json=client_data
        )
        assert response.status_code == 200, f"Failed to create test client: {response.text}"
        client = response.json()
        
        yield client
        
        # Cleanup: allow uninstall then delete
        requests.post(f"{BASE_URL}/api/clients/{client['id']}/allow-uninstall?admin_id={admin_id}")
        requests.delete(f"{BASE_URL}/api/clients/{client['id']}?admin_id={admin_id}")
    
    def test_01_login_success(self):
        """Test admin login returns valid token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "id" in data, "No admin id in response"
        print(f"✓ Login successful, got token and admin_id: {data['id']}")
    
    def test_02_silent_clients_endpoint_exists(self, admin_token):
        """Test that /api/clients/silent endpoint exists and requires admin_token"""
        # Test without token - should fail
        response = requests.get(f"{BASE_URL}/api/clients/silent")
        assert response.status_code in [401, 422], f"Expected 401/422 without token, got {response.status_code}"
        print(f"✓ Silent clients endpoint requires admin_token (got {response.status_code} without token)")
        
        # Test with token - should succeed
        response = requests.get(
            f"{BASE_URL}/api/clients/silent",
            params={"admin_token": admin_token, "minutes": 5}
        )
        assert response.status_code == 200, f"Silent clients endpoint failed: {response.text}"
        data = response.json()
        assert "silent_clients" in data, "Response should contain 'silent_clients' key"
        assert "count" in data, "Response should contain 'count' key"
        assert "cutoff_minutes" in data, "Response should contain 'cutoff_minutes' key"
        print(f"✓ Silent clients endpoint works: found {data['count']} silent clients with {data['cutoff_minutes']} minutes cutoff")
    
    def test_03_device_status_updates_heartbeat(self, admin_token, admin_id, test_client):
        """Test that GET /api/device/status/{client_id} updates last_heartbeat in database
        
        Note: The Client Pydantic model does not expose last_heartbeat field in GET response.
        We verify heartbeat is being stored by checking silent clients behavior instead.
        """
        client_id = test_client["id"]
        
        # First, get client and check initial state
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
        assert response.status_code == 200, f"Failed to get client: {response.text}"
        client_before = response.json()
        print(f"✓ Client before status check - is_registered: {client_before.get('is_registered')}")
        
        # Register the device first so it can appear in silent list
        reg_code = client_before.get("registration_code")
        reg_response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": reg_code,
                "device_id": f"test_hb_device_{client_id[:8]}",
                "device_model": "HB Test Model"
            }
        )
        if reg_response.status_code == 200:
            print(f"✓ Device registered")
        
        # Now call device status endpoint (this should update heartbeat)
        response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert response.status_code == 200, f"Device status failed: {response.text}"
        status_data = response.json()
        assert "id" in status_data, "Status response should contain client id"
        assert "is_locked" in status_data, "Status response should contain is_locked"
        print(f"✓ Device status call succeeded for client {client_id}")
        
        # Verify heartbeat was updated by checking silent clients list
        # The client should NOT be in silent list now (has recent heartbeat)
        response = requests.get(
            f"{BASE_URL}/api/clients/silent",
            params={"admin_token": admin_token, "minutes": 1}
        )
        assert response.status_code == 200, f"Silent clients failed: {response.text}"
        data = response.json()
        silent_ids = [c["id"] for c in data["silent_clients"]]
        
        # Client should NOT be in silent list (heartbeat was just updated)
        assert client_id not in silent_ids, \
            f"Client {client_id} should NOT be in silent list after status check (has recent heartbeat)"
        print(f"✓ Heartbeat verified: client NOT in silent list (recent heartbeat)")
    
    def test_04_new_client_without_heartbeat_shows_in_silent(self, admin_token, admin_id):
        """Test that a new registered client with no heartbeat appears in silent list"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create a client
        client_data = {
            "name": f"TEST_SilentClient_{unique_id}",
            "phone": f"+1666{unique_id[:7]}",
            "email": f"test_silent_{unique_id}@example.com",
            "admin_id": admin_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json=client_data
        )
        assert response.status_code == 200, f"Failed to create client: {response.text}"
        client = response.json()
        client_id = client["id"]
        
        try:
            # The client needs to be registered to show up in silent list
            # Register the device first
            reg_response = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": client["registration_code"],
                    "device_id": f"test_device_{unique_id}",
                    "device_model": "Test Model"
                }
            )
            assert reg_response.status_code == 200, f"Device registration failed: {reg_response.text}"
            print(f"✓ Device registered for client {client_id}")
            
            # Check silent clients - newly registered client without heartbeat should appear
            # (since it has no last_heartbeat or it's very old)
            response = requests.get(
                f"{BASE_URL}/api/clients/silent",
                params={"admin_token": admin_token, "minutes": 1}
            )
            assert response.status_code == 200, f"Silent clients failed: {response.text}"
            data = response.json()
            
            silent_ids = [c["id"] for c in data["silent_clients"]]
            assert client_id in silent_ids, f"Newly registered client {client_id} should be in silent list (no heartbeat)"
            print(f"✓ Client {client_id} correctly appears in silent list (no heartbeat)")
            
        finally:
            # Cleanup
            requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={admin_id}")
            requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
    
    def test_05_client_after_status_check_not_in_silent_list(self, admin_token, admin_id):
        """Test that a client with recent heartbeat does NOT appear in silent list"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create and register a client
        client_data = {
            "name": f"TEST_ActiveClient_{unique_id}",
            "phone": f"+1777{unique_id[:7]}",
            "email": f"test_active_{unique_id}@example.com",
            "admin_id": admin_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json=client_data
        )
        assert response.status_code == 200, f"Failed to create client: {response.text}"
        client = response.json()
        client_id = client["id"]
        
        try:
            # Register the device
            reg_response = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": client["registration_code"],
                    "device_id": f"test_device_{unique_id}",
                    "device_model": "Test Active Model"
                }
            )
            assert reg_response.status_code == 200, f"Device registration failed: {reg_response.text}"
            
            # Call device status to update heartbeat
            status_response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
            assert status_response.status_code == 200, f"Status check failed: {status_response.text}"
            print(f"✓ Device status called for client {client_id}")
            
            # Now check silent clients with 1 minute threshold
            # Client should NOT appear because heartbeat was just updated
            response = requests.get(
                f"{BASE_URL}/api/clients/silent",
                params={"admin_token": admin_token, "minutes": 1}
            )
            assert response.status_code == 200, f"Silent clients failed: {response.text}"
            data = response.json()
            
            silent_ids = [c["id"] for c in data["silent_clients"]]
            assert client_id not in silent_ids, f"Client {client_id} should NOT be in silent list (recent heartbeat)"
            print(f"✓ Client {client_id} correctly does NOT appear in silent list (recent heartbeat)")
            
        finally:
            # Cleanup
            requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={admin_id}")
            requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")


class TestTamperDetection:
    """Test tamper detection and reporting endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def admin_id(self, admin_token):
        """Get admin ID from token"""
        response = requests.get(f"{BASE_URL}/api/admin/verify/{admin_token}")
        assert response.status_code == 200
        return response.json()["admin_id"]
    
    @pytest.fixture
    def test_client(self, admin_token, admin_id):
        """Create a test client and clean up after test"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_TamperClient_{unique_id}",
            "phone": f"+1888{unique_id[:7]}",
            "email": f"test_tamper_{unique_id}@example.com",
            "admin_id": admin_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json=client_data
        )
        assert response.status_code == 200, f"Failed to create test client: {response.text}"
        client = response.json()
        
        yield client
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client['id']}/allow-uninstall?admin_id={admin_id}")
        requests.delete(f"{BASE_URL}/api/clients/{client['id']}?admin_id={admin_id}")
    
    def test_06_report_tamper_clear_data(self, test_client, admin_id):
        """Test POST /api/clients/{client_id}/report-tamper with tamper_type=clear_data"""
        client_id = test_client["id"]
        
        # Report tamper attempt
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/report-tamper",
            params={"tamper_type": "clear_data"}
        )
        assert response.status_code == 200, f"Report tamper failed: {response.text}"
        data = response.json()
        
        assert "message" in data, "Response should contain message"
        assert "total_attempts" in data, "Response should contain total_attempts"
        assert data["total_attempts"] >= 1, "Tamper attempts should be at least 1"
        print(f"✓ Tamper report successful: {data['message']}, total attempts: {data['total_attempts']}")
        
        # Verify client record was updated
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
        assert response.status_code == 200, f"Failed to get client: {response.text}"
        client_data = response.json()
        
        assert client_data.get("tamper_attempts", 0) >= 1, "Client tamper_attempts should be at least 1"
        assert client_data.get("last_tamper_attempt") is not None, "last_tamper_attempt should be set"
        print(f"✓ Client record updated: tamper_attempts={client_data['tamper_attempts']}, warning_message={client_data.get('warning_message', '')}")
    
    def test_07_report_tamper_increments_counter(self, test_client, admin_id):
        """Test that multiple tamper reports increment the counter"""
        client_id = test_client["id"]
        
        # Get initial tamper count
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
        assert response.status_code == 200
        initial_count = response.json().get("tamper_attempts", 0)
        
        # Report tamper twice more
        for i in range(2):
            response = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/report-tamper",
                params={"tamper_type": f"test_tamper_{i}"}
            )
            assert response.status_code == 200, f"Tamper report {i} failed: {response.text}"
        
        # Verify count increased by 2
        response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
        assert response.status_code == 200
        final_count = response.json().get("tamper_attempts", 0)
        
        assert final_count >= initial_count + 2, f"Tamper count should be at least {initial_count + 2}, got {final_count}"
        print(f"✓ Tamper counter correctly incremented: {initial_count} -> {final_count}")
    
    def test_08_report_tamper_invalid_client(self):
        """Test that tamper report fails for non-existent client"""
        fake_client_id = str(uuid.uuid4())
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{fake_client_id}/report-tamper",
            params={"tamper_type": "test"}
        )
        assert response.status_code == 404, f"Expected 404 for invalid client, got {response.status_code}"
        print(f"✓ Report tamper correctly returns 404 for non-existent client")


class TestFullHeartbeatChain:
    """Full chain test: login -> create client -> register -> check silent -> call status -> verify not in silent -> delete"""
    
    def test_09_full_heartbeat_chain(self):
        """Test the complete heartbeat monitoring flow"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Step 1: Login
        print("\n--- Step 1: Login ---")
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        login_data = response.json()
        admin_token = login_data["token"]
        admin_id = login_data["id"]
        print(f"✓ Logged in as admin {admin_id}")
        
        # Step 2: Create client
        print("\n--- Step 2: Create Client ---")
        client_data = {
            "name": f"TEST_ChainClient_{unique_id}",
            "phone": f"+1999{unique_id[:7]}",
            "email": f"test_chain_{unique_id}@example.com",
            "admin_id": admin_id
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json=client_data
        )
        assert response.status_code == 200, f"Create client failed: {response.text}"
        client = response.json()
        client_id = client["id"]
        print(f"✓ Created client {client_id}")
        
        try:
            # Step 3: Register device
            print("\n--- Step 3: Register Device ---")
            reg_response = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": client["registration_code"],
                    "device_id": f"chain_device_{unique_id}",
                    "device_model": "Chain Test Model"
                }
            )
            assert reg_response.status_code == 200, f"Device registration failed: {reg_response.text}"
            print(f"✓ Device registered")
            
            # Step 4: Check silent clients - should include our client (no heartbeat)
            print("\n--- Step 4: Check Silent Clients (Should Include Our Client) ---")
            response = requests.get(
                f"{BASE_URL}/api/clients/silent",
                params={"admin_token": admin_token, "minutes": 1}
            )
            assert response.status_code == 200, f"Silent clients failed: {response.text}"
            data = response.json()
            silent_ids = [c["id"] for c in data["silent_clients"]]
            assert client_id in silent_ids, f"Client should be in silent list before status check"
            print(f"✓ Client {client_id} correctly in silent list ({data['count']} total silent)")
            
            # Step 5: Call device status to update heartbeat
            print("\n--- Step 5: Call Device Status ---")
            response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
            assert response.status_code == 200, f"Device status failed: {response.text}"
            print(f"✓ Device status called, heartbeat updated")
            
            # Step 6: Check silent clients again - should NOT include our client
            print("\n--- Step 6: Check Silent Clients Again (Should NOT Include Our Client) ---")
            response = requests.get(
                f"{BASE_URL}/api/clients/silent",
                params={"admin_token": admin_token, "minutes": 1}
            )
            assert response.status_code == 200, f"Silent clients failed: {response.text}"
            data = response.json()
            silent_ids = [c["id"] for c in data["silent_clients"]]
            assert client_id not in silent_ids, f"Client should NOT be in silent list after status check"
            print(f"✓ Client {client_id} correctly NOT in silent list ({data['count']} total silent)")
            
            # Step 7: Test tamper reporting
            print("\n--- Step 7: Report Tamper ---")
            response = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/report-tamper",
                params={"tamper_type": "clear_data"}
            )
            assert response.status_code == 200, f"Tamper report failed: {response.text}"
            tamper_data = response.json()
            assert tamper_data.get("total_attempts", 0) >= 1, "Tamper attempts should be at least 1"
            print(f"✓ Tamper reported successfully, attempts: {tamper_data.get('total_attempts')}")
            
            # Step 8: Allow uninstall
            print("\n--- Step 8: Allow Uninstall ---")
            response = requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={admin_id}")
            assert response.status_code == 200, f"Allow uninstall failed: {response.text}"
            print(f"✓ Uninstall allowed")
            
            # Step 9: Delete client
            print("\n--- Step 9: Delete Client ---")
            response = requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
            assert response.status_code == 200, f"Delete failed: {response.text}"
            print(f"✓ Client deleted successfully")
            
            # Step 10: Verify client is gone
            print("\n--- Step 10: Verify Client Deleted ---")
            response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
            assert response.status_code == 404, f"Expected 404 for deleted client, got {response.status_code}"
            print(f"✓ Client correctly returns 404 (deleted)")
            
            print("\n=== FULL CHAIN TEST PASSED ===")
            
        except Exception as e:
            # Emergency cleanup
            print(f"\n!!! Test failed with error: {e}")
            try:
                requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={admin_id}")
                requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={admin_id}")
            except:
                pass
            raise


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
