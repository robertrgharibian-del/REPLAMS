import React, { useState } from "react";
import { api } from "../api.js";

export default function Profile({ user, onUpdated }) {
  const [fullName, setFullName] = useState(user.full_name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError(""); setOk(false); setBusy(true);
    try {
      const payload = {};
      if (fullName !== user.full_name) payload.full_name = fullName;
      if (newPassword) { payload.password = newPassword; payload.current_password = currentPassword; }
      if (Object.keys(payload).length === 0) { setBusy(false); return; }
      await api.updateMe(payload);
      setOk(true);
      setCurrentPassword(""); setNewPassword("");
      onUpdated?.({ ...user, full_name: fullName });
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-5 py-10">
      <div className="font-display text-2xl font-semibold mb-1">Профиль</div>
      <div className="text-sm mb-6" style={{ color: "#8493AA" }}>{user.email}</div>

      <form onSubmit={save} className="rounded-2xl p-5 space-y-4" style={{ background: "#141F33", border: "1px solid #22304A" }}>
        <div>
          <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: "#8493AA" }}>Имя</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        </div>
        <div className="pt-2 border-t" style={{ borderColor: "#22304A" }}>
          <div className="text-xs uppercase mb-2" style={{ color: "#8493AA" }}>Сменить пароль (необязательно)</div>
          <input type="password" placeholder="Текущий пароль" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full mb-2 bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
          <input type="password" placeholder="Новый пароль" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }} />
        </div>
        {error && <div className="text-sm" style={{ color: "#E2574C" }}>{error}</div>}
        {ok && <div className="text-sm" style={{ color: "#3FB88F" }}>✓ Сохранено</div>}
        <button disabled={busy} type="submit" className="w-full py-2.5 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>
          {busy ? "Сохранение…" : "Сохранить"}
        </button>
      </form>
    </div>
  );
}
