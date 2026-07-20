import React, { useState } from "react";
import { api } from "../api.js";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function ResultBox({ result }) {
  if (!result) return null;
  return (
    <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "#1B2A44" }}>
      <div className="font-semibold mb-2" style={{ color: "#3FB88F" }}>✓ Обновлено медпредов: {result.mp_updated}</div>
      {result.no_mp_for_territory?.length > 0 && (
        <div className="mb-2">
          <div style={{ color: "#E8B04B" }}>Нет активного МП для территорий:</div>
          <div style={{ color: "#8493AA" }}>{result.no_mp_for_territory.join(", ")}</div>
        </div>
      )}
      {(result.missing_areas?.length > 0 || result.missing_sheets?.length > 0) && (
        <div className="mb-2">
          <div style={{ color: "#E2574C" }}>Не найдены листы в файле:</div>
          <div style={{ color: "#8493AA" }}>{[...(result.missing_areas || []), ...(result.missing_sheets || [])].join(", ")}</div>
        </div>
      )}
      {result.unmatched_products?.length > 0 && (
        <div>
          <div style={{ color: "#E8B04B" }}>Не распознаны как препараты из каталога ({result.unmatched_products.length}):</div>
          <div style={{ color: "#8493AA" }} className="max-h-32 overflow-y-auto">
            {result.unmatched_products.map((u, i) => <div key={i}>{u.sheet} · строка {u.row}: {u.name}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MasterImports() {
  const now = new Date();
  const [fssYear, setFssYear] = useState(now.getFullYear());
  const [fssMonth, setFssMonth] = useState(now.getMonth() + 1);
  const [fssFile, setFssFile] = useState(null);
  const [fssBusy, setFssBusy] = useState(false);
  const [fssResult, setFssResult] = useState(null);
  const [fssError, setFssError] = useState("");

  const [fy, setFy] = useState(27);
  const [tgtFile, setTgtFile] = useState(null);
  const [tgtBusy, setTgtBusy] = useState(false);
  const [tgtResult, setTgtResult] = useState(null);
  const [tgtError, setTgtError] = useState("");

  async function uploadFss() {
    if (!fssFile) { setFssError("Выберите файл"); return; }
    setFssBusy(true); setFssError(""); setFssResult(null);
    try { setFssResult(await api.importFss(fssFile, fssYear, fssMonth)); }
    catch (e) { setFssError(e.message); } finally { setFssBusy(false); }
  }
  async function uploadTargets() {
    if (!tgtFile) { setTgtError("Выберите файл"); return; }
    setTgtBusy(true); setTgtError(""); setTgtResult(null);
    try { setTgtResult(await api.importTargets(tgtFile, fy)); }
    catch (e) { setTgtError(e.message); } finally { setTgtBusy(false); }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-5 py-8 space-y-8">
      <div>
        <div className="font-display text-2xl font-semibold mb-1">Загрузка данных</div>
        <div className="text-sm" style={{ color: "#8493AA" }}>Продажи и таргеты распределяются автоматически по территориям медпредов</div>
      </div>

      <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
        <div className="font-display text-lg mb-3">Загрузить отчёт FSS (продажи за месяц)</div>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "#8493AA" }}>Месяц</span>
            <select value={fssMonth} onChange={(e) => setFssMonth(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1} style={{ color: "#000" }}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "#8493AA" }}>Год</span>
            <input type="number" value={fssYear} onChange={(e) => setFssYear(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2 w-24" style={{ borderColor: "#3A4A66" }} />
          </label>
        </div>
        <input type="file" accept=".xlsx" onChange={(e) => setFssFile(e.target.files[0])}
          className="text-sm mb-3 block" />
        {fssFile && (
          <button onClick={uploadFss} disabled={fssBusy} className="px-5 py-2.5 rounded font-semibold" style={{ background: "#E8B04B", color: "#0E1726" }}>
            {fssBusy ? "Загрузка…" : "Загрузить"}
          </button>
        )}
        {fssError && <div className="text-sm mt-3" style={{ color: "#E2574C" }}>{fssError}</div>}
        <ResultBox result={fssResult} />
      </div>

      <div className="rounded-2xl p-4 sm:p-5" style={{ background: "#141F33", border: "1px solid #22304A" }}>
        <div className="font-display text-lg mb-3">Загрузить Таргеты (план продаж на год)</div>
        <label className="flex flex-col gap-1 text-sm mb-3 w-32">
          <span style={{ color: "#8493AA" }}>Финансовый год</span>
          <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="bg-transparent border rounded px-3 py-2" style={{ borderColor: "#3A4A66" }}>
            {Array.from({ length: 163 }, (_, i) => 27 + i).map((n) => <option key={n} value={n} style={{ color: "#000" }}>FY{n}</option>)}
          </select>
        </label>
        <input type="file" accept=".xlsx" onChange={(e) => setTgtFile(e.target.files[0])}
          className="text-sm mb-3 block" />
        {tgtFile && (
          <button onClick={uploadTargets} disabled={tgtBusy} className="px-5 py-2.5 rounded font-semibold" style={{ background: "#E8B04B", color: "#0E1726" }}>
            {tgtBusy ? "Загрузка…" : "Загрузить"}
          </button>
        )}
        {tgtError && <div className="text-sm mt-3" style={{ color: "#E2574C" }}>{tgtError}</div>}
        <ResultBox result={tgtResult} />
      </div>
    </div>
  );
}
