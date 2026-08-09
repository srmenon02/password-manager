"""
JWT authentication utilities and dependencies for protected routes.
"""
import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID

try:
    from jose import JWTError, jwt
except ImportError:  # pragma: no cover - fallback for local/test environments
    class JWTError(Exception):
        pass

    class _JwtFallback:
        @staticmethod
        def _b64url_encode(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

        @staticmethod
        def _b64url_decode(data: str) -> bytes:
            padding = "=" * (-len(data) % 4)
            return base64.urlsafe_b64decode(data + padding)

        @classmethod
        def encode(cls, payload: dict, key: str, algorithm: str = "HS256") -> str:
            header = {"alg": algorithm, "typ": "JWT"}
            header_segment = cls._b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
            payload_segment = cls._b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
            signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
            signature = hmac.new(key.encode("utf-8"), signing_input, hashlib.sha256).digest()
            return f"{header_segment}.{payload_segment}.{cls._b64url_encode(signature)}"

        @classmethod
        def decode(cls, token: str, key: str, algorithms: Optional[list[str]] = None) -> dict:
            if not token or token.count(".") != 2:
                raise JWTError("Invalid token")
            header_segment, payload_segment, signature_segment = token.split(".")
            signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
            expected_signature = cls._b64url_encode(hmac.new(key.encode("utf-8"), signing_input, hashlib.sha256).digest())
            if not hmac.compare_digest(signature_segment, expected_signature):
                raise JWTError("Signature mismatch")
            payload_bytes = cls._b64url_decode(payload_segment)
            payload = json.loads(payload_bytes.decode("utf-8"))
            exp = payload.get("exp")
            if exp is not None and datetime.now(timezone.utc).timestamp() >= float(exp):
                raise JWTError("Token expired")
            return payload

    jwt = _JwtFallback()

from app.config import settings
from app.database import get_db
from app.models import User

# JWT configuration
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Bearer token scheme
security = HTTPBearer()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Payload to encode in the token (typically {"sub": user_id})
        expires_delta: Token expiration time (default: 24 hours)
    
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": int(expire.timestamp())})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token payload
    
    Raises:
        HTTPException: If token is invalid or expired
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise credentials_exception


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user from JWT token.
    
    Args:
        credentials: Bearer token from Authorization header
        db: Database session
    
    Returns:
        User object if authentication succeeds
    
    Raises:
        HTTPException: If token is invalid or user not found
    """
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    # Query user from database
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )
    
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user
