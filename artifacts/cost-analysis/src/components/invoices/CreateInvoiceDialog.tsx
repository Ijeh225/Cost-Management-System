import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListClients, useGetClient,
  useCreateInvoice, useListInvoices,
  type Client,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranches } from "@/pages/branches";
import { Loader2, PlusCircle, Package, AlertCircle, ChevronRight } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  preselectedClientId?: number | null;
  preselectedContainerId?: number | null;
};

export function CreateInvoiceDialog({ open, onClose, preselectedClientId, preselectedContainerId }: Props) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<"client" | "containers">(preselectedClientId ? "containers" : "client");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(preselectedClientId ?? null);
  const [selectedContainerIds, setSelectedContainerIds] = useState<number[]>(
    preselectedContainerId ? [preselectedContainerId] : []
  );
  const [vatRate, setVatRate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: clients, isLoading: clientsLoading } = useListClients();
  const { data: clientDetails, isLoading: containersLoading } = useGetClient(selectedClientId);
  const { data: allInvoices } = useListInvoices();
  const createMutation = useCreateInvoice();
  const { isSuperAdmin, user } = useAuth();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>((user as any)?.branchId ?? null);

  useEffect(() => {
    if (open) {
      setStep(preselectedClientId ? "containers" : "client");
      setSelectedClientId(preselectedClientId ?? null);
      setSelectedContainerIds(preselectedContainerId ? [preselectedContainerId] : []);
      setVatRate("");
      setDueDate("");
      setNotes("");
    }
  }, [open, preselectedClientId, preselectedContainerId]);

  const containers = clientDetails?.containers ?? [];

  const invoicedContainerIds = new Set(
    (allInvoices ?? []).flatMap(inv =>
      inv.items && inv.items.length > 0
        ? inv.items.map(it => it.containerId).filter(Boolean) as number[]
        : inv.containerId ? [inv.containerId] : []
    )
  );

  const subtotal = selectedContainerIds.reduce((sum, cid) => {
    const container = containers.find(c => c.id === cid);
    return sum + (container ? parseFloat(container.clearingCharges ?? "0") : 0);
  }, 0);

  const vatAmount = vatRate ? subtotal * (parseFloat(vatRate) / 100) : 0;
  const total = subtotal + vatAmount;

  const toggleContainer = (cid: number) => {
    setSelectedContainerIds(prev =>
      prev.includes(cid) ? prev.filter(id => id !== cid) : [...prev, cid]
    );
  };

  const handleClientSelect = (clientId: number) => {
    if (clientId !== selectedClientId) {
      setSelectedClientId(clientId);
      setSelectedContainerIds([]);
    }
    setStep("containers");
  };

  const handleCreate = async () => {
    if (selectedContainerIds.length === 0) {
      toast({ variant: "destructive", title: "Select at least one container" });
      return;
    }
    try {
      const inv = await createMutation.mutateAsync({
        containerIds: selectedContainerIds,
        vatRate: vatRate ? parseFloat(vatRate) : undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        ...(isSuperAdmin && branchId != null && { branchId }),
      } as any);
      toast({ title: "Invoice created", description: inv.invoiceNumber });
      onClose();
      setLocation(`/invoices/${inv.id}`);
    } catch {
      toast({ variant: "destructive", title: "Failed to create invoice" });
    }
  };

  const selectedClient = (clients ?? []).find((c: Client) => c.id === selectedClientId);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            Create Invoice
          </DialogTitle>
        </DialogHeader>

        {step === "client" ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Select the client this invoice is for.</p>
            {clientsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (clients ?? []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-sm">No clients found. Create a client first.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {(clients ?? []).map((client: Client) => (
                  <button
                    key={client.id}
                    onClick={() => handleClientSelect(client.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border/50 bg-background/50 hover:bg-accent/30 hover:border-primary/30 transition-all text-left group"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{client.name}</p>
                      {client.contactPhone && (
                        <p className="text-xs text-muted-foreground">{client.contactPhone}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5 pt-2">
            <div className="flex items-center gap-2">
              {!preselectedClientId && (
                <button
                  onClick={() => setStep("client")}
                  className="text-xs text-primary hover:underline"
                >
                  ← Back
                </button>
              )}
              <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                {selectedClient?.name ?? "Client"}
              </Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Containers
              </Label>
              {containersLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : containers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground space-y-1">
                  <Package className="w-7 h-7 mx-auto opacity-30" />
                  <p className="text-sm">No containers linked to this client.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {containers.map(c => {
                    const alreadyInvoiced = invoicedContainerIds.has(c.id);
                    const checked = selectedContainerIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                          checked
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/50 bg-background/50 hover:bg-accent/20"
                        } ${alreadyInvoiced && !checked ? "opacity-60" : ""}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleContainer(c.id)}
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono font-semibold text-foreground">
                              {c.containerNumber}
                            </span>
                            {alreadyInvoiced && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                Invoiced
                              </Badge>
                            )}
                            {(!c.clearingCharges || parseFloat(c.clearingCharges) === 0) && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-destructive/15 text-destructive border border-destructive/30">
                                No charge set
                              </Badge>
                            )}
                          </div>
                          {c.blNumber && (
                            <p className="text-xs text-muted-foreground font-mono">B/L: {c.blNumber}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-semibold font-mono ${(!c.clearingCharges || parseFloat(c.clearingCharges) === 0) ? "text-muted-foreground/50" : "text-foreground"}`}>
                            {formatCurrency(parseFloat(c.clearingCharges ?? "0"))}
                          </span>
                          <p className="text-[10px] text-muted-foreground">clearing charge</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {selectedContainerIds.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-background/50 px-4 py-3 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Subtotal ({selectedContainerIds.length} container{selectedContainerIds.length > 1 ? "s" : ""})
                    </span>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(subtotal)}</span>
                  </div>
                  {vatAmount > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                      <span className="font-mono text-foreground">{formatCurrency(vatAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm border-t border-border/50 pt-1.5">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-mono font-bold text-primary">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">VAT Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  value={vatRate}
                  onChange={e => setVatRate(e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </div>
            </div>

            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Branch</Label>
                <Select
                  value={branchId != null ? String(branchId) : ""}
                  onValueChange={(v) => setBranchId(v ? Number(v) : null)}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select branch…" /></SelectTrigger>
                  <SelectContent>
                    {(branches ?? []).filter((b) => b.isActive).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Defaults to your active branch.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Any additional notes for the invoice..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="resize-none text-sm"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || selectedContainerIds.length === 0}
                className="gap-2"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                Create Invoice
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
