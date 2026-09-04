import { createContext, useContext, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetCurrentUser, getGetCurrentUserQueryKey, clearCsrfToken } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isBranchAdmin: boolean;
  isAdminOrAbove: boolean;
  isBranchMember: boolean;
  canAccessFinance: boolean;
  userRole: string | null;
  userRoles: string[];
  isDepartmentUser: boolean;
  isDocumentationUser: boolean;
  isAccountsUser: boolean;
  isOperationsUser: boolean;
  isTransireUser: boolean;
  isShippingUser: boolean;
  isTerminalUser: boolean;
  isPullOutUser: boolean;
  isShippingTerminalUser: boolean;
  isTerminalManager: boolean;
  isDeliveryUser: boolean;
  isSecurityUser: boolean;
  accessProfile: ClientAccessProfile | null;
  isModernAccessProfile: boolean;
  workspaceHome: string | null;
};

export type WorkspaceKey = "documentation" | "accounts" | "transire" | "shipping" | "terminal" | "pullout" | "terminal_manager" | "delivery" | "security";

export type ClientAccessProfile = {
  source: "modern" | "invalid";
  authorityLevel: "super_admin" | "admin" | "branch_admin" | "staff" | null;
  jobFunction: "general_staff" | "documentation" | "accounts" | "operations" | "terminal_manager" | "delivery" | "security" | null;
  workspaces: WorkspaceKey[];
  errors: string[];
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  userRole: null,
  userRoles: [],
  isDepartmentUser: false,
  isDocumentationUser: false,
  isAccountsUser: false,
  isOperationsUser: false,
  isTransireUser: false,
  isShippingUser: false,
  isTerminalUser: false,
  isPullOutUser: false,
  isShippingTerminalUser: false,
  isTerminalManager: false,
  isDeliveryUser: false,
  isSecurityUser: false,
  accessProfile: null,
  isModernAccessProfile: false,
  workspaceHome: null,
  isAuthenticated: false,
  isAdmin: false,
  isSuperAdmin: false,
  isBranchAdmin: false,
  isAdminOrAbove: false,
  isBranchMember: false,
  canAccessFinance: false,
});

async function checkSetupRequired(): Promise<{ required: boolean }> {
  const res = await fetch("/api/auth/setup-required", { credentials: "include" });
  return res.json();
}

const WORKSPACE_HOME: Record<WorkspaceKey, string> = {
  documentation: "/documentation",
  accounts: "/workspace/accounts",
  transire: "/workspace/transire",
  shipping: "/workspace/shipping",
  terminal: "/workspace/terminal-ops",
  pullout: "/workspace/pull-out",
  terminal_manager: "/workspace/terminal",
  delivery: "/workspace/delivery",
  security: "/gate",
};

function readAccessProfile(user: User | null): ClientAccessProfile | null {
  const profile = (user as (User & { accessProfile?: ClientAccessProfile }) | null)?.accessProfile;
  if (!profile || !["modern", "invalid"].includes(profile.source) || !Array.isArray(profile.workspaces)) {
    return null;
  }
  return profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const isAuthPage = location === "/login";
  const isSetupPage = location === "/setup";

  const lastKnownUser = useRef<User | null>(null);
  const initialLoadDone = useRef(false);

  const { data: setupStatus, isLoading: setupLoading } = useQuery({
    queryKey: ["/api/auth/setup-required"],
    queryFn: checkSetupRequired,
    retry: false,
    staleTime: 30_000,
  });

  const { data: user, isLoading: userLoading, isError, isFetching, error } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: 1,
      staleTime: Infinity,
      enabled: setupStatus ? !setupStatus.required : false,
    }
  });

  if (user) {
    lastKnownUser.current = user;
  }

  const isLoading = setupLoading || (setupStatus && !setupStatus.required && userLoading);

  if (!isLoading && !userLoading) {
    initialLoadDone.current = true;
  }

  const is401 = isError && (error as any)?.status === 401;

  const effectiveUser = user ?? (
    is401 || (isError && !isFetching && initialLoadDone.current && !lastKnownUser.current)
      ? null
      : lastKnownUser.current
  );
  const accessProfile = readAccessProfile(effectiveUser);
  const modernAccessProfile = accessProfile?.source === "modern" ? accessProfile : null;
  const isModernAccessProfile = modernAccessProfile !== null;
  const workspaceHome = modernAccessProfile?.workspaces.length
    ? WORKSPACE_HOME[modernAccessProfile.workspaces[0]] ?? null
    : null;

  // CSRF tokens are bound to a server-side session. Clear the cached token
  // whenever the authenticated user changes (login, logout, or session expiry).
  useEffect(() => {
    clearCsrfToken();
  }, [effectiveUser?.id]);

  useEffect(() => {
    if (setupLoading) return;

    if (setupStatus?.required) {
      if (!isSetupPage) setLocation("/setup");
      return;
    }

    if (!userLoading && !isFetching) {
      if (!effectiveUser) {
        if (!isAuthPage && !isSetupPage) setLocation("/login");
      } else if (isAuthPage || isSetupPage) {
        setLocation(workspaceHome ?? "/");
      }
    }
  }, [effectiveUser, userLoading, isFetching, isAuthPage, isSetupPage, setupStatus, setupLoading, setLocation, workspaceHome]);

  if (isLoading && !isAuthPage && !isSetupPage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Authenticating...</p>
        </div>
      </div>
    );
  }

  const authorityLevel = modernAccessProfile?.authorityLevel ?? null;
  const hasModernWorkspace = (workspace: WorkspaceKey) => modernAccessProfile?.workspaces.includes(workspace) ?? false;
  const isSuperAdmin = authorityLevel === "super_admin";
  const isAdmin = authorityLevel === "admin" || authorityLevel === "super_admin";
  const isBranchAdmin = authorityLevel === "branch_admin";
  const isAdminOrAbove = authorityLevel === "super_admin" || authorityLevel === "admin" || authorityLevel === "branch_admin";
  const isBranchMember = authorityLevel !== null;
  const canAccessFinance = isBranchAdmin || isAdmin || hasModernWorkspace("accounts");

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        isLoading: !!isLoading,
        isAuthenticated: !!effectiveUser,
        isSuperAdmin,
        isAdmin,
        isBranchAdmin,
        isAdminOrAbove,
        isBranchMember,
        canAccessFinance,
        userRole: authorityLevel,
        userRoles: authorityLevel ? [authorityLevel] : [],
        isDocumentationUser: hasModernWorkspace("documentation"),
        isAccountsUser: hasModernWorkspace("accounts"),
        isOperationsUser: modernAccessProfile?.jobFunction === "operations",
        isTransireUser: hasModernWorkspace("transire"),
        isShippingUser: hasModernWorkspace("shipping"),
        isTerminalUser: hasModernWorkspace("terminal"),
        isPullOutUser: hasModernWorkspace("pullout"),
        isShippingTerminalUser: hasModernWorkspace("shipping") && hasModernWorkspace("terminal"),
        isTerminalManager: hasModernWorkspace("terminal_manager"),
        isDeliveryUser: hasModernWorkspace("delivery"),
        isSecurityUser: hasModernWorkspace("security"),
        isDepartmentUser: modernAccessProfile?.jobFunction !== null && modernAccessProfile?.jobFunction !== "general_staff",
        accessProfile,
        isModernAccessProfile,
        workspaceHome,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
