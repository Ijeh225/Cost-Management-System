# RBAC Restructuring Foundation

## Purpose

This document is the approved foundation for the User Role restructuring. It
standardizes how access is described before any live permission enforcement or
user migration changes. It does not change current user access by itself.

## Four Separate Access Decisions

Every future user profile will answer four separate questions.

1. **Authority level**: how much administrative authority does the person have?
2. **Job function**: what business function is the person's primary work?
3. **Workspace access**: which department workspaces can that person open?
4. **Capabilities**: what actions can they perform in those workspaces?

The current `role`, `roles`, `sectionPermission`, and `sectionPermissions`
fields remain in place until the migration is complete. They must not be
deleted, rewritten, or reinterpreted by this foundation phase.

## Authority Levels

| Authority | Scope | Intended responsibility |
| --- | --- | --- |
| Super Admin | All authorized branches | System configuration, role policy, company-wide controls, audit oversight. |
| Admin | Assigned branch scope | Operational and financial administration within permitted branches. |
| Branch Admin | Own branch only | Staff and branch administration within their own branch; cannot grant elevated authority. |
| Staff | Own branch and assigned workspaces | Perform assigned departmental work only. |

Authority is not a department. For example, an Accounts employee is normally
`staff` authority with the `accounts` job function. A user should not receive
Finance, Shipping, Terminal, or Pullout access merely because their old role
array happens to contain a related legacy value.

## Job Functions And Workspaces

| Job function | Workspace assignment rule | Workspaces |
| --- | --- | --- |
| General Staff | No specialist workspace by default | None |
| Documentation | Fixed specialist workspace | Documentation |
| Accounts | Fixed specialist workspace, finance-only | Accounts |
| Operations | One or more explicitly assigned operational workspaces | Transire, Shipping, Terminal, Pullout |
| Terminal Manager | Fixed supervisory workspace | Terminal Manager |
| Delivery | Fixed specialist workspace | Delivery |
| Security | Fixed specialist workspace | Security |

Only Operations can be assigned several operational workspaces. For example,
one Operations user may work in Shipping and Terminal. Accounts is not an
Operations workspace and does not inherit Transire, Shipping, Terminal, or
Pullout access.

## Permission Matrix

This matrix is the target policy. Route-level enforcement will be introduced
later, module by module, after test coverage exists for each row.

| Area | Super Admin | Admin | Branch Admin | Documentation | Accounts | Operations | Terminal Manager | Delivery | Security |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View branch-scoped containers | Yes | Yes | Own branch | Assigned work | Assigned work | Assigned workspace | Terminal overview | Assigned delivery jobs | Assigned gate jobs |
| Manage user authority or role policy | Yes | No | No | No | No | No | No | No | No |
| Manage branch staff | Yes | Assigned branch | Own branch, non-elevated only | No | No | No | No | No | No |
| Documentation work | Yes | Yes | Own branch where assigned | Yes | No | No | Read-only only when required | No | No |
| Financial records, invoices, payments, banks, schedules, overhead | Yes | Permitted branch functions | No by default | No | Yes | No | No | No | No |
| Transire, Shipping, Terminal, Pullout actions | Yes | Yes where assigned | View only unless separately assigned | No | No | Only assigned workspace | View and supervise, not officer actions | No | No |
| Terminal operational overview and escalation | Yes | Yes | Own branch view | No | No | Assigned operational view | Yes | No | No |
| Delivery and empty-return actions | Yes | Yes where assigned | View only unless separately assigned | No | No | No | View only where needed | Yes | No |
| Gate security actions | Yes | Yes where assigned | View only unless separately assigned | No | No | No | No | No | Yes |
| Company-wide settings and audit review | Yes | Read-only where explicitly allowed | No | No | No | No | No | No | No |

"Yes" always remains subject to branch scope, record assignment, officer
assignment, approval limits, and any later capability guard. This table does
not bypass existing Verification Officer, Berthing Officer, payment approval,
or branch-isolation rules.

## Terminal Manager Boundary

The Terminal Manager is a supervisor, not a replacement for every operational
officer. The workspace should show terminal progress, ageing, examination,
release, delivery readiness, responsible owners, delays, and escalations. It
must not expose finance controls or allow the manager to complete Transire,
Shipping, Terminal/TDO, or Pullout actions unless they also have the matching
Operations workspace assignment.

## Legacy Role Translation

| Current stored role | Target function | Target workspace | Migration note |
| --- | --- | --- | --- |
| `documentation_user` | Documentation | Documentation | Direct mapping |
| `accounts_user` | Accounts | Accounts | Finance-only mapping |
| `operations_user` | Operations | Manual selection required | Do not grant every operational workspace automatically |
| `transire_user` | Operations | Transire | Direct mapping |
| `shipping_user` | Operations | Shipping | Direct mapping |
| `terminal_user` | Operations | Terminal | Direct mapping |
| `pull_out_user` | Operations | Pullout | Direct mapping |
| `shipping_terminal_user` | Operations | Shipping and Terminal | Legacy combination; retain only until each user is migrated |
| `terminal_manager` | Terminal Manager | Terminal Manager | Direct mapping |
| `delivery_user` | Delivery | Delivery | Direct mapping |
| `security_user` | Security | Security | Direct mapping |

The legacy roles are compatibility data, not a new permission source. They
will be removed only after every user is reviewed, migrated, tested, and the
replacement authorization checks are live.

## Non-Negotiable Migration Rules

- No automatic access expansion.
- No deletion of legacy roles or fields in the first migration.
- The backend is the security boundary; menus only hide unavailable features.
- All write actions keep their existing CSRF, branch, officer, and audit rules.
- Route changes are released with tests for allowed and denied users.
- The tag `checkpoint-before-user-role-restructuring-2026-08-28` remains the
  rollback point before this work started.
