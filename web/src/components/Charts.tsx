import { useEffect, useState } from "react";
import type { AppStatus } from "../api";
import { statusFillVar, statusLabel } from "./ui";
import { useI18n } from "../i18n";

// ---- classic trapezoid funnel: wide top, narrowing toward the bottom ----
export function FunnelChart({
  stages, onClickStage,
}: {
  stages: { stage: AppStatus; count: number; pctOfBaseline: number }[];
  onClickStage?: (stage: AppStatus) => void;
}) {
  const { t } = useI18n();
  const W = 460;
  const segH = 64;
  const gap = 3;
  const H = stages.length * (segH + gap);
  const cx = W / 2;
  const maxW = W * 0.92;
  const minW = W * 0.22;

  const widthAt = (frac: number) => Math.max(minW, frac * maxW);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="funnel-svg-wrap" role="img">
      {stages.map((s, i) => {
        const topW = widthAt(s.pctOfBaseline);
        const nextFrac = i < stages.length - 1 ? stages[i + 1].pctOfBaseline : s.pctOfBaseline * 0.85;
        const botW = widthAt(nextFrac);
        const y = i * (segH + gap);
        const points = [
          [cx - topW / 2, y],
          [cx + topW / 2, y],
          [cx + botW / 2, y + segH],
          [cx - botW / 2, y + segH],
        ].map((p) => p.join(",")).join(" ");
        return (
          <g
            key={s.stage}
            className="funnel-segment"
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => onClickStage?.(s.stage)}
          >
            <polygon points={points} fill={statusFillVar(s.stage)} />
            <text x={cx} y={y + segH / 2 - 4} className="funnel-seg-label">{statusLabel(t, s.stage)}</text>
            <text x={cx} y={y + segH / 2 + 14} className="funnel-seg-count">{s.count}</text>
          </g>
        );
      })}
    </svg>
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
