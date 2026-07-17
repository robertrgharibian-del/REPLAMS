import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AllComments() {
  const [comments, setComments] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => { api.allComments().then(setComments); }, []);

  const filtered = comments?.filter((c) =>
    !filter || c.mp_name?.toLowerCase().includes(filter.toLowerCase()) || c.rm_name?.toLowerCase().includes(filter.toLowerCase()) || c.author_name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-5 py-8">
      <div className="font-display text-2xl font-semibold mb-1">Все переписки</div>
      <div className="text-sm mb-5" style={{ color: "#8493AA" }}>Комментарии всех РМ и мастера по всем отчётам всех медпредов</div>

      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Фильтр по имени МП / РМ / автора…"
        className="w-full bg-transparent border rounded px-3 py-2 text-sm mb-5" style={{ borderColor: "#3A4A66" }} />

      {!comments ? <div style={{ color: "#8493AA" }}>Загрузка…</div> : (
        <div className="space-y-2">
          {filtered.length === 0 && <div className="text-sm" style={{ color: "#8493AA" }}>Ничего не найдено</div>}
          {filtered.map((c) => (
            <div key={c.id} className="rounded-xl p-3" style={{ background: "#141F33", border: "1px solid #22304A" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="text-sm">
                  <span style={{ color: "#E8B04B" }} className="font-semibold">{c.author_name}</span>
                  <span style={{ color: "#8493AA" }}> ({c.author_role === "rm" ? "РМ" : c.author_role === "master" ? "Мастер" : "МП"})</span>
                </div>
                <div className="text-xs" style={{ color: "#8493AA" }}>{new Date(c.created_at).toLocaleString("ru-RU")}</div>
              </div>
              <div className="text-sm mb-1">{c.comment_text}</div>
              <div className="text-xs" style={{ color: "#8493AA" }}>
                {c.mp_name} ({c.rm_name || "—"}) · {c.period_month}/{c.period_year} · раздел: {c.section}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
