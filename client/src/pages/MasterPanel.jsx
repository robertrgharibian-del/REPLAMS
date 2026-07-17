import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import ReportView from "../components/ReportView.jsx";

const STATUS_LABEL = {
  draft: { label: "Черновик", color: "#64748B" },
  submitted: { label: "На рассмотрении", color: "#E8B04B" },
  returned: { label: "На доработке", color: "#E2574C" },
  approved: { label: "Одобрено", color: "#3FB88F" },
};

function CreateUserForm({ rms, onCreated }) {
  const [role, setRole] = useState("mp");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", territory: "", rm_id: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.createUser({ ...form, role, rm_id: role === "mp" ? form.rm_id : undefined });
      setForm({ email: "", password: "", full_name: "", territory: "", rm_id: "" });
      onCreated();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl p-5 mb-8" style={{ background: "#141F33", border: "1px solid #22304A" }}>
      <div className="font-display text-lg mb-4">Создать аккаунт</div>
      <div className="flex gap-2 mb-4">
        {[["mp", "Медпред (МП)"], ["rm", "Региональный менеджер (РМ)"]].map(([v, label]) => (
          <button type="button" key={v} onClick={() => setRole(v)}
            className="px-3 py-1.5 rounded text-sm"
            style={{ background: role === v ? "#E8B04B" : "#22304A", color: role === v ? "#0E1726" : "#C9D2E0" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <input required placeholder="Имя Фамилия" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        <input required type="email" placeholder="email@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        <input required type="password" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        <input placeholder="Территория" value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        {role === "mp" && (
          <select required value={form.rm_id} onChange={(e) => setForm({ ...form, rm_id: e.target.value })}
            className="bg-transparent border rounded px-3 py-2 md:col-span-2" style={{ borderColor: "#3A4A66" }}>
            <option value="" style={{ color: "#000" }}>— выберите РМ, к которому прикрепить МП —</option>
            {rms.map((rm) => <option key={rm.id} value={rm.id} style={{ color: "#000" }}>{rm.full_name} ({rm.territory || "—"})</option>)}
          </select>
        )}
      </div>
      {error && <div className="text-sm mt-3" style={{ color: "#E2574C" }}>{error}</div>}
      <button disabled={busy} type="submit" className="mt-4 px-5 py-2.5 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>
        {busy ? "Создание…" : "Создать аккаунт"}
      </button>
    </form>
  );
}

export default function MasterPanel({ user }) {
  const [view, setView] = useState("reports");
  const [users, setUsers] = useState([]);
  const [rms, setRms] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState(null);

  async function loadAll() {
    setUsers(await api.listUsers());
    setRms(await api.listRms());
    setReports(await api.listReports());
  }
  useEffect(() => { loadAll(); }, []);

  if (reportId) return <ReportView reportId={reportId} user={user} onBack={() => { setReportId(null); loadAll(); }} />;

  return (
    <div className="max-w-6xl mx-auto px-5 py-10">
      <div className="font-display text-2xl font-semibold mb-1">Панель мастер-аккаунта</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Полный доступ ко всем территориям и отчётам</div>

      <div className="flex gap-2 mb-6">
        {[["reports", "Все отчёты"], ["users", "Пользователи"]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: view === v ? "#E8B04B" : "#141F33", color: view === v ? "#0E1726" : "#C9D2E0", border: "1px solid #22304A" }}>
            {label}
          </button>
        ))}
      </div>

      {view === "users" && (
        <>
          <CreateUserForm rms={rms} onCreated={loadAll} />
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #22304A" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#141F33", color: "#8493AA" }} className="uppercase text-xs">
                  <th className="text-left px-4 py-3">Имя</th><th className="text-left px-4 py-3">Роль</th>
                  <th className="text-left px-4 py-3">РМ</th><th className="text-left px-4 py-3">Территория</th><th className="text-left px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderTop: "1px solid #22304A" }}>
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3">{u.role === "master" ? "Мастер" : u.role === "rm" ? "РМ" : "МП"}</td>
                    <td className="px-4 py-3" style={{ color: "#8493AA" }}>{u.rm_name || "—"}</td>
                    <td className="px-4 py-3" style={{ color: "#8493AA" }}>{u.territory || "—"}</td>
                    <td className="px-4 py-3" style={{ color: "#8493AA" }}>{u.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "reports" && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #22304A" }}>
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
      )}
    </div>
  );
}
