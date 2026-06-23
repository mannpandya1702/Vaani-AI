// Date-salted idempotency key — Aman §12 lift from ClinicPro messaging/.
// Same patient should not receive 5 WhatsApp messages if Sarvam-M tool-calls
// repeatedly on the same day.

export async function dailyIdempotencyKey(
  tenantId: string,
  phoneE164: string,
  action: string,
  date: Date = new Date(),
): Promise<string> {
  const utcDate = date.toISOString().slice(0, 10);
  const seed = `${tenantId}:${phoneE164}:${action}:${utcDate}`;
  const buf = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
