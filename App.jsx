import React, { useEffect, useState, useCallback } from "react";
import { GoogleLogin } from "@react-oauth/google";
import {
  Trophy, Star, Bell, Users, Table2, ChevronLeft, Mail, Check,
  Shirt, User, Radio, Sun, Moon, LogOut,
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

export default function App() {
  const { palette: P, mode, toggle } = useTheme();
  const [leagues, setLeagues] = useState([]);
  const [view, setView] = useState("home"); // home | league | club
  const [leagueId, setLeagueId] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [tab, setTab] = useState("overview");

  const [user, setUser] = useState(null);
  const [favorites, setFavorites] = useState([]); // [{club_id, league_id}]
  const [notifySettings, setNotifySettings] = useState({}); // {club_id: enabled}

  useEffect(() => {
    api.getLeagues().then(setLeagues).catch(() => setLeagues(Object.entries(LEAGUE_META).map(([id, m]) => ({ id, ...m }))));
  }, []);

  const refreshMe = useCallback(() => {
    api.getMe().then(({ user, favorites, notifySettings }) => {
      setUser(user);
      setFavorites(favorites);
      const map = {};
      notifySettings.forEach((n) => (map[n.club_id] = n.enabled));
      setNotifySettings(map);
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

  const openLeague = (id) => { setLeagueId(id); setTab("overview"); setView("league"); };
  const openClub = (id) => { setClubId(id); setView("club"); };
  const goHome = () => { setView("home"); setLeagueId(null); };

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
          tab={tab} setTab={setTab}
          onBack={goHome}
          onClub={openClub}
          favorites={favorites}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          notifySettings={notifySettings}
          toggleNotify={toggleNotify}
          user={user}
        />
      )}

      {view === "club" && clubId && (
        <ClubPage
          P={P}
          clubId={clubId}
          leagueColor={leagueId ? (LEAGUE_META[leagueId]?.color || P.accent) : P.accent}
          onBack={() => setView(leagueId ? "league" : "home")}
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

function LeagueDashboard({ P, leagueId, league, tab, setTab, onBack, onClub, favorites, isFavorite, toggleFavorite, notifySettings, toggleNotify, user }) {
  const [table, setTable] = useState([]);
  const [results, setResults] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [clubs, setClubs] = useState([]);

  useEffect(() => {
    api.getTable(leagueId).then(setTable).catch(() => setTable([]));
    api.getResults(leagueId).then(setResults).catch(() => setResults([]));
    api.getFixtures(leagueId).then(setFixtures).catch(() => setFixtures([]));
    api.getClubs(leagueId).then(setClubs).catch(() => setClubs([]));
  }, [leagueId]);

  const favInLeague = favorites.filter((f) => f.league_id === leagueId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide mb-6" style={{ color: P.textDim }}>
        <ChevronLeft size={16} /> All Leagues
      </button>
      <div className="flex items-center gap-2 mb-6">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: league.color }} />
        <h1 className="text-xl font-black uppercase tracking-tight">{league.name}</h1>
      </div>

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
              <Section P={P} title="Upcoming Fixtures" icon={Radio}><MatchList P={P} matches={fixtures} empty="No fixtures scheduled." /></Section>
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
            <NotifyPanel P={P} user={user} clubs={clubs.filter((c) => favInLeague.some((f) => f.club_id === c.club_id))}
              notifySettings={notifySettings} toggleNotify={toggleNotify} accent={league.color} />
          )}

          {tab === "allClubs" && <ClubGrid P={P} clubs={clubs} onClub={onClub} accent={league.color} />}
        </div>

        <FavSidebar P={P} favorites={favorites} onClub={onClub} accent={league.color} />
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
  const nameFor = (id) => clubs.find((c) => c.club_id === id)?.name || rows.find(r=>r.club_id===id)?.name || id;
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
          {rows.map((r, i) => (
            <tr key={r.club_id} onClick={() => onClub(r.club_id)} className="cursor-pointer hover:opacity-80"
              style={{ borderBottom: i < rows.length - 1 ? `1px solid ${P.border}` : "none" }}>
              <td className="py-3 px-4 font-bold" style={{ color: i < 4 ? accent : P.textDim }}>{r.position}</td>
              <td className="py-3 px-4 font-semibold">{nameFor(r.club_id)}</td>
              <td className="py-3 px-4 text-center" style={{ color: P.textDim }}>{r.played}</td>
              <td className="py-3 px-4 text-center" style={{ color: P.textDim }}>{r.goal_diff > 0 ? "+" : ""}{r.goal_diff}</td>
              <td className="py-3 px-4 text-center font-black">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchList({ P, matches, empty }) {
  if (!matches || matches.length === 0) return <p style={{ color: P.textFaint }} className="text-sm">{empty}</p>;
  return (
    <div className="space-y-2">
      {matches.map((m) => (
        <div key={m.match_id} className="flex items-center justify-between rounded-xl px-4 py-3 text-sm"
          style={{ background: P.panel, border: `1px solid ${P.border}` }}>
          <span className="font-semibold">{m.home_club_name}</span>
          <span className="font-black" style={{ color: m.status === "IN_PLAY" || m.status === "PAUSED" ? P.accent : P.textDim }}>
            {m.status === "FINISHED" || m.status === "IN_PLAY" || m.status === "PAUSED"
              ? `${m.home_score ?? 0} – ${m.away_score ?? 0}`
              : new Date(m.kickoff_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="font-semibold">{m.away_club_name}</span>
        </div>
      ))}
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: accent }}><User size={14} /></div>
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

function FavSidebar({ P, favorites, onClub, accent }) {
  return (
    <aside className="lg:sticky lg:top-6 h-fit">
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
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: accent }}><User size={14} /></div>
                <span className="text-sm font-semibold truncate">{f.club_id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
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

function ClubPage({ P, clubId, leagueColor, onBack }) {
  const [club, setClub] = useState(null);
  const [formation, setFormation] = useState(null);

  useEffect(() => {
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
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: leagueColor }}><Shirt size={20} /></div>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">{club.name}</h1>
          <p className="text-sm" style={{ color: P.textDim }}>Manager: {club.manager || "Unknown"}</p>
        </div>
      </div>

      <Section P={P} title="Full Squad" icon={Users}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(club.squad || []).map((p) => (
            <div key={p.provider_player_id} className="rounded-xl px-4 py-3" style={{ background: P.panel, border: `1px solid ${P.border}` }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{p.name}</span>
                {p.shirtNumber && <span className="text-xs font-black" style={{ color: leagueColor }}>#{p.shirtNumber}</span>}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs" style={{ color: P.textFaint }}>{p.position}</span>
                <span className="text-xs" style={{ color: P.textFaint }}>{p.nationality}</span>
              </div>
            </div>
          ))}
        </div>
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
  // football-data.org gives position labels like Goalkeeper / Defence / Midfield / Offence — group into rows
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
