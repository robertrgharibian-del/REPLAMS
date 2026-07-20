import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function Section({ title, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ background: "#141F33", border: "1px solid #22304A" }}>
      <div className="font-display text-lg mb-3">{title}</div>
      {children}
    </div>
  );
}

export default function AiInsights() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(refresh) {
    setBusy(true); setError("");
    try { setData(await api.aiInsights(refresh)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    api.aiInsightsStatus().then((s) => { setStatus(s); if (s.enabled) load(false); });
  }, []);

  if (status && !status.enabled) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-16 text-center">
        <div className="font-display text-2xl mb-3">ИИ-рекомендации не настроены</div>
        <div className="text-sm" style={{ color: "#8493AA" }}>
          Мастер-аккаунт ещё не подключил ИИ-анализ на сервере. Это делается один раз — добавляется ключ API в переменные окружения бэкенда, никому из пользователей ничего устанавливать не нужно.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="font-display text-2xl font-semibold">ИИ-рекомендации</div>
          <div className="text-sm" style={{ color: "#8493AA" }}>
            Глубокий анализ динамики: месяц / квартал / год {data?.generated_at && `· обновлено ${new Date(data.generated_at).toLocaleString("ru-RU")}`}
          </div>
        </div>
        <button onClick={() => load(true)} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#E8B04B", color: "#0E1726" }}>
          {busy ? "Анализирую…" : "Обновить анализ"}
        </button>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2 rounded" style={{ background: "#E2574C22", color: "#E2574C" }}>{error}</div>}
      {!data && !error && <div style={{ color: "#8493AA" }}>Загрузка…</div>}

      {data && (
        <>
          <Section title="Главный вывод">
            <div className="text-sm leading-relaxed">{data.summary}</div>
          </Section>

          <Section title="Динамика месяц-к-месяцу">
            <div className="text-sm leading-relaxed" style={{ color: "#C9D2E0" }}>{data.monthly_dynamics}</div>
          </Section>

          <Section title="Динамика квартал-к-кварталу">
            <div className="text-sm leading-relaxed" style={{ color: "#C9D2E0" }}>{data.quarterly_dynamics}</div>
          </Section>

          <Section title="Динамика год-к-году">
            <div className="text-sm leading-relaxed" style={{ color: "#C9D2E0" }}>{data.yearly_dynamics}</div>
          </Section>

          {data.risks?.length > 0 && (
            <Section title="Риски">
              <ul className="space-y-2">
                {data.risks.map((r, i) => (
                  <li key={i} className="text-sm rounded px-3 py-2" style={{ background: "#E2574C15", color: "#E2574C" }}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {data.short_term_recommendations?.length > 0 && (
            <Section title="Рекомендации: краткосрочно (1-4 недели)">
              <ul className="space-y-2">
                {data.short_term_recommendations.map((r, i) => (
                  <li key={i} className="text-sm rounded px-3 py-2" style={{ background: "#E8B04B15", color: "#E8B04B" }}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {data.long_term_recommendations?.length > 0 && (
            <Section title="Рекомендации: долгосрочно (квартал+)">
              <ul className="space-y-2">
                {data.long_term_recommendations.map((r, i) => (
                  <li key={i} className="text-sm rounded px-3 py-2" style={{ background: "#3FB88F15", color: "#3FB88F" }}>{r}</li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
