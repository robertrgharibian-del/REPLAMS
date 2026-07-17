import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Login from "./pages/Login.jsx";
import MpPanel from "./pages/MpPanel.jsx";
import RmPanel from "./pages/RmPanel.jsx";
import MasterPanel from "./pages/MasterPanel.jsx";

const ROLE_LABEL = { master: "Мастер-аккаунт", rm: "Региональный менеджер", mp: "Медпредставитель" };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("fss_token");
    if (!token) { setChecking(false); return; }
    api.me().then(setUser).catch(() => localStorage.removeItem("fss_token")).finally(() => setChecking(false));
  }, []);

  function logout() {
    localStorage.removeItem("fss_token");
    setUser(null);
  }

  if (checking) return <div style={{ background: "#0E1726", minHeight: "100vh" }} />;
  if (!user) return <div style={{ background: "#0E1726", minHeight: "100vh" }}><Login onLogin={setUser} /></div>;

  return (
    <div style={{ background: "#0E1726", minHeight: "100vh" }}>
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#22304A" }}>
        <div className="font-display text-lg font-semibold" style={{ color: "#E8B04B" }}>FSS Review Platform</div>
        <div className="flex items-center gap-4 text-sm">
          <span style={{ color: "#8493AA" }}>{user.full_name} · {ROLE_LABEL[user.role]}</span>
          <button onClick={logout} className="px-3 py-1.5 rounded" style={{ background: "#22304A" }}>Выйти</button>
        </div>
      </div>

      {user.role === "master" && <MasterPanel user={user} />}
      {user.role === "rm" && <RmPanel user={user} />}
      {user.role === "mp" && <MpPanel user={user} />}
    </div>
  );
}
