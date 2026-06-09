# Codebase Structure

**Analysis Date:** 2026-06-09

## Directory Layout

```
resend-connector/
├── src/                    # All TypeScript source
│   ├── index.ts            # Public barrel export
│   ├── definition.ts       # Connector metadata (leaf module, no heavy deps)
│   ├── deps.ts             # DI seam — host injects DB + crypto at boot
│   ├── config.ts           # Persisted config read/write, API key resolution, status
│   ├── send.ts             # Resend SDK client, validation, email dispatch
│   ├── email-connector.ts  # EmailConnector contract implementation
│   └── register.ts         # Extension server entry (capability registration)
├── .github/
│   └── workflows/
│       ├── ci.yml          # CI pipeline
│       └── release.yml     # Release pipeline
├── package.json            # Package manifest + cinatra connector metadata
├── tsconfig.json           # TypeScript configuration
├── .npmrc                  # npm registry configuration (existence noted; contents not read)
├── LICENSE                 # Apache-2.0
└── README.md               # Package documentation
```

## Directory Purposes

**`src/`:**
- Purpose: All production TypeScript source files
- Contains: Connector logic, DI seam, config management, Resend SDK wrapper, EmailConnector impl
- Key files: `src/index.ts` (public API), `src/register.ts` (server entry), `src/email-connector.ts` (contract impl)

**`.github/workflows/`:**
- Purpose: GitHub Actions CI and release automation
- Contains: `ci.yml`, `release.yml`

## Key File Locations

**Entry Points:**
- `src/index.ts`: Public npm package surface — all exports for external consumers
- `src/register.ts`: Extension SDK server entry — called by host at boot via `register(ctx)`

**Configuration:**
- `package.json`: Declares `cinatra` manifest block with `kind: connector`, `serverEntry: ./register`, `requestedHostPorts: [capabilities]`, and dependency on `@cinatra-ai/email-connector`
- `tsconfig.json`: TypeScript compiler settings
- `.npmrc`: npm registry auth (secrets — existence only)

**Core Logic:**
- `src/definition.ts`: Connector ID and metadata (import this, not `./index`, to avoid TDZ cycles)
- `src/deps.ts`: `ResendConnectorDeps` interface and boot-time injection
- `src/config.ts`: `getResendConfig`, `saveResendConfig`, `resolveResendApiKey`, `getResendStatus`
- `src/send.ts`: `sendViaResend` — validation + Resend SDK call
- `src/email-connector.ts`: `resendEmailConnector` object + `buildResendFrom` helper

**Testing:**
- Not detected in repository (no `*.test.*` or `*.spec.*` files found; vitest is configured as the test runner in `package.json`)

## Naming Conventions

**Files:**
- `kebab-case.ts` for all source files (e.g., `email-connector.ts`, `send.ts`)
- No barrel index files inside subdirectories — only one `index.ts` at `src/` root

**Functions:**
- camelCase for all functions and exports (e.g., `sendViaResend`, `getResendConfig`, `buildResendFrom`)
- `get*` prefix for read-only accessors (`getResendConfig`, `getResendDeps`, `getResendStatus`)
- `save*` prefix for write operations (`saveResendConfig`)
- `register*` prefix for DI registration functions (`registerResendConnector`)
- `_reset*ForTests` prefix for test-internal reset helpers (`_resetResendDepsForTests`)

**Types/Interfaces:**
- PascalCase (e.g., `ResendConnectorDeps`, `ResendConfig`, `ResendSendInput`, `ResendSendResult`)
- Input types suffixed with `Input` (e.g., `ResendSendInput`, `SaveResendConfigInput`)
- Internal/stored types prefixed with `Stored` (e.g., `StoredResendConfig`)

**Constants:**
- SCREAMING_SNAKE_CASE for module-level constants (e.g., `RESEND_CONNECTOR_ID`, `RESEND_MAX_RECIPIENTS`, `DEFAULT_FROM_EMAIL`, `API_KEY_AAD`)

## Where to Add New Code

**New config field (e.g., adding a new sender option):**
- Add to `StoredResendConfig` type in `src/config.ts`
- Add to `ResendConfig` public type in `src/config.ts`
- Update `getResendConfig` and `saveResendConfig` with defaults and merge logic
- Export updated types from `src/index.ts` if they need to be public

**New send capability (e.g., attachments):**
- Extend `ResendSendInput` in `src/send.ts`
- Add validation logic in `sendViaResend`
- Update `EmailSystemMessage` usage in `src/email-connector.ts:send()`

**New status check or diagnostic:**
- Add logic to `getResendStatus` in `src/config.ts`

**New exported utility:**
- Implement in the appropriate module (`config.ts`, `send.ts`, or `email-connector.ts`)
- Re-export from `src/index.ts`

**Tests:**
- Place test files as `src/*.test.ts` co-located with the module under test
- Use `_resetResendDepsForTests()` from `src/deps.ts` to reset the DI singleton between tests

## Special Directories

**`.github/`:**
- Purpose: CI/CD workflow definitions
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning documents (architecture maps, phase plans)
- Generated: Yes (by GSD tooling)
- Committed: Depends on team convention

---

*Structure analysis: 2026-06-09*
