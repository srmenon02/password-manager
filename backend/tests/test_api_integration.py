import base64
import importlib
import os
import sys
from pathlib import Path

from sqlalchemy import text

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


def test_share_create_bootstraps_legacy_sqlite_schema(monkeypatch, tmp_path):
    db_path = tmp_path / "legacy-share.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    sqlite_db = f"sqlite:///{db_path}"
    import sqlalchemy
    engine = sqlalchemy.create_engine(sqlite_db)

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE users (
                id VARCHAR(36) NOT NULL,
                email VARCHAR NOT NULL,
                salt BLOB NOT NULL,
                auth_verifier TEXT NOT NULL,
                public_key TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id)
            )
        """))
        connection.execute(text("""
            CREATE TABLE shared_items (
                id VARCHAR(36) NOT NULL,
                from_user_id VARCHAR(36) NOT NULL,
                to_user_id VARCHAR(36) NOT NULL,
                encrypted_item BLOB NOT NULL,
                sender_ephemeral_public_key TEXT,
                wrapped_cek BLOB,
                wrapped_cek_iv BLOB,
                payload_iv BLOB,
                aad TEXT,
                algorithm VARCHAR,
                shared_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                FOREIGN KEY(from_user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY(to_user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """))

    sys.modules.pop("app.main", None)
    sys.modules.pop("app.database", None)

    database_module = importlib.import_module("app.database")
    main_module = importlib.import_module("app.main")

    assert database_module.engine.url.database.endswith("legacy-share.db")

    with TestClient(main_module.app) as test_client:
        sender = test_client.post(
            "/api/register",
            json={
                "email": "legacy-sender@example.com",
                "salt": make_bytes(16),
                "auth_verifier": "12345",
                "protected_key": make_bytes(48),
                "protected_key_iv": make_bytes(12),
                "encrypted_blob": make_bytes(32),
                "vault_iv": make_bytes(12),
            },
        )
        recipient = test_client.post(
            "/api/register",
            json={
                "email": "legacy-recipient@example.com",
                "salt": make_bytes(16),
                "auth_verifier": "67890",
                "protected_key": make_bytes(48),
                "protected_key_iv": make_bytes(12),
                "encrypted_blob": make_bytes(32),
                "vault_iv": make_bytes(12),
            },
        )
        assert sender.status_code == 201
        assert recipient.status_code == 201

        recipient_token = recipient.json()["token"]
        register_keys = test_client.post(
            "/api/share/keys",
            headers={"Authorization": f"Bearer {recipient_token}"},
            json={
                "sharing_public_key": make_bytes(64),
                "encrypted_private_key": make_bytes(96),
                "encrypted_private_key_iv": make_bytes(12),
                "algorithm": "ECDH-P256-HKDF-AES256GCM",
            },
        )
        assert register_keys.status_code == 204

        share_response = test_client.post(
            "/api/share",
            headers={"Authorization": f"Bearer {sender.json()['token']}"},
            json={
                "to_user_id": recipient.json()["user_id"],
                "sender_ephemeral_public_key": make_bytes(64),
                "wrapped_cek": make_bytes(48),
                "wrapped_cek_iv": make_bytes(12),
                "payload_ciphertext": make_bytes(32),
                "payload_iv": make_bytes(12),
                "aad": '{"from_user_id": "' + sender.json()["user_id"] + '", "to_user_id": "' + recipient.json()["user_id"] + '", "item_id": "entry-1", "version": 1, "permission": "read_write"}',
                "algorithm": "ECDH-P256-HKDF-AES256GCM",
                "version": 1,
                "permission": "read_write",
            },
        )

        assert share_response.status_code == 201, share_response.text


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

    audit_response = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert audit_response.status_code == 200
    actions = [entry["action"] for entry in audit_response.json()["entries"]]
    assert "vault_updated" in actions
    assert "user_registered" in actions

    verify_response = client.get(
        "/api/audit/verify",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert verify_response.status_code == 200
    assert verify_response.json()["is_valid"] is True


def test_login_init_returns_404_for_unknown_email(client):
    response = client.post(
        "/api/login/init",
        json={"email": "missing@example.com", "client_ephemeral_a": make_bytes(32)},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "user_not_found"


def test_share_preflight_allows_localhost_ports(client):
    response = client.options(
        "/api/share",
        headers={
            "Origin": "http://localhost:4567",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:4567"


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


def test_share_keys_endpoint_returns_encrypted_private_key_for_recipient(client):
    recipient_payload = {
        "email": "share-recipient-keys@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "67890",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    recipient_response = client.post("/api/register", json=recipient_payload)
    recipient_token = recipient_response.json()["token"]

    register_keys_response = client.post(
        "/api/share/keys",
        headers={"Authorization": f"Bearer {recipient_token}"},
        json={
            "sharing_public_key": make_bytes(64),
            "encrypted_private_key": make_bytes(96),
            "encrypted_private_key_iv": make_bytes(12),
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
        },
    )
    assert register_keys_response.status_code == 204

    keys_response = client.get(
        "/api/share/keys",
        headers={"Authorization": f"Bearer {recipient_token}"},
    )
    assert keys_response.status_code == 200
    assert keys_response.json()["sharing_public_key"]
    assert keys_response.json()["encrypted_private_key"]
    assert keys_response.json()["encrypted_private_key_iv"]
    assert keys_response.json()["algorithm"] == "ECDH-P256-HKDF-AES256GCM"


def test_share_create_rejects_invalid_permission_and_keeps_permission_in_inbox(client):
    sender_payload = {
        "email": "share-sender@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "12345",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }
    recipient_payload = {
        "email": "share-recipient@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "67890",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    sender_response = client.post("/api/register", json=sender_payload)
    recipient_response = client.post("/api/register", json=recipient_payload)
    sender_id = sender_response.json()["user_id"]
    recipient_id = recipient_response.json()["user_id"]
    recipient_token = recipient_response.json()["token"]

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

    invalid_response = client.post(
        "/api/share",
        headers={"Authorization": f"Bearer {sender_response.json()['token']}"},
        json={
            "to_user_id": recipient_id,
            "sender_ephemeral_public_key": make_bytes(64),
            "wrapped_cek": make_bytes(48),
            "wrapped_cek_iv": make_bytes(12),
            "payload_ciphertext": make_bytes(32),
            "payload_iv": make_bytes(12),
            "aad": '{"from_user_id": "' + sender_id + '", "to_user_id": "' + recipient_id + '", "item_id": "entry-1", "version": 1, "permission": "readonly"}',
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
            "version": 1,
            "permission": "readonly",
        },
    )
    assert invalid_response.status_code == 422

    valid_response = client.post(
        "/api/share",
        headers={"Authorization": f"Bearer {sender_response.json()['token']}"},
        json={
            "to_user_id": recipient_id,
            "sender_ephemeral_public_key": make_bytes(64),
            "wrapped_cek": make_bytes(48),
            "wrapped_cek_iv": make_bytes(12),
            "payload_ciphertext": make_bytes(32),
            "payload_iv": make_bytes(12),
            "aad": '{"from_user_id": "' + sender_id + '", "to_user_id": "' + recipient_id + '", "item_id": "entry-1", "item_label": "Example / user", "version": 1, "permission": "read_only"}',
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
            "version": 1,
            "permission": "read_only",
        },
    )
    assert valid_response.status_code == 201

    inbox_response = client.get(
        "/api/share/shared-with-me",
        headers={"Authorization": f"Bearer {recipient_token}"},
    )
    assert inbox_response.status_code == 200
    assert inbox_response.json()["items"][0]["permission"] == "read_only"


def test_recipient_can_delete_shared_item_from_inbox(client):
    sender_payload = {
        "email": "delete-share-sender@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "12345",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }
    recipient_payload = {
        "email": "delete-share-recipient@example.com",
        "salt": make_bytes(16),
        "auth_verifier": "67890",
        "protected_key": make_bytes(48),
        "protected_key_iv": make_bytes(12),
        "encrypted_blob": make_bytes(32),
        "vault_iv": make_bytes(12),
    }

    sender_response = client.post("/api/register", json=sender_payload)
    recipient_response = client.post("/api/register", json=recipient_payload)
    sender_id = sender_response.json()["user_id"]
    sender_token = sender_response.json()["token"]
    recipient_id = recipient_response.json()["user_id"]
    recipient_token = recipient_response.json()["token"]

    register_keys_response = client.post(
        "/api/share/keys",
        headers={"Authorization": f"Bearer {recipient_token}"},
        json={
            "sharing_public_key": make_bytes(64),
            "encrypted_private_key": make_bytes(96),
            "encrypted_private_key_iv": make_bytes(12),
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
        },
    )
    assert register_keys_response.status_code == 204

    create_response = client.post(
        "/api/share",
        headers={"Authorization": f"Bearer {sender_token}"},
        json={
            "to_user_id": recipient_id,
            "sender_ephemeral_public_key": make_bytes(64),
            "wrapped_cek": make_bytes(48),
            "wrapped_cek_iv": make_bytes(12),
            "payload_ciphertext": make_bytes(32),
            "payload_iv": make_bytes(12),
            "aad": '{"from_user_id": "' + sender_id + '", "to_user_id": "' + recipient_id + '", "item_id": "entry-1", "version": 1, "permission": "read_only"}',
            "algorithm": "ECDH-P256-HKDF-AES256GCM",
            "version": 1,
            "permission": "read_only",
        },
    )
    assert create_response.status_code == 201
    share_id = create_response.json()["share_id"]

    delete_response = client.delete(
        f"/api/share/{share_id}",
        headers={"Authorization": f"Bearer {recipient_token}"},
    )
    assert delete_response.status_code == 204

    inbox_response = client.get(
        "/api/share/shared-with-me",
        headers={"Authorization": f"Bearer {recipient_token}"},
    )
    assert inbox_response.status_code == 200
    assert inbox_response.json()["items"] == []

    audit_response = client.get(
        "/api/audit",
        headers={"Authorization": f"Bearer {recipient_token}"},
    )
    assert audit_response.status_code == 200
    assert audit_response.json()["entries"][0]["action"] == "share_revoked"
