import { describe, expect, it } from "vitest";
import {
  AUTHORITY_LEVELS,
  LEGACY_ROLE_MAPPINGS,
  WORKSPACES_ALLOWED_BY_FUNCTION,
  isWorkspaceAllowedForFunction,
  reviewLegacyUserAccess,
} from "../lib/access-policy.js";
import { hasCapability, hasWorkspace, resolveAccessProfile, validateAccessProfileUpdate } from "../lib/authorization.js";

describe("access policy foundation", () => {
  it("keeps administrative authority separate from job function", () => {
    expect(AUTHORITY_LEVELS).toEqual([
      "super_admin",
      "admin",
      "branch_admin",
      "staff",
    ]);
    expect(LEGACY_ROLE_MAPPINGS.accounts_user.authority).toBe("staff");
    expect(LEGACY_ROLE_MAPPINGS.accounts_user.jobFunction).toBe("accounts");
  });

  it("allows Operations to receive one or more operational workspaces", () => {
    expect(WORKSPACES_ALLOWED_BY_FUNCTION.operations).toEqual([
      "transire",
      "shipping",
      "terminal",
      "pullout",
    ]);
    expect(isWorkspaceAllowedForFunction("operations", "shipping")).toBe(true);
    expect(isWorkspaceAllowedForFunction("operations", "terminal")).toBe(true);
  });

  it("does not mix finance and operational workspace access", () => {
    expect(isWorkspaceAllowedForFunction("accounts", "accounts")).toBe(true);
    expect(isWorkspaceAllowedForFunction("accounts", "shipping")).toBe(false);
    expect(isWorkspaceAllowedForFunction("accounts", "terminal")).toBe(false);
  });

  it("keeps the legacy combined shipping and terminal role only as a migration mapping", () => {
    expect(LEGACY_ROLE_MAPPINGS.shipping_terminal_user).toEqual({
      authority: "staff",
      jobFunction: "operations",
      workspaces: ["shipping", "terminal"],
    });
  });

  it("flags conflicting stored roles instead of guessing a broader profile", () => {
    const review = reviewLegacyUserAccess({
      role: "staff",
      roles: JSON.stringify(["accounts_user", "shipping_user"]),
      sectionPermission: null,
      sectionPermissions: null,
    });

    expect(review.proposedJobFunction).toBeNull();
    expect(review.requiresManualReview).toBe(true);
    expect(review.flags).toContain("multiple_job_functions");
    expect(review.flags).toContain("primary_role_missing_from_roles");
  });

  it("requires an explicit workspace decision for a legacy Operations user", () => {
    const review = reviewLegacyUserAccess({
      role: "operations_user",
      roles: null,
      sectionPermission: null,
      sectionPermissions: null,
    });

    expect(review.proposedJobFunction).toBe("operations");
    expect(review.proposedWorkspaces).toEqual([]);
    expect(review.flags).toContain("operations_workspace_selection_required");
  });

  it("does not enforce a profile until all migration fields are present", () => {
    expect(resolveAccessProfile({
      authorityLevel: "staff",
      jobFunction: "accounts",
      workspaceAccess: JSON.stringify(["accounts"]),
      accessProfileMigratedAt: null,
    })).toMatchObject({ source: "invalid" });
    expect(resolveAccessProfile({
      authorityLevel: null,
      jobFunction: null,
      workspaceAccess: null,
      accessProfileMigratedAt: null,
    })).toMatchObject({ source: "legacy" });
  });

  it("keeps a migrated Accounts profile out of operational workspaces", () => {
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

  it("requires an Operations workspace and preserves explicit multi-workspace access", () => {
    const invalid = resolveAccessProfile({
      authorityLevel: "staff",
      jobFunction: "operations",
      workspaceAccess: "[]",
      accessProfileMigratedAt: new Date(),
    });
    const valid = resolveAccessProfile({
      authorityLevel: "staff",
      jobFunction: "operations",
      workspaceAccess: JSON.stringify(["shipping", "terminal"]),
      accessProfileMigratedAt: new Date(),
    });

    expect(invalid.source).toBe("invalid");
    expect(valid.source).toBe("modern");
    expect(hasWorkspace(valid, "shipping")).toBe(true);
    expect(hasWorkspace(valid, "terminal")).toBe(true);
  });

  it("validates an access-profile update before any database write", () => {
    const valid = validateAccessProfileUpdate({
      authorityLevel: "staff",
      jobFunction: "operations",
      workspaceAccess: ["shipping", "terminal"],
    });
    const invalid = validateAccessProfileUpdate({
      authorityLevel: "staff",
      jobFunction: "accounts",
      workspaceAccess: ["shipping"],
    });

    expect(valid.value).toEqual({
      authorityLevel: "staff",
      jobFunction: "operations",
      workspaceAccess: ["shipping", "terminal"],
    });
    expect(invalid.value).toBeNull();
    expect(invalid.errors).toContain("Workspace access includes a workspace not allowed for this job function.");
  });

  it("does not give a branch admin finance or authority-management capability", () => {
    const branchAdmin = resolveAccessProfile({
      authorityLevel: "branch_admin",
      jobFunction: "general_staff",
      workspaceAccess: "[]",
      accessProfileMigratedAt: new Date(),
    });

    expect(hasCapability(branchAdmin, "users.manage_branch_members")).toBe(true);
    expect(hasCapability(branchAdmin, "users.manage_authority")).toBe(false);
    expect(hasCapability(branchAdmin, "finance.access")).toBe(false);
  });
});
