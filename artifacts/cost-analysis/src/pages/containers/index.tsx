import { useState } from "react";
import { useListContainers } from "@workspace/api-client-react";
import { formatCurrency, getStatusColor, getStatusLabel } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, AlertCircle, FileSpreadsheet } from "lucide-react";

import { motion } from "framer-motion";

const ALL_STATUSES = ["new_upload", "documentation_review", "shipping_entry", "customs_entry", "terminal_entry", "delivery_entry", "accounting_review", "management_approval", "completed", "closed"];

export default function Containers() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 15;

  // Debounce search conceptually (just passing raw for now, react query handles cache)
  const queryParams = {
    page,
    limit,
    ...(search ? { search } : {}),
    ...(status !== "all" ? { status } : {}),
  };

  const { data, isLoading, isError } = useListContainers(queryParams, {
    query: { keepPreviousData: true }
  });

  const handleRowClick = (id: number) => {
    setLocation(`/containers/${id}`);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Container Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and track all container clearing records.</p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4 justify-between items-center bg-background/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by Container #, BL #, Customer..." 
              className="pl-9 bg-background border-border/60"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[200px] bg-background border-border/60">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ALL_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase font-mono tracking-wider border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-medium">Container / BL</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium">Vessel / Size</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Gross Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse bg-card/20">
                    <td className="px-6 py-5"><div className="h-4 bg-muted/50 rounded w-24 mb-2"/><div className="h-3 bg-muted/30 rounded w-32"/></td>
                    <td className="px-6 py-5"><div className="h-4 bg-muted/50 rounded w-32"/></td>
                    <td className="px-6 py-5"><div className="h-4 bg-muted/50 rounded w-20 mb-2"/><div className="h-3 bg-muted/30 rounded w-12"/></td>
                    <td className="px-6 py-5"><div className="h-6 bg-muted/50 rounded-full w-24"/></td>
                    <td className="px-6 py-5 text-right"><div className="h-4 bg-muted/50 rounded w-20 ml-auto"/></td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-destructive">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      Failed to load containers.
                    </div>
                  </td>
                </tr>
              ) : data?.containers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <FileSpreadsheet className="w-12 h-12 mb-4 text-muted-foreground/30" />
                      <p className="text-base">No containers found matching your criteria.</p>
                      <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data?.containers.map((container) => (
                  <tr 
                    key={container.id} 
                    onClick={() => handleRowClick(container.id)}
                    className="hover:bg-accent/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-mono font-medium text-foreground group-hover:text-primary transition-colors">{container.containerNumber}</div>
                      <div className="text-xs text-muted-foreground mt-1">BL: {container.blNumber}</div>
                    </td>
                    <td className="px-6 py-4 font-medium">{container.customerName}</td>
                    <td className="px-6 py-4">
                      <div className="text-foreground">{container.vessel}</div>
                      <div className="text-xs text-muted-foreground mt-1">{container.size}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getStatusColor(container.status)}`}>
                        {getStatusLabel(container.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`font-mono font-medium ${container.grossProfit < 0 ? 'text-destructive' : container.grossProfit > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {formatCurrency(container.grossProfit)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Cost: {formatCurrency(container.totalCost)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {data && data.total > 0 && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between bg-background/30 text-sm text-muted-foreground">
            <div>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.total)} of <span className="font-medium text-foreground">{data.total}</span> entries
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="hover-elevate"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= data.total}
                className="hover-elevate"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
