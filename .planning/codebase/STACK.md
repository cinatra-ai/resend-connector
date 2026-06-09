# Technology Stack

**Analysis Date:** 2026-06-09

## Languages

**Primary:**
- TypeScript — all source files under `src/`, targeting ES2023, strict mode enabled (`noImplicitAny` disabled)

## Runtime

**Environment:**
- Node.js (server-only; all source files import `"server-only"` guard, preventing accidental client-side use)

**Package Manager:**
- npm (`.npmrc` present)
- Lockfile: not detected in repo root (likely generated on install)

## Frameworks

**Core:**
- None — this is a standalone connector library, not an application framework

**Testing:**
- Vitest — configured via `"test": "vitest"` script in `package.json`; no `vitest.config.*` found (uses defaults)

**Build/Dev:**
- TypeScript compiler (`tsc`) — `tsconfig.json` targets `dist/` output with declarations and source maps
- Module format: ESM (`"type": "module"`)
- Module resolution: `"bundler"` (Next.js / Vite compatible)

## Key Dependencies

**Critical:**
- `resend` ^4.0.1 — official Resend Node.js SDK; used in `src/send.ts` to call `client.emails.send()`

**Peer Dependencies:**
- `@cinatra-ai/sdk-extensions` (optional peer) — provides `EmailConnector`, `EmailConnectorDefinition`, `ExtensionHostContext`, and related contracts imported by `src/definition.ts`, `src/email-connector.ts`, and `src/register.ts`
- `@cinatra-ai/email-connector` (Cinatra connector graph dep, `runtime` edge, semver `*`) — declared in `cinatra.dependencies` manifest block

## Configuration

**Environment:**
- `RESEND_API_KEY` — fallback API key when no in-app encrypted override is stored; read in `src/config.ts` via `process.env.RESEND_API_KEY`
- `CINATRA_ENCRYPTION_KEY` — host-managed AES-256-GCM key used to encrypt/decrypt the stored API key override; injected by host runtime, not read directly in this package

**Build:**
- `tsconfig.json` — standalone (extends nothing), `rootDir: src`, `outDir: dist`, `verbatimModuleSyntax: true`

## Platform Requirements

**Development:**
- Node.js with ESM support
- Host must call `registerResendConnector(deps)` at boot to inject database and encryption dependencies (see `src/deps.ts`)

**Production:**
- Loaded by Cinatra's `StaticBundleLoader` via `./register` entry point (`src/register.ts`)
- Connector kind declared in `package.json` under `"cinatra"` manifest block (`apiVersion: cinatra.ai/v1`, `kind: connector`, `sdkAbiRange: ^2`)
- Requires `capabilities` host port for `email-send` capability registration

---

*Stack analysis: 2026-06-09*
