import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function CreateUserForm({ rms, territories, onCreated }) {
  const [role, setRole] = useState("mp");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", territory: "", rm_id: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.createUser({ ...form, role, rm_id: role === "mp" ? form.rm_id : undefined, territory: role === "mp" ? form.territory : undefined });
      setForm({ email: "", password: "", full_name: "", territory: "", rm_id: "" });
      onCreated();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl p-4 sm:p-5 mb-8" style={{ background: "#141F33", border: "1px solid #22304A" }}>
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
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <input required placeholder="Имя Фамилия" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        <input required type="email" placeholder="email@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        <input required type="password" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        {role === "mp" && (
          <select required value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })}
            className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }}>
            <option value="" style={{ color: "#000" }}>— выберите территорию —</option>
            {territories.map((t) => <option key={t.key} value={t.label} style={{ color: "#000" }}>{t.label}</option>)}
          </select>
        )}
        {role === "mp" && (
          <select required value={form.rm_id} onChange={(e) => setForm({ ...form, rm_id: e.target.value })}
            className="bg-transparent border rounded px-3 py-2 sm:col-span-2" style={{ borderColor: "#3A4A66" }}>
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

function ResetRequests({ onResolved }) {
  const [requests, setRequests] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function load() { setRequests(await api.passwordResets()); }
  useEffect(() => { load(); }, []);

  async function resolve(userId, reqId) {
    const pw = passwords[reqId];
    if (!pw || pw.length < 6) { alert("Введите новый пароль (минимум 6 символов)"); return; }
    setBusyId(reqId);
    try { await api.resolveReset(userId, pw); await load(); onResolved?.(); }
    finally { setBusyId(null); }
  }

  if (requests.length === 0) return null;
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-6" style={{ background: "#E8B04B15", border: "1px solid #E8B04B44" }}>
      <div className="font-display text-lg mb-3" style={{ color: "#E8B04B" }}>Запросы на восстановление пароля ({requests.length})</div>
      <div className="space-y-2">
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg p-3" style={{ background: "#141F33" }}>
            <div className="text-sm flex-1 min-w-[160px]">
              <b>{r.full_name}</b> <span style={{ color: "#8493AA" }}>({r.email}) · {r.role === "rm" ? "РМ" : "МП"}</span>
            </div>
            <input type="password" placeholder="Новый пароль" value={passwords[r.id] || ""} onChange={(e) => setPasswords((p) => ({ ...p, [r.id]: e.target.value }))}
              className="bg-transparent border rounded px-2 py-1.5 text-sm" style={{ borderColor: "#3A4A66", width: "160px" }} />
            <button onClick={() => resolve(r.user_id, r.id)} disabled={busyId === r.id} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>
              Задать пароль
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MasterUsers() {
  const [users, setUsers] = useState([]);
  const [rms, setRms] = useState([]);
  const [territories, setTerritories] = useState([]);

  async function loadAll() {
    setUsers(await api.listUsers());
    setRms(await api.listRms());
    setTerritories(await api.listTerritories());
  }
  useEffect(() => { loadAll(); }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-5 py-8">
      <div className="font-display text-2xl font-semibold mb-1">Пользователи</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>Создание аккаунтов РМ и медпредов</div>

      <ResetRequests onResolved={loadAll} />
      <CreateUserForm rms={rms} territories={territories} onCreated={loadAll} />

      <div className="rounded-2xl overflow-x-auto" style={{ border: "1px solid #22304A" }}>
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
    </div>
  );
}
