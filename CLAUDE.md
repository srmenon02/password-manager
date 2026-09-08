# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

cipher — a zero-knowledge password manager. The server (backend) must never see or be able to reconstruct plaintext master passwords, vault contents, or private keys. All cryptography runs client-side in `frontend/src/crypto/`; the backend only ever stores/relays ciphertext, salts, and SRP verifiers.

Note: `README.md`, `backend/README.md`, `.github/copilot-instructions.md`, and `setup/` describe an earlier/aspirational Node+Express+Prisma+Argon2id design. **The actual implementation is Python/FastAPI on the backend and PBKDF2 (not Argon2id) for key derivation** — trust the code in `backend/app/` and `frontend/src/crypto/` over those docs.

## Stack (actual)

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, react-router-dom. Dev server on port 3000.
- **Backend**: Python + FastAPI + SQLAlchemy 2.0 + Alembic, running on port 8000 (see `backend/app/config.py`).
- **DB**: PostgreSQL (via `docker-compose.yml`); backend tests use SQLite instead (see Testing below).
- **Sessions**: Redis for in-flight SRP login state (`backend/app/srp_session.py`), with an in-memory fallback (`InMemorySessionStore`) when Redis is unreachable — don't assume Redis is always present.
- **Shared types**: `shared/src/types.ts`, imported by the frontend as `@shared/*` (path alias in `frontend/vite.config.ts` / `tsconfig.json`).

## Commands

Root (npm workspaces: `frontend`, `backend`, `shared`):
```bash
npm run dev              # concurrently runs backend + frontend dev servers
npm run dev:frontend     # frontend only (vite, port 3000)
npm run dev:backend      # backend only
npm run build             # build all workspaces
npm test                  # run tests in all workspaces
npm run lint               # lint all workspaces
```

Frontend (`frontend/`):
```bash
npm run dev          # vite dev server
npm run build        # tsc && vite build
npm run test         # vitest
npm run lint         # eslint . --ext ts,tsx --max-warnings 0
npx vitest run src/crypto/__tests__/keyDerivation.test.ts   # single test file
```

Backend (`backend/`, Python venv at `backend/venv/`):
```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # dev server
pytest                                        # all tests
pytest tests/test_api_integration.py -k login # single test / pattern
alembic revision --autogenerate -m "..."      # new migration
alembic upgrade head                          # apply migrations
```

Database (root):
```bash
docker-compose up -d   # Postgres on 5432 + Redis on 6379
```

## Architecture

### Zero-knowledge crypto flow (`frontend/src/crypto/`)
- `keyDerivation.ts` — derives an AES-256-GCM key from the master password via **PBKDF2-SHA256, 100k iterations** (per-user random salt, stored server-side but never the password itself).
- `keyWrapping.ts` — generates a random per-vault AES-256-GCM "vault encryption key" and wraps/unwraps it with the password-derived key. The server stores only the wrapped (encrypted) key, never the raw one.
- `vaultEncryption.ts` — encrypts/decrypts the serialized vault (`VaultData` from `frontend/src/models/vault.ts`) with the vault encryption key, AES-256-GCM, random IV per operation.
- `srp.ts` — SRP-6a client (via `secure-remote-password`) for password-authenticated login without ever sending the password to the server. Matching server side in `backend/app/routers/auth.py` + `backend/app/srp_session.py` (session state keyed in Redis with a 300s TTL).
- `sharingProtocol.ts` — item-level sharing: ephemeral ECDH (P-256) key agreement + HKDF to derive a wrapping key, which wraps a random per-item content-encryption key (AES-256-GCM). AAD is a canonical JSON string binding sender/recipient/item/version/permission (`buildCanonicalAad`) so envelopes can't be replayed against a different item or recipient. Server-side counterpart in `backend/app/routers/share.py`.
- `utils.ts` — base64/ArrayBuffer helpers and random IV/salt generation shared across the above.

Any change to these modules is security-sensitive: preserve random IV-per-encryption, don't let derived/wrapped keys leave the client unencrypted, and keep AAD binding fields in sync between `sharingProtocol.ts` and `share.py` if you touch the sharing envelope shape.

### Backend (`backend/app/`)
- `main.py` — FastAPI app setup, CORS, exception handlers, and `ensure_schema_compatibility()` — a lightweight ad-hoc migration shim that adds missing columns via `ALTER TABLE` before falling back to Alembic migrations. If you add a model column, also add it here or new environments will silently miss it until a real Alembic migration exists.
- `models.py` — SQLAlchemy models: `User`, `Vault` (1:1 with user), `SharedItem`, `BreachResult`, `AuditLogEntry` (hash-chained), `ShareRevocationAudit`. Uses a custom `GUID` type that stores native UUID on Postgres and `String(36)` on SQLite (so tests can run against SQLite).
- `auth.py` — JWT issuance/verification (`get_current_user` FastAPI dependency). Falls back to a hand-rolled HMAC-SHA256 JWT implementation if `python-jose` isn't installed — don't assume `jose` is always present.
- `audit.py` — hash-chained audit log: each `AuditLogEntry.entry_hash` is `SHA256(user_id|action|iso_timestamp|previous_hash|metadata_json)`, chained per-user. `verify_audit_chain()` walks entries and reports the first broken link. Preserve exact field ordering/serialization (`serialize_audit_metadata` sorts keys) if you touch this — it's what verification depends on.
- `routers/` — `auth.py` (register/SRP login), `vault.py` (CRUD on the encrypted blob), `share.py` (ECDH sharing envelopes, revocation), `audit.py` (list + verify chain).
- `services/hibp_client.py` + `services/breach_checker.py` — Have I Been Pwned breach checking using k-anonymity (SHA-1 prefix only sent to HIBP). Runs on a 24h APScheduler interval in `main.py`'s lifespan (scheduler is skipped entirely if `apscheduler` isn't installed).
- `config.py` — `pydantic-settings` reading `backend/.env` (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, etc.).

### Frontend (`frontend/src/`)
- `context/VaultContext.tsx` — holds the unlocked vault session in memory (vault data, vault key, JWT) and rehydrates it after a page reload. Decrypted vault data is never persisted; the vault key is persisted only via `crypto/keyStorage.ts`, which re-imports it as a **non-extractable** `CryptoKey` in IndexedDB so `exportKey` throws on it. The record is keyed by a random handle in `sessionStorage` (tab-scoped, cleared on tab close) and carries a 30-minute rolling idle expiry. Raw key bytes must never reach localStorage/sessionStorage — `src/tests/uiRegressions.test.ts` guards both properties.
- `services/api.ts` — typed fetch wrapper against the backend, using `@shared` types for request/response shapes.
- `pages/` — one component per route, wired up in `App.tsx` (`/`, `/register`, `/login`, `/vault`, `/vault/sharing`, `/vault/activity`, `/vault/breach`, `/generator`).
- `models/vault.ts` — vault entry construction/serialization used by both the crypto layer and the UI.

### Testing conventions
- Backend tests (`backend/tests/`) spin up a fresh SQLite DB per test via `monkeypatch.setenv("DATABASE_URL", ...)` and drop/recreate all tables — no shared state between tests, no dependency on Postgres/Redis being up.
- Frontend crypto modules each have a matching `__tests__/*.test.ts` with known-vector/round-trip assertions (`frontend/src/crypto/__tests__/`).

## Conventions
- No code comments unless documenting a genuinely non-obvious constraint (e.g. crypto parameter choices); this is an explicit project preference, not a general style note.
- Keep responses concise — this repo's Copilot instructions (`.github/copilot-instructions.md`) call for minimal, bullet-point output over prose, and that preference applies here too.

## CI/CD and contribution rules

### Branch strategy
- `main` is protected. **Never push directly to `main`** — every change lands via pull request.
- Branch from `main` as `feature/*`, `fix/*`, or `chore/*`.
- Squash-merge; delete the branch after merge.

### Required status checks before merge
All three must pass on the PR head commit (`.github/workflows/ci.yml`, stages run in order, each `needs` the previous):
1. `lint` — ESLint on `frontend` and `shared`, Ruff on `backend`.
2. `test` — vitest (frontend) + pytest (backend).
3. `build` — `tsc && vite build`, plus a backend import-check.

`Claude Code` and `Claude Code Review` (`claude.yml`, `claude-code-review.yml`) are advisory, not required checks.

### Lint / test / coverage rules
- Lint runs `eslint . --report-unused-disable-directives --max-warnings 0` in both TS workspaces. **A warning is a failure** — don't add `eslint-disable` to get green; fix the code or justify the disable in the PR.
- Backend lint is `ruff check app tests` from `backend/`, configured in `backend/ruff.toml`. On top of Ruff's defaults it enables **`T20` (flake8-print)**: `print()` is banned in `app/`. This is a security rule, not a style one — the SRP handler previously printed the derived session key `K` and the user's email to stdout on every login. Use the logger and never log key material, proofs, or plaintext. Don't `# noqa` a T20; delete the print.
- The backend build stage runs `python -c "import app.main"` with throwaway `DATABASE_URL`/`JWT_SECRET` values, so an import-time error in any router fails CI even when no test covers it.
- Frontend tests: `npx vitest run --coverage` from `frontend/`. Every module in `src/crypto/` keeps a matching `__tests__/*.test.ts` with round-trip or known-vector assertions; `src/tests/uiRegressions.test.ts` guards the non-extractable-key and no-raw-key-in-web-storage invariants and must never be weakened.
- Backend tests: `pytest -q --cov=app --cov-report=term-missing --cov-fail-under=70` from `backend/`. **Total backend coverage below 70% fails CI.** Raise the gate as coverage improves; never lower it to make a PR pass.
- Frontend coverage is reported to the run summary but not yet gated. New code under `src/crypto/` is expected to ship with tests regardless.
- Both coverage reports are posted to the GitHub Actions job summary on every run, pass or fail.

### Secret management
- **Error responses must not carry internal detail.** `HTTPException` bodies get a static message; the exception goes to `logger.exception()` instead. Never interpolate `str(e)` into a response — SQLAlchemy and base64 errors quote back query fragments and input bytes.
- **No hardcoded keys, tokens, passwords, or connection strings in the repo** — not in source, not in workflow YAML, not in test fixtures.
- Runtime config comes from `backend/.env` locally (gitignored) and from **GitHub Secrets** in CI/CD. Reference them only as `${{ secrets.NAME }}`.
- Claude's workflows authenticate with **`CLAUDE_CODE_OAUTH_TOKEN`** (repo secret, set by `/install-github-app`) — not an `ANTHROPIC_API_KEY`. It is consumed only by `claude.yml` and `claude-code-review.yml`.
- `ci.yml` needs no secrets — if a step ever appears to need one, that step probably belongs in a separate, environment-gated workflow.
- Workflow permissions are least-privilege: `contents: read` at the top level, with `pull-requests: write` granted only to the job that actually comments on PRs.
- Pin third-party actions to a specific version tag (e.g. `anthropics/claude-code-action@v1.0.217`), never `@latest` or `@main`.
