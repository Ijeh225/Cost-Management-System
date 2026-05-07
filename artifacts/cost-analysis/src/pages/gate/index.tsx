import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  useListContainers,
  useGateIn,
  useGateOut,
  useGetGateLog,
  type GateLogEntry,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Search, LogIn, LogOut, X, RefreshCw,
  Download, Calendar, Clock, Loader2, ExternalLink, Lock,
} from "lucide-react";
import { getStatusColor, getStatusLabel } from "@/lib/format";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
      {getStatusLabel(status)}
    </span>
  );
}

type SelectedContainer = {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  size: string | null;
  command: string | null;
  status: string;
  gateInDate: string | null;
  gateOutDate: string | null;
};

export default function GatePage() {
  const { isAdmin, isSecurityUser } = useAuth();
  const canOperate = isAdmin || isSecurityUser;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<SelectedContainer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { toast } = useToast();

  const gateIn = useGateIn();
  const gateOut = useGateOut();

  const { data: searchData, isLoading: searching } = useListContainers(
    { page: 1, limit: 10, search: debouncedSearch || undefined },
    { query: { enabled: debouncedSearch.length >= 2 } }
  );

  const { data: logData, isLoading: logLoading, refetch: refetchLog } = useGetGateLog(
    { from: fromDate || undefined, to: toDate || undefined },
    { query: { refetchInterval: 30_000 } }
  );

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setShowDropdown(search.length >= 2);
    }, 300);
  }, [search]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = useCallback((c: any) => {
    setSelected({
      id: c.id,
      containerNumber: c.containerNumber,
      blNumber: c.blNumber,
      customerName: c.customerName,
      size: c.size ?? null,
      command: c.command ?? null,
      status: c.status,
      gateInDate: c.gateInDate ?? null,
      gateOutDate: c.gateOutDate ?? null,
    });
    setSearch(c.containerNumber);
    setShowDropdown(false);
  }, []);

  const handleGateIn = async () => {
    if (!selected) return;
    try {
      const updated = await gateIn.mutateAsync({ id: selected.id });
      setSelected(prev => prev ? {
        ...prev,
        status: (updated as any).status ?? prev.status,
        gateInDate: (updated as any).gateInDate ?? prev.gateInDate,
      } : null);
      toast({ title: "Gate-In recorded", description: `${selected.containerNumber} entered terminal at ${fmt(new Date().toISOString())}` });
      refetchLog();
    } catch (err) {
      toast({ variant: "destructive", title: "Gate-In failed", description: err instanceof Error ? err.message : "Server error" });
    }
  };

  const handleGateOut = async () => {
    if (!selected) return;
    try {
      const updated = await gateOut.mutateAsync({ id: selected.id });
      setSelected(prev => prev ? {
        ...prev,
        gateOutDate: (updated as any).gateOutDate ?? prev.gateOutDate,
      } : null);
      toast({ title: "Gate-Out recorded", description: `${selected.containerNumber} exited terminal at ${fmt(new Date().toISOString())}` });
      refetchLog();
    } catch (err) {
      toast({ variant: "destructive", title: "Gate-Out failed", description: err instanceof Error ? err.message : "Server error" });
    }
  };

  const handleCsvDownload = () => {
    const qs = new URLSearchParams();
    qs.set("csv", "1");
    if (fromDate) qs.set("from", fromDate);
    if (toDate) qs.set("to", toDate);
    window.open(`/api/containers/gate-log?${qs}`, "_blank");
  };

  const canGateIn = selected
    ? !selected.gateInDate && ["shipping", "pull_out", "gate_in", "examination", "final_release"].includes(selected.status)
    : false;
  const canGateOut = selected ? !!selected.gateInDate && !selected.gateOutDate : false;

  const allEntries: GateLogEntry[] = logData?.entries ?? [];
  const expectedEntries = allEntries.filter(e => e.earlyStartAuthorized && !e.gateInDate);
  const entries = allEntries.filter(e => !e.earlyStartAuthorized || !!e.gateInDate);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gate Security</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Record container Gate-In and Gate-Out events</p>
          </div>
        </div>
        {!canOperate && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5" />
            View only — security role required to record events
          </div>
        )}
      </div>

      {/* Container Search + Action Panel */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            Search Container
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search input */}
          <div className="relative" ref={searchRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 pr-9 font-mono"
                placeholder="Container No. or B/L number…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); }}
                onFocus={() => search.length >= 2 && setShowDropdown(true)}
              />
              {search && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setSearch(""); setSelected(null); setShowDropdown(false); }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown results */}
            {showDropdown && (
              <div className="absolute top-full mt-1 left-0 right-0 z-30 bg-popover border border-border/50 rounded-xl shadow-xl overflow-hidden">
                {searching && (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                  </div>
                )}
                {!searching && (!searchData?.containers || searchData.containers.length === 0) && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No containers found.</div>
                )}
                {!searching && (searchData?.containers ?? []).map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors border-b border-border/20 last:border-0 flex items-center justify-between gap-3"
                    onMouseDown={() => handleSelect(c)}
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-sm text-foreground">{c.containerNumber}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.customerName} · B/L {c.blNumber}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected container card */}
          {selected && (
            <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-4">
              {/* Container header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-lg text-foreground">{selected.containerNumber}</span>
                    {selected.size && <Badge variant="outline" className="text-[10px] font-medium">{selected.size}</Badge>}
                    {selected.command && <Badge variant="outline" className="text-[10px] font-medium border-blue-500/30 text-blue-400">{selected.command}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{selected.customerName} · B/L {selected.blNumber}</p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {/* Timestamp grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`rounded-lg border p-3 ${selected.gateInDate ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/30 bg-muted/20"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogIn className={`w-3.5 h-3.5 ${selected.gateInDate ? "text-emerald-400" : "text-muted-foreground"}`} />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Gate-In</span>
                  </div>
                  <p className={`text-sm font-mono ${selected.gateInDate ? "text-emerald-400 font-semibold" : "text-muted-foreground/50 italic"}`}>
                    {selected.gateInDate ? fmt(selected.gateInDate) : "Not yet recorded"}
                  </p>
                </div>
                <div className={`rounded-lg border p-3 ${selected.gateOutDate ? "border-amber-500/30 bg-amber-500/5" : "border-border/30 bg-muted/20"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogOut className={`w-3.5 h-3.5 ${selected.gateOutDate ? "text-amber-400" : "text-muted-foreground"}`} />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Gate-Out</span>
                  </div>
                  <p className={`text-sm font-mono ${selected.gateOutDate ? "text-amber-400 font-semibold" : "text-muted-foreground/50 italic"}`}>
                    {selected.gateOutDate ? fmt(selected.gateOutDate) : "Not yet recorded"}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {canOperate && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                    disabled={!canGateIn || gateIn.isPending || gateOut.isPending}
                    onClick={handleGateIn}
                  >
                    {gateIn.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                    Record Gate-In
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-40"
                    disabled={!canGateOut || gateIn.isPending || gateOut.isPending}
                    onClick={handleGateOut}
                  >
                    {gateOut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
                    Record Gate-Out
                  </Button>
                  {isAdmin && (
                    <Link href={`/containers/${selected.id}`}>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              )}
              {!canOperate && (
                <div className="text-xs text-muted-foreground text-center py-1">Read-only — security role required to record gate events.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gate Log */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Gate Log
              {logData && <span className="text-xs text-muted-foreground font-normal bg-muted/50 px-2 py-0.5 rounded-full">{entries.length} entries</span>}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  className="h-7 text-xs w-36"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  placeholder="From"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="date"
                  className="h-7 text-xs w-36"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  placeholder="To"
                />
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetchLog()} disabled={logLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${logLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={handleCsvDownload} disabled={entries.length === 0}>
                <Download className="w-3 h-3" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading gate log…
            </div>
          )}
          {!logLoading && entries.length === 0 && (
            <div className="py-14 text-center text-muted-foreground text-sm">
              No gate events found{(fromDate || toDate) ? " for the selected date range" : ""}.
            </div>
          )}
          {!logLoading && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Container</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Customer</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Size</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Status</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Gate-In</th>
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">Gate-Out</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-accent/10 transition-colors group">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-foreground text-sm">{e.containerNumber}</span>
                        <div className="text-[10px] text-muted-foreground font-mono">{e.blNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{e.customerName}</td>
                      <td className="px-4 py-3">
                        {e.size ? <Badge variant="outline" className="text-[10px] font-medium">{e.size}</Badge> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3">
                        {e.gateInDate ? (
                          <div className="flex items-center gap-1.5">
                            <LogIn className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="text-xs text-emerald-400 font-mono">{fmt(e.gateInDate)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {e.gateOutDate ? (
                          <div className="flex items-center gap-1.5">
                            <LogOut className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="text-xs text-amber-400 font-mono">{fmt(e.gateOutDate)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40 italic">
                            {e.gateInDate ? <span className="text-emerald-400/60 text-[11px] font-medium">In terminal</span> : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <Link href={`/containers/${e.id}`}>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent/50">
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
