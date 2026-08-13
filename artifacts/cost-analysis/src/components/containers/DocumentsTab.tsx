import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetContainerDocuments, useDeleteContainerDocument, customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload, Trash2, FileText, Download, File, Image, FileSpreadsheet } from "lucide-react";

const DEFAULT_SECTION_OPTIONS: DocumentSection[] = [
  { id: "general", label: "General" },
  { id: "shipping", label: "Shipping" },
  { id: "customs", label: "Customs" },
  { id: "terminal", label: "Terminal" },
  { id: "delivery", label: "Delivery" },
  { id: "operations", label: "Operations" },
];

type DocumentSection = { id: string; label: string };

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="w-5 h-5 text-blue-400" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
  if (mimeType.includes("pdf")) return <FileText className="w-5 h-5 text-red-400" />;
  return <File className="w-5 h-5 text-muted-foreground" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsTab({ containerId }: { containerId: number }) {
  const { toast } = useToast();
  const { user, isAdminOrAbove } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [section, setSection] = useState("general");
  const [previewDocument, setPreviewDocument] = useState<any | null>(null);

  const { data: documents = [], isLoading } = useGetContainerDocuments(containerId);
  const { data: sections = DEFAULT_SECTION_OPTIONS } = useQuery<DocumentSection[]>({
    queryKey: ["document-sections"],
    queryFn: () => customFetch("/api/document-sections"),
  });
  const sectionLabels = new Map(sections.map((item) => [item.id, item.label]));
  const deleteMutation = useDeleteContainerDocument();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["getContainerDocuments", containerId] });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ variant: "destructive", title: "File too large", description: "Maximum file size is 20MB" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("section", section);
      const resp = await fetch(`/api/containers/${containerId}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) throw new Error("Upload failed");
      invalidate();
      toast({ title: "Document uploaded", description: file.name });
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Please try again" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (docId: number) => {
    try {
      await deleteMutation.mutateAsync({ id: containerId, docId });
      invalidate();
      toast({ title: "Document deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete document" });
    }
  };

  const handleDownload = (doc: any) => {
    window.open(`/api/documents/${doc.id}`, "_blank");
  };

  const canDelete = (doc: any) => isAdminOrAbove || doc.uploadedById === user?.id;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors">
        <Upload className="w-8 h-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">Upload Document</p>
          <p className="text-xs text-muted-foreground mt-0.5">PDF, images, Excel, Word — up to 20MB</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <div className="space-y-1">
            <Label className="text-xs">Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 mt-5"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading…" : "Choose File"}
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp" />
        </div>
      </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (documents as any[]).length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(documents as any[]).map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/40 hover:bg-accent/20 transition-colors group">
              <FileIcon mimeType={doc.mimeType} />
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setPreviewDocument(doc)}>
                <p className="text-sm font-medium truncate hover:text-primary transition-colors">{doc.originalName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">{sectionLabels.get(doc.section ?? "general") ?? doc.section ?? "General"}</Badge>
                  <span>{formatBytes(doc.size)}</span>
                  <span>·</span>
                  <span>{doc.uploaderName}</span>
                  <span>·</span>
                  <span>{new Date(doc.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              </button>
              <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleDownload(doc)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded">
                  <Download className="w-3.5 h-3.5" />
                </button>
                {canDelete(doc) && <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!previewDocument} onOpenChange={(open) => !open && setPreviewDocument(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-hidden p-0">
          {previewDocument && <>
            <DialogHeader className="p-5 pb-3 border-b">
              <DialogTitle className="pr-8 truncate">{previewDocument.originalName}</DialogTitle>
              <DialogDescription>Uploaded by {previewDocument.uploaderName} on {new Date(previewDocument.createdAt).toLocaleDateString("en-NG")}</DialogDescription>
            </DialogHeader>
            <div className="min-h-[360px] max-h-[70vh] bg-muted/30 flex items-center justify-center overflow-auto">
              {previewDocument.mimeType?.startsWith("image/") ? (
                <img src={`/api/documents/${previewDocument.id}`} alt={previewDocument.originalName} className="max-h-[68vh] max-w-full object-contain" />
              ) : previewDocument.mimeType === "application/pdf" ? (
                <iframe title={previewDocument.originalName} src={`/api/documents/${previewDocument.id}`} className="h-[68vh] w-full bg-white" />
              ) : (
                <div className="p-8 text-center space-y-3">
                  <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">This file type opens in your browser or downloads to your device.</p>
                  <Button variant="outline" onClick={() => handleDownload(previewDocument)} className="gap-2"><Download className="h-4 w-4" /> Open document</Button>
                </div>
              )}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
