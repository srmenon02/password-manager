import redis
import json

r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
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