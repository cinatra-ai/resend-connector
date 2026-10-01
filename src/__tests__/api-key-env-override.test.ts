/**
 * resolveResendApiKey — the operator override is read through the host's
 * manifest-declared override road, never from the process environment.
 *
 * Order (unchanged): a stored key that decrypts wins; a stored key that cannot
 * be decrypted resolves to no key (fail closed); only with no stored key does
 * the host-resolved override apply.
 */
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(
    async (_message?: Record<string, unknown>, _options?: Record<string, unknown>) => ({
      data: { id: "msg_123" },
      error: null,
    }),
  ),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function FakeResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { resolveResendApiKey, getResendStatus } from "../config";
import { sendViaResend } from "../send";
import { register } from "../register";
import {
  registerResendConnector,
  _resetResendDepsForTests,
  type ResendConnectorDeps,
} from "../deps";

const readConfigMock = vi.fn();
const decryptSecretMock = vi.fn();

function stubDeps(
  resolveEnvOverrides?: () => Record<string, string>,
): ResendConnectorDeps {
  const deps: ResendConnectorDeps = {
    readConnectorConfigFromDatabase: readConfigMock as never,
    writeConnectorConfigToDatabase: vi.fn(),
    encryptSecret: vi.fn(() => ({ ciphertext: "c", iv: "i" })),
    decryptSecret: decryptSecretMock as never,
  };
  if (resolveEnvOverrides) deps.resolveEnvOverrides = resolveEnvOverrides;
  return deps;
}

describe("resolveResendApiKey override road", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetResendDepsForTests();
    readConfigMock.mockReturnValue({});
  });

  it("A1: uses the trimmed host-resolved override when no key is stored", () => {
    registerResendConnector(stubDeps(() => ({ apiKey: "  override-key-1  " })));
    expect(resolveResendApiKey()).toBe("override-key-1");
  });

  it("A2: reads no process variable itself, the plain name included", () => {
    const name = "RESEND_API_KEY";
    const before = process.env[name];
    process.env[name] = "old-name-key-2";
    try {
      registerResendConnector(stubDeps(() => ({})));
      expect(resolveResendApiKey()).toBeUndefined();
    } finally {
      if (before === undefined) delete process.env[name];
      else process.env[name] = before;
    }
  });

  it("A3: a stored key that decrypts wins over the override", () => {
    registerResendConnector(stubDeps(() => ({ apiKey: "override-key-3" })));
    readConfigMock.mockReturnValue({ apiKeyCiphertext: "ct", apiKeyIv: "iv" });
    decryptSecretMock.mockReturnValue("stored-key-3");
    expect(resolveResendApiKey()).toBe("stored-key-3");
  });

  it("A4: a stored key that cannot be decrypted fails closed", () => {
    registerResendConnector(stubDeps(() => ({ apiKey: "override-key-4" })));
    readConfigMock.mockReturnValue({ apiKeyCiphertext: "ct", apiKeyIv: "iv" });
    decryptSecretMock.mockImplementation(() => {
      throw new Error("auth tag mismatch");
    });
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("A5: an override of spaces only is absent", () => {
    registerResendConnector(stubDeps(() => ({ apiKey: "     " })));
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("A6: a host without the member yields no override and throws nothing", () => {
    registerResendConnector(stubDeps());
    expect(() => resolveResendApiKey()).not.toThrow();
    expect(resolveResendApiKey()).toBeUndefined();
  });

  it("A7: register binds the override from the connector-config service by package name", () => {
    const resolveSpy = vi.fn(() => ({ apiKey: "bound-key-7" }));
    const impls: Record<string, unknown> = {
      "@cinatra-ai/host:connector-config": {
        read: () => ({}),
        write: vi.fn(),
        resolveEnvOverrides: resolveSpy,
      },
      "@cinatra-ai/host:secrets-codec": {
        encryptSecret: vi.fn(),
        decryptSecret: vi.fn(),
      },
    };
    const ctx = {
      capabilities: {
        resolveProviders: (capability: string) =>
          impls[capability] ? [{ packageName: "host", impl: impls[capability] }] : [],
        registerProvider: vi.fn(),
      },
    };
    register(ctx as never);
    expect(resolveResendApiKey()).toBe("bound-key-7");
    expect(resolveSpy).toHaveBeenCalledWith("@cinatra-ai/resend-connector");
  });

  it("A8: the manifest declares the plain deployment name and only the capabilities port", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"),
    );
    expect(pkg.cinatra.envOverrides).toEqual({ RESEND_API_KEY: "secrets:apiKey" });
    expect(
      Object.keys(pkg.cinatra.envOverrides).filter((k) => k.startsWith("CINATRA_EXT_")),
    ).toEqual([]);
    expect(pkg.cinatra.requestedHostPorts).toEqual(["capabilities"]);
  });

  it("A9: the missing-key status names the plain variable", () => {
    registerResendConnector(stubDeps(() => ({})));
    readConfigMock.mockReturnValue({});
    const status = getResendStatus();
    expect(status.status).toBe("not_connected");
    expect(status.detail).toContain("Set RESEND_API_KEY in the instance env");
    expect(status.detail).not.toContain("CINATRA_EXT_");
  });

  it("A10: the missing-key send error names the plain variable", async () => {
    registerResendConnector(stubDeps(() => ({})));
    readConfigMock.mockReturnValue({});
    const input = {
      from: "Cinatra <no-reply@mail.cinatra.ai>",
      to: ["alice@example.com"],
      subject: "Hi",
      text: "Hello",
    };
    const err = await sendViaResend(input).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain("Set RESEND_API_KEY in the instance env");
    expect(err?.message).not.toContain("CINATRA_EXT_");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
