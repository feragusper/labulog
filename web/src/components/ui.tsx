import type { AppStatus } from "../api";

export const STATUSES: AppStatus[] = [
  "saved", "applied", "screening", "interview", "offer", "rejected", "ghosted", "withdrawn",
];

export function Badge({ status }: { status: AppStatus }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
