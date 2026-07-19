from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user

def test_auth_enforcement_and_validation():
    # Remove the mock get_current_user override for this test
    original_overrides = app.dependency_overrides.copy()
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]

    from app.config import settings
    print("TEST SETTINGS USERNAME:", settings.admin_username)
    print("TEST SETTINGS HASH:", settings.admin_password_hash)

    try:
        client = TestClient(app)
        
        # 1. Access protected route without token -> 401
        response = client.post("/api/voice-profile", json={"samples": ["test"]})
        assert response.status_code == 401

        # 2. Login with invalid credentials -> 401
        response = client.post("/api/auth/token", data={"username": "wrong", "password": "wrong"})
        assert response.status_code == 401

        # 3. Login with valid credentials -> 200 + access_token
        # credentials in conftest.py env are: testadmin / testpassword
        response = client.post("/api/auth/token", data={"username": "testadmin", "password": "testpassword"})
        assert response.status_code == 200
        token = response.json()["access_token"]
        assert token

        # 4. Access protected route with valid token -> 200
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post("/api/voice-profile", json={"samples": ["test"]}, headers=headers)
        assert response.status_code == 200

        # 5. Access /api/auth/me with valid token -> 200
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["username"] == "testadmin"

    finally:
        # Restore the overrides
        app.dependency_overrides = original_overrides
