import type { AccountingPdfSource } from "./accountingPdf";

type PdfFactory = (source: AccountingPdfSource) => {
  filename: string;
  document: { save: (filename: string, options: { returnPromise: true }) => unknown };
};

export async function downloadCurrentAccountingPdf(
  source: AccountingPdfSource,
  isCurrent: () => boolean,
  load: () => Promise<{ createAccountingPdf: PdfFactory }> = () => import("./accountingPdf"),
) {
  if (!isCurrent()) return false;
  const { createAccountingPdf } = await load();
  // Dynamic loading must never finish by saving a different or revoked UI scope.
  if (!isCurrent()) return false;
  const pdf = createAccountingPdf(source);
  if (!isCurrent()) return false;
  await pdf.document.save(pdf.filename, { returnPromise: true });
  return true;
}
