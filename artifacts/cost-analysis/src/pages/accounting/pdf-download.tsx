import { useLayoutEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountingPdfSource } from "@/lib/accountingPdf";
import { downloadCurrentAccountingPdf } from "@/lib/accountingPdfDownload";

export function PdfDownloadButton({ source, disabled = false }: { source: AccountingPdfSource; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ source: AccountingPdfSource; message: string } | null>(null);
  const latest = useRef({ source, disabled, mounted: true });
  latest.current.source = source;
  latest.current.disabled = disabled;
  useLayoutEffect(() => { latest.current.mounted = true; return () => { latest.current.mounted = false; }; }, []);
  async function download() {
    if (busy || disabled) return;
    const selected = source;
    setBusy(true); setError(null);
    try {
      await downloadCurrentAccountingPdf(selected, () => latest.current.mounted && latest.current.source === selected && !latest.current.disabled);
    } catch (cause) {
      if (latest.current.mounted && latest.current.source === selected) setError({ source: selected, message: cause instanceof Error ? cause.message : "Unable to prepare PDF. Please try again." });
    } finally {
      if (latest.current.mounted) setBusy(false);
    }
  }
  return <><Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void download()} aria-busy={busy}>
    <Download className="mr-2 h-4 w-4" />{busy ? "Preparing PDF..." : "Download PDF"}
  </Button>{error?.source === source && <span role="alert" className="self-center text-sm text-destructive">{error.message}</span>}</>;
}
