// India phone normalization for cross-function comparison.
// (Adapted from ClinicPro normalize-phone.ts — same pattern, +91 instead of +1.)
//
// Inbound sources disagree on format:
//   - Exotel callbacks: "+919876543210" / "919876543210"
//   - User input via WhatsApp/ASHA app: "9876543210" / "98765 43210" / "+91 98765 43210"
//   - VAPI tool params: "+919876543210"
//
// Strategy: strip every non-digit, then drop a leading "91" when the result is
// 12 digits (India country-code form). Returns "" on empty/falsy input so callers
// can safely use truthiness checks before insert/compare.

export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  // India mobile numbers are 10 digits. With country code → 12.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(3);
  return digits;
}

/** Returns canonical E.164 representation for India (+91 prefix). */
export function toE164India(input: string | null | undefined): string {
  const ten = normalizePhone(input);
  if (ten.length !== 10) return '';
  return `+91${ten}`;
}

/** Last-10-digit key used for harassment-guard counting + dedup. */
export function normalizePhoneKey(input: string | null | undefined): string {
  return normalizePhone(input);
}
