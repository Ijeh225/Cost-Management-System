export type ShippingLineInfo = {
  name: string;
  shortName: string;
  trackingUrl: (containerNumber: string) => string;
  isMaersk: boolean;
};

// Universal container tracking via track-trace.com (171 carriers supported).
// Reads the container number from the URL hash, auto-detects the shipping line,
// and pre-fills the search — works reliably for MSC, CMA CGM, Grimaldi, ONE, etc.
const trackTrace = (n: string) => `https://www.track-trace.com/container#${n}`;

const SHIPPING_LINES: Record<string, ShippingLineInfo> = {
  // ── Maersk — in-app API tracking ─────────────────────────────────────────────
  MAEU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MRKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MSKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MAEI: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },

  // ── MSC ──────────────────────────────────────────────────────────────────────
  MSCU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MSMU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MSBU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MSDU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MSPU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MSNU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  MEDU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  SEKU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  TLLU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  TEXU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  BMOU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  CAIU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  CRXU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  FSCU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  TGHU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  TCKU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },
  GESU: { name: "MSC", shortName: "MSC", trackingUrl: trackTrace, isMaersk: false },

  // ── Grimaldi Lines (including ACL — Atlantic Container Line) ─────────────────
  GRIU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: trackTrace, isMaersk: false },
  GRTU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: trackTrace, isMaersk: false },
  GCNU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: trackTrace, isMaersk: false },
  ACLU: { name: "Grimaldi Lines (ACL)", shortName: "Grimaldi", trackingUrl: trackTrace, isMaersk: false },

  // ── CMA CGM ──────────────────────────────────────────────────────────────────
  CMAU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: trackTrace, isMaersk: false },
  CGMU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: trackTrace, isMaersk: false },
  APHU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: trackTrace, isMaersk: false },
  ANNU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: trackTrace, isMaersk: false },

  // ── Hapag-Lloyd ──────────────────────────────────────────────────────────────
  HLCU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: trackTrace, isMaersk: false },
  HLXU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: trackTrace, isMaersk: false },

  // ── COSCO ────────────────────────────────────────────────────────────────────
  COSU: { name: "COSCO", shortName: "COSCO", trackingUrl: trackTrace, isMaersk: false },
  CSNU: { name: "COSCO", shortName: "COSCO", trackingUrl: trackTrace, isMaersk: false },

  // ── Evergreen ────────────────────────────────────────────────────────────────
  EISU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: trackTrace, isMaersk: false },
  EEIU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: trackTrace, isMaersk: false },
  EGHU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: trackTrace, isMaersk: false },

  // ── Yang Ming ────────────────────────────────────────────────────────────────
  YMLU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: trackTrace, isMaersk: false },
  YMJU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: trackTrace, isMaersk: false },

  // ── ZIM ──────────────────────────────────────────────────────────────────────
  ZIMU: { name: "ZIM", shortName: "ZIM", trackingUrl: trackTrace, isMaersk: false },
  ZCSU: { name: "ZIM", shortName: "ZIM", trackingUrl: trackTrace, isMaersk: false },

  // ── PIL (Pacific International Lines) ────────────────────────────────────────
  PILU: { name: "PIL", shortName: "PIL", trackingUrl: trackTrace, isMaersk: false },
  PCIU: { name: "PIL", shortName: "PIL", trackingUrl: trackTrace, isMaersk: false },

  // ── ONE (Ocean Network Express) — formerly NYK + MOL + K Line ────────────────
  ONEY: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },
  ONEU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },
  TCNU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },
  NYKU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },
  MOLU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },
  KKLU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: trackTrace, isMaersk: false },

  // ── APL (now part of CMA CGM) ─────────────────────────────────────────────────
  APLU: { name: "APL", shortName: "APL", trackingUrl: trackTrace, isMaersk: false },
  AMFU: { name: "APL", shortName: "APL", trackingUrl: trackTrace, isMaersk: false },

  // ── OOCL (Orient Overseas Container Line) ────────────────────────────────────
  OOLU: { name: "OOCL", shortName: "OOCL", trackingUrl: trackTrace, isMaersk: false },

  // ── Mitsui O.S.K. Lines (MOL) — legacy; now merged into ONE ──────────────────
  MLCU: { name: "Mitsui O.S.K. (MOL)", shortName: "MOL", trackingUrl: trackTrace, isMaersk: false },

  // ── ENL Consortium — Nigerian port terminal operator (Apapa terminals C & D) ──
  ENLU: { name: "ENL Consortium", shortName: "ENL", trackingUrl: trackTrace, isMaersk: false },
};

export type TrackingResult = {
  containerNumber: string;
  eta: string | null;
  vessel: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  events: Array<{
    type: string;
    description: string;
    location: string;
    country: string;
    dateTime: string | null;
  }>;
  isMaersk: boolean;
};

export function normalizeContainerNumber(containerNumber: string): string {
  return containerNumber.replace(/\s+/g, "").toUpperCase();
}

export function getShippingLine(containerNumber: string): ShippingLineInfo | null {
  if (!containerNumber || containerNumber.length < 4) return null;
  const normalized = normalizeContainerNumber(containerNumber);
  const prefix4 = normalized.substring(0, 4);
  const prefix3 = normalized.substring(0, 3);
  return SHIPPING_LINES[prefix4] ?? SHIPPING_LINES[prefix3] ?? null;
}

export function getTrackingUrl(containerNumber: string): string | null {
  const normalized = normalizeContainerNumber(containerNumber);
  const line = getShippingLine(normalized);
  if (!line) return null;
  return line.trackingUrl(normalized);
}

export function isMaerskContainer(containerNumber: string): boolean {
  const line = getShippingLine(containerNumber);
  return line?.isMaersk ?? false;
}

export function formatTrackingDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatTrackingDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
