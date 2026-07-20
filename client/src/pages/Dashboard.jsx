import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import Gauge from "../components/Gauge.jsx";

function achColor(pct) {
  if (pct === null || pct === undefined) return "#8493AA";
  if (pct >= 0.9) return "#3FB88F";
  if (pct >= 0.8) return "#E8B04B";
  return "#E2574C";
}

export default function Dashboard({ role }) {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => { api.dashboard().then(setData); }, []);

  if (!data) return <div className="max-w-6xl mx-auto px-5 py-10" style={{ color: "#8493AA" }}>Загрузка…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8">
      <div className="font-display text-2xl font-semibold mb-1">{role === "master" ? "Дашборд компании" : "Дашборд команды"}</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Последние одобренные отчёты по каждому МП</div>

      <div className="rounded-2xl p-5 mb-6 flex flex-wrap items-center gap-6" style={{ background: "linear-gradient(90deg,#1B2A44,#141F33)", border: "1px solid #22304A" }}>
        <Gauge achievement={data.company.achievement || 0} size={150} />
        <div className="flex-1 min-w-[220px] grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs uppercase" style={{ color: "#8493AA" }}>План / Факт</div>
            <div className="font-mono text-lg">${data.company.actual_usd.toLocaleString()} / ${data.company.target_usd.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs uppercase" style={{ color: "#8493AA" }}>Бонус (сумма по МП)</div>
            <div className="font-mono text-lg" style={{ color: "#E8B04B" }}>{data.company.bonus_uzs.toLocaleString()} UZS</div>
          </div>
          <div>
            <div className="text-xs uppercase" style={{ color: "#8493AA" }}>{role === "master" ? "Регионов" : "Территорий"}</div>
            <div className="font-mono text-lg">{data.hierarchy.length}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data.hierarchy.map((rm) => (
          <div key={rm.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid #22304A" }}>
            <button onClick={() => setExpanded((e) => ({ ...e, [rm.id]: !e[rm.id] }))}
              className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left" style={{ background: "#141F33" }}>
              <div>
                <div className="font-semibold">{rm.name}</div>
                <div className="text-xs" style={{ color: "#8493AA" }}>{rm.mps.length} МП</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="font-mono text-sm" style={{ color: "#8493AA" }}>${rm.actual_usd.toLocaleString()} / ${rm.target_usd.toLocaleString()}</div>
                <div className="font-mono font-bold" style={{ color: achColor(rm.achievement) }}>{rm.achievement !== null ? `${(rm.achievement * 100).toFixed(1)}%` : "—"}</div>
                <span style={{ color: "#8493AA" }}>{expanded[rm.id] ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded[rm.id] && (
              <div className="divide-y" style={{ borderColor: "#22304A" }}>
                {rm.mps.map((mp) => (
                  <div key={mp.id} className="flex flex-wrap items-center justify-between gap-3 p-3 px-4" style={{ background: "#0E1726" }}>
                    <div>
                      <div className="text-sm">{mp.name}</div>
                      <div className="text-xs" style={{ color: "#8493AA" }}>{mp.territory || "—"} {mp.latest_period ? `· ${mp.latest_period}` : "· нет одобренных отчётов"}</div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono" style={{ color: "#8493AA" }}>${mp.actual_usd.toLocaleString()} / ${mp.target_usd.toLocaleString()}</span>
                      <span className="font-mono font-semibold" style={{ color: achColor(mp.achievement) }}>{mp.achievement !== null ? `${(mp.achievement * 100).toFixed(1)}%` : "—"}</span>
                      <span className="font-mono" style={{ color: "#E8B04B" }}>{mp.bonus_uzs.toLocaleString()} UZS</span>
                    </div>
                  </div>
                ))}
                {rm.mps.length === 0 && <div className="p-3 px-4 text-sm" style={{ color: "#8493AA" }}>В команде пока нет МП</div>}
              </div>
            )}
          </div>
        ))}
        {data.hierarchy.length === 0 && <div className="text-sm" style={{ color: "#8493AA" }}>Пока нет данных</div>}
      </div>
    </div>
  );
}
