# Building Shangri-La

A collaborative pixel-placement web app for a fixed group of friends. Members visit periodically, place pixels on a shared canvas, and collectively grow the island over many weeks — until it's complete.

## Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (via `better-sqlite3`)
- **Frontend**: Vanilla JS, HTML5 Canvas, CSS3

## Setup

```bash
npm install
npm start        # production
npm run dev      # development (nodemon)
```

Server listens on `http://localhost:3000` by default.

## Environment Variables

| Variable        | Default           | Description                                                                |
|-----------------|-------------------|----------------------------------------------------------------------------|
| `PORT`          | `3000`            | HTTP server port                                                           |
| `DB_PATH`       | `./shangri-la.db` | SQLite database path (auto-created on first run)                           |
| `ALLOWED_NAMES` | *(unset)*         | Comma-separated allowlist of usernames; unset allows any name              |
| `RESET_SECRET`  | *(unset)*         | Required secret for `/api/seed-demo` and `/api/reset`; set before deploying |

**Recommended for production:**

```bash
ALLOWED_NAMES=Mark,Sean,Carl,Benedict,Dusty,Paul,Erik,Brandon
RESET_SECRET=something-only-you-know
```

## Game Mechanics

- **Pixels per visit**: 12
- **Visit cooldown**: 4 hours 20 minutes
- **Progress per visit**: +0.1% (1,000 total visits = 100%)

### Canvas expansion

The island grows as collective progress increases:

| Progress | Canvas size |
|----------|-------------|
| 0%       | 32×32       |
| 25%      | 48×48       |
| 50%      | 64×64       |
| 75%      | 80×80       |
| 100%     | 96×96       |

### Undo

Each visit includes one undo. It reverts the last pixel placed and refunds one pixel — but only while pixels remain in that visit. Once the 12th pixel is placed, the cooldown begins and undo is no longer available.

### Trivia

Players can attempt a trivia question once per visit. A correct answer grants bonus pixels.

## Achievements

### Individual (20 total)

Earned per player based on visits and pixels placed.

### Group (18 total)

Earned collectively based on island-wide progress and group participation.

## API

| Method | Endpoint             | Description                                                        |
|--------|----------------------|--------------------------------------------------------------------|
| POST   | `/api/login`         | Register or log in by name; issues pixels if off cooldown          |
| GET    | `/api/state`         | Current pixel grid, progress %, canvas size, stats                 |
| POST   | `/api/place`         | Place a pixel at `(x, y)` with a hex color                        |
| POST   | `/api/undo`          | Undo the last placed pixel (once per visit)                        |
| POST   | `/api/trivia-reward` | Grant bonus pixels after a correct trivia answer                   |
| GET    | `/api/achievements`  | Achievement definitions and earned status                          |
| GET    | `/api/members`       | Crew roster with per-user stats and achievements                   |
| GET    | `/api/leaderboard`   | All users sorted by pixels placed                                  |
| GET    | `/api/recent`        | 12 most recently placed pixels                                     |
| GET    | `/api/timelapse`     | All pixels in placement order (used by endgame timelapse)          |
| POST   | `/api/seed-demo`     | Load demo state at 80% progress (requires `RESET_SECRET`)          |
| POST   | `/api/reset`         | Wipe all data and reset to initial state (requires `RESET_SECRET`) |

## Database Schema

- `users` — name, last_visit, total_visits, pixels_placed, pixels_remaining, created_at, undo_available, undo_x, undo_y, undo_prev_color, undo_prev_user, trivia_used, endgame_seen
- `pixels` — x, y (PK), color, user_name, placed_at
- `global_stats` — key/value store (holds `progress`)
- `user_achievements` — user_name + achievement_key (composite PK), earned_at
- `group_achievements` — achievement_key (PK), earned_at

## Demo & Testing

```bash
# Populate a rich mid-game state (~80% progress, all achievements, detailed island)
node seed-demo.js

# Populate an endgame demo (99.9% progress — next login triggers the endgame sequence)
node seed-endgame.js

# Wipe all data and start fresh
node seed-demo.js --reset
```
