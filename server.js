const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shangri-la.db');

const PIXELS_PER_VISIT = 5;
const VISIT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours
const PROGRESS_PER_VISIT = 0.5;                 // 0.5% per visit → 200 visits = 100%
const MAX_GROUP_SIZE = 8;

// ─── Database Setup ────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    name             TEXT    PRIMARY KEY,
    last_visit       INTEGER DEFAULT 0,
    total_visits     INTEGER DEFAULT 0,
    pixels_placed    INTEGER DEFAULT 0,
    pixels_remaining INTEGER DEFAULT 0,
    created_at       INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS pixels (
    x          INTEGER NOT NULL,
    y          INTEGER NOT NULL,
    color      TEXT    NOT NULL,
    user_name  TEXT    NOT NULL,
    placed_at  INTEGER DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (x, y)
  );

  CREATE TABLE IF NOT EXISTS global_stats (
    key   TEXT PRIMARY KEY,
    value REAL DEFAULT 0
  );

  INSERT OR IGNORE INTO global_stats VALUES ('progress', 0);

  CREATE TABLE IF NOT EXISTS user_achievements (
    user_name       TEXT NOT NULL,
    achievement_key TEXT NOT NULL,
    earned_at       INTEGER DEFAULT (strftime('%s','now') * 1000),
    PRIMARY KEY (user_name, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS group_achievements (
    achievement_key TEXT PRIMARY KEY,
    earned_at       INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
`);

// ─── Achievement Definitions ───────────────────────────────────────────────────

const INDIVIDUAL_ACHIEVEMENTS = [
  {
    key: 'first_pixel',
    name: 'First Brushstroke',
    description: 'Place your very first pixel on the island',
    icon: '🎨',
  },
  {
    key: 'loyal_visitor',
    name: 'Loyal Visitor',
    description: 'Visit the island 5 times',
    icon: '⭐',
  },
  {
    key: 'dedicated_builder',
    name: 'Dedicated Builder',
    description: 'Visit the island 15 times',
    icon: '🏗️',
  },
  {
    key: 'pixel_artist',
    name: 'Pixel Artist',
    description: 'Place 50 pixels on the island',
    icon: '🖌️',
  },
  {
    key: 'master_creator',
    name: 'Master Creator',
    description: 'Place 200 pixels on the island',
    icon: '👑',
  },
];

const GROUP_ACHIEVEMENTS = [
  {
    key: 'all_aboard',
    name: 'All Aboard!',
    description: `All ${MAX_GROUP_SIZE} builders have visited Shangri-La`,
    icon: '🚢',
  },
  {
    key: 'foundation_laid',
    name: 'Foundation Laid',
    description: '100 pixels have been placed on the island',
    icon: '🏛️',
  },
  {
    key: 'island_growing',
    name: 'Island Growing',
    description: '500 pixels have been placed on the island',
    icon: '🌿',
  },
  {
    key: 'paradise_rising',
    name: 'Paradise Rising',
    description: 'Island progress has reached 50%',
    icon: '🌅',
  },
  {
    key: 'shangri_la',
    name: 'Shangri-La Achieved!',
    description: 'The island is complete — 100% progress reached!',
    icon: '🏔️',
  },
];

// ─── Helper Functions ──────────────────────────────────────────────────────────

function getProgress() {
  return db.prepare("SELECT value FROM global_stats WHERE key = 'progress'").get().value;
}

function getTotalPixels() {
  return db.prepare('SELECT COUNT(*) AS cnt FROM pixels').get().cnt;
}

function getUniqueVisitors() {
  return db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE total_visits > 0').get().cnt;
}

/**
 * Canvas grows in 5 stages as global progress climbs.
 * Each stage reveals more ocean for the group to paint.
 */
function getCanvasSize(progress) {
  if (progress >= 100) return 96;
  if (progress >= 75)  return 80;
  if (progress >= 50)  return 64;
  if (progress >= 25)  return 48;
  return 32;
}

function checkIndividualAchievements(userName) {
  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(userName);
  const alreadyEarned = new Set(
    db.prepare('SELECT achievement_key FROM user_achievements WHERE user_name = ?')
      .all(userName)
      .map(r => r.achievement_key)
  );

  const checks = [
    { key: 'first_pixel',        condition: user.pixels_placed >= 1   },
    { key: 'loyal_visitor',      condition: user.total_visits  >= 5   },
    { key: 'dedicated_builder',  condition: user.total_visits  >= 15  },
    { key: 'pixel_artist',       condition: user.pixels_placed >= 50  },
    { key: 'master_creator',     condition: user.pixels_placed >= 200 },
  ];

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO user_achievements (user_name, achievement_key) VALUES (?, ?)'
  );

  const newAchievements = [];
  for (const check of checks) {
    if (check.condition && !alreadyEarned.has(check.key)) {
      insertStmt.run(userName, check.key);
      const def = INDIVIDUAL_ACHIEVEMENTS.find(a => a.key === check.key);
      newAchievements.push({ ...def, type: 'individual' });
    }
  }
  return newAchievements;
}

function checkGroupAchievements() {
  const progress       = getProgress();
  const totalPixels    = getTotalPixels();
  const uniqueVisitors = getUniqueVisitors();

  const alreadyEarned = new Set(
    db.prepare('SELECT achievement_key FROM group_achievements')
      .all()
      .map(r => r.achievement_key)
  );

  const checks = [
    { key: 'all_aboard',       condition: uniqueVisitors >= MAX_GROUP_SIZE },
    { key: 'foundation_laid',  condition: totalPixels    >= 100            },
    { key: 'island_growing',   condition: totalPixels    >= 500            },
    { key: 'paradise_rising',  condition: progress       >= 50             },
    { key: 'shangri_la',       condition: progress       >= 100            },
  ];

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO group_achievements (achievement_key) VALUES (?)'
  );

  const newAchievements = [];
  for (const check of checks) {
    if (check.condition && !alreadyEarned.has(check.key)) {
      insertStmt.run(check.key);
      const def = GROUP_ACHIEVEMENTS.find(a => a.key === check.key);
      newAchievements.push({ ...def, type: 'group' });
    }
  }
  return newAchievements;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/login
 * Body: { name: string }
 *
 * Creates user if new.
 * If 12 h have elapsed since last_visit, registers a new visit:
 *   - increments total_visits
 *   - resets pixels_remaining to PIXELS_PER_VISIT
 *   - advances global progress
 * Returns full user object + any newly earned achievements.
 */
app.post('/api/login', (req, res) => {
  const raw = req.body.name;
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const name = raw.trim().slice(0, 30);
  const now  = Date.now();

  let user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user) {
    db.prepare(
      'INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining) VALUES (?, 0, 0, 0, 0)'
    ).run(name);
    user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  }

  const elapsed  = now - user.last_visit;
  const canVisit = elapsed >= VISIT_COOLDOWN_MS;
  let newVisit       = false;
  let newAchievements = [];

  if (canVisit) {
    db.prepare(`
      UPDATE users
      SET last_visit       = ?,
          total_visits     = total_visits + 1,
          pixels_remaining = ?
      WHERE name = ?
    `).run(now, PIXELS_PER_VISIT, name);

    const currentProgress = getProgress();
    const newProgress = Math.min(100, currentProgress + PROGRESS_PER_VISIT);
    db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(newProgress);

    user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
    newVisit = true;

    newAchievements = [
      ...checkIndividualAchievements(name),
      ...checkGroupAchievements(),
    ];
  }

  res.json({
    user: {
      name:             user.name,
      total_visits:     user.total_visits,
      pixels_remaining: user.pixels_remaining,
      pixels_placed:    user.pixels_placed,
      last_visit:       user.last_visit,
    },
    newVisit,
    newAchievements,
    canVisit,
    nextVisitTime: user.last_visit + VISIT_COOLDOWN_MS,
  });
});

/**
 * GET /api/state
 * Returns all placed pixels, current progress, canvas dimensions, and stats.
 */
app.get('/api/state', (req, res) => {
  const pixels         = db.prepare('SELECT x, y, color, user_name FROM pixels').all();
  const progress       = getProgress();
  const totalPixels    = getTotalPixels();
  const uniqueVisitors = getUniqueVisitors();
  const totalVisitsRow = db.prepare('SELECT SUM(total_visits) AS total FROM users').get();
  const groupEarned    = db.prepare('SELECT achievement_key, earned_at FROM group_achievements').all();

  res.json({
    pixels,
    progress,
    canvasSize: getCanvasSize(progress),
    stats: {
      totalPixels,
      uniqueVisitors,
      totalVisits: totalVisitsRow.total || 0,
    },
    groupAchievements: groupEarned,
  });
});

/**
 * POST /api/place
 * Body: { name, x, y, color }
 *
 * Places (or overwrites) a pixel on the canvas.
 * Decrements the user's pixels_remaining.
 */
app.post('/api/place', (req, res) => {
  const { name, x, y, color } = req.body;

  if (!name || x === undefined || y === undefined || !color) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user) {
    return res.status(404).json({ error: 'User not found. Please log in first.' });
  }

  if (user.pixels_remaining <= 0) {
    return res.status(403).json({ error: 'No pixels remaining for this visit. Come back in 12 hours!' });
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'Invalid color format' });
  }

  const canvasSize = getCanvasSize(getProgress());
  if (x < 0 || x >= canvasSize || y < 0 || y >= canvasSize) {
    return res.status(400).json({ error: 'Coordinates are outside the current canvas bounds' });
  }

  const now = Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(x, y, color, name, now);

  db.prepare(`
    UPDATE users
    SET pixels_remaining = pixels_remaining - 1,
        pixels_placed    = pixels_placed    + 1
    WHERE name = ?
  `).run(name);

  const updatedUser = db.prepare('SELECT * FROM users WHERE name = ?').get(name);

  const newAchievements = [
    ...checkIndividualAchievements(name),
    ...checkGroupAchievements(),
  ];

  res.json({
    success: true,
    pixel: { x, y, color, user_name: name },
    pixels_remaining: updatedUser.pixels_remaining,
    newAchievements,
  });
});

/**
 * GET /api/achievements?name=<name>
 * Returns all achievement definitions plus which ones have been earned
 * (user-level and group-level).
 */
app.get('/api/achievements', (req, res) => {
  const { name } = req.query;

  const groupEarned = db.prepare('SELECT achievement_key, earned_at FROM group_achievements').all();
  const userEarned  = name
    ? db.prepare('SELECT achievement_key, earned_at FROM user_achievements WHERE user_name = ?').all(name)
    : [];

  res.json({
    individual: { definitions: INDIVIDUAL_ACHIEVEMENTS, earned: userEarned },
    group:      { definitions: GROUP_ACHIEVEMENTS,      earned: groupEarned },
  });
});

/**
 * GET /api/leaderboard
 * Returns all users sorted by pixels placed.
 */
app.get('/api/leaderboard', (req, res) => {
  const users = db.prepare(`
    SELECT name, total_visits, pixels_placed, last_visit
    FROM users
    ORDER BY pixels_placed DESC, total_visits DESC
  `).all();
  res.json(users);
});

/**
 * GET /api/recent
 * Returns the 12 most recently placed pixels (for the activity feed).
 */
app.get('/api/recent', (req, res) => {
  const recent = db.prepare(`
    SELECT x, y, color, user_name, placed_at
    FROM pixels
    ORDER BY placed_at DESC
    LIMIT 12
  `).all();
  res.json(recent);
});

/**
 * POST /api/reset
 * Body: { secret: string }
 *
 * Wipes all data and resets the island to its initial state.
 * Requires the RESET_SECRET environment variable to be set and matched.
 */
app.post('/api/reset', (req, res) => {
  const secret = process.env.RESET_SECRET;
  if (!secret || req.body.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  db.exec(`
    DELETE FROM pixels;
    DELETE FROM users;
    DELETE FROM user_achievements;
    DELETE FROM group_achievements;
    UPDATE global_stats SET value = 0 WHERE key = 'progress';
  `);

  res.json({ success: true, message: 'Island reset.' });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏔️  Shangri-La is running → http://localhost:${PORT}\n`);
});
