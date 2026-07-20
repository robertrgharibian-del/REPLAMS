import React, { useEffect, useState, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
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

// Color tiers per feedback: >=90% green, 80-89.99% yellow, <80% red
function achColor(pct) {
  if (pct >= 0.9) return "#3FB88F";
  if (pct >= 0.8) return "#E8B04B";
  return "#E2574C";
}
function tierLabelClient(a) {
  if (a < 0.9) return "Нет бонуса (<90%)";
  if (a < 1.0) return "60% ставки (90-99.99%)";
  if (a <= 1.25) return "100% ставки (100-124.99%)";
  return "Потолок 125%";
}
function fmtDelta(n, prefix = "") {
  const sign = n > 0 ? "+" : "";
  return `${sign}${prefix}${Math.round(n).toLocaleString()}`;
}
// Read-only display: an unfilled field (0) shows as blank, not "0" — avoids phantom zeros
function dispNum(v) {
  const n = Number(v);
  return n ? n.toLocaleString() : "";
}
function isUnderperforming(item) {
  return item.target_usd > 0 && item.actual_usd / item.target_usd < 0.8;
}

export default function ReportView({ reportId, user, onBack }) {
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("fss");
  const [fssRows, setFssRows] = useState([]); // { product_id, target_qty: string, actual_qty: string }
  const [ffeRows, setFfeRows] = useState([]);
  const [fieldDays, setFieldDays] = useState(null);
  const [apRows, setApRows] = useState([]);
  const [convRows, setConvRows] = useState([]);
  const [potRows, setPotRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnText, setReturnText] = useState("");
  const [quarterBonus, setQuarterBonus] = useState(null);
  const [fssLocked, setFssLocked] = useState(true);
  const [ffeLocked, setFfeLocked] = useState(true);
  const [convLocked, setConvLocked] = useState(true);
  const [potLocked, setPotLocked] = useState(true);

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
    setConvRows(d.conversion.items.map((c) => ({ ...c,
      current_rx_per_week: toInputStr(c.current_rx_per_week), competitor_rx_per_week: toInputStr(c.competitor_rx_per_week), target_rx_per_week: toInputStr(c.target_rx_per_week),
      actual_result_rx_per_week: toInputStr(c.actual_result_rx_per_week) })));
    setPotRows(d.potential.items.map((c) => ({ ...c,
      current_potential_per_week: toInputStr(c.current_potential_per_week), target_rx_per_week: toInputStr(c.target_rx_per_week),
      actual_result_rx_per_week: toInputStr(c.actual_result_rx_per_week) })));
    setFssLocked(d.fss.items.some((i) => Number(i.target_qty) > 0 || Number(i.actual_qty) > 0));
    setFfeLocked(d.ffe.items.some((i) => Number(i.master_list_count) > 0 || Number(i.achieved_count) > 0));
    setConvLocked(d.conversion.items.length > 0);
    setPotLocked(d.potential.items.length > 0);
    const quarter = Math.floor((d.report.period_month - 1) / 3) + 1;
    api.mpBonus(d.report.mp_id, d.report.period_year, quarter).then(setQuarterBonus).catch(() => setQuarterBonus(null));
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const fssItemsSafe = detail?.fss?.items || [];
  const ffeItemsSafe = detail?.ffe?.items || [];
  const editableSafe = detail ? user.role === "mp" && ["draft", "returned"].includes(detail.report.status) : false;
  const fssEditable = editableSafe && !fssLocked;
  const ffeEditable = editableSafe && !ffeLocked;

  const liveFssItems = useMemo(() => fssItemsSafe.map((item, idx) => {
    const nrv = Number(item.nrv_usd);
    const t = fssEditable ? toNum(fssRows[idx]?.target_qty) : Number(item.target_qty);
    const a = fssEditable ? toNum(fssRows[idx]?.actual_qty) : Number(item.actual_qty);
    return { ...item, target_qty: t, actual_qty: a, target_usd: t * nrv, actual_usd: a * nrv };
  }), [fssItemsSafe, fssRows, fssEditable]);
  const liveFssTotals = useMemo(() => {
    const target_usd = liveFssItems.reduce((s, i) => s + i.target_usd, 0);
    const actual_usd = liveFssItems.reduce((s, i) => s + i.actual_usd, 0);
    return { target_usd, actual_usd, achievement: target_usd === 0 ? 0 : actual_usd / target_usd };
  }, [liveFssItems]);
  const liveFfeItems = useMemo(() => ffeItemsSafe.map((item, idx) => {
    const master_list_count = ffeEditable ? toNum(ffeRows[idx]?.master_list_count) : Number(item.master_list_count);
    const approved_count = ffeEditable ? toNum(ffeRows[idx]?.approved_count) : Number(item.approved_count);
    const achieved_count = ffeEditable ? toNum(ffeRows[idx]?.achieved_count) : Number(item.achieved_count);
    const denom = approved_count > 0 ? approved_count : master_list_count;
    const percent = denom > 0 ? achieved_count / denom : 0;
    return { ...item, master_list_count, approved_count, achieved_count, percent };
  }), [ffeItemsSafe, ffeRows, ffeEditable]);

  if (!detail) return <div className="p-8">Загрузка…</div>;

  const { report, mp, fss, ffe, comments } = detail;
  const editable = editableSafe;
  const convEditable = editable && !convLocked;
  const potEditable = editable && !potLocked;
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
  async function saveConversion() {
    setBusy(true); setError("");
    try {
      await api.saveConversion(reportId, convRows.map((r) => ({ ...r, current_rx_per_week: toNum(r.current_rx_per_week), competitor_rx_per_week: toNum(r.competitor_rx_per_week), target_rx_per_week: toNum(r.target_rx_per_week), actual_result_rx_per_week: r.actual_result_rx_per_week === "" ? null : toNum(r.actual_result_rx_per_week) })));
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function savePotential() {
    setBusy(true); setError("");
    try {
      await api.savePotential(reportId, potRows.map((r) => ({ ...r, current_potential_per_week: toNum(r.current_potential_per_week), target_rx_per_week: toNum(r.target_rx_per_week), actual_result_rx_per_week: r.actual_result_rx_per_week === "" ? null : toNum(r.actual_result_rx_per_week) })));
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
        {[["fss", "FSS"], ["ffe", "FFE"], ["conversion", "Конверсия"], ["potential", "Увеличение потенциала"], ["bonus", "Бонус"], ["comments", "История"]].map(([k, label]) => (
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
          <div className="flex justify-end mb-2">
            {fssLocked ? (
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: "#3FB88F" }}>✓ Сохранено</span>
                {editable && <button onClick={() => setFssLocked(false)} className="px-3 py-1 rounded text-xs" style={{ background: "#22304A" }}>Изменить</button>}
              </div>
            ) : null}
          </div>
          {/* Desktop/tablet table */}
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                <th className="text-left py-1">Препарат</th>
                <th className="text-right py-1 px-2">NRV $</th>
                <th className="text-right py-1 px-2">План, уп.</th>
                <th className="text-right py-1 px-2">Факт, уп.</th>
                <th className="text-right py-1 px-2">Δ, уп.</th>
                <th className="text-right py-1 px-2">Δ, $</th>
                <th className="text-right py-1">Дост.</th>
              </tr>
            </thead>
            <tbody>
              {liveFssItems.map((item, idx) => (
                <React.Fragment key={item.product_id}>
                  <tr style={{ borderTop: "1px solid #22304A" }}>
                    <td className="py-1.5" style={{ color: "#C9D2E0" }}>{item.product_name}</td>
                    <td className="text-right px-2 font-mono" style={{ color: "#8493AA" }}>{Number(item.nrv_usd).toFixed(2)}</td>
                    <td className="text-right px-2">
                      {fssEditable ? (
                        <NumField value={fssRows[idx]?.target_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, target_qty: v } : row))}
                          className="w-20 border-b text-right font-mono px-1" style={inputStyle()} />
                      ) : <span className="font-mono">{dispNum(item.target_qty)}</span>}
                    </td>
                    <td className="text-right px-2">
                      {fssEditable ? (
                        <NumField value={fssRows[idx]?.actual_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, actual_qty: v } : row))}
                          className="w-20 border-b text-right font-mono px-1" style={inputStyle("#E8B04B")} />
                      ) : <span className="font-mono" style={{ color: "#E8B04B" }}>{dispNum(item.actual_qty)}</span>}
                    </td>
                    <td className="text-right px-2 font-mono" style={{ color: item.target_usd ? (item.actual_qty - item.target_qty >= 0 ? "#3FB88F" : "#E2574C") : "#4A5A76" }}>
                      {item.target_usd ? fmtDelta(item.actual_qty - item.target_qty) : "—"}
                    </td>
                    <td className="text-right px-2 font-mono" style={{ color: item.target_usd ? (item.actual_usd - item.target_usd >= 0 ? "#3FB88F" : "#E2574C") : "#4A5A76" }}>
                      {item.target_usd ? fmtDelta(item.actual_usd - item.target_usd, "$") : "—"}
                    </td>
                    <td className="text-right font-mono" style={{ color: item.target_usd ? achColor(item.actual_usd / item.target_usd) : "#8493AA" }}>
                      {item.target_usd ? `${((item.actual_usd / item.target_usd) * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                  {!fssEditable && (
                    <tr><td colSpan={7}>
                      {isUnderperforming(item) && user.role === "mp" && (
                        <div className="text-xs mt-1" style={{ color: "#E2574C" }}>Бренд не выполнен — укажите причину ниже</div>
                      )}
                      <RowComments comments={comments} section="fss" itemRef={item.product_id} canComment={canComment || (user.role === "mp" && isUnderperforming(item))}
                        onAdd={(t) => addComment("fss", item.product_id, t)} />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {liveFssItems.map((item, idx) => (
              <div key={item.product_id} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium" style={{ color: "#C9D2E0" }}>{item.product_name}</div>
                  <div className="text-xs font-mono shrink-0 ml-2" style={{ color: "#8493AA" }}>${Number(item.nrv_usd).toFixed(2)}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>План, уп.</div>
                    {fssEditable ? (
                      <NumField value={fssRows[idx]?.target_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, target_qty: v } : row))}
                        className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle()} />
                    ) : <div className="font-mono text-sm">{dispNum(item.target_qty)}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>Факт, уп.</div>
                    {fssEditable ? (
                      <NumField value={fssRows[idx]?.actual_qty ?? ""} onChange={(v) => setFssRows((r) => r.map((row, i) => i === idx ? { ...row, actual_qty: v } : row))}
                        className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle("#E8B04B")} />
                    ) : <div className="font-mono text-sm" style={{ color: "#E8B04B" }}>{dispNum(item.actual_qty)}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>Дост.</div>
                    <div className="font-mono text-sm py-1.5" style={{ color: item.target_usd ? achColor(item.actual_usd / item.target_usd) : "#8493AA" }}>
                      {item.target_usd ? `${((item.actual_usd / item.target_usd) * 100).toFixed(0)}%` : "—"}
                    </div>
                  </div>
                </div>
                {item.target_usd > 0 && (
                  <div className="text-xs font-mono mt-1 flex gap-3" style={{ color: item.actual_usd - item.target_usd >= 0 ? "#3FB88F" : "#E2574C" }}>
                    <span>Δ уп.: {fmtDelta(item.actual_qty - item.target_qty)}</span>
                    <span>Δ $: {fmtDelta(item.actual_usd - item.target_usd, "$")}</span>
                  </div>
                )}
                {!fssEditable && (
                  <>
                    {isUnderperforming(item) && user.role === "mp" && (
                      <div className="text-xs mt-1" style={{ color: "#E2574C" }}>Бренд не выполнен — укажите причину ниже</div>
                    )}
                    <RowComments comments={comments} section="fss" itemRef={item.product_id} canComment={canComment || (user.role === "mp" && isUnderperforming(item))}
                      onAdd={(t) => addComment("fss", item.product_id, t)} />
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2" style={{ background: "linear-gradient(90deg,#1B2A44,#141F33)" }}>
            <div>
              <div className="text-xs uppercase" style={{ color: "#8493AA" }}>Общее достижение, $</div>
              <div className="font-mono text-lg font-bold" style={{ color: achColor(liveFssTotals.achievement) }}>
                ${Math.round(liveFssTotals.actual_usd).toLocaleString()} / ${Math.round(liveFssTotals.target_usd).toLocaleString()} · {(liveFssTotals.achievement * 100).toFixed(1)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase" style={{ color: "#8493AA" }}>Тариф</div>
              <div className="text-sm" style={{ color: "#E8B04B" }}>{tierLabelClient(liveFssTotals.achievement)}</div>
            </div>
          </div>

          {liveFssTotals.target_usd + liveFssTotals.actual_usd > 0 && (
            <div className="mt-4 rounded-xl p-3" style={{ background: "#1B2A44" }}>
              <div className="text-xs uppercase mb-2" style={{ color: "#8493AA" }}>План vs Факт по препаратам, $</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={liveFssItems.filter((i) => i.target_usd > 0 || i.actual_usd > 0).map((i) => ({ name: i.product_name.split(" ").slice(0, 2).join(" "), План: Math.round(i.target_usd), Факт: Math.round(i.actual_usd) }))}
                  margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22304A" vertical={false} />
                  <XAxis dataKey="name" stroke="#8493AA" fontSize={10} angle={-35} textAnchor="end" interval={0} />
                  <YAxis stroke="#8493AA" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0E1726", border: "1px solid #3A4A66", borderRadius: 8, color: "#F5F0E6" }} />
                  <Legend />
                  <Bar dataKey="План" fill="#3A4A66" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Факт" fill="#E8B04B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {fssEditable && <button onClick={async () => { await saveFss(); setFssLocked(true); }} disabled={busy} className="mt-4 px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить FSS</button>}
        </div>
      )}

      {/* FFE TAB */}
      {tab === "ffe" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-display">FFE score: <b style={{ color: ffe.score >= 0.85 ? "#3FB88F" : "#E2574C" }}>{(ffe.score * 100).toFixed(1)}%</b></div>
              <div className="text-xs" style={{ color: "#8493AA" }}>минимум для допуска к бонусу — 85%</div>
            </div>
            {ffeLocked && (
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: "#3FB88F" }}>✓ Сохранено</span>
                {editable && <button onClick={() => setFfeLocked(false)} className="px-3 py-1 rounded text-xs" style={{ background: "#22304A" }}>Изменить</button>}
              </div>
            )}
          </div>

          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                <th className="text-left py-1">Метрика</th>
                <th className="text-right px-2">В мастер-листе</th>
                <th className="text-right px-2">Утверждено</th>
                <th className="text-right px-2">Достигнуто</th>
                <th className="text-right px-2">Δ</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {liveFfeItems.map((item, idx) => {
                const denom = item.approved_count > 0 ? item.approved_count : item.master_list_count;
                const delta = item.achieved_count - denom;
                return (
                <React.Fragment key={item.metric_key}>
                  <tr style={{ borderTop: "1px solid #22304A" }}>
                    <td className="py-1.5" style={{ color: "#C9D2E0" }}>{item.label}</td>
                    {["master_list_count", "approved_count", "achieved_count"].map((field) => (
                      <td key={field} className="text-right px-2">
                        {ffeEditable ? (
                          <NumField value={ffeRows[idx]?.[field] ?? ""} onChange={(v) => setFfeRows((r) => r.map((row, i) => i === idx ? { ...row, [field]: v } : row))}
                            className="w-16 border-b text-right font-mono px-1" style={inputStyle(field === "achieved_count" ? "#E8B04B" : "#8493AA")} />
                        ) : <span className="font-mono">{dispNum(item[field])}</span>}
                      </td>
                    ))}
                    <td className="text-right px-2 font-mono" style={{ color: denom > 0 ? (delta >= 0 ? "#3FB88F" : "#E2574C") : "#4A5A76" }}>{denom > 0 ? fmtDelta(delta) : "—"}</td>
                    <td className="text-right font-mono" style={{ color: denom > 0 ? achColor(item.percent) : "#8493AA" }}>{denom > 0 ? `${(item.percent * 100).toFixed(0)}%` : "—"}</td>
                  </tr>
                  {!ffeEditable && (
                    <tr><td colSpan={6}><RowComments comments={comments} section="ffe" itemRef={item.id} canComment={canComment}
                      onAdd={(t) => addComment("ffe", item.id, t)} /></td></tr>
                  )}
                </React.Fragment>
              );})}
            </tbody>
          </table>

          <div className="md:hidden space-y-2">
            {liveFfeItems.map((item, idx) => {
              const denom = item.approved_count > 0 ? item.approved_count : item.master_list_count;
              const delta = item.achieved_count - denom;
              return (
              <div key={item.metric_key} className="rounded-xl p-3" style={{ background: "#1B2A44" }}>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm font-medium" style={{ color: "#C9D2E0" }}>{item.label}</div>
                  <div className="font-mono text-sm shrink-0 ml-2" style={{ color: denom > 0 ? achColor(item.percent) : "#8493AA" }}>{denom > 0 ? `${(item.percent * 100).toFixed(0)}%` : "—"}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["master_list_count", "База"], ["approved_count", "Утв."], ["achieved_count", "Дост."]].map(([field, label]) => (
                    <div key={field}>
                      <div className="text-[10px] uppercase mb-1" style={{ color: "#8493AA" }}>{label}</div>
                      {ffeEditable ? (
                        <NumField value={ffeRows[idx]?.[field] ?? ""} onChange={(v) => setFfeRows((r) => r.map((row, i) => i === idx ? { ...row, [field]: v } : row))}
                          className="w-full border rounded px-2 py-1.5 font-mono text-sm" style={inputStyle(field === "achieved_count" ? "#E8B04B" : "#8493AA")} />
                      ) : <div className="font-mono text-sm">{dispNum(item[field])}</div>}
                    </div>
                  ))}
                </div>
                {denom > 0 && (
                  <div className="text-xs font-mono mt-1" style={{ color: delta >= 0 ? "#3FB88F" : "#E2574C" }}>Δ {fmtDelta(delta)}</div>
                )}
                {!ffeEditable && (
                  <RowComments comments={comments} section="ffe" itemRef={item.id} canComment={canComment}
                    onAdd={(t) => addComment("ffe", item.id, t)} />
                )}
              </div>
            );})}
          </div>

          {fieldDays && (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
              {[["total_days", "Дней в месяце"], ["non_working_days", "Выходные"], ["public_holidays", "Праздники"], ["training_days", "Тренинги"], ["leave_days", "Отпуск/б.лист"], ["field_days", "Дней в поле"]].map(([k, label]) => (
                <div key={k}>
                  <div style={{ color: "#8493AA" }} className="mb-1">{label}</div>
                  {ffeEditable ? (
                    <NumField value={fieldDays[k] ?? ""} onChange={(v) => setFieldDays((f) => ({ ...f, [k]: v }))}
                      className="w-full border rounded px-2 py-1 font-mono" style={inputStyle()} />
                  ) : <div className="font-mono">{dispNum(fieldDays[k])}</div>}
                </div>
              ))}
            </div>
          )}
          {liveFfeItems.some((i) => (i.approved_count > 0 || i.master_list_count > 0)) && (
            <div className="mt-5 rounded-xl p-3" style={{ background: "#1B2A44" }}>
              <div className="text-xs uppercase mb-2" style={{ color: "#8493AA" }}>FFE — профиль по метрикам</div>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={liveFfeItems.map((i) => ({ metric: i.label.replace(" — ", " "), pct: Math.round(i.percent * 100) }))}>
                  <PolarGrid stroke="#3A4A66" />
                  <PolarAngleAxis dataKey="metric" stroke="#8493AA" fontSize={9} />
                  <PolarRadiusAxis domain={[0, 100]} stroke="#3A4A66" fontSize={9} />
                  <Radar dataKey="pct" stroke="#E8B04B" fill="#E8B04B" fillOpacity={0.35} />
                  <Tooltip contentStyle={{ background: "#0E1726", border: "1px solid #3A4A66", borderRadius: 8, color: "#F5F0E6" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
          {ffeEditable && <button onClick={async () => { await saveFfe(); setFfeLocked(true); }} disabled={busy} className="mt-4 px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить FFE</button>}
        </div>
      )}

      {/* CONVERSION TAB */}
      {tab === "conversion" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="font-display text-lg">Конверсия врачей</div>
            {convLocked && (
              <div className="flex items-center gap-2 text-sm shrink-0">
                <span style={{ color: "#3FB88F" }}>✓ Сохранено</span>
                {editable && <button onClick={() => setConvLocked(false)} className="px-3 py-1 rounded text-xs" style={{ background: "#22304A" }}>Изменить</button>}
              </div>
            )}
          </div>
          <div className="text-xs mb-4" style={{ color: "#8493AA" }}>Врачи, которых МП планирует конвертировать с конкурентов в этом месяце</div>

          {convRows.map((row, idx) => (
            <div key={idx} className="rounded-xl p-3 mb-3" style={{ background: "#1B2A44" }}>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Препарат</div>
                  {convEditable ? (
                    <select value={row.product_id || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, product_id: Number(e.target.value) } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }}>
                      <option value="" style={{ color: "#000" }}>— выбрать —</option>
                      {fss.items.map((p) => <option key={p.product_id} value={p.product_id} style={{ color: "#000" }}>{p.product_name}</option>)}
                    </select>
                  ) : <div>{row.product_name}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Врач (ФИО)</div>
                  {convEditable ? (
                    <input value={row.doctor_name || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, doctor_name: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} />
                  ) : <div>{row.doctor_name}</div>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Специальность врача</div>
                  {convEditable ? (
                    <input value={row.doctor_specialty || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, doctor_specialty: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} placeholder="Кардиолог, терапевт…" />
                  ) : <div>{row.doctor_specialty || "—"}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>ЛПУ (мед. учреждение)</div>
                  {convEditable ? (
                    <input value={row.lpu_name || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, lpu_name: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} />
                  ) : <div>{row.lpu_name || "—"}</div>}
                </div>
              </div>
              {row.previous_target_rx_per_week !== null && row.previous_target_rx_per_week !== undefined && (
                <div className="grid grid-cols-2 gap-2 text-sm mb-2 rounded-lg p-2" style={{ background: "#0E1726" }}>
                  <div>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>План прошлого месяца (зафиксирован)</div>
                    <div className="font-mono" style={{ color: "#8493AA" }}>{row.previous_target_rx_per_week} Rx/нед</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Факт достигнуто в этом месяце</div>
                    {convEditable ? <NumField value={row.actual_result_rx_per_week} onChange={(v) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, actual_result_rx_per_week: v } : x))}
                      className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle()} />
                      : <div className="font-mono">{dispNum(row.actual_result_rx_per_week)}</div>}
                    {row.actual_result_rx_per_week !== "" && row.actual_result_rx_per_week != null && (
                      <div className="text-xs mt-1" style={{ color: toNum(row.actual_result_rx_per_week) >= row.previous_target_rx_per_week ? "#3FB88F" : "#E2574C" }}>
                        {toNum(row.actual_result_rx_per_week) >= row.previous_target_rx_per_week ? "✓ план выполнен" : "✗ план не выполнен"}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Наш преп., Rx/нед</div>
                  {convEditable ? <NumField value={row.current_rx_per_week} onChange={(v) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, current_rx_per_week: v } : x))}
                    className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle()} /> : <div className="font-mono">{dispNum(row.current_rx_per_week)}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Конкуренты, Rx/нед</div>
                  {convEditable ? <NumField value={row.competitor_rx_per_week} onChange={(v) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, competitor_rx_per_week: v } : x))}
                    className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle()} /> : <div className="font-mono">{dispNum(row.competitor_rx_per_week)}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Цель к концу месяца, Rx/нед</div>
                  {convEditable ? <NumField value={row.target_rx_per_week} onChange={(v) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, target_rx_per_week: v } : x))}
                    className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle("#E8B04B")} /> : <div className="font-mono" style={{ color: "#E8B04B" }}>{dispNum(row.target_rx_per_week)}</div>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Почему выписывает конкурентов</div>
                  {convEditable ? <textarea rows={2} value={row.competitor_reason || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, competitor_reason: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.competitor_reason}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>План действий МП (визит, активности)</div>
                  {convEditable ? <textarea rows={2} value={row.mp_action_plan || ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, mp_action_plan: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.mp_action_plan}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Дата начала активности</div>
                  {convEditable ? <input type="date" value={row.start_date ? String(row.start_date).slice(0, 10) : ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, start_date: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.start_date ? String(row.start_date).slice(0, 10) : "—"}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Дата контроля с РМ</div>
                  {convEditable ? <input type="date" value={row.control_date ? String(row.control_date).slice(0, 10) : ""} onChange={(e) => setConvRows((r) => r.map((x, i) => i === idx ? { ...x, control_date: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.control_date ? String(row.control_date).slice(0, 10) : "—"}</div>}
                </div>
              </div>
              {convEditable && <button onClick={() => setConvRows((r) => r.filter((_, i) => i !== idx))} className="text-xs mt-2" style={{ color: "#E2574C" }}>Удалить врача</button>}
            </div>
          ))}

          {convEditable && (
            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={() => setConvRows((r) => [...r, { product_id: "", doctor_name: "", doctor_specialty: "", lpu_name: "", current_rx_per_week: "", competitor_rx_per_week: "", competitor_reason: "", mp_action_plan: "", target_rx_per_week: "", start_date: "", control_date: "" }])}
                className="px-3 py-2 rounded text-sm" style={{ background: "#22304A" }}>+ добавить врача</button>
              <button onClick={async () => { await saveConversion(); setConvLocked(true); }} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить Конверсию</button>
            </div>
          )}

          {detail.conversion.summary.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: "#C9D2E0" }}>Прогноз по брендам: база + конверсия</div>
              <table className="w-full text-sm">
                <thead><tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                  <th className="text-left py-1">Препарат</th><th className="text-right px-2">База, $</th><th className="text-right px-2">+ Конверсия, $</th><th className="text-right">Итого, $</th>
                </tr></thead>
                <tbody>
                  {detail.conversion.summary.map((s) => (
                    <tr key={s.product_id} style={{ borderTop: "1px solid #22304A" }}>
                      <td className="py-1.5">{s.product_name}</td>
                      <td className="text-right px-2 font-mono">{Math.round(s.base_usd).toLocaleString()}</td>
                      <td className="text-right px-2 font-mono" style={{ color: "#3FB88F" }}>+{Math.round(s.additional_usd).toLocaleString()}</td>
                      <td className="text-right font-mono font-semibold">{Math.round(s.total_usd).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={detail.conversion.summary.map((s) => ({ name: s.product_name.split(" ").slice(0, 2).join(" "), База: Math.round(s.base_usd), Конверсия: Math.round(s.additional_usd) }))}
                  margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22304A" vertical={false} />
                  <XAxis dataKey="name" stroke="#8493AA" fontSize={10} angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#8493AA" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0E1726", border: "1px solid #3A4A66", borderRadius: 8, color: "#F5F0E6" }} />
                  <Legend />
                  <Bar dataKey="База" stackId="a" fill="#3A4A66" />
                  <Bar dataKey="Конверсия" stackId="a" fill="#3FB88F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* POTENTIAL TAB */}
      {tab === "potential" && (
        <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="font-display text-lg">Увеличение потенциала</div>
            {potLocked && (
              <div className="flex items-center gap-2 text-sm shrink-0">
                <span style={{ color: "#3FB88F" }}>✓ Сохранено</span>
                {editable && <button onClick={() => setPotLocked(false)} className="px-3 py-1 rounded text-xs" style={{ background: "#22304A" }}>Изменить</button>}
              </div>
            )}
          </div>
          <div className="text-xs mb-4" style={{ color: "#8493AA" }}>Врачи, у которых МП планирует увеличить потенциал назначений в этом месяце</div>

          {potRows.map((row, idx) => (
            <div key={idx} className="rounded-xl p-3 mb-3" style={{ background: "#1B2A44" }}>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Препарат</div>
                  {potEditable ? (
                    <select value={row.product_id || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, product_id: Number(e.target.value) } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }}>
                      <option value="" style={{ color: "#000" }}>— выбрать —</option>
                      {fss.items.map((p) => <option key={p.product_id} value={p.product_id} style={{ color: "#000" }}>{p.product_name}</option>)}
                    </select>
                  ) : <div>{row.product_name}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Врач (ФИО)</div>
                  {potEditable ? (
                    <input value={row.doctor_name || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, doctor_name: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} />
                  ) : <div>{row.doctor_name}</div>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Специальность врача</div>
                  {potEditable ? (
                    <input value={row.doctor_specialty || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, doctor_specialty: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} placeholder="Кардиолог, терапевт…" />
                  ) : <div>{row.doctor_specialty || "—"}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>ЛПУ (мед. учреждение)</div>
                  {potEditable ? (
                    <input value={row.lpu_name || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, lpu_name: e.target.value } : x))}
                      className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} />
                  ) : <div>{row.lpu_name || "—"}</div>}
                </div>
              </div>
              {row.previous_target_rx_per_week !== null && row.previous_target_rx_per_week !== undefined && (
                <div className="grid grid-cols-2 gap-2 text-sm mb-2 rounded-lg p-2" style={{ background: "#0E1726" }}>
                  <div>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>План прошлого месяца (зафиксирован)</div>
                    <div className="font-mono" style={{ color: "#8493AA" }}>{row.previous_target_rx_per_week} Rx/нед</div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Факт достигнуто в этом месяце</div>
                    {potEditable ? <NumField value={row.actual_result_rx_per_week} onChange={(v) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, actual_result_rx_per_week: v } : x))}
                      className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle()} />
                      : <div className="font-mono">{dispNum(row.actual_result_rx_per_week)}</div>}
                    {row.actual_result_rx_per_week !== "" && row.actual_result_rx_per_week != null && (
                      <div className="text-xs mt-1" style={{ color: toNum(row.actual_result_rx_per_week) >= row.previous_target_rx_per_week ? "#3FB88F" : "#E2574C" }}>
                        {toNum(row.actual_result_rx_per_week) >= row.previous_target_rx_per_week ? "✓ план выполнен" : "✗ план не выполнен"}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Текущий потенциал, Rx/нед</div>
                  {potEditable ? <NumField value={row.current_potential_per_week} onChange={(v) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, current_potential_per_week: v } : x))}
                    className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle()} /> : <div className="font-mono">{dispNum(row.current_potential_per_week)}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Цель к концу месяца, Rx/нед</div>
                  {potEditable ? <NumField value={row.target_rx_per_week} onChange={(v) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, target_rx_per_week: v } : x))}
                    className="w-full border rounded px-2 py-1.5 font-mono" style={inputStyle("#E8B04B")} /> : <div className="font-mono" style={{ color: "#E8B04B" }}>{dispNum(row.target_rx_per_week)}</div>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Почему не лечит больше пациентов</div>
                  {potEditable ? <textarea rows={2} value={row.reason_not_treating || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, reason_not_treating: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.reason_not_treating}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>План действий МП (визит, активности)</div>
                  {potEditable ? <textarea rows={2} value={row.mp_action_plan || ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, mp_action_plan: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.mp_action_plan}</div>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Дата начала активности</div>
                  {potEditable ? <input type="date" value={row.start_date ? String(row.start_date).slice(0, 10) : ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, start_date: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.start_date ? String(row.start_date).slice(0, 10) : "—"}</div>}
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "#8493AA" }}>Дата контроля с РМ</div>
                  {potEditable ? <input type="date" value={row.control_date ? String(row.control_date).slice(0, 10) : ""} onChange={(e) => setPotRows((r) => r.map((x, i) => i === idx ? { ...x, control_date: e.target.value } : x))}
                    className="w-full bg-transparent border rounded px-2 py-1.5" style={{ borderColor: "#3A4A66" }} /> : <div>{row.control_date ? String(row.control_date).slice(0, 10) : "—"}</div>}
                </div>
              </div>
              {potEditable && <button onClick={() => setPotRows((r) => r.filter((_, i) => i !== idx))} className="text-xs mt-2" style={{ color: "#E2574C" }}>Удалить врача</button>}
            </div>
          ))}

          {potEditable && (
            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={() => setPotRows((r) => [...r, { product_id: "", doctor_name: "", doctor_specialty: "", lpu_name: "", current_potential_per_week: "", reason_not_treating: "", mp_action_plan: "", target_rx_per_week: "", start_date: "", control_date: "" }])}
                className="px-3 py-2 rounded text-sm" style={{ background: "#22304A" }}>+ добавить врача</button>
              <button onClick={async () => { await savePotential(); setPotLocked(true); }} disabled={busy} className="px-4 py-2 rounded font-semibold" style={{ background: "#3FB88F", color: "#0E1726" }}>Сохранить Потенциал</button>
            </div>
          )}

          {detail.potential.summary.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2" style={{ color: "#C9D2E0" }}>Прогноз по брендам: база + рост потенциала</div>
              <table className="w-full text-sm">
                <thead><tr style={{ color: "#8493AA", fontSize: 11 }} className="uppercase">
                  <th className="text-left py-1">Препарат</th><th className="text-right px-2">База, $</th><th className="text-right px-2">+ Потенциал, $</th><th className="text-right">Итого, $</th>
                </tr></thead>
                <tbody>
                  {detail.potential.summary.map((s) => (
                    <tr key={s.product_id} style={{ borderTop: "1px solid #22304A" }}>
                      <td className="py-1.5">{s.product_name}</td>
                      <td className="text-right px-2 font-mono">{Math.round(s.base_usd).toLocaleString()}</td>
                      <td className="text-right px-2 font-mono" style={{ color: "#3FB88F" }}>+{Math.round(s.additional_usd).toLocaleString()}</td>
                      <td className="text-right font-mono font-semibold">{Math.round(s.total_usd).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={detail.potential.summary.map((s) => ({ name: s.product_name.split(" ").slice(0, 2).join(" "), База: Math.round(s.base_usd), Потенциал: Math.round(s.additional_usd) }))}
                  margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#22304A" vertical={false} />
                  <XAxis dataKey="name" stroke="#8493AA" fontSize={10} angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#8493AA" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0E1726", border: "1px solid #3A4A66", borderRadius: 8, color: "#F5F0E6" }} />
                  <Legend />
                  <Bar dataKey="База" stackId="a" fill="#3A4A66" />
                  <Bar dataKey="Потенциал" stackId="a" fill="#8B7CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
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
          <div className="mb-6">
            <div className="font-display text-lg mb-3">Трекер отчёта</div>
            {detail.status_log.length === 0 ? (
              <div className="text-sm" style={{ color: "#8493AA" }}>Отчёт ещё не отправлялся</div>
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: "#3A4A66" }} />
                {detail.status_log.map((l) => {
                  const st = STATUS_LABEL[l.to_status] || { label: l.to_status, color: "#8493AA" };
                  return (
                    <div key={l.id} className="relative mb-4">
                      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full" style={{ background: st.color, border: "2px solid #141F33" }} />
                      <div className="text-sm font-semibold" style={{ color: st.color }}>{st.label}</div>
                      <div className="text-xs" style={{ color: "#8493AA" }}>{new Date(l.created_at).toLocaleString("ru-RU")} · {l.actor_name}</div>
                      {l.note && <div className="text-sm mt-1 rounded px-2 py-1" style={{ background: "#1B2A44" }}>«{l.note}»</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
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
