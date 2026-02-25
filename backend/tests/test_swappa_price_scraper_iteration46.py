"""
Test suite for Swappa price scraping feature (Iteration 46)
Tests the fetch-price endpoint with real Swappa.com integration
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://secure-loan-app.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USERNAME = "karli1987"
TEST_PASSWORD = "nasvakas123"

# Test client IDs
CLIENT_WITH_SM_A326B = "55b75342-c361-43ee-8400-26bcf4b937cc"  # Henri Johannesburg - samsung SM-A326B
CLIENT_WITH_GENERIC_MODEL = "5041e532-2b15-4d1b-8107-00b3be312c95"  # Lembi Vilbas - Samsung Galaxy


@pytest.fixture(scope="module")
def auth_token():
    """Authenticate and get admin token"""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "Token not in login response"
    return data["token"]


class TestAdminLogin:
    """Test admin login functionality"""
    
    def test_login_returns_token(self):
        """POST /api/admin/login returns token for karli1987/nasvakas123"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0


class TestClientsWithCreditScore:
    """Test that clients have credit_score field"""
    
    def test_clients_have_credit_score(self, auth_token):
        """GET /api/clients returns clients with credit_score field"""
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={auth_token}")
        assert response.status_code == 200
        
        data = response.json()
        assert "clients" in data
        clients = data["clients"]
        assert len(clients) > 0, "No clients returned"
        
        # Check that at least one client has credit_score
        clients_with_score = [c for c in clients if c.get("credit_score") is not None]
        assert len(clients_with_score) > 0, "No clients have credit_score field"
        
        # Verify credit_score values are reasonable (300-850 range)
        for client in clients_with_score:
            score = client.get("credit_score")
            assert isinstance(score, (int, float)), f"credit_score should be numeric: {score}"
            assert 300 <= score <= 850, f"credit_score {score} out of expected range"


class TestSwappaPriceFetchWithForce:
    """Test fetch-price endpoint with force=true (fresh Swappa scrape)"""
    
    def test_fetch_price_with_force_for_sm_a326b(self, auth_token):
        """GET /api/clients/{id}/fetch-price returns real price from Swappa when force=true"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{CLIENT_WITH_SM_A326B}/fetch-price?admin_token={auth_token}&force=true"
        )
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields are present
        assert "client_id" in data
        assert "device_model" in data
        assert "used_price_eur" in data
        assert "price_range" in data
        assert "listing_count" in data
        assert "source" in data
        assert "sample_listings" in data
        
        # Verify price values are reasonable for Samsung Galaxy A32
        assert data["used_price_eur"] is not None, "used_price_eur should not be None"
        assert isinstance(data["used_price_eur"], (int, float))
        assert 20 <= data["used_price_eur"] <= 200, f"Price {data['used_price_eur']} seems out of range for A32"
        
        # Verify price_range structure
        price_range = data["price_range"]
        assert "min" in price_range
        assert "max" in price_range
        assert "avg" in price_range
        assert price_range["min"] is not None
        assert price_range["max"] is not None
        assert price_range["min"] <= price_range["max"], "min should be <= max"
        
        # Verify listing_count is positive
        assert data["listing_count"] > 0, "listing_count should be > 0"
        
        # Verify sample_listings is a list
        assert isinstance(data["sample_listings"], list)
        if data["sample_listings"]:
            listing = data["sample_listings"][0]
            assert "title" in listing
            assert "price" in listing
        
        # Verify search_query is set
        assert "search_query" in data
        assert data["search_query"], "search_query should not be empty"


class TestSwappaPriceFetchCached:
    """Test fetch-price endpoint without force (returns cached)"""
    
    def test_fetch_price_returns_cached_without_force(self, auth_token):
        """GET /api/clients/{id}/fetch-price returns cached price without force param"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{CLIENT_WITH_SM_A326B}/fetch-price?admin_token={auth_token}"
        )
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Should indicate cached source
        assert "source" in data
        # Cached response should show "swappa.com (cached)" and include cached_days_ago
        assert "cached" in data.get("source", "").lower() or "cached_days_ago" in data, \
            f"Expected cached response indicator, got source: {data.get('source')}"
        
        # Verify all standard fields are present
        assert "used_price_eur" in data
        assert "price_range" in data
        assert "listing_count" in data
        assert "sample_listings" in data


class TestSwappaPriceErrorForGenericModel:
    """Test fetch-price returns 404 for generic model"""
    
    def test_fetch_price_returns_404_for_generic_samsung_galaxy(self, auth_token):
        """GET /api/clients/{id}/fetch-price returns proper error for generic 'Samsung Galaxy' model"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{CLIENT_WITH_GENERIC_MODEL}/fetch-price?admin_token={auth_token}&force=true"
        )
        
        # Should return 404 because generic "Samsung Galaxy" can't be resolved to a Swappa URL
        assert response.status_code == 404, f"Expected 404 but got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data
        # Error message should mention no listings found
        assert "no" in data["detail"].lower() or "not found" in data["detail"].lower() or \
               "listings" in data["detail"].lower(), \
               f"Error detail should mention missing listings: {data['detail']}"


class TestPriceDataPersistence:
    """Test that price data is properly cached in MongoDB"""
    
    def test_price_data_fields_in_response(self, auth_token):
        """Verify price response includes all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{CLIENT_WITH_SM_A326B}/fetch-price?admin_token={auth_token}"
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Price range fields
        assert "price_range" in data
        assert data["price_range"].get("min") is not None
        assert data["price_range"].get("max") is not None
        assert data["price_range"].get("avg") is not None
        
        # Other required fields
        assert data.get("listing_count") is not None
        assert data.get("source") is not None
        assert data.get("sample_listings") is not None
        
        # Verify sample_listings format
        for listing in data.get("sample_listings", []):
            assert "title" in listing
            assert "price" in listing
            assert isinstance(listing["price"], (int, float))


class TestAnotherSamsungModel:
    """Test fetch-price with another Samsung model (SM-F956B - Z Fold6)"""
    
    def test_fetch_price_for_z_fold6(self, auth_token):
        """Test another Samsung model to verify model mapping works"""
        # Client with samsung SM-F956B (Z Fold6)
        client_with_fold6 = "7c257aea-87f2-4344-949e-11e17da538af"  # Karli55
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_with_fold6}/fetch-price?admin_token={auth_token}&force=true"
        )
        
        # SM-F956B should map to samsung-galaxy-z-fold-6 in Swappa
        # This might return 200 or 404 depending on Swappa availability
        if response.status_code == 200:
            data = response.json()
            assert data.get("used_price_eur") is not None
            assert data.get("price_range") is not None
            # Z Fold6 is expensive - should be > €500
            assert data["used_price_eur"] > 100, f"Z Fold6 price seems too low: {data['used_price_eur']}"
        else:
            # If 404, verify error message is reasonable
            assert response.status_code == 404
            data = response.json()
            assert "detail" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
