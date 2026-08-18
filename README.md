<div align="center">

# PRISM

**A cinematic viewing surface for the open web's video library.**

Built on Next.js 16, the YouTube Data API v3 and Firebase.

</div>

---

## What this is

PRISM is a complete streaming front end. It searches, browses and plays the
entire public YouTube catalogue, and layers on the things a viewing app should
have had all along: playback that survives navigation, a library that remembers
the exact second you stopped, synced watch parties, and a keyboard-first
interface.

It runs with **no configuration at all** — no API key, no Firebase project. In
that state it serves a seeded catalogue of real videos and says so plainly on
screen. Add credentials and every surface switches to live data.

---

## The three ideas it is built around

### 1. The player never unmounts

There is exactly one YouTube player in the application, mounted at the root.
Pages that want to show it inline render an empty *slot* and publish its
rectangle; the player animates itself onto that rectangle. Navigate away and
the slot disappears, so the player flies to a corner dock — **still playing,
same frame, no reload.** Navigate back and it flies into place.

The positioning uses motion values written two different ways on purpose:
spring-animated when the mode changes (the dock/undock flight), and written
instantly when the slot merely moves (scrolling must not lag a frame behind).

`src/components/player/PlayerHost.tsx` · `src/hooks/usePlayerSlot.ts`

### 2. Related videos are reconstructed, not fetched

Google removed `search.list?relatedToVideoId` in August 2023 and shipped no
replacement. PRISM rebuilds a related set from what the API still exposes: the
source video's own tags first, then the distinctive words in its title, then a
sampling of the same creator's uploads — interleaved two-topical-to-one-creator
so the rail never collapses into a single back catalogue.

`getRelated()` in `src/lib/youtube.ts`

### 3. One host, one clock

Watch parties designate the host as the single authority. The host's player
publishes `{playing, position}` on every transport action and on a 4-second
heartbeat; guests mirror it. Drift correction has a deliberate dead zone —
re-seeking on every small difference produces permanent stutter, because the
seek itself costs time — and the heartbeat carries the host's *projected*
position, so latency does not accumulate.

`src/components/rooms/RoomPlayer.tsx`

---

## Everything it does

**Discovery**
- Rotating spotlight with muted preview playback that pauses on hover, on focus, and when the tab is hidden
- Trending, filterable by 10 regions × 14 categories, with an editorial treatment for #1
- Browse by category, with a search fallback for categories whose chart comes back thin
- Search with sort, length and upload-window filters — all as real, shareable URLs
- Eight hand-written collections, each a saved query with a point of view
- Mood picker: start from how you want to feel, not from what you watched last

**Playback**
- Custom control bar: chapter-segmented scrubber, scrub preview with timecode and chapter name, speed, captions, theatre mode, fullscreen, ambient glow
- Chapters parsed out of the description using the community timestamp convention, validated for monotonicity so false positives never render
- Full keyboard transport: `space`/`K`, `J`/`L`, arrows, `0`–`9`, `M`, `C`, `F`, `T`, `⇧N`, `⇧,`/`⇧.`
- Auto-hiding chrome that stays up while paused, while scrubbing, and while a menu is open
- Resume from the exact second, on any device, with `?t=` in a shared link taking precedence

**Library** *(requires Firebase)*
- Watch later, likes, followed channels, playlists
- History with per-video progress and a Continue Watching rail that only shows genuinely unfinished videos
- Profile, interests and playback preferences that follow the account

**Watch parties** *(requires Firebase)*
- Six-character codes with no vowels and no look-alike digits, so they survive being read aloud
- Real-time synced playback with drift correction
- Chat pinned to the second of the video it was sent at

**Installable**
- Web app manifest, maskable icons, and an offline page
- A deliberately narrow service worker: `/api/` is never cached, navigations are network-first so deploys land immediately, and it never calls `skipWaiting` on its own initiative

**Interface**
- `⌘K` command palette — search and navigation in one surface, keyboard-first, with racing suggestion and result requests
- Hover-preview playback on every card, delayed 620ms so crossing a grid does not spawn a dozen iframes
- Cursor companion, magnetic buttons, scroll-driven reveals, page transitions
- Full reduced-motion support, focus-visible rings, skip link, ARIA throughout

---

## Setup

```bash
git clone https://github.com/Arnav-Dugad/video-streaming.git
cd video-streaming
npm install
cp .env.example .env.local     # optional — it runs without this
npm run dev
```

Open <http://localhost:3000>.

### YouTube Data API — live video data

1. <https://console.cloud.google.com/apis/credentials> → create a project
2. Enable **YouTube Data API v3**
3. Create an **API key**, restricted to that API
4. Set `YOUTUBE_API_KEY` in `.env.local`

The free quota is 10,000 units/day. A search costs 100 units, a video lookup
costs 1 — so PRISM prefers `videos.list` wherever it can and caches
aggressively. You can list **several comma-separated keys** from different
projects; it rotates to the next one when a key is exhausted, and falls back to
the seeded catalogue if they all are.

### YouTube OAuth — optional

Only needed for posting real comments, subscribing on YouTube itself, and
importing a viewer's real subscriptions. Everything else works without it, and
the UI hides these features entirely when it is not configured.

1. Same Google Cloud project → configure the **OAuth consent screen** (External)
2. Add the scopes `youtube.readonly` and `youtube.force-ssl`
3. **Credentials → Create credentials → OAuth client ID → Web application**
4. Add the redirect URI exactly: `https://your-domain/api/youtube/callback`
   (and `http://localhost:3000/api/youtube/callback` for local work)
5. Set `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`

Both scopes are **sensitive** in Google's classification. Until the project
passes their verification review it is capped at 100 users and each one sees an
"unverified app" interstitial during consent — which is exactly why connecting
is opt-in from settings rather than part of signing in.

Tokens never reach the browser. They live in httpOnly cookies, are read only
server-side, and the callback is CSRF-protected with a single-use `state` value.

### Firebase — accounts, library, watch parties

1. <https://console.firebase.google.com> → create a project
2. Add a **Web app** and copy its config into the `NEXT_PUBLIC_FIREBASE_*` variables
3. **Authentication → Sign-in method** → enable *Email/Password* and *Google*
4. **Firestore Database** → create in production mode
5. Deploy the rules and indexes shipped in this repo:

```bash
npm install -g firebase-tools
firebase login
firebase use --add                          # pick your project
firebase deploy --only firestore:rules,firestore:indexes
```

6. **Authentication → Settings → Authorized domains** → add your production domain

Without these, PRISM runs fine — the library, profile and rooms pages show an
explicit "not configured" notice instead of failing.

---

## Deploying to Vercel

1. Import the repository at <https://vercel.com/new>
2. Framework preset: **Next.js** (detected automatically — no build settings to change)
3. Add the environment variables from `.env.example` under
   *Settings → Environment Variables*
4. Deploy

Then set `NEXT_PUBLIC_SITE_URL` to the real domain so canonical URLs, Open Graph
tags and `sitemap.xml` point at the right place, and add that domain to
Firebase's authorized-domains list.

---

## Architecture

```
src/
├── app/                       Routes (App Router)
│   ├── page.tsx               Home — spotlight, rails, collections, manifesto
│   ├── watch/                 Watch — player slot, chapters, comments, up next
│   ├── browse/ trending/      Category and chart browsing
│   ├── search/                Filtered search with progressive loading
│   ├── collections/[slug]/    Curated runs (pre-rendered)
│   ├── channel/[id]/          Channel with banner and uploads
│   ├── library/ profile/      Account surfaces (Firebase)
│   ├── rooms/[id]/            Watch parties (Firestore real-time)
│   ├── signin/ signup/        Auth
│   └── api/                   search · suggest · videos
├── components/
│   ├── player/                PlayerHost, PlayerControls
│   ├── video/                 VideoCard, Rail, VideoGrid, FilterChips, LoadMore
│   ├── watch/ rooms/ library/ profile/ channel/ auth/ home/
│   ├── layout/                Header, CommandPalette, Footer, PageShell
│   ├── providers/             AuthProvider
│   └── ui/                    Thumbnail, Avatar, Button, Reveal, Magnetic, Cursor…
├── lib/
│   ├── youtube.ts             API client — quota rotation, caching, fallback
│   ├── demo-catalogue.ts      Seeded catalogue for the no-key path
│   ├── db.ts                  Firestore access layer
│   ├── firebase.ts            Lazy, failure-tolerant bootstrap
│   ├── store.ts               Player / UI / toast state (Zustand)
│   ├── collections.ts         Editorial collections and moods
│   ├── format.ts              Formatters, description parsing, chapter extraction
│   └── types.ts               Shared shapes
└── hooks/                     useYouTubeApi, usePlayerSlot, useKeyboard, …
```

### Notes worth knowing

- **The YouTube API's raw envelopes never leave `lib/youtube.ts`.** Everything
  downstream speaks the normalised types in `lib/types.ts`.
- **Descriptions are never injected as HTML.** They are parsed into typed
  segments — text, link, timestamp — and rendered as React elements.
- **Thumbnails step down through a resolution chain.** `maxresdefault.jpg` only
  exists for videos uploaded above 1080p; for the rest YouTube returns a 120×90
  placeholder with a *200* status, so an `onError` handler alone misses it. The
  component checks `naturalWidth` on load.
- **Watch history is keyed by video id**, not appended, so re-watching updates
  one document instead of growing a collection without bound.
- **Every filter is a link.** Filtered views are shareable, bookmarkable, and
  the Back button works.

---

## Commands

```bash
npm run dev         # development server
npm run build       # production build
npm start           # serve the production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

---

## Attribution

PRISM is an independent client for a public API. It hosts no video, transcodes
nothing, and stores no media. All content is served by YouTube and belongs to
its original creators. Not affiliated with YouTube or Google.
