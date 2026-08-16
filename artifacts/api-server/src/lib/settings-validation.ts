const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_FREQUENCIES = new Set(["none", "daily", "weekly"]);
const EMAIL_ALERT_IDS = new Set([
  "terminal_jobs", "overdue_containers", "berthing_watch", "clearing_delays", "inactive_jobs",
  "documentation_delays", "transire_delay", "shipping_delay", "terminal_delay", "pullout_delay",
  "exam_release_delay", "financial_exceptions",
]);

const AI_ASSISTANT_ACCESS_ROLES = new Set(["admin", "super_admin"]);
const AI_ASSISTANT_ROLLOUT_STAGES = new Set(["super_admin_only", "selected_admins", "all_authorized_admins"]);
const AI_ASSISTANT_DATA_DOMAINS = new Set([
  "dashboard",
  "operations",
  "documentation",
  "containers",
  "finance",
  "banking",
  "reports",
  "notifications",
  "documents",
]);

export const CLIENT_SETTING_KEYS = new Set([
  "agingInactivityDays", "agingDays1", "agingDays2", "agingDays3", "notifyBeforeDueDays",
  "agingEmailEnabled", "agingEmailTo", "digestFrequency", "digestTime", "emailAlertPreferences",
  "verificationOfficerUserIds", "verificationOfficerUserId", "berthingOfficerUserIds", "berthingOfficerUserId",
  "documentSections", "aiAssistantGovernance", "aiProactiveBriefingPreferences",
]);

function csvEmails(value: string): boolean {
  return value.split(",").map((email) => email.trim()).filter(Boolean).every((email) => EMAIL_PATTERN.test(email));
}

export function parseOfficerIds(value: string): number[] | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const ids = [...new Set(parsed.map(Number))];
    return ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;
  } catch {
    return null;
  }
}

export function validateSettingsPayload(payload: unknown): { values: Record<string, string>; officerIds: number[]; error?: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { values: {}, officerIds: [], error: "Settings payload must be an object." };
  const values = payload as Record<string, unknown>;
  const keys = Object.keys(values);
  const unknown = keys.filter((key) => !CLIENT_SETTING_KEYS.has(key));
  if (unknown.length) return { values: {}, officerIds: [], error: `Unsupported setting: ${unknown[0]}` };
  if (keys.length === 0 || keys.length > CLIENT_SETTING_KEYS.size) return { values: {}, officerIds: [], error: "Invalid settings payload." };
  if (keys.some((key) => typeof values[key] !== "string" || String(values[key]).length > 20_000)) return { values: {}, officerIds: [], error: "Settings values must be valid text." };
  const normalized = Object.fromEntries(keys.map((key) => [key, String(values[key]).trim()]));
  for (const key of ["agingInactivityDays", "agingDays1", "agingDays2", "agingDays3", "notifyBeforeDueDays"]) {
    if (!(key in normalized)) continue;
    const number = Number(normalized[key]);
    const min = key === "notifyBeforeDueDays" ? 0 : 1;
    if (!Number.isInteger(number) || number < min || number > 3650) return { values: {}, officerIds: [], error: `${key} must be a whole number between ${min} and 3650.` };
  }
  if (["agingDays1", "agingDays2", "agingDays3"].every((key) => key in normalized)) {
    if (!(Number(normalized.agingDays1) < Number(normalized.agingDays2) && Number(normalized.agingDays2) < Number(normalized.agingDays3))) return { values: {}, officerIds: [], error: "Aging thresholds must increase from Warning to Critical." };
  }
  if ("agingEmailEnabled" in normalized && !["true", "false"].includes(normalized.agingEmailEnabled)) return { values: {}, officerIds: [], error: "agingEmailEnabled must be true or false." };
  if ("digestFrequency" in normalized && !EMAIL_FREQUENCIES.has(normalized.digestFrequency)) return { values: {}, officerIds: [], error: "Invalid digest frequency." };
  if ("digestTime" in normalized && !/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized.digestTime)) return { values: {}, officerIds: [], error: "digestTime must be in HH:MM format." };
  if ("agingEmailTo" in normalized && !csvEmails(normalized.agingEmailTo)) return { values: {}, officerIds: [], error: "Enter valid recipient email addresses." };
  if ("emailAlertPreferences" in normalized) {
    try {
      const preferences = JSON.parse(normalized.emailAlertPreferences);
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) throw new Error();
      for (const [id, preference] of Object.entries(preferences)) {
        if (!EMAIL_ALERT_IDS.has(id) || !preference || typeof preference !== "object") throw new Error();
        const item = preference as Record<string, unknown>;
        if (
          typeof item.enabled !== "boolean" ||
          typeof item.recipients !== "string" ||
          !csvEmails(item.recipients) ||
          typeof item.frequency !== "string" ||
          !EMAIL_FREQUENCIES.has(item.frequency) ||
          (item.enabled && item.recipients.trim().length === 0)
        ) throw new Error();
      }
    } catch { return { values: {}, officerIds: [], error: "Invalid email alert preferences." }; }
  }
  if ("documentSections" in normalized) {
    try {
      const sections = JSON.parse(normalized.documentSections);
      if (!Array.isArray(sections) || sections.length < 1 || sections.length > 20) throw new Error();
      const ids = new Set<string>();
      const labels = new Set<string>();
      for (const section of sections) {
        if (!section || typeof section !== "object") throw new Error();
        const item = section as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.label !== "string") throw new Error();
        const id = item.id.trim();
        const label = item.label.trim();
        if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || label.length < 1 || label.length > 60 || ids.has(id) || labels.has(label.toLowerCase())) throw new Error();
        ids.add(id);
        labels.add(label.toLowerCase());
      }
    } catch { return { values: {}, officerIds: [], error: "Document sections must be a unique list of 1 to 20 named sections." }; }
  }
  if ("aiAssistantGovernance" in normalized) {
    try {
      const governance = JSON.parse(normalized.aiAssistantGovernance);
      if (!governance || typeof governance !== "object" || Array.isArray(governance)) throw new Error();
      const policy = governance as Record<string, unknown>;
      const keys = Object.keys(policy);
      const allowedKeys = new Set([
        "accessRoles", "mode", "dataDomains", "monthlyBudgetNgn", "auditRetentionDays", "actionPolicy", "providerEnabled", "rolloutStage", "selectedAdminUserIds",
      ]);
      if (keys.some((key) => !allowedKeys.has(key))) throw new Error();
      if (!Array.isArray(policy.accessRoles) || policy.accessRoles.length === 0 || policy.accessRoles.some((role) => typeof role !== "string" || !AI_ASSISTANT_ACCESS_ROLES.has(role))) throw new Error();
      if (policy.mode !== "read_only") throw new Error();
      if (!Array.isArray(policy.dataDomains) || policy.dataDomains.length === 0 || policy.dataDomains.some((domain) => typeof domain !== "string" || !AI_ASSISTANT_DATA_DOMAINS.has(domain))) throw new Error();
      if (!Number.isInteger(policy.monthlyBudgetNgn) || Number(policy.monthlyBudgetNgn) < 0 || Number(policy.monthlyBudgetNgn) > 50_000_000) throw new Error();
      if (!Number.isInteger(policy.auditRetentionDays) || Number(policy.auditRetentionDays) < 30 || Number(policy.auditRetentionDays) > 3650) throw new Error();
      if (policy.actionPolicy !== "human_confirmation_required") throw new Error();
      if ("providerEnabled" in policy && typeof policy.providerEnabled !== "boolean") throw new Error();
      if ("rolloutStage" in policy && (typeof policy.rolloutStage !== "string" || !AI_ASSISTANT_ROLLOUT_STAGES.has(policy.rolloutStage))) throw new Error();
      if ("selectedAdminUserIds" in policy && (!Array.isArray(policy.selectedAdminUserIds) || policy.selectedAdminUserIds.some((id) => !Number.isInteger(id) || Number(id) <= 0))) throw new Error();
      if (policy.rolloutStage === "selected_admins" && (!Array.isArray(policy.selectedAdminUserIds) || policy.selectedAdminUserIds.length === 0)) throw new Error();
    } catch {
      return { values: {}, officerIds: [], error: "AI governance settings must use the approved read-only access, scope, budget, and audit policy format." };
    }
  }
  if ("aiProactiveBriefingPreferences" in normalized) {
    try {
      const preferences = JSON.parse(normalized.aiProactiveBriefingPreferences);
      if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) throw new Error();
      const item = preferences as Record<string, unknown>;
      const allowedKeys = new Set(["enabled", "daily", "weekly"]);
      if (Object.keys(item).some((key) => !allowedKeys.has(key)) || typeof item.enabled !== "boolean" || typeof item.daily !== "boolean" || typeof item.weekly !== "boolean") throw new Error();
    } catch {
      return { values: {}, officerIds: [], error: "Proactive briefing preferences must contain enabled, daily, and weekly switches." };
    }
  }
  const officerIds = ["verificationOfficerUserIds", "berthingOfficerUserIds"].flatMap((key) => key in normalized ? (parseOfficerIds(normalized[key]) ?? []) : []);
  for (const key of ["verificationOfficerUserIds", "berthingOfficerUserIds"]) if (key in normalized && parseOfficerIds(normalized[key]) == null) return { values: {}, officerIds: [], error: `${key} must be a list of user IDs.` };
  for (const key of ["verificationOfficerUserId", "berthingOfficerUserId"]) {
    if (!(key in normalized) || normalized[key] === "") continue;
    if (!/^\d+$/.test(normalized[key]) || Number(normalized[key]) < 1) return { values: {}, officerIds: [], error: `${key} must be a valid user ID.` };
    officerIds.push(Number(normalized[key]));
  }
  return { values: normalized, officerIds: [...new Set(officerIds)] };
}
