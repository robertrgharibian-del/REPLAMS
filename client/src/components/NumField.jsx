import React from "react";

// A "number" input that behaves predictably on mobile: it's a plain text
// field under the hood (inputMode="decimal"), starts empty instead of "0",
// and never fights the user's typing. Parse with toNum() on save.
export default function NumField({ value, onChange, className = "", style = {}, placeholder = "0" }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        // allow empty, digits, and a single dot — nothing else
        if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
      }}
      className={className}
      style={style}
    />
  );
}

export function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
export function toInputStr(v) {
  if (v === null || v === undefined || v === 0 || v === "0") return "";
  return String(v);
}
