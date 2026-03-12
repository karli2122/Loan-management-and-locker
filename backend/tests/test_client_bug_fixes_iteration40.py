"""
Test file for Client App Bug Fixes (Iteration 40)
Tests backend API endpoints and verifies code fixes in home.tsx

Bug fixes verified:
1. handleUninstallSignal should only fire once (uninstallHandledRef guard)
2. hasInitialized.current reset on component unmount
3. Fresh registration calls fetchStatus to populate user data
4. Error fallback in fetchStatus keeps status null instead of creating blank object
5. checkAndSetupDeviceProtection called in initializeProtection lifecycle

Backend APIs tested:
- /api/health
- /api/device/status/{client_id}
- /api/device/register
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://loan-admin-hub-2.preview.emergentagent.com"


class TestBackendHealthAndDeviceAPIs:
    """Test backend API endpoints for device management"""
    
    def test_health_endpoint(self):
        """Test /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        print(f"✓ Health endpoint returns: {data}")
    
    def test_device_status_nonexistent_client(self):
        """Test /api/device/status/{client_id} returns 404 for non-existent client"""
        response = requests.get(f"{BASE_URL}/api/device/status/nonexistent-client-12345", timeout=10)
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
        print(f"✓ Device status for non-existent client returns 404: {data}")
    
    def test_device_register_invalid_code(self):
        """Test /api/device/register returns error for invalid registration code"""
        response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": "INVALID123",
                "device_id": "test-device-001",
                "device_model": "Test Device"
            },
            timeout=10
        )
        # Should return 422 for validation error (invalid code)
        assert response.status_code == 422
        data = response.json()
        assert "error" in data or "detail" in data
        print(f"✓ Device register with invalid code returns 422: {data}")
    
    def test_device_register_endpoint_exists(self):
        """Test /api/device/register endpoint exists and accepts POST"""
        response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": "",
                "device_id": "test-device-001",
                "device_model": "Test Device"
            },
            timeout=10
        )
        # Should NOT return 404 (endpoint not found)
        assert response.status_code != 404
        print(f"✓ Device register endpoint exists, returns: {response.status_code}")


class TestCodeBugFixVerification:
    """
    These tests verify the bug fixes are correctly implemented in home.tsx
    through static code analysis (not runtime testing since it's React Native)
    """
    
    def test_bug1_uninstall_guard_exists(self):
        """Bug 1: Verify uninstallHandledRef guard prevents repeated uninstall alerts"""
        with open('/app/frontend/app/client/home.tsx', 'r') as f:
            content = f.read()
        
        # Check that uninstallHandledRef is defined
        assert "const uninstallHandledRef = useRef(false)" in content, "uninstallHandledRef not defined"
        
        # Check the guard condition exists
        assert "!uninstallHandledRef.current" in content, "Guard condition not found"
        
        # Check the flag is set to true before calling handleUninstallSignal
        assert "uninstallHandledRef.current = true" in content, "Flag not being set"
        
        print("✓ Bug 1 Fix: uninstallHandledRef guard is correctly implemented")
    
    def test_bug2_hasinitialized_reset_on_unmount(self):
        """Bug 2: Verify hasInitialized.current is reset on component unmount"""
        with open('/app/frontend/app/client/home.tsx', 'r') as f:
            content = f.read()
        
        # Check that cleanup function resets hasInitialized
        # Look for the cleanup function in useEffect
        assert "hasInitialized.current = false" in content, "hasInitialized not reset in cleanup"
        
        # Verify it's in a return/cleanup function
        lines = content.split('\n')
        found_cleanup = False
        for i, line in enumerate(lines):
            if "hasInitialized.current = false" in line:
                # Check if nearby lines contain return () =>
                start = max(0, i - 10)
                context = '\n'.join(lines[start:i+1])
                if "return () =>" in context or "return () => {" in context:
                    found_cleanup = True
                    break
        
        assert found_cleanup, "hasInitialized reset not in cleanup function"
        print("✓ Bug 2 Fix: hasInitialized.current is correctly reset on unmount")
    
    def test_bug3_fresh_registration_calls_fetchstatus(self):
        """Bug 3: Verify fresh registration calls fetchStatus to populate user data"""
        with open('/app/frontend/app/client/home.tsx', 'r') as f:
            content = f.read()
        
        # Look for the fresh registration section that calls fetchStatus
        # Should find: if (isFreshRegistration === 'true') { ... await fetchStatus(id) ... }
        lines = content.split('\n')
        
        in_fresh_registration_block = False
        found_fetchstatus_call = False
        
        for i, line in enumerate(lines):
            if "isFreshRegistration === 'true'" in line:
                in_fresh_registration_block = True
            if in_fresh_registration_block:
                if "await fetchStatus(id)" in line:
                    found_fetchstatus_call = True
                    break
                if "// Normal init" in line:  # End of fresh registration block
                    break
        
        assert found_fetchstatus_call, "fetchStatus not called in fresh registration path"
        print("✓ Bug 3 Fix: Fresh registration correctly calls fetchStatus to populate user data")
    
    def test_bug4_error_fallback_keeps_null_status(self):
        """Bug 4: Verify error fallback doesn't create blank status when prev is null"""
        with open('/app/frontend/app/client/home.tsx', 'r') as f:
            content = f.read()
        
        # Look for the pattern in the catch block that preserves null
        # Should find: setStatus(prev => { if (!prev) return prev; ... })
        assert "if (!prev) return prev" in content, "Null guard not found in setStatus"
        
        # Verify this is in the error handling section
        lines = content.split('\n')
        found_in_catch = False
        
        for i, line in enumerate(lines):
            if "if (!prev) return prev" in line:
                # Check if within a catch block (look back for 'catch')
                start = max(0, i - 20)
                context = '\n'.join(lines[start:i])
                if "catch (error)" in context or "} catch" in context:
                    found_in_catch = True
                    break
        
        assert found_in_catch, "Null guard not in catch block"
        print("✓ Bug 4 Fix: Error fallback correctly keeps status as null instead of blank object")
    
    def test_bug5_checkandsetupdeviceprotection_in_initializeprotection(self):
        """Bug 5: Verify checkAndSetupDeviceProtection is called in initializeProtection lifecycle"""
        with open('/app/frontend/app/client/home.tsx', 'r') as f:
            content = f.read()
        
        # Look for checkAndSetupDeviceProtection being called within initializeProtection
        lines = content.split('\n')
        
        in_initialize_protection = False
        found_call = False
        
        for i, line in enumerate(lines):
            if "const initializeProtection = async" in line:
                in_initialize_protection = True
            if in_initialize_protection:
                if "await checkAndSetupDeviceProtection()" in line:
                    found_call = True
                    break
                # Check for end of function (look for closing pattern)
                if i > 0 and "initializeProtection();" in line:
                    # This means we're at the call site, function ended
                    break
        
        assert found_call, "checkAndSetupDeviceProtection not called in initializeProtection"
        print("✓ Bug 5 Fix: checkAndSetupDeviceProtection correctly called in initializeProtection lifecycle")


class TestAPIResponseStructure:
    """Test API response structures match expected format"""
    
    def test_health_response_structure(self):
        """Verify health endpoint returns proper JSON structure"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)
        assert "status" in data
        assert isinstance(data["status"], str)
        print(f"✓ Health response structure is correct: {data}")
    
    def test_device_status_404_response_structure(self):
        """Verify device status 404 returns proper error JSON"""
        response = requests.get(f"{BASE_URL}/api/device/status/fake-id-12345", timeout=10)
        assert response.status_code == 404
        
        data = response.json()
        assert isinstance(data, dict)
        assert "detail" in data
        print(f"✓ Device status 404 response structure is correct: {data}")
    
    def test_device_register_error_response_structure(self):
        """Verify device register error returns proper error JSON"""
        response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": "INVALID",
                "device_id": "test",
                "device_model": "Test"
            },
            timeout=10
        )
        
        data = response.json()
        assert isinstance(data, dict)
        # Should have either 'error' or 'detail' field
        assert "error" in data or "detail" in data
        print(f"✓ Device register error response structure is correct: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
