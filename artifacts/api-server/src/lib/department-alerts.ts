import { hasWorkspace, type ResolvedAccessProfile } from "./authorization.js";

/**
 * Due-date alerts are strictly workspace-scoped. A profile can be assigned
 * more than one operations workspace, but it never inherits another team's
 * alerts from a historical role label.
 */
export function isDepartmentAlertVisible(profile: ResolvedAccessProfile, alertType: string): boolean {
  return (
    (alertType === "transire_due" && hasWorkspace(profile, "transire")) ||
    (alertType === "shipping_due" && hasWorkspace(profile, "shipping")) ||
    (alertType === "terminal_due" && hasWorkspace(profile, "terminal")) ||
    (alertType === "pullout_due" && hasWorkspace(profile, "pullout"))
  );
}
