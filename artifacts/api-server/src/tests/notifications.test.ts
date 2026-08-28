import { describe, expect, it } from "vitest";
import { isDepartmentAlertVisible } from "../lib/department-alerts.js";
import { resolveAccessProfile } from "../lib/authorization.js";

function operationsProfile(workspaces: string[]) {
  return resolveAccessProfile({
    authorityLevel: "staff",
    jobFunction: "operations",
    workspaceAccess: JSON.stringify(workspaces),
    accessProfileMigratedAt: new Date(),
  });
}

describe("department workflow notification visibility", () => {
  it("shows each department only its own stage notifications", () => {
    expect(isDepartmentAlertVisible(operationsProfile(["transire"]), "transire_due")).toBe(true);
    expect(isDepartmentAlertVisible(operationsProfile(["transire"]), "shipping_due")).toBe(false);

    expect(isDepartmentAlertVisible(operationsProfile(["shipping"]), "shipping_due")).toBe(true);
    expect(isDepartmentAlertVisible(operationsProfile(["shipping"]), "terminal_due")).toBe(false);

    expect(isDepartmentAlertVisible(operationsProfile(["terminal"]), "terminal_due")).toBe(true);
    expect(isDepartmentAlertVisible(operationsProfile(["terminal"]), "pullout_due")).toBe(false);

    expect(isDepartmentAlertVisible(operationsProfile(["pullout"]), "pullout_due")).toBe(true);
    expect(isDepartmentAlertVisible(operationsProfile(["pullout"]), "transire_due")).toBe(false);
  });

  it("allows a multi-workspace operations profile to receive both assigned stages", () => {
    const profile = operationsProfile(["shipping", "terminal"]);
    expect(isDepartmentAlertVisible(profile, "shipping_due")).toBe(true);
    expect(isDepartmentAlertVisible(profile, "terminal_due")).toBe(true);
    expect(isDepartmentAlertVisible(profile, "pullout_due")).toBe(false);
  });
});
