import {
  AUTHORITY_LEVELS,
  JOB_FUNCTIONS,
  WORKSPACES,
  WORKSPACES_ALLOWED_BY_FUNCTION,
  type AuthorityLevel,
  type JobFunction,
  type Workspace,
} from "./access-policy.js";

export type AccessProfileSource = "modern" | "legacy" | "invalid";

export interface StoredAccessProfile {
  authorityLevel: string | null | undefined;
  jobFunction: string | null | undefined;
  workspaceAccess: string | null | undefined;
  accessProfileMigratedAt: Date | string | null | undefined;
}

export interface ResolvedAccessProfile {
  source: AccessProfileSource;
  authorityLevel: AuthorityLevel | null;
  jobFunction: JobFunction | null;
  workspaces: Workspace[];
  errors: string[];
}

export const CAPABILITIES = [
  "system.configure",
  "users.manage_authority",
  "users.manage_branch_members",
  "records.read_branch",
  "finance.access",
  "documentation.access",
  "terminal_manager.supervise",
  "delivery.access",
  "security.access",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const AUTHORITY_RANK: Record<AuthorityLevel, number> = {
  staff: 0,
  branch_admin: 1,
  admin: 2,
  super_admin: 3,
};

function isAuthorityLevel(value: string): value is AuthorityLevel {
  return AUTHORITY_LEVELS.includes(value as AuthorityLevel);
}

function isJobFunction(value: string): value is JobFunction {
  return JOB_FUNCTIONS.includes(value as JobFunction);
}

function isWorkspace(value: string): value is Workspace {
  return WORKSPACES.includes(value as Workspace);
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function parseWorkspaceAccess(workspaceAccess: string): Workspace[] | null {
  try {
    const parsed = JSON.parse(workspaceAccess);
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string" && isWorkspace(value))) {
      return null;
    }
    return [...new Set(parsed)] as Workspace[];
  } catch {
    return null;
  }
}

/**
 * Resolves only a complete, explicitly migrated profile. Any missing or
 * malformed field stays in legacy mode so that later route conversions cannot
 * accidentally change an existing user's permissions.
 */
export function resolveAccessProfile(profile: StoredAccessProfile): ResolvedAccessProfile {
  const hasAnyModernValue = Boolean(
    profile.authorityLevel || profile.jobFunction || profile.workspaceAccess || profile.accessProfileMigratedAt,
  );
  const hasCompleteModernProfile = Boolean(
    profile.authorityLevel && profile.jobFunction && profile.workspaceAccess && profile.accessProfileMigratedAt,
  );
  if (!hasAnyModernValue) {
    return { source: "legacy", authorityLevel: null, jobFunction: null, workspaces: [], errors: [] };
  }
  if (!hasCompleteModernProfile) {
    return {
      source: "invalid",
      authorityLevel: null,
      jobFunction: null,
      workspaces: [],
      errors: ["Access profile is incomplete and cannot be enforced."],
    };
  }

  const errors: string[] = [];
  const authority = profile.authorityLevel!;
  const jobFunction = profile.jobFunction!;
  const workspaces = parseWorkspaceAccess(profile.workspaceAccess!);
  if (!isAuthorityLevel(authority)) errors.push("Unknown authority level.");
  if (!isJobFunction(jobFunction)) errors.push("Unknown job function.");
  if (!workspaces) errors.push("Workspace access must be a JSON array of approved workspaces.");
  if (errors.length > 0 || !workspaces || !isAuthorityLevel(authority) || !isJobFunction(jobFunction)) {
    return { source: "invalid", authorityLevel: null, jobFunction: null, workspaces: [], errors };
  }

  const allowed = WORKSPACES_ALLOWED_BY_FUNCTION[jobFunction];
  if (!workspaces.every((workspace) => allowed.includes(workspace))) {
    errors.push("Workspace access includes a workspace not allowed for this job function.");
  }
  if (jobFunction === "operations" && workspaces.length === 0) {
    errors.push("Operations users must be assigned at least one operational workspace.");
  }
  if (jobFunction !== "operations" && !sameValues(workspaces, allowed)) {
    errors.push("Specialist job functions must use their defined workspace assignment.");
  }
  if (errors.length > 0) {
    return { source: "invalid", authorityLevel: null, jobFunction: null, workspaces: [], errors };
  }

  return {
    source: "modern",
    authorityLevel: authority,
    jobFunction,
    workspaces,
    errors: [],
  };
}

export function hasAuthority(
  profile: ResolvedAccessProfile,
  minimum: AuthorityLevel,
): boolean {
  return profile.source === "modern"
    && profile.authorityLevel != null
    && AUTHORITY_RANK[profile.authorityLevel] >= AUTHORITY_RANK[minimum];
}

export function hasWorkspace(profile: ResolvedAccessProfile, workspace: Workspace): boolean {
  return profile.source === "modern" && profile.workspaces.includes(workspace);
}

/**
 * Capability checks deliberately assume branch scope is checked separately by
 * the route. This engine decides what kind of work a migrated profile may do;
 * `userCanAccessBranch` remains the record-level branch boundary.
 */
export function hasCapability(profile: ResolvedAccessProfile, capability: Capability): boolean {
  if (profile.source !== "modern" || profile.authorityLevel == null || profile.jobFunction == null) {
    return false;
  }
  if (profile.authorityLevel === "super_admin") return true;

  switch (capability) {
    case "system.configure":
    case "users.manage_authority":
      return false;
    case "users.manage_branch_members":
      return hasAuthority(profile, "branch_admin");
    case "records.read_branch":
      return true;
    case "finance.access":
      return profile.authorityLevel === "admin" || profile.jobFunction === "accounts";
    case "documentation.access":
      return profile.authorityLevel === "admin" || profile.jobFunction === "documentation";
    case "terminal_manager.supervise":
      return profile.authorityLevel === "admin" || profile.jobFunction === "terminal_manager";
    case "delivery.access":
      return profile.authorityLevel === "admin" || profile.jobFunction === "delivery";
    case "security.access":
      return profile.authorityLevel === "admin" || profile.jobFunction === "security";
  }
}
