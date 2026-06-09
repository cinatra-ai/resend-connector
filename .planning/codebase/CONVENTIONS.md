# Coding Conventions

**Analysis Date:** 2026-06-09

## Naming Patterns

**Files:**
- `kebab-case.ts` for all source files: `email-connector.ts`, `config.ts`, `send.ts`, `deps.ts`
- Entry-point files named after their role: `index.ts`, `register.ts`

**Functions:**
- `camelCase` for all exported and internal functions: `getResendConfig`, `saveResendConfig`, `sendViaResend`, `buildResendFrom`, `resolveResendApiKey`
- Getter functions prefixed with `get`: `getResendConfig`, `getResendDeps`, `getResendStatus`, `getClient`
- Setter/writer functions prefixed with `save` or `write`: `saveResendConfig`, `writeConnectorConfigToDatabase`
- Internal-only test helpers prefixed with `_`: `_resetResendDepsForTests`

**Variables:**
- `SCREAMING_SNAKE_CASE` for module-level constants: `RESEND_CONNECTOR_ID`, `RESEND_MAX_RECIPIENTS`, `API_KEY_AAD`, `DEFAULT_FROM_EMAIL`, `DEFAULT_FROM_NAME`
- `camelCase` for local variables and function parameters: `apiKey`, `cachedClient`, `fromName`, `fromEmail`

**Types:**
- `PascalCase` for exported types and interfaces: `ResendConfig`, `ResendSendInput`, `ResendSendResult`, `ResendConnectorDeps`, `SaveResendConfigInput`
- `Stored` prefix for internal DB-persisted shape types not exported: `StoredResendConfig`
- `type` keyword preferred over `interface` for object shapes

## Code Style

**Formatting:**
- No formatter config file detected (no `.prettierrc`, `biome.json`, etc. in repo root)
- TypeScript strict mode enabled in `tsconfig.json` with `"strict": true`
- `"noImplicitAny": false` overrides strict's implicit-any rule

**Linting:**
- No ESLint config detected
- `verbatimModuleSyntax: true` in tsconfig enforces explicit `import type` for type-only imports

## Import Organization

**Order:**
1. Node built-in or side-effect imports (`"server-only"`)
2. Third-party SDK imports (`"resend"`)
3. Internal relative imports (`"./definition"`, `"./config"`, `"./send"`)

**Pattern:**
- `"server-only"` guard is placed as the very first import in every `src/` module except `deps.ts` and `register.ts`
- `import type` used for type-only imports (`import type { EmailConnector, ... }`)
- Imports from the leaf module `./definition` are preferred over `./index` inside the package to avoid TDZ circular-import cycles (pattern is explicitly documented in code comments)

**Path Aliases:**
- None — this is a standalone package without monorepo `@/` aliases (by design, documented in comments)

## Error Handling

**Patterns:**
- Synchronous functions throw `new Error("...")` with descriptive, operator-facing messages
- Async functions (`sendViaResend`) also throw `new Error(...)` with context — never swallow errors silently
- Fail-closed pattern for decryption: if the stored encrypted key cannot be decrypted, return `undefined` rather than falling back to the env key — explicitly documented in `src/config.ts`
- Try/catch used sparingly and only at the decrypt boundary in `resolveResendApiKey` (`src/config.ts`)
- SDK error surface: Resend SDK's `{ data, error }` tuple checked and thrown as a plain `Error` — API key never included in thrown messages

## Logging

**Framework:** None detected — no logger imports anywhere in `src/`

**Patterns:**
- No runtime logging calls; error information is surfaced through thrown `Error` messages
- CI/build scripts use `console.error` only inside inline Node scripts in `.github/workflows/ci.yml`

## Comments

**When to Comment:**
- Module-level comment blocks explain the architectural role and non-obvious constraints of each file
- Security decisions (fail-closed, header-injection guard, key precedence) are documented inline above the relevant code
- Cross-cutting design notes reference sibling files or patterns (e.g., "mirrors gmail-connector/src/deps.ts")

**JSDoc/TSDoc:**
- `/** ... */` JSDoc used selectively on exported types and fields where the semantics are non-obvious (e.g., `idempotencyKey` in `ResendSendInput`)
- `@internal` JSDoc tag used on `_resetResendDepsForTests` in `src/deps.ts`

## Function Design

**Size:** Functions are focused and short; the largest function is `sendViaResend` (~60 lines) which handles validation, guard checks, and the SDK call

**Parameters:** Input objects typed as named types (`ResendSendInput`, `SaveResendConfigInput`) rather than positional arguments for multi-field operations

**Return Values:**
- Sync functions return typed values directly or `void`
- Async functions return `Promise<NamedType>` (e.g., `Promise<ResendSendResult>`, `Promise<EmailSendReceipt>`)
- Optional returns use `string | undefined` — never `null` for "not found"

## Module Design

**Exports:**
- All public exports consolidated in `src/index.ts` as named exports — no default exports
- `src/register.ts` is a separate entry point exporting only `register(ctx)` (matched to `"exports": { "./register": "./register.ts" }` in `package.json`)
- `src/definition.ts` is a deliberate "leaf" module with no internal imports — enables import without triggering TDZ cycles

**Barrel Files:**
- `src/index.ts` serves as the barrel/public surface; internal modules are not re-exported from each other except through `index.ts`

---

*Convention analysis: 2026-06-09*
