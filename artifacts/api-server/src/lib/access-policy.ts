/** Canonical RBAC vocabulary used by every authenticated request. */

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
