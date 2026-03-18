import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetClient, useUpdateClient, type ClientWithContainers,
} from "@workspace/api-client-react";
import { formatCurrency, getStatusColor, getStatusLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, FileText,
  Pencil, Check, X, Loader2, Box, Calendar,
} from "lucide-react";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-mono font-bold text-foreground mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id ?? "");
  const { toast } = useToast();
  const { data: client, isLoading } = useGetClient(isNaN(clientId) ? null : clientId);
  const updateMutation = useUpdateClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "", contactName: "", contactEmail: "", contactPhone: "", address: "", notes: "",
  });

  const startEdit = () => {
    if (!client) return;
    setForm({
      name: client.name,
      contactName: client.contactName,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      address: client.address,
      notes: client.notes,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await updateMutation.mutateAsync({ id: clientId, data: form });
      toast({ title: "Client updated" });
      setEditing(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update client" });
    }
  };

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Client not found.</p>
        <Link href="/clients"><Button variant="link" className="mt-2">Back to Clients</Button></Link>
      </div>
    );
  }

  const containers = client.containers ?? [];
  const totalRevenue = containers.reduce((s, c) => s + parseFloat(c.clearingCharges ?? "0"), 0);
  const totalContainers = containers.length;
  const sizes: Record<string, number> = {};
  containers.forEach(c => { if (c.size) sizes[c.size] = (sizes[c.size] ?? 0) + 1; });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Clients
          </Button>
        </Link>
        <div className="flex items-center gap-2 ml-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit} className="ml-auto gap-2">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Containers" value={String(totalContainers)} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} sub="Clearing charges" />
        <StatCard label="Container Sizes" value={Object.entries(sizes).map(([k, v]) => `${v}×${k}`).join(", ") || "—"} />
        <StatCard label="Since" value={new Date(client.createdAt).toLocaleDateString("en-NG", { month: "short", year: "numeric" })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Info */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Client Info
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Company Name *</Label>
                  <Input value={form.name} onChange={e => set({ name: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Person</Label>
                  <Input value={form.contactName} onChange={e => set({ contactName: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.contactPhone} onChange={e => set({ contactPhone: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input value={form.address} onChange={e => set({ address: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => set({ notes: e.target.value })} rows={2} className="resize-none text-sm" />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-7 text-xs gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!form.name.trim() || updateMutation.isPending} className="h-7 text-xs gap-1">
                    {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {client.contactName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{client.contactName}</span>
                  </div>
                )}
                {client.contactPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{client.contactPhone}</span>
                  </div>
                )}
                {client.contactEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{client.contactEmail}</span>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <span>{client.address}</span>
                  </div>
                )}
                {client.notes && (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground italic">{client.notes}</p>
                  </div>
                )}
                {!client.contactName && !client.contactPhone && !client.contactEmail && !client.address && !client.notes && (
                  <p className="text-sm text-muted-foreground italic">No contact details. Click Edit to add them.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Containers */}
        <Card className="border-border/50 bg-card/50 lg:col-span-2">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Box className="w-4 h-4 text-primary" /> Containers ({totalContainers})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {containers.length === 0 ? (
              <div className="px-6 py-10 text-center text-muted-foreground">
                <Box className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No containers linked</p>
                <p className="text-xs mt-1">
                  Open a container and link it to this client from the container details.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {containers.map(c => (
                  <Link key={c.id} href={`/containers/${c.id}`}>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors cursor-pointer group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-accent/30 flex items-center justify-center flex-shrink-0">
                          <Box className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-mono font-medium truncate group-hover:text-primary transition-colors">
                            {c.containerNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">{c.blNumber}</p>
                        </div>
                        {c.size && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 hidden sm:flex">{c.size}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase border ${getStatusColor(c.status)}`}>
                          {getStatusLabel(c.status)}
                        </span>
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-mono font-semibold text-primary">
                            {formatCurrency(parseFloat(c.clearingCharges ?? "0"))}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
