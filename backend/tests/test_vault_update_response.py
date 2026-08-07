from datetime import datetime

import pytest

from app.schemas import VaultUpdateResponse


def test_vault_update_response_accepts_updated_at() -> None:
    response = VaultUpdateResponse(updated_at=datetime.utcnow())

    assert response.updated_at is not None
