import { Building2 } from "lucide-react";
import { useAuth } from "@/components/layout/auth-provider";
import { DepartmentStageWorkspace } from "@/components/workspace/department-stage-workspace";

export default function TerminalOpsWorkspace() {
  const { isAdmin, isTerminalUser, isShippingTerminalUser } = useAuth();

  return (
    <DepartmentStageWorkspace
      config={{
        stage: "terminal",
        title: "Terminal Jobs",
        subtitle: "Manage Terminal/TDO work independently. Pull-Out starts after Terminal is submitted.",
        activeLabel: "Active",
        submittedLabel: "Released",
        emptyActive: "No active Terminal jobs at this time.",
        emptySubmitted: "No Terminal jobs submitted yet.",
        submitLabel: "Mark TDO Released",
        expectedLabel: "Expected TDO Release Date",
        releasedLabel: "Actual TDO Release Date",
        accentClass: "bg-amber-500/10 border-amber-500/20 text-amber-500",
        icon: Building2,
        canAccess: isAdmin || isTerminalUser || isShippingTerminalUser,
        expectedField: "expectedTdoDate",
        releasedField: "tdoReleasedAt",
        delayField: "tdoDelayReason",
        finalDateField: "tdoFinalDate",
      }}
    />
  );
}
