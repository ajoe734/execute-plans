import { describe, it, expect } from "vitest";
import { canInvoke, filterActions } from "@/lib/permissions";

describe("permissions", () => {
  it("admin can invoke any defined action", () => {
    expect(canInvoke("admin", "promote_live")).toBe(true);
    expect(canInvoke("admin", "freeze")).toBe(true);
    expect(canInvoke("admin", "delete")).toBe(true);
  });

  it("analyst cannot promote_live or rollback", () => {
    expect(canInvoke("analyst", "promote_live")).toBe(false);
    expect(canInvoke("analyst", "rollback")).toBe(false);
  });

  it("risk_officer can pause and rollback", () => {
    expect(canInvoke("risk_officer", "pause")).toBe(true);
    expect(canInvoke("risk_officer", "rollback")).toBe(true);
  });

  it("'*' actions allowed for everyone", () => {
    expect(canInvoke("analyst", "simulate")).toBe(true);
    expect(canInvoke("trader", "view_logs")).toBe(true);
  });

  it("unknown action defaults to allow (not blocked)", () => {
    expect(canInvoke("analyst", "no_such_action_xyz")).toBe(true);
  });

  it("filterActions strips actions the role cannot do", () => {
    const filtered = filterActions("analyst", ["edit", "promote_live", "simulate"]);
    expect(filtered).toEqual(["simulate"]);
  });

  it("filterActions handles undefined input", () => {
    expect(filterActions("admin", undefined)).toEqual([]);
  });
});
