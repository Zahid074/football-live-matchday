import React, { useEffect, useState, useCallback } from "react";
import { GoogleLogin } from "@react-oauth/google";
import {
  Trophy, Star, Bell, Users, Table2, ChevronLeft, Mail, Check,
  Radio, Sun, Moon, LogOut, Search, Shield,
} from "lucide-react";
import { useTheme } from "./ThemeContext.jsx";
import { api, setToken } from "./api.js";

const LEAGUE_META = {
  laliga: { name: "La Liga", country: "Spain", color: "#FF4438" },
  epl: { name: "Premier League", country: "England", color: "#3D195B" },
  bundesliga: { name: "Bundesliga", country: "Germany", color: "#D3010C" },
  seriea: { name: "Serie A", country: "Italy", color: "#024494" },
  ligue1: { name: "Ligue 1", country: "France", color: "#0D1A5C" },
  mls: { name: "MLS", country: "USA/Canada", color: "#A5122A" },
};

// --- URL <-> route mapping -------------------------------------------------
// We keep real browser history entries for every screen (home / league /
// club / player) instead of only flipping React state. That's what makes
// the phone/browser back button step *inside* the app one screen at a time
// instead of leaving it immediately — no cookies needed for this, it's a
// History API concern, not a storage one.
function routeFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const tab = new URLSearchParams(window.location.search).get("tab") || "overview";
  if (parts[0] === "leagues" && parts[1]) return { view: "league", leagueId: parts[1], tab };
  if (parts[0] === "clubs" && parts[1] && parts[2] === "players" && parts[3]) {
    return { view: "player", clubId: parts[1], playerId: parts[3] };
  }
  if (parts[0] === "clubs" && parts[1]) return { view: "club", clubId: parts[1] };
  return { view: "home" };
}

function pathFromRoute(r) {
  if (r.view === "league") return `/leagues/${r.leagueId}${r.tab && r.tab !== "overview" ? `?tab=${r.tab}` : ""}`;
  if (r.view === "club") return `/clubs/${r.clubId}`;
  if (r.view === "player") return `/clubs/${r.clubId}/players/${r.playerId}`;
  return "/";
}

export default function App() {
  const { palette: P, mode, toggle } = useTheme();
  const [leagues, setLeagues] = useState([]);
  const [view, setView] = useState("home"); // home | league | club | player
  const [leagueId, setLeagueId] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [tab, setTab] = useState("overview");

  // Apply a route object to React state (used for both pushState navigation
  // and popstate/back-forward events).
  const applyRoute = useCallback((r) => {
    setView(r.view);
    setLeagueId(r.leagueId || null);
    setClubId(r.clubId || null);
    setPlayerId(r.playerId || null);
    setTab(r.tab || "overview");
  }, []);

  // Push a new route: adds a real history entry + updates the address bar.
  const navigate = useCallback((r) => {
    window.history.pushState(r, "", pathFromRoute(r));
    applyRoute(r);
  }, [applyRoute]);

  useEffect(() => {
    // On first load, normalise whatever URL we landed on into a route and
    // replace (not push) the current entry so back/forward stays sane.
    const initial = routeFromLocation();
    window.history.replaceState(initial, "", pathFromRoute(initial));
    applyRoute(initial);

    const onPopState = (e) => applyRoute(e.state || routeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute]);

  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]); // [{club_id, league_id, club_name}]
  const [notifySettings, setNotifySettings] = useState({}); // {club_id: enabled}
  const [matchNotifications, setMatchNotifications] = useState({}); // {match_id: enabled}

  useEffect(() => {
    api.getLeagues().then(setLeagues).catch(() => setLeagues(Object.entries(LEAGUE_META).map(([id, m]) => ({ id, ...m }))));
  }, []);

  const refreshMe = useCallback(() => {
    api.getMe().then(({ user, favorites, notifySettings, matchNotifications }) => {
      setUser(user);
      setFavorites(favorites);
      const map = {};
      notifySettings.forEach((n) => (map[n.club_id] = n.enabled));
      setNotifySettings(map);
      const matchMap = {};
      (matchNotifications || []).forEach((n) => (matchMap[n.match_id] = n.enabled));
      setMatchNotifications(matchMap);
    }).catch(() => { setToken(null); setUser(null); });
  }, []);

  useEffect(() => {
    if (localStorage.getItem("lmw_token")) refreshMe();
  }, [refreshMe]);

  const handleGoogleSuccess = async (credentialResponse) => {
    const { token } = await api.loginWithGoogle(credentialResponse.credential);
    setToken(token);
    refreshMe();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setFavorites([]);
    setNotifySettings({});
    setMatchNotifications({});
  };

  const isFavorite = (id) => favorites.some((f) => f.club_id === id);

  const toggleFavorite = async (club, currentLeagueId) => {
    if (!user) return alert("Notification / favourites need Google sign-in first.");
    if (isFavorite(club.club_id)) {
      await api.removeFavorite(club.club_id);
    } else {
      await api.addFavorite(club.club_id, currentLeagueId);
    }
    refreshMe();
  };

  const toggleNotify = async (id) => {
    const next = !(notifySettings[id] ?? true);
    await api.setNotify(id, next);
    setNotifySettings((p) => ({ ...p, [id]: next }));
  };

  const toggleMatchNotify = async (matchId) => {
    if (!user) return alert("Sign in with Google to manage match notifications.");
    const next = !(matchNotifications[matchId] ?? false);
    await api.setMatchNotify(matchId, next);
    setMatchNotifications((p) => ({ ...p, [matchId]: next }));
  };

  const openLeague = (id) => navigate({ view: "league", leagueId: id, tab: "overview" });
  const openClub = (id) => navigate({ view: "club", clubId: id });
  const openPlayer = (cId, pId) => navigate({ view: "player", clubId: cId, playerId: pId });
  const changeTab = (id) => navigate({ view: "league", leagueId, tab: id });
  const goHome = () => navigate({ view: "home" });
  const goBack = () => window.history.back();

  const wrapStyle = { background: P.bg, color: P.text, minHeight: "100vh" };

  return (
    <div style={wrapStyle} className="transition-colors duration-300">
      <TopBar P={P} mode={mode} onToggleTheme={toggle} user={user} onLogout={logout} onGoogleSuccess={handleGoogleSuccess} />
      <TopWire P={P} />

      {view === "home" && (
        <Home P={P} leagues={leagues.length ? leagues : Object.entries(LEAGUE_META).map(([id, m]) => ({ id, ...m }))} onOpen={openLeague} />
      )}

      {view === "league" && leagueId && (
        <LeagueDashboard
          P={P}
          leagueId={leagueId}
          league={LEAGUE_META[leagueId] || { name: leagueId, color: P.accent }}
          tab={tab} setTab={changeTab}
          onBack={goBack}
          onClub={openClub}
          favorites={favorites}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          notifySettings={notifySettings}
          toggleNotify={toggleNotify}
          matchNotifications={matchNotifications}
          toggleMatchNotify={toggleMatchNotify}
          user={user}
        />
      )}

      {view === "club" && clubId && (
        <ClubPage
          P={P}
          clubId={clubId}
          leagueColor={leagueId ? (LEAGUE_META[leagueId]?.color || P.accent) : P.accent}
          onBack={goBack}
          onPlayer={(pId) => openPlayer(clubId, pId)}
        />
      )}

      {view === "player" && clubId && playerId && (
        <PlayerPage
          P={P}
          clubId={clubId}
          playerId={playerId}
          accent={leagueId ? (LEAGUE_META[leagueId]?.color || P.accent) : P.accent}
          onBack={goBack}
          onClub={openClub}
        />
      )}
    </div>
  );
}

/* ----------------------------- top bar / wire ----------------------------- */

function TopBar({ P, mode, onToggleTheme, user, onLogout, onGoogleSuccess }) {
  return (
    <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: `1px solid ${P.border}` }}>
      <div className="flex items-center gap-2 font-black uppercase tracking-tight text-sm">
        <Radio size={16} style={{ color: P.accent }} /> Live Matchday Wire
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onToggleTheme} className="p-2 rounded-full" style={{ border: `1px solid ${P.border}` }}>
          {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        {user ? (
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span style={{ color: P.textDim }}>{user.email}</span>
            <button onClick={onLogout} className="p-2 rounded-full" style={{ border: `1px solid ${P.border}` }}>
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <div className="scale-90 origin-right">
            <GoogleLogin onSuccess={onGoogleSuccess} onError={() => alert("Google sign-in failed")} size="medium" theme={mode === "dark" ? "filled_black" : "outline"} />
          </div>
        )}
      </div>
    </div>
  );
}

function TopWire({ P }) {
  const [items, setItems] = useState(["● LIVE WIRE"]);
  useEffect(() => {
    api.getLiveMatches().then((matches) => {
      if (matches.length === 0) return setItems(["● No live matches right now"]);
      setItems(matches.map((m) => `${m.home_club_name} ${m.home_score ?? 0}–${m.away_score ?? 0} ${m.away_club_name}`));
    }).catch(() => {});
  }, []);
  return (
    <div className="w-full overflow-hidden py-2" style={{ background: P.panel, borderBottom: `1px solid ${P.border}` }}>
      <div className="whitespace-nowrap animate-[scroll_28s_linear_infinite] text-xs font-bold tracking-wider flex gap-10 px-6" style={{ display: "inline-flex", color: P.textDim }}>
        {[...items, ...items].map((t, i) => <span key={i}>{t}</span>)}
      </div>
      <style>{`@keyframes scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

/* --------------------------------- home ---------------------------------- */

function Home({ P, leagues, onOpen }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-14">
      <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Six Leagues. One Wire.</h1>
      <p className="mb-10" style={{ color: P.textDim }}>Live scores, squads, formations and kickoff alerts — pick a league to dive in.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {leagues.map((l) => (
          <button key={l.id} onClick={() => onOpen(l.id)}
            className="text-left rounded-2xl p-6 hover:-translate-y-1 transition-transform"
            style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <div className="w-3 h-3 rounded-full mb-4" style={{ background: l.color }} />
            <h2 className="text-xl font-black uppercase tracking-tight mb-1">{l.name}</h2>
            <p className="text-xs" style={{ color: P.textFaint }}>{l.country}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- league dashboard ---------------------------- */

const MENU = [
  { id: "overview", label: "Overview", icon: Radio },
  { id: "table", label: "Table", icon: Table2 },
  { id: "addFavourite", label: "Add Favourite Club", icon: Star },
  { id: "favouriteStatus", label: "Favourite Club Status", icon: Trophy },
  { id: "notify", label: "Notify Schedule", icon: Bell },
  { id: "allClubs", label: "See All Clubs", icon: Users },
];

function LeagueDashboard({ P, leagueId, league, tab, setTab, onBack, onClub, favorites, isFavorite, toggleFavorite, notifySettings, toggleNotify, matchNotifications, toggleMatchNotify, user }) {
  const [table, setTable] = useState([]);
  const [results, setResults] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [season, setSeason] = useState(null);

  useEffect(() => {
    api.getTable(leagueId).then(setTable).catch(() => setTable([]));
    api.getResults(leagueId).then(setResults).catch(() => setResults([]));
    api.getFixtures(leagueId).then(setFixtures).catch(() => setFixtures([]));
    api.getClubs(leagueId).then(setClubs).catch(() => setClubs([]));
    api.getSeason(leagueId).then(setSeason).catch(() => setSeason(null));
  }, [leagueId]);

  const favInLeague = favorites.filter((f) => f.league_id === leagueId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-6" style={{ color: P.textDim }}>
        <ChevronLeft size={16} /> All Leagues
      </button>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: league.color }} />
        <h1 className="text-xl font-black uppercase tracking-tight">{league.name}</h1>
      </div>
      {season?.label && (
        <p className="text-xs font-semibold uppercase tracking-wide mb-6" style={{ color: P.textFaint }}>
          Season {season.label}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        {MENU.map((m) => (
          <button key={m.id} onClick={() => setTab(m.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-colors"
            style={{
              background: tab === m.id ? league.color : "transparent",
              border: `1px solid ${tab === m.id ? league.color : P.border}`,
              color: tab === m.id ? "#fff" : P.textDim,
            }}>
            <m.icon size={12} /> {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div>
          {tab === "overview" && (
            <>
              {table.length === 0 && (
                <p className="text-sm mb-6" style={{ color: P.textFaint }}>
                  Table unavailable — this league may not be included in your current API plan.
                </p>
              )}
              {table.length > 0 && <Section P={P} title="Table" icon={Table2}><StandingsTable P={P} rows={table} clubs={clubs} onClub={onClub} accent={league.color} /></Section>}
              <Section P={P} title="This Season's Results" icon={Trophy}><MatchList P={P} matches={results} empty="No results yet." /></Section>
              <Section P={P} title="Upcoming Fixtures" icon={Radio}>
                <MatchList P={P} matches={fixtures} empty="No fixtures scheduled." user={user} matchNotifications={matchNotifications} onToggleMatchNotify={toggleMatchNotify} />
              </Section>
            </>
          )}

          {tab === "table" && <StandingsTable P={P} rows={table} clubs={clubs} onClub={onClub} accent={league.color} />}

          {tab === "addFavourite" && (
            <ClubGrid P={P} clubs={clubs} onClub={onClub} accent={league.color}
              action={(c) => (
                <button onClick={() => toggleFavorite(c, leagueId)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ background: isFavorite(c.club_id) ? league.color : "transparent", border: `1px solid ${league.color}`, color: isFavorite(c.club_id) ? "#fff" : league.color }}>
                  {isFavorite(c.club_id) ? "★ Favourited" : "☆ Add Favourite"}
                </button>
              )} />
          )}

          {tab === "favouriteStatus" && (
            <FavouriteStatus P={P} favIds={favInLeague.map((f) => f.club_id)} table={table} clubs={clubs} onClub={onClub} accent={league.color} />
          )}

          {tab === "notify" && (
            <>
              <NotifyPanel P={P} user={user} clubs={clubs.filter((c) => favInLeague.some((f) => f.club_id === c.club_id))}
                notifySettings={notifySettings} toggleNotify={toggleNotify} accent={league.color} />
              <div className="mt-8">
                <Section P={P} title="All Upcoming Fixtures — Per-Match Alerts" icon={Bell}>
                  <MatchList P={P} matches={fixtures} empty="No fixtures scheduled." user={user} matchNotifications={matchNotifications} onToggleMatchNotify={toggleMatchNotify} />
                </Section>
              </div>
            </>
          )}

          {tab === "allClubs" && <ClubGrid P={P} clubs={clubs} onClub={onClub} accent={league.color} />}
        </div>

        <FavSidebar P={P} favorites={favorites} onClub={onClub} accent={league.color} user={user} />
      </div>
    </div>
  );
}

function Section({ P, title, icon: Icon, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: P.textDim }}>
        <Icon size={13} /> {title}
      </div>
      {children}
    </div>
  );
}

function StandingsTable({ P, rows, clubs, onClub, accent }) {
  const clubFor = (id) => clubs.find((c) => c.club_id === id) || rows.find((r) => r.club_id === id) || {};
  const nameOf = (club, id) => club.name || `Club #${id}`;
  if (rows.length === 0) return <p style={{ color: P.textFaint }} className="text-sm">No table data available.</p>;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide" style={{ color: P.textFaint, borderBottom: `1px solid ${P.border}` }}>
            <th className="text-left py-3 px-4">#</th>
            <th className="text-left py-3 px-4">Club</th>
            <th className="text-center py-3 px-4">P</th>
            <th className="text-center py-3 px-4">GD</th>
            <th className="text-center py-3 px-4">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const club = clubFor(r.club_id);
            return (
              <tr key={r.club_id} onClick={() => onClub(r.club_id)} className="cursor-pointer hover:opacity-80"
                style={{ borderBottom: i < rows.length - 1 ? `1px solid ${P.border}` : "none" }}>
                <td className="py-3 px-4 font-bold" style={{ color: i < 4 ? accent : P.textDim }}>{r.position}</td>
                <td className="py-3 px-4 font-semibold">
                  <div className="flex items-center gap-2">
                    <ClubCrest src={club.crest} alt={club.name} size={20} accent={accent} P={P} />
                    <span>{nameOf(club, r.club_id)}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-center" style={{ color: P.textDim }}>{r.played}</td>
                <td className="py-3 px-4 text-center" style={{ color: P.textDim }}>{r.goal_diff > 0 ? "+" : ""}{r.goal_diff}</td>
                <td className="py-3 px-4 text-center font-black">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchList({ P, matches, empty, user, matchNotifications, onToggleMatchNotify }) {
  if (!matches || matches.length === 0) return <p style={{ color: P.textFaint }} className="text-sm">{empty}</p>;
  const isUpcoming = (m) => m.status === "SCHEDULED" || m.status === "TIMED";
  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const on = matchNotifications?.[m.match_id] ?? false;
        return (
          <div key={m.match_id} className="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <span className="font-semibold flex-1">{m.home_club_name}</span>
            <span className="font-black shrink-0" style={{ color: m.status === "IN_PLAY" || m.status === "PAUSED" ? P.accent : P.textDim }}>
              {m.status === "FINISHED" || m.status === "IN_PLAY" || m.status === "PAUSED"
                ? `${m.home_score ?? 0} – ${m.away_score ?? 0}`
                : new Date(m.kickoff_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
            </span>
            <span className="font-semibold flex-1 text-right">{m.away_club_name}</span>
            {onToggleMatchNotify && isUpcoming(m) && (
              <button onClick={() => onToggleMatchNotify(m.match_id)} className="p-1.5 rounded-full shrink-0"
                style={{ border: `1px solid ${P.border}`, color: on ? "#C9FF3D" : P.textFaint }}
                title={on ? "Notification on" : "Notification off"}>
                <Bell size={14} fill={on ? "currentColor" : "none"} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ClubGrid({ P, clubs, onClub, accent, action }) {
  if (clubs.length === 0) return <p style={{ color: P.textFaint }} className="text-sm">No clubs loaded yet.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {clubs.map((c) => (
        <div key={c.club_id} className="rounded-xl p-4 flex flex-col items-start gap-3" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
          <button onClick={() => onClub(c.club_id)} className="flex items-center gap-2 text-left">
            <ClubCrest src={c.crest} alt={c.name} size={32} accent={accent} P={P} />
            <span className="text-sm font-semibold">{c.name}</span>
          </button>
          {action && action(c)}
        </div>
      ))}
    </div>
  );
}

function FavouriteStatus({ P, favIds, table, clubs, onClub, accent }) {
  const favRows = table.filter((r) => favIds.includes(r.club_id));
  if (favIds.length === 0) return <p style={{ color: P.textFaint }} className="text-sm">No favourite clubs in this league yet. Add one from "Add Favourite Club".</p>;
  return <StandingsTable P={P} rows={favRows.length ? favRows : table.filter(r=>favIds.includes(r.club_id))} clubs={clubs} onClub={onClub} accent={accent} />;
}

function FavSidebar({ P, favorites, onClub, accent, user }) {
  return (
    <aside className="lg:sticky lg:top-6 h-fit">
      <FavMatchTicker P={P} accent={accent} onClub={onClub} user={user} />
      <div className="rounded-2xl p-5" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
        <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: P.textDim }}>
          <Star size={13} style={{ color: accent }} /> Favourites
        </div>
        {favorites.length === 0 ? (
          <p className="text-xs leading-relaxed" style={{ color: P.textFaint }}>Sign in and star a club to pin it here.</p>
        ) : (
          <div className="space-y-2">
            {favorites.map((f) => (
              <button key={f.club_id} onClick={() => onClub(f.club_id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                style={{ border: `1px solid ${P.border}` }}>
                <ClubCrest src={f.crest} alt={f.club_name} size={32} accent={accent} P={P} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{f.club_name || f.club_id}</div>
                  <div className="text-[10px] uppercase tracking-wide truncate" style={{ color: P.textFaint }}>
                    {LEAGUE_META[f.league_id]?.name || f.league_id}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// Shows favourite clubs' live matches, or ones kicking off within 30 minutes.
// NOTE: only score + live status are available from the current data provider —
// detailed stats (shots, possession, cards) would need a different/paid API.
function FavMatchTicker({ P, accent, onClub, user }) {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (!user) { setMatches([]); return; }
    const load = () => api.getFavMatches().then(setMatches).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [user]);

  if (!user || matches.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {matches.map((m) => (
        <div key={m.match_id} className="rounded-xl p-3" style={{ background: P.panel, border: `1px solid ${accent}` }}>
          <div className="flex items-center justify-between text-sm font-semibold gap-2">
            <button onClick={() => onClub(m.home_club_id)} className="hover:underline text-left truncate">{m.home_club_name}</button>
            <span className="text-xs font-bold shrink-0" style={{ color: accent }}>vs</span>
            <button onClick={() => onClub(m.away_club_id)} className="hover:underline text-right truncate">{m.away_club_name}</button>
          </div>
          <div className="text-center text-[11px] mt-1" style={{ color: P.textDim }}>
            {m.status === "IN_PLAY" || m.status === "PAUSED"
              ? `LIVE${m.minute ? ` • ${m.minute}'` : ""}`
              : `Kicks off ${new Date(m.kickoff_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}`}
          </div>
          <div className="flex items-center justify-center gap-4 text-lg font-black mt-1">
            <span>{m.home_score ?? 0}</span>
            <span style={{ color: P.textFaint }}>–</span>
            <span>{m.away_score ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotifyPanel({ P, user, clubs, notifySettings, toggleNotify, accent }) {
  if (!user) {
    return <p style={{ color: P.textFaint }} className="text-sm">Sign in with Google (top right) to manage kickoff email alerts.</p>;
  }
  if (clubs.length === 0) {
    return <p style={{ color: P.textFaint }} className="text-sm">Add favourite clubs first — notifications are set per favourite club.</p>;
  }
  return (
    <div className="space-y-2">
      {clubs.map((c) => {
        const on = notifySettings[c.club_id] ?? true;
        return (
          <div key={c.club_id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
            <span className="text-sm font-semibold">{c.name}</span>
            <button onClick={() => toggleNotify(c.club_id)} className="w-11 h-6 rounded-full relative transition-colors"
              style={{ background: on ? accent : P.border }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- club page ------------------------------- */

function ClubPage({ P, clubId, leagueColor, onBack, onPlayer }) {
  const [club, setClub] = useState(null);
  const [formation, setFormation] = useState(null);

  useEffect(() => {
    setClub(null);
    api.getClub(clubId).then(setClub).catch(() => setClub(null));
    api.getFormation(clubId).then(setFormation).catch(() => setFormation(null));
  }, [clubId]);

  if (!club) return <div className="max-w-4xl mx-auto px-6 py-10" style={{ color: P.textDim }}>Loading club…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-6" style={{ color: P.textDim }}>
        <ChevronLeft size={16} /> Back
      </button>

      <div className="flex items-center gap-3 mb-1">
        <ClubCrest src={club.crest} alt={club.name} size={48} accent={leagueColor} P={P} />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">{club.name}</h1>
          <p className="text-sm" style={{ color: P.textDim }}>Manager: {club.manager || "Unknown"}</p>
          {club.season?.label && (
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: P.textFaint }}>
              Squad — Season {club.season.label}
            </p>
          )}
        </div>
      </div>

      <Section P={P} title="Full Squad" icon={Users}>
        <SquadList P={P} squad={club.squad || []} accent={leagueColor} onPlayer={onPlayer} />
      </Section>

      <Section P={P} title="Predicted Formation" icon={Trophy}>
        {formation?.available ? (
          <Pitch P={P} formation={formation} accent={leagueColor} />
        ) : (
          <p className="text-sm" style={{ color: P.textFaint }}>
            {formation?.reason || "Formation not released yet — it usually appears 20–30 minutes before kickoff."}
          </p>
        )}
      </Section>
    </div>
  );
}

function Pitch({ P, formation, accent }) {
  const lineup = formation.lineup || [];
  const rows = {
    Goalkeeper: lineup.filter((p) => /keeper/i.test(p.position)),
    Defence: lineup.filter((p) => /defen(c|s)e|back/i.test(p.position)),
    Midfield: lineup.filter((p) => /mid/i.test(p.position)),
    Offence: lineup.filter((p) => /forward|wing|offen|striker/i.test(p.position)),
  };
  const grouped = Object.entries(rows).filter(([, ps]) => ps.length > 0);
  const remaining = lineup.filter((p) => !grouped.flatMap(([, ps]) => ps).includes(p));

  return (
    <div className="rounded-2xl p-6" style={{ background: "linear-gradient(180deg,#0d3b1e,#0a2e17)" }}>
      {formation.formation && <p className="text-center text-xs font-bold mb-4" style={{ color: accent }}>{formation.formation}</p>}
      <div className="space-y-4">
        {grouped.reverse().map(([label, players]) => (
          <div key={label} className="flex justify-center gap-3 flex-wrap">
            {players.map((p) => (
              <div key={p.id || p.name} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black" style={{ background: accent, color: "#0A0D0C" }}>
                  {p.shirtNumber ?? "—"}
                </div>
                <span className="text-[10px] text-white/90 mt-1 max-w-[64px] text-center leading-tight">{p.name}</span>
              </div>
            ))}
          </div>
        ))}
        {remaining.length > 0 && (
          <div className="flex justify-center gap-3 flex-wrap">
            {remaining.map((p) => (
              <div key={p.id || p.name} className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black" style={{ background: accent, color: "#0A0D0C" }}>
                  {p.shirtNumber ?? "—"}
                </div>
                <span className="text-[10px] text-white/90 mt-1 max-w-[64px] text-center leading-tight">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ club crest -------------------------------- */
// football-data.org gives us a real crest URL per club (already returned by
// the backend as `crest`); we just weren't rendering it anywhere. Falls back
// to a plain badge icon if the image is missing or fails to load.
function ClubCrest({ src, alt, size = 32, accent, P }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, background: accent }}>
        <Shield size={Math.round(size * 0.5)} color="#fff" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt || "club crest"}
      onError={() => setFailed(true)}
      className="rounded-full object-contain shrink-0"
      style={{ width: size, height: size, background: "#fff", padding: Math.max(2, size * 0.08), border: `1px solid ${P?.border || "rgba(0,0,0,0.1)"}` }}
    />
  );
}

/* ------------------------------ player avatar ------------------------------ */
// The free football-data.org plan doesn't expose player photos at all, so
// this generates a consistent initials avatar per player instead of a blank
// silhouette — clearly a placeholder, not pretending to be a real photo.
function PlayerAvatar({ name, size = 40 }) {
  const url = `https://ui-avatars.com/api/?background=random&color=fff&bold=true&size=128&name=${encodeURIComponent(name || "?")}`;
  return (
    <img
      src={url}
      alt={name || "player"}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/* -------------------------------- squad list -------------------------------- */

function SquadList({ P, squad, accent, onPlayer }) {
  const [query, setQuery] = useState("");
  const [posFilter, setPosFilter] = useState("all");

  const positions = ["all", ...Array.from(new Set(squad.map((p) => p.position).filter(Boolean)))];

  const filtered = squad.filter((p) => {
    const matchesQuery = (p.name || "").toLowerCase().includes(query.trim().toLowerCase());
    const matchesPos = posFilter === "all" || p.position === posFilter;
    return matchesQuery && matchesPos;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: P.textFaint }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a player…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: P.panel, border: `1px solid ${P.border}`, color: P.text }}
          />
        </div>
        {positions.length > 1 && (
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: P.panel, border: `1px solid ${P.border}`, color: P.text }}
          >
            {positions.map((pos) => (
              <option key={pos} value={pos}>{pos === "all" ? "All positions" : pos}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: P.textFaint }}>No players match that search.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((p) => (
            <button
              key={p.provider_player_id}
              onClick={() => onPlayer(p.provider_player_id)}
              className="rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:-translate-y-0.5 transition-transform"
              style={{ background: P.panel, border: `1px solid ${P.border}` }}
            >
              <PlayerAvatar name={p.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{p.name}</span>
                  {p.shirtNumber && <span className="text-xs font-black shrink-0" style={{ color: accent }}>#{p.shirtNumber}</span>}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs" style={{ color: P.textFaint }}>{p.position}</span>
                  <span className="text-xs" style={{ color: P.textFaint }}>{p.nationality}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- player page -------------------------------- */

function PlayerPage({ P, clubId, playerId, accent, onBack, onClub }) {
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPlayer(null);
    setError(false);
    api.getPlayer(clubId, playerId).then(setPlayer).catch(() => setError(true));
  }, [clubId, playerId]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-6" style={{ color: P.textDim }}>
          <ChevronLeft size={16} /> Back
        </button>
        <p className="text-sm" style={{ color: P.textFaint }}>Couldn't load this player's profile.</p>
      </div>
    );
  }

  if (!player) return <div className="max-w-2xl mx-auto px-6 py-10" style={{ color: P.textDim }}>Loading player…</div>;

  const age = player.dateOfBirth
    ? Math.floor((Date.now() - new Date(player.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-6" style={{ color: P.textDim }}>
        <ChevronLeft size={16} /> Back to squad
      </button>

      <div className="flex items-center gap-4 mb-8">
        <PlayerAvatar name={player.name} size={72} />
        <div>
          <h1 className="text-2xl font-black tracking-tight">{player.name}</h1>
          {player.club_name && (
            <button onClick={() => onClub(player.club_id)} className="flex items-center gap-2 mt-1 hover:underline">
              <ClubCrest src={player.club_crest} alt={player.club_name} size={18} accent={accent} P={P} />
              <span className="text-xs font-semibold" style={{ color: P.textDim }}>{player.club_name}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <Stat P={P} label="Position" value={player.position || "—"} />
        <Stat P={P} label="Shirt No." value={player.shirtNumber ? `#${player.shirtNumber}` : "—"} />
        <Stat P={P} label="Nationality" value={player.nationality || "—"} />
        <Stat P={P} label="Date of Birth" value={player.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
        <Stat P={P} label="Age" value={age !== null ? String(age) : "—"} />
        <Stat P={P} label="Birthplace" value={player.placeOfBirth || player.countryOfBirth || "—"} />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: P.textFaint }}>
        Match-by-match stats (goals, assists, appearances) aren't available on the current data plan —
        this page shows everything the provider exposes for free-tier squads. The photo above is a
        generated initials avatar, since the API doesn't provide real player photos.
      </p>
    </div>
  );
}

function Stat({ P, label, value }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: P.textFaint }}>{label}</div>
      <div className="text-sm font-bold truncate">{value}</div>
    </div>
  );
}
