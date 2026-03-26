import { createContext, useContext, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
});

async function checkSetupRequired(): Promise<{ required: boolean }> {
  const res = await fetch("/api/auth/setup-required", { credentials: "include" });
  return res.json();
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
        setLocation("/");
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

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        isLoading: !!isLoading,
        isAuthenticated: !!effectiveUser,
        isAdmin: effectiveUser?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
