import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-provider";
import { useBranches, type Branch } from "@/pages/branches";

const STORAGE_KEY = "cost_analysis_active_branch";

export type BranchSummary = Branch;

type BranchContextType = {
  activeBranchId: number | "all";
  setActiveBranch: (v: number | "all") => void;
  branches: BranchSummary[];
  isSuperAdmin: boolean;
};

const BranchContext = createContext<BranchContextType>({
  activeBranchId: "all",
  setActiveBranch: () => {},
  branches: [],
  isSuperAdmin: false,
});

function readInitial(): number | "all" {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === "all") return "all";
    const n = Number(raw);
    return Number.isFinite(n) ? n : "all";
  } catch {
    return "all";
  }
}

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const [active, setActive] = useState<number | "all">(() => readInitial());

  // Non-super-admins are pinned to their own branch.
  const effectiveActive: number | "all" = isSuperAdmin ? active : (user?.branchId ?? "all");

  const { data: branchesData } = useBranches({ enabled: !!isAuthenticated && !!isSuperAdmin });
  const branches: BranchSummary[] = branchesData ?? [];

  const setActiveBranch = useCallback((v: number | "all") => {
    setActive(v);
    try {
      if (v === "all") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(v));
    } catch { /* ignore */ }
    // Invalidate all server data so it refetches under the new scope.
    qc.invalidateQueries();
  }, [qc]);

  // Keep storage consistent for non-super-admins (clear any stale switcher value).
  useEffect(() => {
    if (!isSuperAdmin) {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [isSuperAdmin]);

  const value = useMemo<BranchContextType>(() => ({
    activeBranchId: effectiveActive,
    setActiveBranch,
    branches,
    isSuperAdmin: !!isSuperAdmin,
  }), [effectiveActive, setActiveBranch, branches, isSuperAdmin]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export const useBranchScope = () => useContext(BranchContext);
