import React, { useState } from "react";
import { api } from "../api.js";
import ReportView from "../components/ReportView.jsx";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export default function MpPanel({ user }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reportId, setReportId] = useState(null);
  const [error, setError] = useState("");

  async function open() {
    setError("");
    try {
      const r = await api.getOrCreateReport(year, month);
      setReportId(r.id);
    } catch (e) {
      setError(e.message);
    }
  }

  if (reportId) return <ReportView reportId={reportId} user={user} onBack={() => setReportId(null)} />;

  return (
    <div className="max-w-2xl mx-auto px-5 py-12">
      <div className="font-display text-2xl font-semibold mb-1">Мой отчёт</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Выберите период, чтобы открыть или создать отчёт FSS/FFE/Action Plan</div>
      <div className="rounded-2xl p-6 flex flex-wrap items-end gap-4" style={{ background: "#141F33", border: "1px solid #22304A" }}>
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "#8493AA" }}>Месяц</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1} style={{ color: "#000" }}>{m}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span style={{ color: "#8493AA" }}>Год</span>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2 w-24" style={{ borderColor: "#3A4A66" }} />
        </label>
        <button onClick={open} className="px-5 py-2.5 rounded font-semibold" style={{ background: "#E8B04B", color: "#0E1726" }}>Открыть отчёт</button>
      </div>
      {error && <div className="text-sm mt-4" style={{ color: "#E2574C" }}>{error}</div>}
    </div>
  );
}
