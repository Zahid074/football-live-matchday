import "dotenv/config";

const BASE_URL = process.env.FOOTBALL_API_BASE_URL || "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_API_KEY;

// Map our internal league ids -> football-data.org competition codes.
// NOTE: MLS is usually NOT included in the football-data.org free tier.
// We keep it mapped so upgrading your plan later "just works", but the
// wrapper below fails soft (returns empty data) instead of crashing.
export const LEAGUE_CODES = {
  laliga: "PD",
  epl: "PL",
  bundesliga: "BL1",
  seriea: "SA",
  ligue1: "FL1",
  mls: "MLS", // may be unavailable on free tier
};

// --- simple in-memory throttle guard -------------------------------------
// football-data.org free tier: 10 requests/minute. We track the
// X-Requests-Available-Minute response header and pause if we run low.
let requestsLeftThisWindow = 10;

async function request(pathname) {
  if (requestsLeftThisWindow <= 1) {
    // be a good citizen — wait out the rest of the minute window
    await new Promise((r) => setTimeout(r, 6000));
  }

  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { "X-Auth-Token": API_KEY },
  });

  const remaining = res.headers.get("x-requests-available-minute");
  if (remaining !== null) requestsLeftThisWindow = Number(remaining);

  if (res.status === 429) {
    // rate limited — wait and retry once
    await new Promise((r) => setTimeout(r, 8000));
    return request(pathname);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status} on ${pathname}: ${body}`);
  }

  return res.json();
}

/** Safe wrapper: returns fallback instead of throwing (used for MLS / plan-restricted leagues) */
async function safeRequest(pathname, fallback) {
  try {
    return await request(pathname);
  } catch (err) {
    console.warn(`[footballApi] ${pathname} failed:`, err.message);
    return fallback;
  }
}

export async function getStandings(leagueId) {
  const code = LEAGUE_CODES[leagueId];
  if (!code) return null;
  const data = await safeRequest(`/competitions/${code}/standings`, null);
  if (!data) return null;
  const table = data.standings?.find((s) => s.type === "TOTAL")?.table || [];
  return table.map((row) => ({
    club_id: String(row.team.id),
    name: row.team.name,
    crest: row.team.crest,
    position: row.position,
    played: row.playedGames,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    points: row.points,
    goal_diff: row.goalDifference,
  }));
}

export async function getTeams(leagueId) {
  const code = LEAGUE_CODES[leagueId];
  if (!code) return [];
  const data = await safeRequest(`/competitions/${code}/teams`, { teams: [] });
  return (data.teams || []).map((t) => ({
    club_id: String(t.id),
    league_id: leagueId,
    name: t.name,
    crest: t.crest,
    manager: t.coach?.name || null,
  }));
}

export async function getTeamDetail(teamId) {
  const data = await safeRequest(`/teams/${teamId}`, null);
  if (!data) return null;
  return {
    club_id: String(data.id),
    name: data.name,
    crest: data.crest,
    manager: data.coach?.name || null,
    squad: (data.squad || []).map((p) => ({
      provider_player_id: p.id,
      name: p.name,
      position: p.position || "N/A",
      nationality: p.nationality || "N/A",
      dateOfBirth: p.dateOfBirth || null,
      shirtNumber: p.shirtNumber || null,
    })),
  };
}

export async function getMatches(leagueId, { status, dateFrom, dateTo } = {}) {
  const code = LEAGUE_CODES[leagueId];
  if (!code) return [];
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const data = await safeRequest(`/competitions/${code}/matches${qs}`, { matches: [] });
  return (data.matches || []).map(mapMatch(leagueId));
}

export async function getMatch(matchId) {
  const data = await safeRequest(`/matches/${matchId}`, null);
  if (!data) return null;
  return mapMatch(null)(data);
}

function mapMatch(leagueId) {
  return (m) => ({
    match_id: String(m.id),
    league_id: leagueId || m.competition?.code || null,
    home_club_id: String(m.homeTeam?.id),
    home_club_name: m.homeTeam?.name,
    away_club_id: String(m.awayTeam?.id),
    away_club_name: m.awayTeam?.name,
    status: m.status, // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | CANCELLED
    home_score: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? null,
    minute: m.minute ?? null, // not always provided by the API — frontend should treat null gracefully
    kickoff_at: m.utcDate,
    // NOTE: football-data.org only exposes lineups on some plans / close to kickoff.
    // If absent this stays null and the frontend shows "Not released yet".
    lineup: m.homeTeam?.lineup || m.awayTeam?.lineup ? {
      home: m.homeTeam?.lineup || [],
      away: m.awayTeam?.lineup || [],
      homeFormation: m.homeTeam?.formation || null,
      awayFormation: m.awayTeam?.formation || null,
    } : null,
  });
}

// --- current season label, cached in memory for a few hours (rarely changes) ---
const seasonCache = new Map(); // leagueId -> { season, fetchedAt }

export async function getCurrentSeason(leagueId) {
  const cached = seasonCache.get(leagueId);
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached.season;

  const code = LEAGUE_CODES[leagueId];
  if (!code) return null;

  const data = await safeRequest(`/competitions/${code}`, null);
  if (!data?.currentSeason?.startDate) return null;

  const startYear = new Date(data.currentSeason.startDate).getFullYear();
  const endYear = new Date(data.currentSeason.endDate).getFullYear();
  const season = {
    startYear,
    endYear,
    label: startYear === endYear ? `${startYear}` : `${startYear}-${String(endYear).slice(-2)}`,
  };
  seasonCache.set(leagueId, { season, fetchedAt: Date.now() });
  return season;
}
