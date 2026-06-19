import { PackageOpen } from "lucide-react";
import { useAuth } from "@/components/layout/auth-provider";
import { DepartmentStageWorkspace } from "@/components/workspace/department-stage-workspace";

export default function PullOutWorkspace() {
  const { isAdmin, isPullOutUser } = useAuth();

  return (
    <DepartmentStageWorkspace
      config={{
        stage: "pull_out",
        title: "Pull-Out Jobs",
        subtitle: "Pull-Out starts after Terminal/TDO work has been submitted.",
        activeLabel: "Active",
        submittedLabel: "Released",
        emptyActive: "No active Pull-Out jobs at this time.",
        emptySubmitted: "No Pull-Out jobs released yet.",
        submitLabel: "Mark Pullout Released",
        expectedLabel: "Expected Pullout Date",
        releasedLabel: "Actual Pullout Date",
        accentClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
        icon: PackageOpen,
        canAccess: isAdmin || isPullOutUser,
        expectedField: "expectedPulloutDate",
        releasedField: "pulloutReleasedAt",
        delayField: "pulloutDelayReason",
        finalDateField: "pulloutFinalDate",
        ready: container => !!container.tdoReleasedAt,
        notReadyMessage: "Pull-Out cannot be submitted until Terminal/TDO has been submitted.",
      }}
    />
  );
}
