import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _cors_regex(monkeypatch, environment, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/cors.db")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ENVIRONMENT", environment)
    monkeypatch.setenv("CORS_ORIGINS", "https://cipher.example.com")
    for module in ("app.main", "app.config"):
        sys.modules.pop(module, None)
    main = importlib.import_module("app.main")
    cors = [mw for mw in main.app.user_middleware if "CORS" in str(mw)][0]
    return cors.kwargs.get("allow_origin_regex")


@pytest.mark.parametrize("environment", ["development", "test"])
def test_loopback_origins_allowed_outside_production(monkeypatch, environment, tmp_path) -> None:
    assert _cors_regex(monkeypatch, environment, tmp_path) is not None


def test_loopback_origins_rejected_in_production(monkeypatch, tmp_path) -> None:
    assert _cors_regex(monkeypatch, "production", tmp_path) is None
