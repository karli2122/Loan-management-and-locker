"""
Security feature tests for password hashing, data masking, and query validation.
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from server import (
    hash_password,
    verify_password,
    mask_email,
    mask_phone,
    mask_sensitive_data,
    SecureQueryBuilder,
    ValidationException
)


def test_argon2_password_hashing():
    """Test that Argon2id password hashing works correctly"""
    password = "TestPassword123!"
    
    # Hash the password
    hashed = hash_password(password)
    
    # Verify it starts with Argon2 identifier
    assert hashed.startswith("$argon2"), "Hash should use Argon2"
    
    # Verify correct password
    assert verify_password(password, hashed), "Password verification should succeed"
    
    # Verify incorrect password fails
    assert not verify_password("WrongPassword", hashed), "Wrong password should fail"
    
    print("✓ Argon2id password hashing test passed")


def test_legacy_sha256_compatibility():
    """Test that legacy SHA-256 hashes still work"""
    import hashlib
    
    password = "LegacyPassword123"
    
    # Create a legacy SHA-256 hash
    legacy_hash = hashlib.sha256(password.encode()).hexdigest()
    
    # Should still verify correctly
    assert verify_password(password, legacy_hash), "Legacy SHA-256 verification should work"
    
    # Wrong password should fail
    assert not verify_password("WrongPassword", legacy_hash), "Wrong password should fail"
    
    print("✓ Legacy SHA-256 compatibility test passed")


def test_email_masking():
    """Test email address masking"""
    assert mask_email("john@example.com") == "j**n@example.com"
    assert mask_email("a@test.com") == "a*@test.com"
    assert mask_email("alice.smith@company.org") == "a*********h@company.org"
    
    print("✓ Email masking test passed")


def test_phone_masking():
    """Test phone number masking"""
    assert mask_phone("+1-555-123-4567") == "***-***-4567"
    assert mask_phone("5551234567") == "***-***-4567"
    assert mask_phone("123") == "***"
    
    print("✓ Phone masking test passed")


def test_sensitive_data_masking():
    """Test complete data masking"""
    data = {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "phone": "+1-555-123-4567",
        "address": "123 Main St"
    }
    
    masked = mask_sensitive_data(data)
    
    assert masked["name"] == "John Doe"  # Not masked
    assert masked["email"] == "j******e@example.com"  # Masked
    assert masked["phone"] == "***-***-4567"  # Masked
    assert masked["address"] == "123 Main St"  # Not masked
    
    print("✓ Sensitive data masking test passed")


def test_secure_query_builder_validation():
    """Test SecureQueryBuilder field and operator validation"""
    # Test allowed field
    assert SecureQueryBuilder.validate_field("clients", "admin_id")
    
    # Test disallowed field
    assert not SecureQueryBuilder.validate_field("clients", "internal_notes")
    
    # Test allowed operator
    assert SecureQueryBuilder.validate_operator("$eq")
    assert SecureQueryBuilder.validate_operator("$gt")
    
    # Test disallowed operator
    assert not SecureQueryBuilder.validate_operator("$where")
    assert not SecureQueryBuilder.validate_operator("$eval")
    
    print("✓ SecureQueryBuilder validation test passed")


def test_secure_query_building():
    """Test safe query building"""
    # Build a safe query
    query = SecureQueryBuilder.build_safe_query("clients", "admin_id", "12345")
    assert query == {"admin_id": "12345"}
    
    # Build with operator
    query = SecureQueryBuilder.build_safe_query("clients", "id", "abc", "$ne")
    assert query == {"id": {"$ne": "abc"}}
    
    # Try disallowed field
    try:
        SecureQueryBuilder.build_safe_query("clients", "secret_field", "value")
        assert False, "Should have raised ValidationException"
    except ValidationException:
        pass
    
    print("✓ Secure query building test passed")


def test_query_sanitization():
    """Test query sanitization"""
    # Query with allowed fields
    query = {
        "admin_id": "123",
        "is_locked": {"$eq": True}
    }
    sanitized = SecureQueryBuilder.sanitize_query("clients", query)
    assert sanitized == query
    
    # Query with disallowed field
    query = {
        "admin_id": "123",
        "internal_field": "value"
    }
    sanitized = SecureQueryBuilder.sanitize_query("clients", query)
    assert "admin_id" in sanitized
    assert "internal_field" not in sanitized
    
    # Query with disallowed operator
    query = {
        "admin_id": {"$where": "malicious code"}
    }
    sanitized = SecureQueryBuilder.sanitize_query("clients", query)
    assert sanitized == {}  # Should remove the disallowed operator
    
    print("✓ Query sanitization test passed")


if __name__ == "__main__":
    print("Running security tests...")
    print()
    
    test_argon2_password_hashing()
    test_legacy_sha256_compatibility()
    test_email_masking()
    test_phone_masking()
    test_sensitive_data_masking()
    test_secure_query_builder_validation()
    test_secure_query_building()
    test_query_sanitization()
    
    print()
    print("=" * 50)
    print("All security tests passed! ✓")
    print("=" * 50)
