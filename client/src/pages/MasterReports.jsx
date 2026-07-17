import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import ReportView from "../components/ReportView.jsx";
import RmBonusView from "../components/RmBonusView.jsx";

const STATUS_LABEL = {
  draft: { label: "Черновик", color: "#64748B" },
  submitted: { label: "На рассмотрении", color: "#E8B04B" },
  returned: { label: "На доработке", color: "#E2574C" },
  approved: { label: "Одобрено", color: "#3FB88F" },
};

export default function MasterReports({ user }) {
  const [reports, setReports] = useState([]);
  const [rms, setRms] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [rmBonusFor, setRmBonusFor] = useState(null); // { id, name }

  async function loadAll() {
    setReports(await api.listReports());
    setRms(await api.listRms());
  }
  useEffect(() => { loadAll(); }, []);

  if (reportId) return <ReportView reportId={reportId} user={user} onBack={() => { setReportId(null); loadAll(); }} />;
  if (rmBonusFor) return (
    <div>
      <div className="max-w-5xl mx-auto px-4 sm:px-5 pt-6">
        <button onClick={() => setRmBonusFor(null)} className="text-sm" style={{ color: "#8493AA" }}>← Назад</button>
      </div>
      <RmBonusView rmId={rmBonusFor.id} rmName={rmBonusFor.name} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8">
      <div className="font-display text-2xl font-semibold mb-1">Все отчёты</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Полный доступ ко всем территориям</div>

      {rms.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {rms.map((rm) => (
            <button key={rm.id} onClick={() => setRmBonusFor({ id: rm.id, name: rm.full_name })}
              className="px-3 py-1.5 rounded-full text-xs" style={{ background: "#22304A", color: "#C9D2E0" }}>
              Бонус РМ: {rm.full_name}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl overflow-x-auto" style={{ border: "1px solid #22304A" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#141F33", color: "#8493AA" }} className="uppercase text-xs">
              <th className="text-left px-4 py-3">Медпред</th><th className="text-left px-4 py-3">РМ</th>
              <th className="text-left px-4 py-3">Территория</th><th className="text-left px-4 py-3">Период</th>
              <th className="text-left px-4 py-3">Статус</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const st = STATUS_LABEL[r.status];
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #22304A" }}>
                  <td className="px-4 py-3">{r.mp_name}</td>
                  <td className="px-4 py-3" style={{ color: "#8493AA" }}>{r.rm_name || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "#8493AA" }}>{r.mp_territory || "—"}</td>
                  <td className="px-4 py-3 font-mono">{r.period_month}/{r.period_year}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: st.color + "22", color: st.color }}>{st.label}</span></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setReportId(r.id)} className="px-3 py-1.5 rounded" style={{ background: "#22304A" }}>Открыть</button></td>
                </tr>
              );
            })}
            {reports.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center" style={{ color: "#8493AA" }}>Отчётов пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
