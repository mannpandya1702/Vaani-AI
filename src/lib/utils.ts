import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a phone E.164 number for display: +91 98765 43210 → +91 98765 43210 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return e164;
}

/** Mask all but last 4 digits of phone for cockpit display. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 4) return e164;
  return `••• ${digits.slice(-4)}`;
}

/** Indian English typography helpers. */
export const triageBandLabel = {
  RED: 'Urgent',
  AMBER: 'Soon',
  GREEN: 'Routine',
} as const;

export const triageBandColor = {
  RED: 'bg-vaani-red text-white',
  AMBER: 'bg-vaani-saffron text-white',
  GREEN: 'bg-vaani-green text-white',
} as const;
