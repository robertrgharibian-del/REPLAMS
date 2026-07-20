// Territory catalog + parsers for bulk FSS / Target xlsx imports.
// Column positions were reverse-engineered from the actual company workbooks
// (06__FSS_June_2026.xlsx and Target_working_sheet_for_FY_27.xlsx).

const TERRITORIES = [
  { key: "tashkent_t1", label: "Ташкент Территория 1", fssArea: "Tashkent", targetSheet: "MR 1" },
  { key: "tashkent_t2", label: "Ташкент Территория 2", fssArea: "Tashkent", targetSheet: "MR 2" },
  { key: "tashkent_t3", label: "Ташкент Территория 3", fssArea: "Tashkent", targetSheet: "MR 3" },
  { key: "tashkent_t4", label: "Ташкент Территория 4", fssArea: "Tashkent", targetSheet: "MR 4" },
  { key: "tashkent_t5", label: "Ташкент Территория 5", fssArea: "Tashkent", targetSheet: "MR 5" },
  { key: "syrdarya_jizzak", label: "Сырдарья/Джизак", fssArea: "Samarkand Belt", targetSheet: "Djizzak" },
  { key: "samarkand", label: "Самарканд", fssArea: "Samarkand Belt", targetSheet: "Samarkand" },
  { key: "kashkadarya", label: "Кашкадарья", fssArea: "Samarkand Belt", targetSheet: "Karshi" },
  { key: "namangan", label: "Наманган", fssArea: "Fergana Valley", targetSheet: "Namangan" },
  { key: "andijan", label: "Андижан", fssArea: "Fergana Valley", targetSheet: "Andijan" },
  { key: "fergana", label: "Фергана", fssArea: "Fergana Valley", targetSheet: "Fergana" },
  { key: "kokand", label: "Коканд", fssArea: "Fergana Valley", targetSheet: "Kokand Zone" },
  { key: "bukhara", label: "Бухара", fssArea: "Bukhara Belt", targetSheet: "Bukhara" },
  { key: "khorezm", label: "Хорезм", fssArea: "Bukhara Belt", targetSheet: "Khorezm" },
  { key: "karakalpakstan", label: "Каракалпакстан", fssArea: "Bukhara Belt", targetSheet: "Nukus" },
];

// month(calendar 1-12) -> column offset in the Target workbook's "MONTH WISE TARGET SHEET FOR FY" block
const TARGET_MONTH_COL = { 4: 34, 5: 35, 6: 36, 7: 38, 8: 39, 9: 40, 10: 43, 11: 44, 12: 45, 1: 47, 2: 48, 3: 49 };

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value.richText) return value.richText.map((r) => r.text).join("");
  if (value.result !== undefined) return cellText(value.result);
  if (value.text) return String(value.text);
  return String(value);
}
function cellNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (value.result !== undefined) return Number(value.result) || 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/tablets?|vials?|vails?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function matchProduct(name, products) {
  const n = normalizeName(name);
  if (!n) return null;
  let best = products.find((p) => normalizeName(p.name) === n);
  if (best) return best;
  best = products.find((p) => {
    const pn = normalizeName(p.name);
    return n.startsWith(pn) || pn.startsWith(n);
  });
  return best || null;
}

function findWorksheet(workbook, name) {
  const target = name.trim().toLowerCase();
  return workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === target) || null;
}

// Finds the "FSS ..." header block in an area sheet and returns its ordered
// sub-columns (territory columns) as [{ col, label }], reading row1 for the
// "FSS ..." label and row2 for each sub-column's territory name, stopping at "Total".
function findFssColumns(ws) {
  const row1 = ws.getRow(1);
  let startCol = null;
  for (let c = 1; c <= ws.columnCount; c++) {
    const v = cellText(row1.getCell(c).value).trim();
    if (v && v.toUpperCase().replace(/\s+/g, " ").startsWith("FSS")) { startCol = c; break; }
  }
  if (!startCol) return null;
  const row2 = ws.getRow(2);
  const cols = [];
  for (let c = startCol; c <= ws.columnCount; c++) {
    const labelStr = cellText(row2.getCell(c).value).trim();
    const low = labelStr.toLowerCase();
    if (low === "total" || low === "итого") break;
    if (!labelStr) { if (cols.length > 0) break; else continue; }
    cols.push({ col: c, label: labelStr });
  }
  return cols;
}

/**
 * Parses the monthly FSS actuals workbook. Returns:
 *   { byTerritory: { [territoryKey]: { [productId]: qty } }, unmatchedProducts: [...], missingAreas: [...] }
 */
function parseFssWorkbook(workbook, products) {
  const byTerritory = {};
  const unmatchedProducts = [];
  const missingAreas = [];
  const areaCache = {};

  for (const t of TERRITORIES) {
    if (!areaCache[t.fssArea]) {
      const ws = findWorksheet(workbook, t.fssArea);
      areaCache[t.fssArea] = ws ? { ws, cols: findFssColumns(ws) } : null;
      if (!ws) missingAreas.push(t.fssArea);
    }
    const area = areaCache[t.fssArea];
    if (!area || !area.cols) continue;

    // sub-column index within this area — Tashkent has 5 (Territory 1-5),
    // the belts have 3 each — position determined by order of TERRITORIES entries sharing this fssArea
    const siblings = TERRITORIES.filter((x) => x.fssArea === t.fssArea);
    const idx = siblings.findIndex((x) => x.key === t.key);
    const colInfo = area.cols[idx];
    if (!colInfo) continue;

    const result = {};
    const ws = area.ws;
    for (let r = 3; r <= ws.rowCount; r++) {
      const name = cellText(ws.getRow(r).getCell(2).value).trim();
      if (!name) continue;
      const product = matchProduct(name, products);
      if (!product) {
        if (!/portfolio|total|итого/i.test(name)) {
          unmatchedProducts.push({ sheet: t.fssArea, row: r, name });
        }
        continue;
      }
      const qty = cellNumber(ws.getRow(r).getCell(colInfo.col).value);
      result[product.id] = (result[product.id] || 0) + qty;
    }
    byTerritory[t.key] = result;
  }
  return { byTerritory, unmatchedProducts: dedupeUnmatched(unmatchedProducts), missingAreas };
}

/**
 * Parses the annual Target workbook for one fiscal year. Returns:
 *   { byTerritory: { [territoryKey]: { [productId]: { [month1to12]: qty } } }, unmatchedProducts, missingSheets }
 */
function parseTargetsWorkbook(workbook, products) {
  const byTerritory = {};
  const unmatchedProducts = [];
  const missingSheets = [];

  for (const t of TERRITORIES) {
    const ws = findWorksheet(workbook, t.targetSheet);
    if (!ws) { missingSheets.push(t.targetSheet); continue; }
    const perProduct = {};
    for (let r = 7; r <= ws.rowCount; r++) {
      const name = cellText(ws.getRow(r).getCell(2).value).trim();
      if (!name) continue;
      const product = matchProduct(name, products);
      if (!product) {
        if (!/portfolio|total|итого/i.test(name)) {
          unmatchedProducts.push({ sheet: t.targetSheet, row: r, name });
        }
        continue;
      }
      const monthly = {};
      for (const [month, col] of Object.entries(TARGET_MONTH_COL)) {
        monthly[month] = cellNumber(ws.getRow(r).getCell(col).value);
      }
      perProduct[product.id] = monthly;
    }
    byTerritory[t.key] = perProduct;
  }
  return { byTerritory, unmatchedProducts: dedupeUnmatched(unmatchedProducts), missingSheets };
}

function dedupeUnmatched(list) {
  const seen = new Set();
  return list.filter((x) => {
    const k = `${x.sheet}|${x.row}|${x.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// FY27 => April 2026 - March 2027 (per Incentive Policy FY'27 document)
function fyToCalendar(fyNumber) {
  const startYear = 1999 + Number(fyNumber);
  return { startYear, endYear: startYear + 1 };
}
function monthToCalendarYear(month, fy) {
  const { startYear, endYear } = fyToCalendar(fy);
  return month >= 4 ? startYear : endYear;
}

module.exports = { TERRITORIES, parseFssWorkbook, parseTargetsWorkbook, fyToCalendar, monthToCalendarYear, matchProduct, normalizeName };
