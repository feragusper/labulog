import type { Application, AppStatus, Priority } from "../api";
import { useI18n } from "../i18n";

export const STATUSES: AppStatus[] = [
  "saved", "applied", "first_contact", "screening", "technical_interview",
  "manager_interview", "interview", "proposal", "offer", "accepted",
  "rejected", "cancelled", "ghosted", "withdrawn",
];

// Non-terminal pipeline, in order. Terminal outcomes (accepted/rejected/etc.) sit outside it.
export const PIPELINE: AppStatus[] = [
  "saved", "applied", "first_contact", "screening",
  "technical_interview", "manager_interview", "proposal", "offer",
];
export const TERMINAL: AppStatus[] = ["accepted", "rejected", "cancelled", "ghosted", "withdrawn"];
export const NEGATIVE_TERMINAL: AppStatus[] = ["rejected", "cancelled", "ghosted", "withdrawn"];

// Legacy/generic "interview" ranks alongside the technical-interview step.
export function rankOf(s: AppStatus): number {
  if (s === "interview") return PIPELINE.indexOf("technical_interview");
  return PIPELINE.indexOf(s);
}

// Furthest pipeline stage an application ever reached, regardless of how it ended up
// (e.g. an app rejected after a technical interview still "reached" technical_interview).
export function furthestStage(a: Application): AppStatus {
  const reached = [a.status, ...a.events.map((e) => e.status)];
  const idx = Math.max(0, ...reached.map(rankOf));
  return PIPELINE[idx];
}

// Maps a status to a colour-group class (left bar on rows, etc.).
export function statusColorClass(s: AppStatus): string {
  if (s === "saved") return "c-muted";
  if (s === "applied" || s === "first_contact") return "c-accent";
  if (["screening", "technical_interview", "manager_interview", "interview"].includes(s)) return "c-yellow";
  if (["proposal", "offer", "accepted"].includes(s)) return "c-green";
  return "c-red"; // rejected, cancelled, ghosted, withdrawn
}

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

// Every status that represents an interview round (legacy + granular).
export const INTERVIEW_STATUSES: AppStatus[] = [
  "interview", "technical_interview", "manager_interview",
];

export function statusLabel(t: (k: string) => string, status: AppStatus): string {
  return t(`st.${status}`);
}

export function Badge({ status }: { status: AppStatus }) {
  const { t } = useI18n();
  return <span className={`badge ${status}`}>{statusLabel(t, status)}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return <span className={`pri pri-${priority}`}>{t(`pri.${priority}`)}</span>;
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

// No real interview durations are tracked; estimate total time from round count.
export const HOURS_PER_INTERVIEW = 1;
