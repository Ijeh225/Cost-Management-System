import { useState, useEffect } from "react";
import { useUpdateContainer } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, Pencil } from "lucide-react";

const SIZE_OPTIONS = ["20FT", "40FT", "40HC", "45HC"];
const NO_SIZE = "__none__";

interface ContainerBasicInfo {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  vessel: string;
  size: string;
  declaration: string;
  clearingCharges: number;
  eta?: string | null;
  consignee?: string | null;
}

interface EditContainerDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: ContainerBasicInfo;
  onSaved: () => void;
}

export function EditContainerDetailsDialog({
  open,
  onOpenChange,
  container,
  onSaved,
}: EditContainerDetailsDialogProps) {
  const { toast } = useToast();
  const updateMutation = useUpdateContainer();

  const [form, setForm] = useState({
    customerName: "",
    vessel: "",
    size: "",
    declaration: "",
    clearingCharges: "",
    eta: "",
    consignee: "",
  });

  useEffect(() => {
    if (open) {
      const etaVal = container.eta
        ? new Date(container.eta).toISOString().split("T")[0]
        : "";
      setForm({
        customerName: container.customerName,
        vessel: container.vessel ?? "",
        size: container.size ?? "",
        declaration: container.declaration ?? "",
        clearingCharges: container.clearingCharges > 0 ? String(container.clearingCharges) : "",
        eta: etaVal,
        consignee: container.consignee ?? "",
      });
    }
  }, [open, container]);

  const set = (field: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim()) {
      toast({ variant: "destructive", title: "Customer name is required" });
      return;
    }

    const charges = parseFloat(form.clearingCharges.replace(/,/g, "")) || 0;

    try {
      await updateMutation.mutateAsync({
        id: container.id,
        data: {
          customerName: form.customerName.trim(),
          vessel: form.vessel.trim(),
          size: form.size === NO_SIZE ? "" : form.size,
          declaration: form.declaration.trim(),
          clearingCharges: charges,
          eta: form.eta || null,
          consignee: form.consignee.trim() || null,
        },
      });
      toast({ title: "Container details updated" });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update container";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Container Details
          </DialogTitle>
          <DialogDescription>
            Update the basic information for this container record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
            <div className="space-y-0.5">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Container #</p>
              <p className="font-mono font-semibold text-sm text-foreground">{container.containerNumber}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">B/L Number</p>
              <p className="font-mono font-semibold text-sm text-foreground">{container.blNumber}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-customerName">
              Customer Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-customerName"
              value={form.customerName}
              onChange={(e) => set("customerName")(e.target.value)}
              placeholder="Customer name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-vessel">Vessel</Label>
              <Input
                id="edit-vessel"
                value={form.vessel}
                onChange={(e) => set("vessel")(e.target.value)}
                placeholder="e.g. MSC OSCAR"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-size">Size</Label>
              <Select value={form.size || NO_SIZE} onValueChange={(v) => set("size")(v === NO_SIZE ? "" : v)}>
                <SelectTrigger id="edit-size">
                  <SelectValue placeholder="Select size…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SIZE}>— Not set —</SelectItem>
                  {SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-eta">ETA (Expected Arrival)</Label>
              <Input
                id="edit-eta"
                type="date"
                value={form.eta}
                onChange={(e) => set("eta")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-consignee">Consignee Name</Label>
              <Input
                id="edit-consignee"
                value={form.consignee}
                onChange={(e) => set("consignee")(e.target.value)}
                placeholder="e.g. Dangote Industries Ltd"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-declaration">Declaration</Label>
            <Input
              id="edit-declaration"
              value={form.declaration}
              onChange={(e) => set("declaration")(e.target.value)}
              placeholder="e.g. GENERAL MERCHANDISE"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-clearingCharges">Agreed Clearing Charges (₦)</Label>
            <Input
              id="edit-clearingCharges"
              type="number"
              min="0"
              step="0.01"
              value={form.clearingCharges}
              onChange={(e) => set("clearingCharges")(e.target.value)}
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending} className="min-w-[100px]">
              {updateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
