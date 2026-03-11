const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shangri-la.db');

const PIXELS_PER_VISIT = 5;
const VISIT_COOLDOWN_MS = 260 * 60 * 1000; // 4 hours 20 minutes
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
    key: 'lake_livin',
    name: 'Lake Living',
    description: 'You have begun the journey to Shangri-La',
    icon: '🌅',
  },
  {
    key: 'tgif',
    name: 'TGIF',
    description: 'Visit the island 5 times',
    icon: '⭐',
  },
  {
    key: 'perfect_spiral',
    name: 'Perfect Spiral',
    description: 'Visit the island 15 times',
    icon: '🏈',
  },
  {
    key: 'ham_point',
    name: 'Ham Point',
    description: 'Place 22 pixels on the island',
    icon: '🍖',
  },
  {
    key: 'gets_it',
    name: 'This guy gets it',
    description: 'Visit the island 25 times',
    icon: '👏',
  },
  {
    key: 'nice',
    name: 'Nice',
    description: 'Place 69 pixels on the island',
    icon: '👀',
  },
  {
    key: 'omp',
    name: 'Old Man Paul',
    description: 'Place 200 pixels on the island',
    icon: '👴',
  },
];

const GROUP_ACHIEVEMENTS = [
  {
    key: 'we_did_it',
    name: 'We Did It!',
    description: `All ${MAX_GROUP_SIZE} builders have visited Shangri-La`,
    icon: '🚢',
  },
  {
    key: 'slide_raft',
    name: 'The Slide is on the Raft',
    description: '100 pixels have been placed on the island',
    icon: '🛝',
  },
  {
    key: 'nice_nice',
    name: 'NICE',
    description: '420 pixels have been placed on the island',
    icon: '🤙',
  },
  {
    key: 'home_invasion',
    name: 'Home Invasion!!',
    description: '666 pixels have been placed on the island',
    icon: '🏚️',
  },
  {
    key: 'coming_going',
    name: 'It is Really Coming and Going',
    description: 'Island progress has reached 50%',
    icon: '🌦️',
  },
  {
    key: 'shangri_la',
    name: 'Shangri-La Achieved!',
    description: 'The island is complete — 100% progress reached!',
    icon: '🌞',
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
    { key: 'lake_livin',        condition: user.pixels_placed >= 1   },
    { key: 'tgif',      condition: user.total_visits  >= 5   },
    { key: 'perfect_spiral',  condition: user.total_visits  >= 15  },
    { key: 'ham_point',       condition: user.pixels_placed >= 22  },
    { key: 'gets_it',  condition: user.total_visits  >= 25  },
    { key: 'nice',       condition: user.pixels_placed >= 69  },
    { key: 'omp',     condition: user.pixels_placed >= 200 },
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
    { key: 'we_did_it',       condition: uniqueVisitors >= MAX_GROUP_SIZE },
    { key: 'slide_raft',  condition: totalPixels    >= 100            },
    { key: 'nice_nice',  condition: totalPixels    >= 420            },
    { key: 'home_invasion',   condition: totalPixels    >= 666            },
    { key: 'coming_going',  condition: progress       >= 50             },
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
 * If 4h20m have elapsed since last_visit, registers a new visit:
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

  const allowedNames = process.env.ALLOWED_NAMES
    ? process.env.ALLOWED_NAMES.split(',').map(n => n.trim().toLowerCase()).filter(Boolean)
    : null;
  if (allowedNames && !allowedNames.includes(name.toLowerCase())) {
    return res.status(403).json({ error: 'This island is by invitation only. Your name is not on the guest list.' });
  }

  let user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user) {
    db.prepare(
      'INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining) VALUES (?, 0, 0, 0, 0)'
    ).run(name);
    user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  }

  const elapsed  = now - user.last_visit;
  const canVisit = user.pixels_remaining === 0 && elapsed >= VISIT_COOLDOWN_MS;
  let newVisit       = false;
  let newAchievements = [];

  if (canVisit) {
    db.prepare(`
      UPDATE users
      SET total_visits     = total_visits + 1,
          pixels_remaining = ?
      WHERE name = ?
    `).run(PIXELS_PER_VISIT, name);

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
    return res.status(403).json({ error: 'No pixels remaining for this visit. Come back in 4 hours 20 minutes!' });
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

  if (updatedUser.pixels_remaining === 0) {
    db.prepare('UPDATE users SET last_visit = ? WHERE name = ?').run(now, name);
  }

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
 * GET /api/members
 * Returns all 8 crew members (from ALLOWED_NAMES env var) with their stats
 * and earned individual achievements. Unjoined members are included as stubs.
 */
app.get('/api/members', (req, res) => {
  const allowedNames = process.env.ALLOWED_NAMES
    ? process.env.ALLOWED_NAMES.split(',').map(n => n.trim()).filter(Boolean)
    : db.prepare('SELECT name FROM users ORDER BY pixels_placed DESC').all().map(u => u.name);

  const members = allowedNames.map(allowedName => {
    const user = db.prepare('SELECT * FROM users WHERE lower(name) = lower(?)').get(allowedName);
    if (!user || user.total_visits === 0) {
      return { name: allowedName, joined: false, total_visits: 0, pixels_placed: 0, achievements: [] };
    }
    const achievements = db.prepare('SELECT achievement_key FROM user_achievements WHERE user_name = ?')
      .all(user.name)
      .map(a => a.achievement_key);
    return {
      name:          user.name,
      joined:        true,
      total_visits:  user.total_visits,
      pixels_placed: user.pixels_placed,
      achievements,
    };
  });

  res.json(members);
});

/**
 * POST /api/seed-demo
 * Body: { secret: string }
 *
 * Loads a rich mid-game demo state for UI testing.
 * Requires the RESET_SECRET environment variable to be set and matched.
 */
app.post('/api/seed-demo', (req, res) => {
  const secret = process.env.RESET_SECRET;
  if (!secret || req.body.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const now  = Date.now();
  const hour = 3_600_000;

  db.exec(`
    DELETE FROM pixels;
    DELETE FROM users;
    DELETE FROM user_achievements;
    DELETE FROM group_achievements;
    UPDATE global_stats SET value = 0 WHERE key = 'progress';
  `);

  const members = [
    { name: 'Mark',     visits: 27, pixels: 215, lastVisit: now - 2  * hour },
    { name: 'Sean',     visits: 18, pixels: 88,  lastVisit: now - 5  * hour },
    { name: 'Carl',     visits: 12, pixels: 55,  lastVisit: now - 14 * hour },
    { name: 'Benedict', visits: 7,  pixels: 31,  lastVisit: now - 20 * hour },
    { name: 'Dusty',    visits: 5,  pixels: 22,  lastVisit: now - 30 * hour },
    { name: 'Paul',     visits: 3,  pixels: 12,  lastVisit: now - 48 * hour },
    { name: 'Erik',     visits: 1,  pixels: 5,   lastVisit: now - 60 * hour },
    { name: 'Brandon',  visits: 1,  pixels: 5,   lastVisit: now - 72 * hour },
    { name: 'Zach',     visits: 1,  pixels: 5,   lastVisit: now - 84 * hour },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining)
    VALUES (@name, @lastVisit, @visits, @pixels, 3)
  `);
  for (const m of members) insertUser.run(m);

  const insertAch = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
    VALUES (?, ?, ?)
  `);
  for (const m of members) {
    insertAch.run(m.name, 'lake_livin',      now - m.visits * hour);
    if (m.visits >= 5)  insertAch.run(m.name, 'tgif',           now - (m.visits - 5)  * hour);
    if (m.visits >= 15) insertAch.run(m.name, 'perfect_spiral', now - (m.visits - 15) * hour);
    if (m.visits >= 25) insertAch.run(m.name, 'gets_it',        now - (m.visits - 25) * hour);
    if (m.pixels >= 69)  insertAch.run(m.name, 'nice', now - 2 * hour);
    if (m.pixels >= 200) insertAch.run(m.name, 'omp',  now - 1 * hour);
  }

  db.prepare(`INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)`).run('we_did_it',  now - 50 * hour);
  db.prepare(`INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)`).run('slide_raft', now - 30 * hour);
  db.prepare(`INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)`).run('nice_nice',  now - 10 * hour);

  // Island shape on the 32×32 canvas
  const PALETTE = { ocean: '#1a6691', sand: '#deb887', grass: '#2e7d32', tree: '#1b5e20', rock: '#607d8b', flower: '#e91e63', path: '#c19a6b' };
  const paintedPixels = [];
  const rect = (x0, y0, x1, y1, color, user) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        paintedPixels.push({ x, y, color, user });
  };

  rect(8, 8, 23, 23, PALETTE.sand,  'Mark');
  rect(10, 10, 21, 21, PALETTE.grass, 'Mark');
  rect(11, 11, 13, 13, PALETTE.tree,  'Sean');
  rect(18, 11, 20, 13, PALETTE.tree,  'Carl');
  rect(11, 18, 13, 20, PALETTE.tree,  'Benedict');
  rect(18, 18, 20, 20, PALETTE.tree,  'Dusty');
  [[8,8],[8,23],[23,8],[23,23],[9,9],[9,22],[22,9],[22,22]].forEach(([x,y]) =>
    paintedPixels.push({ x, y, color: PALETTE.rock, user: 'Paul' }));
  rect(15, 10, 16, 21, PALETTE.path, 'Mark');
  rect(10, 15, 21, 16, PALETTE.path, 'Mark');
  [[14,12],[17,12],[14,19],[17,19],[12,15],[19,15]].forEach(([x,y]) =>
    paintedPixels.push({ x, y, color: PALETTE.flower, user: 'Erik' }));
  [[7,15],[7,16],[24,15],[24,16],[15,7],[16,7],[15,24],[16,24]].forEach(([x,y]) =>
    paintedPixels.push({ x, y, color: PALETTE.ocean, user: 'Brandon' }));

  const insertPixel = db.prepare(`INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at) VALUES (?, ?, ?, ?, ?)`);
  const insertAll = db.transaction(() => {
    paintedPixels.forEach((p, i) => insertPixel.run(p.x, p.y, p.color, p.user, now - i * 60_000));
  });
  insertAll();

  const totalPixels = members.reduce((s, m) => s + m.pixels, 0);
  const progress    = parseFloat(((totalPixels / (32 * 32)) * 100).toFixed(2));
  db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(progress);

  res.json({ success: true, message: `Demo state loaded. ${members.length} members, ${paintedPixels.length} pixels, ${progress}% progress.` });
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
