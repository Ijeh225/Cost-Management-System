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
  body: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

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
    return { success: true, sid: msg.sid };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
