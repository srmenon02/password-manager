import hmac
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import base64
import uuid
import secrets
import hashlib
from datetime import timedelta

try:
    import srp
except ModuleNotFoundError:  # pragma: no cover - fallback for local testing
    srp = None

from app.database import get_db
from app.audit import append_audit_event
from app.models import User, Vault
from app.schemas import (
    RegisterRequest, RegisterResponse,
    LoginInitRequest, LoginInitResponse,
    LoginVerifyRequest, LoginVerifyResponse,
    ErrorResponse
)
from app.auth import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.srp_session import delete_session, store_session, get_session

try:
    from srp._pysrp import get_ng
except ModuleNotFoundError:  # pragma: no cover - fallback for local testing
    def get_ng(*_args, **_kwargs):
        return 0, 0

router = APIRouter()

if srp is None:
    N = 0
    g = 0
else:
    N, g = get_ng(srp.NG_2048, None, None)
N_BYTES = 256


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        409: {"model": ErrorResponse, "description": "Email already registered"}
    }
)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user with SRP authentication and encrypted vault.
    
    Creates:
    - User account with email, salt, and SRP verifier
    - Initial encrypted vault with two-tier key wrapping
    
    The client must:
    1. Derive key from password using PBKDF2 (never send password!)
    2. Generate vault_encryption_key
    3. Wrap vault_encryption_key with derived key → protected_key
    4. Encrypt vault data with vault_encryption_key → encrypted_blob
    5. Generate SRP verifier for authentication
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "email_exists", "message": "Email already registered"}
        )
    
    # Decode base64 fields to binary
    try:
        salt_bytes = base64.b64decode(request.salt)
        protected_key_bytes = base64.b64decode(request.protected_key)
        protected_key_iv_bytes = base64.b64decode(request.protected_key_iv)
        encrypted_blob_bytes = base64.b64decode(request.encrypted_blob)
        vault_iv_bytes = base64.b64decode(request.vault_iv)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_encoding", "message": f"Invalid base64 encoding: {str(e)}"}
        )
    
    # Validate field sizes
    if len(salt_bytes) != 16:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_salt", "message": "Salt must be 16 bytes"}
        )
    if len(protected_key_bytes) != 48:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_protected_key", "message": "Protected key must be 48 bytes (32-byte key + 16-byte GCM tag)"}
        )
    if len(protected_key_iv_bytes) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_iv", "message": "Protected key IV must be 12 bytes"}
        )
    if len(vault_iv_bytes) != 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_iv", "message": "Vault IV must be 12 bytes"}
        )
    
    # Create user
    try:
        new_user = User(
            id=uuid.uuid4(),
            email=request.email,
            salt=salt_bytes,
            auth_verifier=request.auth_verifier
        )
        db.add(new_user)
        db.flush()  # Get user ID before creating vault
        
        # Create vault
        new_vault = Vault(
            id=uuid.uuid4(),
            user_id=new_user.id,
            protected_key=protected_key_bytes,
            protected_key_iv=protected_key_iv_bytes,
            encrypted_blob=encrypted_blob_bytes,
            vault_iv=vault_iv_bytes
        )
        db.add(new_vault)
        append_audit_event(db, user_id=str(new_user.id), action="user_registered")
        db.commit()
        db.refresh(new_user)
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "email_exists", "message": "Email already registered"}
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "database_error", "message": f"Failed to create user: {str(e)}"}
        )
    
    # Create JWT token
    access_token = create_access_token(
        data={"sub": str(new_user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return RegisterResponse(
        user_id=str(new_user.id),
        token=access_token
    )


@router.post(
    "/login/init",
    response_model=LoginInitResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Email not found"}
    }
)
async def login_init(request: LoginInitRequest, db: Session = Depends(get_db)):
    N_BYTES = 256
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Email not found"}
        )

    if srp is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "srp_unavailable", "message": "SRP support is unavailable in this environment"}
        )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "Email not found"}
        )

    session_id = str(uuid.uuid4())

    b = secrets.randbelow(N)
    v = int(user.auth_verifier)
    N_buf = N.to_bytes(N_BYTES, 'big')
    g_buf = g.to_bytes((g.bit_length() + 7) // 8, 'big')
    k = int.from_bytes(hashlib.sha256(N_buf + g_buf).digest(), 'big')
    B = (k * v + (pow(g, b, N) % N)) % N
    

    store_session(
        session_id = session_id,
        user_id = str(user.id),
        user_email = user.email,
        A = request.client_ephemeral_a,
        B = B,
        b = b,
        v = v,
        salt = user.salt
    )
    
    return LoginInitResponse(
        session_id=session_id,
        salt=base64.b64encode(user.salt).decode('utf-8'),
        server_ephemeral_b=base64.b64encode(B.to_bytes(N_BYTES, 'big')).decode('utf-8')
    )


@router.post(
    "/login/verify",
    response_model=LoginVerifyResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid proof (wrong password)"},
        404: {"model": ErrorResponse, "description": "Session expired or invalid"}
    }
)
async def login_verify(request: LoginVerifyRequest, db: Session = Depends(get_db)):
    if srp is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "srp_unavailable", "message": "SRP support is unavailable in this environment"}
        )

    session = get_session(request.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "session_expired", "message": "Session expired or invalid"}
        )
    
    A = int.from_bytes(base64.b64decode(session["A"]), 'big')
    B = session["B"]
    A_buf = A.to_bytes(N_BYTES, 'big')
    B_buf = B.to_bytes(N_BYTES, 'big')
    u = int.from_bytes(hashlib.sha256(A_buf + B_buf).digest(), 'big')
    v = session["v"]
    b = session["b"]
    S = pow(A * pow(v, u, N), b, N)
    K = hashlib.sha256(S.to_bytes(N_BYTES, 'big')).digest()

    I = session["user_email"]
    s = session["salt"]
    N_buf = N.to_bytes(N_BYTES, 'big')
    g_buf = g.to_bytes((g.bit_length() + 7) // 8, 'big')

    H_N = hashlib.sha256(N_buf).digest()
    H_g = hashlib.sha256(g_buf).digest()
    H_I = hashlib.sha256(I.encode('utf-8')).digest()
    H_xor = bytes(a ^ b for a, b in zip(H_N, H_g))
    M1_check = hashlib.sha256(H_xor + H_I + s + A_buf + B_buf + K).digest()
    
    M1_client = base64.b64decode(request.client_proof_m1)
    print('server K:', K.hex())
    print('server M1_check:', M1_check.hex())
    print('email used:', repr(I))
    if not hmac.compare_digest(M1_check, M1_client):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_proof", "message": "Invalid proof (wrong password)"}
        )
    M2 = hashlib.sha256(A_buf + M1_check + K).digest()

    delete_session(request.session_id)
    
    access_token = create_access_token(
        data={"sub": session["user_id"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    append_audit_event(db, user_id=session["user_id"], action="user_logged_in", metadata={"method": "srp"})
    db.commit()
    
    return LoginVerifyResponse(
        server_proof_m2=base64.b64encode(M2).decode('utf-8'),
        token=access_token
    )
