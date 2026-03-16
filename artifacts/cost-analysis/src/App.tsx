import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/components/layout/auth-provider";
import { AppLayout } from "@/components/layout/app-layout";

// Pages
import Login from "@/pages/login";
import Setup from "@/pages/setup";
import Dashboard from "@/pages/dashboard";
import Containers from "@/pages/containers/index";
import UploadPage from "@/pages/containers/upload";
import ContainerDetail from "@/pages/containers/[id]";
import Users from "@/pages/users/index";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/setup" component={Setup} />
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/containers" component={Containers} />
            <Route path="/containers/upload" component={UploadPage} />
            <Route path="/containers/:id" component={ContainerDetail} />
            <Route path="/users" component={Users} />
            <Route path="/upload" component={UploadPage} />
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
