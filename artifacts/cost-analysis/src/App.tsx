import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, type WorkspaceKey } from "@/components/layout/auth-provider";
import { BranchProvider } from "@/components/layout/branch-provider";
import { ThemeProvider } from "@/components/layout/theme-provider";
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
import OperationDetailPage from "@/pages/operations/[id]";
import ArPage from "@/pages/ar/index";
import DutyPaymentsPage from "@/pages/duty-payments/index";
import BanksPage from "@/pages/banks/index";
import BankDetailPage from "@/pages/banks/[id]";
import OverheadExpensesPage from "@/pages/overhead-expenses/index";
import OverheadExpensePrintPage from "@/pages/overhead-expenses/print/[id]";
import PaymentSchedulesPage from "@/pages/payment-schedules/index";
import ContainerPaymentsPage from "@/pages/container-payments/index";
import DocumentationWorkspace from "@/pages/workspace/documentation";
import AccountsWorkspace from "@/pages/workspace/accounts";
import TransireWorkspace from "@/pages/workspace/transire";
import ShippingWorkspace from "@/pages/workspace/shipping";
import TerminalOpsWorkspace from "@/pages/workspace/terminal-ops";
import PullOutWorkspace from "@/pages/workspace/pull-out";
import TerminalWorkspace from "@/pages/workspace/terminal";
import DeliveryWorkspace from "@/pages/workspace/delivery";
import GatePage from "@/pages/gate/index";
import ClientStatementPrint from "@/pages/reports/client-statement/print";
import VatSummaryPrint from "@/pages/reports/vat-summary/print";
import InvoiceAgingPrint from "@/pages/reports/invoice-aging/print";
import CashFlowPrint from "@/pages/reports/cashflow/print";
import CashFlowPage from "@/pages/reports/cashflow/index";
import ProfitLossPrint from "@/pages/reports/pl/print";
import DeliveryReportPrint from "@/pages/reports/delivery-report/print";
import DisbursementReconciliationPage from "@/pages/reports/disbursement-reconciliation/index";
import BranchComparisonPage from "@/pages/reports/branch-comparison/index";
import BranchComparisonPrint from "@/pages/reports/branch-comparison/print";
import CreditNotePrintPage from "@/pages/credit-notes/print/[id]";
import BranchesPage from "@/pages/branches/index";
import BranchSettingsPage from "@/pages/branch-settings/index";
import AiAssistantPage from "@/pages/ai-assistant/index";

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

function BranchAdminOrAboveGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, isAdminOrAbove } = useAuth();
  const [, setLocation] = useLocation();
  const confirmed = useRef(false);
  if (isAdminOrAbove && !confirmed.current) confirmed.current = true;
  useEffect(() => {
    if (isLoading) return;
    if (confirmed.current) return;
    if (!isAuthenticated) setLocation("/login");
    else if (!isAdminOrAbove) setLocation("/");
  }, [isAdminOrAbove, isLoading, isAuthenticated, setLocation]);
  if (!confirmed.current) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}

function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();
  void user;
  const confirmed = useRef(false);

  if (isSuperAdmin && !confirmed.current) {
    confirmed.current = true;
  }

  useEffect(() => {
    if (isLoading) return;
    if (confirmed.current) return;
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (!isSuperAdmin) {
      setLocation("/");
    }
  }, [isSuperAdmin, isLoading, isAuthenticated, setLocation]);

  if (!confirmed.current) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

function AccessGuard({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  const { isAuthenticated, isLoading, workspaceHome } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (!allowed) {
      setLocation(workspaceHome ?? "/", { replace: true });
    }
  }, [allowed, isAuthenticated, isLoading, setLocation, workspaceHome]);

  if (isLoading || !isAuthenticated || !allowed) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

function FinanceGuard({ children }: { children: ReactNode }) {
  const { canAccessFinance } = useAuth();
  return <AccessGuard allowed={canAccessFinance}>{children}</AccessGuard>;
}

function WorkspaceGuard({ workspace, children }: { workspace: WorkspaceKey; children: ReactNode }) {
  const { accessProfile, isAdminOrAbove } = useAuth();
  const allowed = isAdminOrAbove || accessProfile?.workspaces.includes(workspace) === true;
  return <AccessGuard allowed={allowed}>{children}</AccessGuard>;
}

function WorkspaceDocumentationRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/documentation", { replace: true }); }, [navigate]);
  return null;
}

function WorkspaceShippingRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/workspace/shipping", { replace: true }); }, [navigate]);
  return null;
}

function WorkspaceOperationsRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/workspace/transire", { replace: true }); }, [navigate]);
  return null;
}

function HomeRoute() {
  const {
    isLoading,
    isDepartmentUser,
    workspaceHome,
  } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (workspaceHome) setLocation(workspaceHome, { replace: true });
  }, [
    isLoading,
    workspaceHome,
    setLocation,
  ]);

  if (isLoading || (isDepartmentUser && workspaceHome)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />
      <Route path="/containers/:id/print"><FinanceGuard><ContainerPrintPage /></FinanceGuard></Route>
      <Route path="/invoices/:id/print"><FinanceGuard><InvoicePrintPage /></FinanceGuard></Route>
      <Route path="/overhead-expenses/:id/print"><FinanceGuard><OverheadExpensePrintPage /></FinanceGuard></Route>
      <Route path="/credit-notes/:id/print"><FinanceGuard><CreditNotePrintPage /></FinanceGuard></Route>
      <Route path="/reports/client-statement/print"><FinanceGuard><ClientStatementPrint /></FinanceGuard></Route>
      <Route path="/reports/vat-summary/print"><FinanceGuard><VatSummaryPrint /></FinanceGuard></Route>
      <Route path="/reports/invoice-aging/print"><FinanceGuard><InvoiceAgingPrint /></FinanceGuard></Route>
      <Route path="/reports/cashflow/print"><FinanceGuard><CashFlowPrint /></FinanceGuard></Route>
      <Route path="/reports/pl/print"><FinanceGuard><ProfitLossPrint /></FinanceGuard></Route>
      <Route path="/reports/delivery-report/print"><FinanceGuard><DeliveryReportPrint /></FinanceGuard></Route>
      <Route path="/reports/branch-comparison/print"><SuperAdminGuard><BranchComparisonPrint /></SuperAdminGuard></Route>
      <Route>
        <AppLayout>
          <PageErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRoute} />
              <Route path="/containers" component={Containers} />
              <Route path="/containers/upload" component={UploadPage} />
              <Route path="/containers/:id" component={ContainerDetail} />
              <Route path="/users"><BranchAdminOrAboveGuard><Users /></BranchAdminOrAboveGuard></Route>
              <Route path="/approvals"><BranchAdminOrAboveGuard><ApprovalsPage /></BranchAdminOrAboveGuard></Route>
              <Route path="/my-tasks" component={MyTasksPage} />
              <Route path="/analytics">
                <BranchAdminOrAboveGuard><AnalyticsPage /></BranchAdminOrAboveGuard>
              </Route>
              <Route path="/reports/branch-comparison">
                <SuperAdminGuard><BranchComparisonPage /></SuperAdminGuard>
              </Route>
              <Route path="/reports">
                <FinanceGuard><ReportsPage /></FinanceGuard>
              </Route>
              <Route path="/reports/cashflow">
                <FinanceGuard><CashFlowPage /></FinanceGuard>
              </Route>
              <Route path="/reports/disbursement-reconciliation">
                <FinanceGuard><DisbursementReconciliationPage /></FinanceGuard>
              </Route>
              <Route path="/clients"><FinanceGuard><ClientsPage /></FinanceGuard></Route>
              <Route path="/clients/:id"><FinanceGuard><ClientDetailPage /></FinanceGuard></Route>
              <Route path="/notifications" component={NotificationsPage} />
              <Route path="/operations"><BranchAdminOrAboveGuard><OperationsPage /></BranchAdminOrAboveGuard></Route>
              <Route path="/operations/:id" component={OperationDetailPage} />
              <Route path="/documentation"><WorkspaceGuard workspace="documentation"><DocumentationWorkspace /></WorkspaceGuard></Route>
              <Route path="/pipeline"><BranchAdminOrAboveGuard><PipelinePage /></BranchAdminOrAboveGuard></Route>
              <Route path="/accounts-receivable"><FinanceGuard><ArPage /></FinanceGuard></Route>
              <Route path="/duty-payments"><FinanceGuard><DutyPaymentsPage /></FinanceGuard></Route>
              <Route path="/banks">
                <FinanceGuard><BanksPage /></FinanceGuard>
              </Route>
              <Route path="/banks/:id">
                <FinanceGuard><BankDetailPage /></FinanceGuard>
              </Route>
              <Route path="/overhead-expenses">
                <FinanceGuard><OverheadExpensesPage /></FinanceGuard>
              </Route>
              <Route path="/payment-schedules">
                <FinanceGuard><PaymentSchedulesPage /></FinanceGuard>
              </Route>
              <Route path="/container-payments">
                <FinanceGuard><ContainerPaymentsPage /></FinanceGuard>
              </Route>
              <Route path="/workspace/documentation"><WorkspaceGuard workspace="documentation"><WorkspaceDocumentationRedirect /></WorkspaceGuard></Route>
              <Route path="/workspace/accounts"><WorkspaceGuard workspace="accounts"><AccountsWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/transire"><WorkspaceGuard workspace="transire"><TransireWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/shipping"><WorkspaceGuard workspace="shipping"><ShippingWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/terminal-ops"><WorkspaceGuard workspace="terminal"><TerminalOpsWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/pull-out"><WorkspaceGuard workspace="pullout"><PullOutWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/shipping-terminal"><WorkspaceGuard workspace="shipping"><WorkspaceShippingRedirect /></WorkspaceGuard></Route>
              <Route path="/workspace/operations"><WorkspaceGuard workspace="transire"><WorkspaceOperationsRedirect /></WorkspaceGuard></Route>
              <Route path="/workspace/terminal"><WorkspaceGuard workspace="terminal_manager"><TerminalWorkspace /></WorkspaceGuard></Route>
              <Route path="/workspace/delivery"><WorkspaceGuard workspace="delivery"><DeliveryWorkspace /></WorkspaceGuard></Route>
              <Route path="/gate"><WorkspaceGuard workspace="security"><GatePage /></WorkspaceGuard></Route>
              <Route path="/invoices"><FinanceGuard><InvoicesPage /></FinanceGuard></Route>
              <Route path="/invoices/:id"><FinanceGuard><InvoiceDetailPage /></FinanceGuard></Route>
              <Route path="/settings">
                <AdminGuard><SettingsPage /></AdminGuard>
              </Route>
              <Route path="/ai-assistant">
                <AdminGuard><AiAssistantPage /></AdminGuard>
              </Route>
              <Route path="/settings/branches">
                <SuperAdminGuard><BranchesPage /></SuperAdminGuard>
              </Route>
              <Route path="/branch-settings">
                <BranchAdminOrAboveGuard><BranchSettingsPage /></BranchAdminOrAboveGuard>
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
          <ThemeProvider>
            <AuthProvider>
              <BranchProvider>
                <Router />
              </BranchProvider>
            </AuthProvider>
          </ThemeProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
