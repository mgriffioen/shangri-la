# Shangri-La

A collaborative pixel-placement web app for a fixed group of users. Users visit periodically, place pixels on a shared canvas, and collectively expand the canvas over time.

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

| Variable        | Default               | Description                                                    |
|-----------------|-----------------------|----------------------------------------------------------------|
| `PORT`          | `3000`                | HTTP server port                                               |
| `DB_PATH`       | `./shangri-la.db`     | SQLite database path (auto-created on first run)               |
| `ALLOWED_NAMES` | *(unset)*             | Comma-separated allowlist of usernames; unset allows all names |
| `RESET_SECRET`  | *(unset)*             | Required secret for `/api/seed-demo` and `/api/reset`          |

## API

| Method | Endpoint           | Description                                              |
|--------|--------------------|----------------------------------------------------------|
| POST   | `/api/login`       | Register or log in by name; issues pixels if off cooldown |
| GET    | `/api/state`       | Current pixel grid, progress %, canvas size, stats       |
| POST   | `/api/place`       | Place a pixel at `(x, y)` with a hex color               |
| GET    | `/api/leaderboard` | All users sorted by pixels placed                        |
| GET    | `/api/members`     | Crew roster with per-user stats and achievements         |
| GET    | `/api/achievements`| Achievement definitions and earned status                |
| GET    | `/api/recent`      | 12 most recently placed pixels                           |
| POST   | `/api/seed-demo`   | Load demo state (requires `RESET_SECRET`)                |
| POST   | `/api/reset`       | Wipe all data and reset to initial state (requires `RESET_SECRET`) |

## Game Mechanics

- **Pixels per visit**: 5
- **Cooldown**: 4 hours 20 minutes between visits
- **Progress per visit**: +0.5%

### Canvas expansion

| Progress | Canvas size |
|----------|-------------|
| 0%       | 32×32       |
| 25%      | 48×48       |
| 50%      | 64×64       |
| 75%      | 80×80       |
| 100%     | 96×96       |

## Database Schema

- `users` — name, last_visit, total_visits, pixels_placed, pixels_remaining, created_at
- `pixels` — x, y (PK), color, user_name, placed_at
- `global_stats` — key/value store (currently holds `progress`)
- `user_achievements` — user_name + achievement_key (composite PK), earned_at
- `group_achievements` — achievement_key (PK), earned_at

## Demo Data

```bash
node seed-demo.js          # populate demo state
node seed-demo.js --reset  # clear demo data
```
