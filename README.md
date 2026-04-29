# My Teams — Sports Tracker

A clean, modern sports tracker for four teams: Baltimore Orioles, Los Angeles Chargers, Denver Nuggets, and Seattle Kraken. Schedule, roster, stats, and live game tracker with play-by-play.

Built with Next.js 14, React 18, SWR, and Tailwind. Pulls live data from ESPN's public API — no API key required, free forever.

## Features

- **Team selector** with official ESPN logos
- **Schedule tab** — upcoming games, recent results, live games
- **Roster tab** — full active roster with headshots and search
- **Stats tab** — record, streak, last 10, home/away splits, scoring averages
- **Live tab** — real-time scoreboard + play-by-play, auto-refreshes every 15 seconds
- Auto-detects live games and shows a pulsing red dot on the Live tab
- Dark mode by default, responsive on mobile

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server
npm run dev

# 3. Open http://localhost:3000
```

That's it. No environment variables. No API keys. No backend setup.

## Deploy

### Option A: Vercel (recommended, free)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com), click "Import Project"
3. Pick your repo, click Deploy
4. Done — your app is live at `your-project.vercel.app`

Vercel auto-detects Next.js. No configuration needed.

### Option B: Self-hosted

```bash
npm run build
npm run start
```

Runs on port 3000 by default. Put it behind nginx or any reverse proxy.

### Option C: Static export

Not recommended — the API routes need a server runtime to proxy ESPN. Vercel free tier handles this fine.

## Project structure

```
sports-tracker/
├── app/
│   ├── api/             # API routes that proxy ESPN
│   │   ├── team/        # Team page (record, standing, next event)
│   │   ├── scoreboard/  # Schedule (all events)
│   │   ├── roster/      # Active roster
│   │   └── summary/     # Game summary + play-by-play
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx         # Main page
├── components/
│   ├── TeamSelector.tsx # Top tab bar with logos
│   ├── TeamHeader.tsx   # Big colored hero
│   ├── Tabs.tsx         # Live/Schedule/Roster/Stats
│   ├── LiveGame.tsx     # Scoreboard + play-by-play
│   ├── Schedule.tsx
│   ├── Roster.tsx
│   └── Stats.tsx
└── lib/
    ├── teams.ts         # The four teams + ESPN IDs
    └── espn.ts          # ESPN API wrapper
```

## How the live data works

The flow is: **Browser → Next.js API route → ESPN API → back to browser**

We proxy through Next.js for two reasons:

1. **CORS** — ESPN doesn't always allow direct browser requests
2. **Caching** — Next.js caches each endpoint for the right amount of time (15s for live games, 5 min for schedules, 1 hr for rosters)

SWR on the frontend handles auto-refresh:
- Live games: every 15 seconds
- Team header / standings: every 60 seconds  
- Roster: cached for 1 hour (rosters rarely change)

## Adding more teams

Edit `lib/teams.ts`:

```typescript
yourteam: {
  key: "yourteam",
  name: "Full Team Name",
  short: "Short Name",
  abbr: "ABC",                    // ESPN abbreviation, lowercase used for logos
  league: "nba",                  // mlb | nfl | nba | nhl
  sport: "basketball",            // baseball | football | basketball | hockey
  espnTeamId: "1",                // Find at espn.com/{sport}/team/_/name/{abbr}
  primary: "#000000",             // Team primary color
  secondary: "#FFFFFF",
  textOnPrimary: "#FFFFFF",
}
```

Then add the key to `TEAM_ORDER`.

To find an ESPN team ID, visit `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams` in your browser.

## Swapping data sources

If ESPN's API breaks (unlikely but possible — it's unofficial), you only need to change `lib/espn.ts`. The API routes that consume it return a normalized shape, so the frontend doesn't care where the data comes from. Alternatives:

- **MLB**: `statsapi.mlb.com` (official, free)
- **NHL**: `api-web.nhle.com` (official, free)
- **NBA**: `balldontlie.io` (free), or `stats.nba.com` (with a backend)
- **NFL**: SportsRadar / SportsDataIO (paid)

## Caveats

- ESPN's API is undocumented and can change. If something breaks, check the [community endpoint list](https://github.com/pseudo-r/Public-ESPN-API).
- Rate limits aren't published. The caching here is conservative — should be fine for personal use.
- Roster data formats differ between leagues; the parsing in `app/api/roster/route.ts` handles the common shapes but may miss edge cases.

## License

MIT — do whatever.
