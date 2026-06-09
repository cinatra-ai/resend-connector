# Testing Patterns

**Analysis Date:** 2026-06-09

## Test Framework

**Runner:**
- Vitest (version not pinned — resolved transitively through the monorepo host)
- Config: No standalone `vitest.config.*` file in this repo; Vitest is invoked directly via `pnpm test` → `vitest`

**Assertion Library:**
- Vitest built-in (expect API)

**Run Commands:**
```bash
pnpm test          # Run all tests (vitest)
```

**Note:** This repo is a **source mirror** for the Cinatra monorepo. Per `.github/workflows/ci.yml`, standalone CI skips `pnpm install`, typecheck, and test when host-internal `@cinatra-ai/*` optional peers are present — the monorepo is responsible for running tests with full dependency resolution. `pnpm test` is only executed in CI for fully standalone repos.

## Test File Organization

**Location:**
- No test files are currently present in this repository (checked: no `*.test.*` or `*.spec.*` files under `src/` or repo root)
- Tests for this package are expected to live in the consuming monorepo's workspace when the package is cloned as a workspace member

**Naming:**
- Expected convention (based on `_resetResendDepsForTests` export in `src/deps.ts`): co-located `*.test.ts` files alongside source, e.g., `src/config.test.ts`, `src/send.test.ts`

**Structure:**
```
src/
├── config.ts
├── config.test.ts     (expected location — not yet present)
├── send.ts
├── send.test.ts       (expected location — not yet present)
├── deps.ts
└── deps.test.ts       (expected location — not yet present)
```

## Test Structure

**Suite Organization:**
- Not applicable — no test files present. Based on the `@internal _resetResendDepsForTests` export, the expected pattern is:

```typescript
import { registerResendConnector, _resetResendDepsForTests } from "./deps";

beforeEach(() => {
  // Reset injected deps between tests
  _resetResendDepsForTests();
});

afterEach(() => {
  _resetResendDepsForTests();
});
```

**Patterns:**
- Setup: inject mock deps via `registerResendConnector(mockDeps)` before each test
- Teardown: call `_resetResendDepsForTests()` to null out the singleton
- Assertion pattern: Vitest `expect(...).toThrow(...)` / `expect(...).toBe(...)` style

## Mocking

**Framework:** Vitest (vi.fn() / vi.mock())

**Dependency Injection Pattern:**
The package uses an explicit DI seam (`src/deps.ts`) that is test-friendly by design:

```typescript
// In tests: provide a mock implementation of ResendConnectorDeps
import { registerResendConnector, _resetResendDepsForTests } from "./deps";

const mockDeps = {
  readConnectorConfigFromDatabase: vi.fn().mockReturnValue({}),
  writeConnectorConfigToDatabase: vi.fn(),
  encryptSecret: vi.fn().mockReturnValue({ ciphertext: "ct", iv: "iv" }),
  decryptSecret: vi.fn().mockReturnValue("re_test_key"),
};

registerResendConnector(mockDeps);
```

**What to Mock:**
- `ResendConnectorDeps` interface (database read/write, encrypt/decrypt) — always mocked via `registerResendConnector`
- The `Resend` SDK client — mock `client.emails.send` to avoid real API calls
- `process.env.RESEND_API_KEY` — set/unset in tests that exercise `resolveResendApiKey`

**What NOT to Mock:**
- Business logic in `src/config.ts`, `src/send.ts`, `src/email-connector.ts` — these are the units under test
- `buildResendFrom` — a pure function, test directly without mocking

## Fixtures and Factories

**Test Data:**
- Not applicable — no fixture files present
- Expected pattern: inline objects matching `ResendSendInput`, `SaveResendConfigInput`

```typescript
const validSendInput: ResendSendInput = {
  from: "Cinatra <no-reply@mail.cinatra.ai>",
  to: ["user@example.com"],
  subject: "Test",
  text: "Hello",
};
```

**Location:**
- No dedicated fixtures directory detected

## Coverage

**Requirements:** Not enforced — no coverage thresholds configured

**View Coverage:**
```bash
pnpm test --coverage   # If vitest coverage plugin is available in host monorepo
```

## Test Types

**Unit Tests:**
- Primary test type for this package: test individual exported functions in isolation using the DI seam
- Key units: `getResendConfig`, `saveResendConfig`, `resolveResendApiKey`, `sendViaResend`, `buildResendFrom`, `getResendStatus`

**Integration Tests:**
- Not present; would require a real Resend API key and are expected to run in the monorepo's integration suite

**E2E Tests:**
- Not applicable for this connector package

## Common Patterns

**Async Testing:**
```typescript
it("throws when no API key is configured", async () => {
  _resetResendDepsForTests();
  registerResendConnector(mockDepsWithNoKey);
  await expect(sendViaResend(validInput)).rejects.toThrow("Resend is not configured");
});
```

**Error Testing:**
```typescript
it("throws on header injection in recipient", async () => {
  await expect(
    sendViaResend({ ...validInput, to: ["user\r\n@example.com"] })
  ).rejects.toThrow("contains a newline");
});
```

**Fail-closed decryption testing:**
```typescript
it("returns undefined when decryptSecret throws", () => {
  registerResendConnector({
    ...mockDeps,
    readConnectorConfigFromDatabase: vi.fn().mockReturnValue({
      apiKeyCiphertext: "ct",
      apiKeyIv: "iv",
    }),
    decryptSecret: vi.fn().mockImplementation(() => { throw new Error("auth tag mismatch"); }),
  });
  expect(resolveResendApiKey()).toBeUndefined();
});
```

---

*Testing analysis: 2026-06-09*
