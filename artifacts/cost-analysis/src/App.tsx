import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/components/layout/auth-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/components/layout/auth-provider";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

// Pages
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import Dashboard from "@/pages/dashboard";
import Containers from "@/pages/containers/index";
import UploadPage from "@/pages/containers/upload";
import ContainerDetail from "@/pages/containers/[id]";
import Users from "@/pages/users/index";
import ApprovalsPage from "@/pages/approvals/index";
import MyTasksPage from "@/pages/my-tasks/index";
import AnalyticsPage from "@/pages/analytics/index";
import ReportsPage from "@/pages/reports/index";
import ContainerPrintPage from "@/pages/containers/print/[id]";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const adminConfirmed = useRef(false);

  if (isAdmin && !adminConfirmed.current) {
    adminConfirmed.current = true;
  }

  useEffect(() => {
    if (isLoading) return;
    if (adminConfirmed.current) return;
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (!isAdmin) {
      setLocation("/");
    }
  }, [isAdmin, isLoading, isAuthenticated, setLocation]);

  if (!adminConfirmed.current) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />
      <Route path="/containers/:id/print" component={ContainerPrintPage} />
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/containers" component={Containers} />
            <Route path="/containers/upload" component={UploadPage} />
            <Route path="/containers/:id" component={ContainerDetail} />
            <Route path="/users" component={Users} />
            <Route path="/upload" component={UploadPage} />
            <Route path="/approvals" component={ApprovalsPage} />
            <Route path="/my-tasks" component={MyTasksPage} />
            <Route path="/analytics">
              <AdminGuard><AnalyticsPage /></AdminGuard>
            </Route>
            <Route path="/reports">
              <AdminGuard><ReportsPage /></AdminGuard>
            </Route>
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
