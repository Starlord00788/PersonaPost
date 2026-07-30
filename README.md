# PersonaPost AI

PersonaPost AI is a project that helps users turn writing samples, reference material, and trending topics into social content drafts that sound like them.

The goal of the project is simple: build something useful, credible, and close to the kind of workflow a product team at Inspire AI would actually need.

## What this project solves

Professionals and founders know their domain but do not always have time to write consistent, high-quality content. Generic AI writers sound robotic, repetitive, and dry. PersonaPost AI addresses that by combining:

- voice learning from user samples
- knowledge retrieval from uploaded documents
- trend discovery from public sources
- draft generation with review and refinement
- a content calendar for planning and reuse

## Core workflow

1. User uploads or pastes writing samples.
2. The backend builds a voice profile from style signals.
3. The system retrieves relevant knowledge and trends.
4. An LLM generates a draft in the user's voice (streamed token-by-token in real time).
5. A reviewer pass checks tone, clarity, and authenticity.
6. The user edits, approves, and saves the post to a simple calendar.

## Architecture

```mermaid
flowchart TD
    User[User] --> UI[React dashboard]
    UI --> API[FastAPI backend]
    API --> Voice[Voice profiling service]
    API --> Rag[Knowledge retrieval service]
    API --> Trend[Trend intelligence service]
    API --> Plan[Planning agent]
    API --> Draft[Draft generator]
    API --> Stream[SSE streaming endpoint]
    API --> Review[Quality reviewer]
    API --> Competitor[Competitor analysis service]
    API --> Notif[Notifications service]
    Voice --> DB[(SQLite / PostgreSQL)]
    Rag --> Vec[(In-process Jaccard + LLM reranker)]
    Trend --> Pub[Reddit / Google Trends / Hacker News]
    Draft --> Groq[Groq LLM API]
    Stream --> Groq
    Review --> Groq
    Competitor --> Groq
```

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS v3, Framer Motion, Lucide Icons |
| Backend | FastAPI, Pydantic v2, Pydantic-Settings |
| Database | SQLite (Local Dev) / PostgreSQL (Production) |
| Database Migrations | Alembic |
| Security | Multi-user JWT (python-jose + bcrypt), In-memory token storage |
| Rate Limiter | Per-IP sliding-window (10 generation requests/min) |
| Voice Profiling | Lexical metric analytics (sentence construction, pronouns, punctuation) |
| Knowledge Retrieval | Suffix-stemming Jaccard similarity + optional Groq semantic reranker |
| Trend TTL Cache | 5-minute in-memory caching for HackerNews/Reddit |
| Audio Reader | Browser-native Text-To-Speech (SpeechSynthesis API) |
| LLM | Groq API with robust heuristic local fallbacks |
| Streaming | SSE (Server-Sent Events) — tokens stream live to UI |
| Deployment | Multi-stage Dockerfiles, Render Blueprints, Vercel SPA redirects |

## Repository layout

```
PersonaPostAi/
├── backend/
│   ├── alembic/
│   │   └── versions/          # Database migrations
│   ├── alembic.ini
│   ├── app/
│   │   ├── middleware/         # Rate limiter middleware
│   │   ├── repositories/       # DB access layer (users, drafts, calendar)
│   │   ├── auth.py             # JWT token helpers & verify logic
│   │   ├── cache.py            # In-memory TTL cache helper
│   │   ├── config.py           # Settings from .env
│   │   ├── db.py               # SQLAlchemy engine setup
│   │   ├── models.py           # ORM models (User, Draft, CalendarEntry, Notification, VoiceProfile)
│   │   ├── routes.py           # All API endpoints (draft, voice, trends, knowledge, calendar, stats, export, competitor, streaming, review-text)
│   │   ├── routes_auth.py      # Auth endpoints (login, register, me, change-password, google)
│   │   ├── routes_notifications.py  # Notification CRUD endpoints
│   │   ├── schemas.py          # Pydantic request/response models
│   │   └── services/
│   │       ├── competitor.py   # Competitor post analysis & rewrite service
│   │       ├── generation.py   # Draft generation, analytics, multi-platform
│   │       ├── knowledge.py    # Document ingestion, retrieval, LLM reranker
│   │       ├── notification_service.py  # Upcoming post notifications
│   │       ├── persistence.py  # Draft approval & calendar persistence
│   │       ├── refinement.py   # Draft refinement service
│   │       ├── review.py       # Draft quality review service
│   │       ├── trends.py       # Trend fetching with TTL cache
│   │       └── voice.py        # Voice profile extraction
│   └── tests/                  # Automated unit and integration tests
├── frontend/
│   └── src/
│       ├── App.jsx             # Full SPA — all pages, components, streaming logic
│       ├── lib/api.js          # Auth-aware HTTP client (JWT, Google OAuth, streaming)
│       └── styles.css          # Premium Aceternity-inspired design system
├── docs/
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   ├── nginx.conf
│   └── docker-compose.yml
├── render.yaml                 # Render.com deploy blueprint
├── vercel.json                 # Vercel deployment configurations
└── README.md
```

## Getting started

### Pre-requisites
* **Python Version:** Python 3.11 or 3.12 is required. Newer versions (e.g. 3.13 or 3.14) will cause build errors with compiled dependencies like `pydantic-core` and SQLAlchemy.
* **Node.js:** Node.js v18 or later.
* **Groq API key:** Free at [console.groq.com](https://console.groq.com)

### Local Setup Steps

```bash
cd PersonaPostAi

# 1. Copy environment variable files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Setup backend virtual environment
cd backend
py -3.12 -m venv .venv
# Activate in Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Upgrade pip and install dependencies:
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Setup credentials in backend/.env
# Set your Groq API key:
#   GROQ_API_KEY=gsk_...
# Admin default password "admin123" hash is pre-set in .env.example

# 4. Run database migrations to construct the database schema
alembic upgrade head

# 5. Optionally seed the database with demo listings
python seed_demo.py

# 6. Run all automated verification tests
pytest tests/ -v --tb=short

# 7. Start the backend development server
uvicorn app.main:app --reload --port 8000

# 8. Setup and start the frontend development server
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — log in with `admin` / `admin123`.

### Switch to PostgreSQL

Change one line in `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/personapost
```

Then run `alembic upgrade head` to migrate the schema.

### Running with Docker Compose
To launch the full suite (Frontend + Backend + PostgreSQL Database) in containerized mode:

```bash
cd PersonaPostAi/docker
docker compose up --build
```

---

## Detailed Tech implementation Notes

### 1. Custom Voice Profiling & Tokenizer
The system features a suffix-stemming tokenization module in `backend/app/services/knowledge.py`. It strips grammatical suffixes (`-ing`, `-tion`, `-ment`, etc.) from words during retrieval. This allows a search for "automation" to successfully match against "automate", raising Jaccard-similarity match relevance without external libraries.

The knowledge service also supports **LLM-based semantic reranking** — when more than `top_k` candidates exist, Groq is asked to select and score the most semantically relevant snippets. Falls back to Jaccard order if Groq is unavailable.

In addition, `voice.py` runs a dynamic lexical metrics analyzer (averaging sentence lengths, calculating exclamation rates, and evaluating pronoun frequency) to extract custom tone profiles from writing samples.

### 2. Strict JSON Contracts & Parser Security
LLM responses can return malformed JSON or markdown syntax wrappers (` ```json ... ``` `). The backend includes a robust regex stripper `_strip_fences()` inside `generation.py` and `review.py`. This sanitizes LLM markdown containers before passing inputs to `json.loads()`, falling back to deterministic stubs if the output fails validation.

### 3. JWT Security & Multi-User Auth
- **Registration & Login**: Full user registration (`POST /api/auth/register`) and login (`POST /api/auth/token`). Passwords hashed with bcrypt.
- **JWT Bearer tokens**: All generation and mutation endpoints require `Authorization: Bearer <token>`.
- **Token stored in-memory** (React state): cleared on tab close, never written to `localStorage` by default.
- **Google OAuth**: Optional `POST /api/auth/google` endpoint verifies Google ID tokens and returns a JWT.
- **Sliding-Window Rate Limiter**: Per-IP memory-based sliding window blocks clients exceeding 10 generation requests per minute, responding with status `429`.

### 4. Streaming Draft Generation
The `/api/draft/stream` endpoint uses FastAPI's `StreamingResponse` with `text/event-stream` content type (SSE). The frontend:
1. Opens a `fetch()` stream and reads tokens via `ReadableStream`
2. Appends each `data: {"token": "..."}` chunk to state — text appears **word-by-word** in the UI with a blinking cursor
3. After streaming completes, calls `/api/draft/review-text` to score and analyze the final text
4. Falls back to the blocking `/api/draft` endpoint if streaming fails

### 5. Draft Analytics
Each generated draft now includes four analytics fields computed server-side:
- `hook_strength` (0–10): counts power words in the opening sentence
- `best_time_to_post`: platform-specific recommended posting window
- `reach_tier`: Niche / Broad / Viral based on hook strength
- `readability_grade`: Easy / Medium / Advanced based on avg sentence length

### 6. Multi-Platform & Competitor Analysis
- **`POST /api/draft/multi-platform`**: Generates LinkedIn, X, and Instagram drafts in one call. The frontend shows a tabbed comparison view.
- **`POST /api/competitor/analyze`**: Analyzes a competitor's post for strengths/weaknesses and rewrites it in the user's voice.

### 7. Trends Cache & AI voice TTS Reader
- **Trends TTL Cache**: To prevent hitting Hacker News and Reddit APIs repeatedly, trend lists are cached in memory for 5 minutes.
- **Text-to-Speech (TTS) Reader**: Users can click **Listen** on generated drafts to hear the post read aloud using browser-native SpeechSynthesis. The speech rates are tuned to the target platform (e.g. fast and punchy for X, slower and professional for LinkedIn).

### 8. Notifications System
- Backend tracks upcoming calendar posts and fires in-app notifications
- `GET /api/notifications` returns paginated notification list
- `POST /api/notifications/check` triggers a scan for posts due within 24 hours
- Bell icon in the nav shows unread count badge; clicking marks all as read

### 9. Aceternity-Inspired Premium UI
The UI is redesigned around modern Aceternity-style component patterns:
- **Aurora background**: Animated purple/blue/teal gradient blobs drift slowly behind all content, plus 32 twinkling star dots
- **Floating glass nav**: Pill-shaped glassmorphic navbar floats 12px from the top; active tab gets accent color + tinted background — no underlines
- **Spotlight cards**: Mouse-tracking radial glow on every card (`SpotCard`)
- **Moving border button**: Generate button cycles purple → blue → teal → purple gradient while streaming
- **Live typewriter**: Streamed tokens appear character-by-character with a blinking `│` cursor
- **Cursor ring**: Custom cursor dot + expanding ring; ring grows when hovering over any interactive element
- **Noise grain overlay**: Subtle SVG film grain at 3.2% opacity across the entire page
- **Infinite ticker**: Double-tracked horizontal ticker listing all capabilities
- **Skeleton shimmer loaders**: Replace all loading states
- **Score ring**: Animated SVG arc showing draft quality score

---

## Troubleshooting Guide

#### "Fatal error in launcher: Unable to create process"
This occurs if you rename the backend virtual environment folder after creating it (e.g., from `.venv312` to `.venv`). Python virtual environments bake the absolute file path into their executable launchers.
**Solution:** Delete the `.venv` folder completely and run `py -3.12 -m venv .venv` from scratch.

#### "pydantic-core compile errors on installation"
You are likely using a Python version higher than 3.12 (like 3.13 or 3.14) where pre-compiled wheels for key backend packages are not yet available.
**Solution:** Ensure you use `py -3.12` to construct your virtual environment.

#### "Access-Control-Allow-Origin blocked" / CORS error
The backend CORS config in `main.py` allows `http://localhost:5173` by default. If you are running the frontend on a different port, add it to the `origins` list in `backend/app/main.py`.

#### Login returns 500 / "NOT NULL constraint failed"
The `users` table schema may be on an old version. Run `python fix_users_table.py` from the `backend/` directory to migrate the schema.

---

## Scope

This version is scoped to demonstrate a full-stack AI product slice. The goal is a polished, credible product rather than a full production SaaS.

Included:
- voice profile extraction (and merge)
- trend discovery (with TTL caching)
- prompt orchestration (with platform specific rules)
- draft review & retry loop
- SSE streaming with live token display
- multi-platform draft generation (LinkedIn / X / Instagram)
- competitor post analysis & rewrite
- content calendar UI & edit history
- notifications system
- usage stats dashboard & CSV export
- full user registration/login system

Not included yet:
- real LinkedIn or X posting integrations
- multi-tenant billing
- automated scheduling jobs (cron)

## Documentation

- [Project PRD](docs/PRD.md)
- [Architecture](docs/Architecture.md)
- [Standup notes](docs/Standup.md)
- [Decision log](docs/ADR-001-free-llm-stack.md)

---

## Changelog

### v2.0 — 2026-07-30 (this release)

**Backend additions**
- Multi-user registration/login system with bcrypt password hashing
- Google OAuth endpoint (`POST /api/auth/google`) for ID token verification
- `POST /api/draft/stream` — SSE streaming endpoint (tokens appear in real-time)
- `POST /api/draft/review-text` — score and analyze existing text without regenerating
- `POST /api/draft/multi-platform` — generate for LinkedIn, X, and Instagram in one call
- `POST /api/competitor/analyze` — analyze and rewrite a competitor's post
- Draft analytics fields: `hook_strength`, `best_time_to_post`, `reach_tier`, `readability_grade`
- LLM-based semantic reranking in the knowledge retrieval service
- Full notifications system with bell badge, unread count, and mark-as-read
- Usage stats endpoint (`GET /api/stats`) with counts, platform breakdown
- CSV/JSON draft export (`GET /api/drafts/export`)
- `google_id` column on User model for OAuth
- `last_login_at` tracking on User
- In-memory TTL cache helper (`cache.py`)
- DB repository layer (`repositories/`)
- `change-password` endpoint

**Frontend additions**
- Live streaming draft generation — words appear one-by-one with blinking cursor
- Moving-gradient Generate button during streaming
- Streaming phase indicator ("Generating…" → "Analyzing quality…")
- Multi-platform tabbed draft view
- Competitor analysis panel
- Notifications bell with live polling
- User menu (profile, change password, logout)
- Usage stats page with charts
- Draft export buttons
- Full registration flow with password strength meter and confirm-password validation
- Google Sign-In button (requires `VITE_GOOGLE_CLIENT_ID`)

**UI redesign**
- Full Aceternity-inspired design system (`styles.css`)
- Aurora animated background with twinkling star field
- Floating glassmorphic nav with per-tab accent colors
- Custom cursor ring that expands over interactive elements
- Spotlight mouse-tracking glow on all cards
- Noise grain overlay
- Moving gradient border on streaming button
- Improved login card with top-edge gradient border glow

### v1.0 — prior releases
See git log for earlier history.

---

## Status

**Backend** — fully operational:
- Groq-first draft and review pipeline with deterministic fallback and auto-retry loops
- Multi-user JWT auth (register, login, Google OAuth)
- Per-IP sliding-window rate limiting on generation
- SSE streaming endpoint for live token delivery
- Persisted voice profiles with dynamic metric extraction and 50/50 merges
- Trend fetching with live-source attempts, 5-minute cache, and fallback behaviors
- Multi-platform draft generation and competitor analysis
- Notifications system (creation, polling, mark-read)
- Usage stats and export
- Database schema evolution managed by Alembic

**Frontend** — fully operational:
- JWT login, registration, and Google OAuth flow
- Live streaming draft with typewriter effect and moving-border button
- Voice profile creation, trend selection, knowledge base management
- Multi-platform tabbed drafts, competitor analysis panel
- Inline draft editing, refinement, and approval persistence
- Content calendar with scheduling and date picker
- Notifications bell with real-time unread count
- Usage stats dashboard with score ring and analytics strip
- Draft history, export (CSV/JSON), Text-to-Speech reader
- Toast notifications and skeleton loaders on all loading states
- Aceternity-inspired aurora + spotlight + floating nav design
