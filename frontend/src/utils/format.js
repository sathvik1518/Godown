// Formatting helpers. The shop is in India, so money uses the lakh/crore grouping (1,94,210)
// and all times are shown in Indian Standard Time.
const TZ = "Asia/Kolkata";

export const inr = (value, decimals = 2) => {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
};

export const num = (value) =>
  value === null || value === undefined ? "—" : new Intl.NumberFormat("en-IN").format(Number(value));

export const signed = (value) => (value > 0 ? `+${num(value)}` : value < 0 ? `−${num(Math.abs(value))}` : "0");

export const dateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
    .toLowerCase();
  return `${day}, ${time}`;
};

// "2026-11-14" -> a Date at local noon (avoids timezone day-shifts)
const parseDay = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export const shortDate = (value) =>
  value ? parseDay(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const longDate = (value) =>
  parseDay(value).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const weekday = (value) => parseDay(value).toLocaleDateString("en-IN", { weekday: "short" });
export const dayOfMonth = (value) => parseDay(value).getDate();
export const dayMonth = (value) => parseDay(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export const ago = (iso) => {
  if (!iso) return "never";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return dateTime(iso);
};

export const greeting = (now = new Date()) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

export const UNITS = ["pcs", "kg", "g", "l", "ml", "box", "pack", "dozen", "m", "set"];

export const ISSUE_REASONS = [
  ["sale", "Sale"],
  ["damaged", "Damaged"],
  ["expired", "Expired"],
  ["internal_use", "Used in the shop"],
  ["return_to_supplier", "Returned to supplier"],
  ["other", "Other"],
];

export const ADJUST_REASONS = [
  ["stock_count", "Stock count"],
  ["correction", "Correction"],
  ["write_off", "Write-off"],
];

const REASON_LABELS = {
  purchase: "Purchase",
  purchase_order: "Purchase order",
  opening_stock: "Opening stock",
  ...Object.fromEntries(ISSUE_REASONS),
  ...Object.fromEntries(ADJUST_REASONS),
};
export const reasonLabel = (reason) => (reason ? REASON_LABELS[reason] || reason : "");

export const marginPercent = (cost, sell) => {
  const c = Number(cost);
  const s = Number(sell);
  if (!s || !Number.isFinite(c) || !Number.isFinite(s)) return null;
  return ((s - c) / s) * 100;
};
