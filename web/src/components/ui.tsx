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

const COLOR_VAR: Record<string, string> = {
  "c-muted": "var(--muted)", "c-accent": "var(--accent)",
  "c-yellow": "var(--yellow)", "c-green": "var(--green)", "c-red": "var(--red)",
};
// Terminal outcomes get distinct colours (matching the .legend-dot.out-* classes)
// so they can be told apart in the outcome pie chart and legends.
const TERMINAL_FILL: Partial<Record<AppStatus, string>> = {
  accepted: "var(--green)", rejected: "var(--red)",
  cancelled: "var(--yellow)", ghosted: "var(--muted)", withdrawn: "var(--accent)",
};
// Same colour grouping as statusColorClass, as a CSS color for SVG fills etc.
export function statusFillVar(s: AppStatus): string {
  return TERMINAL_FILL[s] ?? COLOR_VAR[statusColorClass(s)];
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

export function Skeleton({ w = "100%", h = 14, style }: { w?: number | string; h?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />;
}

export function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid cards">
      {Array.from({ length: n }).map((_, i) => (
        <div className="card" key={i}>
          <Skeleton w={70} h={11} style={{ marginBottom: 10 }} />
          <Skeleton w={46} h={22} />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="panel">
      <Skeleton w={140} h={16} style={{ marginBottom: 16 }} />
      <div style={{ display: "grid", gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={14} />)}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} h={14} w={j === 0 ? "22%" : `${100 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}
