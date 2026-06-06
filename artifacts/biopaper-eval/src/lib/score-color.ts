// Score color scale: teal (high) → purple (moderate) → red (very low only).
// Red is intentionally reserved for genuinely low scores.

export type ScoreTier = "high" | "mid" | "low";

const HIGH_THRESHOLD = 67;
const LOW_THRESHOLD = 30;

export function scoreTier(s: number | null | undefined): ScoreTier {
  if (s == null) return "mid";
  if (s >= HIGH_THRESHOLD) return "high";
  if (s >= LOW_THRESHOLD) return "mid";
  return "low";
}

// Text color (with dark-mode variant) for a score value.
export function scoreText(s: number | null | undefined): string {
  if (s == null) return "text-muted-foreground";
  switch (scoreTier(s)) {
    case "high": return "text-teal-600 dark:text-teal-400";
    case "mid": return "text-purple-600 dark:text-purple-400";
    case "low": return "text-red-500";
  }
}

// Solid background class (e.g. for progress bars / dots).
export function scoreBgClass(s: number | null | undefined): string {
  switch (scoreTier(s)) {
    case "high": return "bg-teal-500";
    case "mid": return "bg-purple-500";
    case "low": return "bg-red-500";
  }
}

// Combined text + border classes (used by ringed score badges).
export function scoreTextBorder(s: number | null | undefined): string {
  switch (scoreTier(s)) {
    case "high": return "text-teal-600 border-teal-500 dark:text-teal-400";
    case "mid": return "text-purple-600 border-purple-500 dark:text-purple-400";
    case "low": return "text-red-500 border-red-500";
  }
}

// Raw hex (for recharts fills, which can't take Tailwind classes).
export function scoreHex(s: number | null | undefined): string {
  switch (scoreTier(s)) {
    case "high": return "#14b8a6"; // teal-500
    case "mid": return "#a855f7";  // purple-500
    case "low": return "#ef4444";  // red-500
  }
}
