const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

function getToken() {
  return localStorage.getItem("lmw_token");
}
export function setToken(token) {
  if (token) localStorage.setItem("lmw_token", token);
  else localStorage.removeItem("lmw_token");
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  getLeagues: () => request("/leagues"),
  getTable: (leagueId) => request(`/leagues/${leagueId}/table`),
  getResults: (leagueId) => request(`/leagues/${leagueId}/results`),
  getFixtures: (leagueId) => request(`/leagues/${leagueId}/fixtures`),
  getClubs: (leagueId) => request(`/leagues/${leagueId}/clubs`),
  getClub: (clubId) => request(`/clubs/${clubId}`),
  getFormation: (clubId) => request(`/clubs/${clubId}/formation`),
  getLiveMatches: () => request("/matches/live"),

  loginWithGoogle: (idToken) => request("/auth/google", { method: "POST", body: { idToken } }),
  getMe: () => request("/me"),
  addFavorite: (clubId, leagueId) => request("/favorites", { method: "POST", body: { clubId, leagueId } }),
  removeFavorite: (clubId) => request(`/favorites/${clubId}`, { method: "DELETE" }),
  setNotify: (clubId, enabled) => request("/notify-settings", { method: "POST", body: { clubId, enabled } }),
  setTheme: (theme) => request("/me/theme", { method: "PATCH", body: { theme } }),
};
