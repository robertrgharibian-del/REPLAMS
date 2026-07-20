import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import ReportView from "../components/ReportView.jsx";

const STATUS_LABEL = {
  draft: { label: "Черновик", color: "#64748B" },
  submitted: { label: "На рассмотрении", color: "#E8B04B" },
  returned: { label: "На доработке", color: "#E2574C" },
  approved: { label: "Одобрено", color: "#3FB88F" },
};

export default function RmPanel({ user }) {
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const rows = await api.listReports();
    setReports(rows);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (reportId) return <ReportView reportId={reportId} user={user} onBack={() => { setReportId(null); load(); }} />;

  return (
    <div className="max-w-5xl mx-auto px-5 py-10">
      <div className="font-display text-2xl font-semibold mb-1">Отчёты моей команды</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Медпреды, прикреплённые к вам</div>
      {loading ? <div>Загрузка…</div> : (
        <div className="rounded-2xl overflow-x-auto" style={{ border: "1px solid #22304A" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#141F33", color: "#8493AA" }} className="uppercase text-xs">
                <th className="text-left px-4 py-3">Медпред</th>
                <th className="text-left px-4 py-3">Территория</th>
                <th className="text-left px-4 py-3">Период</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const st = STATUS_LABEL[r.status];
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #22304A" }}>
                    <td className="px-4 py-3">{r.mp_name}</td>
                    <td className="px-4 py-3" style={{ color: "#8493AA" }}>{r.mp_territory || "—"}</td>
                    <td className="px-4 py-3 font-mono">{r.period_month}/{r.period_year}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: st.color + "22", color: st.color }}>{st.label}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setReportId(r.id)} className="px-3 py-1.5 rounded" style={{ background: "#22304A" }}>Открыть</button></td>
                  </tr>
                );
              })}
              {reports.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center" style={{ color: "#8493AA" }}>Пока нет отчётов</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
