<!-- refreshed: 2026-06-09 -->
# Architecture

**Analysis Date:** 2026-06-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Host Application                        │
│   (src/lib/register-email-providers.ts)                      │
│   StaticBundleLoader → register(ctx) at boot                 │
└──────────────┬──────────────────────────────────────────────┘
               │  injects deps / registers capability
               ▼
┌─────────────────────────────────────────────────────────────┐
│              @cinatra-ai/resend-connector                    │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ definition.ts│  │    deps.ts   │  │    register.ts    │  │
│  │ (leaf module)│  │  (DI seam)   │  │  (server entry)   │  │
│  └──────────────┘  └──────┬───────┘  └────────┬──────────┘  │
│                           │                   │              │
│                    ┌──────▼───────────────────▼──────────┐  │
│                    │         config.ts                    │  │
│                    │  (read/write/encrypt/decrypt/status) │  │
│                    └──────────────┬──────────────────────┘  │
│                                   │                         │
│                    ┌──────────────▼──────────────────────┐  │
│                    │           send.ts                    │  │
│                    │  (Resend SDK client, validation)     │  │
│                    └──────────────┬──────────────────────┘  │
│                                   │                         │
│                    ┌──────────────▼──────────────────────┐  │
│                    │       email-connector.ts             │  │
│                    │  (EmailConnector contract impl)      │  │
│                    └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│              Resend API  (resend npm SDK v4)                  │
│              https://api.resend.com                          │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| definition | Leaf module: connector metadata only, no runtime deps | `src/definition.ts` |
| deps | DI seam: host injects DB read/write and encrypt/decrypt at boot | `src/deps.ts` |
| config | Read/write persisted settings, encrypt API key, resolve key precedence, status | `src/config.ts` |
| send | Validate input, instantiate memoized Resend client, call API | `src/send.ts` |
| email-connector | Implements `EmailConnector` contract (send, findReply, getStatus) | `src/email-connector.ts` |
| register | Extension server entry: registers `email-send` capability with host ctx | `src/register.ts` |
| index | Public barrel export for external consumers | `src/index.ts` |

## Pattern Overview

**Overall:** Plugin/Connector with Dependency Injection

**Key Characteristics:**
- The package is an isolated connector plugin consumed by a host Next.js application.
- All host-specific dependencies (DB access, encryption) are injected via `registerResendConnector(deps)` — the connector never imports `@/lib/*` host paths.
- A leaf module (`definition.ts`) is kept import-free from SDK/DB/runtime deps to prevent boot-time TDZ cycles.
- Two registration paths coexist: legacy host-side (`registerEmailConnector(resendEmailConnector)`) and the capability-based SDK extension path (`register(ctx)` via `register.ts`). The host deduplicates by connector ID.

## Layers

**Definition Layer:**
- Purpose: Static metadata describing the connector (ID, name, capabilities flags)
- Location: `src/definition.ts`
- Contains: `RESEND_CONNECTOR_ID` constant, `resendConnectorDefinition` object
- Depends on: `@cinatra-ai/sdk-extensions` (type only)
- Used by: `email-connector.ts`, `register.ts`, `config.ts`, and host registration code

**DI Seam Layer:**
- Purpose: Module-level singleton holding host-injected dependencies
- Location: `src/deps.ts`
- Contains: `ResendConnectorDeps` interface, `registerResendConnector`, `getResendDeps`
- Depends on: Nothing (no external imports)
- Used by: `config.ts` (reads DB and crypto), tests via `_resetResendDepsForTests`

**Config Layer:**
- Purpose: Persisted connector settings — enabled flag, sender address, encrypted API key; status reporting
- Location: `src/config.ts`
- Contains: `getResendConfig`, `saveResendConfig`, `resolveResendApiKey`, `getResendStatus`
- Depends on: `deps.ts`, `definition.ts`
- Used by: `send.ts`, `email-connector.ts`

**Send Layer:**
- Purpose: Construct and dispatch email via the Resend SDK with input validation and header-injection guards
- Location: `src/send.ts`
- Contains: `sendViaResend`, memoized `Resend` client
- Depends on: `config.ts` (for API key), `resend` npm package
- Used by: `email-connector.ts`

**Connector Contract Layer:**
- Purpose: Implements the `EmailConnector` interface contract expected by the host email facade
- Location: `src/email-connector.ts`
- Contains: `resendEmailConnector` object, `buildResendFrom` helper
- Depends on: `definition.ts`, `config.ts`, `send.ts`, `@cinatra-ai/sdk-extensions/email-contract`
- Used by: `register.ts`, host legacy registration

**Registration Entry:**
- Purpose: SDK extension server entry — called by StaticBundleLoader at boot to register the `email-send` capability
- Location: `src/register.ts`
- Contains: `register(ctx: ExtensionHostContext)` function
- Depends on: `email-connector.ts`, `@cinatra-ai/sdk-extensions`
- Used by: Host StaticBundleLoader (dynamic import)

## Data Flow

### Email Send Path

1. Host email facade resolves `email-send` provider → calls `resendEmailConnector.send(msg)` (`src/email-connector.ts:32`)
2. `send()` reads config via `getResendConfig()` to get `fromEmail`/`fromName`/`replyTo` (`src/config.ts:45`)
3. Delegates to `sendViaResend(input)` (`src/send.ts:45`)
4. `sendViaResend` calls `resolveResendApiKey()` — checks encrypted DB override, falls back to `RESEND_API_KEY` env var (`src/config.ts:100`)
5. Validates recipient count (≤50), scans all address fields for header injection (`src/send.ts:56–79`)
6. Retrieves memoized `Resend` client (re-instantiates only on key change) (`src/send.ts:38–43`)
7. Calls `client.emails.send(...)` via Resend REST API, returns `{ id }` (`src/send.ts:83–105`)
8. `email-connector.ts` wraps result into `EmailSendReceipt` with `sentAt` timestamp

### Boot / Registration Path

1. Host StaticBundleLoader dynamic-imports `src/register.ts`
2. Calls `register(ctx)` which calls `ctx.capabilities.registerProvider("email-send", { impl: resendEmailConnector })`
3. Separately, host calls `registerResendConnector(deps)` to inject DB and crypto functions into the module-level singleton in `src/deps.ts`

### Config Update Path

1. Admin UI calls `saveResendConfig(input)` (`src/config.ts:68`)
2. If `input.apiKey` is provided: `deps.encryptSecret(key, "resend.apiKey")` → stores `ciphertext` + `iv` (never plaintext)
3. If `input.clearApiKey`: removes stored ciphertext, restoring env var precedence
4. Writes merged config object via `deps.writeConnectorConfigToDatabase(RESEND_CONNECTOR_ID, next)`

**State Management:**
- Module-level singleton `_deps` in `src/deps.ts` holds injected host dependencies
- Module-level `cachedClient` in `src/send.ts` memoizes the Resend SDK client instance by API key value
- All persistent state lives in the host's database, accessed only through the injected `readConnectorConfigFromDatabase` / `writeConnectorConfigToDatabase` callbacks

## Key Abstractions

**EmailConnector:**
- Purpose: Contract interface from `@cinatra-ai/sdk-extensions/email-contract` that the host email facade depends on
- Examples: `src/email-connector.ts` (implementation), host gmail-connector (sibling implementation)
- Pattern: Strategy pattern — host facade selects provider at runtime via connectorId

**ResendConnectorDeps:**
- Purpose: Narrow interface for host dependencies injected at boot, avoiding direct `@/lib/*` imports
- Examples: `src/deps.ts`
- Pattern: Dependency Injection via module-level singleton registration

## Entry Points

**Public API (npm consumers):**
- Location: `src/index.ts`
- Triggers: `import "@cinatra-ai/resend-connector"`
- Responsibilities: Re-exports definition, deps, config, send, and email-connector surface

**Extension Register Entry:**
- Location: `src/register.ts`
- Triggers: StaticBundleLoader dynamic import + `register(ctx)` call at host boot
- Responsibilities: Registers `email-send` capability with host extension context

## Architectural Constraints

- **Server-only:** All modules (except `definition.ts` and `deps.ts`) import `"server-only"` — connector code never runs in browser bundles.
- **No host path imports:** The connector must never import `@/lib/*` or any host-internal alias. All host surface is injected via `ResendConnectorDeps`.
- **Leaf module isolation:** `definition.ts` imports only type-level SDK deps to prevent TDZ cycles at boot when host registration code and the connector runtime mutually depend on each other.
- **Global state:** Two module-level singletons: `_deps` (`src/deps.ts`) and `cachedClient` (`src/send.ts`). Both are intentional and documented.
- **Circular imports:** Prevented by the `definition.ts` leaf module pattern — `index.ts` and `email-connector.ts` do not create a cycle because `email-connector.ts` imports from `definition.ts` directly, not from `index.ts`.
- **Recipient cap:** Hard-coded `RESEND_MAX_RECIPIENTS = 50` in `src/send.ts` enforcing Resend's per-message limit.
- **API key precedence:** Encrypted DB override takes priority over `RESEND_API_KEY` env var. Fail-closed: if decryption fails, returns `undefined` rather than silently falling back.

## Anti-Patterns

### Importing index.ts from within the package

**What happens:** Internal modules import from `./index` instead of the specific source file.
**Why it's wrong:** Creates a circular dependency — `index.ts` re-exports `email-connector.ts`, which already imports from `definition.ts`. Importing `./index` from inside `email-connector.ts` creates a TDZ cycle.
**Do this instead:** Import from the specific module directly, e.g., `import { RESEND_CONNECTOR_ID } from "./definition"` as shown in `src/email-connector.ts:13`.

### Storing the Resend API key as plaintext in the database

**What happens:** Saving raw key string in connector config.
**Why it's wrong:** Plaintext secrets in the DB are exposed in any DB dump or log.
**Do this instead:** Always call `deps.encryptSecret(key, "resend.apiKey")` and store only `ciphertext` + `iv`, as implemented in `src/config.ts:84–87`.

## Error Handling

**Strategy:** Throw `Error` with descriptive messages; never expose the API key in error output.

**Patterns:**
- Missing API key → throws with instructions to configure (`src/send.ts:48–51`)
- Resend SDK error → re-throws `error.message` without leaking key (`src/send.ts:97–100`)
- Decryption failure → `resolveResendApiKey` returns `undefined` (fail-closed), `getResendStatus` surfaces a human-readable explanation (`src/config.ts:133–139`)
- No recipients / too many recipients → throws before any network call (`src/send.ts:57–66`)
- Header injection detected → throws with field label (`src/send.ts:70–78`)

## Cross-Cutting Concerns

**Logging:** Not implemented — errors are thrown to the host, which owns logging.
**Validation:** Input validation in `sendViaResend` (recipient count, header injection). Config defaults applied in `getResendConfig` and `saveResendConfig`.
**Authentication:** Instance-level API key only (no per-user OAuth). Key resolved in `resolveResendApiKey` with encrypted DB override > env var precedence.

---

*Architecture analysis: 2026-06-09*
