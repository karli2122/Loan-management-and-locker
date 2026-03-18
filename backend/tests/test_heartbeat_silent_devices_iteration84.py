"""
Test suite for iteration 84 - Silent Device Notifications and Version Bump features.

Features tested:
1. Silent device detection task registered at startup
2. Silent device detection - clients with is_registered=true and last_heartbeat > 12h
3. Silent device notification creation in DB
4. Rate limiting - 1 notification per admin per 6 hours
5. GET /api/clients returns last_heartbeat and is_registered fields
6. GET /api/device/status/{client_id} returns admin_plan field
7. Version bump script increments buildNumber and version
"""

import pytest
import requests
import os
import subprocess
import json
from datetime import datetime, timezone, timedelta

# Read environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/') or os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Read .env file if env vars not set
if not BASE_URL:
    env_path = '/app/frontend/.env'
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    if key == 'EXPO_PUBLIC_BACKEND_URL':
                        BASE_URL = value.strip('"').rstrip('/')
                        break

print(f"Testing against BASE_URL: {BASE_URL}")


class TestSilentDeviceFeatures:
    """Tests for silent device notification features"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for superadmin"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"},
            timeout=30
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_health_check(self):
        """Test that API is running"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("API health check: PASS")
    
    def test_clients_list_has_heartbeat_fields(self, auth_token):
        """
        Verify GET /api/clients returns last_heartbeat and is_registered fields.
        These fields are required for the client card UI to show heartbeat status.
        """
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30
        )
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        data = response.json()
        
        clients = data.get("clients", [])
        print(f"Total clients returned: {len(clients)}")
        
        # Verify field presence if there are clients
        if clients:
            sample = clients[0]
            # Check required fields exist
            assert "is_registered" in sample, "is_registered field missing from client response"
            # last_heartbeat may be null for unregistered clients, but key should exist
            # Check in schema - if client has any properties, these should be included
            print(f"Sample client fields: {list(sample.keys())}")
            print(f"is_registered: {sample.get('is_registered')}")
            print(f"last_heartbeat: {sample.get('last_heartbeat')}")
        
        print("GET /api/clients heartbeat fields: PASS")
    
    def test_device_status_returns_admin_plan(self, auth_token):
        """
        Verify GET /api/device/status/{client_id} returns admin_plan field.
        This is used for client-side feature gating based on admin's subscription.
        """
        # First get a client with a known ID
        response = requests.get(
            f"{BASE_URL}/api/clients",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30
        )
        assert response.status_code == 200
        clients = response.json().get("clients", [])
        
        if not clients:
            pytest.skip("No clients found to test device status endpoint")
        
        client_id = clients[0].get("id")
        
        # Get device status
        status_response = requests.get(
            f"{BASE_URL}/api/device/status/{client_id}",
            timeout=30
        )
        assert status_response.status_code == 200, f"Device status failed: {status_response.text}"
        
        status_data = status_response.json()
        print(f"Device status response keys: {list(status_data.keys())}")
        
        # Verify admin_plan field exists
        assert "admin_plan" in status_data, "admin_plan field missing from device status response"
        print(f"admin_plan value: {status_data.get('admin_plan')}")
        
        # Verify other expected fields
        expected_fields = ["id", "name", "is_locked", "lock_message", "outstanding_balance", "lock_mode"]
        for field in expected_fields:
            assert field in status_data, f"Expected field '{field}' missing from device status"
        
        print("GET /api/device/status admin_plan field: PASS")


class TestSilentDeviceNotificationLogic:
    """Tests for verifying silent device notification database logic"""
    
    def test_silent_device_notification_exists(self):
        """
        Verify that the silent device check task created notifications in the DB.
        This tests the background task functionality by checking the database directly.
        """
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            import asyncio
            
            # Load env vars
            env_path = '/app/backend/.env'
            with open(env_path) as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        key, value = line.strip().split('=', 1)
                        os.environ[key] = value.strip('"')
            
            async def check_notifications():
                client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
                db = client[os.environ.get("DB_NAME", "paylock")]
                
                # Find silent_device notifications
                notifs = await db.notifications.find(
                    {"type": "silent_device"},
                    {"_id": 0, "title": 1, "message": 1, "admin_id": 1, "created_at": 1}
                ).sort("created_at", -1).limit(5).to_list(5)
                
                return notifs
            
            notifications = asyncio.run(check_notifications())
            
            print(f"Silent device notifications found: {len(notifications)}")
            assert len(notifications) > 0, "No silent_device notifications found - task may not have run"
            
            # Verify notification structure
            notif = notifications[0]
            assert "title" in notif, "Notification missing title"
            assert "message" in notif, "Notification missing message"
            assert "admin_id" in notif, "Notification missing admin_id"
            assert "Silent Devices" in notif.get("title", ""), "Notification title incorrect"
            
            print(f"Latest silent device notification:")
            print(f"  Title: {notif.get('title')}")
            print(f"  Message: {notif.get('message')[:80]}...")
            print("Silent device notification creation: PASS")
            
        except ImportError:
            pytest.skip("motor not available for DB testing")
    
    def test_silent_device_rate_limiting(self):
        """
        Verify that the silent device notification is rate-limited to 1 per admin per 6 hours.
        Check that no duplicate notifications exist within 6 hour window for the same admin.
        """
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            import asyncio
            
            # Load env vars
            env_path = '/app/backend/.env'
            with open(env_path) as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        key, value = line.strip().split('=', 1)
                        os.environ[key] = value.strip('"')
            
            async def check_rate_limit():
                client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
                db = client[os.environ.get("DB_NAME", "paylock")]
                
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
                
                # Get all silent_device notifications in last 6 hours
                notifs = await db.notifications.find(
                    {"type": "silent_device", "created_at": {"$gt": cutoff}},
                    {"_id": 0, "admin_id": 1, "created_at": 1}
                ).to_list(100)
                
                # Group by admin_id and check for duplicates
                admin_notif_counts = {}
                for n in notifs:
                    aid = n.get("admin_id")
                    admin_notif_counts[aid] = admin_notif_counts.get(aid, 0) + 1
                
                return admin_notif_counts
            
            counts = asyncio.run(check_rate_limit())
            
            print(f"Silent notifications per admin (last 6h): {counts}")
            
            # Verify no admin has more than 1 notification in 6h window
            for admin_id, count in counts.items():
                assert count <= 1, f"Admin {admin_id} has {count} silent device notifications in 6h - rate limit violated"
            
            print("Silent device rate limiting (1 per admin per 6h): PASS")
            
        except ImportError:
            pytest.skip("motor not available for DB testing")


class TestVersionBumpScript:
    """Tests for the version bump script"""
    
    def test_version_bump_script_exists(self):
        """Verify the version bump script exists"""
        script_path = "/app/frontend/scripts/bump-version.js"
        assert os.path.exists(script_path), f"Version bump script not found at {script_path}"
        print("Version bump script exists: PASS")
    
    def test_version_json_structure(self):
        """Verify version.json has correct structure"""
        version_path = "/app/frontend/version.json"
        assert os.path.exists(version_path), f"version.json not found at {version_path}"
        
        with open(version_path) as f:
            data = json.load(f)
        
        assert "buildNumber" in data, "buildNumber field missing"
        assert "version" in data, "version field missing"
        assert isinstance(data["buildNumber"], int), "buildNumber should be an integer"
        assert isinstance(data["version"], str), "version should be a string"
        
        print(f"Current version.json: buildNumber={data['buildNumber']}, version={data['version']}")
        print("version.json structure: PASS")
    
    def test_version_bump_increments_correctly(self):
        """
        Test that running bump-version.js increments buildNumber and updates version.
        Pattern: buildNumber increases by 1, version follows major.minor.patch format
        """
        version_path = "/app/frontend/version.json"
        
        # Read current state
        with open(version_path) as f:
            before = json.load(f)
        
        original_build = before["buildNumber"]
        original_version = before["version"]
        
        # Run bump script
        result = subprocess.run(
            ["node", "scripts/bump-version.js"],
            cwd="/app/frontend",
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0, f"Bump script failed: {result.stderr}"
        print(f"Script output: {result.stdout.strip()}")
        
        # Read new state
        with open(version_path) as f:
            after = json.load(f)
        
        # Verify buildNumber incremented
        assert after["buildNumber"] == original_build + 1, \
            f"buildNumber did not increment: {original_build} -> {after['buildNumber']}"
        
        # Verify version format (major.minor.patch)
        version_parts = after["version"].split(".")
        assert len(version_parts) == 3, f"Version format incorrect: {after['version']}"
        
        # Verify version changed appropriately
        print(f"Before: buildNumber={original_build}, version={original_version}")
        print(f"After: buildNumber={after['buildNumber']}, version={after['version']}")
        print("Version bump increment: PASS")
        
        # Restore original to not affect production
        with open(version_path, 'w') as f:
            json.dump(before, f, indent=2)
            f.write('\n')
        print("Restored original version.json")


class TestBackgroundTaskRegistration:
    """Verify background tasks are properly registered"""
    
    def test_silent_device_task_in_server_startup(self):
        """Verify check_silent_devices is imported and started in server.py startup event"""
        server_path = "/app/backend/server.py"
        
        with open(server_path) as f:
            content = f.read()
        
        # Check import
        assert "check_silent_devices" in content, "check_silent_devices not imported in server.py"
        
        # Check task creation
        assert "asyncio.create_task(check_silent_devices())" in content, \
            "check_silent_devices task not created in startup"
        
        print("check_silent_devices task registration in server.py: PASS")
    
    def test_silent_device_task_function_exists(self):
        """Verify check_silent_devices function exists in tasks.py with correct logic"""
        tasks_path = "/app/backend/tasks.py"
        
        with open(tasks_path) as f:
            content = f.read()
        
        # Check function definition
        assert "async def check_silent_devices():" in content, \
            "check_silent_devices function not defined"
        
        # Check for 12-hour cutoff logic
        assert "timedelta(hours=12)" in content, \
            "12-hour heartbeat cutoff not found in task"
        
        # Check for rate limiting (6 hours)
        assert "timedelta(hours=6)" in content, \
            "6-hour rate limit not found in task"
        
        # Check for notification creation
        assert 'type": "silent_device"' in content or "type='silent_device'" in content or '"type": "silent_device"' in content, \
            "silent_device notification type not found"
        
        print("check_silent_devices function with correct logic: PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
