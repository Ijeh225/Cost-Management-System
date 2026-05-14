import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, Package, FileText, X, Clock, Trash2 } from "lucide-react";
import { useSearch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { getRecentItems, clearRecentItems, type RecentItem } from "@/lib/recent-items";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  closed: "Closed",
  on_hold: "On Hold",
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
};

function formatCurrency(val: string | number) {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useSearch(debouncedQuery);

  const allResults = [
    ...(data?.containers ?? []).map(c => ({
      type: "container" as const,
      id: c.id,
      label: c.containerNumber,
      sub: [c.customerName, STATUS_LABEL[c.status] ?? c.status].filter(Boolean).join(" · "),
      href: `/operations/${c.id}`,
    })),
    ...(data?.clients ?? []).map(cl => ({
      type: "client" as const,
      id: cl.id,
      label: cl.name,
      sub: [cl.contactName, cl.contactEmail].filter(Boolean).join(" · "),
      href: `/clients/${cl.id}`,
    })),
    ...(data?.invoices ?? []).map(inv => ({
      type: "invoice" as const,
      id: inv.id,
      label: inv.invoiceNumber,
      sub: [inv.clientName, STATUS_LABEL[inv.status] ?? inv.status, formatCurrency(inv.total)].filter(Boolean).join(" · "),
      href: `/invoices/${inv.id}`,
    })),
  ];

  const isEmpty = query.trim().length >= 2 && !isFetching && allResults.length === 0;
  const showResults = open && query.trim().length >= 2;
  const showRecents = open && query.trim().length === 0 && recentItems.length > 0;
  const showDropdown = showResults || showRecents;

  const handleNavigate = useCallback((href: string) => {
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    setMobileExpanded(false);
    navigate(href);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && allResults[activeIndex]) {
        handleNavigate(allResults[activeIndex].href);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setActiveIndex(-1);
  }, [data]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (mobileExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mobileExpanded]);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (inputRef.current) {
          setMobileExpanded(true);
          inputRef.current.focus();
          setOpen(true);
          setRecentItems(getRecentItems());
        }
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const handleFocus = () => {
    setOpen(true);
    setRecentItems(getRecentItems());
  };

  const handleClearRecents = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearRecentItems();
    setRecentItems([]);
  };

  const typeIcon = (type: string) => {
    if (type === "container") return <Package className="w-3.5 h-3.5 text-primary/70 shrink-0" />;
    if (type === "client") return <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  };

  const typeLabel = (type: string) => {
    if (type === "container") return "Container";
    if (type === "client") return "Client";
    return "Invoice";
  };

  const groups = ["container", "client", "invoice"] as const;
  const groupLabel: Record<string, string> = { container: "Containers", client: "Clients", invoice: "Invoices" };
  const mac = isMac();

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Mobile: collapsed icon button */}
      <button
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        onClick={() => setMobileExpanded(v => !v)}
        aria-label="Open search"
      >
        {mobileExpanded ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
      </button>

      {/* Desktop: always visible; Mobile: conditionally expanded */}
      <div className={`
        ${mobileExpanded
          ? "absolute right-0 top-10 w-72 z-50 bg-background border border-border/60 rounded-xl shadow-lg p-2"
          : "hidden md:flex items-center"
        }
      `}>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search containers, clients, invoices…"
            className="pl-9 pr-16 h-9 text-sm bg-accent/20 border-border/50 focus:border-primary/50 focus:bg-background transition-colors w-full rounded-lg"
            autoComplete="off"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isFetching && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
            {!isFetching && query && (
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setQuery(""); setOpen(false); }}
                tabIndex={-1}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {!query && (
              <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/40 select-none pointer-events-none">
                {mac ? "⌘K" : "Ctrl+K"}
              </kbd>
            )}
          </div>
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border/60 rounded-xl shadow-xl z-50 overflow-hidden">

            {/* Recents panel */}
            {showRecents && (
              <div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-accent/20">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    <Clock className="w-3 h-3" />
                    Recent
                  </span>
                  <button
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    onMouseDown={handleClearRecents}
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                </div>
                <div className="py-1 max-h-72 overflow-y-auto">
                  {recentItems.slice(0, 5).map(item => (
                    <button
                      key={item.href}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40 text-foreground transition-colors"
                      onMouseDown={e => { e.preventDefault(); handleNavigate(item.href); }}
                    >
                      <span className="mt-0.5">
                        {item.type === "container"
                          ? <Package className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                          : <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        }
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{item.label}</div>
                        {item.sub && (
                          <div className="text-[11px] text-muted-foreground truncate">{item.sub}</div>
                        )}
                      </div>
                      <span className="ml-auto text-[10px] text-muted-foreground/50 uppercase tracking-wide shrink-0 pt-0.5">
                        {item.type === "container" ? "Container" : "Invoice"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search results panel */}
            {showResults && (
              <>
                {isFetching && allResults.length === 0 && (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching…
                  </div>
                )}
                {isEmpty && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No results found for <span className="font-medium text-foreground">"{query}"</span>
                  </div>
                )}
                {!isFetching && allResults.length > 0 && (
                  <div className="py-1 max-h-96 overflow-y-auto">
                    {groups.map(group => {
                      const groupItems = allResults.filter(r => r.type === group);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={group}>
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 bg-accent/20">
                            {groupLabel[group]}
                          </div>
                          {groupItems.map(item => {
                            const globalIdx = allResults.indexOf(item);
                            const isActive = globalIdx === activeIndex;
                            return (
                              <button
                                key={`${item.type}-${item.id}`}
                                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                                  isActive ? "bg-primary/10 text-foreground" : "hover:bg-accent/40 text-foreground"
                                }`}
                                onMouseEnter={() => setActiveIndex(globalIdx)}
                                onMouseDown={e => { e.preventDefault(); handleNavigate(item.href); }}
                              >
                                <span className="mt-0.5">{typeIcon(item.type)}</span>
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{item.label}</div>
                                  {item.sub && (
                                    <div className="text-[11px] text-muted-foreground truncate">{item.sub}</div>
                                  )}
                                </div>
                                <span className="ml-auto text-[10px] text-muted-foreground/50 uppercase tracking-wide shrink-0 pt-0.5">
                                  {typeLabel(item.type)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
