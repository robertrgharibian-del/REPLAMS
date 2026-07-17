import React from "react";

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeBand(cx, cy, rOuter, rInner, a0, a1) {
  const p0o = polarToCartesian(cx, cy, rOuter, a0);
  const p1o = polarToCartesian(cx, cy, rOuter, a1);
  const p1i = polarToCartesian(cx, cy, rInner, a1);
  const p0i = polarToCartesian(cx, cy, rInner, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [`M ${p0o.x} ${p0o.y}`, `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1o.x} ${p1o.y}`, `L ${p1i.x} ${p1i.y}`, `A ${rInner} ${rInner} 0 ${large} 0 ${p0i.x} ${p0i.y}`, "Z"].join(" ");
}
const GAUGE_MAX = 1.5;
function angleForPct(pct) {
  const t = Math.max(0, Math.min(pct, GAUGE_MAX)) / GAUGE_MAX;
  return 180 + t * 180;
}
export function tierForAchievement(a) {
  if (a < 0.9) return { label: "Нет бонуса", color: "#64748B" };
  if (a < 1.0) return { label: "60% ставки", color: "#E8B04B" };
  if (a <= 1.25) return { label: "100% ставки", color: "#3FB88F" };
  return { label: "Потолок 125%", color: "#8B7CF6" };
}

export default function Gauge({ achievement = 0, size = 168 }) {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const rOuter = size / 2 - 10;
  const rInner = rOuter - 14;
  const zones = [
    { a0: angleForPct(0), a1: angleForPct(0.9), color: "#334155" },
    { a0: angleForPct(0.9), a1: angleForPct(1.0), color: "#E8B04B" },
    { a0: angleForPct(1.0), a1: angleForPct(1.25), color: "#3FB88F" },
    { a0: angleForPct(1.25), a1: angleForPct(1.5), color: "#8B7CF6" },
  ];
  const needleAngle = angleForPct(achievement);
  const needleTip = polarToCartesian(cx, cy, rInner - 2, needleAngle);
  const tier = tierForAchievement(achievement);

  return (
    <svg width={size} height={size / 2 + 34} viewBox={`0 0 ${size} ${size / 2 + 34}`}>
      {zones.map((z, i) => (
        <path key={i} d={describeBand(cx, cy, rOuter, rInner, z.a0, z.a1)} fill={z.color} opacity={0.95} />
      ))}
      <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#F5F0E6" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#F5F0E6" />
      <text x={cx} y={cy - 22} textAnchor="middle" fontSize="20" fontFamily="'IBM Plex Mono', monospace" fontWeight="600" fill="#F5F0E6">
        {(achievement * 100).toFixed(1)}%
      </text>
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fontFamily="Inter, sans-serif" fill={tier.color} fontWeight="600">
        {tier.label.toUpperCase()}
      </text>
    </svg>
  );
}
