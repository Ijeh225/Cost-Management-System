import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClients, useCreateClient, useDeleteClient, useCreateClientsBulk,
  type Client,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Plus, Search, Loader2, Trash2, ChevronRight, ChevronDown,
  Phone, Mail, MapPin, Building2, Upload, Download, AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const CLIENT_TEMPLATE_ROWS = [
  { "CLIENT NAME": "Dangote Industries Ltd",  "CONTACT PERSON": "Chukwudi Okonkwo", "EMAIL": "ck@dangote.com",   "PHONE": "+2348012345678", "ADDRESS": "Lagos, Nigeria",  "NOTES": "Preferred client" },
  { "CLIENT NAME": "Nestlé Nigeria Plc",       "CONTACT PERSON": "Aisha Musa",        "EMAIL": "am@nestle.com.ng", "PHONE": "+2348098765432", "ADDRESS": "Lagos Island",    "NOTES": "" },
];
const CLIENT_COLS = ["CLIENT NAME", "CONTACT PERSON", "EMAIL", "PHONE", "ADDRESS", "NOTES"];

function downloadClientTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(CLIENT_TEMPLATE_ROWS, { header: CLIENT_COLS });
  ws["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 22 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  XLSX.writeFile(wb, "client_upload_template.xlsx");
}

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
      <Card className="group border-border/50 bg-card/40 hover:bg-card/70 hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-2">
              {(client as any).containerCount != null && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {(client as any).containerCount} containers
                </Badge>
              )}
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/20 hover:text-destructive text-muted-foreground"
                >
                  {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
          <h3 className="font-semibold text-sm text-foreground mb-1 truncate">{client.name}</h3>
          {client.contactName && (
            <p className="text-xs text-muted-foreground truncate mb-2">{client.contactName}</p>
          )}
          <div className="space-y-1">
            {client.contactPhone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="w-3 h-3 shrink-0" />
                <span className="truncate">{client.contactPhone}</span>
              </div>
            )}
            {client.contactEmail && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{client.contactEmail}</span>
              </div>
            )}
            {client.address && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{client.address}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end mt-3 pt-2 border-t border-border/30">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
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

type BulkResult = { created: number; duplicates: string[]; errors: string[] };

function BulkUploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkMutation = useCreateClientsBulk();

  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
    setParseErrors([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => { reset(); onClose(); };

  const processFile = async (f: File) => {
    setIsParsing(true);
    setRows([]);
    setParseErrors([]);
    setResult(null);
    setFileName(f.name);

    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      let rawData: any[] = [];

      if (ext === "csv") {
        const text = await f.text();
        rawData = (Papa.parse(text, { header: true, skipEmptyLines: true }) as any).data;
      } else {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf);
        rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      }

      const getVal = (row: any, keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(r => r.toLowerCase().replace(/[^a-z0-9]/g, "") === k);
          if (found && row[found]) return String(row[found]).trim();
        }
        return undefined;
      };

      const mapped: any[] = [];
      const errs: string[] = [];
      rawData.forEach((row, i) => {
        const name = getVal(row, ["clientname", "client", "companyname", "name"]);
        if (!name) { errs.push(`Row ${i + 1}: Missing client name`); return; }
        mapped.push({
          name,
          contactName:  getVal(row, ["contactperson", "contactname", "contact"])  ?? "",
          contactEmail: getVal(row, ["email", "contactemail"])                     ?? "",
          contactPhone: getVal(row, ["phone", "contactphone", "mobile", "tel"])    ?? "",
          address:      getVal(row, ["address", "location"])                       ?? "",
          notes:        getVal(row, ["notes", "remarks", "note"])                  ?? "",
        });
      });

      setRows(mapped);
      setParseErrors(errs.slice(0, 10));
    } catch (err: any) {
      setParseErrors([err.message || "Failed to parse file"]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpload = () => {
    bulkMutation.mutate({ data: { rows } }, {
      onSuccess: (res) => {
        setResult(res);
        qc.invalidateQueries({ queryKey: ["/api/clients"] });
        if (res.created > 0) {
          toast({ title: `${res.created} client${res.created !== 1 ? "s" : ""} created` });
        }
      },
      onError: () => toast({ variant: "destructive", title: "Bulk upload failed" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Bulk Upload Clients
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle2 className="w-5 h-5 text-green-400" /> Upload Complete
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-400/10 border border-green-400/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{result.created}</div>
                  <div className="text-xs text-muted-foreground mt-1">Created</div>
                </div>
                <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-400">{result.duplicates.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Duplicates Skipped</div>
                </div>
                <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-400">{result.errors.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Errors</div>
                </div>
              </div>
              {result.duplicates.length > 0 && (
                <p className="text-xs text-muted-foreground">Duplicates: {result.duplicates.join(", ")}</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset}>Upload Another File</Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="text-xs text-muted-foreground leading-relaxed">
                Upload an Excel or CSV with columns: <span className="text-primary font-semibold">CLIENT NAME</span> (required),
                CONTACT PERSON, EMAIL, PHONE, ADDRESS, NOTES.{" "}
                <button onClick={downloadClientTemplate} className="text-primary underline hover:no-underline">
                  Download template
                </button>
              </div>
            </div>

            {!fileName ? (
              <div
                className="border-2 border-dashed border-border/50 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:bg-accent/20 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Click to select file</p>
                <p className="text-xs text-muted-foreground/60">.csv or .xlsx</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </div>
            ) : isParsing ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Parsing {fileName}…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{fileName}</span>
                  <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">Change file</button>
                </div>

                {parseErrors.length > 0 && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {parseErrors.length} row(s) skipped
                    </p>
                    <ul className="text-xs text-destructive/80 list-disc pl-4 space-y-0.5">
                      {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}

                {rows.length > 0 && (
                  <div className="max-h-56 overflow-auto border border-border/50 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card border-b border-border/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">#</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Name</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Contact</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Email</th>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Phone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-accent/20">
                            <td className="px-3 py-2 text-muted-foreground/50 font-mono">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.contactName || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.contactEmail || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.contactPhone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 50 && (
                      <div className="p-2 text-center text-xs text-muted-foreground bg-accent/10 border-t border-border/50">
                        Showing 50 of {rows.length} rows
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">{rows.length} records ready to import</p>
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={handleUpload}
                      disabled={rows.length === 0 || bulkMutation.isPending}
                    >
                      {bulkMutation.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Importing…</>
                        : <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Import {rows.length} Clients</>
                      }
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2 shadow-md">
              <Plus className="w-4 h-4" /> Add Client <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setShowCreate(true)} className="gap-2.5 cursor-pointer">
              <Building2 className="w-4 h-4 text-primary" />
              <div>
                <div className="font-medium text-sm">Add New Client</div>
                <div className="text-xs text-muted-foreground">Fill in a single form</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowBulk(true)} className="gap-2.5 cursor-pointer">
              <Upload className="w-4 h-4 text-blue-400" />
              <div>
                <div className="font-medium text-sm">Bulk Upload Excel</div>
                <div className="text-xs text-muted-foreground">Import multiple at once</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadClientTemplate} className="gap-2.5 cursor-pointer">
              <Download className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium text-sm">Download Template</div>
                <div className="text-xs text-muted-foreground">Excel format for bulk upload</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      <BulkUploadDialog open={showBulk} onClose={() => setShowBulk(false)} />
    </motion.div>
  );
}
