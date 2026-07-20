require("dotenv").config();
const express = require("express");
require("express-async-errors"); // forwards rejected promises from async route handlers to next(err) instead of crashing the process
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");
const PptxGenJS = require("pptxgenjs");
const nodemailer = require("nodemailer");
const { createEvents } = require("ics");
const multer = require("multer");
const cron = require("node-cron");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const { TERRITORIES, parseFssWorkbook, parseTargetsWorkbook, monthToCalendarYear } = require("./import.js");

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

/* ============================================================
   Email reminders — Action Plan control/completion dates as
   calendar invites (.ics). Silently no-ops if SMTP_HOST isn't set,
   so the app works fine without email configured.
   ============================================================ */
const mailEnabled = !!process.env.SMTP_HOST;
const transporter = mailEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

function dateToIcsArray(dateStr) {
  const d = new Date(dateStr);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

async function sendActionPlanReminders(mp, rmEmail, items) {
  if (!mailEnabled) return;
  const events = [];
  for (const it of items) {
    if (it.control_date) {
      events.push({
        title: `[Action Plan] Контроль: ${it.product_name || "препарат"}`,
        description: `Цель: ${it.goal || "-"}\nДействие: ${it.action_text || "-"}`,
        start: dateToIcsArray(it.control_date),
        duration: { hours: 1 },
        alarms: [{ action: "display", trigger: { hours: 9, before: true } }],
      });
    }
    if (it.completion_date) {
      events.push({
        title: `[Action Plan] Завершение: ${it.product_name || "препарат"}`,
        description: `Цель: ${it.goal || "-"}\nДействие: ${it.action_text || "-"}`,
        start: dateToIcsArray(it.completion_date),
        duration: { hours: 1 },
        alarms: [{ action: "display", trigger: { hours: 9, before: true } }],
      });
    }
  }
  if (!events.length) return;
  const { error, value } = createEvents(events);
  if (error) { console.error("ics build error:", error); return; }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mp.email,
      cc: rmEmail || undefined,
      subject: `Action Plan — напоминания (${events.length})`,
      text: "Во вложении — календарные напоминания по датам контроля/завершения из вашего Action Plan.",
      icalEvent: { filename: "action-plan.ics", method: "PUBLISH", content: value },
    });
  } catch (e) {
    console.error("Failed to send action plan reminder email:", e.message);
  }
}

/* ============================================================
   Bonus policy helpers (Incentive Policy FY'27)
   ============================================================ */
function bonusFor(achievement, baseRate) {
  if (achievement < 0.9) return 0;
  if (achievement < 1.0) return baseRate * 0.6 * achievement;
  if (achievement <= 1.25) return baseRate * achievement;
  return baseRate * 1.25;
}
function tierLabel(achievement) {
  if (achievement < 0.9) return "Нет бонуса (<90%)";
  if (achievement < 1.0) return "60% ставки (90-99.99%)";
  if (achievement <= 1.25) return "100% ставки (100-124.99%)";
  return "Потолок 125%";
}
function quarterOf(month) { return Math.floor((month - 1) / 3) + 1; }
function monthsInQuarter(q) { return [3 * (q - 1) + 1, 3 * (q - 1) + 2, 3 * (q - 1) + 3]; }
// RM multiplier table (Incentive Policy FY'27, slide "RM bonusi multiplikatori")
function rmMultiplier(achievement) {
  if (achievement < 0.9) return 0;       // RM doesn't qualify personally
  if (achievement < 1.0) return 1.0;     // 90% - 99.99%
  if (achievement < 1.05) return 1.5;    // 100% - 104.99%
  if (achievement < 1.10) return 1.75;   // 105% - 109.99%
  return 2.0;                            // 110%+
}
function rmMultiplierLabel(achievement) {
  if (achievement < 0.9) return "RM не квалифицируется (<90%)";
  if (achievement < 1.0) return "x1.00 (90-99.99%)";
  if (achievement < 1.05) return "x1.50 (100-104.99%)";
  if (achievement < 1.10) return "x1.75 (105-109.99%)";
  return "x2.00 (110%+)";
}
const FFE_LABELS = {
  doctor_coverage_a: "Doctor coverage — Категория A",
  doctor_coverage_b: "Doctor coverage — Категория B",
  core_doctor_coverage_a: "Core doctor coverage — Категория A",
  core_doctor_coverage_b: "Core doctor coverage — Категория B",
  doctor_call_coverage_a: "Doctor call coverage — Категория A",
  doctor_call_coverage_b: "Doctor call coverage — Категория B",
  core_call_coverage_a: "Core call coverage — Категория A",
  core_call_coverage_b: "Core call coverage — Категория B",
  pharmacy_coverage_a: "Pharmacy coverage — Категория A",
  pharmacy_coverage_b: "Pharmacy coverage — Категория B",
};
const FFE_GATE = 0.85; // minimum overall FFE score required for incentive eligibility

/* ============================================================
   Auth middleware
   ============================================================ */
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

/* ============================================================
   Access-control helper: can this user see this report?
   ============================================================ */
async function canAccessReport(user, report) {
  if (user.role === "master") return true;
  if (user.role === "mp") return report.mp_id === user.id;
  if (user.role === "rm") {
    const r = await pool.query("select rm_id from users where id = $1", [report.mp_id]);
    return r.rows[0] && r.rows[0].rm_id === user.id;
  }
  return false;
}

/* ============================================================
   AUTH ROUTES
   ============================================================ */
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email и пароль обязательны" });
  const { rows } = await pool.query("select * from users where email = $1 and is_active = true", [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Неверный email или пароль" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Неверный email или пароль" });
  const token = jwt.sign(
    { id: user.id, role: user.role, full_name: user.full_name, email: user.email },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, territory: user.territory, rm_id: user.rm_id },
  });
});

app.get("/api/auth/me", auth, async (req, res) => {
  const { rows } = await pool.query("select id, email, full_name, role, territory, rm_id from users where id = $1", [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

/* ============================================================
   USERS — master creates RM and MP accounts
   ============================================================ */
// list RMs (used to populate "attach to RM" dropdown when creating an MP)
app.get("/api/users/rms", auth, requireRole("master"), async (req, res) => {
  const { rows } = await pool.query("select id, full_name, email, territory from users where role = 'rm' and is_active = true order by full_name");
  res.json(rows);
});

// list users (master: everyone; rm: their own MPs)
app.get("/api/users", auth, async (req, res) => {
  if (req.user.role === "master") {
    const { rows } = await pool.query(
      `select u.id, u.email, u.full_name, u.role, u.territory, u.rm_id, u.is_active, rm.full_name as rm_name
       from users u left join users rm on rm.id = u.rm_id
       order by u.role, u.full_name`
    );
    return res.json(rows);
  }
  if (req.user.role === "rm") {
    const { rows } = await pool.query(
      "select id, email, full_name, role, territory, is_active from users where rm_id = $1 order by full_name",
      [req.user.id]
    );
    return res.json(rows);
  }
  return res.status(403).json({ error: "Forbidden" });
});

app.post("/api/users", auth, requireRole("master"), async (req, res) => {
  const { email, password, full_name, role, rm_id, territory } = req.body;
  if (!email || !password || !full_name || !role) return res.status(400).json({ error: "Заполните все обязательные поля" });
  if (!["rm", "mp"].includes(role)) return res.status(400).json({ error: "Недопустимая роль" });
  if (role === "mp" && !rm_id) return res.status(400).json({ error: "Для медпреда обязательно нужно указать РМ" });
  if (role === "mp" && !TERRITORIES.some((t) => t.label === territory)) {
    return res.status(400).json({ error: "Выберите территорию из списка" });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `insert into users (email, password_hash, full_name, role, rm_id, territory)
       values ($1,$2,$3,$4,$5,$6) returning id, email, full_name, role, rm_id, territory`,
      [email.toLowerCase(), hash, full_name, role, role === "mp" ? rm_id : null, territory || null]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Такой email уже зарегистрирован" });
    console.error(e);
    res.status(500).json({ error: "Ошибка создания пользователя" });
  }
});

app.patch("/api/users/:id", auth, requireRole("master"), async (req, res) => {
  const { is_active, territory, rm_id, full_name } = req.body;
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries({ is_active, territory, rm_id, full_name })) {
    if (v !== undefined) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  if (!fields.length) return res.status(400).json({ error: "Нет полей для обновления" });
  values.push(req.params.id);
  await pool.query(`update users set ${fields.join(", ")} where id = $${i}`, values);
  res.json({ ok: true });
});

/* ============================================================
   PRODUCTS
   ============================================================ */
app.get("/api/products", auth, async (req, res) => {
  const { rows } = await pool.query("select * from products order by sort_order");
  res.json(rows);
});

/* ============================================================
   TERRITORIES — fixed catalog used for MP account creation and imports
   ============================================================ */
app.get("/api/territories", auth, async (req, res) => {
  res.json(TERRITORIES.map((t) => ({ key: t.key, label: t.label })));
});

/* ============================================================
   BULK IMPORT — master uploads the monthly FSS workbook or the
   annual Target workbook; data is distributed to MPs by territory.
   ============================================================ */
app.post("/api/import/fss", auth, requireRole("master"), upload.single("file"), async (req, res) => {
  const { year, month } = req.body;
  if (!req.file) return res.status(400).json({ error: "Файл не получен" });
  if (!year || !month) return res.status(400).json({ error: "Укажите год и месяц" });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const productsRes = await pool.query("select id, name from products order by sort_order");
  const { byTerritory, unmatchedProducts, missingAreas } = parseFssWorkbook(wb, productsRes.rows);

  const usersRes = await pool.query("select id, full_name, territory from users where role='mp' and is_active=true");
  const territoryLabelToKey = Object.fromEntries(TERRITORIES.map((t) => [t.label, t.key]));

  let mpUpdated = 0;
  const noMpForTerritory = [];
  for (const t of TERRITORIES) {
    const data = byTerritory[t.key];
    if (!data) continue;
    const mps = usersRes.rows.filter((u) => u.territory === t.label);
    if (mps.length === 0) { noMpForTerritory.push(t.label); continue; }
    for (const mp of mps) {
      const report = await getOrCreateReport(mp.id, Number(year), Number(month));
      for (const [productId, qty] of Object.entries(data)) {
        await pool.query("update report_fss set actual_qty=$1 where report_id=$2 and product_id=$3", [qty, report.id, productId]);
      }
      mpUpdated++;
    }
  }

  const summary = { mp_updated: mpUpdated, unmatched_products: unmatchedProducts, missing_areas: missingAreas, no_mp_for_territory: noMpForTerritory };
  await pool.query(
    "insert into import_log (import_type, period_year, period_month, uploaded_by, summary) values ('fss',$1,$2,$3,$4)",
    [year, month, req.user.id, summary]
  );
  res.json(summary);
});

app.post("/api/import/targets", auth, requireRole("master"), upload.single("file"), async (req, res) => {
  const { fy } = req.body;
  if (!req.file) return res.status(400).json({ error: "Файл не получен" });
  if (!fy) return res.status(400).json({ error: "Укажите финансовый год (например, 27)" });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const productsRes = await pool.query("select id, name from products order by sort_order");
  const { byTerritory, unmatchedProducts, missingSheets } = parseTargetsWorkbook(wb, productsRes.rows);

  const usersRes = await pool.query("select id, full_name, territory from users where role='mp' and is_active=true");

  let mpUpdated = 0;
  const noMpForTerritory = [];
  for (const t of TERRITORIES) {
    const perProduct = byTerritory[t.key];
    if (!perProduct) continue;
    const mps = usersRes.rows.filter((u) => u.territory === t.label);
    if (mps.length === 0) { noMpForTerritory.push(t.label); continue; }
    for (const mp of mps) {
      for (let month = 1; month <= 12; month++) {
        const calYear = monthToCalendarYear(month, Number(fy));
        const report = await getOrCreateReport(mp.id, calYear, month);
        for (const [productId, monthly] of Object.entries(perProduct)) {
          await pool.query("update report_fss set target_qty=$1 where report_id=$2 and product_id=$3", [monthly[month] || 0, report.id, productId]);
        }
      }
      mpUpdated++;
    }
  }

  const summary = { mp_updated: mpUpdated, unmatched_products: unmatchedProducts, missing_sheets: missingSheets, no_mp_for_territory: noMpForTerritory };
  await pool.query(
    "insert into import_log (import_type, period_year, uploaded_by, summary) values ('targets',$1,$2,$3)",
    [1999 + Number(fy), req.user.id, summary]
  );
  res.json(summary);
});

/* ============================================================
   REPORTS — list (role-scoped)
   ============================================================ */
app.get("/api/reports", auth, async (req, res) => {
  const { year, month } = req.query;
  let where = [];
  let values = [];
  let i = 1;

  if (req.user.role === "mp") {
    where.push(`r.mp_id = $${i++}`);
    values.push(req.user.id);
  } else if (req.user.role === "rm") {
    where.push(`mp.rm_id = $${i++}`);
    values.push(req.user.id);
  } // master: no restriction

  if (year) { where.push(`r.period_year = $${i++}`); values.push(year); }
  if (month) { where.push(`r.period_month = $${i++}`); values.push(month); }

  const sql = `
    select r.*, mp.full_name as mp_name, mp.territory as mp_territory, mp.rm_id,
           rm.full_name as rm_name
    from reports r
    join users mp on mp.id = r.mp_id
    left join users rm on rm.id = mp.rm_id
    ${where.length ? "where " + where.join(" and ") : ""}
    order by r.period_year desc, r.period_month desc, mp.full_name`;
  const { rows } = await pool.query(sql, values);
  res.json(rows);
});

// get-or-create current MP's report for a period
async function getOrCreateReport(mpId, periodYear, periodMonth) {
  let { rows } = await pool.query(
    "select * from reports where mp_id=$1 and period_year=$2 and period_month=$3",
    [mpId, periodYear, periodMonth]
  );
  if (rows[0]) return rows[0];

  const created = await pool.query(
    "insert into reports (mp_id, period_year, period_month) values ($1,$2,$3) returning *",
    [mpId, periodYear, periodMonth]
  );
  const report = created.rows[0];

  const products = await pool.query("select id from products order by sort_order");
  for (const p of products.rows) {
    await pool.query(
      "insert into report_fss (report_id, product_id, target_qty, actual_qty) values ($1,$2,0,0)",
      [report.id, p.id]
    );
  }
  for (const key of Object.keys(FFE_LABELS)) {
    await pool.query(
      "insert into report_ffe (report_id, metric_key, master_list_count, approved_count, achieved_count) values ($1,$2,0,0,0)",
      [report.id, key]
    );
  }
  await pool.query("insert into report_field_days (report_id) values ($1)", [report.id]);
  return report;
}

app.post("/api/reports", auth, requireRole("mp"), async (req, res) => {
  const { period_year, period_month } = req.body;
  if (!period_year || !period_month) return res.status(400).json({ error: "Укажите год и месяц" });
  const report = await getOrCreateReport(req.user.id, period_year, period_month);
  res.json(report);
});

/* ---- report detail ---- */
app.get("/api/reports/:id", auth, async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id = $1", [rid]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Отчёт не найден" });
  if (!(await canAccessReport(req.user, report))) return res.status(403).json({ error: "Forbidden" });

  const mpRes = await pool.query("select id, full_name, territory, rm_id from users where id=$1", [report.mp_id]);
  const fssRes = await pool.query(
    `select f.*, p.name as product_name, p.nrv_usd
     from report_fss f join products p on p.id = f.product_id
     where f.report_id = $1 order by p.sort_order`, [rid]
  );
  const ffeRes = await pool.query("select * from report_ffe where report_id=$1", [rid]);
  const fieldDaysRes = await pool.query("select * from report_field_days where report_id=$1", [rid]);
  const apRes = await pool.query("select * from report_action_plan where report_id=$1 order by sort_order, id", [rid]);
  const convRes = await pool.query(
    `select c.*, p.name as product_name, p.nrv_usd from report_conversion c join products p on p.id=c.product_id where c.report_id=$1 order by c.id`, [rid]
  );
  const potRes = await pool.query(
    `select c.*, p.name as product_name, p.nrv_usd from report_potential c join products p on p.id=c.product_id where c.report_id=$1 order by c.id`, [rid]
  );
  const commentsRes = await pool.query(
    `select c.*, u.full_name as author_name from report_comments c
     join users u on u.id = c.author_id where c.report_id=$1 order by c.created_at`, [rid]
  );
  const logRes = await pool.query(
    `select l.*, u.full_name as actor_name from report_status_log l
     join users u on u.id = l.actor_id where l.report_id=$1 order by l.created_at`, [rid]
  );

  // ---- computed FSS totals ----
  let targetUsd = 0, actualUsd = 0;
  const fssItems = fssRes.rows.map((row) => {
    const t = Number(row.target_qty) * Number(row.nrv_usd);
    const a = Number(row.actual_qty) * Number(row.nrv_usd);
    targetUsd += t; actualUsd += a;
    return { ...row, target_usd: t, actual_usd: a };
  });
  const achievement = targetUsd === 0 ? 0 : actualUsd / targetUsd;
  const rawBonusUzs = bonusFor(achievement, Number(report.base_rate_uzs));

  // ---- computed FFE score ----
  const ffeItems = ffeRes.rows.map((row) => {
    const denom = row.approved_count > 0 ? row.approved_count : row.master_list_count;
    const pct = denom > 0 ? row.achieved_count / denom : 0;
    return { ...row, label: FFE_LABELS[row.metric_key], percent: pct };
  });
  const ffeScore = ffeItems.length ? ffeItems.reduce((s, x) => s + x.percent, 0) / ffeItems.length : 0;
  const ffeGatePassed = ffeScore >= FFE_GATE;
  const nonReimbOk = report.non_reimbursement_ok;
  const finalBonusUzs = (ffeGatePassed && nonReimbOk) ? rawBonusUzs : 0;

  // ---- Conversion / Potential brand-level summary ----
  // base = this report's actual sales for the product (packs/month);
  // additional = sum of (target - current) Rx/week * WEEKS_PER_MONTH, converted to $ at NRV
  const WEEKS_PER_MONTH = 4.33;
  const baseByProduct = {};
  fssItems.forEach((it) => { baseByProduct[it.product_id] = { qty: Number(it.actual_qty), usd: it.actual_usd, nrv: Number(it.nrv_usd) }; });

  function buildBrandSummary(rows, currentField) {
    const byProduct = {};
    for (const r of rows) {
      const pid = r.product_id;
      if (!byProduct[pid]) byProduct[pid] = { product_id: pid, product_name: r.product_name, nrv_usd: Number(r.nrv_usd), additional_packs: 0 };
      const deltaPerWeek = Number(r.target_rx_per_week) - Number(r[currentField]);
      byProduct[pid].additional_packs += Math.max(0, deltaPerWeek) * WEEKS_PER_MONTH;
    }
    return Object.values(byProduct).map((b) => {
      const base = baseByProduct[b.product_id] || { qty: 0, usd: 0 };
      const additional_usd = b.additional_packs * b.nrv_usd;
      return {
        product_id: b.product_id, product_name: b.product_name,
        base_packs: base.qty, base_usd: base.usd,
        additional_packs: b.additional_packs, additional_usd,
        total_packs: base.qty + b.additional_packs, total_usd: base.usd + additional_usd,
      };
    });
  }

  res.json({
    report,
    mp: mpRes.rows[0],
    fss: {
      items: fssItems, target_usd: targetUsd, actual_usd: actualUsd, achievement,
      raw_bonus_uzs: rawBonusUzs, bonus_uzs: finalBonusUzs, bonus_usd: finalBonusUzs / Number(report.fx_rate),
      tier_label: tierLabel(achievement),
      gates: {
        ffe_gate_passed: ffeGatePassed, ffe_score: ffeScore, ffe_threshold: FFE_GATE,
        non_reimbursement_ok: nonReimbOk,
      },
    },
    ffe: { items: ffeItems, score: ffeScore, gate_passed: ffeGatePassed, gate_threshold: FFE_GATE },
    field_days: fieldDaysRes.rows[0],
    action_plan: apRes.rows,
    conversion: { items: convRes.rows, summary: buildBrandSummary(convRes.rows, "current_rx_per_week") },
    potential: { items: potRes.rows, summary: buildBrandSummary(potRes.rows, "current_potential_per_week") },
    comments: commentsRes.rows,
    status_log: logRes.rows,
  });
});

/* ---- MP updates: FSS / FFE / action plan / settings (only draft/returned) ---- */
function assertEditable(report, res) {
  if (!["draft", "returned"].includes(report.status)) {
    res.status(409).json({ error: "Отчёт уже отправлен на рассмотрение — редактирование недоступно" });
    return false;
  }
  return true;
}

app.put("/api/reports/:id/fss", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!assertEditable(report, res)) return;
  const { items } = req.body; // [{product_id, target_qty, actual_qty}]
  for (const it of items) {
    await pool.query(
      "update report_fss set target_qty=$1, actual_qty=$2 where report_id=$3 and product_id=$4",
      [it.target_qty || 0, it.actual_qty || 0, rid, it.product_id]
    );
  }
  await pool.query("update reports set updated_at = now() where id=$1", [rid]);
  res.json({ ok: true });
});

app.put("/api/reports/:id/ffe", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!assertEditable(report, res)) return;
  const { items, field_days } = req.body;
  for (const it of items || []) {
    await pool.query(
      "update report_ffe set master_list_count=$1, approved_count=$2, achieved_count=$3 where report_id=$4 and metric_key=$5",
      [it.master_list_count || 0, it.approved_count || 0, it.achieved_count || 0, rid, it.metric_key]
    );
  }
  if (field_days) {
    await pool.query(
      `update report_field_days set total_days=$1, non_working_days=$2, public_holidays=$3, training_days=$4, leave_days=$5, field_days=$6
       where report_id=$7`,
      [field_days.total_days, field_days.non_working_days, field_days.public_holidays, field_days.training_days, field_days.leave_days, field_days.field_days, rid]
    );
  }
  await pool.query("update reports set updated_at = now() where id=$1", [rid]);
  res.json({ ok: true });
});

app.put("/api/reports/:id/action-plan", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!assertEditable(report, res)) return;
  const { items } = req.body; // [{id?, product_name, goal, action_text, control_date, completion_date}]
  await pool.query("delete from report_action_plan where report_id=$1", [rid]);
  let order = 0;
  for (const it of items || []) {
    await pool.query(
      `insert into report_action_plan (report_id, product_name, goal, action_text, control_date, completion_date, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [rid, it.product_name || "", it.goal || "", it.action_text || "", it.control_date || null, it.completion_date || null, order++]
    );
  }
  await pool.query("update reports set updated_at = now() where id=$1", [rid]);
  res.json({ ok: true });

  // fire-and-forget: email calendar invites for control/completion dates (no-op if SMTP not configured)
  try {
    const mpRes = await pool.query("select id, full_name, email, rm_id from users where id=$1", [req.user.id]);
    const mpRow = mpRes.rows[0];
    let rmEmail = null;
    if (mpRow?.rm_id) {
      const rmRes = await pool.query("select email from users where id=$1", [mpRow.rm_id]);
      rmEmail = rmRes.rows[0]?.email || null;
    }
    await sendActionPlanReminders(mpRow, rmEmail, items || []);
  } catch (e) {
    console.error("Action plan reminder dispatch failed:", e.message);
  }
});

app.put("/api/reports/:id/conversion", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!assertEditable(report, res)) return;
  const { items } = req.body;
  await pool.query("delete from report_conversion where report_id=$1", [rid]);
  for (const it of items || []) {
    await pool.query(
      `insert into report_conversion
       (report_id, product_id, doctor_name, current_rx_per_week, competitor_rx_per_week, competitor_reason, mp_action_plan, target_rx_per_week, start_date, control_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [rid, it.product_id, it.doctor_name || "", it.current_rx_per_week || 0, it.competitor_rx_per_week || 0,
       it.competitor_reason || "", it.mp_action_plan || "", it.target_rx_per_week || 0, it.start_date || null, it.control_date || null]
    );
  }
  await pool.query("update reports set updated_at = now() where id=$1", [rid]);
  res.json({ ok: true });
});

app.put("/api/reports/:id/potential", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!assertEditable(report, res)) return;
  const { items } = req.body;
  await pool.query("delete from report_potential where report_id=$1", [rid]);
  for (const it of items || []) {
    await pool.query(
      `insert into report_potential
       (report_id, product_id, doctor_name, current_potential_per_week, reason_not_treating, mp_action_plan, target_rx_per_week, start_date, control_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [rid, it.product_id, it.doctor_name || "", it.current_potential_per_week || 0,
       it.reason_not_treating || "", it.mp_action_plan || "", it.target_rx_per_week || 0, it.start_date || null, it.control_date || null]
    );
  }
  await pool.query("update reports set updated_at = now() where id=$1", [rid]);
  res.json({ ok: true });
});

async function checkWeeklyReminders() {
  if (!mailEnabled) return;
  for (const entityType of ["conversion", "potential"]) {
    const table = entityType === "conversion" ? "report_conversion" : "report_potential";
    const rows = await pool.query(`select * from ${table} where control_date is not null`);
    for (const row of rows.rows) {
      const lastRes = await pool.query(
        "select sent_at from reminder_log where entity_type=$1 and entity_id=$2 order by sent_at desc limit 1",
        [entityType, row.id]
      );
      const last = lastRes.rows[0];
      const daysSince = last ? (Date.now() - new Date(last.sent_at).getTime()) / 86400000 : Infinity;
      if (daysSince < 7) continue;

      const repRes = await pool.query(
        "select r.id, u.full_name as mp_name, u.email as mp_email, u.rm_id from reports r join users u on u.id=r.mp_id where r.id=$1",
        [row.report_id]
      );
      const rep = repRes.rows[0];
      if (!rep) continue;
      let rmEmail = null;
      if (rep.rm_id) {
        const rmRes = await pool.query("select email from users where id=$1", [rep.rm_id]);
        rmEmail = rmRes.rows[0]?.email || null;
      }
      const prodRes = await pool.query("select name from products where id=$1", [row.product_id]);
      const productName = prodRes.rows[0]?.name || "";
      const kindLabel = entityType === "conversion" ? "Конверсия" : "Увеличение потенциала";

      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: rep.mp_email,
          cc: rmEmail || undefined,
          subject: `[${kindLabel}] Еженедельное напоминание — врач ${row.doctor_name}`,
          text: `Препарат: ${productName}\nВрач: ${row.doctor_name}\nДата контроля: ${row.control_date}\n\nЭто еженедельное напоминание обсудить с региональным менеджером прогресс по данному врачу (раздел "${kindLabel}").`,
        });
        await pool.query("insert into reminder_log (entity_type, entity_id) values ($1,$2)", [entityType, row.id]);
      } catch (e) {
        console.error(`Weekly reminder send failed for ${entityType}#${row.id}:`, e.message);
      }
    }
  }
}
if (mailEnabled) {
  cron.schedule("0 8 * * *", () => { checkWeeklyReminders().catch((e) => console.error("Weekly reminder job failed:", e.message)); });
}

app.put("/api/reports/:id/settings", auth, async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!(await canAccessReport(req.user, report))) return res.status(403).json({ error: "Forbidden" });
  if (req.user.role === "mp" && !assertEditable(report, res)) return;
  const { base_rate_uzs, fx_rate, non_reimbursement_ok } = req.body;
  if (non_reimbursement_ok !== undefined && req.user.role === "mp") {
    return res.status(403).json({ error: "Только РМ или мастер может подтверждать условие non-reimbursement" });
  }
  await pool.query(
    "update reports set base_rate_uzs=coalesce($1,base_rate_uzs), fx_rate=coalesce($2,fx_rate), non_reimbursement_ok=coalesce($3,non_reimbursement_ok) where id=$4",
    [base_rate_uzs, fx_rate, non_reimbursement_ok, rid]
  );
  res.json({ ok: true });
});

/* ---- workflow transitions ---- */
async function logTransition(rid, from, to, actorId, note) {
  await pool.query(
    "insert into report_status_log (report_id, from_status, to_status, actor_id, note) values ($1,$2,$3,$4,$5)",
    [rid, from, to, actorId, note || null]
  );
}

app.post("/api/reports/:id/submit", auth, requireRole("mp"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1 and mp_id=$2", [rid, req.user.id]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!["draft", "returned"].includes(report.status)) return res.status(409).json({ error: "Отчёт уже отправлен" });
  await pool.query("update reports set status='submitted', submitted_at=now() where id=$1", [rid]);
  await logTransition(rid, report.status, "submitted", req.user.id);
  res.json({ ok: true });
});

app.post("/api/reports/:id/return", auth, requireRole("rm"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!(await canAccessReport(req.user, report))) return res.status(403).json({ error: "Forbidden" });
  if (report.status !== "submitted") return res.status(409).json({ error: "Отчёт не находится на рассмотрении" });
  await pool.query("update reports set status='returned' where id=$1", [rid]);
  if (req.body.comment_text) {
    await pool.query(
      "insert into report_comments (report_id, section, author_id, author_role, comment_text) values ($1,'general',$2,$3,$4)",
      [rid, req.user.id, req.user.role, req.body.comment_text]
    );
  }
  await logTransition(rid, "submitted", "returned", req.user.id, req.body.comment_text);
  res.json({ ok: true });
});

app.post("/api/reports/:id/approve-rm", auth, requireRole("rm"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!(await canAccessReport(req.user, report))) return res.status(403).json({ error: "Forbidden" });
  if (report.status !== "submitted") return res.status(409).json({ error: "Отчёт не находится на рассмотрении" });
  await pool.query("update reports set status='approved', rm_reviewed_at=now() where id=$1", [rid]);
  await logTransition(rid, "submitted", "approved", req.user.id, req.body.comment_text);
  if (req.body.comment_text) {
    await pool.query(
      "insert into report_comments (report_id, section, author_id, author_role, comment_text) values ($1,'general',$2,$3,$4)",
      [rid, req.user.id, req.user.role, req.body.comment_text]
    );
  }
  res.json({ ok: true });
});

app.post("/api/reports/:id/comment", auth, requireRole("rm", "master"), async (req, res) => {
  const rid = req.params.id;
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) return res.status(404).json({ error: "Не найдено" });
  if (!(await canAccessReport(req.user, report))) return res.status(403).json({ error: "Forbidden" });
  const { section, item_ref, comment_text } = req.body;
  if (!comment_text) return res.status(400).json({ error: "Пустой комментарий" });
  const { rows } = await pool.query(
    `insert into report_comments (report_id, section, item_ref, author_id, author_role, comment_text)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [rid, section || "general", item_ref || null, req.user.id, req.user.role, comment_text]
  );
  res.json(rows[0]);
});

/* ============================================================
   Shared: quarterly bonus computation for one MP (3 monthly reports)
   The Incentive Policy computes bonus per QUARTER, while MPs fill in
   reports per MONTH — this aggregates the 3 months into the real,
   policy-accurate quarterly number.
   ============================================================ */
async function computeMpQuarterBonus(mpId, year, quarter) {
  const months = monthsInQuarter(Number(quarter));
  const repsRes = await pool.query(
    `select r.* from reports r where r.mp_id=$1 and r.period_year=$2 and r.period_month = any($3::int[]) order by r.period_month`,
    [mpId, year, months]
  );
  const reps = repsRes.rows;
  let target = 0, actual = 0, ffeSum = 0, nonReimbOk = true;
  const monthly = [];
  for (const m of months) {
    const r = reps.find((x) => x.period_month === m);
    if (!r) { monthly.push({ month: m, found: false }); continue; }
    const fssRes = await pool.query(
      `select f.target_qty, f.actual_qty, p.nrv_usd from report_fss f join products p on p.id=f.product_id where f.report_id=$1`, [r.id]
    );
    let mTarget = 0, mActual = 0;
    for (const row of fssRes.rows) {
      mTarget += Number(row.target_qty) * Number(row.nrv_usd);
      mActual += Number(row.actual_qty) * Number(row.nrv_usd);
    }
    target += mTarget; actual += mActual;
    const ffeRes = await pool.query("select * from report_ffe where report_id=$1", [r.id]);
    const items = ffeRes.rows.map((row) => {
      const denom = row.approved_count > 0 ? row.approved_count : row.master_list_count;
      return denom > 0 ? row.achieved_count / denom : 0;
    });
    const ffeAvg = items.length ? items.reduce((s, x) => s + x, 0) / items.length : 0;
    ffeSum += ffeAvg;
    if (!r.non_reimbursement_ok) nonReimbOk = false;
    monthly.push({ month: m, found: true, status: r.status, target_usd: mTarget, actual_usd: mActual, ffe_score: ffeAvg });
  }
  const allApproved = reps.length === 3 && reps.every((r) => r.status === "approved");
  const ffeAvg = reps.length ? ffeSum / reps.length : 0;
  const achievement = target === 0 ? 0 : actual / target;
  const baseRateQuarter = reps[0] ? Number(reps[0].base_rate_uzs) : 15000000;
  const rawBonus = bonusFor(achievement, baseRateQuarter);
  const ffeGatePassed = ffeAvg >= FFE_GATE;
  const qualifies = allApproved && achievement >= 0.9 && ffeGatePassed && nonReimbOk;
  const bonus = qualifies ? rawBonus : 0;
  return {
    year: Number(year), quarter: Number(quarter), months, monthly,
    target_usd: target, actual_usd: actual, achievement, tier_label: tierLabel(achievement),
    ffe_score: ffeAvg, ffe_gate_passed: ffeGatePassed, non_reimbursement_ok: nonReimbOk,
    all_months_approved: allApproved, raw_bonus_uzs: rawBonus, bonus_uzs: bonus,
    base_rate_uzs: baseRateQuarter,
  };
}

app.get("/api/mp-bonus/:mpId", auth, async (req, res) => {
  const { mpId } = req.params;
  const { year, quarter } = req.query;
  if (!year || !quarter) return res.status(400).json({ error: "Укажите year и quarter" });
  if (req.user.role === "mp" && String(req.user.id) !== String(mpId)) return res.status(403).json({ error: "Forbidden" });
  if (req.user.role === "rm") {
    const chk = await pool.query("select rm_id from users where id=$1", [mpId]);
    if (!chk.rows[0] || chk.rows[0].rm_id !== req.user.id) return res.status(403).json({ error: "Forbidden" });
  }
  const mpRes = await pool.query("select id, full_name, territory from users where id=$1 and role='mp'", [mpId]);
  if (!mpRes.rows[0]) return res.status(404).json({ error: "МП не найден" });
  const data = await computeMpQuarterBonus(mpId, year, quarter);
  res.json({ mp: mpRes.rows[0], ...data });
});

/* ============================================================
   ALL COMMENTS — master sees every conversation on the platform
   ============================================================ */
app.get("/api/comments/all", auth, requireRole("master"), async (req, res) => {
  const { rows } = await pool.query(`
    select c.*, u.full_name as author_name,
           r.period_year, r.period_month, r.status as report_status,
           mp.full_name as mp_name, mp.id as mp_id, rm.full_name as rm_name
    from report_comments c
    join users u on u.id = c.author_id
    join reports r on r.id = c.report_id
    join users mp on mp.id = r.mp_id
    left join users rm on rm.id = mp.rm_id
    order by c.created_at desc
    limit 500
  `);
  res.json(rows);
});

/* ============================================================
   RM BONUS — multiplier x average bonus of the MR team
   (Incentive Policy FY'27, "RM bonusi multiplikatori")
   ============================================================ */
app.get("/api/rm-bonus", auth, async (req, res) => {
  const { year, quarter, rm_id } = req.query;
  if (!year || !quarter) return res.status(400).json({ error: "Укажите year и quarter" });

  let targetRmId;
  if (req.user.role === "rm") {
    targetRmId = req.user.id;
  } else if (req.user.role === "master") {
    if (!rm_id) return res.status(400).json({ error: "Укажите rm_id" });
    targetRmId = rm_id;
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rmRes = await pool.query("select id, full_name, territory from users where id=$1 and role='rm'", [targetRmId]);
  const rm = rmRes.rows[0];
  if (!rm) return res.status(404).json({ error: "РМ не найден" });

  const mpsRes = await pool.query("select id, full_name, territory from users where rm_id=$1 and role='mp' and is_active=true order by full_name", [targetRmId]);
  const mps = mpsRes.rows;

  const team = [];
  let teamTargetUsd = 0, teamActualUsd = 0;
  for (const mp of mps) {
    const d = await computeMpQuarterBonus(mp.id, year, quarter);
    teamTargetUsd += d.target_usd; teamActualUsd += d.actual_usd;
    team.push({
      mp_id: mp.id, mp_name: mp.full_name, territory: mp.territory,
      reports_found: d.monthly.filter((m) => m.found).length, all_approved: d.all_months_approved,
      achievement: d.achievement, ffe_score: d.ffe_score, non_reimbursement_ok: d.non_reimbursement_ok,
      qualifies: d.bonus_uzs > 0, bonus_uzs: d.bonus_uzs,
    });
  }

  const qualifiedCount = team.filter((t) => t.qualifies).length;
  const teamQualifies = mps.length > 0 && qualifiedCount / mps.length >= 0.5;
  const avgMrBonus = team.length ? team.reduce((s, t) => s + t.bonus_uzs, 0) / team.length : 0;
  const rmAchievement = teamTargetUsd === 0 ? 0 : teamActualUsd / teamTargetUsd; // RM territory = sum of MP territories
  const multiplier = rmMultiplier(rmAchievement);
  const rmBonusUzs = (teamQualifies && rmAchievement >= 0.9) ? multiplier * avgMrBonus : 0;

  res.json({
    rm, year: Number(year), quarter: Number(quarter),
    team, team_size: mps.length, qualified_count: qualifiedCount, team_qualifies: teamQualifies,
    rm_achievement: rmAchievement, rm_target_usd: teamTargetUsd, rm_actual_usd: teamActualUsd,
    multiplier, multiplier_label: rmMultiplierLabel(rmAchievement),
    avg_mr_bonus_uzs: avgMrBonus, rm_bonus_uzs: rmBonusUzs,
  });
});

/* ============================================================
   EXPORTS — available once status = 'approved'
   ============================================================ */
async function loadFullReport(rid) {
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) return null;
  const mpRes = await pool.query("select id, full_name, territory, rm_id from users where id=$1", [report.mp_id]);
  const rmRes = mpRes.rows[0]?.rm_id
    ? await pool.query("select full_name from users where id=$1", [mpRes.rows[0].rm_id])
    : { rows: [] };
  const fssRes = await pool.query(
    `select f.*, p.name as product_name, p.nrv_usd from report_fss f
     join products p on p.id=f.product_id where f.report_id=$1 order by p.sort_order`, [rid]);
  const ffeRes = await pool.query("select * from report_ffe where report_id=$1", [rid]);
  const apRes = await pool.query("select * from report_action_plan where report_id=$1 order by sort_order,id", [rid]);
  const convRes = await pool.query(
    `select c.*, p.name as product_name from report_conversion c join products p on p.id=c.product_id where c.report_id=$1`, [rid]);
  const potRes = await pool.query(
    `select c.*, p.name as product_name from report_potential c join products p on p.id=c.product_id where c.report_id=$1`, [rid]);

  let targetUsd = 0, actualUsd = 0;
  const fssItems = fssRes.rows.map((r) => {
    const t = Number(r.target_qty) * Number(r.nrv_usd);
    const a = Number(r.actual_qty) * Number(r.nrv_usd);
    targetUsd += t; actualUsd += a;
    return { ...r, target_usd: t, actual_usd: a };
  });
  const achievement = targetUsd === 0 ? 0 : actualUsd / targetUsd;
  const rawBonusUzs = bonusFor(achievement, Number(report.base_rate_uzs));

  const ffeItems = ffeRes.rows.map((r) => {
    const denom = r.approved_count > 0 ? r.approved_count : r.master_list_count;
    const pct = denom > 0 ? r.achieved_count / denom : 0;
    return { ...r, label: FFE_LABELS[r.metric_key], percent: pct };
  });
  const ffeScore = ffeItems.length ? ffeItems.reduce((s, x) => s + x.percent, 0) / ffeItems.length : 0;
  const ffeGatePassed = ffeScore >= FFE_GATE;
  const bonusUzs = (ffeGatePassed && report.non_reimbursement_ok) ? rawBonusUzs : 0;

  return {
    report, mp: mpRes.rows[0], rm_name: rmRes.rows[0]?.full_name || "—",
    fssItems, targetUsd, actualUsd, achievement, rawBonusUzs, bonusUzs, bonusUsd: bonusUzs / Number(report.fx_rate),
    ffeItems, ffeScore, ffeGatePassed, actionPlan: apRes.rows, conversion: convRes.rows, potential: potRes.rows,
  };
}

async function checkExportAccess(req, res, rid) {
  const rRes = await pool.query("select * from reports where id=$1", [rid]);
  const report = rRes.rows[0];
  if (!report) { res.status(404).json({ error: "Не найдено" }); return null; }
  if (!(await canAccessReport(req.user, report))) { res.status(403).json({ error: "Forbidden" }); return null; }
  if (report.status !== "approved") { res.status(409).json({ error: "Отчёт ещё не одобрен — скачивание станет доступно после одобрения РМ" }); return null; }
  return report;
}

app.get("/api/reports/:id/export/xlsx", auth, async (req, res) => {
  const rid = req.params.id;
  const report = await checkExportAccess(req, res, rid);
  if (!report) return;
  const data = await loadFullReport(rid);

  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet("FSS");
  ws1.addRow([`Медпред: ${data.mp.full_name}`, `Территория: ${data.mp.territory || "—"}`, `РМ: ${data.rm_name}`]);
  ws1.addRow([`Период: ${data.report.period_month}/${data.report.period_year}`]);
  ws1.addRow([]);
  ws1.addRow(["Препарат", "NRV $", "План, уп.", "Факт, уп.", "План, $", "Факт, $", "Дост., %"]).font = { bold: true };
  data.fssItems.forEach((it) => {
    ws1.addRow([it.product_name, Number(it.nrv_usd), Number(it.target_qty), Number(it.actual_qty), it.target_usd, it.actual_usd, it.target_usd ? it.actual_usd / it.target_usd : 0]);
  });
  ws1.addRow([]);
  ws1.addRow(["ИТОГО", "", "", "", data.targetUsd, data.actualUsd, data.achievement]).font = { bold: true };
  ws1.addRow([]);
  ws1.addRow(["Расчётный бонус (по FSS), UZS", Math.round(data.rawBonusUzs)]);
  ws1.addRow(["FFE gate (>=85%)", data.ffeGatePassed ? "пройден" : "НЕ пройден — бонус обнулён"]);
  ws1.addRow(["Non-reimbursement условие (>=50%)", data.report.non_reimbursement_ok ? "подтверждено" : "НЕ подтверждено — бонус обнулён"]);
  ws1.addRow(["ИТОГОВЫЙ бонус, UZS", Math.round(data.bonusUzs)]).font = { bold: true };
  ws1.addRow(["ИТОГОВЫЙ бонус, $", Math.round(data.bonusUsd)]).font = { bold: true };
  ws1.getColumn(1).width = 30;

  const ws2 = wb.addWorksheet("FFE");
  ws2.addRow(["Метрика", "База (master list)", "Утверждено", "Достигнуто", "%"]).font = { bold: true };
  data.ffeItems.forEach((it) => ws2.addRow([it.label, it.master_list_count, it.approved_count, it.achieved_count, it.percent]));
  ws2.addRow([]);
  ws2.addRow(["Общий FFE score", "", "", "", data.ffeScore]).font = { bold: true };
  ws2.addRow(["Порог допуска к бонусу", "", "", "", 0.85]);
  ws2.getColumn(1).width = 34;

  const ws3 = wb.addWorksheet("Action Plan");
  ws3.addRow(["Препарат", "Цель", "План действий", "Контрольная дата", "Дата завершения"]).font = { bold: true };
  data.actionPlan.forEach((it) => ws3.addRow([it.product_name, it.goal, it.action_text, it.control_date, it.completion_date]));
  ws3.columns.forEach((c) => (c.width = 28));

  const ws4 = wb.addWorksheet("Конверсия");
  ws4.addRow(["Препарат", "Врач", "Наш преп., Rx/нед", "Конкуренты, Rx/нед", "Почему конкуренты", "План МП", "Цель, Rx/нед", "Начало", "Контроль"]).font = { bold: true };
  data.conversion.forEach((it) => ws4.addRow([it.product_name, it.doctor_name, Number(it.current_rx_per_week), Number(it.competitor_rx_per_week), it.competitor_reason, it.mp_action_plan, Number(it.target_rx_per_week), it.start_date, it.control_date]));
  ws4.columns.forEach((c) => (c.width = 24));

  const ws5 = wb.addWorksheet("Увеличение потенциала");
  ws5.addRow(["Препарат", "Врач", "Текущий потенциал, Rx/нед", "Причина", "План МП", "Цель, Rx/нед", "Начало", "Контроль"]).font = { bold: true };
  data.potential.forEach((it) => ws5.addRow([it.product_name, it.doctor_name, Number(it.current_potential_per_week), it.reason_not_treating, it.mp_action_plan, Number(it.target_rx_per_week), it.start_date, it.control_date]));
  ws5.columns.forEach((c) => (c.width = 24));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="report_${rid}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

app.get("/api/reports/:id/export/pptx", auth, async (req, res) => {
  const rid = req.params.id;
  const report = await checkExportAccess(req, res, rid);
  if (!report) return;
  const data = await loadFullReport(rid);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";
  const DARK = "0E1726", GOLD = "E8B04B", GREEN = "3FB88F", TEXT = "F5F0E6";

  // Slide 1 — cover
  let s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("Бизнес-ревью медпредставителя", { x: 0.6, y: 2.4, w: 12, h: 1, fontSize: 32, bold: true, color: TEXT });
  s.addText(`${data.mp.full_name}  ·  ${data.mp.territory || "—"}  ·  РМ: ${data.rm_name}`, { x: 0.6, y: 3.3, w: 12, h: 0.6, fontSize: 18, color: GOLD });
  s.addText(`Период: ${data.report.period_month}/${data.report.period_year}`, { x: 0.6, y: 3.9, w: 12, h: 0.5, fontSize: 14, color: TEXT });

  // Slide 2 — FSS summary
  s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("FSS — план vs факт", { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: TEXT });
  s.addText(`Достижение: ${(data.achievement * 100).toFixed(1)}%`, { x: 0.5, y: 1.1, fontSize: 20, color: data.achievement >= 1 ? GREEN : GOLD });
  s.addText(`План: $${Math.round(data.targetUsd).toLocaleString()}   Факт: $${Math.round(data.actualUsd).toLocaleString()}`, { x: 0.5, y: 1.7, fontSize: 16, color: TEXT });
  s.addText(`Бонус: ${Math.round(data.bonusUzs).toLocaleString()} UZS (~$${Math.round(data.bonusUsd).toLocaleString()})`, { x: 0.5, y: 2.2, fontSize: 16, color: GOLD, bold: true });
  const rows = [["Препарат", "План, уп.", "Факт, уп.", "Дост."]];
  data.fssItems.slice(0, 12).forEach((it) => rows.push([it.product_name, String(it.target_qty), String(it.actual_qty), it.target_usd ? `${((it.actual_usd / it.target_usd) * 100).toFixed(0)}%` : "—"]));
  s.addTable(rows, { x: 0.5, y: 2.8, w: 12, fontSize: 11, color: TEXT, border: { color: "3A4A66", pt: 0.5 }, fill: { color: "141F33" } });

  // Slide 3 — FFE
  s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("FFE — Field Force Effectiveness", { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: TEXT });
  s.addText(`Общий score: ${(data.ffeScore * 100).toFixed(1)}%  (порог допуска к бонусу: 85%)`, {
    x: 0.5, y: 1.1, fontSize: 16, color: data.ffeScore >= 0.85 ? GREEN : "E2574C", bold: true,
  });
  const ffeRows = [["Метрика", "База", "Утв.", "Достигнуто", "%"]];
  data.ffeItems.forEach((it) => ffeRows.push([it.label, String(it.master_list_count), String(it.approved_count), String(it.achieved_count), `${(it.percent * 100).toFixed(0)}%`]));
  s.addTable(ffeRows, { x: 0.5, y: 1.6, w: 12, fontSize: 11, color: TEXT, border: { color: "3A4A66", pt: 0.5 }, fill: { color: "141F33" } });

  // Slide 4 — Action plan
  s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("Action Plan", { x: 0.5, y: 0.4, fontSize: 24, bold: true, color: TEXT });
  const apRows = [["Препарат", "Цель", "План действий", "Контроль", "Завершение"]];
  data.actionPlan.forEach((it) => apRows.push([it.product_name || "", it.goal || "", it.action_text || "", it.control_date ? String(it.control_date).slice(0, 10) : "", it.completion_date ? String(it.completion_date).slice(0, 10) : ""]));
  s.addTable(apRows, { x: 0.5, y: 1.0, w: 12.3, fontSize: 10, color: TEXT, border: { color: "3A4A66", pt: 0.5 }, fill: { color: "141F33" } });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename="report_${rid}.pptx"`);
  res.end(buffer);
});

/* ============================================================ */
app.get("/", (req, res) => res.send("FSS Review Platform API running"));

// final error handler — any thrown/rejected error in a route ends up here as JSON,
// instead of crashing the whole server process
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера. Проверьте DATABASE_URL и логи." });
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`FSS Review server running on port ${PORT}`));
