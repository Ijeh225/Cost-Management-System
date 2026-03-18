import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useUploadContainers, useListClients } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UploadCloud, FileType, CheckCircle2, AlertTriangle, Loader2, X,
  Download, TableProperties, Globe, Building2,
} from "lucide-react";
import type { UploadRow } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";

const SAMPLE_ROWS = [
  { "CUSTOMER NAME": "Dangote Industries Ltd",  "CON": "MSCU1234567", "B/LADING": "MSC0012345", "DECLARATION": "ND20251001", "SIZE": "40FT",  "VESSEL": "MSC ANNA"       },
  { "CUSTOMER NAME": "Nestlé Nigeria Plc",       "CON": "HLCU8765432", "B/LADING": "HLC0056789", "DECLARATION": "ND20251002", "SIZE": "20FT",  "VESSEL": "HAPAG SPIRIT"   },
  { "CUSTOMER NAME": "BUA Cement Plc",           "CON": "CMAU5553210", "B/LADING": "CMA0078901", "DECLARATION": "ND20251003", "SIZE": "40FT",  "VESSEL": "CMA KALAHARI"   },
  { "CUSTOMER NAME": "Guinness Nigeria Plc",     "CON": "MAEU3214567", "B/LADING": "MAE0034567", "DECLARATION": "ND20251004", "SIZE": "40HC",  "VESSEL": "MAERSK ESSEX"   },
];

const COLUMNS = ["CUSTOMER NAME", "CON", "B/LADING", "DECLARATION", "SIZE", "VESSEL"];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: COLUMNS });
  const colWidths = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 20 }];
  ws["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, "Containers");
  XLSX.writeFile(wb, "container_upload_template.xlsx");
}

type UploadMode = "general" | "client";

export default function UploadPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("general");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
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
    } catch (err: any) {
      setErrors([err.message || "Failed to parse file."]);
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
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Upload Failed", description: err.message || "An unexpected error occurred." });
      },
    });
  };

  const canUpload = mode === "general" || (mode === "client" && !!selectedClientId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload Containers</h1>
          <p className="text-muted-foreground text-sm mt-1">Batch import container records via CSV or Excel file.</p>
        </div>
        <Button variant="outline" onClick={downloadTemplate} className="hover-elevate shrink-0">
          <Download className="w-4 h-4 mr-2" /> Download Template
        </Button>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setMode("general")}
          className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
            mode === "general"
              ? "border-primary/50 bg-primary/5 shadow-sm"
              : "border-border/50 bg-card/40 hover:bg-card/70 hover:border-border"
          }`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${mode === "general" ? "bg-primary/20" : "bg-secondary"}`}>
            <Globe className={`w-4 h-4 ${mode === "general" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${mode === "general" ? "text-foreground" : "text-muted-foreground"}`}>
                General Upload
              </p>
              {mode === "general" && <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border border-primary/30">Selected</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Import containers from any customer. Customer names come from the file.
            </p>
          </div>
        </button>

        <button
          onClick={() => setMode("client")}
          className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
            mode === "client"
              ? "border-primary/50 bg-primary/5 shadow-sm"
              : "border-border/50 bg-card/40 hover:bg-card/70 hover:border-border"
          }`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${mode === "client" ? "bg-primary/20" : "bg-secondary"}`}>
            <Building2 className={`w-4 h-4 ${mode === "client" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-semibold ${mode === "client" ? "text-foreground" : "text-muted-foreground"}`}>
                Customer-Linked Upload
              </p>
              {mode === "client" && <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border border-primary/30">Selected</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              All containers in the file are linked to one specific client.
            </p>
          </div>
        </button>
      </div>

      {/* Client Picker (mode = client) */}
      <AnimatePresence>
        {mode === "client" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-border/50 bg-card/40">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">Select Customer</p>
                  <p className="text-xs text-muted-foreground">All containers will be auto-linked to this client and the customer name taken from their profile.</p>
                </div>
                <div className="w-full sm:w-72">
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="h-9 text-sm border-border/50 bg-background/50">
                      <SelectValue placeholder={clients.length === 0 ? "No clients yet" : "Choose a client…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sample Format Card */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3 flex flex-row items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <TableProperties className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Required File Format</CardTitle>
            <CardDescription className="text-xs">
              {mode === "client"
                ? "CUSTOMER NAME column is optional — it will be overridden by the selected client's name."
                : "Your file must contain these columns (order does not matter). Highlighted columns are required."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-y border-border/50 bg-secondary/20">
                <tr>
                  {COLUMNS.map((col) => {
                    const required = mode === "general"
                      ? ["CUSTOMER NAME", "CON", "B/LADING"].includes(col)
                      : ["CON", "B/LADING"].includes(col);
                    return (
                      <th key={col} className={`px-4 py-2.5 font-mono font-semibold tracking-wider ${required ? "text-primary" : "text-muted-foreground"}`}>
                        {col}
                        {required && <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1 rounded">required</span>}
                        {col === "CUSTOMER NAME" && mode === "client" && (
                          <span className="ml-1 text-[10px] bg-secondary text-muted-foreground px-1 rounded">ignored</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {SAMPLE_ROWS.map((row, i) => (
                  <tr key={i} className="hover:bg-accent/30 transition-colors">
                    {COLUMNS.map((col) => (
                      <td key={col} className="px-4 py-2.5 font-mono text-muted-foreground">
                        {row[col as keyof typeof row]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className={`border-border/50 border-dashed border-2 bg-card/20 transition-colors ${canUpload ? "hover:bg-card/40 cursor-pointer" : "opacity-60 cursor-not-allowed"}`}>
              <CardContent className="p-12">
                <div
                  className="flex flex-col items-center justify-center text-center"
                  onDragOver={canUpload ? handleDragOver : undefined}
                  onDrop={canUpload ? handleDrop : undefined}
                  onClick={() => canUpload && fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <UploadCloud className="w-8 h-8 text-primary" />
                  </div>
                  {!canUpload ? (
                    <>
                      <h3 className="text-lg font-semibold mb-1">Select a customer first</h3>
                      <p className="text-sm text-muted-foreground">Choose a client from the dropdown above before uploading.</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-1">Click or drag your file here</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Supports .csv and .xlsx — max 10MB
                        {mode === "client" && selectedClient && (
                          <> · Will link to <span className="text-primary font-semibold">{selectedClient.name}</span></>
                        )}
                      </p>
                      <Button variant="outline" className="hover-elevate pointer-events-none">
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
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="border-border/50 bg-card/40 shadow-lg">
              <CardHeader className="flex flex-row items-start justify-between bg-secondary/20 border-b border-border/50 pb-4">
                <div className="flex items-center gap-3">
                  <FileType className="w-8 h-8 text-primary" />
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {file.name}
                      {mode === "client" && selectedClient && (
                        <Badge variant="outline" className="text-xs font-normal border-primary/30 text-primary bg-primary/10">
                          → {selectedClient.name}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {(file.size / 1024).toFixed(1)} KB &bull; {parsedData.length} valid rows detected
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={clearFile}
                  disabled={uploadMutation.isPending}
                  className="hover:bg-destructive/20 hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {isParsing ? (
                  <div className="p-12 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                    <p className="text-sm text-muted-foreground">Parsing your file...</p>
                  </div>
                ) : (
                  <>
                    {errors.length > 0 && (
                      <div className="p-5 bg-destructive/10 border-b border-destructive/20">
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                          <AlertTriangle className="w-4 h-4" /> {errors.length} issue(s) found — rows with errors will be skipped
                        </h4>
                        <ul className="text-xs text-destructive/80 space-y-1 list-disc pl-5">
                          {errors.map((err, i) => <li key={i}>{err}</li>)}
                          {errors.length === 10 && <li>…and more. Fix your file and re-upload.</li>}
                        </ul>
                      </div>
                    )}

                    {parsedData.length > 0 && (
                      <div className="max-h-[420px] overflow-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border text-muted-foreground uppercase font-mono">
                            <tr>
                              <th className="px-4 py-3 font-medium">#</th>
                              <th className="px-4 py-3 font-medium">Customer Name</th>
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

              <CardFooter className="p-4 border-t border-border/50 flex items-center justify-between bg-secondary/10">
                <p className="text-xs text-muted-foreground">
                  {parsedData.length} records ready to import
                  {mode === "client" && selectedClient && ` → ${selectedClient.name}`}
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={clearFile} disabled={uploadMutation.isPending}>
                    Choose Different File
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={parsedData.length === 0 || uploadMutation.isPending}
                    className="shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                  >
                    {uploadMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" /> Import {parsedData.length} Records</>
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
