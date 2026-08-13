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
});
