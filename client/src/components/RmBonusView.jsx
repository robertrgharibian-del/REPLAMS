import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function Row({ label, value, ok }) {
  return (
    <div className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: "#1B2A44" }}>
      <span style={{ color: "#8493AA" }}>{label}</span>
      <span className="font-mono" style={{ color: ok === undefined ? "#F5F0E6" : ok ? "#3FB88F" : "#E2574C" }}>{value}</span>
    </div>
  );
}

export default function RmBonusView({ rmId, rmName }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null); setError("");
    api.rmBonus(year, quarter, rmId).then(setData).catch((e) => setError(e.message));
  }, [year, quarter, rmId]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="font-display text-2xl font-semibold">{rmName ? `Бонус РМ — ${rmName}` : "Мой бонус"}</div>
          <div className="text-sm" style={{ color: "#8493AA" }}>Мультипликатор × средний бонус команды МП</div>
        </div>
        <div className="flex gap-2">
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2 text-sm" style={{ borderColor: "#3A4A66" }}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q} style={{ color: "#000" }}>Q{q}</option>)}
          </select>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2 text-sm w-24" style={{ borderColor: "#3A4A66" }} />
        </div>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2 rounded" style={{ background: "#E2574C22", color: "#E2574C" }}>{error}</div>}
      {!data ? <div style={{ color: "#8493AA" }}>Загрузка…</div> : (
        <>
          <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
            <div className="font-display text-lg mb-3">Команда — Q{quarter} {year}</div>
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                    <th className="text-left py-1">МП</th><th className="text-right px-2">Дост.</th><th className="text-right px-2">FFE</th>
                    <th className="text-right px-2">Квалифицирован</th><th className="text-right">Бонус, UZS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.map((t) => (
                    <tr key={t.mp_id} style={{ borderTop: "1px solid #22304A" }}>
                      <td className="py-1.5">{t.mp_name}</td>
                      <td className="text-right px-2 font-mono">{(t.achievement * 100).toFixed(1)}%</td>
                      <td className="text-right px-2 font-mono">{(t.ffe_score * 100).toFixed(0)}%</td>
                      <td className="text-right px-2" style={{ color: t.qualifies ? "#3FB88F" : "#E2574C" }}>{t.qualifies ? "✓" : "✗"}</td>
                      <td className="text-right font-mono">{Math.round(t.bonus_uzs).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.team.length === 0 && <tr><td colSpan={5} className="py-4 text-center" style={{ color: "#8493AA" }}>В команде пока нет МП</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-2">
              {data.team.map((t) => (
                <div key={t.mp_id} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{t.mp_name}</span>
                    <span style={{ color: t.qualifies ? "#3FB88F" : "#E2574C" }}>{t.qualifies ? "✓" : "✗"}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono" style={{ color: "#8493AA" }}>
                    <span>Дост. {(t.achievement * 100).toFixed(1)}% · FFE {(t.ffe_score * 100).toFixed(0)}%</span>
                    <span>{Math.round(t.bonus_uzs).toLocaleString()} UZS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-sm mb-5">
            <Row label="Команда квалифицируется (≥50% МП выполнили условия)" value={`${data.qualified_count}/${data.team_size} ${data.team_qualifies ? "✓" : "✗"}`} ok={data.team_qualifies} />
            <Row label="Достижение РМ (сумма территорий команды)" value={`${(data.rm_achievement * 100).toFixed(1)}%`} ok={data.rm_achievement >= 0.9} />
            <Row label="Мультипликатор" value={data.multiplier_label} />
            <Row label="Средний бонус команды МП" value={`${Math.round(data.avg_mr_bonus_uzs).toLocaleString()} UZS`} />
          </div>

          <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "linear-gradient(90deg,#1B2A44,#141F33)" }}>
            <div className="font-display text-base">ИТОГОВЫЙ бонус РМ за квартал</div>
            <div className="font-mono text-xl font-bold" style={{ color: data.rm_bonus_uzs > 0 ? "#E8B04B" : "#E2574C" }}>
              {Math.round(data.rm_bonus_uzs).toLocaleString()} UZS
            </div>
          </div>
        </>
      )}
    </div>
  );
}
