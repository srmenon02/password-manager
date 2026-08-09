import base64
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    from app.main import app
    from app.database import Base, engine

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    with TestClient(app) as test_client:
        yield test_client

    Base.metadata.drop_all(bind=engine)


def make_bytes(length: int) -> str:
    return base64.b64encode(b"x" * length).decode("utf-8")


def test_register_and_vault_flow(client):
    payload = {
        "email": "user@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "12345",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    register_response = client.post("/api/register", json=payload)
    assert register_response.status_code == 201
    body = register_response.json()
    assert body["user_id"]
    assert body["token"]

    token = body["token"]
    vault_response = client.get(
        "/api/vault",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert vault_response.status_code == 200
    assert vault_response.json()["encrypted_blob"] == payload["encrypted_blob"]

    update_response = client.put(
        "/api/vault",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "encrypted_blob": make_bytes(64),
            "vault_iv": make_bytes(12),
        },
    )
    assert update_response.status_code == 200
    assert "updated_at" in update_response.json()


def test_login_init_returns_404_for_unknown_email(client):
    response = client.post(
        "/api/login/init",
        json={"email": "missing@example.com", "client_ephemeral_a": make_bytes(32)},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "user_not_found"
