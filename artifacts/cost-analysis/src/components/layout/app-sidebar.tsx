import { Link, useLocation } from "wouter";
import { useAuth } from "./auth-provider";
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
import { LayoutDashboard, Box, UploadCloud, Users, ShieldAlert, ClipboardCheck, ListTodo, BarChart2, FileDown, Layers } from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { isAdmin } = useAuth();

  const mainNav = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard },
    { title: "Containers", url: "/containers", icon: Box },
    { title: "My Tasks", url: "/my-tasks", icon: ListTodo },
  ];

  const adminNav = [
    { title: "Approval Queue", url: "/approvals", icon: ClipboardCheck },
    { title: "Analytics", url: "/analytics", icon: BarChart2 },
    { title: "Reports", url: "/reports", icon: FileDown },
    { title: "Section Builder", url: "/sections", icon: Layers },
    { title: "Upload Data", url: "/upload", icon: UploadCloud },
    { title: "User Management", url: "/users", icon: Users },
  ];

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
            Operations
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => {
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
