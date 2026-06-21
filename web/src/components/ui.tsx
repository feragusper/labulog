import type { AppStatus, Priority } from "../api";

export const STATUSES: AppStatus[] = [
  "saved", "applied", "screening", "interview", "offer", "rejected", "ghosted", "withdrawn",
];

export const PRIORITIES: Priority[] = ["high", "medium", "low"];
const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };

export function Badge({ status }: { status: AppStatus }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`pri pri-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

// No real interview durations are tracked; estimate total time from round count.
export const HOURS_PER_INTERVIEW = 1;
