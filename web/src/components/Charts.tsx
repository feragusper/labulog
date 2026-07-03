import { useEffect, useState } from "react";
import type { AppStatus } from "../api";
import { pct, statusFillVar, statusLabel } from "./ui";
import { useI18n } from "../i18n";

export type FunnelStageData = {
  stage: AppStatus;
  count: number;
  pctOfBaseline: number;
  pctOfPrev: number | null;
  lost: number;
  lostByOutcome: { outcome: AppStatus; count: number }[];
  accepted: number;
};

// ---- horizontal funnel: stages flow left to right, full width; each column
// shows its segment plus the drop-off details for that stage right below it ----
export function FunnelChart({
  stages, onClickStage, onClickOutcome,
}: {
  stages: FunnelStageData[];
  onClickStage?: (stage: AppStatus) => void;
  onClickOutcome?: (outcome: AppStatus, stage: AppStatus) => void;
}) {
  const { t } = useI18n();
  // Segment heights as % of the band; keep a floor so tiny stages stay visible/clickable.
  const minFrac = 0.1;
  const hAt = (frac: number) => Math.max(minFrac, frac) * 100;

  return (
    <div className="funnel-h" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(110px, 1fr))` }}>
      {stages.map((s, i) => {
        const leftH = hAt(s.pctOfBaseline);
        const rightFrac = i < stages.length - 1 ? stages[i + 1].pctOfBaseline : s.pctOfBaseline * 0.85;
        const rightH = hAt(rightFrac);
        const points = [
          [0, 50 - leftH / 2],
          [100, 50 - rightH / 2],
          [100, 50 + rightH / 2],
          [0, 50 + leftH / 2],
        ].map((p) => p.join(",")).join(" ");
        return (
          <div key={s.stage} className="funnel-col">
            <button className="tag-btn funnel-col-head" onClick={() => onClickStage?.(s.stage)}>
              <span className="funnel-col-name">{statusLabel(t, s.stage)}</span>
              <span className="funnel-col-count">{s.count}</span>
            </button>
            <svg
              className="funnel-col-band"
              style={{ animationDelay: `${i * 70}ms` }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              onClick={() => onClickStage?.(s.stage)}
            >
              <polygon points={points} fill={statusFillVar(s.stage)} />
            </svg>
            <div className="funnel-col-details">
              <span className="muted">
                {pct(s.pctOfBaseline)} {t("overview.ofTotal")}
                {s.pctOfPrev !== null && <> · {pct(s.pctOfPrev)} {t("overview.vsPrevStage")}</>}
              </span>
              {s.accepted > 0 && (
                <button className="tag-btn funnel-drop-positive" onClick={() => onClickOutcome?.("accepted", s.stage)}>
                  <span className="legend-dot out-accepted" /> {s.accepted} {t("overview.acceptedHere")}
                </button>
              )}
              {s.lost > 0 && (
                <>
                  <span className="muted">−{s.lost} {t("overview.closedHere")}:</span>
                  {s.lostByOutcome.map(({ outcome, count: c }) => (
                    <button key={outcome} className="tag-btn legend-item" onClick={() => onClickOutcome?.(outcome, s.stage)}>
                      <span className="legend-dot" style={{ background: statusFillVar(outcome) }} />
                      {statusLabel(t, outcome)} ({c})
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- animated donut/pie ----
export function PieChart({
  data, size = 180, centerLabel, onClickSlice,
}: {
  data: { status: AppStatus; count: number }[];
  size?: number;
  centerLabel?: string;
  onClickSlice?: (status: AppStatus) => void;
}) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const slices = data.map((d) => {
    const frac = total ? d.count / total : 0;
    const dash = frac * circumference;
    const offset = cumulative;
    cumulative += dash;
    return { ...d, frac, dash, offset };
  });

  // Animate the draw-in by starting fully hidden, then revealing on mount.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setRevealed(true)); return () => cancelAnimationFrame(id); }, []);

  return (
    <div className="pie-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {slices.map((s) => (
            <circle
              key={s.status}
              className="pie-slice"
              cx={cx} cy={cy} r={r} fill="none"
              stroke={statusFillVar(s.status)}
              strokeWidth={26}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={revealed ? -s.offset : circumference}
              onClick={() => onClickSlice?.(s.status)}
            >
              <title>{statusLabel(t, s.status)}: {s.count}</title>
            </circle>
          ))}
        </g>
        <text x={cx} y={cy - 2} className="pie-center-value">{total}</text>
        {centerLabel && <text x={cx} y={cy + 16} className="pie-center-label">{centerLabel}</text>}
      </svg>
      <div className="pie-legend">
        {slices.map((s) => (
          <button
            key={s.status}
            className="pie-legend-item"
            onClick={() => onClickSlice?.(s.status)}
          >
            <span className="pie-legend-dot" style={{ background: statusFillVar(s.status) }} />
            {statusLabel(t, s.status)}
            <span className="pie-legend-count">{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
