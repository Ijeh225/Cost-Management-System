import { Badge } from "@/components/ui/badge";
import { useBranchScope } from "./branch-provider";

export function BranchChip({ branchId }: { branchId?: number | null }) {
  const { isSuperAdmin, activeBranchId, branches } = useBranchScope();
  if (!isSuperAdmin || activeBranchId !== "all" || branchId == null) return null;
  const b = branches.find(x => x.id === branchId);
  return (
    <Badge variant="outline" className="ml-2 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0">
      {b?.name ?? `Branch #${branchId}`}
    </Badge>
  );
}
