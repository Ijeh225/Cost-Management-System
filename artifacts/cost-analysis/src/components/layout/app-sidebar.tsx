import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "./auth-provider";
import { useTheme } from "./theme-provider";
import { useBranchScope } from "./branch-provider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useGetNotifications, type NotificationsResponse } from "@workspace/api-client-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, Box, UploadCloud, Users, ShieldAlert, ClipboardCheck,
  ListTodo, BarChart2, FileDown, Building2, Bell, Settings, FileText, Activity, BookOpen, FileCheck2,
  Truck, Kanban, Banknote, Anchor, Ship, PackageOpen, ChevronDown, ShieldCheck,
  Sun, Moon, Landmark, TrendingDown, CreditCard, CalendarClock,
} from "lucide-react";

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: number;
  match?: "exact" | "prefix";
};

function NotificationsBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary border border-primary/30">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function isNavItemActive(location: string, item: NavItem) {
  if (item.match === "exact" || item.url === "/") {
    return location === item.url;
  }

  return location === item.url || location.startsWith(`${item.url}/`);
}

export function AppSidebar() {
  const [location] = useLocation();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { isAdmin, isSuperAdmin, isBranchAdmin, isAdminOrAbove, isBranchMember, isAuthenticated, user, isDocumentationUser, isAccountsUser, isOperationsUser, isTransireUser, isShippingUser, isTerminalUser, isPullOutUser, isShippingTerminalUser, isTerminalManager, isDeliveryUser, isDepartmentUser, isSecurityUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeBranchId, setActiveBranch, branches } = useBranchScope();
  const userBranchName = user?.branchName
    ?? branches.find(b => b.id === user?.branchId)?.name
    ?? (user?.branchId ? `Branch ${user.branchId}` : "");

  const { data: notifData } = useGetNotifications<NotificationsResponse>({
    query: { refetchInterval: 60_000, enabled: !!isAuthenticated },
  });
  const unreadCount: number = notifData?.unreadCount ?? 0;

  const staffCanUpload = !isAdmin && !isDepartmentUser && (user?.canUpload ?? false);

  // Duty Payments is restricted to admin / super_admin / accounts_user
  // (accounts_user lands on this entry via deptNav below). Hiding it from
  // every other role on the main nav, including `staff`.
  const canSeeDutyPayments = isAdmin || isSuperAdmin || isAccountsUser;

  const mainNav: NavItem[] = [
    { title: "Dashboard",       url: "/",               icon: LayoutDashboard },
    { title: "Operations",      url: "/operations",     icon: Activity         },
    { title: "Documentation",   url: "/documentation",  icon: FileCheck2       },
    { title: "Containers",      url: "/containers",     icon: Box              },
    { title: "Clients",         url: "/clients",        icon: Building2        },
    { title: "Invoices",        url: "/invoices",       icon: FileText         },
    ...(canSeeDutyPayments ? [{ title: "Duty Payments", url: "/duty-payments", icon: Banknote }] : []),
    { title: "Accounts Receivable", url: "/accounts-receivable", icon: BookOpen },
    { title: "Payment Schedule", url: "/payment-schedules", icon: CalendarClock },
    { title: "My Tasks",        url: "/my-tasks",       icon: ListTodo         },
    { title: "Notifications",   url: "/notifications",  icon: Bell, badge: unreadCount },
    ...(staffCanUpload ? [{ title: "Upload Data", url: "/containers/upload", icon: UploadCloud }] : []),
  ];

  const adminNav: NavItem[] = [
    { title: "Approval Queue",   url: "/approvals",              icon: ClipboardCheck },
    { title: "Pipeline Board",   url: "/pipeline",               icon: Kanban          },
    { title: "Analytics",        url: "/analytics",              icon: BarChart2       },
    ...(isBranchMember ? [{ title: "Reports", url: "/reports", icon: FileDown }] : []),
    ...(isSuperAdmin ? [{ title: "Branch Comparison", url: "/reports/branch-comparison", icon: BarChart2 }] : []),
    { title: "Bank Management",  url: "/banks",                  icon: Landmark        },
    { title: "Container Payments", url: "/container-payments",  icon: CreditCard      },
    { title: "Overhead Expenses", url: "/overhead-expenses",     icon: TrendingDown    },
    { title: "Upload Data",      url: "/containers/upload",      icon: UploadCloud     },
    { title: "User Management",  url: "/users",                  icon: Users           },
    ...(isSuperAdmin ? [{ title: "Branches", url: "/settings/branches", icon: Building2 }] : []),
    ...(isSuperAdmin ? [{ title: "Settings", url: "/settings", icon: Settings, match: "exact" as const }] : []),
    ...(isBranchAdmin ? [{ title: "Branch Settings", url: "/branch-settings", icon: Settings }] : []),
  ];

  const adminWorkspaceNav: NavItem[] = [
    { title: "Transire Jobs",  url: "/workspace/transire",     icon: FileCheck2  },
    { title: "Shipping Jobs",  url: "/workspace/shipping",     icon: Ship        },
    { title: "Terminal Jobs",  url: "/workspace/terminal-ops", icon: Building2   },
    { title: "Pull-Out Jobs",  url: "/workspace/pull-out",     icon: PackageOpen },
  ];

  const anyWorkspaceActive = adminWorkspaceNav.some(
    item => isNavItemActive(location, item)
  );

  const deptNav: NavItem[] = [
    ...(isDocumentationUser ? [{ title: "My Jobs",            url: "/documentation",           icon: FileCheck2  }] : []),
    ...(isAccountsUser      ? [{ title: "Duty Payments",      url: "/duty-payments",           icon: Banknote    },
                                { title: "Payment Schedule",  url: "/payment-schedules",       icon: CalendarClock },
                                { title: "Accounts Workspace", url: "/workspace/accounts",      icon: BookOpen    }] : []),
    ...((isTransireUser || isOperationsUser) ? [{ title: "My Jobs", url: "/workspace/transire", icon: FileCheck2 }] : []),
    ...(isShippingUser      ? [{ title: "My Jobs", url: "/workspace/shipping",     icon: Ship        }] : []),
    ...(isShippingTerminalUser && !isShippingUser
                            ? [{ title: "My Jobs", url: "/workspace/shipping",     icon: Ship        }] : []),
    ...(isTerminalUser      ? [{ title: "My Jobs", url: "/workspace/terminal-ops", icon: Building2   }] : []),
    ...(isPullOutUser       ? [{ title: "My Jobs", url: "/workspace/pull-out",     icon: PackageOpen }] : []),
    ...(isTerminalManager   ? [{ title: "Terminal Workspace", url: "/workspace/terminal",      icon: Building2   }] : []),
    ...(isDeliveryUser      ? [{ title: "Deliveries",         url: "/workspace/delivery",      icon: Truck       },
                                { title: "Active Jobs",        url: "/operations",              icon: Activity    }] : []),
    ...(isSecurityUser      ? [{ title: "Gate Security",      url: "/gate",                    icon: ShieldCheck }] : []),
  ];

  const navItems = isDepartmentUser ? deptNav : mainNav;

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="flex flex-col items-stretch px-4 py-3 gap-2 border-b border-border/50">
        <div className="flex items-center gap-2 w-full font-bold text-lg text-primary tracking-tight overflow-hidden h-10">
          <Box className="w-6 h-6 shrink-0 text-primary" />
          <span className="truncate group-data-[collapsible=icon]:hidden">COST</span>
        </div>
        {isAuthenticated && (
          <div className="group-data-[collapsible=icon]:hidden">
            {isSuperAdmin ? (
              <Select
                value={activeBranchId === "all" ? "all" : String(activeBranchId)}
                onValueChange={(v) => setActiveBranch(v === "all" ? "all" : Number(v))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="branch-switcher">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.filter(b => b.isActive).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="w-full justify-center text-xs font-medium" data-testid="branch-badge">
                <Building2 className="w-3 h-3 mr-1" />
                {userBranchName}
              </Badge>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
            {isDepartmentUser ? "My Workspace" : "Operations"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isNavItemActive(location, item);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={`
                        transition-all duration-200
                        ${isActive ? "bg-primary/10 text-primary font-medium border-r-2 border-primary rounded-none" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
                      `}
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full px-3">
                        <div className="relative shrink-0">
                          <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                          {(item as any).badge > 0 && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary group-data-[collapsible=icon]:block hidden" />
                          )}
                        </div>
                        <span className="flex-1">{item.title}</span>
                        {(item as any).badge != null && (
                          <NotificationsBadge count={(item as any).badge} />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdminOrAbove && (
          <SidebarGroup className="mt-6">
            <SidebarGroupLabel className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
              <ShieldAlert className="w-3 h-3" /> Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => {
                  const isActive = isNavItemActive(location, item);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={`
                          transition-all duration-200
                          ${isActive ? "bg-primary/10 text-primary font-medium border-r-2 border-primary rounded-none" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
                        `}
                      >
                        <Link href={item.url} className="flex items-center gap-3 w-full px-3">
                          <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

                {/* Collapsible Workspace Access sub-group */}
                <SidebarMenuItem>
                  <button
                    onClick={() => setWorkspaceOpen(o => !o)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200
                      ${anyWorkspaceActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                  >
                    <Kanban className={`w-4 h-4 shrink-0 ${anyWorkspaceActive ? "text-primary" : ""}`} />
                    <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">Workspace Access</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden
                        ${workspaceOpen || anyWorkspaceActive ? "rotate-180" : ""}`}
                    />
                  </button>
                </SidebarMenuItem>

                {(workspaceOpen || anyWorkspaceActive) && adminWorkspaceNav.map((item) => {
                  const isActive = isNavItemActive(location, item);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={`
                          transition-all duration-200 pl-8
                          ${isActive ? "bg-primary/10 text-primary font-medium border-r-2 border-primary rounded-none" : "text-muted-foreground hover:text-foreground hover:bg-accent"}
                        `}
                      >
                        <Link href={item.url} className="flex items-center gap-3 w-full px-3">
                          <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">v1.0.0 Enterprise</span>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
