import { eq } from "drizzle-orm";

/**
 * Meta WhatsApp Cloud API sends from the configured phone_number_id. Branch-owned
 * sender numbers are intentionally unsupported in v1 so sends never pretend to
 * come from a branch number Meta cannot use.
 */
export async function assertBranchWhatsAppSenderSupported(
  branchId: number | null | undefined,
): Promise<{ error?: string }> {
  if (!branchId) return {};
  const { db, branchesTable } = await import("@workspace/db");
  const [branch] = await db
    .select({
      mode: branchesTable.whatsappMode,
      name: branchesTable.name,
    })
    .from(branchesTable)
    .where(eq(branchesTable.id, branchId));

  if (!branch) return {};
  if (branch.mode === "own") {
    return {
      error: `Branch "${branch.name}" is set to use its own WhatsApp sender, but Meta Cloud API v1 uses the head-office phone number. Switch WhatsApp Sender to Head Office in Branch Settings.`,
    };
  }
  return {};
}

export function toE164Nigerian(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length >= 13) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+234" + digits.slice(1);
  if (digits.length >= 10 && !digits.startsWith("0")) return "+" + digits;
  return phone;
}

export type WhatsAppProvider = "meta";
export type WhatsAppTemplateKey = "invoice" | "reminder" | "receipt" | "berthing";

type MetaMessageResponse = {
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_data?: { details?: string };
  };
};

export type WhatsAppSendResult = {
  success: boolean;
  provider: WhatsAppProvider;
  providerMessageId?: string;
  error?: string;
};

const TEMPLATE_ENV: Record<WhatsAppTemplateKey, string> = {
  invoice: "META_WHATSAPP_TEMPLATE_INVOICE",
  reminder: "META_WHATSAPP_TEMPLATE_REMINDER",
  receipt: "META_WHATSAPP_TEMPLATE_RECEIPT",
  berthing: "META_WHATSAPP_TEMPLATE_BERTHING",
};

function normalizeMetaRecipient(to: string): string {
  return toE164Nigerian(to).replace(/^\+/, "");
}

function getMetaConfig(templateKey?: WhatsAppTemplateKey): {
  accessToken?: string;
  phoneNumberId?: string;
  templateName?: string;
  error?: string;
} {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    return {
      error: "WhatsApp not configured - add META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID.",
    };
  }
  if (!templateKey) return { accessToken, phoneNumberId };

  const templateName = process.env[TEMPLATE_ENV[templateKey]];
  if (!templateName) {
    return {
      error: `WhatsApp template not configured - add ${TEMPLATE_ENV[templateKey]} in Railway.`,
    };
  }
  return { accessToken, phoneNumberId, templateName };
}

function metaErrorMessage(response: MetaMessageResponse): string {
  const err = response.error;
  if (!err) return "Meta WhatsApp API returned an unexpected response";
  const details = err.error_data?.details;
  return [err.message, details].filter(Boolean).join(" - ") || "Meta WhatsApp API error";
}

export function isMetaWhatsAppConfigured(): boolean {
  return !!(
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID
  );
}

export async function sendWhatsAppTemplate(
  to: string,
  templateKey: WhatsAppTemplateKey,
  messageBody: string,
): Promise<WhatsAppSendResult> {
  const config = getMetaConfig(templateKey);
  if (config.error || !config.accessToken || !config.phoneNumberId || !config.templateName) {
    return { success: false, provider: "meta", error: config.error };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeMetaRecipient(to),
        type: "template",
        template: {
          name: config.templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: messageBody }],
            },
          ],
        },
      }),
    });

    const data = await response.json().catch(() => ({})) as MetaMessageResponse;
    if (!response.ok) {
      return { success: false, provider: "meta", error: metaErrorMessage(data) };
    }
    return { success: true, provider: "meta", providerMessageId: data.messages?.[0]?.id };
  } catch (err) {
    return {
      success: false,
      provider: "meta",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<WhatsAppSendResult> {
  const config = getMetaConfig();
  if (config.error || !config.accessToken || !config.phoneNumberId) {
    return { success: false, provider: "meta", error: config.error };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeMetaRecipient(to),
        type: "text",
        text: { preview_url: false, body },
      }),
    });

    const data = await response.json().catch(() => ({})) as MetaMessageResponse;
    if (!response.ok) {
      return { success: false, provider: "meta", error: metaErrorMessage(data) };
    }
    return { success: true, provider: "meta", providerMessageId: data.messages?.[0]?.id };
  } catch (err) {
    return {
      success: false,
      provider: "meta",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
