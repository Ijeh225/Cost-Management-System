import { db, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Resolves the WhatsApp "from" number for a given branch.
 * - If branch.whatsappMode === "own": returns branch.whatsappNumber (or an
 *   error if it's empty — explicit failure, no silent fallback per Task #149).
 * - Otherwise: returns null (caller falls back to env TWILIO_WHATSAPP_FROM).
 */
export async function resolveBranchWhatsAppFrom(
  branchId: number | null | undefined,
): Promise<{ from: string | null; error?: string }> {
  if (!branchId) return { from: null };
  const [b] = await db
    .select({
      mode: branchesTable.whatsappMode,
      number: branchesTable.whatsappNumber,
      name: branchesTable.name,
    })
    .from(branchesTable)
    .where(eq(branchesTable.id, branchId));
  if (!b) return { from: null };
  if (b.mode === "own") {
    if (!b.number || !b.number.trim()) {
      return {
        from: null,
        error: `Branch "${b.name}" is set to use its own WhatsApp number, but no number is configured. Add one in Branch Settings → Communications.`,
      };
    }
    return { from: b.number.trim() };
  }
  return { from: null };
}

export function toE164Nigerian(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length >= 13) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+234" + digits.slice(1);
  if (digits.length >= 10 && !digits.startsWith("0")) return "+" + digits;
  return phone;
}

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  );
}

export async function sendViaTwilio(
  to: string,
  body: string,
  fromOverride?: string | null,
): Promise<{ success: boolean; sid?: string; error?: string; fromUsed?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = fromOverride ?? process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    return { success: false, error: "WhatsApp (Twilio) credentials not configured" };
  }

  try {
    const { default: Twilio } = await import("twilio");
    const client = Twilio(accountSid, authToken);
    const msg = await client.messages.create({
      from: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body,
    });
    return { success: true, sid: msg.sid, fromUsed: from };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
