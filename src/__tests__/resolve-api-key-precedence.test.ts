/**
 * resolveResendApiKey — API-key precedence + fail-closed semantics.
 *
 * Precedence: in-app encrypted override (if set) > env RESEND_API_KEY.
 * Fail-closed: if an override is stored but fails to decrypt (key rotated /
 * tampered ciphertext), the function must return `undefined` — it must NOT
 * fall back to the env key. The override is authoritative once set; silently
 * falling through would mask a tamper/rotation failure.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { resolveResendApiKey } from "../config";
import {
  registerResendConnector,
  _resetResendDepsForTests,
  type ResendConnectorDeps,
} from "../deps";

const readConfigMock = vi.fn();
const decryptSecretMock = vi.fn();

function stubDeps(): ResendConnectorDeps {
  return {
    readConnectorConfigFromDatabase: readConfigMock as never,
    writeConnectorConfigToDatabase: vi.fn(),
    encryptSecret: vi.fn(() => ({ ciphertext: "c", iv: "i" })),
    decryptSecret: decryptSecretMock as never,
  };
}

const originalEnvKey = process.env.RESEND_API_KEY;

describe("resolveResendApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetResendDepsForTests();
    registerResendConnector(stubDeps());
  });

  afterEach(() => {
    if (originalEnvKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalEnvKey;
  });

  it("returns undefined when no override and no env key exist", () => {
    delete process.env.RESEND_API_KEY;
    readConfigMock.mockReturnValue({});
    expect(resolveResendApiKey()).toBeUndefined();
    expect(decryptSecretMock).not.toHaveBeenCalled();
  });

  it("falls back to the trimmed env key when there is no override", () => {
    process.env.RESEND_API_KEY = "  re_env_key_123  ";
    readConfigMock.mockReturnValue({});
    expect(resolveResendApiKey()).toBe("re_env_key_123");
    expect(decryptSecretMock).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only env key as absent", () => {
    process.env.RESEND_API_KEY = "   ";
    readConfigMock.mockReturnValue({});
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("prefers a decryptable override over the env key", () => {
    process.env.RESEND_API_KEY = "re_env_key_should_be_ignored";
    readConfigMock.mockReturnValue({
      apiKeyCiphertext: "ct",
      apiKeyIv: "iv",
    });
    decryptSecretMock.mockReturnValue("re_override_key_456");
    expect(resolveResendApiKey()).toBe("re_override_key_456");
    expect(decryptSecretMock).toHaveBeenCalledWith(
      { ciphertext: "ct", iv: "iv" },
      "resend.apiKey",
    );
  });

  it("FAIL CLOSED: returns undefined (not the env key) when the override fails to decrypt", () => {
    process.env.RESEND_API_KEY = "re_env_key_should_still_be_ignored";
    readConfigMock.mockReturnValue({
      apiKeyCiphertext: "tampered-ciphertext",
      apiKeyIv: "iv",
    });
    decryptSecretMock.mockImplementation(() => {
      throw new Error("auth tag mismatch");
    });
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("treats a decrypted-but-whitespace-only override as absent (does not fall back to env)", () => {
    process.env.RESEND_API_KEY = "re_env_key_should_still_be_ignored";
    readConfigMock.mockReturnValue({
      apiKeyCiphertext: "ct",
      apiKeyIv: "iv",
    });
    decryptSecretMock.mockReturnValue("   ");
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("treats a partial override (ciphertext without iv) as no override, falling back to env", () => {
    process.env.RESEND_API_KEY = "re_env_key_789";
    readConfigMock.mockReturnValue({ apiKeyCiphertext: "ct-only" });
    expect(resolveResendApiKey()).toBe("re_env_key_789");
    expect(decryptSecretMock).not.toHaveBeenCalled();
  });
});
