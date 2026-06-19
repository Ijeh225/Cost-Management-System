import { FileCheck2 } from "lucide-react";
import { useAuth } from "@/components/layout/auth-provider";
import { DepartmentStageWorkspace } from "@/components/workspace/department-stage-workspace";

export default function TransireWorkspace() {
  const { isAdmin, isTransireUser, isOperationsUser } = useAuth();

  return (
    <DepartmentStageWorkspace
      config={{
        stage: "transire_processing",
        title: "Transire Jobs",
        subtitle: "Manage Transire work independently for verified jobs.",
        activeLabel: "Active",
        submittedLabel: "Submitted",
        emptyActive: "No active Transire jobs at this time.",
        emptySubmitted: "No Transire jobs submitted yet.",
        submitLabel: "Submit Transire",
        expectedLabel: "Expected Transire date",
        releasedLabel: "Actual Transire release date",
        accentClass: "bg-violet-500/10 border-violet-500/20 text-violet-500",
        icon: FileCheck2,
        canAccess: isAdmin || isTransireUser || isOperationsUser,
        expectedField: "expectedTransireDate",
        releasedField: "transireReleasedAt",
        delayField: "transireDelayReason",
        finalDateField: "transireFinalDate",
      }}
    />
  );
}
