import { useState } from "react";
import { Link } from "wouter";
import { useGetPaarStatus, useUpdatePaar, type PaarStatusItem } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { getStatusLabel, getStatusColor } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import {
  FileCheck2, Clock, AlertTriangle, CheckCircle2, Search,
  User, Calendar, Loader2, Save, ChevronRight, RefreshCw,
} from "lucide-react";

type PaarFilter = "all" | "pending" | "released";

function PaarBadge({ item }: { item: PaarStatusItem }) {
  if (item.paarReleasedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Released
      </span>
    );
  }
  if (item.paarOfficer || item.paarDelayReason) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
        <AlertTriangle className="w-2.5 h-2.5" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-muted/30 rounded-full px-2 py-0.5">
      <Clock className="w-2.5 h-2.5" />
      Not Started
    </span>
  );
}

function InlineEditRow({ item, isAdmin }: { item: PaarStatusItem; isAdmin: boolean }) {
  const { toast } = useToast();
  const updateMutation = useUpdatePaar();
  const [editing, setEditing] = useState(false);
  const [officer, setOfficer] = useState(item.paarOfficer ?? "");
  const [releasedAt, setReleasedAt] = useState(
    item.paarReleasedAt ? item.paarReleasedAt.slice(0, 10) : ""
  );
  const [delayReason, setDelayReason] = useState(item.paarDelayReason ?? "");

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: item.id,
        paarOfficer: officer || null,
        paarReleasedAt: releasedAt || null,
        paarDelayReason: delayReason || null,
      });
      toast({ title: "PAAR updated" });
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const statusColor = getStatusColor(item.status);

  return (
    <div className="border border-border/40 rounded-lg bg-card/40 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
          <div className="min-w-0">
            <p className="font-mono font-semibold text-sm text-foreground truncate">
              {item.containerNumber}
            </p>
            {item.blNumber && (
              <p className="font-mono text-[10px] text-muted-foreground truncate">
                BL: {item.blNumber}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              {item.customerName}
            </p>
          </div>

          <div>
            <Badge className={`border text-[10px] ${statusColor}`}>
              {getStatusLabel(item.status)}
            </Badge>
          </div>

          <div>
            <PaarBadge item={item} />
            {item.paarOfficer && !editing && (
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <User className="w-2.5 h-2.5" />
                {item.paarOfficer}
              </p>
            )}
            {item.paarReleasedAt && !editing && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {new Date(item.paarReleasedAt).toLocaleDateString("en-NG", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </p>
            )}
            {item.paarDelayReason && !editing && (
              <p className="text-[10px] text-amber-400/80 mt-1 truncate max-w-[180px]">
                ⚠ {item.paarDelayReason}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            {isAdmin && !editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="h-6 text-[10px] gap-1 px-2"
              >
                Update PAAR
              </Button>
            )}
            <Link href={`/operations/${item.id}`}>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {editing && (
        <div className="border-t border-border/40 bg-background/50 px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <User className="w-2.5 h-2.5" />
                Documentation Officer
              </label>
              <Input
                value={officer}
                onChange={(e) => setOfficer(e.target.value)}
                placeholder="Officer name"
                className="h-7 text-xs bg-background border-border/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                PAAR Release Date
              </label>
              <Input
                type="date"
                value={releasedAt}
                onChange={(e) => setReleasedAt(e.target.value)}
                className="h-7 text-xs bg-background border-border/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                Delay Reason (if PAAR not ready)
              </label>
              <Textarea
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="State reason if PAAR is delayed"
                rows={2}
                className="text-xs bg-background border-border/60 resize-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="h-7 gap-1.5 text-xs"
            >
              {updateMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Save className="w-3 h-3" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentationPage() {
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<PaarFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useGetPaarStatus({
    query: { refetchInterval: 60_000 },
  });

  const all = data?.containers ?? [];
  const released = all.filter((c) => !!c.paarReleasedAt);
  const pending = all.filter((c) => !c.paarReleasedAt);

  const filtered = all
    .filter((c) => {
      if (filter === "released") return !!c.paarReleasedAt;
      if (filter === "pending") return !c.paarReleasedAt;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.containerNumber.toLowerCase().includes(q) ||
        c.blNumber.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        (c.paarOfficer ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-primary" />
            Documentation — PAAR Tracker
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track Pre-Arrival Assessment Report status across all active containers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 gap-1.5 text-xs shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 border-border/40 bg-card/40 text-center">
          <p className="text-2xl font-bold text-foreground">{all.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Jobs</p>
        </Card>
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5 text-center">
          <p className="text-2xl font-bold text-emerald-400">{released.length}</p>
          <p className="text-xs text-muted-foreground mt-1">PAAR Released</p>
        </Card>
        <Card className="p-4 border-amber-500/20 bg-amber-500/5 text-center">
          <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
          <p className="text-xs text-muted-foreground mt-1">PAAR Pending</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search container, BL, customer, officer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-background border-border/60"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "pending", "released"] as PaarFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="h-7 text-xs capitalize"
            >
              {f === "all" ? `All (${all.length})` : f === "pending" ? `PAAR Pending (${pending.length})` : `PAAR Released (${released.length})`}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileCheck2 className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No containers match this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <InlineEditRow key={item.id} item={item} isAdmin={isAdmin ?? false} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
