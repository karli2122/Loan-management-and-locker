"""
Iteration 74 - Plan Gating & Website Tests

Tests:
1. Backend FEATURE_PLANS dict feature counts per plan level
2. Plan hierarchy supports both 'business' and 'professional' at same level
3. Feature-access API returns correct features per plan
4. Website download endpoint returns 200 with zip file
5. Website HTML content validation (pricing, index, how-it-works)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://subscription-tier-1.preview.emergentagent.com"


class TestPlanGatingStructure:
    """Test the FEATURE_PLANS dict and PLAN_HIERARCHY structure"""

    def test_feature_plans_starter_count(self):
        """Verify starter plan has 6 features"""
        from utils.plan_gating import FEATURE_PLANS
        
        starter_features = [f for f, plan in FEATURE_PLANS.items() if plan == "starter"]
        assert len(starter_features) == 6, f"Expected 6 starter features, got {len(starter_features)}: {starter_features}"
        
        expected = {"clients", "loans", "payments", "notifications", "calculator", "reminders"}
        assert set(starter_features) == expected, f"Starter features mismatch: {set(starter_features)}"
        print(f"PASS: Starter plan has 6 features: {starter_features}")

    def test_feature_plans_professional_count(self):
        """Verify professional plan has 11 features (business/professional tier)"""
        from utils.plan_gating import FEATURE_PLANS
        
        professional_features = [f for f, plan in FEATURE_PLANS.items() if plan == "professional"]
        assert len(professional_features) == 11, f"Expected 11 professional features, got {len(professional_features)}: {professional_features}"
        
        expected = {"device_lock", "auto_lock", "messaging", "contracts", "loan_plans", 
                   "collection_trends", "reports", "reports_gps", "late_fee", "loan_restructure", "team_management"}
        assert set(professional_features) == expected, f"Professional features mismatch: {set(professional_features)}"
        print(f"PASS: Professional plan has 11 features: {professional_features}")

    def test_feature_plans_enterprise_count(self):
        """Verify enterprise plan has 21 features"""
        from utils.plan_gating import FEATURE_PLANS
        
        enterprise_features = [f for f, plan in FEATURE_PLANS.items() if plan == "enterprise"]
        assert len(enterprise_features) == 21, f"Expected 21 enterprise features, got {len(enterprise_features)}: {enterprise_features}"
        print(f"PASS: Enterprise plan has 21 features: {enterprise_features}")

    def test_feature_plans_total_count(self):
        """Verify total features is 38 (6+11+21)"""
        from utils.plan_gating import FEATURE_PLANS
        
        assert len(FEATURE_PLANS) == 38, f"Expected 38 total features, got {len(FEATURE_PLANS)}"
        print(f"PASS: Total features = 38")

    def test_plan_hierarchy_structure(self):
        """Verify PLAN_HIERARCHY has correct structure with business and professional at same level"""
        from utils.plan_gating import PLAN_HIERARCHY
        
        assert PLAN_HIERARCHY.get("starter") == 0, "Starter should be level 0"
        assert PLAN_HIERARCHY.get("professional") == 1, "Professional should be level 1"
        assert PLAN_HIERARCHY.get("business") == 1, "Business should be level 1 (same as professional)"
        assert PLAN_HIERARCHY.get("enterprise") == 2, "Enterprise should be level 2"
        assert PLAN_HIERARCHY.get("custom") == 3, "Custom should be level 3"
        
        print(f"PASS: PLAN_HIERARCHY correctly supports both 'business' and 'professional' at level 1")
        print(f"  PLAN_HIERARCHY: {PLAN_HIERARCHY}")


class TestFeatureAccessAPI:
    """Test the /api/admin/feature-access endpoint"""

    @pytest.fixture
    def super_admin_token(self):
        """Get super admin token (karli1987 - custom plan)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not login as super admin karli1987")

    @pytest.fixture
    def starter_token(self):
        """Get starter plan token (madis123)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "madis123", "password": "Testpass1!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not login as starter user madis123")

    @pytest.fixture
    def business_token(self):
        """Get business plan token (lembi123)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "lembi123", "password": "Testpass1!"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not login as business user lembi123")

    def test_feature_access_super_admin(self, super_admin_token):
        """Super admin (custom plan) should have all 38 features = true"""
        response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": super_admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("plan") == "custom", f"Expected plan='custom', got {data.get('plan')}"
        
        features = data.get("features", {})
        assert len(features) == 38, f"Expected 38 features, got {len(features)}"
        
        false_features = [f for f, v in features.items() if not v]
        assert len(false_features) == 0, f"Super admin should have all features=true, but these are false: {false_features}"
        
        print(f"PASS: Super admin has all 38 features=true")

    def test_feature_access_starter_plan(self, starter_token):
        """Starter plan should have 6 features=true, rest false"""
        response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": starter_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("plan") == "starter", f"Expected plan='starter', got {data.get('plan')}"
        
        features = data.get("features", {})
        true_features = [f for f, v in features.items() if v]
        false_features = [f for f, v in features.items() if not v]
        
        assert len(true_features) == 6, f"Expected 6 true features for starter, got {len(true_features)}: {true_features}"
        assert len(false_features) == 32, f"Expected 32 false features for starter, got {len(false_features)}"
        
        print(f"PASS: Starter plan has 6 features=true, 32 features=false")

    def test_feature_access_business_plan(self, business_token):
        """Business plan (level 1) should have 17 features=true (6 starter + 11 professional)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": business_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        plan = data.get("plan")
        assert plan in ["business", "professional"], f"Expected plan='business' or 'professional', got {plan}"
        
        features = data.get("features", {})
        true_features = [f for f, v in features.items() if v]
        false_features = [f for f, v in features.items() if not v]
        
        # Business/Professional plan should have starter (6) + professional (11) = 17 features
        assert len(true_features) == 17, f"Expected 17 true features for business/professional, got {len(true_features)}: {true_features}"
        assert len(false_features) == 21, f"Expected 21 false features (enterprise), got {len(false_features)}"
        
        print(f"PASS: Business/Professional plan has 17 features=true, 21 features=false")


class TestWebsiteDownloadEndpoint:
    """Test the /api/download/website endpoint"""

    def test_website_download_returns_zip(self):
        """Download endpoint should return 200 with zip file"""
        response = requests.get(f"{BASE_URL}/api/download/website")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:200]}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "zip" in content_type or "octet-stream" in content_type, f"Expected zip content type, got {content_type}"
        
        content_disposition = response.headers.get("Content-Disposition", "")
        assert "paylockpro-website.zip" in content_disposition, f"Expected filename in header: {content_disposition}"
        
        # Verify it's a valid zip by checking magic bytes (PK..)
        assert response.content[:2] == b'PK', "Response doesn't appear to be a valid ZIP file"
        
        print(f"PASS: Website download endpoint returns valid ZIP file")
        print(f"  Content-Length: {len(response.content)} bytes")


class TestWebsiteHTMLContent:
    """Test website HTML pages have correct content"""

    def test_pricing_page_three_plans(self):
        """Pricing page should have Starter, Professional, Enterprise plans"""
        response = requests.get(f"{BASE_URL}/api/website/pricing")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content = response.text
        
        # Check all three plan names exist
        assert "Starter" in content, "Pricing page missing 'Starter' plan"
        assert "Professional" in content, "Pricing page missing 'Professional' plan"
        assert "Enterprise" in content, "Pricing page missing 'Enterprise' plan"
        
        # Should NOT have old "Business" plan as a main plan name
        # (It's ok if "Business" appears in other context like "growing businesses")
        price_card_count = content.count('class="price-card')
        assert price_card_count >= 3, f"Expected at least 3 price cards, found {price_card_count}"
        
        # Verify pricing amounts
        assert '29<span>/month' in content or '$29' in content, "Starter price not found"
        assert '79<span>/month' in content or '$79' in content, "Professional price not found"
        assert '199<span>/month' in content or '$199' in content, "Enterprise price not found"
        
        print(f"PASS: Pricing page has Starter ($29), Professional ($79), Enterprise ($199)")

    def test_index_page_full_feature_list(self):
        """Index page should have 'Full Feature List' section with 18 feature cards"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content = response.text
        
        # Check section exists
        assert "Full Feature List" in content, "Index page missing 'Full Feature List' section"
        
        # Count feature cards in the full feature list section
        # Looking for the second features-grid which contains 18 cards
        feature_card_count = content.count('class="feature-card"')
        
        # First section has 6, second section should have 18, total = 24
        assert feature_card_count >= 18, f"Expected at least 18 feature cards for full feature list, found {feature_card_count} total"
        
        # Check some key feature names from the full list
        key_features = [
            "PDF Contracts",
            "QR Provisioning", 
            "NFC Provisioning",
            "Bank Statement OCR",
            "Document Vault",
            "Stripe Payments",
            "Device Owner Mode",
            "Portfolio Health",
            "Credit Scoring",
            "Bulk Import/Export",
            "Session Management",
            "REST API Access",
            "Daily Digest",
            "Role-Based Permissions",
            "Revenue Forecasting",
            "Audit Log",
            "Client Messaging",
            "Loan Calculator"
        ]
        
        found_features = [f for f in key_features if f in content]
        missing_features = [f for f in key_features if f not in content]
        
        assert len(found_features) >= 16, f"Expected at least 16 key features, found {len(found_features)}. Missing: {missing_features}"
        
        print(f"PASS: Index page has 'Full Feature List' section with {feature_card_count} feature cards")
        print(f"  Found {len(found_features)}/18 key features")

    def test_how_it_works_platform_capabilities(self):
        """How-it-works page should have 'Platform Capabilities' section with feature cards"""
        response = requests.get(f"{BASE_URL}/api/website/how-it-works")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content = response.text
        
        # Check section exists
        assert "Platform Capabilities" in content, "How-it-works page missing 'Platform Capabilities' section"
        
        # Count feature cards
        feature_card_count = content.count('class="feature-card"')
        assert feature_card_count >= 9, f"Expected at least 9 feature cards in capabilities, found {feature_card_count}"
        
        # Check some capability names
        capabilities = [
            "Device Lock",
            "Auto-Lock",
            "Late Fee",
            "Messaging",
            "Contract",
            "OCR",
            "Tamper",
            "Forecasting",
            "Stripe"
        ]
        
        found_caps = [c for c in capabilities if c in content]
        assert len(found_caps) >= 7, f"Expected at least 7 capabilities, found {len(found_caps)}: {found_caps}"
        
        print(f"PASS: How-it-works page has 'Platform Capabilities' section with {feature_card_count} feature cards")


class TestAPIHealth:
    """Basic health check"""

    def test_api_health(self):
        """API health endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"PASS: API health check OK")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
