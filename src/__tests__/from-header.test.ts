/**
 * buildResendFrom — RFC 5322 From-header construction.
 *
 * Covers the two safety properties the function documents:
 *  - CR/LF stripped from both the display name and the address (defense
 *    against header injection via a stored fromName/fromEmail).
 *  - Display names containing RFC 5322 "specials" (the characters that carry
 *    structural meaning inside an address — <>"(),:;@[]) are quoted and
 *    escaped per the quoted-string production, so the resulting header can't
 *    be misparsed as extra address components.
 */
import { describe, it, expect } from "vitest";

import { buildResendFrom } from "../email-connector";

describe("buildResendFrom", () => {
  it("returns bare 'Name <email>' for a plain display name", () => {
    expect(buildResendFrom("Cinatra", "no-reply@mail.cinatra.ai")).toBe(
      "Cinatra <no-reply@mail.cinatra.ai>",
    );
  });

  it("returns just the email when the display name is empty", () => {
    expect(buildResendFrom("", "no-reply@mail.cinatra.ai")).toBe(
      "no-reply@mail.cinatra.ai",
    );
  });

  it("returns just the email when the display name is whitespace-only", () => {
    expect(buildResendFrom("   ", "no-reply@mail.cinatra.ai")).toBe(
      "no-reply@mail.cinatra.ai",
    );
  });

  it("trims surrounding whitespace on both name and email", () => {
    expect(buildResendFrom("  Cinatra  ", "  no-reply@mail.cinatra.ai  ")).toBe(
      "Cinatra <no-reply@mail.cinatra.ai>",
    );
  });

  it("quotes a display name containing a comma", () => {
    expect(buildResendFrom("Doe, John", "john@example.com")).toBe(
      '"Doe, John" <john@example.com>',
    );
  });

  it("quotes and escapes a display name containing a double quote", () => {
    expect(buildResendFrom('John "Johnny" Doe', "john@example.com")).toBe(
      '"John \\"Johnny\\" Doe" <john@example.com>',
    );
  });

  it("quotes and escapes a display name containing a backslash", () => {
    expect(buildResendFrom("Path\\Name", "a@example.com")).toBe(
      '"Path\\\\Name" <a@example.com>',
    );
  });

  it.each([
    ["angle brackets", "Evil<script>", "a@example.com"],
    ["parens", "Evil(Corp)", "a@example.com"],
    ["colon", "Evil:Corp", "a@example.com"],
    ["semicolon", "Evil;Corp", "a@example.com"],
    ["at-sign", "Evil@Corp", "a@example.com"],
    ["square brackets", "Evil[Corp]", "a@example.com"],
  ])("quotes a display name containing %s", (_label, name, email) => {
    const result = buildResendFrom(name, email);
    expect(result.startsWith('"')).toBe(true);
    expect(result).toContain(`<${email}>`);
  });

  it("does not quote a display name with only unreserved characters", () => {
    expect(buildResendFrom("Cinatra Support Team", "support@example.com")).toBe(
      "Cinatra Support Team <support@example.com>",
    );
  });

  it("strips CR/LF from the display name (header-injection guard)", () => {
    // The injected fragment also contains a colon, a "special" character, so
    // the stripped name still gets quoted per the quoted-string branch —
    // this asserts the CRLF is gone, not the (separate) quoting behavior.
    const injected = "Cinatra\r\nBcc: attacker@evil.com";
    const result = buildResendFrom(injected, "no-reply@mail.cinatra.ai");
    expect(result).not.toMatch(/[\r\n]/);
    expect(result).toBe('"CinatraBcc: attacker@evil.com" <no-reply@mail.cinatra.ai>');
  });

  it("strips CR/LF from the email address (header-injection guard)", () => {
    const injected = "no-reply@mail.cinatra.ai\r\nBcc:attacker@evil.com";
    const result = buildResendFrom("Cinatra", injected);
    expect(result).not.toMatch(/[\r\n]/);
    expect(result).toBe("Cinatra <no-reply@mail.cinatra.aiBcc:attacker@evil.com>");
  });

  it("strips embedded LF-only and CR-only injection attempts", () => {
    expect(buildResendFrom("A\nB", "e@x.com")).toBe("AB <e@x.com>");
    expect(buildResendFrom("A\rB", "e@x.com")).toBe("AB <e@x.com>");
  });
});
