import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect-path";

describe("safeNextPath", () => {
  it("accepts plain same-origin paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/app/account?tab=profile")).toBe("/app/account?tab=profile");
  });

  it("falls back on null, undefined, and empty input", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.com/phish")).toBe("/dashboard");
    expect(safeNextPath("//evil.com/phish")).toBe("/dashboard");
  });

  it("rejects URL-encoded protocol-relative URLs", () => {
    expect(safeNextPath("%2F%2Fevil.com%2Fphish")).toBe("/dashboard");
  });

  it("rejects backslash tricks", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("rejects malformed encodings", () => {
    expect(safeNextPath("%E0%A4%A")).toBe("/dashboard");
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("https://evil.com", "/dashboard")).toBe("/dashboard");
  });
});
