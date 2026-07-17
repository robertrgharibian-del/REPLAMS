const BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

function authHeaders() {
  const token = localStorage.getItem("fss_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = "GET", body, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка запроса (${res.status})`);
  return data;
}

export const api = {
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/api/auth/me"),

  listUsers: () => request("/api/users"),
  listRms: () => request("/api/users/rms"),
  createUser: (payload) => request("/api/users", { method: "POST", body: payload }),
  patchUser: (id, payload) => request(`/api/users/${id}`, { method: "PATCH", body: payload }),

  listProducts: () => request("/api/products"),

  listReports: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/reports${qs ? "?" + qs : ""}`);
  },
  getOrCreateReport: (period_year, period_month) =>
    request("/api/reports", { method: "POST", body: { period_year, period_month } }),
  getReport: (id) => request(`/api/reports/${id}`),
  saveFss: (id, items) => request(`/api/reports/${id}/fss`, { method: "PUT", body: { items } }),
  saveFfe: (id, items, field_days) => request(`/api/reports/${id}/ffe`, { method: "PUT", body: { items, field_days } }),
  saveActionPlan: (id, items) => request(`/api/reports/${id}/action-plan`, { method: "PUT", body: { items } }),
  saveSettings: (id, payload) => request(`/api/reports/${id}/settings`, { method: "PUT", body: payload }),
  submitReport: (id) => request(`/api/reports/${id}/submit`, { method: "POST" }),
  returnReport: (id, comment_text) => request(`/api/reports/${id}/return`, { method: "POST", body: { comment_text } }),
  approveReport: (id, comment_text) => request(`/api/reports/${id}/approve-rm`, { method: "POST", body: { comment_text } }),
  addComment: (id, payload) => request(`/api/reports/${id}/comment`, { method: "POST", body: payload }),

  mpBonus: (mpId, year, quarter) => request(`/api/mp-bonus/${mpId}?year=${year}&quarter=${quarter}`),
  rmBonus: (year, quarter, rmId) => request(`/api/rm-bonus?year=${year}&quarter=${quarter}${rmId ? `&rm_id=${rmId}` : ""}`),
  allComments: () => request("/api/comments/all"),

  exportUrl: (id, type) => `${BASE}/api/reports/${id}/export/${type}`,
};

export function authedDownload(url) {
  // exports require the Authorization header, so fetch as blob then trigger a save
  return fetch(url, { headers: authHeaders() }).then(async (res) => {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Не удалось скачать файл");
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : "report";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
