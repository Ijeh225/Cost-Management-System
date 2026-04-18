import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/components/layout/auth-provider";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuth } from "@/components/layout/auth-provider";
import { useEffect, useRef, Component } from "react";
import type { ReactNode } from "react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

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
import ClientsPage from "@/pages/clients/index";
import ClientDetailPage from "@/pages/clients/[id]";
import ContainerPrintPage from "@/pages/containers/print/[id]";
import NotificationsPage from "@/pages/notifications/index";
import SettingsPage from "@/pages/settings/index";
import InvoicesPage from "@/pages/invoices/index";
import InvoiceDetailPage from "@/pages/invoices/[id]";
import InvoicePrintPage from "@/pages/invoices/print/[id]";
import PipelinePage from "@/pages/pipeline/index";
import OperationsPage from "@/pages/operations/index";
import ArPage from "@/pages/ar/index";
import ClientStatementPrint from "@/pages/reports/client-statement/print";
import VatSummaryPrint from "@/pages/reports/vat-summary/print";
import InvoiceAgingPrint from "@/pages/reports/invoice-aging/print";
import DeliveryReportPrint from "@/pages/reports/delivery-report/print";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[PageErrorBoundary] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "An unexpected error occurred while loading this page."}
            </p>
          </div>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AdminGuard({ children }: { children: ReactNode }) {
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
      <Route path="/invoices/:id/print" component={InvoicePrintPage} />
      <Route path="/reports/client-statement/print" component={ClientStatementPrint} />
      <Route path="/reports/vat-summary/print" component={VatSummaryPrint} />
      <Route path="/reports/invoice-aging/print" component={InvoiceAgingPrint} />
      <Route path="/reports/delivery-report/print" component={DeliveryReportPrint} />
      <Route>
        <AppLayout>
          <PageErrorBoundary>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/containers" component={Containers} />
              <Route path="/containers/upload" component={UploadPage} />
              <Route path="/containers/:id" component={ContainerDetail} />
              <Route path="/users" component={Users} />
              <Route path="/approvals" component={ApprovalsPage} />
              <Route path="/my-tasks" component={MyTasksPage} />
              <Route path="/analytics">
                <AdminGuard><AnalyticsPage /></AdminGuard>
              </Route>
              <Route path="/reports">
                <AdminGuard><ReportsPage /></AdminGuard>
              </Route>
              <Route path="/clients" component={ClientsPage} />
              <Route path="/clients/:id" component={ClientDetailPage} />
              <Route path="/notifications" component={NotificationsPage} />
              <Route path="/operations" component={OperationsPage} />
              <Route path="/pipeline" component={PipelinePage} />
              <Route path="/accounts-receivable" component={ArPage} />
              <Route path="/invoices" component={InvoicesPage} />
              <Route path="/invoices/:id" component={InvoiceDetailPage} />
              <Route path="/settings">
                <AdminGuard><SettingsPage /></AdminGuard>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </PageErrorBoundary>
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
