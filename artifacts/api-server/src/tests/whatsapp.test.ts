import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppTemplate, toE164Nigerian } from "../lib/whatsapp.js";

describe("WhatsApp Meta helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("normalizes Nigerian phone numbers to E.164", () => {
    expect(toE164Nigerian("08012345678")).toBe("+2348012345678");
    expect(toE164Nigerian("+2348012345678")).toBe("+2348012345678");
    expect(toE164Nigerian("2348012345678")).toBe("+2348012345678");
  });

  it("returns a clear error when Meta credentials are missing", async () => {
    const result = await sendWhatsAppTemplate("+2348012345678", "invoice", "Invoice INV-001");

    expect(result).toEqual({
      success: false,
      provider: "meta",
      error: "WhatsApp not configured - add META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID.",
    });
  });

  it("formats a Meta template request with one body parameter", async () => {
    vi.stubEnv("META_WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("META_WHATSAPP_PHONE_NUMBER_ID", "123456789");
    vi.stubEnv("META_WHATSAPP_TEMPLATE_INVOICE", "invoice_notification");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.test" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppTemplate("+2348012345678", "invoice", "Invoice INV-001");

    expect(result).toEqual({
      success: true,
      provider: "meta",
      providerMessageId: "wamid.test",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/123456789/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: "2348012345678",
          type: "template",
          template: {
            name: "invoice_notification",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: "Invoice INV-001" }],
              },
            ],
          },
        }),
      }),
    );
  });
});
