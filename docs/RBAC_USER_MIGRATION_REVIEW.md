# RBAC User Migration Review

## Purpose

Before anyone's role or workspace access is changed, a Super Admin reviews the
current user records using the read-only migration audit endpoint:

`GET /api/users/rbac-migration-audit`

The endpoint does not write users, change access, create assignments, or
modify sessions. It reports the existing values alongside a proposed profile
and any issue that needs a human decision.

## Who Can Run It

Only a `super_admin` can run the audit because it contains a cross-branch
inventory of user identities and access assignments. The endpoint is protected
by the application's normal authentication and CSRF model; it is a read-only
GET request and does not require a CSRF token.

## What To Review For Each User

1. Confirm the user's branch and active status.
2. Confirm the proposed authority level.
3. Confirm the proposed job function.
4. For Operations users, explicitly choose Transire, Shipping, Terminal, and/or
   Pullout. A generic legacy `operations_user` receives no automatic workspace.
5. Resolve every audit flag before that user is migrated.
6. Record the approved target profile in the later User Management migration UI.

## Audit Flags

| Flag | Meaning | Required decision |
| --- | --- | --- |
| `invalid_roles_json` | Stored `roles` text is not a valid role array. | Recreate the target profile manually. |
| `primary_role_missing_from_roles` | Primary role and multi-role JSON disagree. | Confirm which role represents the user's actual work. |
| `unknown_legacy_role` | A stored role is not in the approved legacy map. | Investigate before migration. |
| `multiple_job_functions` | One user mixes functions such as Accounts and Shipping. | Split responsibilities or grant only the approved function. |
| `legacy_combined_workspace_role` | Old Shipping and Terminal combination is present. | Confirm the user still needs both workspaces. |
| `operations_workspace_selection_required` | Generic Operations has no department selected. | Assign one or more operational workspaces deliberately. |
| `legacy_section_permissions_present` | Old section permission data exists. | Compare it with the new profile before replacing it. |

## Safety Boundary

An audit recommendation is not a permission grant. No automated migration may
expand access, especially for Accounts, combined legacy Shipping and Terminal,
or a user with conflicting job functions. The upcoming migration will preserve
the old fields until each user has been individually approved and tested.
