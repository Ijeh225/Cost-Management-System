import { describe, expect, it } from "vitest";
import { isDepartmentAlertVisible } from "../lib/department-alerts.js";

describe("department workflow notification visibility", () => {
  it("shows each department only its own stage notifications", () => {
    expect(isDepartmentAlertVisible(["transire_user"], "transire_due")).toBe(true);
    expect(isDepartmentAlertVisible(["transire_user"], "shipping_due")).toBe(false);

    expect(isDepartmentAlertVisible(["shipping_user"], "shipping_due")).toBe(true);
    expect(isDepartmentAlertVisible(["shipping_user"], "terminal_due")).toBe(false);

    expect(isDepartmentAlertVisible(["terminal_user"], "terminal_due")).toBe(true);
    expect(isDepartmentAlertVisible(["terminal_user"], "pullout_due")).toBe(false);

    expect(isDepartmentAlertVisible(["pull_out_user"], "pullout_due")).toBe(true);
    expect(isDepartmentAlertVisible(["pull_out_user"], "transire_due")).toBe(false);
  });

  it("allows the combined shipping and terminal role to receive both assigned stages", () => {
    expect(isDepartmentAlertVisible(["shipping_terminal_user"], "shipping_due")).toBe(true);
    expect(isDepartmentAlertVisible(["shipping_terminal_user"], "terminal_due")).toBe(true);
    expect(isDepartmentAlertVisible(["shipping_terminal_user"], "pullout_due")).toBe(false);
  });
});
