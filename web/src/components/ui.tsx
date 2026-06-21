import type { AppStatus, Priority } from "../api";
import { useI18n } from "../i18n";

export const STATUSES: AppStatus[] = [
  "saved", "applied", "first_contact", "screening", "technical_interview",
  "manager_interview", "interview", "proposal", "offer", "rejected", "ghosted", "withdrawn",
];

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
