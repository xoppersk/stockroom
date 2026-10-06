import { describe, expect, it } from "vitest";

import { NAV_ITEMS, visibleNavItems } from "./nav";

describe("visibleNavItems", () => {
  it("shows all seven sections to admins", () => {
    expect(visibleNavItems("admin").map((item) => item.href)).toEqual([
      "/dashboard",
      "/orders",
      "/products",
      "/inventory",
      "/customers",
      "/discounts",
      "/settings",
    ]);
  });

  it("hides Settings from warehouse staff", () => {
    const hrefs = visibleNavItems("warehouse").map((item) => item.href);
    expect(hrefs).toHaveLength(6);
    expect(hrefs).not.toContain("/settings");
  });

  it("hides Settings from support staff", () => {
    const hrefs = visibleNavItems("support").map((item) => item.href);
    expect(hrefs).toHaveLength(6);
    expect(hrefs).not.toContain("/settings");
  });

  it("shows nothing to a role-less user", () => {
    expect(visibleNavItems(null)).toEqual([]);
  });

  it("keeps every nav entry's href unique", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
