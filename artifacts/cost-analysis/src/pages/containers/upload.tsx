import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useUploadContainers, useListClients } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UploadCloud, FileType, CheckCircle2, AlertTriangle, Loader2, X,
  Download, Globe, Building2, ChevronDown, ChevronUp,
} from "lucide-react";
import type { UploadRow } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";

const SAMPLE_ROWS = [
  { "CUSTOMER NAME": "Dangote Industries Ltd",  "CON": "MSCU1234567", "B/LADING": "MSC0012345", "DECLARATION": "ND20251001", "SIZE": "40FT",  "VESSEL": "MSC ANNA"     },
  { "CUSTOMER NAME": "Nestlé Nigeria Plc",       "CON": "HLCU8765432", "B/LADING": "HLC0056789", "DECLARATION": "ND20251002", "SIZE": "20FT",  "VESSEL": "HAPAG SPIRIT" },
  { "CUSTOMER NAME": "BUA Cement Plc",           "CON": "CMAU5553210", "B/LADING": "CMA0078901", "DECLARATION": "ND20251003", "SIZE": "40FT",  "VESSEL": "CMA KALAHARI"},
  { "CUSTOMER NAME": "Guinness Nigeria Plc",     "CON": "MAEU3214567", "B/LADING": "MAE0034567", "DECLARATION": "ND20251004", "SIZE": "40HC",  "VESSEL": "MAERSK ESSEX"},
];
const COLUMNS = ["CUSTOMER NAME", "CON", "B/LADING", "DECLARATION", "SIZE", "VESSEL"];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: COLUMNS });
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, "Containers");
  XLSX.writeFile(wb, "container_upload_template.xlsx");
}

type UploadMode = "general" | "client";

function StepBadge({ n }: { n: string }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
      {n}
    </span>
  );
}

export default function UploadPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("general");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [formatOpen, setFormatOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<UploadRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const uploadMutation = useUploadContainers();
  const { data: clients = [] } = useListClients();

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  const selectedClient = clients.find(c => String(c.id) === selectedClientId);
  const canUpload = mode === "general" || (mode === "client" && !!selectedClientId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && canUpload) processFile(dropped);
  };

  const processFile = async (f: File) => {
    setFile(f);
    setIsParsing(true);
    setErrors([]);
    setParsedData([]);

    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      let rawData: any[] = [];

      if (ext === "csv") {
        const text = await f.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = result.data as any[];
      } else if (ext === "xlsx" || ext === "xls") {
        const buffer = await f.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawData = XLSX.utils.sheet_to_json(sheet);
      } else {
        throw new Error("Unsupported file type. Please upload CSV or Excel.");
      }

      const mapped: UploadRow[] = [];
      const errs: string[] = [];

      rawData.forEach((row, idx) => {
        const getVal = (keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(row).find(
              (r) => r.toLowerCase().replace(/[^a-z0-9]/g, "") === k.toLowerCase()
            );
            if (found && row[found]) return String(row[found]).trim();
          }
          return undefined;
        };

        const containerNumber = getVal(["containernumber", "container", "con", "containerno"]);
        const blNumber        = getVal(["blnumber", "bl", "blading", "billoflading"]);

        if (!containerNumber || !blNumber) {
          errs.push(`Row ${idx + 1}: Missing required fields (CON or B/Lading)`);
          return;
        }

        const customerName =
          mode === "client" && selectedClient
            ? selectedClient.name
            : getVal(["customername", "customer", "consignee"]);

        mapped.push({
          customerName: customerName ?? "",
          containerNumber,
          blNumber,
          declaration:     getVal(["declaration", "sgad"]),
          size:            getVal(["size", "containersize"]),
          vessel:          getVal(["vessel", "ship"]),
          clearingCharges: Number(getVal(["clearingcharges", "agreedclearing"])) || 0,
        });
      });

      setParsedData(mapped);
      if (errs.length > 0) setErrors(errs.slice(0, 10));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Failed to parse file."]);
    } finally {
      setIsParsing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = () => {
    if (parsedData.length === 0) return;
    const clientId = mode === "client" && selectedClientId ? Number(selectedClientId) : undefined;
    uploadMutation.mutate({ data: { rows: parsedData, clientId } }, {
      onSuccess: (res) => {
        toast({
          title: "Upload Complete",
          description: `Created ${res.created} records.${res.duplicates.length > 0 ? ` Skipped ${res.duplicates.length} duplicates.` : ""}`,
        });
        if (res.errors && res.errors.length > 0) {
          setErrors(res.errors);
        } else {
          setTimeout(() => setLocation("/containers"), 1500);
        }
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: err instanceof Error ? err.message : "An unexpected error occurred.",
        });
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── Setup card (steps 1 – 3) ─────────────────────────────────────── */}
      <Card className="border-border/50 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/40">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Upload Containers
          </CardTitle>
          <CardDescription className="text-xs">
            Batch-import container records from a CSV or Excel file.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">

          {/* ── Step 1: Mode ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <StepBadge n="1" /> Upload mode
            </p>
            <div className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-0.5 gap-0.5">
              <button
                onClick={() => { setMode("general"); setSelectedClientId(""); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "general"
                    ? "bg-card shadow-sm text-foreground border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                General
              </button>
              <button
                onClick={() => setMode("client")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "client"
                    ? "bg-card shadow-sm text-foreground border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Customer-Linked
              </button>
            </div>
            <p className="text-xs text-muted-foreground pl-0.5">
              {mode === "general"
                ? "Customer names are read from the file."
                : "All containers will be linked to one client you choose."}
            </p>
          </div>

          {/* ── Step 2: Client picker (client mode only) ──────────────────── */}
          <AnimatePresence>
            {mode === "client" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <StepBadge n="2" /> Select customer
                  </p>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="h-9 text-sm border-border/50 bg-background/50 max-w-xs">
                      <SelectValue placeholder={clients.length === 0 ? "No clients yet" : "Choose a client…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 3: Drop zone ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <StepBadge n={mode === "client" ? "3" : "2"} /> Upload file
            </p>

            <AnimatePresence mode="wait">
              {!file ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                >
                  <div
                    onClick={() => canUpload && fileInputRef.current?.click()}
                    onDragOver={canUpload ? handleDragOver : undefined}
                    onDragLeave={canUpload ? handleDragLeave : undefined}
                    onDrop={canUpload ? handleDrop : undefined}
                    className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 text-center transition-all
                      ${!canUpload
                        ? "opacity-50 cursor-not-allowed border-border/40 bg-muted/10"
                        : dragOver
                          ? "border-primary bg-primary/5 cursor-pointer scale-[1.01]"
                          : "border-border/50 bg-card/20 cursor-pointer hover:border-primary/40 hover:bg-card/40"
                      }`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${dragOver ? "bg-primary/20" : "bg-primary/10"}`}>
                      <UploadCloud className={`w-6 h-6 transition-colors ${dragOver ? "text-primary" : "text-primary/70"}`} />
                    </div>

                    {!canUpload ? (
                      <>
                        <p className="text-sm font-medium text-muted-foreground">Select a customer first</p>
                        <p className="text-xs text-muted-foreground/70">Pick a client in Step 2 before uploading.</p>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {dragOver ? "Drop to upload" : "Click or drag your file here"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Supports .csv and .xlsx — max 10 MB
                            {mode === "client" && selectedClient && (
                              <> · Links to <span className="text-primary font-medium">{selectedClient.name}</span></>
                            )}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="pointer-events-none mt-1">
                          Select File
                        </Button>
                      </>
                    )}

                    <input
                      type="file"
                      className="hidden"
                      accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
                >
                  <FileType className="w-8 h-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                      {!isParsing && parsedData.length > 0 && ` · ${parsedData.length} rows parsed`}
                      {isParsing && " · Parsing…"}
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    onClick={clearFile}
                    disabled={uploadMutation.isPending}
                    className="hover:bg-destructive/20 hover:text-destructive shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Format guide (collapsible) ────────────────────────────────── */}
          <div className="border border-border/40 rounded-lg overflow-hidden">
            <button
              onClick={() => setFormatOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
            >
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                File format guide &amp; template
              </span>
              <span className="flex items-center gap-2">
                {formatOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1.5 text-primary hover:bg-primary/10 pointer-events-auto"
                    onClick={e => { e.stopPropagation(); downloadTemplate(); }}
                  >
                    <Download className="w-3 h-3" />
                    Download Template
                  </Button>
                )}
                {formatOpen
                  ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </span>
            </button>

            <AnimatePresence>
              {formatOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border/40 px-4 py-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {mode === "client"
                        ? "CON and B/LADING are required. CUSTOMER NAME is optional — it will be replaced by the selected client."
                        : "Your file must include these columns (order doesn't matter). Required columns are highlighted."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COLUMNS.map(col => {
                        const required = mode === "general"
                          ? ["CUSTOMER NAME", "CON", "B/LADING"].includes(col)
                          : ["CON", "B/LADING"].includes(col);
                        const ignored = col === "CUSTOMER NAME" && mode === "client";
                        return (
                          <span
                            key={col}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold border
                              ${required
                                ? "bg-primary/10 text-primary border-primary/30"
                                : ignored
                                  ? "bg-muted/50 text-muted-foreground/50 border-border/30 line-through"
                                  : "bg-muted/30 text-muted-foreground border-border/40"
                              }`}
                          >
                            {col}
                            {required && <span className="text-[9px] font-normal opacity-70">req</span>}
                            {ignored && <span className="text-[9px] font-normal">ignored</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </CardContent>
      </Card>

      {/* ── Preview & import card (appears after file is loaded) ─────────── */}
      <AnimatePresence>
        {file && (
          <motion.div
            key="preview-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            <Card className="border-border/50 bg-card/40 shadow-lg overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between bg-secondary/20 border-b border-border/50 py-3 px-5">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    Preview
                    {mode === "client" && selectedClient && (
                      <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary bg-primary/10">
                        → {selectedClient.name}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {isParsing ? "Reading your file…" : `${parsedData.length} records ready · ${errors.length > 0 ? `${errors.length} error(s)` : "no errors"}`}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {isParsing ? (
                  <div className="p-10 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Parsing your file…</p>
                  </div>
                ) : (
                  <>
                    {errors.length > 0 && (
                      <div className="px-5 py-4 bg-destructive/10 border-b border-destructive/20">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                          <AlertTriangle className="w-4 h-4" />
                          {errors.length} issue(s) found — affected rows will be skipped
                        </h4>
                        <ul className="text-xs text-destructive/80 space-y-1 list-disc pl-5">
                          {errors.map((err, i) => <li key={i}>{err}</li>)}
                          {errors.length === 10 && <li>…and more. Fix your file and re-upload.</li>}
                        </ul>
                      </div>
                    )}

                    {parsedData.length > 0 && (
                      <div className="max-h-[360px] overflow-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border text-muted-foreground uppercase font-mono">
                            <tr>
                              <th className="px-4 py-3 font-medium">#</th>
                              <th className="px-4 py-3 font-medium">Customer</th>
                              <th className="px-4 py-3 font-medium">Container #</th>
                              <th className="px-4 py-3 font-medium">B/L Number</th>
                              <th className="px-4 py-3 font-medium">Declaration</th>
                              <th className="px-4 py-3 font-medium">Size</th>
                              <th className="px-4 py-3 font-medium">Vessel</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {parsedData.slice(0, 100).map((row, i) => (
                              <tr key={i} className="hover:bg-accent/30 transition-colors">
                                <td className="px-4 py-2.5 text-muted-foreground/50 font-mono">{i + 1}</td>
                                <td className="px-4 py-2.5 font-medium text-foreground">{row.customerName || "—"}</td>
                                <td className="px-4 py-2.5 font-mono text-primary">{row.containerNumber}</td>
                                <td className="px-4 py-2.5 font-mono">{row.blNumber}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{row.declaration || "—"}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{row.size || "—"}</td>
                                <td className="px-4 py-2.5 text-muted-foreground">{row.vessel || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {parsedData.length > 100 && (
                          <div className="p-3 text-center text-xs text-muted-foreground bg-accent/20 border-t border-border/50">
                            Showing first 100 of {parsedData.length} rows
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              <CardFooter className="px-5 py-3 border-t border-border/50 flex items-center justify-between bg-secondary/10 gap-3">
                <p className="text-xs text-muted-foreground">
                  {parsedData.length} record{parsedData.length !== 1 ? "s" : ""} ready to import
                  {mode === "client" && selectedClient && ` → ${selectedClient.name}`}
                </p>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={clearFile} disabled={uploadMutation.isPending}>
                    Change file
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleUpload}
                    disabled={parsedData.length === 0 || uploadMutation.isPending}
                    className="shadow-sm"
                  >
                    {uploadMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing…</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Import {parsedData.length} Records</>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
