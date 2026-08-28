# RBAC legacy retirement gate

The application is in a safe, staged migration from the legacy role fields to
access profiles. Access profiles are authoritative only when they are complete
and valid. Any incomplete profile falls back to the existing role behavior.

## Before an account is migrated

1. Configure the account through **User Management -> Access**.
2. Confirm the intended authority level, job function, branch, and workspace.
3. Test login and the user’s normal daily workspace.
4. Obtain the manager or user confirmation that access is correct.

Saving the access profile records `accessProfileMigratedAt`. It deliberately
does not delete or overwrite `role`, `roles`, `sectionPermission`, or
`sectionPermissions`.

## Legacy-role retirement is blocked by design

Do not remove `operations_user`, `shipping_terminal_user`, `customs_user`,
generic stage-owner compatibility, or legacy section permissions while any
active user remains in legacy or invalid profile state. The migration dashboard
reports that status, but it never declares deletion safe automatically.

A separate, approved release is required after all active and archived accounts
have an explicit migration/retirement decision, access testing has been
recorded, and the affected notification and route consumers have been migrated.
