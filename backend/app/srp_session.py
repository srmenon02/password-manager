import json

from app.config import settings

try:
    import redis
except ImportError:  # pragma: no cover - optional dependency fallback
    redis = None


class InMemorySessionStore:
    def __init__(self):
        self._store = {}

    def setex(self, key: str, ttl: int, value: str):
        self._store[key] = value

    def get(self, key: str):
        return self._store.get(key)

    def delete(self, key: str):
        self._store.pop(key, None)


def _build_session_store():
    url = settings.REDIS_URL
    if not url or redis is None:
        return InMemorySessionStore()

    try:
        # Bounded: this ping runs at import, before uvicorn binds the port, so an
        # unreachable Redis would otherwise add its full retry budget to every cold start.
        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        return client
    except Exception:
        return InMemorySessionStore()


r = _build_session_store()
SESSION_TTL_SECONDS = 300

def store_session(session_id: str, user_id: str, user_email: str, A: int, B: int, b: int, v: int, salt: bytes):
    data = {
        "user_id": user_id,
        "user_email": user_email,
        "A": A,
        "B": B,
        "b": b,
        "v": v,
        "salt": salt.hex()
    }
    r.setex(f"srp_session:{session_id}", SESSION_TTL_SECONDS, json.dumps(data))

def get_session(session_id: str):
    raw = r.get(f"srp_session:{session_id}")
    if not raw:
        return None
    data = json.loads(raw)
    data["salt"] = bytes.fromhex(data["salt"])
    return data

def delete_session(session_id: str):
    r.delete(f"srp_session:{session_id}")