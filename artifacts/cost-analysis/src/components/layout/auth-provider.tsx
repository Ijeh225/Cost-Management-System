import { createContext, useContext, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
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
  isAuthenticated: false,
  isAdmin: false,
  isSuperAdmin: false,
  isBranchAdmin: false,
  isAdminOrAbove: false,
});

async function checkSetupRequired(): Promise<{ required: boolean }> {
  const res = await fetch("/api/auth/setup-required", { credentials: "include" });
  return res.json();
}

const DEPT_ROLE_KEYS = [
  "documentation_user", "accounts_user", "operations_user",
  "transire_user", "shipping_user", "terminal_user", "pull_out_user",
  "shipping_terminal_user", "terminal_manager", "delivery_user", "security_user",
];

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
        const role = (effectiveUser as any)?.role ?? "";
        const roles: string[] = (effectiveUser as any)?.roles ?? [role];
        const deptHomeMap: Record<string, string> = {
          transire_user:          "/workspace/transire",
          shipping_user:          "/workspace/shipping",
          terminal_user:          "/workspace/terminal-ops",
          pull_out_user:          "/workspace/pull-out",
          shipping_terminal_user: "/workspace/shipping",
          operations_user:        "/workspace/transire",
          documentation_user:     "/documentation",
          accounts_user:          "/workspace/accounts",
          terminal_manager:       "/workspace/terminal",
          delivery_user:          "/workspace/delivery",
          security_user:          "/gate",
        };
        // Pick first dept home from the user's roles
        const home = roles.map(r => deptHomeMap[r]).find(Boolean);
        setLocation(home ?? deptHomeMap[role] ?? "/");
      }
    }
  }, [effectiveUser, userLoading, isFetching, isAuthPage, isSetupPage, setupStatus, setupLoading, setLocation]);

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

  const role: string = effectiveUser?.role ?? "";
  const roles: string[] = (effectiveUser as any)?.roles ?? [role];
  const hasRole = (r: string) => roles.includes(r);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        isLoading: !!isLoading,
        isAuthenticated: !!effectiveUser,
        isSuperAdmin: role === "super_admin",
        isAdmin: role === "admin" || role === "super_admin",
        isBranchAdmin: role === "branch_admin",
        isAdminOrAbove: role === "admin" || role === "super_admin" || role === "branch_admin",
        userRole: role || null,
        userRoles: roles,
        isDocumentationUser: hasRole("documentation_user"),
        isAccountsUser: hasRole("accounts_user"),
        isOperationsUser: hasRole("operations_user"),
        isTransireUser: hasRole("transire_user"),
        isShippingUser: hasRole("shipping_user"),
        isTerminalUser: hasRole("terminal_user"),
        isPullOutUser: hasRole("pull_out_user"),
        isShippingTerminalUser: hasRole("shipping_terminal_user"),
        isTerminalManager: hasRole("terminal_manager"),
        isDeliveryUser: hasRole("delivery_user"),
        isSecurityUser: hasRole("security_user"),
        isDepartmentUser: DEPT_ROLE_KEYS.some(r => roles.includes(r)),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
