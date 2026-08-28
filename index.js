import cron from "node-cron";
import { pool } from "./db.js";
import * as api from "./footballApi.js";
import {
  sendMatch24hReminder,
  sendMatch2hReminder,
  sendLineupAnnouncement,
  sendMatchResult,
} from "./emailService.js";
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
// 1) syncSquads — every 24h
// ---------------------------------------------------------------------------
async function syncSquads() {
  for (const leagueId of LEAGUE_IDS) {
    try {
      const teams = await api.getTeams(leagueId);

      for (const team of teams) {
        const detail = await api.getTeamDetail(team.club_id);

        if (!detail) continue;

        await pool.query(
          `INSERT INTO clubs_cache
             (club_id, league_id, name, crest, manager, squad, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (club_id) DO UPDATE SET
             name = EXCLUDED.name,
             crest = EXCLUDED.crest,
             manager = EXCLUDED.manager,
             squad = EXCLUDED.squad,
             updated_at = now()`,
          [
            detail.club_id,
            leagueId,
            detail.name,
            detail.crest,
            detail.manager,
            JSON.stringify(detail.squad),
          ]
        );
      }

      console.log(
        `[syncSquads] ${leagueId}: ${teams.length} clubs synced`
      );
    } catch (err) {
      console.warn(
        `[syncSquads] ${leagueId} failed:`,
        err.message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2) syncFixturesResults — every 30 min
// ---------------------------------------------------------------------------
async function syncFixturesResults() {
  for (const leagueId of LEAGUE_IDS) {
    try {
      const standings = await api.getStandings(leagueId);

      if (standings) {
        for (const row of standings) {
          await pool.query(
            `INSERT INTO standings_cache
               (league_id, club_id, position, played, won, draw, lost,
                points, goal_diff, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
             ON CONFLICT (league_id, club_id) DO UPDATE SET
               position = EXCLUDED.position,
               played = EXCLUDED.played,
               won = EXCLUDED.won,
               draw = EXCLUDED.draw,
               lost = EXCLUDED.lost,
               points = EXCLUDED.points,
               goal_diff = EXCLUDED.goal_diff,
               updated_at = now()`,
            [
              leagueId,
              row.club_id,
              row.position,
              row.played,
              row.won,
              row.draw,
              row.lost,
              row.points,
              row.goal_diff,
            ]
          );
        }
      }

      const matches = await api.getMatches(leagueId, {});

      for (const m of matches) {
        await upsertMatch(m);
      }

      console.log(
        `[syncFixturesResults] ${leagueId}: ${matches.length} matches synced`
      );
    } catch (err) {
      console.warn(
        `[syncFixturesResults] ${leagueId} failed:`,
        err.message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3) pollLiveMatches — every 60s
// ---------------------------------------------------------------------------
async function pollLiveMatches() {
  const { rows: candidates } = await pool.query(
    `SELECT match_id, league_id
     FROM matches_cache
     WHERE status IN ('IN_PLAY','PAUSED')
        OR (
          status IN ('SCHEDULED','TIMED')
          AND kickoff_at <= now()
          AND kickoff_at >= now() - interval '3 hours'
        )`
  );

  if (candidates.length === 0) return;

  for (const c of candidates) {
    try {
      const fresh = await api.getMatch(c.match_id);

      if (fresh) {
        await upsertMatch({
          ...fresh,
          league_id: c.league_id,
        });
      }
    } catch (err) {
      console.warn(
        `[pollLiveMatches] match ${c.match_id} failed:`,
        err.message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4) pollUpcomingLineups — every 5 min
// ---------------------------------------------------------------------------
async function pollUpcomingLineups() {
  const { rows } = await pool.query(
    `SELECT match_id, league_id
     FROM matches_cache
     WHERE status IN ('SCHEDULED','TIMED')
       AND kickoff_at BETWEEN now() AND now() + interval '45 minutes'
       AND lineup IS NULL`
  );

  for (const m of rows) {
    try {
      const fresh = await api.getMatch(m.match_id);

      if (fresh?.lineup) {
        await upsertMatch({
          ...fresh,
          league_id: m.league_id,
        });
      }
    } catch (err) {
      console.warn(
        `[pollUpcomingLineups] match ${m.match_id} failed:`,
        err.message
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared staged reminder system
// ---------------------------------------------------------------------------
async function runStagedReminder({
  stage,
  windowSql,
  windowParams = [],
  buildAndSend,
}) {
  const { rows: upcoming } = await pool.query(
    `SELECT *
     FROM matches_cache
     WHERE status IN ('SCHEDULED','TIMED')
       AND ${windowSql}`,
    windowParams
  );

  for (const match of upcoming) {
    // IMPORTANT:
    // Only users who explicitly enabled notification for THIS match
    // are eligible. Favourite clubs are NOT used for email notifications.
    const { rows: interestedUsers } = await pool.query(
      `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
       JOIN match_notify_settings mns
         ON mns.user_id = u.id
       WHERE mns.match_id = $1
         AND mns.enabled = true`,
      [match.match_id]
    );

    for (const user of interestedUsers) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Prevent two backend processes from sending the same
        // user + match + stage notification at the same time.
        await client.query(
          `SELECT pg_advisory_xact_lock(
             hashtext($1),
             hashtext($2)
           )`,
          [
            `${user.id}:${match.match_id}`,
            stage,
          ]
        );

        // Check again after obtaining the lock.
        const { rows: already } = await client.query(
          `SELECT 1
           FROM notified_matches
           WHERE user_id = $1
             AND match_id = $2
             AND stage = $3
           LIMIT 1`,
          [
            user.id,
            match.match_id,
            stage,
          ]
        );

        if (already.length > 0) {
          await client.query("ROLLBACK");
          continue;
        }

        // Claim this notification BEFORE sending.
        // This guarantees that another cron/process cannot send it again.
        await client.query(
          `INSERT INTO notified_matches
             (user_id, match_id, stage)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, match_id, stage)
           DO NOTHING`,
          [
            user.id,
            match.match_id,
            stage,
          ]
        );

        await client.query("COMMIT");

        // Send only after the database claim succeeds.
        await buildAndSend(match, user);

        console.log(
          `[${stage}] email sent to ${user.email} for ` +
          `${match.home_club_name} vs ${match.away_club_name}`
        );
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {}

        // If the email failed, remove the claim so the next cron
        // run can retry it.
        try {
          await pool.query(
            `DELETE FROM notified_matches
             WHERE user_id = $1
               AND match_id = $2
               AND stage = $3`,
            [
              user.id,
              match.match_id,
              stage,
            ]
          );
        } catch (deleteErr) {
          console.warn(
            `[${stage}] failed to remove notification claim:`,
            deleteErr.message
          );
        }

        console.warn(
          `[${stage}] email to ${user.email} failed:`,
          err.message
        );
      } finally {
        client.release();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5a) 24h reminder
// ---------------------------------------------------------------------------
async function send24hReminders() {
  await runStagedReminder({
    stage: "24h",

    windowSql:
      `kickoff_at BETWEEN now()
       AND now() + interval '24 hours'`,

    buildAndSend: (match, user) =>
      sendMatch24hReminder({
        to: user.email,
        name: user.name,
        homeTeam: match.home_club_name,
        awayTeam: match.away_club_name,
        kickoffAt: match.kickoff_at,
        leagueName:
          LEAGUE_NAMES[match.league_id] ||
          match.league_id,
      }),
  });
}

// ---------------------------------------------------------------------------
// 5b) 2h reminder
// ---------------------------------------------------------------------------
async function send2hReminders() {
  await runStagedReminder({
    stage: "2h",

    windowSql:
      `kickoff_at BETWEEN now()
       AND now() + interval '2 hours'`,

    buildAndSend: (match, user) =>
      sendMatch2hReminder({
        to: user.email,
        name: user.name,
        homeTeam: match.home_club_name,
        awayTeam: match.away_club_name,
        kickoffAt: match.kickoff_at,
        leagueName:
          LEAGUE_NAMES[match.league_id] ||
          match.league_id,
      }),
  });
}

// ---------------------------------------------------------------------------
// 5c) Lineup announcement
// ---------------------------------------------------------------------------
async function sendLineupAnnouncements() {
  await runStagedReminder({
    stage: "lineup",

    windowSql:
      `kickoff_at BETWEEN now()
       AND now() + interval '45 minutes'
       AND lineup IS NOT NULL`,

    buildAndSend: (match, user) =>
      sendLineupAnnouncement({
        to: user.email,
        name: user.name,
        homeTeam: match.home_club_name,
        awayTeam: match.away_club_name,
        kickoffAt: match.kickoff_at,
        leagueName:
          LEAGUE_NAMES[match.league_id] ||
          match.league_id,
        lineup: match.lineup,
      }),
  });
}

// ---------------------------------------------------------------------------
// 5d) FINAL RESULT EMAIL
//
// IMPORTANT:
// A match is considered finished when its provider status is one of the
// finished statuses below.
//
// If your football provider uses another finished status, add it here.
// ---------------------------------------------------------------------------
async function sendResultAnnouncements() {
  const { rows: finishedMatches } = await pool.query(
    `SELECT *
     FROM matches_cache
     WHERE status IN (
       'FINISHED',
       'FT',
       'AFTER_PENALTIES',
       'AFTER_EXTRA_TIME'
     )
     AND kickoff_at <= now()`
  );

  for (const match of finishedMatches) {
    // IMPORTANT:
    // Only users who explicitly opted into THIS match.
    const { rows: interestedUsers } = await pool.query(
      `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
       JOIN match_notify_settings mns
         ON mns.user_id = u.id
       WHERE mns.match_id = $1
         AND mns.enabled = true`,
      [match.match_id]
    );

    for (const user of interestedUsers) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Lock this exact user + match + stage.
        await client.query(
          `SELECT pg_advisory_xact_lock(
             hashtext($1),
             hashtext($2)
           )`,
          [
            `${user.id}:${match.match_id}`,
            "result",
          ]
        );

        // Check whether result notification already exists.
        const { rows: already } = await client.query(
          `SELECT 1
           FROM notified_matches
           WHERE user_id = $1
             AND match_id = $2
             AND stage = 'result'
           LIMIT 1`,
          [
            user.id,
            match.match_id,
          ]
        );

        if (already.length > 0) {
          await client.query("ROLLBACK");
          continue;
        }

        // Claim BEFORE sending.
        await client.query(
          `INSERT INTO notified_matches
             (user_id, match_id, stage)
           VALUES ($1, $2, 'result')
           ON CONFLICT (user_id, match_id, stage)
           DO NOTHING`,
          [
            user.id,
            match.match_id,
          ]
        );

        await client.query("COMMIT");

        // Now send the email.
        await sendMatchResult({
          to: user.email,
          name: user.name,
          homeTeam: match.home_club_name,
          awayTeam: match.away_club_name,
          homeScore: match.home_score,
          awayScore: match.away_score,
          kickoffAt: match.kickoff_at,
          leagueName:
            LEAGUE_NAMES[match.league_id] ||
            match.league_id,
        });

        console.log(
          `[result] email sent to ${user.email} for ` +
          `${match.home_club_name} ` +
          `${match.home_score}-${match.away_score} ` +
          `${match.away_club_name}`
        );
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {}

        // Remove the claim if sending failed.
        try {
          await pool.query(
            `DELETE FROM notified_matches
             WHERE user_id = $1
               AND match_id = $2
               AND stage = 'result'`,
            [
              user.id,
              match.match_id,
            ]
          );
        } catch (deleteErr) {
          console.warn(
            "[result] failed to remove notification claim:",
            deleteErr.message
          );
        }

        console.warn(
          `[result] email to ${user.email} failed:`,
          err.message
        );
      } finally {
        client.release();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Match database upsert
// ---------------------------------------------------------------------------
async function upsertMatch(m) {
  await pool.query(
    `INSERT INTO matches_cache
       (
         match_id,
         league_id,
         home_club_id,
         home_club_name,
         away_club_id,
         away_club_name,
         status,
         home_score,
         away_score,
         minute,
         kickoff_at,
         lineup,
         updated_at
       )
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())

     ON CONFLICT (match_id) DO UPDATE SET
       status = EXCLUDED.status,
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       minute = EXCLUDED.minute,
       lineup = COALESCE(
         EXCLUDED.lineup,
         matches_cache.lineup
       ),
       updated_at = now()`,
    [
      m.match_id,
      m.league_id,
      m.home_club_id,
      m.home_club_name,
      m.away_club_id,
      m.away_club_name,
      m.status,
      m.home_score,
      m.away_score,
      m.minute,
      m.kickoff_at,
      m.lineup
        ? JSON.stringify(m.lineup)
        : null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Poll lineups and notify
// ---------------------------------------------------------------------------
async function pollLineupsAndNotify() {
  await pollUpcomingLineups();
  await sendLineupAnnouncements();
}

// ---------------------------------------------------------------------------
// Start cron jobs
// ---------------------------------------------------------------------------
export function startCronJobs() {
  cron.schedule(
    "0 4 * * *",
    syncSquads
  );

  cron.schedule(
    "*/30 * * * *",
    syncFixturesResults
  );

  cron.schedule(
    "*/1 * * * *",
    pollLiveMatches
  );

  cron.schedule(
    "*/5 * * * *",
    pollLineupsAndNotify
  );

  cron.schedule(
    "*/5 * * * *",
    send24hReminders
  );

  cron.schedule(
    "*/5 * * * *",
    send2hReminders
  );

  // Check finished matches every 5 minutes.
  cron.schedule(
    "*/5 * * * *",
    sendResultAnnouncements
  );

  console.log("⏰ Cron jobs scheduled.");

  // Initial sync on boot
  syncFixturesResults();
  syncSquads();
}
