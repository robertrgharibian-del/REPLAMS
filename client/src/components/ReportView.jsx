import React, { useEffect, useState, useCallback } from "react";
import { api, authedDownload } from "../api.js";
import Gauge from "./Gauge.jsx";
import NumField, { toNum, toInputStr } from "./NumField.jsx";

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
              className="text-xs px-2 rounded shrink-0" style={{ background: "#3FB88F", color: "#0E1726" }}>ОК</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-xs" style={{ color: "#8493AA" }}>+ комментарий</button>
        )
      )}
    </div>
  );
}

const inputStyle = (color) => ({ borderColor: "#3A4A66", color: color || "#F5F0E6", background: "transparent" });

export default function ReportView({ reportId, user, onBack }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("fss");
  const [fssRows, setFssRows] = useState([]); // { product_id, target_qty: string, actual_qty: string }
  const [ffeRows, setFfeRows] = useState([]);
  const [fieldDays, setFieldDays] = useState(null);
  const [apRows, setApRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnText, setReturnText] = useState("");
  const [quarterBonus, setQuarterBonus] = useState(null);

  const load = useCallback(async () => {
    const d = await api.getReport(reportId);
    setDetail(d);
    setFssRows(d.fss.items.map((i) => ({ product_id: i.product_id, target_qty: toInputStr(i.target_qty), actual_qty: toInputStr(i.actual_qty) })));
    setFfeRows(d.ffe.items.map((i) => ({
      metric_key: i.metric_key,
      master_list_count: toInputStr(i.master_list_count), approved_count: toInputStr(i.approved_count), achieved_count: toInputStr(i.achieved_count),
    })));
    setFieldDays(d.field_days ? Object.fromEntries(Object.entries(d.field_days).map(([k, v]) => [k, typeof v === "number" ? toInputStr(v) : v])) : null);
    setApRows(d.action_plan.map((a) => ({ ...a })));
    const quarter = Math.floor((d.report.period_month - 1) / 3) + 1;
    api.mpBonus(d.report.mp_id, d.report.period_year, quarter).then(setQuarterBonus).catch(() => setQuarterBonus(null));
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  if (!detail) return <div className="p-8">Загрузка…</div>;

  const { report, mp, fss, ffe, comments } = detail;
  const editable = user.role === "mp" && ["draft", "returned"].includes(report.status);
  const canReview = user.role === "rm" && report.status === "submitted";
  const canComment = (user.role === "rm" || user.role === "master") && ["submitted", "approved"].includes(report.status);
  const canToggleGate = user.role === "rm" || user.role === "master";
  const st = STATUS_LABEL[report.status];

  async function saveFss() {
    setBusy(true); setError("");
    try {
      await api.saveFss(reportId, fssRows.map((r) => ({ product_id: r.product_id, target_qty: toNum(r.target_qty), actual_qty: toNum(r.actual_qty) })));
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function saveFfe() {
    setBusy(true); setError("");
    try {
      await api.saveFfe(
        reportId,
        ffeRows.map((r) => ({ metric_key: r.metric_key, master_list_count: toNum(r.master_list_count), approved_count: toNum(r.approved_count), achieved_count: toNum(r.achieved_count) })),
        fieldDays ? Object.fromEntries(Object.entries(fieldDays).map(([k, v]) => [k, toNum(v)])) : null
      );
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
  async function toggleNonReimb() {
    setBusy(true); setError("");
    try { await api.saveSettings(reportId, { non_reimbursement_ok: !report.non_reimbursement_ok }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-6 sm:py-8">
      <button onClick={onBack} className="text-sm mb-4" style={{ color: "#8493AA" }}>← Назад к списку</button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pb-6 border-b" style={{ borderColor: "#22304A" }}>
        <div>
          <div className="font-display text-xl sm:text-2xl font-semibold">{mp.full_name}</div>
          <div className="text-sm" style={{ color: "#8493AA" }}>{mp.territory || "—"} · {report.period_month}/{report.period_year}</div>
          <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full font-semibold" style={{ background: st.color + "22", color: st.color }}>{st.label}</span>
        </div>
        <div className="flex flex-col items-center">
          <Gauge achievement={fss.achievement} size={140} />
          <div className="text-xs mt-1" style={{ color: "#8493AA" }}>За месяц (справочно): <b style={{ color: "#E8B04B" }}>{Math.round(fss.bonus_uzs).toLocaleString()} UZS</b></div>
        </div>
      </div>

      {error && <div className="text-sm mb-4 px-3 py-2 rounded" style={{ background: "#E2574C22", color: "#E2574C" }}>{error}</div>}

      {/* Tabs — horizontally scrollable on mobile instead of overflowing */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: "thin" }}>
        {[["fss", "FSS"], ["ffe", "FFE"], ["plan", "Action Plan"], ["bonus", "Бонус"], ["comments", "История"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-4 py-2 rounded-lg text-sm font-medium shrink-0"
            style={{ background: tab === k ? "#E8B04B" : "#141F33", color: tab === k ? "#0E1726" : "#C9D2E0", border: "1px solid #22304A" }}>
            {label}
          </button>
        ))}
      </div>

      {/* FSS TAB */}
      {tab === "fss" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          {/* Desktop/tablet table */}
          <table className="w-full text-sm hidden md:table">
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
                        <NumField value={fssRows[idx]?.target_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, target_qty: v } : row))}
                          className="w-20 border-b text-right font-mono px-1" style={inputStyle()} />
                      ) : <span className="font-mono">{item.target_qty}</span>}
                    </td>
                    <td className="text-right px-2">
                      {editable ? (
                        <NumField value={fssRows[idx]?.actual_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, actual_qty: v } : row))}
                          className="w-20 border-b text-right font-mono px-1" style={inputStyle("#E8B04B")} />
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

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {fss.items.map((item, idx) => (
              <div key={item.product_id} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium" style={{ color: "#C9D2E0" }}>{item.product_name}</div>
                  <div className="text-xs font-mono shrink-0 ml-2" style={{ color: "#8493AA" }}>${Number(item.nrv_usd).toFixed(2)}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>План, уп.</div>
                    {editable ? (
                      <NumField value={fssRows[idx]?.target_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, target_qty: v } : row))}
                        className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle()} />
                    ) : <div className="font-mono text-sm">{item.target_qty}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>Факт, уп.</div>
                    {editable ? (
                      <NumField value={fssRows[idx]?.actual_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, actual_qty: v } : row))}
                        className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle("#E8B04B")} />
                    ) : <div className="font-mono text-sm" style={{ color: "#E8B04B" }}>{item.actual_qty}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>Дост.</div>
                    <div className="font-mono text-sm py-1.5">{item.target_usd ? `${((item.actual_usd / item.target_usd) * 100).toFixed(0)}%` : "—"}</div>
                  </div>
                </div>
                <RowComments comments={comments} section="fss" itemRef={item.product_id} canComment={canComment}
                  onAdd={(t) => addComment("fss", item.product_id, t)} />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-between gap-2 mt-4 text-sm font-mono">
            <span>План: ${Math.round(fss.target_usd).toLocaleString()} · Факт: ${Math.round(fss.actual_usd).toLocaleString()}</span>
            <span style={{ color: "#E8B04B" }}>{fss.tier_label}</span>
          </div>
          {editable && <button onClick={saveFss} disabled={busy} className="mt-4 px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить FSS</button>}
        </div>
      )}

      {/* FFE TAB */}
      {tab === "ffe" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="text-lg font-display">FFE score: <b style={{ color: ffe.score >= 0.85 ? "#3FB88F" : "#E2574C" }}>{(ffe.score * 100).toFixed(1)}%</b></div>
            <div className="text-xs" style={{ color: "#8493AA" }}>минимум для допуска к бонусу — 85%</div>
          </div>

          <table className="w-full text-sm hidden md:table">
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
                          <NumField value={ffeRows[idx]?.[field] ?? ""} onChange={(v) => setFfeRows((r) => r.map((row, i) => i === idx ? { ...row, [field]: v } : row))}
                            className="w-16 border-b text-right font-mono px-1" style={inputStyle(field === "achieved_count" ? "#E8B04B" : "#8493AA")} />
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

          <div className="md:hidden space-y-2">
            {ffe.items.map((item, idx) => (
              <div key={item.metric_key} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm font-medium" style={{ color: "#C9D2E0" }}>{item.label}</div>
                  <div className="font-mono text-sm shrink-0 ml-2" style={{ color: item.percent >= 0.85 ? "#3FB88F" : "#E2574C" }}>{(item.percent * 100).toFixed(0)}%</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["master_list_count", "База"], ["approved_count", "Утв."], ["achieved_count", "Дост."]].map(([field, label]) => (
                    <div key={field}>
                      <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>{label}</div>
                      {editable ? (
                        <NumField value={ffeRows[idx]?.[field] ?? ""} onChange={(v) => setFfeRows((r) => r.map((row, i) => i === idx ? { ...row, [field]: v } : row))}
                          className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle(field === "achieved_count" ? "#E8B04B" : "#8493AA")} />
                      ) : <div className="font-mono text-sm">{item[field]}</div>}
                    </div>
                  ))}
                </div>
                <RowComments comments={comments} section="ffe" itemRef={item.id} canComment={canComment}
                  onAdd={(t) => addComment("ffe", item.id, t)} />
              </div>
            ))}
          </div>

          {fieldDays && (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
              {[["total_days", "Дней в месяце"], ["non_working_days", "Выходные"], ["public_holidays", "Праздники"], ["training_days", "Тренинги"], ["leave_days", "Отпуск/б.лист"], ["field_days", "Дней в поле"]].map(([k, label]) => (
                <div key={k}>
                  <div style={{ color: "#8493AA" }} className="mb-1">{label}</div>
                  {editable ? (
                    <NumField value={fieldDays[k] ?? ""} onChange={(v) => setFieldDays((f) => ({ ...f, [k]: v }))}
                      className="w-full border rounded px-2 py-1 font-mono" style={inputStyle()} />
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
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          {apRows.map((row, idx) => (
            <div key={idx} className="rounded-xl p-3 mb-3" style={{ background: "#1B2A44" }}>
              <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                {[["product_name", "Препарат"], ["goal", "Цель"], ["action_text", "План действий"]].map(([field, label]) => (
                  <div key={field} className={field === "action_text" ? "sm:col-span-2 md:col-span-2" : ""}>
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
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setApRows((r) => [...r, { product_name: "", goal: "", action_text: "", control_date: "", completion_date: "" }])}
                className="px-3 py-2 rounded text-sm" style={{ background: "#22304A" }}>+ добавить пункт</button>
              <button onClick={saveActionPlan} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить Action Plan</button>
            </div>
          )}
        </div>
      )}

      {/* BONUS TAB — full quarterly breakdown, exactly per policy */}
      {tab === "bonus" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="font-display text-lg mb-1">Квартальный бонус (Q{Math.floor((report.period_month - 1) / 3) + 1}, {report.period_year})</div>
          <div className="text-xs mb-4" style={{ color: "#8493AA" }}>Бонус в политике считается по кварталу (3 месяца), а не по одному отчёту — здесь агрегация всех трёх.</div>
          {!quarterBonus ? <div className="text-sm" style={{ color: "#8493AA" }}>Загрузка…</div> : (
            <>
              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                {quarterBonus.monthly.map((m) => (
                  <div key={m.month} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Месяц {m.month}</div>
                    {m.found ? (
                      <>
                        <div className="text-xs mb-1" style={{ color: STATUS_LABEL[m.status]?.color }}>{STATUS_LABEL[m.status]?.label}</div>
                        <div className="font-mono text-sm">${Math.round(m.actual_usd).toLocaleString()} / ${Math.round(m.target_usd).toLocaleString()}</div>
                        <div className="text-xs mt-1" style={{ color: "#8493AA" }}>FFE: {(m.ffe_score * 100).toFixed(0)}%</div>
                      </>
                    ) : <div className="text-xs" style={{ color: "#E2574C" }}>Отчёт не создан</div>}
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-sm mb-5">
                <Row label="Достижение плана за квартал" value={`${(quarterBonus.achievement * 100).toFixed(1)}%`} />
                <Row label="Тариф (согласно достижению)" value={quarterBonus.tier_label} />
                <Row label="Расчётный бонус (до гейтов)" value={`${Math.round(quarterBonus.raw_bonus_uzs).toLocaleString()} UZS`} />
                <Row label="Все 3 месяца одобрены РМ" value={quarterBonus.all_months_approved ? "✓ да" : "✗ нет — бонус не начисляется"} ok={quarterBonus.all_months_approved} />
                <Row label="FFE ≥ 85% (среднее за квартал)" value={`${(quarterBonus.ffe_score * 100).toFixed(1)}% ${quarterBonus.ffe_gate_passed ? "✓" : "✗"}`} ok={quarterBonus.ffe_gate_passed} />
                <Row label="≥50% плана — non-reimbursement продукты" value={quarterBonus.non_reimbursement_ok ? "✓ подтверждено" : "✗ не подтверждено"} ok={quarterBonus.non_reimbursement_ok} />
              </div>

              <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: "linear-gradient(90deg,#1B2A44,#141F33)" }}>
                <div className="font-display text-base">ИТОГОВЫЙ бонус за квартал</div>
                <div className="font-mono text-xl font-bold" style={{ color: quarterBonus.bonus_uzs > 0 ? "#E8B04B" : "#E2574C" }}>
                  {Math.round(quarterBonus.bonus_uzs).toLocaleString()} UZS
                </div>
              </div>
              <div className="text-xs mt-3" style={{ color: "#8493AA" }}>
                Также по политике: если 1-й месяц следующего квартала выполнен менее чем на 80%, бонус за текущий квартал аннулируется — платформа отслеживает это автоматически по мере заполнения следующих отчётов.
              </div>
            </>
          )}
          {canToggleGate && (
            <button onClick={toggleNonReimb} disabled={busy} className="mt-4 px-4 py-2 rounded text-sm" style={{ background: "#22304A" }}>
              {report.non_reimbursement_ok ? "Снять подтверждение non-reimbursement (этот месяц)" : "Подтвердить non-reimbursement (этот месяц)"}
            </button>
          )}
        </div>
      )}

      {/* COMMENTS / HISTORY TAB */}
      {tab === "comments" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
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
      <div className="mt-6 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center gap-3" style={{ background: "#1B2A44", border: "1px solid #22304A" }}>
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

function Row({ label, value, ok }) {
  return (
    <div className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: "#1B2A44" }}>
      <span style={{ color: "#8493AA" }}>{label}</span>
      <span className="font-mono" style={{ color: ok === undefined ? "#F5F0E6" : ok ? "#3FB88F" : "#E2574C" }}>{value}</span>
    </div>
  );
}
