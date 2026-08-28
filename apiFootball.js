import "dotenv/config";
import { pool } from "./db.js";

const BASE_URL = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;

async function request(pathname) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { "x-apisports-key": API_KEY },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status} on ${pathname}`);
  const json = await res.json();
  return json.response || [];
}

function normName(s) {
  return (s || "").toLowerCase().replace(/fc|cf|club|de|futbol|fútbol|\./g, "").replace(/\s+/g, " ").trim();
}
function nameMatches(a, b) {
  const na = normName(a), nb = normName(b);
  return na.includes(nb) || nb.includes(na);
}

async function findFixtureId(homeTeamName, awayTeamName, kickoffAt) {
  const dateStr = new Date(kickoffAt).toISOString().slice(0, 10);
  const fixtures = await request(`/fixtures?date=${dateStr}`);
  const found = fixtures.find(
    (f) => nameMatches(f.teams?.home?.name, homeTeamName) && nameMatches(f.teams?.away?.name, awayTeamName)
  );
  return found?.fixture?.id || null;
}

function mapStatistics(raw) {
  if (!raw || raw.length < 2) return null;
  const byType = {};
  raw.forEach((side, idx) => {
    (side.statistics || []).forEach((s) => {
      byType[s.type] = byType[s.type] || {};
      byType[s.type][idx === 0 ? "home" : "away"] = s.value;
    });
  });
  return Object.entries(byType).map(([label, v]) => ({ label, home: v.home ?? null, away: v.away ?? null }));
}

function mapEvents(raw) {
  return (raw || []).map((e) => ({
    minute: e.time?.elapsed,
    extra: e.time?.extra || null,
    team: e.team?.name,
    type: e.type,
    detail: e.detail,
    player: e.player?.name || null,
    assist: e.assist?.name || null,
  }));
}

function mapLineups(rawLineups, rawPlayers) {
  if (!rawLineups || rawLineups.length < 2) return null;
  const ratingsFor = (teamId) => {
    const side = (rawPlayers || []).find((p) => p.team?.id === teamId);
    const map = {};
    (side?.players || []).forEach((p) => {
      map[p.player.id] = p.statistics?.[0]?.games?.rating || null;
    });
    return map;
  };
  const side = (raw) => {
    const ratings = ratingsFor(raw.team.id);
    return {
      teamName: raw.team.name,
      formation: raw.formation,
      startXI: (raw.startXI || []).map((s) => ({
        name: s.player.name, number: s.player.number, position: s.player.pos,
        rating: ratings[s.player.id] || null,
      })),
      substitutes: (raw.substitutes || []).map((s) => ({
        name: s.player.name, number: s.player.number, position: s.player.pos,
        rating: ratings[s.player.id] || null,
      })),
      coach: raw.coach?.name || null,
    };
  };
  return { home: side(rawLineups[0]), away: side(rawLineups[1]) };
}

export async function getMatchDetail(match) {
  const { match_id, home_club_name, away_club_name, kickoff_at, status, home_score, away_score } = match;

  const { rows } = await pool.query(`SELECT * FROM match_detail_cache WHERE match_id = $1`, [match_id]);
  const cached = rows[0];
  const isFinal = status === "FINISHED";
  // FINISHED match-এর stat আর বদলায় না — permanent cache। লাইভ/অন্য অবস্থায় ৬০ সেকেন্ড cache।
  if (cached && (isFinal || Date.now() - new Date(cached.fetched_at).getTime() < 60_000)) {
    return cached.payload;
  }

  let fixtureId = cached?.fixture_id || null;
  if (!fixtureId) fixtureId = await findFixtureId(home_club_name, away_club_name, kickoff_at);
  if (!fixtureId) return { available: false, reason: "এই ম্যাচটা API-Football-এ খুঁজে পাওয়া যায়নি।" };

  const [statsRaw, eventsRaw, lineupsRaw, playersRaw] = await Promise.all([
    request(`/fixtures/statistics?fixture=${fixtureId}`),
    request(`/fixtures/events?fixture=${fixtureId}`),
    request(`/fixtures/lineups?fixture=${fixtureId}`),
    request(`/fixtures/players?fixture=${fixtureId}`),
  ]);

  const payload = {
    available: true,
    score: { home: home_score, away: away_score },
    statistics: mapStatistics(statsRaw),
    events: mapEvents(eventsRaw),
    lineups: mapLineups(lineupsRaw, playersRaw),
  };

  await pool.query(
    `INSERT INTO match_detail_cache (match_id, fixture_id, payload, status, fetched_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (match_id) DO UPDATE SET
       fixture_id = EXCLUDED.fixture_id, payload = EXCLUDED.payload, status = EXCLUDED.status, fetched_at = now()`,
    [match_id, fixtureId, JSON.stringify(payload), status]
  );

  return payload;
}
