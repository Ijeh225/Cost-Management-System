import { useState } from "react";
import { Link } from "wouter";
import { useListClients, useCreateClient, useDeleteClient, type Client } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Plus, Search, Loader2, Trash2, ChevronRight,
  Phone, Mail, MapPin, Building2,
} from "lucide-react";

function ClientCard({ client, isAdmin }: { client: Client; isAdmin: boolean }) {
  const { toast } = useToast();
  const deleteMutation = useDeleteClient();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete client "${client.name}"? Any linked containers will be unlinked.`)) return;
    try {
      await deleteMutation.mutateAsync(client.id);
      toast({ title: "Client deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete client" });
    }
  };

  return (
    <Link href={`/clients/${client.id}`}>
      <Card className="border-border/50 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {client.name}
                </h3>
                {client.contactName && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.contactName}</p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {client.contactPhone && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" /> {client.contactPhone}
                    </span>
                  )}
                  {client.contactEmail && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="w-3 h-3" /> {client.contactEmail}
                    </span>
                  )}
                  {client.address && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" /> {client.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CreateClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createMutation = useCreateClient();
  const [form, setForm] = useState({
    name: "", contactName: "", contactEmail: "", contactPhone: "", address: "", notes: "",
  });

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      await createMutation.mutateAsync(form);
      toast({ title: "Client created" });
      setForm({ name: "", contactName: "", contactEmail: "", contactPhone: "", address: "", notes: "" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to create client" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> New Client
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Company / Client Name *</Label>
            <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Dangote Industries" className="h-9" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Contact Person</Label>
              <Input value={form.contactName} onChange={e => set({ contactName: e.target.value })} placeholder="Full name" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={form.contactPhone} onChange={e => set({ contactPhone: e.target.value })} placeholder="+234..." className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} placeholder="contact@company.com" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={e => set({ address: e.target.value })} placeholder="Lagos, Nigeria" className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Any additional notes..." rows={2} className="resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name.trim() || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Client
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: clients = [], isLoading } = useListClients();

  const filtered = search
    ? clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.contactEmail.toLowerCase().includes(search.toLowerCase())
      )
    : clients;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Clients
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage client accounts and view their container history.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreate(true)} className="gap-2 shadow-md">
            <Plus className="w-4 h-4" /> New Client
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="pl-9 h-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{search ? "No clients match your search" : "No clients yet"}</p>
          {!search && isAdmin && (
            <p className="text-sm mt-1">Create your first client to start tracking per-client profitability.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => (
            <ClientCard key={client.id} client={client} isAdmin={!!isAdmin} />
          ))}
        </div>
      )}

      <CreateClientDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </motion.div>
  );
}
