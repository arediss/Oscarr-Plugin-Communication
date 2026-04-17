import type { Severity } from './api';

export const SEVERITY_META: Record<Severity, { label: string; chip: string; accent: string; leftBorder: string; iconColor: string; colorHex: string; chipBgHex: string; chipFgHex: string; glowRgba: string; heroWash: string; heroGlow: string }> = {
  info: {
    label: 'Notice',
    chip: 'bg-sky-500/15 text-sky-300',
    accent: 'text-sky-300',
    leftBorder: 'border-l-sky-400',
    iconColor: 'text-sky-300',
    colorHex: '#38bdf8',   // sky-400
    chipBgHex: 'rgba(14,165,233,0.15)',
    chipFgHex: '#7dd3fc',  // sky-300
    glowRgba: 'rgba(56,189,248,0.28)',
    heroWash: 'rgba(7,89,133,0.85)',     // sky-800 — deep enough for white text contrast
    heroGlow: 'rgba(3,105,161,0.7)',     // sky-700
  },
  warning: {
    label: 'Warning',
    chip: 'bg-amber-500/15 text-amber-300',
    accent: 'text-amber-300',
    leftBorder: 'border-l-amber-400',
    iconColor: 'text-amber-300',
    colorHex: '#fbbf24',   // amber-400
    chipBgHex: 'rgba(245,158,11,0.15)',
    chipFgHex: '#fcd34d',  // amber-300
    glowRgba: 'rgba(251,191,36,0.3)',
    heroWash: 'rgba(146,64,14,0.85)',    // amber-800
    heroGlow: 'rgba(180,83,9,0.7)',      // amber-700
  },
  critical: {
    label: 'Alert',
    chip: 'bg-rose-500/15 text-rose-300',
    accent: 'text-rose-300',
    leftBorder: 'border-l-rose-400',
    iconColor: 'text-rose-300',
    colorHex: '#fb7185',   // rose-400
    chipBgHex: 'rgba(244,63,94,0.15)',
    chipFgHex: '#fda4af',  // rose-300
    glowRgba: 'rgba(251,113,133,0.32)',
    heroWash: 'rgba(159,18,57,0.85)',    // rose-800
    heroGlow: 'rgba(190,18,60,0.7)',     // rose-700
  },
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Convert an ISO string to the `datetime-local` input format (`YYYY-MM-DDTHH:mm`). Empty string if invalid. */
export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a `datetime-local` value back to an ISO string. Returns null for empty input. */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function announcementStatus(publishedAt: string, expiresAt: string | null, now = Date.now()): 'scheduled' | 'live' | 'expired' {
  const pub = Date.parse(publishedAt);
  if (!Number.isFinite(pub) || pub > now) return 'scheduled';
  if (expiresAt) {
    const exp = Date.parse(expiresAt);
    if (Number.isFinite(exp) && exp <= now) return 'expired';
  }
  return 'live';
}
