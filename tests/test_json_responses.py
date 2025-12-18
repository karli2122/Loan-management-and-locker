from fastapi.testclient import TestClient

from backend.server import app


client = TestClient(app)


def test_admin_login_missing_prefix_returns_json():
    response = client.post(
        "/admin/login",
        json={"username": "user", "password": "pass"},
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["redirect_to"].endswith("/api/admin/login")


def test_client_registration_double_prefix_returns_json():
    response = client.post(
        "/api/api/clients",
        json={"name": "John", "phone": "+123", "email": "john@example.com"},
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["redirect_to"].endswith("/api/clients")
