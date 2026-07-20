// Deep AI analysis of sales dynamics (month/quarter/year) — runs entirely
// server-side. Requires ANTHROPIC_API_KEY to be set (see .env.example);
// no end user needs to install or configure anything.

const AI_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";
const aiEnabled = !!process.env.ANTHROPIC_API_KEY;

function quarterOf(month) { return Math.floor((month - 1) / 3) + 1; }

/**
 * Pulls all approved reports for a set of MP ids and returns per-month
 * aggregated totals plus per-MP breakdown, ready to hand to the model as
 * structured context (no raw DB rows).
 */
async function buildAnalyticsContext(pool, { mpIds, label }) {
  if (mpIds.length === 0) return null;

  const reportsRes = await pool.query(
    `select r.id, r.mp_id, r.period_year, r.period_month, r.status, u.full_name as mp_name, u.territory
     from reports r join users u on u.id = r.mp_id
     where r.mp_id = any($1::bigint[]) and r.status = 'approved'
     order by r.period_year, r.period_month`,
    [mpIds]
  );
  const reports = reportsRes.rows;
  if (reports.length === 0) return { label, months: [], note: "Нет одобренных отчётов для анализа" };

  const reportIds = reports.map((r) => r.id);
  const fssRes = await pool.query(
    `select f.report_id, f.target_qty, f.actual_qty, p.name as product_name, p.nrv_usd
     from report_fss f join products p on p.id = f.product_id where f.report_id = any($1::bigint[])`,
    [reportIds]
  );
  const ffeRes = await pool.query(
    `select report_id, metric_key, master_list_count, approved_count, achieved_count
     from report_ffe where report_id = any($1::bigint[])`,
    [reportIds]
  );
  const notesRes = await pool.query(
    `select report_id, comment_text, section, author_role from report_comments
     where report_id = any($1::bigint[]) and section='fss' order by created_at desc limit 60`,
    [reportIds]
  );

  const fssByReport = {};
  for (const row of fssRes.rows) {
    (fssByReport[row.report_id] ||= []).push(row);
  }
  const ffeByReport = {};
  for (const row of ffeRes.rows) {
    (ffeByReport[row.report_id] ||= []).push(row);
  }

  // per-month aggregate (across all mpIds combined) + per-MP monthly totals
  const monthly = {}; // key "YYYY-M" -> { target_usd, actual_usd, ffe_avg, byProduct }
  const perMp = {};   // mp_id -> [{ year, month, target_usd, actual_usd }]

  for (const r of reports) {
    const key = `${r.period_year}-${r.period_month}`;
    const items = fssByReport[r.id] || [];
    let target_usd = 0, actual_usd = 0;
    const byProduct = {};
    for (const it of items) {
      const t = Number(it.target_qty) * Number(it.nrv_usd);
      const a = Number(it.actual_qty) * Number(it.nrv_usd);
      target_usd += t; actual_usd += a;
      byProduct[it.product_name] = (byProduct[it.product_name] || 0) + a;
    }
    const ffeItems = ffeByReport[r.id] || [];
    const ffeScores = ffeItems.map((f) => {
      const denom = f.approved_count > 0 ? f.approved_count : f.master_list_count;
      return denom > 0 ? f.achieved_count / denom : null;
    }).filter((x) => x !== null);
    const ffeAvg = ffeScores.length ? ffeScores.reduce((s, x) => s + x, 0) / ffeScores.length : null;

    if (!monthly[key]) monthly[key] = { year: r.period_year, month: r.period_month, target_usd: 0, actual_usd: 0, ffe_sum: 0, ffe_count: 0, byProduct: {} };
    monthly[key].target_usd += target_usd;
    monthly[key].actual_usd += actual_usd;
    if (ffeAvg !== null) { monthly[key].ffe_sum += ffeAvg; monthly[key].ffe_count += 1; }
    for (const [name, usd] of Object.entries(byProduct)) {
      monthly[key].byProduct[name] = (monthly[key].byProduct[name] || 0) + usd;
    }

    (perMp[r.mp_id] ||= { name: r.mp_name, territory: r.territory, months: [] }).months.push({
      year: r.period_year, month: r.period_month, target_usd, actual_usd,
      achievement: target_usd ? actual_usd / target_usd : null,
    });
  }

  const monthsSorted = Object.values(monthly).sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const monthsOut = monthsSorted.map((m) => ({
    period: `${m.year}-${String(m.month).padStart(2, "0")}`,
    target_usd: Math.round(m.target_usd),
    actual_usd: Math.round(m.actual_usd),
    achievement_pct: m.target_usd ? Math.round((m.actual_usd / m.target_usd) * 1000) / 10 : null,
    ffe_score_pct: m.ffe_count ? Math.round((m.ffe_sum / m.ffe_count) * 1000) / 10 : null,
    top_products: Object.entries(m.byProduct).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, usd]) => ({ name, usd: Math.round(usd) })),
  }));

  // quarterly + yearly rollups from the monthly series
  const quarterly = {};
  const yearly = {};
  for (const m of monthsSorted) {
    const qKey = `${m.year}-Q${quarterOf(m.month)}`;
    quarterly[qKey] ||= { target_usd: 0, actual_usd: 0 };
    quarterly[qKey].target_usd += m.target_usd;
    quarterly[qKey].actual_usd += m.actual_usd;
    yearly[m.year] ||= { target_usd: 0, actual_usd: 0 };
    yearly[m.year].target_usd += m.target_usd;
    yearly[m.year].actual_usd += m.actual_usd;
  }
  const quarterlyOut = Object.entries(quarterly).map(([period, v]) => ({
    period, target_usd: Math.round(v.target_usd), actual_usd: Math.round(v.actual_usd),
    achievement_pct: v.target_usd ? Math.round((v.actual_usd / v.target_usd) * 1000) / 10 : null,
  }));
  const yearlyOut = Object.entries(yearly).map(([year, v]) => ({
    year, target_usd: Math.round(v.target_usd), actual_usd: Math.round(v.actual_usd),
    achievement_pct: v.target_usd ? Math.round((v.actual_usd / v.target_usd) * 1000) / 10 : null,
  }));

  const perMpOut = Object.values(perMp).map((mp) => {
    const last = mp.months[mp.months.length - 1];
    return { name: mp.name, territory: mp.territory, latest_achievement_pct: last?.achievement != null ? Math.round(last.achievement * 1000) / 10 : null, months_reported: mp.months.length };
  }).sort((a, b) => (a.latest_achievement_pct ?? 0) - (b.latest_achievement_pct ?? 0));

  return {
    label,
    months: monthsOut,
    quarterly: quarterlyOut,
    yearly: yearlyOut,
    per_mp: perMpOut,
    underperformance_notes: notesRes.rows.map((n) => n.comment_text).slice(0, 20),
  };
}

async function callClaude(context) {
  const system = `Ты — senior аналитик фармацевтических продаж (field force effectiveness) для команды медпредставителей в Узбекистане.
Тебе дают структурированные данные по вторичным продажам (FSS): план/факт по месяцам, кварталам, годам, в долларах, плюс FFE score, плюс комментарии медпредов о причинах невыполнения.
Дай ГЛУБОКИЙ анализ: тренды месяц-к-месяцу, квартал-к-кварталу, год-к-году, аномалии, риски, сильные и слабые препараты/территории.
Отвечай СТРОГО в формате JSON (без markdown-разметки, без \`\`\`), на русском языке, со следующей структурой:
{
  "summary": "2-4 предложения — главный вывод",
  "monthly_dynamics": "анализ динамики месяц-к-месяцу",
  "quarterly_dynamics": "анализ динамики квартал-к-кварталу",
  "yearly_dynamics": "анализ динамики год-к-году (если данных недостаточно — так и напиши)",
  "risks": ["риск 1", "риск 2", ...],
  "short_term_recommendations": ["конкретная рекомендация на 1-4 недели", ...],
  "long_term_recommendations": ["стратегическая рекомендация на квартал+", ...]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("");
  try {
    return JSON.parse(text);
  } catch (e) {
    return { summary: text, monthly_dynamics: "", quarterly_dynamics: "", yearly_dynamics: "", risks: [], short_term_recommendations: [], long_term_recommendations: [] };
  }
}

module.exports = { aiEnabled, AI_MODEL, buildAnalyticsContext, callClaude };
