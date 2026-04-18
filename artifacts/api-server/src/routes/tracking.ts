import { Router } from "express";
import { requireAuth } from "../lib/auth.js";

const router = Router();

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getMaerskToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const consumerKey = process.env["MAERSK_CONSUMER_KEY"];
  const consumerSecret = process.env["MAERSK_CONSUMER_SECRET"];

  if (!consumerKey || !consumerSecret) {
    throw new Error("Maersk API credentials not configured");
  }

  const res = await fetch("https://api.maersk.com/oauth2/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: consumerKey,
      client_secret: consumerSecret,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Maersk auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const expiresIn = (data.expires_in ?? 3600) as number;

  cachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cachedToken.token;
}

function extractTrackingData(data: any, containerNumber: string) {
  const shipments: any[] = data?.shipments ?? [];
  if (shipments.length === 0) return null;

  const shipment = shipments[0];

  const transportPlan: any[] = shipment.transportPlan ?? [];
  const lastLeg = transportPlan.length > 0 ? transportPlan[transportPlan.length - 1] : null;
  const firstLeg = transportPlan.length > 0 ? transportPlan[0] : null;

  const eta =
    lastLeg?.plannedArrivalDate ??
    lastLeg?.arrivalDate ??
    lastLeg?.arrival?.plannedDate ??
    lastLeg?.arrivalDateTime ??
    null;

  const vesselName =
    lastLeg?.transport?.vessel?.vesselName ??
    firstLeg?.transport?.vessel?.vesselName ??
    shipment?.vessel?.vesselName ??
    null;

  const portOfDischarge =
    lastLeg?.arrivalPort?.cityName ??
    lastLeg?.arrivalPort?.portName ??
    lastLeg?.arrivalPort?.UNLocationCode ??
    null;

  const portOfLoading =
    firstLeg?.departurePort?.cityName ??
    firstLeg?.departurePort?.portName ??
    firstLeg?.departurePort?.UNLocationCode ??
    null;

  const containers: any[] = shipment.containers ?? [];
  const containerData =
    containers.find(
      (c: any) =>
        (c.containerNumber ?? "").toUpperCase() === containerNumber.toUpperCase()
    ) ?? containers[0] ?? null;

  const rawEvents: any[] = containerData?.events ?? shipment?.events ?? [];
  const events = rawEvents
    .slice(-10)
    .reverse()
    .slice(0, 5)
    .map((e: any) => ({
      type: e.eventType ?? "",
      description:
        e.eventDescription ??
        e.description ??
        e.eventName ??
        e.activityName ??
        "",
      location:
        e.location?.cityName ??
        e.location?.portName ??
        e.location?.facilityName ??
        e.location?.UNLocationCode ??
        "",
      country: e.location?.countryCode ?? e.location?.country ?? "",
      dateTime: e.eventDateTime ?? e.actualDateTime ?? e.plannedDateTime ?? null,
    }));

  return {
    containerNumber,
    eta,
    vessel: vesselName,
    portOfLoading,
    portOfDischarge,
    events,
  };
}

router.get("/tracking/:containerNumber", requireAuth, async (req, res) => {
  const { containerNumber } = req.params;

  if (!containerNumber || containerNumber.length < 4) {
    return res.status(400).json({ error: "Invalid container number" });
  }

  const prefix = containerNumber.substring(0, 4).toUpperCase();
  const maerskPrefixes = ["MAEU", "MRKU", "MSKU", "MAEI"];

  if (!maerskPrefixes.includes(prefix)) {
    return res.status(400).json({
      error: "Not a Maersk container",
      prefix,
      isMaersk: false,
    });
  }

  try {
    const token = await getMaerskToken();
    const consumerKey = process.env["MAERSK_CONSUMER_KEY"]!;

    const trackRes = await fetch(
      `https://api.maersk.com/track/v1/shipments?trackingNumber=${encodeURIComponent(containerNumber)}&trackingType=CONTAINER`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Consumer-Key": consumerKey,
        },
      }
    );

    if (!trackRes.ok) {
      const body = await trackRes.text().catch(() => "");
      if (trackRes.status === 404) {
        return res.status(404).json({ error: "Container not found in Maersk system" });
      }
      return res.status(trackRes.status).json({
        error: `Maersk API error (${trackRes.status})`,
        detail: body,
      });
    }

    const data = await trackRes.json();
    const result = extractTrackingData(data, containerNumber);

    if (!result) {
      return res.status(404).json({ error: "No shipment data returned for this container" });
    }

    return res.json({ ...result, isMaersk: true });
  } catch (err: any) {
    console.error("Maersk tracking error:", err?.message ?? err);
    return res.status(500).json({ error: err?.message ?? "Tracking request failed" });
  }
});

export { router as trackingRouter };
