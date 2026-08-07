import cron from "node-cron";
import { pool } from "./db.js";
import * as api from "./footballApi.js";
import { sendKickoffReminder } from "./emailService.js";
import { LEAGUE_CODES } from "./footballApi.js";

const LEAGUE_IDS = Object.keys(LEAGUE_CODES);
const LEAGUE_NAMES = {
  laliga: "La Liga",
  epl: "Premier League",
  bundesliga: "Bundesliga",
  seriea: "Serie A",
  ligue1: "Ligue 1",
  mls: "MLS",
};

// ---------------------------------------------------------------------------
// 1) syncSquads — every 24h. Pulls fresh team list + squad per league.
//    Because we REPLACE clubs_cache.squad wholesale from the provider,
//    a transferred-out player simply won't be in the new array => auto-removed.
// ---------------------------------------------------------------------------
async function syncSquads() {
  for (const leagueId of LEAGUE_IDS) {
    try {
      const teams = await api.getTeams(leagueId);
      for (const team of teams) {
        const detail = await api.getTeamDetail(team.club_id);
        if (!detail) continue;
        await pool.query(
          `INSERT INTO clubs_cache (club_id, league_id, name, crest, manager, squad, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (club_id) DO UPDATE SET
             name = EXCLUDED.name, crest = EXCLUDED.crest, manager = EXCLUDED.manager,
             squad = EXCLUDED.squad, updated_at = now()`,
          [detail.club_id, leagueId, detail.name, detail.crest, detail.manager, JSON.stringify(detail.squad)]
        );
      }
      console.log(`[syncSquads] ${leagueId}: ${teams.length} clubs synced`);
    } catch (err) {
      console.warn(`[syncSquads] ${leagueId} failed:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 2) syncFixturesResults — every 30 min. Refreshes standings + matches cache.
// ---------------------------------------------------------------------------
async function syncFixturesResults() {
  for (const leagueId of LEAGUE_IDS) {
    try {
      const standings = await api.getStandings(leagueId);
      if (standings) {
        for (const row of standings) {
          await pool.query(
            `INSERT INTO standings_cache (league_id, club_id, position, played, won, draw, lost, points, goal_diff, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
             ON CONFLICT (league_id, club_id) DO UPDATE SET
               position = EXCLUDED.position, played = EXCLUDED.played, won = EXCLUDED.won,
               draw = EXCLUDED.draw, lost = EXCLUDED.lost, points = EXCLUDED.points,
               goal_diff = EXCLUDED.goal_diff, updated_at = now()`,
            [leagueId, row.club_id, row.position, row.played, row.won, row.draw, row.lost, row.points, row.goal_diff]
          );
        }
      }

      const matches = await api.getMatches(leagueId, {});
      for (const m of matches) {
        await upsertMatch(m);
      }
      console.log(`[syncFixturesResults] ${leagueId}: ${matches.length} matches synced`);
    } catch (err) {
      console.warn(`[syncFixturesResults] ${leagueId} failed:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 3) pollLiveMatches — every 60s. Only bothers calling the API if something
//    is plausibly live (kickoff within the last ~2.5h and not yet finished).
// ---------------------------------------------------------------------------
async function pollLiveMatches() {
  const { rows: candidates } = await pool.query(
    `SELECT match_id, league_id FROM matches_cache
     WHERE status IN ('IN_PLAY','PAUSED')
        OR (status IN ('SCHEDULED','TIMED') AND kickoff_at <= now() AND kickoff_at >= now() - interval '3 hours')`
  );
  if (candidates.length === 0) return;

  for (const c of candidates) {
    try {
      const fresh = await api.getMatch(c.match_id);
      if (fresh) await upsertMatch({ ...fresh, league_id: c.league_id });
    } catch (err) {
      console.warn(`[pollLiveMatches] match ${c.match_id} failed:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 4) pollUpcomingLineups — every 5 min. For matches kicking off within 45 min,
//    re-fetch to pick up the lineup as soon as the provider releases it
//    (spec: confirmed ~20-30 min before kickoff).
// ---------------------------------------------------------------------------
async function pollUpcomingLineups() {
  const { rows } = await pool.query(
    `SELECT match_id, league_id FROM matches_cache
     WHERE status IN ('SCHEDULED','TIMED')
       AND kickoff_at BETWEEN now() AND now() + interval '45 minutes'
       AND lineup IS NULL`
  );
  for (const m of rows) {
    try {
      const fresh = await api.getMatch(m.match_id);
      if (fresh?.lineup) await upsertMatch({ ...fresh, league_id: m.league_id });
    } catch (err) {
      console.warn(`[pollUpcomingLineups] match ${m.match_id} failed:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 5) sendKickoffReminders — every 5 min. Emails users whose favourite club
//    plays in ~20-30 min, once per match (tracked via notified_matches).
// ---------------------------------------------------------------------------
async function sendKickoffReminders() {
  const { rows: upcoming } = await pool.query(
    `SELECT * FROM matches_cache
     WHERE status IN ('SCHEDULED','TIMED')
       AND kickoff_at BETWEEN now() + interval '20 minutes' AND now() + interval '30 minutes'`
  );

  for (const match of upcoming) {
    const { rows: interestedUsers } = await pool.query(
      `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
       WHERE u.id IN (
         SELECT f.user_id FROM favorites f
         JOIN notify_settings ns ON ns.user_id = f.user_id AND ns.club_id = f.club_id
         WHERE ns.enabled = true AND f.club_id IN ($1, $2)
         UNION
         SELECT mns.user_id FROM match_notify_settings mns
         WHERE mns.match_id = $3 AND mns.enabled = true
       )`,
      [match.home_club_id, match.away_club_id, match.match_id]
    );

    for (const user of interestedUsers) {
      const { rows: already } = await pool.query(
        `SELECT 1 FROM notified_matches WHERE user_id = $1 AND match_id = $2`,
        [user.id, match.match_id]
      );
      if (already.length > 0) continue;

      try {
        await sendKickoffReminder({
          to: user.email,
          name: user.name,
          homeTeam: match.home_club_name,
          awayTeam: match.away_club_name,
          kickoffAt: match.kickoff_at,
          leagueName: LEAGUE_NAMES[match.league_id] || match.league_id,
        });
        await pool.query(
          `INSERT INTO notified_matches (user_id, match_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, match.match_id]
        );
      } catch (err) {
        console.warn(`[sendKickoffReminders] email to ${user.email} failed:`, err.message);
      }
    }
  }
}

async function upsertMatch(m) {
  await pool.query(
    `INSERT INTO matches_cache
       (match_id, league_id, home_club_id, home_club_name, away_club_id, away_club_name,
        status, home_score, away_score, minute, kickoff_at, lineup, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (match_id) DO UPDATE SET
       status = EXCLUDED.status, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score,
       minute = EXCLUDED.minute, lineup = COALESCE(EXCLUDED.lineup, matches_cache.lineup), updated_at = now()`,
    [
      m.match_id, m.league_id, m.home_club_id, m.home_club_name, m.away_club_id, m.away_club_name,
      m.status, m.home_score, m.away_score, m.minute, m.kickoff_at, m.lineup ? JSON.stringify(m.lineup) : null,
    ]
  );
}

export function startCronJobs() {
  cron.schedule("0 4 * * *", syncSquads);           // once a day, 4am server time
  cron.schedule("*/30 * * * *", syncFixturesResults); // every 30 min
  cron.schedule("*/1 * * * *", pollLiveMatches);      // every 60s
  cron.schedule("*/5 * * * *", pollUpcomingLineups);  // every 5 min
  cron.schedule("*/5 * * * *", sendKickoffReminders); // every 5 min

  console.log("⏰ Cron jobs scheduled.");

  // run the slow syncs once on boot so the dashboard isn't empty on first load
  syncFixturesResults();
  syncSquads();
}
