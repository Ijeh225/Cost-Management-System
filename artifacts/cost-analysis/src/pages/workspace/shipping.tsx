import { Ship } from "lucide-react";
import { useAuth } from "@/components/layout/auth-provider";
import { DepartmentStageWorkspace } from "@/components/workspace/department-stage-workspace";

export default function ShippingWorkspace() {
  const { isAdmin, isShippingUser, isShippingTerminalUser } = useAuth();

  return (
    <DepartmentStageWorkspace
      config={{
        stage: "shipping",
        title: "Shipping Jobs",
        subtitle: "Manage Delivery Order work without moving the whole job away from other departments.",
        activeLabel: "Active",
        submittedLabel: "Released",
        emptyActive: "No active Shipping jobs at this time.",
        emptySubmitted: "No DO releases submitted yet.",
        submitLabel: "Mark DO Released",
        expectedLabel: "Expected DO Release Date",
        releasedLabel: "Actual DO Release Date",
        accentClass: "bg-sky-500/10 border-sky-500/20 text-sky-500",
        icon: Ship,
        canAccess: isAdmin || isShippingUser || isShippingTerminalUser,
        expectedField: "expectedDoDate",
        releasedField: "doReleasedAt",
        delayField: "doDelayReason",
        finalDateField: "doFinalDate",
      }}
    />
  );
}
