const DEPARTMENT_ALERT_TYPES: Record<string, Set<string>> = {
  transire_user: new Set(["transire_due"]),
  shipping_user: new Set(["shipping_due"]),
  terminal_user: new Set(["terminal_due"]),
  shipping_terminal_user: new Set(["shipping_due", "terminal_due"]),
  pull_out_user: new Set(["pullout_due"]),
};

export function isDepartmentAlertVisible(roles: string[], alertType: string): boolean {
  return roles.some((role) => DEPARTMENT_ALERT_TYPES[role]?.has(alertType) ?? false);
}

export { DEPARTMENT_ALERT_TYPES };
