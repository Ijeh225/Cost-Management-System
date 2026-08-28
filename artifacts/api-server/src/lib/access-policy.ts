/**
 * Canonical RBAC vocabulary for the User Role restructuring.
 *
 * This module deliberately does not enforce access yet. It is the contract
 * that the schema migration, API guards, user-management UI, and navigation
 * will adopt in later phases. Existing role fields and their behaviour remain
 * unchanged until a user has been migrated and the relevant route is updated.
 */

export const AUTHORITY_LEVELS = [
  "super_admin",
  "admin",
  "branch_admin",
  "staff",
] as const;

export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export const JOB_FUNCTIONS = [
  "general_staff",
  "documentation",
  "accounts",
  "operations",
  "terminal_manager",
  "delivery",
  "security",
] as const;

export type JobFunction = (typeof JOB_FUNCTIONS)[number];

export const WORKSPACES = [
  "documentation",
  "accounts",
  "transire",
  "shipping",
  "terminal",
  "pullout",
  "terminal_manager",
  "delivery",
  "security",
] as const;

export type Workspace = (typeof WORKSPACES)[number];

const OPERATIONAL_WORKSPACES = [
  "transire",
  "shipping",
  "terminal",
  "pullout",
] as const satisfies readonly Workspace[];

/**
 * A job function determines the workspace family a staff member may receive.
 * Operations is intentionally the only function that can hold multiple
 * department workspaces. Accounts is finance-only and does not inherit any
 * operational workspace through this policy.
 */
export const WORKSPACES_ALLOWED_BY_FUNCTION: Record<JobFunction, readonly Workspace[]> = {
  general_staff: [],
  documentation: ["documentation"],
  accounts: ["accounts"],
  operations: OPERATIONAL_WORKSPACES,
  terminal_manager: ["terminal_manager"],
  delivery: ["delivery"],
  security: ["security"],
};

export function isAuthorityLevel(value: unknown): value is AuthorityLevel {
  return typeof value === "string" && AUTHORITY_LEVELS.includes(value as AuthorityLevel);
}

export function isJobFunction(value: unknown): value is JobFunction {
  return typeof value === "string" && JOB_FUNCTIONS.includes(value as JobFunction);
}

export function isWorkspace(value: unknown): value is Workspace {
  return typeof value === "string" && WORKSPACES.includes(value as Workspace);
}

export function isWorkspaceAllowedForFunction(
  jobFunction: JobFunction,
  workspace: Workspace,
): boolean {
  return WORKSPACES_ALLOWED_BY_FUNCTION[jobFunction].includes(workspace);
}

/**
 * Temporary translation from today's persisted legacy roles to the new model.
 * It is metadata only: this mapping must not be used to silently expand an
 * existing user's access. A later migration will explicitly review and write
 * each user's authority, function, and workspace assignments.
 */
export const LEGACY_ROLE_MAPPINGS = {
  super_admin: { authority: "super_admin", jobFunction: "general_staff", workspaces: [] },
  admin: { authority: "admin", jobFunction: "general_staff", workspaces: [] },
  branch_admin: { authority: "branch_admin", jobFunction: "general_staff", workspaces: [] },
  staff: { authority: "staff", jobFunction: "general_staff", workspaces: [] },
  documentation_user: { authority: "staff", jobFunction: "documentation", workspaces: ["documentation"] },
  accounts_user: { authority: "staff", jobFunction: "accounts", workspaces: ["accounts"] },
  operations_user: { authority: "staff", jobFunction: "operations", workspaces: [] },
  transire_user: { authority: "staff", jobFunction: "operations", workspaces: ["transire"] },
  shipping_user: { authority: "staff", jobFunction: "operations", workspaces: ["shipping"] },
  terminal_user: { authority: "staff", jobFunction: "operations", workspaces: ["terminal"] },
  pull_out_user: { authority: "staff", jobFunction: "operations", workspaces: ["pullout"] },
  shipping_terminal_user: { authority: "staff", jobFunction: "operations", workspaces: ["shipping", "terminal"] },
  terminal_manager: { authority: "staff", jobFunction: "terminal_manager", workspaces: ["terminal_manager"] },
  delivery_user: { authority: "staff", jobFunction: "delivery", workspaces: ["delivery"] },
  security_user: { authority: "staff", jobFunction: "security", workspaces: ["security"] },
} as const satisfies Record<string, {
  authority: AuthorityLevel;
  jobFunction: JobFunction;
  workspaces: readonly Workspace[];
}>;
