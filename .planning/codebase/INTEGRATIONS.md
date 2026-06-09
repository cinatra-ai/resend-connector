# External Integrations

**Analysis Date:** 2026-06-09

## APIs & External Services

**Transactional Email:**
- Resend (https://resend.com) — sends transactional and platform email (password resets, email verification, change-email)
  - SDK/Client: `resend` ^4.0.1, instantiated in `src/send.ts` as `new Resend(apiKey)`
  - Auth: `RESEND_API_KEY` environment variable, or an AES-256-GCM encrypted in-app override stored in the host database
  - Recipient cap: 50 addresses per message (to + cc + bcc combined), enforced in `src/send.ts`
  - Idempotency: optional `idempotencyKey` supported per call, passed to `client.emails.send()`

## Data Storage

**Databases:**
- No direct database access — all persistence is delegated to the host runtime via the `ResendConnectorDeps` interface (`src/deps.ts`)
  - `readConnectorConfigFromDatabase(connectorId, fallback)` — reads stored config keyed as `connector_config:resend`
  - `writeConnectorConfigToDatabase(connectorId, value)` — persists updated config
  - Host injects these functions via `registerResendConnector(deps)` at boot

**File Storage:**
- Not applicable

**Caching:**
- In-process Resend client memoized by API key value in `src/send.ts` (`cachedClient`) — invalidated when key changes at runtime

## Authentication & Identity

**Auth Provider:**
- Resend uses API key authentication only (`supportsOAuth: false`, `supportsApiKey: true` declared in `src/definition.ts`)
- Key precedence (resolved in `src/config.ts → resolveResendApiKey`):
  1. In-app encrypted override (AES-256-GCM, stored ciphertext+iv in host DB)
  2. `RESEND_API_KEY` environment variable
  - Fail-closed: if an override exists but cannot be decrypted, returns `undefined` — does NOT fall back to env

**Encryption:**
- Host provides `encryptSecret(plaintext, aad)` and `decryptSecret(input, aad)` (AES-256-GCM) via `ResendConnectorDeps`
- Additional Authenticated Data (AAD) tag: `"resend.apiKey"` (binds ciphertext to this field)
- Encryption key: `CINATRA_ENCRYPTION_KEY` (host-managed, not accessed directly by this package)

## Monitoring & Observability

**Error Tracking:**
- Not detected — errors are thrown as typed `Error` instances and bubble to the host caller

**Logs:**
- Not detected — no logging framework used; status is surfaced through `getResendStatus()` in `src/config.ts`

## CI/CD & Deployment

**Hosting:**
- Loaded by Cinatra host via `StaticBundleLoader`; server entry: `./register` (`src/register.ts`)
- Registers `email-send` capability on `ctx.capabilities` at extension activation

**CI Pipeline:**
- `.github/workflows/` directory present; workflow file contents not inspected

## Environment Configuration

**Required env vars:**
- `RESEND_API_KEY` — Resend API key (fallback when no in-app override is set)

**Optional env vars:**
- `CINATRA_ENCRYPTION_KEY` — managed by host; required for in-app API key encryption/decryption

**Secrets location:**
- In-app key override stored encrypted in host database (via injected `writeConnectorConfigToDatabase`)
- `.npmrc` present — note existence only, contents not read

## Webhooks & Callbacks

**Incoming:**
- Not applicable — this connector is send-only; `findReply` in `src/email-connector.ts` always returns `null`

**Outgoing:**
- All outbound calls go to Resend's email API via the `resend` SDK (`client.emails.send()` in `src/send.ts`)

## Internal Cinatra Connector Dependencies

**Runtime dependency:**
- `@cinatra-ai/email-connector` — declared as a required runtime connector dependency in `package.json` under `cinatra.dependencies`
- `@cinatra-ai/sdk-extensions` — peer dep providing `EmailConnector`, `EmailConnectorDefinition`, and `ExtensionHostContext` contracts

---

*Integration audit: 2026-06-09*
