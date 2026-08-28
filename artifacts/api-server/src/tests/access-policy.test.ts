import { describe, expect, it } from "vitest";
import {
  AUTHORITY_LEVELS,
  LEGACY_ROLE_MAPPINGS,
  WORKSPACES_ALLOWED_BY_FUNCTION,
  isWorkspaceAllowedForFunction,
  reviewLegacyUserAccess,
} from "../lib/access-policy.js";

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
});
