export type ShippingLineInfo = {
  name: string;
  shortName: string;
  trackingUrl: (containerNumber: string) => string;
  isMaersk: boolean;
};

const SHIPPING_LINES: Record<string, ShippingLineInfo> = {
  MAEU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MRKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MSKU: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },
  MAEI: { name: "Maersk", shortName: "Maersk", trackingUrl: (n) => `https://www.maersk.com/tracking/${n}`, isMaersk: true },

  MSCU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/search-a-shipment?agencyPath=nga&searchInfo=${n}`, isMaersk: false },
  MSMU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/search-a-shipment?agencyPath=nga&searchInfo=${n}`, isMaersk: false },
  MEDU: { name: "MSC", shortName: "MSC", trackingUrl: (n) => `https://www.msc.com/en/search-a-shipment?agencyPath=nga&searchInfo=${n}`, isMaersk: false },

  GRIU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },
  GRTU: { name: "Grimaldi Lines", shortName: "Grimaldi", trackingUrl: (n) => `https://www.grimaldi-lines.com/en/tools-for-you/cargo-tracking/?tracking=${n}`, isMaersk: false },

  CMAU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },
  CGMU: { name: "CMA CGM", shortName: "CMA CGM", trackingUrl: (n) => `https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference=${n}`, isMaersk: false },

  HLCU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: (n) => `https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container=${n}`, isMaersk: false },
  HLXU: { name: "Hapag-Lloyd", shortName: "Hapag-Lloyd", trackingUrl: (n) => `https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-container.html?container=${n}`, isMaersk: false },

  COSU: { name: "COSCO", shortName: "COSCO", trackingUrl: (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`, isMaersk: false },
  CSNU: { name: "COSCO", shortName: "COSCO", trackingUrl: (n) => `https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number=${n}`, isMaersk: false },

  EISU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },
  EEIU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },
  EGHU: { name: "Evergreen", shortName: "Evergreen", trackingUrl: (n) => `https://www.evergreen-line.com/static/jsp/tracking.jsp?cn=${n}`, isMaersk: false },

  YMLU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: (n) => `https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?number=${n}`, isMaersk: false },
  YMJU: { name: "Yang Ming", shortName: "Yang Ming", trackingUrl: (n) => `https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx?number=${n}`, isMaersk: false },

  ZIMU: { name: "ZIM", shortName: "ZIM", trackingUrl: (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, isMaersk: false },
  ZCSU: { name: "ZIM", shortName: "ZIM", trackingUrl: (n) => `https://www.zim.com/tools/track-a-shipment?consnumber=${n}`, isMaersk: false },

  PILU: { name: "PIL", shortName: "PIL", trackingUrl: (n) => `https://www.pilship.com/en-tracking-cargo/112.html?tracking_type=container&tracking=${n}`, isMaersk: false },

  ONEY: { name: "ONE Line", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/ecom/CUP_HOM_3301.do?rtnUrl=&trackingInputBox=${n}`, isMaersk: false },
  ONEU: { name: "ONE Line", shortName: "ONE", trackingUrl: (n) => `https://ecomm.one-line.com/ecom/CUP_HOM_3301.do?rtnUrl=&trackingInputBox=${n}`, isMaersk: false },

  APLU: { name: "APL", shortName: "APL", trackingUrl: (n) => `https://www.apl.com/ebusiness/tracking?number=${n}`, isMaersk: false },
  AMFU: { name: "APL", shortName: "APL", trackingUrl: (n) => `https://www.apl.com/ebusiness/tracking?number=${n}`, isMaersk: false },

  OOLU: { name: "OOCL", shortName: "OOCL", trackingUrl: (n) => `https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx?cn=${n}`, isMaersk: false },

  NYKU: { name: "NYK Line", shortName: "NYK", trackingUrl: (n) => `https://www.nyk.com/english/eTool/track/?containerNo=${n}`, isMaersk: false },
  MLCU: { name: "Mitsui O.S.K.", shortName: "MOL", trackingUrl: (n) => `https://www.mot-logistics.com/tracking?container=${n}`, isMaersk: false },
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
