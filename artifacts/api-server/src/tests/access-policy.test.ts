import { describe, expect, it } from "vitest";
import {
  AUTHORITY_LEVELS,
  WORKSPACES_ALLOWED_BY_FUNCTION,
  isWorkspaceAllowedForFunction,
} from "../lib/access-policy.js";
import {
  hasCapability,
  hasWorkspace,
  resolveAccessProfile,
  summarizeAccessProfileMigration,
  validateAccessProfileUpdate,
} from "../lib/authorization.js";

describe("profile-only access policy", () => {
  it("keeps administrative authority separate from job function", () => {
    expect(AUTHORITY_LEVELS).toEqual(["super_admin", "admin", "branch_admin", "staff"]);
    expect(WORKSPACES_ALLOWED_BY_FUNCTION.accounts).toEqual(["accounts"]);
  });

  it("allows Operations to receive one or more operational workspaces", () => {
    expect(WORKSPACES_ALLOWED_BY_FUNCTION.operations).toEqual(["transire", "shipping", "terminal", "pullout"]);
    expect(isWorkspaceAllowedForFunction("operations", "shipping")).toBe(true);
    expect(isWorkspaceAllowedForFunction("accounts", "shipping")).toBe(false);
  });

  it("rejects an account with no modern profile instead of falling back to legacy roles", () => {
    expect(resolveAccessProfile({
      authorityLevel: null,
      jobFunction: null,
      workspaceAccess: null,
      accessProfileMigratedAt: null,
    })).toMatchObject({ source: "invalid" });
  });

  it("keeps an Accounts profile out of operational workspaces", () => {
    const profile = resolveAccessProfile({
      authorityLevel: "staff",
      jobFunction: "accounts",
      workspaceAccess: JSON.stringify(["accounts"]),
      accessProfileMigratedAt: new Date(),
    });
    expect(profile.source).toBe("modern");
    expect(hasCapability(profile, "finance.access")).toBe(true);
    expect(hasWorkspace(profile, "shipping")).toBe(false);
  });

  it("allows finance access only to accounts staff and branch authority or above", () => {
    const branchAdmin = resolveAccessProfile({
      authorityLevel: "branch_admin",
      jobFunction: "general_staff",
      workspaceAccess: "[]",
      accessProfileMigratedAt: new Date(),
    });
    const delivery = resolveAccessProfile({
      authorityLevel: "staff",
      jobFunction: "delivery",
      workspaceAccess: JSON.stringify(["delivery"]),
      accessProfileMigratedAt: new Date(),
    });

    expect(hasCapability(branchAdmin, "finance.access")).toBe(true);
    expect(hasCapability(delivery, "finance.access")).toBe(false);
  });

  it("requires an Operations workspace and preserves explicit multi-workspace access", () => {
    const invalid = resolveAccessProfile({ authorityLevel: "staff", jobFunction: "operations", workspaceAccess: "[]", accessProfileMigratedAt: new Date() });
    const valid = resolveAccessProfile({ authorityLevel: "staff", jobFunction: "operations", workspaceAccess: JSON.stringify(["shipping", "terminal"]), accessProfileMigratedAt: new Date() });
    expect(invalid.source).toBe("invalid");
    expect(valid.source).toBe("modern");
    expect(hasWorkspace(valid, "terminal")).toBe(true);
  });

  it("validates a complete access profile before any database write", () => {
    const valid = validateAccessProfileUpdate({ authorityLevel: "staff", jobFunction: "operations", workspaceAccess: ["shipping", "terminal"] });
    const invalid = validateAccessProfileUpdate({ authorityLevel: "staff", jobFunction: "accounts", workspaceAccess: ["shipping"] });
    expect(valid.value).toEqual({ authorityLevel: "staff", jobFunction: "operations", workspaceAccess: ["shipping", "terminal"] });
    expect(invalid.errors).toContain("Workspace access includes a workspace not allowed for this job function.");
  });

  it("reports cutover readiness only when every account has a valid profile", () => {
    const complete = summarizeAccessProfileMigration([{
      authorityLevel: "staff", jobFunction: "operations", workspaceAccess: JSON.stringify(["shipping"]), accessProfileMigratedAt: new Date(), isActive: true,
    }]);
    const incomplete = summarizeAccessProfileMigration([{
      authorityLevel: null, jobFunction: null, workspaceAccess: null, accessProfileMigratedAt: null, isActive: true,
    }]);
    expect(complete.legacyRetirementReady).toBe(true);
    expect(incomplete.legacyRetirementReady).toBe(false);
  });
});
