import React, { useEffect, useState, useCallback } from "react";
import { api, authedDownload } from "../api.js";
import Gauge from "./Gauge.jsx";

const STATUS_LABEL = {
  draft: { label: "Черновик", color: "#64748B" },
  submitted: { label: "На рассмотрении у РМ", color: "#E8B04B" },
  returned: { label: "Возвращён на доработку", color: "#E2574C" },
  approved: { label: "Одобрено", color: "#3FB88F" },
};

function RowComments({ comments, section, itemRef, canComment, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const mine = comments.filter((c) => c.section === section && String(c.item_ref) === String(itemRef));
  return (
    <div className="mt-1">
      {mine.map((c) => (
        <div key={c.id} className="text-xs rounded px-2 py-1 mb-1" style={{ background: "#1B2A44", color: "#C9D2E0" }}>
          <b style={{ color: "#E8B04B" }}>{c.author_name}:</b> {c.comment_text}
        </div>
      ))}
      {canComment && (
        open ? (
          <div className="flex gap-1 mt-1">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Комментарий…"
              className="flex-1 bg-transparent border rounded px-2 py-1 text-xs" style={{ borderColor: "#3A4A66" }} />
            <button onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(""); setOpen(false); } }}
              className="text-xs px-2 rounded" style={{ background: "#3FB88F", color: "#0E1726" }}>ОК</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-xs" style={{ color: "#8493AA" }}>+ комментарий</button>
        )
      )}
    </div>
  );
}

export default function ReportView({ reportId, user, onBack }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("fss");
  const [fssRows, setFssRows] = useState([]);
  const [ffeRows, setFfeRows] = useState([]);
  const [fieldDays, setFieldDays] = useState(null);
  const [apRows, setApRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnText, setReturnText] = useState("");

  const load = useCallback(async () => {
    const d = await api.getReport(reportId);
    setDetail(d);
    setFssRows(d.fss.items.map((i) => ({ product_id: i.product_id, target_qty: i.target_qty, actual_qty: i.actual_qty })));
    setFfeRows(d.ffe.items.map((i) => ({ metric_key: i.metric_key, master_list_count: i.master_list_count, approved_count: i.approved_count, achieved_count: i.achieved_count })));
    setFieldDays(d.field_days);
    setApRows(d.action_plan.map((a) => ({ ...a })));
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  if (!detail) return <div className="p-8">Загрузка…</div>;

  const { report, mp, fss, ffe, comments } = detail;
  const editable = user.role === "mp" && ["draft", "returned"].includes(report.status);
  const canReview = user.role === "rm" && report.status === "submitted";
  const canComment = (user.role === "rm" || user.role === "master") && ["submitted", "approved"].includes(report.status);
  const st = STATUS_LABEL[report.status];

  async function saveFss() {
    setBusy(true); setError("");
    try { await api.saveFss(reportId, fssRows); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveFfe() {
    setBusy(true); setError("");
    try { await api.saveFfe(reportId, ffeRows, fieldDays); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveActionPlan() {
    setBusy(true); setError("");
    try { await api.saveActionPlan(reportId, apRows); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try { await api.submitReport(reportId); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true); setError("");
    try { await api.approveReport(reportId, returnText); setReturnText(""); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function returnToMp() {
    if (!returnText.trim()) { setError("Укажите причину возврата"); return; }
    setBusy(true); setError("");
    try { await api.returnReport(reportId, returnText); setReturnText(""); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function addComment(section, item_ref, comment_text) {
    await api.addComment(reportId, { section, item_ref, comment_text });
    await load();
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <button onClick={onBack} className="text-sm mb-4" style={{ color: "#8493AA" }}>← Назад к списку</button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pb-6 border-b" style={{ borderColor: "#22304A" }}>
        <div>
          <div className="font-display text-2xl font-semibold">{mp.full_name}</div>
          <div className="text-sm" style={{ color: "#8493AA" }}>{mp.territory || "—"} · {report.period_month}/{report.period_year}</div>
          <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full font-semibold" style={{ background: st.color + "22", color: st.color }}>{st.label}</span>
        </div>
        <div className="flex flex-col items-center">
          <Gauge achievement={fss.achievement} />
          <div className="text-xs mt-1" style={{ color: "#8493AA" }}>Бонус: <b style={{ color: "#E8B04B" }}>{Math.round(fss.bonus_uzs).toLocaleString()} UZS</b></div>
        </div>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2 rounded" style={{ background: "#E2574C22", color: "#E2574C" }}>{error}</div>}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["fss", "FSS"], ["ffe", "FFE"], ["plan", "Action Plan"], ["comments", "История / Комментарии"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: tab === k ? "#E8B04B" : "#141F33", color: tab === k ? "#0E1726" : "#C9D2E0", border: "1px solid #22304A" }}>
            {label}
          </button>
        ))}
      </div>

      {/* FSS TAB */}
      {tab === "fss" && (
        <div className="rounded-2xl p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                <th className="text-left py-1">Препарат</th>
                <th className="text-right py-1 px-2">NRV $</th>
                <th className="text-right py-1 px-2">План, уп.</th>
                <th className="text-right py-1 px-2">Факт, уп.</th>
                <th className="text-right py-1">Дост.</th>
              </tr>
            </thead>
            <tbody>
              {fss.items.map((item, idx) => (
                <React.Fragment key={item.product_id}>
                  <tr style={{ borderTop: "1px solid #22304A" }}>
                    <td className="py-1.5" style={{ color: "#C9D2E0" }}>{item.product_name}</td>
                    <td className="text-right px-2 font-mono" style={{ color: "#8493AA" }}>{Number(item.nrv_usd).toFixed(2)}</td>
                    <td className="text-right px-2">
                      {editable ? (
                        <input type="number" value={fssRows[idx]?.target_qty ?? 0}
                          onChange={(e) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, target_qty: Number(e.target.value) } : row))}
                          className="w-20 bg-transparent border-b text-right font-mono px-1" style={{ borderColor: "#3A4A66" }} />
                      ) : <span className="font-mono">{item.target_qty}</span>}
                    </td>
                    <td className="text-right px-2">
                      {editable ? (
                        <input type="number" value={fssRows[idx]?.actual_qty ?? 0}
                          onChange={(e) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, actual_qty: Number(e.target.value) } : row))}
                          className="w-20 bg-transparent border-b text-right font-mono px-1" style={{ borderColor: "#E8B04B66", color: "#E8B04B" }} />
                      ) : <span className="font-mono" style={{ color: "#E8B04B" }}>{item.actual_qty}</span>}
                    </td>
                    <td className="text-right font-mono">{item.target_usd ? `${((item.actual_usd / item.target_usd) * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                  <tr><td colSpan={5}><RowComments comments={comments} section="fss" itemRef={item.product_id} canComment={canComment}
                    onAdd={(t) => addComment("fss", item.product_id, t)} /></td></tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between mt-4 text-sm font-mono">
            <span>План: ${Math.round(fss.target_usd).toLocaleString()} · Факт: ${Math.round(fss.actual_usd).toLocaleString()}</span>
            <span style={{ color: "#E8B04B" }}>{fss.tier_label}</span>
          </div>
          {editable && <button onClick={saveFss} disabled={busy} className="mt-4 px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить FSS</button>}
        </div>
      )}

      {/* FFE TAB */}
      {tab === "ffe" && (
        <div className="rounded-2xl p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="mb-4 flex items-center gap-3">
            <div className="text-lg font-display">FFE score: <b style={{ color: ffe.score >= 0.85 ? "#3FB88F" : "#E2574C" }}>{(ffe.score * 100).toFixed(1)}%</b></div>
            <div className="text-xs" style={{ color: "#8493AA" }}>минимум для допуска к бонусу — 85%</div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                <th className="text-left py-1">Метрика</th>
                <th className="text-right px-2">В мастер-листе</th>
                <th className="text-right px-2">Утверждено</th>
                <th className="text-right px-2">Достигнуто</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {ffe.items.map((item, idx) => (
                <React.Fragment key={item.metric_key}>
                  <tr style={{ borderTop: "1px solid #22304A" }}>
                    <td className="py-1.5" style={{ color: "#C9D2E0" }}>{item.label}</td>
                    {["master_list_count", "approved_count", "achieved_count"].map((field) => (
                      <td key={field} className="text-right px-2">
                        {editable ? (
                          <input type="number" value={ffeRows[idx]?.[field] ?? 0}
                            onChange={(e) => setFfeRows((r) => r.map((row, i) => i === idx ? { ...row, [field]: Number(e.target.value) } : row))}
                            className="w-16 bg-transparent border-b text-right font-mono px-1" style={{ borderColor: field === "achieved_count" ? "#E8B04B66" : "#3A4A66", color: field === "achieved_count" ? "#E8B04B" : "#8493AA" }} />
                        ) : <span className="font-mono">{item[field]}</span>}
                      </td>
                    ))}
                    <td className="text-right font-mono" style={{ color: item.percent >= 0.85 ? "#3FB88F" : "#E2574C" }}>{(item.percent * 100).toFixed(0)}%</td>
                  </tr>
                  <tr><td colSpan={5}><RowComments comments={comments} section="ffe" itemRef={item.id} canComment={canComment}
                    onAdd={(t) => addComment("ffe", item.id, t)} /></td></tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {fieldDays && (
            <div className="mt-5 grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
              {[["total_days", "Дней в месяце"], ["non_working_days", "Выходные"], ["public_holidays", "Праздники"], ["training_days", "Тренинги"], ["leave_days", "Отпуск/б.лист"], ["field_days", "Дней в поле"]].map(([k, label]) => (
                <div key={k}>
                  <div style={{ color: "#8493AA" }} className="mb-1">{label}</div>
                  {editable ? (
                    <input type="number" value={fieldDays[k] ?? 0} onChange={(e) => setFieldDays((f) => ({ ...f, [k]: Number(e.target.value) }))}
                      className="w-full bg-transparent border rounded px-2 py-1 font-mono" style={{ borderColor: "#3A4A66" }} />
                  ) : <div className="font-mono">{fieldDays[k]}</div>}
                </div>
              ))}
            </div>
          )}
          {editable && <button onClick={saveFfe} disabled={busy} className="mt-4 px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить FFE</button>}
        </div>
      )}

      {/* ACTION PLAN TAB */}
      {tab === "plan" && (
        <div className="rounded-2xl p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          {apRows.map((row, idx) => (
            <div key={idx} className="rounded-xl p-3 mb-3" style={{ background: "#1B2A44" }}>
              <div className="grid md:grid-cols-5 gap-2 text-sm">
                {[
                  ["product_name", "Препарат"], ["goal", "Цель"], ["action_text", "План действий"],
                ].map(([field, label]) => (
                  <div key={field} className={field === "action_text" ? "md:col-span-2" : ""}>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>{label}</div>
                    {editable ? (
                      <textarea value={row[field] || ""} rows={2}
                        onChange={(e) => setApRows((r) => r.map((x, i) => i === idx ? { ...x, [field]: e.target.value } : x))}
                        className="w-full bg-transparent border rounded px-2 py-1" style={{ borderColor: "#3A4A66" }} />
                    ) : <div>{row[field]}</div>}
                  </div>
                ))}
                {[["control_date", "Контроль"], ["completion_date", "Завершение"]].map(([field, label]) => (
                  <div key={field}>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>{label}</div>
                    {editable ? (
                      <input type="date" value={row[field] ? String(row[field]).slice(0, 10) : ""}
                        onChange={(e) => setApRows((r) => r.map((x, i) => i === idx ? { ...x, [field]: e.target.value } : x))}
                        className="w-full bg-transparent border rounded px-2 py-1" style={{ borderColor: "#3A4A66" }} />
                    ) : <div>{row[field] ? String(row[field]).slice(0, 10) : "—"}</div>}
                  </div>
                ))}
              </div>
              <RowComments comments={comments} section="action_plan" itemRef={row.id} canComment={canComment}
                onAdd={(t) => addComment("action_plan", row.id, t)} />
              {editable && (
                <button onClick={() => setApRows((r) => r.filter((_, i) => i !== idx))} className="text-xs mt-2" style={{ color: "#E2574C" }}>Удалить пункт</button>
              )}
            </div>
          ))}
          {editable && (
            <div className="flex gap-3">
              <button onClick={() => setApRows((r) => [...r, { product_name: "", goal: "", action_text: "", control_date: "", completion_date: "" }])}
                className="px-3 py-2 rounded text-sm" style={{ background: "#22304A" }}>+ добавить пункт</button>
              <button onClick={saveActionPlan} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить Action Plan</button>
            </div>
          )}
        </div>
      )}

      {/* COMMENTS / HISTORY TAB */}
      {tab === "comments" && (
        <div className="rounded-2xl p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="mb-5">
            <div className="font-display text-lg mb-2">Комментарии</div>
            {comments.length === 0 && <div className="text-sm" style={{ color: "#8493AA" }}>Пока нет комментариев</div>}
            {comments.map((c) => (
              <div key={c.id} className="text-sm rounded px-3 py-2 mb-2" style={{ background: "#1B2A44" }}>
                <span style={{ color: "#E8B04B" }} className="font-semibold">{c.author_name}</span>
                <span style={{ color: "#8493AA" }}> · {c.section} · {new Date(c.created_at).toLocaleString("ru-RU")}</span>
                <div>{c.comment_text}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="font-display text-lg mb-2">История статусов</div>
            {detail.status_log.map((l) => (
              <div key={l.id} className="text-xs mb-1" style={{ color: "#8493AA" }}>
                {new Date(l.created_at).toLocaleString("ru-RU")} — <b style={{ color: "#C9D2E0" }}>{l.actor_name}</b>: {l.from_status || "—"} → {l.to_status} {l.note ? `(«${l.note}»)` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WORKFLOW ACTIONS */}
      <div className="mt-6 rounded-2xl p-5 flex flex-wrap items-center gap-3" style={{ background: "#1B2A44", border: "1px solid #22304A" }}>
        {editable && (
          <button onClick={submit} disabled={busy} className="px-5 py-2.5 rounded font-semibold" style={{ background: "#E8B04B", color: "#0E1726" }}>
            Отправить на рассмотрение РМ
          </button>
        )}
        {report.status === "returned" && (
          <div className="text-sm" style={{ color: "#E2574C" }}>Отчёт возвращён на доработку — см. комментарии выше.</div>
        )}
        {canReview && (
          <>
            <input value={returnText} onChange={(e) => setReturnText(e.target.value)} placeholder="Комментарий (обязателен при возврате)"
              className="flex-1 min-w-[200px] bg-transparent border rounded px-3 py-2 text-sm" style={{ borderColor: "#3A4A66" }} />
            <button onClick={approve} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Одобрить</button>
            <button onClick={returnToMp} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#E2574C", color: "#0E1726" }}>Вернуть на доработку</button>
          </>
        )}
        {report.status === "approved" && (
          <>
            <div className="text-sm font-semibold" style={{ color: "#3FB88F" }}>✓ Отчёт одобрен</div>
            <button onClick={() => authedDownload(api.exportUrl(reportId, "xlsx"))} className="px-4 py-2 rounded" style={{ background: "#22304A" }}>Скачать Excel</button>
            <button onClick={() => authedDownload(api.exportUrl(reportId, "pptx"))} className="px-4 py-2 rounded" style={{ background: "#22304A" }}>Скачать презентацию</button>
          </>
        )}
      </div>
    </div>
  );
}
