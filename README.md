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

### Endgame

When the island reaches 100%, the member whose visit pushes it over the threshold sees:
1. A confetti burst
2. A "Shangri-La Achieved!" celebration modal
3. A full timelapse replay of every pixel placed, in order
4. A share button

## Achievements

### Individual (20 total)

Earned per player based on visits and pixels placed.

| Achievement | Description |
|---|---|
| 🌅 Lake Living | First visit |
| 🥹 True Friend | Visit a second time |
| ⭐ TGIF | 7 visits |
| 👀 Nice | 69 pixels placed |
| 👑 Kubb God | 111 pixels placed |
| 🏈 Perfect Spiral | 15 visits |
| 👏 This guy gets it | 25 visits |
| 👴 Old Man Paul | 200 pixels placed |
| 👍 I Vouch for Him | 222 pixels placed |
| 🍳 Hotel Eggs | 30 visits |
| 🍖 Ham Point | 288 pixels placed |
| 🤖 Friend of Party Bot Micro | 333 pixels placed |
| 🚗 Sean's VW Golf | 45 visits |
| 🚬 C'mon | 55 visits |
| 🍒 Cherry BBQ Potato Chips | 500 pixels placed |
| 💦 Bless the Maker and His water | 75 visits |
| 🎬 Watched Midnight Run (1988) | 88 visits |
| 🚤 LAKE 101!!! | 101 visits |
| 🍕 It's the Sauce | 115 visits |
| 💰 You Bought Shangri-La | 1,000 pixels placed |

### Group (18 total)

Earned collectively based on island-wide progress and group participation.

| Achievement | Trigger |
|---|---|
| 🛝 The Slide is on the Raft | 100 pixels placed |
| 🚢 We Did It! | All 8 members visited |
| 🤙 NICE | 420 pixels placed |
| 🤸 Teach You to Backflip | Whole group visited twice |
| 🏚️ Home Invasion!! | 666 pixels placed |
| ❄️ BRING IT ON | Whole group visited ten times |
| 🌱 Dusty's Backyard | 1,000 pixels placed |
| 👨‍⚖️ Case Closed | 1,999 pixels placed |
| 🌭 Hot Dog House | 2,222 pixels placed |
| 💰 In This Economy? | 33% progress |
| 🌦️ It is Really Coming and Going | 50% progress |
| ⛷ DUDESKI | Whole group visited 22 times |
| 🪥 Flossmore, IL | 66% progress |
| 🪱 Worms | 75% progress |
| 🤔 People Forget, But They Shouldn't | 88% progress |
| 🏊 Swim Meet Door | Whole group visited 55 times |
| 🏖 Shavehead Lake | 90% progress |
| 🌞 Shangri-La Achieved! | 100% — island complete |

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
