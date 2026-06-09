# Codebase Concerns

**Analysis Date:** 2026-06-09

## Tech Debt

**Idempotency not threaded through platform email facade:**
- Issue: `idempotencyKey` is available on `ResendSendInput` and accepted by `sendViaResend`, but the `EmailConnector.send` contract (`email-connector.ts`) has no slot for it, so platform emails (password reset, verification) are sent without idempotency keys. The code itself documents this as a known gap.
- Files: `src/send.ts` (lines 27–30 comment), `src/email-connector.ts` (lines 44–52)
- Impact: Duplicate transactional emails can be sent if a caller retries a failed send — low risk today because Better Auth tokens are single-use, but no mechanical protection exists if the facade contract widens.
- Fix approach: Add an optional `idempotencyKey` field to the `EmailSystemMessage` contract in `@cinatra-ai/sdk-extensions/email-contract` and thread it through `email-connector.ts` → `sendViaResend`.

**Dual registration path (additive legacy + new capability-based):**
- Issue: `src/register.ts` registers the connector via the new `ctx.capabilities` path, but a legacy host-side registration (`registerEmailConnector(resendEmailConnector)`) in the host's `src/lib/register-email-providers.ts` still runs. Host deduplication by `connectorId` prevents double-registration, but the two paths must stay in sync.
- Files: `src/register.ts` (lines 10–13 comment)
- Impact: Any future refactor that removes one path without the other will silently break email delivery.
- Fix approach: When the host migration to the capability-based path is complete, remove the legacy host-side call and delete the comment.

**Module-level mutable singleton for the Resend client:**
- Issue: `cachedClient` in `src/send.ts` is a module-level mutable variable that caches the Resend SDK client by API key. This is intentional for performance but is global state that is never reset between tests or request cycles.
- Files: `src/send.ts` (lines 37–43)
- Impact: If a test changes the API key and another test runs in the same module scope, the cached client may be stale. Also, in a hot-reload environment the cached client survives across reloads with the old key until the key string changes.
- Fix approach: Expose a `_resetResendClientForTests()` escape hatch (mirroring `_resetResendDepsForTests()` in `deps.ts`), or move the cache into the `ResendConnectorDeps` injection boundary.

**`_resetResendDepsForTests` exported on public surface:**
- Issue: `_resetResendDepsForTests` is exported from `src/index.ts` and is therefore part of the package's public API surface.
- Files: `src/index.ts` (line 8), `src/deps.ts` (lines 36–38)
- Impact: Callers outside the test harness can accidentally call this and break the connector at runtime. The leading underscore is a convention, not enforcement.
- Fix approach: Move the export to a dedicated `src/testing.ts` entry point (e.g. `exports["./testing"]`) that is explicitly documented as test-only, keeping the main `"."` export clean.

## Known Bugs

**`getResendStatus` does not verify the API key against Resend's API:**
- Symptoms: `getResendStatus()` returns `{ status: "connected" }` if a key is present and the config looks valid, but it does not actually make a live API call to confirm the key works.
- Files: `src/config.ts` (lines 119–149)
- Trigger: An admin pastes an invalid or revoked key; UI shows "connected" until an actual send attempt fails.
- Workaround: None. The operator must attempt a real send to discover a bad key.

## Security Considerations

**API key stored as AES-GCM ciphertext — encryption key rotation is a breaking change:**
- Risk: If the host's `CINATRA_ENCRYPTION_KEY` is rotated, all previously stored `apiKeyCiphertext` values become unreadable. `resolveResendApiKey` fails closed (returns `undefined`) but surfaces only a generic "could not be decrypted" message.
- Files: `src/config.ts` (lines 100–117), `src/config.ts` (lines 131–139)
- Current mitigation: Fail-closed behavior is explicit and documented; the error message tells the operator to re-enter the key.
- Recommendations: Consider a key-rotation migration utility that re-encrypts stored connector secrets under the new key before retiring the old one, to avoid service interruption.

**Header-injection guard covers addresses but not `subject`:**
- Risk: `sendViaResend` checks `to`, `cc`, `bcc`, `from`, and `replyTo` for CR/LF characters (lines 70–80 of `src/send.ts`), but `subject` is not checked. Since Resend uses an HTTP API rather than raw SMTP, this is low risk (the SDK/provider sanitizes), but the defense-in-depth is inconsistent.
- Files: `src/send.ts` (lines 70–80)
- Current mitigation: Resend's API transport mitigates raw SMTP header injection.
- Recommendations: Add `subject` to the CR/LF validation loop for consistency.

**`.npmrc` present — may contain registry auth tokens:**
- The `.npmrc` file exists in the repo root. Its contents were not read. If it contains auth tokens they should not be committed to version control.
- Files: `.npmrc`

## Performance Bottlenecks

**No connection pooling or retry logic:**
- Problem: `sendViaResend` creates or reuses a single `Resend` client instance but has no retry logic for transient network errors or Resend API 5xx responses.
- Files: `src/send.ts` (lines 38–43, 83–105)
- Cause: The Resend SDK's default behavior is used with no wrapper for retries or exponential back-off.
- Improvement path: Wrap `client.emails.send(...)` with a simple retry loop (e.g. up to 3 attempts with exponential back-off) for non-4xx errors, or use a library such as `p-retry`.

## Fragile Areas

**Dependency-injection singleton (`_deps`) in `src/deps.ts`:**
- Files: `src/deps.ts`
- Why fragile: If `registerResendConnector(deps)` is never called before any config/send operation, every function throws a non-obvious runtime error. The error message names a specific host file path (`src/lib/register-email-providers.ts`) that may drift from the actual host structure over time.
- Safe modification: Any refactor to the connector boot sequence must call `registerResendConnector` before anything reads `getResendDeps()`.
- Test coverage: No test files were found in the repository; coverage of the boot-order constraint is entirely absent.

**`fromEmail` trimming but no format validation:**
- Files: `src/config.ts` (lines 49, 76), `src/email-connector.ts` (line 37)
- Why fragile: `fromEmail` is `.trim()`-ed but not validated as a well-formed email address. An admin could save a syntactically invalid address; Resend will reject the send at delivery time, not at configuration time.
- Safe modification: Add a basic RFC 5322 format check in `saveResendConfig` before persisting.
- Test coverage: Not tested.

## Scaling Limits

**Resend recipient cap enforced at 50 (to+cc+bcc combined):**
- Current capacity: Hard-capped at 50 recipients per `sendViaResend` call.
- Limit: Any caller passing more than 50 combined recipients receives a thrown error rather than batching.
- Scaling path: If bulk email use cases emerge, implement batching across multiple `sendViaResend` calls, splitting the recipient list into chunks of ≤50.

## Dependencies at Risk

**`resend` SDK pinned to `^4.0.1` (semver-range, no lockfile committed):**
- Risk: A minor-version bump to the Resend SDK could introduce breaking API surface changes that the `^` range would automatically adopt.
- Impact: `client.emails.send` response shape, error format, or options (e.g. `idempotencyKey`) could silently change.
- Migration plan: Pin to an exact version and commit a lockfile, or set up Renovate/Dependabot with PR-based review for SDK updates.

## Missing Critical Features

**No inbound reply detection:**
- Problem: `findReply` in `src/email-connector.ts` unconditionally returns `null`; the connector is send-only.
- Blocks: Any platform feature that needs to detect email replies routed through Resend (e.g. conversation threading) cannot work with this connector. A separate inbound webhook handler (Resend webhooks for inbound email) would be required.

**No live connectivity test / key validation endpoint:**
- Problem: There is no function that makes a test API call to Resend to confirm the key and domain are valid.
- Blocks: Operators cannot verify configuration without sending a real email. This increases misconfiguration dwell time.

## Test Coverage Gaps

**No test files exist in the repository:**
- What's not tested: All logic in `src/config.ts`, `src/send.ts`, `src/email-connector.ts`, and `src/deps.ts` is untested at the source-mirror level.
- Files: Entire `src/` tree
- Risk: Changes to key resolution, encryption/decryption, recipient validation, header-injection guards, and the `buildResendFrom` formatter can regress silently. The CI pipeline skips standalone tests for source mirrors (host-internal peer dependency detected), so regressions are caught only when the monorepo runs the full suite.
- Priority: High — `buildResendFrom` RFC 5322 quoting logic and the `sendViaResend` recipient/injection guards are the most testable and highest-value targets.

---

*Concerns audit: 2026-06-09*
