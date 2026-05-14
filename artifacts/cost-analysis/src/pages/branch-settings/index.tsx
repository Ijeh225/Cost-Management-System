import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building2, Save } from "lucide-react";
import type { Branch } from "@/pages/branches";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error || body?.message || `Request failed (${res.status})`);
  return body as T;
}

type FormState = {
  location: string;
  contactEmail: string;
  contactPhone: string;
  whatsappMode: "head_office" | "own";
  whatsappNumber: string;
  emailMode: "head_office" | "own";
  emailFromAddress: string;
  emailReplyTo: string;
  alertAdminNumber: string;
  alertOnStuck: boolean;
  alertOnOverdue: boolean;
  alertOnNegativeProfit: boolean;
};

const EMPTY: FormState = {
  location: "", contactEmail: "", contactPhone: "",
  whatsappMode: "head_office", whatsappNumber: "",
  emailMode: "head_office", emailFromAddress: "", emailReplyTo: "",
  alertAdminNumber: "", alertOnStuck: false, alertOnOverdue: false, alertOnNegativeProfit: false,
};

export default function BranchSettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: branch, isLoading } = useQuery<Branch>({
    queryKey: ["/api/my-branch"],
    queryFn: () => api<Branch>("/my-branch"),
  });
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!branch) return;
    setForm({
      location: branch.location ?? "",
      contactEmail: branch.contactEmail ?? "",
      contactPhone: branch.contactPhone ?? "",
      whatsappMode: branch.whatsappMode ?? "head_office",
      whatsappNumber: branch.whatsappNumber ?? "",
      emailMode: branch.emailMode ?? "head_office",
      emailFromAddress: branch.emailFromAddress ?? "",
      emailReplyTo: branch.emailReplyTo ?? "",
      alertAdminNumber: (branch as any).alertAdminNumber ?? "",
      alertOnStuck: (branch as any).alertOnStuck === "true" || (branch as any).alertOnStuck === true,
      alertOnOverdue: (branch as any).alertOnOverdue === "true" || (branch as any).alertOnOverdue === true,
      alertOnNegativeProfit: (branch as any).alertOnNegativeProfit === "true" || (branch as any).alertOnNegativeProfit === true,
    });
  }, [branch]);

  const save = useMutation({
    mutationFn: () => api<Branch>("/my-branch", {
      method: "PATCH",
      body: JSON.stringify({
        location: form.location.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        whatsappMode: form.whatsappMode,
        whatsappNumber: form.whatsappMode === "own" ? (form.whatsappNumber.trim() || null) : null,
        emailMode: form.emailMode,
        emailFromAddress: form.emailMode === "own" ? (form.emailFromAddress.trim() || null) : null,
        emailReplyTo: form.emailMode === "own" ? (form.emailReplyTo.trim() || null) : null,
        alertAdminNumber: form.alertAdminNumber.trim() || null,
        alertOnStuck: form.alertOnStuck,
        alertOnOverdue: form.alertOnOverdue,
        alertOnNegativeProfit: form.alertOnNegativeProfit,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/my-branch"] });
      toast({ title: "Branch settings saved." });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!branch) {
    return <div className="p-8 text-sm text-muted-foreground">No branch assigned.</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Branch Settings</h1>
          <p className="text-sm text-muted-foreground">
            {branch.name}{branch.shortCode ? ` (${branch.shortCode})` : ""}
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4 bg-card/95 border-border/50">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Contact</h2>
        <div className="space-y-2">
          <Label htmlFor="loc">Location</Label>
          <Input id="loc" value={form.location}
            onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Contact Email</Label>
            <Input id="email" type="email" value={form.contactEmail}
              onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Contact Phone</Label>
            <Input id="phone" value={form.contactPhone}
              onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4 bg-card/95 border-border/50">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">WhatsApp Notifications</h2>
        <div className="space-y-2">
          <Label>Sender</Label>
          <Select value={form.whatsappMode}
            onValueChange={(v) => setForm(f => ({ ...f, whatsappMode: v as "head_office" | "own" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="head_office">Use head-office number</SelectItem>
              <SelectItem value="own">Use this branch's own number</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.whatsappMode === "own" && (
          <div className="space-y-2">
            <Label htmlFor="wa">WhatsApp Number</Label>
            <Input id="wa" placeholder="+234..." value={form.whatsappNumber}
              onChange={(e) => setForm(f => ({ ...f, whatsappNumber: e.target.value }))} />
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4 bg-card/95 border-border/50">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Email Notifications</h2>
        <div className="space-y-2">
          <Label>Sender</Label>
          <Select value={form.emailMode}
            onValueChange={(v) => setForm(f => ({ ...f, emailMode: v as "head_office" | "own" }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="head_office">Use head-office address</SelectItem>
              <SelectItem value="own">Use this branch's own address</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.emailMode === "own" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from">From Address</Label>
              <Input id="from" type="email" value={form.emailFromAddress}
                onChange={(e) => setForm(f => ({ ...f, emailFromAddress: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reply">Reply-To</Label>
              <Input id="reply" type="email" value={form.emailReplyTo}
                onChange={(e) => setForm(f => ({ ...f, emailReplyTo: e.target.value }))} />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4 bg-card/95 border-border/50">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">Alert Digest (WhatsApp)</h2>
        <p className="text-xs text-muted-foreground">
          When you trigger the daily digest from the dashboard, alerts are sent to this number. No messages are sent automatically.
        </p>
        <div className="space-y-2">
          <Label htmlFor="alert-num">Admin Alert Number</Label>
          <Input id="alert-num" placeholder="+234..." value={form.alertAdminNumber}
            onChange={(e) => setForm(f => ({ ...f, alertAdminNumber: e.target.value }))} />
          <p className="text-[11px] text-muted-foreground">International format, e.g. +2348012345678</p>
        </div>
        <div className="space-y-3">
          <Label>Alert Types to Include</Label>
          {([
            { key: "alertOnStuck" as const, label: "Stuck containers (in same stage 30+ days)" },
            { key: "alertOnOverdue" as const, label: "Overdue next-action dates" },
            { key: "alertOnNegativeProfit" as const, label: "Containers running at a loss" },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer group">
              <div
                className={`w-9 h-5 rounded-full transition-colors relative ${form[key] ? "bg-primary" : "bg-muted"}`}
                onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form[key] ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
