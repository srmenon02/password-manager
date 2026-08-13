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


def test_save_and_list_breach_results(client):
    payload = {
        "email": "breach-user@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "12345",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    register_response = client.post("/api/register", json=payload)
    token = register_response.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    save_response = client.post(
        "/api/vault/breaches",
        headers=headers,
        json={
            "results": [
                {
                    "entry_id": "entry-1",
                    "password_sha1": "A" * 40,
                    "breached": True,
                    "last_seen_count": 42,
                },
                {
                    "entry_id": "entry-2",
                    "password_sha1": "B" * 40,
                    "breached": False,
                    "last_seen_count": 0,
                },
            ]
        },
    )

    assert save_response.status_code == 200
    assert len(save_response.json()["results"]) == 2

    list_response = client.get("/api/vault/breaches", headers=headers)

    assert list_response.status_code == 200
    results = {row["entry_id"]: row for row in list_response.json()["results"]}
    assert results["entry-1"]["breached"] is True
    assert results["entry-1"]["last_seen_count"] == 42
    assert results["entry-2"]["breached"] is False


def test_share_init_finds_recipient_case_insensitive(client):
    sender_payload = {
        "email": "sender@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "12345",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }
    recipient_payload = {
        "email": "recipient@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "67890",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    sender_token = client.post("/api/register", json=sender_payload).json()["token"]
    recipient_token = client.post("/api/register", json=recipient_payload).json()["token"]

    recipient_headers = {"Authorization": f"Bearer {recipient_token}"}
    register_keys_response = client.post(
        "/api/share/keys",
        headers=recipient_headers,
        json={
            "sharing_public_key": make_bytes(64),
            "encrypted_private_key": make_bytes(96),
            "encrypted_private_key_iv": make_bytes(12),
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
        },
    )
    assert register_keys_response.status_code == 204

    sender_headers = {"Authorization": f"Bearer {sender_token}"}
    init_response = client.post(
        "/api/share/init",
        headers=sender_headers,
        json={"recipient_email": "  RECIPIENT@example.com  "},
    )

    assert init_response.status_code == 200
    body = init_response.json()
    assert body["recipient_user_id"]
    assert body["recipient_sharing_public_key"]
