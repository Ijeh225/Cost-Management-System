import { describe, expect, it } from "vitest";
import { validateSettingsPayload } from "../lib/settings-validation.js";

const validPayload = {
  agingInactivityDays: "7",
  agingDays1: "30",
  agingDays2: "60",
  agingDays3: "90",
  notifyBeforeDueDays: "7",
  agingEmailEnabled: "true",
  agingEmailTo: "ops@example.com",
  digestFrequency: "daily",
  digestTime: "08:00",
  verificationOfficerUserIds: "[1,2]",
  verificationOfficerUserId: "1",
  berthingOfficerUserIds: "[3]",
  berthingOfficerUserId: "3",
  emailAlertPreferences: JSON.stringify({
    clearing_delays: { enabled: true, recipients: "ops@example.com", frequency: "daily" },
  }),
};

describe("settings validation", () => {
  it("accepts the supported settings payload and extracts officer IDs", () => {
    const result = validateSettingsPayload(validPayload);
    expect(result.error).toBeUndefined();
    expect(result.officerIds).toEqual([1, 2, 3]);
  });

  it("rejects unknown settings and invalid threshold ordering", () => {
    expect(validateSettingsPayload({ ...validPayload, arbitraryDatabaseSetting: "no" }).error).toContain("Unsupported setting");
    expect(validateSettingsPayload({ ...validPayload, agingDays2: "20" }).error).toContain("thresholds");
  });

  it("rejects invalid recipients and malformed officer selections", () => {
    expect(validateSettingsPayload({ ...validPayload, agingEmailTo: "not-an-email" }).error).toContain("recipient email");
    expect(validateSettingsPayload({ ...validPayload, verificationOfficerUserIds: "[0]" }).error).toContain("verificationOfficerUserIds");
    expect(validateSettingsPayload({ ...validPayload, emailAlertPreferences: "{}" }).error).toBeUndefined();
  });

  it("requires recipients for enabled email alert categories", () => {
    const emailAlertPreferences = JSON.stringify({
      clearing_delays: { enabled: true, recipients: "", frequency: "daily" },
    });
    expect(validateSettingsPayload({ ...validPayload, emailAlertPreferences }).error).toContain("email alert preferences");
  });

  it("accepts only the approved read-only AI governance policy", () => {
    const aiAssistantGovernance = JSON.stringify({
      accessRoles: ["admin", "super_admin"],
      mode: "read_only",
      dataDomains: ["finance", "containers", "reports"],
      monthlyBudgetNgn: 100000,
      auditRetentionDays: 365,
      actionPolicy: "human_confirmation_required",
    });
    expect(validateSettingsPayload({ aiAssistantGovernance }).error).toBeUndefined();
    expect(validateSettingsPayload({ aiAssistantGovernance: JSON.stringify({
      accessRoles: ["staff"], mode: "read_write", dataDomains: ["finance"], monthlyBudgetNgn: 100000,
      auditRetentionDays: 365, actionPolicy: "automatic_actions",
    }) }).error).toContain("AI governance settings");
  });

  it("validates staged rollout and token-pricing controls", () => {
    const governance = JSON.stringify({
      accessRoles: ["admin", "super_admin"], mode: "read_only", dataDomains: ["finance"], monthlyBudgetNgn: 100000,
      auditRetentionDays: 365, actionPolicy: "human_confirmation_required", providerEnabled: true,
      rolloutStage: "selected_admins", selectedAdminUserIds: [2], providerInputCostPerMillionNgn: 500, providerOutputCostPerMillionNgn: 2000,
    });
    expect(validateSettingsPayload({ aiAssistantGovernance: governance }).error).toBeUndefined();
    expect(validateSettingsPayload({ aiAssistantGovernance: governance.replace("[2]", "[]") }).error).toContain("AI governance");
  });

  it("accepts only explicit proactive briefing switches", () => {
    expect(validateSettingsPayload({
      aiProactiveBriefingPreferences: JSON.stringify({ enabled: true, daily: true, weekly: false }),
    }).error).toBeUndefined();
    expect(validateSettingsPayload({
      aiProactiveBriefingPreferences: JSON.stringify({ enabled: true, daily: "yes", weekly: false }),
    }).error).toContain("Proactive briefing preferences");
  });
});
