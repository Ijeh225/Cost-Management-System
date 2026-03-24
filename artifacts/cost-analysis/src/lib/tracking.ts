export type ShippingLineInfo = {
  name: string;
  shortName: string;
  trackingUrl: (containerNumber: string) => string;
  isMaersk: boolean;
};

const SHIPPING_LINES: Record<string, ShippingLineInfo> = {
  // ── Maersk ──────────────────────────────────────────────────────────────────
  MAEU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MRKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MSKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MAEI: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },

  // ── MSC ─────────────────────────────────────────────────────────────────────
  MSCU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MSMU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MSBU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MSDU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MSPU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MSNU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  MEDU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  SEKU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  TLLU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  TEXU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  BMOU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  CAIU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  CRXU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  FSCU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  TGHU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  TCKU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },
  GESU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/track-a-shipment?trackingNumber=${n}`, isMaersk: false },

  // ── Grimaldi Lines (including ACL — Atlantic Container Line, a Grimaldi subsidiary) ──
  GRIU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },
  GRTU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },
  GCNU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },
  ACLU: { name: "Grimaldi Lines (ACL)", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },

  // ── CMA CGM ─────────────────────────────────────────────────────────────────
  CMAU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },
  CGMU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },
  APHU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },
  ANNU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },

  // ── Hapag-Lloyd ─────────────────────────────────────────────────────────────
  HLCU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: (n) => `https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container=${n}`, isMaersk: false },
  HLXU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: (n) => `https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container=${n}`, isMaersk: false },

  // ── COSCO ────────────────────────────────────────────────────────────────────
  COSU: { name: "COSCO", shortName: "COSCO", trackingUrl: (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`, isMaersk: false },
  CSNU: { name: "COSCO", shortName: "COSCO", trackingUrl: (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`, isMaersk: false },

  // ── Evergreen ────────────────────────────────────────────────────────────────
  EISU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },
  EEIU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },
  EGHU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },

  // ── Yang Ming ────────────────────────────────────────────────────────────────
  YMLU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: (n) => `https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?number=${n}`, isMaersk: false },
  YMJU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: (n) => `https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?number=${n}`, isMaersk: false },

  // ── ZIM ──────────────────────────────────────────────────────────────────────
  ZIMU: { name: "ZIM", shortName: "ZIM", trackingUrl: (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, isMaersk: false },
  ZCSU: { name: "ZIM", shortName: "ZIM", trackingUrl: (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, isMaersk: false },

  // ── PIL (Pacific International Lines) ───────────────────────────────────────
  PILU: { name: "PIL", shortName: "PIL", trackingUrl: (n) => `https://www.pilship.com/en-tracking-cargo/112.html?tracking_type=container&tracking=${n}`, isMaersk: false },
  PCIU: { name: "PIL", shortName: "PIL", trackingUrl: (n) => `https://www.pilship.com/en-tracking-cargo/112.html?tracking_type=container&tracking=${n}`, isMaersk: false },

  // ── ONE (Ocean Network Express) — formerly NYK + MOL + K Line ────────────────
  // ONE was formed in 2018 from the container businesses of NYK, MOL, and K Line.
  // All three legacy prefixes now track via the ONE portal.
  ONEY: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },
  ONEU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },
  TCNU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },
  NYKU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },
  MOLU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },
  KKLU: { name: "ONE (Ocean Network Express)", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },

  // ── APL (now part of CMA CGM) ────────────────────────────────────────────────
  APLU: { name: "APL", shortName: "APL", trackingUrl: (n) => `https://www.apl.com/ebusiness/tracking?number=${n}`, isMaersk: false },
  AMFU: { name: "APL", shortName: "APL", trackingUrl: (n) => `https://www.apl.com/ebusiness/tracking?number=${n}`, isMaersk: false },

  // ── OOCL (Orient Overseas Container Line) ────────────────────────────────────
  OOLU: { name: "OOCL", shortName: "OOCL", trackingUrl: (n) => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?cn=${n}`, isMaersk: false },

  // ── Mitsui O.S.K. Lines (MOL) — legacy; now merged into ONE ─────────────────
  MLCU: { name: "Mitsui O.S.K. (MOL)", shortName: "MOL", trackingUrl: (n) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?containerNo=${n}`, isMaersk: false },

  // ── ENL Consortium — Nigerian port terminal operator (Apapa terminals C & D) ─
  // ENL Consortium Limited is one of Nigeria's largest indigenous seaport operators.
  // BIC code ENLU is their registered container prefix.
  ENLU: { name: "ENL Consortium", shortName: "ENL", trackingUrl: (n) => `https://port.enlconsortium.com/`, isMaersk: false },
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

export function getShippingLine(containerNumber: string): ShippingLineInfo | null {
  if (!containerNumber || containerNumber.length < 4) return null;
  const prefix4 = containerNumber.substring(0, 4).toUpperCase();
  const prefix3 = containerNumber.substring(0, 3).toUpperCase();
  return SHIPPING_LINES[prefix4] ?? SHIPPING_LINES[prefix3] ?? null;
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
