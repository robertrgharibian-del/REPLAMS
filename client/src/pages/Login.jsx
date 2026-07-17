import React, { useState } from "react";
import { api } from "../api.js";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token, user } = await api.login(email, password);
      localStorage.setItem("fss_token", token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl p-8" style={{ background: "#141F33", border: "1px solid #22304A" }}>
        <div className="font-display uppercase tracking-widest text-xs mb-1" style={{ color: "#E8B04B" }}>FY'27 · Field Force</div>
        <h1 className="font-display text-2xl font-semibold mb-6">FSS Review Platform</h1>

        <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: "#8493AA" }}>Email</label>
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          className="w-full mb-4 bg-transparent border rounded px-3 py-2 outline-none"
          style={{ borderColor: "#3A4A66" }}
        />
        <label className="block text-xs uppercase tracking-wide mb-1" style={{ color: "#8493AA" }}>Пароль</label>
        <input
          value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          className="w-full mb-6 bg-transparent border rounded px-3 py-2 outline-none"
          style={{ borderColor: "#3A4A66" }}
        />
        {error && <div className="text-sm mb-4" style={{ color: "#E2574C" }}>{error}</div>}
        <button disabled={busy} type="submit"
          className="w-full py-2.5 rounded font-semibold"
          style={{ background: "#E8B04B", color: "#0E1726" }}>
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
