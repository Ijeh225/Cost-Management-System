import { Link, useLocation } from "wouter";
import { useAuth } from "./auth-provider";
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
  Truck, Kanban, Banknote,
} from "lucide-react";

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: number;
};

function NotificationsBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary border border-primary/30">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { isAdmin, isSuperAdmin, isAuthenticated, user, isDocumentationUser, isAccountsUser, isOperationsUser, isTerminalManager, isDeliveryUser, isDepartmentUser } = useAuth();

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
    { title: "My Tasks",        url: "/my-tasks",       icon: ListTodo         },
    { title: "Notifications",   url: "/notifications",  icon: Bell, badge: unreadCount },
    ...(staffCanUpload ? [{ title: "Upload Data", url: "/containers/upload", icon: UploadCloud }] : []),
  ];

  const adminNav: NavItem[] = [
    { title: "Approval Queue",   url: "/approvals",          icon: ClipboardCheck },
    { title: "Pipeline Board",   url: "/pipeline",           icon: Kanban          },
    { title: "Analytics",        url: "/analytics",          icon: BarChart2       },
    { title: "Reports",          url: "/reports",            icon: FileDown        },
    { title: "Upload Data",      url: "/containers/upload",  icon: UploadCloud     },
    { title: "User Management",  url: "/users",              icon: Users           },
    ...(isSuperAdmin ? [{ title: "Settings", url: "/settings", icon: Settings }] : []),
  ];

  const deptNav: NavItem[] = isDocumentationUser
    ? [
        { title: "My Jobs",            url: "/workspace/documentation", icon: FileCheck2      },
      ]
    : isAccountsUser
    ? [
        { title: "Duty Payments",      url: "/duty-payments",           icon: Banknote        },
        { title: "Accounts Workspace", url: "/workspace/accounts",      icon: BookOpen        },
      ]
    : isOperationsUser
    ? [
        { title: "My Jobs",            url: "/workspace/operations",    icon: Activity        },
      ]
    : isTerminalManager
    ? [
        { title: "Terminal Workspace", url: "/workspace/terminal",      icon: Building2       },
      ]
    : isDeliveryUser
    ? [
        { title: "Deliveries",         url: "/workspace/delivery",      icon: Truck           },
      ]
    : [];

  const navItems = isDepartmentUser ? deptNav : mainNav;

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-border/50">
      <SidebarHeader className="h-16 flex items-center justify-center px-4 border-b border-border/50">
        <div className="flex items-center gap-2 w-full font-bold text-lg text-primary tracking-tight overflow-hidden">
          <Box className="w-6 h-6 shrink-0 text-primary" />
          <span className="truncate group-data-[collapsible=icon]:hidden">COST</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
            {isDepartmentUser ? "My Workspace" : "Operations"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
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

        {isAdmin && (
          <SidebarGroup className="mt-6">
            <SidebarGroupLabel className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
              <ShieldAlert className="w-3 h-3" /> Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => {
                  const isActive = location === item.url || location.startsWith(item.url);
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50 text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
        v1.0.0 Enterprise
      </SidebarFooter>
    </Sidebar>
  );
}
