import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateContainer, useListClients } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { useBranches } from "@/pages/branches";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Package } from "lucide-react";

const SIZE_OPTIONS = ["20FT", "40FT", "40HC", "45HC"];
const COMMAND_OPTIONS = ["PTML", "TinCan", "Apapa", "Lekki"] as const;
const NO_CLIENT = "__none__";

interface NewContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewContainerDialog({ open, onOpenChange }: NewContainerDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMutation = useCreateContainer();
  const { data: clients } = useListClients();
  const { isSuperAdmin, user } = useAuth();
  const { activeBranchId } = useBranchScope();
  const { data: branches } = useBranches({ enabled: isSuperAdmin });
  const [branchId, setBranchId] = useState<number | null>(user?.branchId ?? null);

  useEffect(() => {
    if (open) {
      setBranchId(
        isSuperAdmin && activeBranchId === "all"
          ? null
          : (user?.branchId ?? null),
      );
    }
  }, [open]);

  const [form, setForm] = useState({
    customerName: "",
    containerNumber: "",
    blNumber: "",
    command: "",
    declaration: "",
    size: "",
    vessel: "",
    clearingCharges: "",
    clientId: NO_CLIENT,
    eta: "",
    consignee: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleClientChange = (clientId: string) => {
    setForm((prev) => {
      const next = { ...prev, clientId };
      if (clientId !== NO_CLIENT) {
        const picked = (clients ?? []).find((c) => String(c.id) === clientId);
        if (picked && !prev.customerName.trim()) {
          next.customerName = picked.name;
        }
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev.customerName) return prev;
      const { customerName, ...rest } = prev;
      return rest;
    });
  };

  const resolveCustomerName = () => {
    if (form.customerName.trim()) return form.customerName.trim();
    if (form.clientId !== NO_CLIENT) {
      const picked = (clients ?? []).find((c) => String(c.id) === form.clientId);
      if (picked) return picked.name;
    }
    return "";
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!resolveCustomerName()) {
      e.customerName = "Customer name is required (or pick a client to auto-fill)";
    }
    if (!form.containerNumber.trim()) e.containerNumber = "Container number is required";
    if (!form.blNumber.trim()) e.blNumber = "B/L number is required";
    if (!form.command) e.command = "Command is required";
    if (isSuperAdmin && branchId === null) e.branch = "Branch is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const charges = parseFloat(form.clearingCharges.replace(/,/g, "")) || 0;
    const customerName = resolveCustomerName();

    try {
      const container = await createMutation.mutateAsync({
        data: {
          customerName,
          containerNumber: form.containerNumber.trim().toUpperCase(),
          blNumber: form.blNumber.trim(),
          command: form.command,
          ...(form.declaration.trim() && { declaration: form.declaration.trim() }),
          ...(form.size && { size: form.size }),
          ...(form.vessel.trim() && { vessel: form.vessel.trim() }),
          ...(charges && { clearingCharges: charges }),
          clientId: form.clientId !== NO_CLIENT ? Number(form.clientId) : null,
          ...(form.eta && { eta: form.eta }),
          ...(form.consignee.trim() && { consignee: form.consignee.trim() }),
          ...(isSuperAdmin && branchId != null && { branchId }),
        },
      });
      toast({ title: "Container created", description: `${container.containerNumber} has been added.` });
      onOpenChange(false);
      setLocation(`/containers/${container.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create container";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setForm({
        customerName: "",
        containerNumber: "",
        blNumber: "",
        command: "",
        declaration: "",
        size: "",
        vessel: "",
        clearingCharges: "",
        clientId: NO_CLIENT,
        eta: "",
        consignee: "",
      });
      setErrors({});
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Add New Container
          </DialogTitle>
          <DialogDescription>
            Fill in the details below to register a single container manually.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="customerName">
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerName"
                placeholder="e.g. Acme Trading Ltd"
                value={form.customerName}
                onChange={(e) => set("customerName")(e.target.value)}
                className={errors.customerName ? "border-destructive" : ""}
              />
              {errors.customerName && (
                <p className="text-xs text-destructive">{errors.customerName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="containerNumber">
                Container # <span className="text-destructive">*</span>
              </Label>
              <Input
                id="containerNumber"
                placeholder="e.g. MSKU1234567"
                value={form.containerNumber}
                onChange={(e) => set("containerNumber")(e.target.value.toUpperCase())}
                className={`font-mono ${errors.containerNumber ? "border-destructive" : ""}`}
              />
              {errors.containerNumber && (
                <p className="text-xs text-destructive">{errors.containerNumber}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="blNumber">
                B/L Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="blNumber"
                placeholder="e.g. MAEU123456789"
                value={form.blNumber}
                onChange={(e) => set("blNumber")(e.target.value)}
                className={`font-mono ${errors.blNumber ? "border-destructive" : ""}`}
              />
              {errors.blNumber && (
                <p className="text-xs text-destructive">{errors.blNumber}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="command">
                Command <span className="text-destructive">*</span>
              </Label>
              <Select value={form.command} onValueChange={set("command")}>
                <SelectTrigger id="command" className={errors.command ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select terminal…" />
                </SelectTrigger>
                <SelectContent>
                  {COMMAND_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.command && (
                <p className="text-xs text-destructive">{errors.command}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vessel">Vessel</Label>
              <Input
                id="vessel"
                placeholder="e.g. MSC OSCAR"
                value={form.vessel}
                onChange={(e) => set("vessel")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="size">Size</Label>
              <Select value={form.size} onValueChange={set("size")}>
                <SelectTrigger id="size">
                  <SelectValue placeholder="Select size…" />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eta">ETA (Expected Arrival)</Label>
              <Input
                id="eta"
                type="date"
                value={form.eta}
                onChange={(e) => set("eta")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consignee">Consignee Name</Label>
              <Input
                id="consignee"
                placeholder="e.g. Dangote Industries Ltd"
                value={form.consignee}
                onChange={(e) => set("consignee")(e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="declaration">Declaration</Label>
              <Input
                id="declaration"
                placeholder="e.g. GENERAL MERCHANDISE"
                value={form.declaration}
                onChange={(e) => set("declaration")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clearingCharges">Agreed Clearing Charges (₦)</Label>
              <Input
                id="clearingCharges"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.clearingCharges}
                onChange={(e) => set("clearingCharges")(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client">Link to Client</Label>
              <Select value={form.clientId} onValueChange={handleClientChange}>
                <SelectTrigger id="client">
                  <SelectValue placeholder="None (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>None</SelectItem>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSuperAdmin && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="branch">
                  Branch {activeBranchId === "all" && <span className="text-destructive">*</span>}
                </Label>
                <Select
                  value={branchId != null ? String(branchId) : ""}
                  onValueChange={(v) => {
                    setBranchId(v ? Number(v) : null);
                    if (errors.branch) setErrors(prev => { const { branch, ...rest } = prev; return rest; });
                  }}
                >
                  <SelectTrigger id="branch" className={errors.branch ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).filter((b) => b.isActive).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branch
                  ? <p className="text-xs text-destructive">{errors.branch}</p>
                  : <p className="text-[11px] text-muted-foreground">
                      {activeBranchId === "all"
                        ? "Required — select which branch this container belongs to."
                        : "Defaults to your active branch. Change only when creating for another branch."}
                    </p>
                }
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="min-w-[120px]">
              {createMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
              ) : (
                "Create Container"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
