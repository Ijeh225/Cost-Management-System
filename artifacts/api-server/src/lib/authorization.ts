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

export interface AccessProfileUpdateInput {
  authorityLevel: unknown;
  jobFunction: unknown;
  workspaceAccess: unknown;
}

export interface AccessProfileMigrationRow extends StoredAccessProfile {
  isActive: boolean;
}

export interface AccessProfileMigrationSummary {
  totalUsers: number;
  activeUsers: number;
  modernProfiles: number;
  legacyProfiles: number;
  invalidProfiles: number;
  activeProfilesMigrated: number;
  activeProfilesPending: number;
  activeProfileMigrationComplete: boolean;
  allProfilesMigrated: boolean;
  legacyRetirementReady: false;
  retirementBlockers: string[];
}

export type ValidatedAccessProfileUpdate = {
  authorityLevel: AuthorityLevel;
  jobFunction: JobFunction;
  workspaceAccess: Workspace[];
};

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

function isAuthorityLevel(value: unknown): value is AuthorityLevel {
  return typeof value === "string" && AUTHORITY_LEVELS.includes(value as AuthorityLevel);
}

function isJobFunction(value: unknown): value is JobFunction {
  return typeof value === "string" && JOB_FUNCTIONS.includes(value as JobFunction);
}

function isWorkspace(value: unknown): value is Workspace {
  return typeof value === "string" && WORKSPACES.includes(value as Workspace);
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
 * Validates the API payload before it is written to the user record. The
 * caller receives normal arrays; the database serialization happens only in
 * the user-management route after this check succeeds.
 */
export function validateAccessProfileUpdate(input: AccessProfileUpdateInput): {
  value: ValidatedAccessProfileUpdate | null;
  errors: string[];
} {
  const authorityCandidate = input.authorityLevel;
  const jobFunctionCandidate = input.jobFunction;
  const workspaceCandidate = input.workspaceAccess;
  const errors: string[] = [];
  if (!isAuthorityLevel(authorityCandidate)) errors.push("Choose a valid authority level.");
  if (!isJobFunction(jobFunctionCandidate)) errors.push("Choose a valid job function.");
  if (!Array.isArray(workspaceCandidate) || !workspaceCandidate.every(isWorkspace)) {
    errors.push("Workspace access must be an array of approved workspaces.");
  }
  if (errors.length > 0) return { value: null, errors };

  const authorityLevel = authorityCandidate as AuthorityLevel;
  const jobFunction = jobFunctionCandidate as JobFunction;
  const workspaceAccess = [...new Set(workspaceCandidate as Workspace[])];
  const resolved = resolveAccessProfile({
    authorityLevel,
    jobFunction,
    workspaceAccess: JSON.stringify(workspaceAccess),
    accessProfileMigratedAt: new Date(),
  });
  if (resolved.source !== "modern") return { value: null, errors: resolved.errors };

  return { value: { authorityLevel, jobFunction, workspaceAccess }, errors: [] };
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
 * Summarises migration progress without changing a single legacy value. The
 * legacy-role retirement flag is intentionally always false: removal needs a
 * separately approved release after every account has been tested.
 */
export function summarizeAccessProfileMigration(
  rows: readonly AccessProfileMigrationRow[],
): AccessProfileMigrationSummary {
  const resolved = rows.map((row) => ({ row, profile: resolveAccessProfile(row) }));
  const active = resolved.filter(({ row }) => row.isActive);
  const modernProfiles = resolved.filter(({ profile }) => profile.source === "modern").length;
  const legacyProfiles = resolved.filter(({ profile }) => profile.source === "legacy").length;
  const invalidProfiles = resolved.filter(({ profile }) => profile.source === "invalid").length;
  const activeProfilesMigrated = active.filter(({ profile }) => profile.source === "modern").length;
  const activeProfilesPending = active.length - activeProfilesMigrated;
  const activeProfileMigrationComplete = activeProfilesPending === 0;
  const allProfilesMigrated = resolved.every(({ profile }) => profile.source === "modern");
  const retirementBlockers: string[] = [];

  if (!activeProfileMigrationComplete) {
    retirementBlockers.push(`${activeProfilesPending} active user profile(s) still require migration or correction.`);
  }
  if (!allProfilesMigrated) {
    retirementBlockers.push("Inactive and archived accounts still need an explicit migration or retirement decision.");
  }
  retirementBlockers.push("Legacy role and section-permission fields are intentionally preserved until a separately approved retirement release.");

  return {
    totalUsers: rows.length,
    activeUsers: active.length,
    modernProfiles,
    legacyProfiles,
    invalidProfiles,
    activeProfilesMigrated,
    activeProfilesPending,
    activeProfileMigrationComplete,
    allProfilesMigrated,
    legacyRetirementReady: false,
    retirementBlockers,
  };
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
