import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Loader2, Plus, Pencil, Power, PowerOff, Building2, MapPin, Mail, Phone, Users, Package } from "lucide-react";

export type Branch = {
  id: number;
  name: string;
  shortCode: string | null;
  location: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
  activeContainerCount?: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(body?.error || body?.message || `Request failed (${res.status})`);
  }
  return body as T;
}

export function useBranches(opts?: { enabled?: boolean }) {
  return useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    queryFn: () => api<Branch[]>("/branches"),
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
}

type BranchFormState = {
  name: string;
  shortCode: string;
  location: string;
  contactEmail: string;
  contactPhone: string;
};

const EMPTY_FORM: BranchFormState = {
  name: "", shortCode: "", location: "", contactEmail: "", contactPhone: "",
};

function BranchDialog({
  open, onOpenChange, branch,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branch?: Branch | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!branch;
  const [form, setForm] = useState<BranchFormState>(
    branch ? {
      name: branch.name,
      shortCode: branch.shortCode ?? "",
      location: branch.location ?? "",
      contactEmail: branch.contactEmail ?? "",
      contactPhone: branch.contactPhone ?? "",
    } : EMPTY_FORM
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        shortCode: form.shortCode.trim() || null,
        location: form.location.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
      };
      if (isEdit && branch) {
        return api<Branch>(`/branches/${branch.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return api<Branch>("/branches", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      toast({ title: isEdit ? "Branch updated" : "Branch created" });
      onOpenChange(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast({
      variant: "destructive", title: "Failed", description: err?.message ?? "Could not save branch.",
    }),
  });

  const canSubmit = form.name.trim().length >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Branch — ${branch?.name}` : "Create New Branch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Branch Name *</Label>
            <Input id="b-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Lagos Tin-Can Branch" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-code">Short Code</Label>
              <Input id="b-code" value={form.shortCode}
                onChange={(e) => setForm(f => ({ ...f, shortCode: e.target.value.toUpperCase() }))}
                placeholder="LAG" maxLength={16} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-loc">Location</Label>
              <Input id="b-loc" value={form.location}
                onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Lagos, Nigeria" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-email">Contact Email</Label>
              <Input id="b-email" type="email" value={form.contactEmail}
                onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                placeholder="branch@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-phone">Contact Phone</Label>
              <Input id="b-phone" value={form.contactPhone}
                onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+234..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

export default function BranchesPage() {
  const { isSuperAdmin, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: branches, isLoading } = useBranches();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Branch | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "deactivate" | "reactivate" }) =>
      api(`/branches/${id}/${action}`, { method: "POST" }),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      toast({ title: vars.action === "deactivate" ? "Branch deactivated" : "Branch reactivated" });
      setConfirmToggle(null);
    },
    onError: (err: any) => toast({
      variant: "destructive",
      title: "Action failed",
      description: err?.message ?? "Could not update branch status.",
    }),
  });

  if (!authLoading && !isSuperAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Branches
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage every bonded terminal branch. Each branch keeps its data fully isolated.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="hover-elevate active:scale-95 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4 mr-2" /> New Branch
        </Button>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase font-mono tracking-wider border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">Branch</th>
                <th className="px-6 py-4 font-medium">Code</th>
                <th className="px-6 py-4 font-medium">Location</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Users</th>
                <th className="px-6 py-4 font-medium">Active Containers</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : !branches || branches.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground text-sm">No branches yet.</td></tr>
              ) : (
                branches.map((b) => (
                  <tr key={b.id} className={`transition-colors ${b.isActive ? "hover:bg-accent/50" : "opacity-60 hover:bg-accent/30"}`}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{b.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">ID #{b.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      {b.shortCode ? (
                        <Badge variant="outline" className="font-mono">{b.shortCode}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {b.location ? (
                        <span className="text-foreground/80 inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {b.location}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      {b.contactEmail && (
                        <div className="text-xs inline-flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-muted-foreground" /> {b.contactEmail}
                        </div>
                      )}
                      {b.contactPhone && (
                        <div className="text-xs inline-flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-muted-foreground" /> {b.contactPhone}
                        </div>
                      )}
                      {!b.contactEmail && !b.contactPhone && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-foreground/90 font-mono">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" /> {b.userCount ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 text-foreground/90 font-mono">
                        <Package className="w-3.5 h-3.5 text-muted-foreground" /> {b.activeContainerCount ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      {b.isActive ? (
                        <span className="flex items-center gap-2 text-xs font-medium text-emerald-500">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <span className="w-2 h-2 rounded-full bg-muted-foreground" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(b)}
                          className="h-8 px-3 text-xs hover:bg-primary/10 hover:text-primary">
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        {b.id !== 1 && (
                          b.isActive ? (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmToggle(b)}
                              className="h-8 px-3 text-xs hover:bg-destructive/10 hover:text-destructive">
                              <PowerOff className="w-3.5 h-3.5 mr-1" /> Deactivate
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setConfirmToggle(b)}
                              className="h-8 px-3 text-xs hover:bg-emerald-500/10 hover:text-emerald-500">
                              <Power className="w-3.5 h-3.5 mr-1" /> Reactivate
                            </Button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <BranchDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editing && (
        <BranchDialog
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          branch={editing}
        />
      )}

      <Dialog open={!!confirmToggle} onOpenChange={(v) => { if (!v) setConfirmToggle(null); }}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmToggle?.isActive
                ? `Deactivate "${confirmToggle?.name}"?`
                : `Reactivate "${confirmToggle?.name}"?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmToggle?.isActive
              ? "Deactivating hides this branch from new-record selectors. No data is deleted; existing records, users, and history remain intact and can be restored at any time by reactivating."
              : "Reactivating restores this branch as a selectable option for new records."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmToggle(null)}>Cancel</Button>
            <Button
              variant={confirmToggle?.isActive ? "destructive" : "default"}
              disabled={toggleMutation.isPending}
              onClick={() => confirmToggle && toggleMutation.mutate({
                id: confirmToggle.id,
                action: confirmToggle.isActive ? "deactivate" : "reactivate",
              })}
            >
              {toggleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmToggle?.isActive ? "Deactivate Branch" : "Reactivate Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
