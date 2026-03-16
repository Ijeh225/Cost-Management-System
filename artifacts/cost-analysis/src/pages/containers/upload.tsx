import { useState, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useUploadContainers } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, FileType, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import type { UploadRow } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";

export default function UploadPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<UploadRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  
  const uploadMutation = useUploadContainers();

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    processFile(droppedFile);
  };

  const processFile = async (file: File) => {
    setFile(file);
    setIsParsing(true);
    setErrors([]);
    setParsedData([]);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let rawData: any[] = [];

      if (ext === 'csv') {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rawData = result.data;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rawData = XLSX.utils.sheet_to_json(sheet);
      } else {
        throw new Error("Unsupported file type. Please upload CSV or Excel.");
      }

      // Map headers to required schema roughly (assuming headers match mostly)
      const mapped: UploadRow[] = [];
      const errs: string[] = [];

      rawData.forEach((row, idx) => {
        const getVal = (keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(row).find(r => r.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase());
            if (found && row[found]) return String(row[found]).trim();
          }
          return undefined;
        };

        const customerName = getVal(['customername', 'customer', 'consignee']);
        const containerNumber = getVal(['containernumber', 'container', 'containerno']);
        const blNumber = getVal(['blnumber', 'bl', 'billoflading']);
        
        if (!customerName || !containerNumber || !blNumber) {
          errs.push(`Row ${idx + 1}: Missing required fields (Customer, Container #, or BL #)`);
          return;
        }

        mapped.push({
          customerName,
          containerNumber,
          blNumber,
          declaration: getVal(['declaration', 'sgad']),
          size: getVal(['size', 'containersize']),
          vessel: getVal(['vessel', 'ship']),
          clearingCharges: Number(getVal(['clearingcharges', 'agreedclearing'])) || 0,
        });
      });

      setParsedData(mapped);
      if (errs.length > 0) setErrors(errs.slice(0, 10)); // Show max 10 errors

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

    uploadMutation.mutate({ data: { rows: parsedData } }, {
      onSuccess: (res) => {
        toast({
          title: "Upload Complete",
          description: `Successfully created ${res.created} records. ${res.duplicates.length > 0 ? `Skipped ${res.duplicates.length} duplicates.` : ''}`,
        });
        if (res.errors && res.errors.length > 0) {
          setErrors(res.errors);
        } else {
          setTimeout(() => setLocation('/containers'), 1500);
        }
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: err.message || "An unexpected error occurred.",
        });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload Containers</h1>
        <p className="text-muted-foreground text-sm mt-1">Batch import container records via CSV or Excel.</p>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card className="border-border/50 border-dashed border-2 bg-card/20 hover:bg-card/40 transition-colors">
              <CardContent className="p-12">
                <div 
                  className="flex flex-col items-center justify-center text-center cursor-pointer"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <UploadCloud className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">Click or drag file to upload</h3>
                  <p className="text-sm text-muted-foreground mb-6">Supports .csv, .xlsx up to 10MB</p>
                  <Button variant="outline" className="hover-elevate pointer-events-none">
                    Select File
                  </Button>
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="border-border/50 bg-card/40 shadow-lg">
              <CardHeader className="flex flex-row items-start justify-between bg-secondary/20 border-b border-border/50 pb-4">
                <div className="flex items-center gap-3">
                  <FileType className="w-8 h-8 text-primary" />
                  <div>
                    <CardTitle className="text-base">{file.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {(file.size / 1024).toFixed(1)} KB • {parsedData.length} valid rows found
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={clearFile} disabled={uploadMutation.isPending} className="hover:bg-destructive/20 hover:text-destructive">
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {isParsing ? (
                  <div className="p-12 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                    <p className="text-sm text-muted-foreground">Parsing data...</p>
                  </div>
                ) : errors.length > 0 ? (
                  <div className="p-6 bg-destructive/10 border-b border-destructive/20">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                      <AlertTriangle className="w-4 h-4" /> Issues found
                    </h4>
                    <ul className="text-xs text-destructive/80 space-y-1 list-disc pl-5">
                      {errors.map((err, i) => <li key={i}>{err}</li>)}
                      {errors.length === 10 && <li>...and more.</li>}
                    </ul>
                  </div>
                ) : null}

                {parsedData.length > 0 && (
                  <div className="max-h-[400px] overflow-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border text-muted-foreground uppercase font-mono">
                        <tr>
                          <th className="px-4 py-3 font-medium">Customer</th>
                          <th className="px-4 py-3 font-medium">Container #</th>
                          <th className="px-4 py-3 font-medium">BL #</th>
                          <th className="px-4 py-3 font-medium">Vessel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {parsedData.slice(0, 100).map((row, i) => (
                          <tr key={i} className="hover:bg-accent/30">
                            <td className="px-4 py-2 font-medium">{row.customerName}</td>
                            <td className="px-4 py-2 font-mono">{row.containerNumber}</td>
                            <td className="px-4 py-2 font-mono">{row.blNumber}</td>
                            <td className="px-4 py-2">{row.vessel || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedData.length > 100 && (
                      <div className="p-3 text-center text-xs text-muted-foreground bg-accent/20 border-t border-border/50">
                        Showing first 100 rows of {parsedData.length}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="p-4 border-t border-border/50 flex justify-end gap-3 bg-secondary/10">
                <Button variant="outline" onClick={clearFile} disabled={uploadMutation.isPending}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload} 
                  disabled={parsedData.length === 0 || uploadMutation.isPending}
                  className="shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                >
                  {uploadMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Import {parsedData.length} Records</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
