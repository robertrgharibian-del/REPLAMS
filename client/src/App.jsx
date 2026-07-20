import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Login from "./pages/Login.jsx";
import MpPanel from "./pages/MpPanel.jsx";
import RmPanel from "./pages/RmPanel.jsx";
import MasterReports from "./pages/MasterReports.jsx";
import MasterUsers from "./pages/MasterUsers.jsx";
import MasterImports from "./pages/MasterImports.jsx";
import AllComments from "./pages/AllComments.jsx";
import AiInsights from "./pages/AiInsights.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Profile from "./pages/Profile.jsx";
import RmBonusView from "./components/RmBonusView.jsx";

const ROLE_LABEL = { master: "Мастер-аккаунт", rm: "Региональный менеджер", mp: "Медпредставитель" };

const NAV = {
  master: [["reports", "Отчёты"], ["users", "Пользователи"], ["imports", "Загрузка данных"], ["comments", "Комментарии"], ["dashboard", "Дашборд"], ["ai", "ИИ-рекомендации"], ["profile", "Профиль"]],
  rm: [["team", "Команда"], ["bonus", "Мой бонус"], ["dashboard", "Дашборд"], ["ai", "ИИ-рекомендации"], ["profile", "Профиль"]],
  mp: [["report", "Мой отчёт"], ["ai", "ИИ-рекомендации"], ["profile", "Профиль"]],
};
const DEFAULT_SECTION = { master: "reports", rm: "team", mp: "report" };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState("reports");

  useEffect(() => {
    const token = localStorage.getItem("fss_token");
    if (!token) { setChecking(false); return; }
    api.me().then((u) => { setUser(u); setSection(DEFAULT_SECTION[u.role]); })
      .catch(() => localStorage.removeItem("fss_token"))
      .finally(() => setChecking(false));
  }, []);

  function handleLogin(u) {
    setUser(u);
    setSection(DEFAULT_SECTION[u.role]);
  }
  function logout() {
    localStorage.removeItem("fss_token");
    setUser(null);
  }

  if (checking) return <div style={{ background: "#0E1726", minHeight: "100vh" }} />;
  if (!user) return <div style={{ background: "#0E1726", minHeight: "100vh" }}><Login onLogin={handleLogin} /></div>;

  const nav = NAV[user.role] || [];

  return (
    <div style={{ background: "#0E1726", minHeight: "100vh" }}>
      <div className="border-b" style={{ borderColor: "#22304A" }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4">
          <div className="font-display text-base sm:text-lg font-semibold" style={{ color: "#E8B04B" }}>FSS Review Platform</div>
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
            <span className="hidden sm:inline" style={{ color: "#8493AA" }}>{user.full_name} · {ROLE_LABEL[user.role]}</span>
            <button onClick={logout} className="px-3 py-1.5 rounded" style={{ background: "#22304A" }}>Выйти</button>
          </div>
        </div>
        {nav.length > 1 && (
          <div className="flex gap-1 px-4 sm:px-6 pb-2 overflow-x-auto">
            {nav.map(([key, label]) => (
              <button key={key} onClick={() => setSection(key)}
                className="px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium shrink-0"
                style={{ background: section === key ? "#E8B04B" : "transparent", color: section === key ? "#0E1726" : "#8493AA" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {user.role === "master" && section === "reports" && <MasterReports user={user} />}
      {user.role === "master" && section === "users" && <MasterUsers />}
      {user.role === "master" && section === "imports" && <MasterImports />}
      {user.role === "master" && section === "comments" && <AllComments />}
      {user.role === "master" && section === "dashboard" && <Dashboard role="master" />}
      {user.role === "master" && section === "ai" && <AiInsights />}
      {user.role === "master" && section === "profile" && <Profile user={user} onUpdated={setUser} />}

      {user.role === "rm" && section === "team" && <RmPanel user={user} />}
      {user.role === "rm" && section === "bonus" && <RmBonusView rmId={user.id} rmName={null} />}
      {user.role === "rm" && section === "dashboard" && <Dashboard role="rm" />}
      {user.role === "rm" && section === "ai" && <AiInsights />}
      {user.role === "rm" && section === "profile" && <Profile user={user} onUpdated={setUser} />}

      {user.role === "mp" && section === "report" && <MpPanel user={user} />}
      {user.role === "mp" && section === "ai" && <AiInsights />}
      {user.role === "mp" && section === "profile" && <Profile user={user} onUpdated={setUser} />}
    </div>
  );
}
