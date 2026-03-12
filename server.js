const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');

const app = express();
app.use(express.json());

// ─── CRC32 (for PNG generation) ────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len     = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ─── Serve index.html with injected OG origin ─────────────────────────────────

const INDEX_HTML = path.join(__dirname, 'public', 'index.html');

app.get('/', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const html   = fs.readFileSync(INDEX_HTML, 'utf8').replaceAll('__OG_ORIGIN__', origin);
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shangri-la.db');

const PIXELS_PER_VISIT = 8;
const VISIT_COOLDOWN_MS = 260 * 60 * 1000;      // 4 hours 20 minutes
// const VISIT_COOLDOWN_MS = 10 * 1000             // 10 second for testing
const PROGRESS_PER_VISIT = 0.1;             // 0.1% each visit
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

// Add undo columns if they don't exist yet (safe migration)
for (const col of [
  'undo_available INTEGER DEFAULT 0',
  'undo_x INTEGER',
  'undo_y INTEGER',
  'undo_prev_color TEXT',
  'undo_prev_user TEXT',
  'trivia_used INTEGER DEFAULT 0',
]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {}
}

// ─── Achievement Definitions ───────────────────────────────────────────────────

const INDIVIDUAL_ACHIEVEMENTS = [
  {
    key: 'lake_livin',
    name: 'Lake Living',
    description: 'You have begun the journey to Shangri-La',
    icon: '🌅',
  },
  {
    key: 'true_friend',
    name: 'True Friend',
    description: 'You visited a second time',
    icon: '🥹',
  },
  {
    key: 'tgif',
    name: 'TGIF',
    description: 'Visit the island 5 times',
    icon: '⭐',
  },
  {
    key: 'hotel_eggs',
    name: 'Hotel Eggs',
    description: 'Visit the island 10 times',
    icon: '🍳',
  },
  {
    key: 'vouch_for',
    name: 'I Vouch for Him',
    description: 'Place 21 pixels on the island',
    icon: '👍',
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
    description: 'Place 88 pixels on the island',
    icon: '🍖',
  },
  {
    key: 'gets_it',
    name: 'This guy gets it',
    description: 'Visit the island 25 times',
    icon: '👏',
  },
  {
    key: 'cmon',
    name: 'C‘mon',
    description: 'Visit the island 55 times',
    icon: '🚬',
  },
  {
    key: 'nice',
    name: 'Nice',
    description: 'Place 69 pixels on the island',
    icon: '👀',
  },
  {
    key: 'lake_101',
    name: 'LAKE 101!!!',
    description: 'Visit the island 101 times',
    icon: '🚤',
  },
  {
    key: 'kubb_god',
    name: 'Kubb God',
    description: 'Place 111 pixels on the island',
    icon: '👑',
  },
  {
    key: 'omp',
    name: 'Old Man Paul',
    description: 'Place 200 pixels on the island',
    icon: '👴',
  },
  {
    key: 'party_bot',
    name: 'Friend of Party Bot Micro',
    description: 'Place 333 pixels on the island',
    icon: '🤖',
  },
];

const GROUP_ACHIEVEMENTS = [
  {
    key: 'we_did_it',
    name: 'We Did It!',
    description: `All ${MAX_GROUP_SIZE} hunks have visited Shangri-La`,
    icon: '🚢',
  },
  {
    key: 'hot_dog_house',
    name: 'Hot Dog House',
    description: '44 pixels have been placed on the island',
    icon: '🌭',
  },
  {
    key: 'slide_raft',
    name: 'The Slide is on the Raft',
    description: '100 pixels have been placed on the island',
    icon: '🛝',
  },
  {
    key: 'case_closed',
    name: 'Case Closed',
    description: '199 pixels have been placed on the island',
    icon: '👨‍⚖️',
  },
  {
    key: 'nice_nice',
    name: 'NICE',
    description: '420 pixels have been placed on the island',
    icon: '🤙',
  },
  {
    key: 'this_economy',
    name: 'In This Economy?',
    description: 'Island progress has reached 33%',
    icon: '💰',
  },
  {
    key: 'people_forget',
    name: 'People Forget, But They Shouldn’t',
    description: 'Island progress has reached 88%',
    icon: '🤔',
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
    key: 'backflip',
    name: 'Teach You to Backflip',
    description: `Every builder has visited Shangri-La at least twice`,
    icon: '🤸‍♀️',
  },
  {
    key: 'bring_it_on',
    name: 'BRING IT ON',
    description: `Every builder has visited Shangri-La at least three times`,
    icon: '❄️',
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
    { key: 'lake_livin',        condition: user.pixels_placed >= 8   },
    { key: 'true_friend',      condition: user.total_visits  >= 2   },
    { key: 'tgif',      condition: user.total_visits  >= 5   },
    { key: 'hotel_eggs',      condition: user.total_visits  >= 10   },
    { key: 'vouch_for',       condition: user.pixels_placed >= 21  },
    { key: 'perfect_spiral',  condition: user.total_visits  >= 15  },
    { key: 'ham_point',       condition: user.pixels_placed >= 88  },
    { key: 'gets_it',  condition: user.total_visits  >= 25  },
    { key: 'cmon',  condition: user.total_visits  >= 55  },
    { key: 'nice',       condition: user.pixels_placed >= 69  },
    { key: 'lake_101',  condition: user.total_visits  >= 101  },
    { key: 'kubb_god',     condition: user.pixels_placed >= 111 },
    { key: 'omp',     condition: user.pixels_placed >= 200 },
    { key: 'party_bot',     condition: user.pixels_placed >= 333 },
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

function getMembersWithMinVisits(minVisits) {
  return db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE total_visits >= ?').get(minVisits).cnt;
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
    { key: 'backflip',        condition: getMembersWithMinVisits(2) >= MAX_GROUP_SIZE },
    { key: 'bring_it_on',     condition: getMembersWithMinVisits(3) >= MAX_GROUP_SIZE },
    { key: 'hot_dog_house',  condition: totalPixels    >= 44            },
    { key: 'slide_raft',  condition: totalPixels    >= 100            },
    { key: 'case_closed',  condition: totalPixels    >= 199            },
    { key: 'nice_nice',  condition: totalPixels    >= 420            },
    { key: 'this_economy',  condition: progress       >= 33             },
    { key: 'people_forget',  condition: progress       >= 88             },
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
 * GET /og-image
 * Returns a PNG thumbnail of the current pixel map for OG meta tags.
 */
app.get('/og-image', (req, res) => {
  const progress   = getProgress();
  const canvasSize = getCanvasSize(progress);
  const pixels     = db.prepare('SELECT x, y, color FROM pixels').all();

  const pixelMap = {};
  for (const p of pixels) pixelMap[`${p.x},${p.y}`] = p.color;

  const BG    = '#1a6691';                              // unpainted = ocean
  const SCALE = Math.max(4, Math.floor(512 / canvasSize)); // target ~512 px
  const W     = canvasSize * SCALE;
  const H     = canvasSize * SCALE;

  // Build raw scanlines: [filter-byte, R, G, B, …] per row
  const scanlines = [];
  for (let cy = 0; cy < canvasSize; cy++) {
    const row = Buffer.alloc(1 + W * 3);
    row[0] = 0; // filter: None
    for (let cx = 0; cx < canvasSize; cx++) {
      const hex = pixelMap[`${cx},${cy}`] || BG;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      for (let s = 0; s < SCALE; s++) {
        const off = 1 + (cx * SCALE + s) * 3;
        row[off] = r; row[off + 1] = g; row[off + 2] = b;
      }
    }
    for (let s = 0; s < SCALE; s++) scanlines.push(row);
  }

  // Crop to 1.91:1 (standard OG ratio) from the vertical centre
  const cropH    = Math.round(W / 1.91);
  const cropStart = Math.round((H - cropH) / 2);
  const cropped   = scanlines.slice(cropStart, cropStart + cropH);

  const idat = zlib.deflateSync(Buffer.concat(cropped));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(cropH, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=60');
  res.send(png);
});

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
          pixels_remaining = ?,
          undo_available   = 0,
          undo_x           = NULL,
          undo_y           = NULL,
          undo_prev_color  = NULL,
          undo_prev_user   = NULL,
          trivia_used      = 0
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
    undoAvailable: user.undo_available === 1 && user.pixels_remaining > 0,
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

  // Save current pixel at this position for undo (may be null if empty)
  const prevPixel = db.prepare('SELECT color, user_name FROM pixels WHERE x = ? AND y = ?').get(x, y);

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

  let nextVisitTime = null;
  if (updatedUser.pixels_remaining === 0) {
    // Final pixel — start cooldown, no undo allowed
    db.prepare(`
      UPDATE users SET last_visit = ?, undo_available = 0, undo_x = NULL, undo_y = NULL,
        undo_prev_color = NULL, undo_prev_user = NULL WHERE name = ?
    `).run(now, name);
    nextVisitTime = now + VISIT_COOLDOWN_MS;
  } else {
    // Save undo state
    db.prepare(`
      UPDATE users SET undo_available = 1, undo_x = ?, undo_y = ?,
        undo_prev_color = ?, undo_prev_user = ? WHERE name = ?
    `).run(x, y, prevPixel?.color ?? null, prevPixel?.user_name ?? null, name);
  }

  const newAchievements = [
    ...checkIndividualAchievements(name),
    ...checkGroupAchievements(),
  ];

  res.json({
    success: true,
    pixel: { x, y, color, user_name: name },
    pixels_remaining: updatedUser.pixels_remaining,
    undoAvailable: updatedUser.pixels_remaining > 0,
    nextVisitTime,
    newAchievements,
    offerTrivia: updatedUser.pixels_remaining === 0 && updatedUser.trivia_used === 0 && Math.random() < 0.34,
  });
});

/**
 * POST /api/undo
 * Undoes the last pixel placement for the current visit.
 */
app.post('/api/undo', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.undo_available) return res.status(403).json({ error: 'Nothing to undo' });

  const { undo_x: ux, undo_y: uy, undo_prev_color: prevColor, undo_prev_user: prevUser } = user;

  let restoredPixel = null;
  if (prevColor) {
    db.prepare('INSERT OR REPLACE INTO pixels (x, y, color, user_name) VALUES (?, ?, ?, ?)').run(ux, uy, prevColor, prevUser);
    restoredPixel = { x: ux, y: uy, color: prevColor, user_name: prevUser };
  } else {
    db.prepare('DELETE FROM pixels WHERE x = ? AND y = ?').run(ux, uy);
  }

  db.prepare(`
    UPDATE users SET
      pixels_remaining = pixels_remaining + 1,
      pixels_placed    = pixels_placed - 1,
      undo_available   = 0,
      undo_x           = NULL,
      undo_y           = NULL,
      undo_prev_color  = NULL,
      undo_prev_user   = NULL
    WHERE name = ?
  `).run(name);

  const updatedUser = db.prepare('SELECT * FROM users WHERE name = ?').get(name);

  res.json({
    success: true,
    pixels_remaining: updatedUser.pixels_remaining,
    undonePixel: { x: ux, y: uy },
    restoredPixel,
  });
});

/**
 * POST /api/trivia-reward
 * Awards 8 bonus pixels when the user answers trivia correctly.
 * Can only be claimed once per cooldown cycle.
 */
app.post('/api/trivia-reward', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.trivia_used) return res.status(403).json({ error: 'Trivia reward already claimed this cycle' });
  if (user.pixels_remaining > 0) return res.status(403).json({ error: 'You still have pixels remaining' });

  db.prepare(`
    UPDATE users SET pixels_remaining = ?, last_visit = 0, trivia_used = 1 WHERE name = ?
  `).run(PIXELS_PER_VISIT, name);

  const updatedUser = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
  res.json({ success: true, pixels_remaining: updatedUser.pixels_remaining });
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

  // 800 total visits × 0.1% = 80% progress, canvas at 80×80
  const members = [
    { name: 'Mark',     visits: 130, pixels: 820, lastVisit: now - 1  * hour },
    { name: 'Sean',     visits: 100, pixels: 660, lastVisit: now - 3  * hour },
    { name: 'Carl',     visits: 95,  pixels: 420, lastVisit: now - 7  * hour },
    { name: 'Benedict', visits: 100, pixels: 390, lastVisit: now - 15 * hour },
    { name: 'Dusty',    visits: 88,  pixels: 340, lastVisit: now - 20 * hour },
    { name: 'Paul',     visits: 92,  pixels: 360, lastVisit: now - 32 * hour },
    { name: 'Erik',     visits: 98,  pixels: 400, lastVisit: now - 44 * hour },
    { name: 'Brandon',  visits: 97,  pixels: 480, lastVisit: now - 60 * hour },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining)
    VALUES (@name, @lastVisit, @visits, @pixels, 3)
  `);
  for (const m of members) insertUser.run(m);

  // Everyone has 88+ visits and 340+ pixels — all 6 individual achievements
  const insertAch = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
    VALUES (?, ?, ?)
  `);
  for (const m of members) {
    insertAch.run(m.name, 'lake_livin',     now - m.visits        * hour);
    insertAch.run(m.name, 'tgif',           now - (m.visits - 5)  * hour);
    insertAch.run(m.name, 'perfect_spiral', now - (m.visits - 15) * hour);
    insertAch.run(m.name, 'gets_it',        now - (m.visits - 25) * hour);
    insertAch.run(m.name, 'nice',           now - (m.visits - 40) * hour);
    insertAch.run(m.name, 'omp',            now - (m.visits - 80) * hour);
  }

  // All group achievements except shangri_la (island at 80%, still going)
  const insertGroup = db.prepare(`INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)`);
  insertGroup.run('we_did_it',     now - 780 * hour);
  insertGroup.run('backflip',      now - 770 * hour);
  insertGroup.run('bring_it_on',   now - 755 * hour);
  insertGroup.run('hot_dog_house', now - 700 * hour);
  insertGroup.run('slide_raft',    now - 600 * hour);
  insertGroup.run('nice_nice',     now - 400 * hour);
  insertGroup.run('this_economy',  now - 300 * hour);
  insertGroup.run('home_invasion', now - 200 * hour);
  insertGroup.run('coming_going',  now - 100 * hour);

  // Large island on the 80×80 canvas
  const PALETTE = { ocean: '#1a6691', sand: '#deb887', grass: '#2e7d32', tree: '#1b5e20', rock: '#607d8b', flower: '#e91e63', path: '#c19a6b' };
  const paintedPixels = [];
  const rect = (x0, y0, x1, y1, color, user) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        paintedPixels.push({ x, y, color, user });
  };
  const dots = (coords, color, user) => {
    for (const [x, y] of coords) paintedPixels.push({ x, y, color, user });
  };

  rect(10, 10, 69, 69, PALETTE.sand,  'Mark');
  rect(14, 14, 65, 65, PALETTE.grass, 'Sean');
  rect(15, 15, 21, 21, PALETTE.tree,  'Carl');
  rect(58, 15, 64, 21, PALETTE.tree,  'Benedict');
  rect(15, 58, 21, 64, PALETTE.tree,  'Dusty');
  rect(58, 58, 64, 64, PALETTE.tree,  'Paul');
  rect(36, 17, 43, 23, PALETTE.tree,  'Erik');
  rect(36, 56, 43, 62, PALETTE.tree,  'Brandon');
  rect(17, 36, 23, 43, PALETTE.tree,  'Carl');
  rect(56, 36, 62, 43, PALETTE.tree,  'Benedict');
  rect(38, 14, 39, 65, PALETTE.path,  'Mark');
  rect(14, 38, 65, 39, PALETTE.path,  'Mark');
  dots([[25,25],[26,25],[25,26],[26,26],[27,26],[26,27],[27,27],[28,27],[27,28],[28,28],[50,25],[51,25],[50,26],[51,26],[52,26],[51,27],[52,27],[53,27],[52,28],[53,28],[25,50],[26,50],[25,51],[26,51],[27,51],[26,52],[27,52],[28,52],[27,53],[28,53],[50,50],[51,50],[50,51],[51,51],[52,51],[51,52],[52,52],[53,52],[52,53],[53,53]], PALETTE.path, 'Sean');
  rect(34, 34, 45, 45, PALETTE.sand,  'Sean');
  rect(26, 26, 31, 31, PALETTE.ocean, 'Carl');
  rect(48, 26, 53, 31, PALETTE.ocean, 'Carl');
  rect(26, 48, 31, 53, PALETTE.ocean, 'Carl');
  rect(48, 48, 53, 53, PALETTE.ocean, 'Carl');
  dots([[10,10],[10,11],[11,10],[68,10],[69,10],[69,11],[10,68],[10,69],[11,69],[68,69],[69,68],[69,69],[10,38],[10,39],[10,40],[69,38],[69,39],[69,40],[38,10],[39,10],[40,10],[38,69],[39,69],[40,69],[33,20],[34,20],[45,20],[46,20],[20,33],[20,34],[20,45],[20,46],[59,33],[59,34],[59,45],[59,46],[33,59],[34,59],[45,59],[46,59]], PALETTE.rock, 'Paul');
  dots([[33,33],[46,33],[33,46],[46,46],[28,38],[29,38],[50,38],[51,38],[38,28],[38,29],[38,50],[38,51],[22,22],[22,23],[23,22],[56,22],[57,22],[56,23],[22,56],[22,57],[23,57],[56,56],[57,56],[56,57],[30,18],[40,18],[50,18],[18,30],[18,40],[18,50],[61,30],[61,40],[61,50],[30,61],[40,61],[50,61]], PALETTE.flower, 'Erik');
  dots([[38,7],[39,7],[38,8],[39,8],[38,9],[39,9]], PALETTE.path, 'Brandon');
  dots([[8,38],[8,39],[8,40],[71,38],[71,39],[71,40],[38,8],[39,8],[40,8],[38,71],[39,71],[40,71],[9,20],[9,21],[9,50],[9,51],[70,20],[70,21],[70,50],[70,51],[20,9],[21,9],[50,9],[51,9],[20,70],[21,70],[50,70],[51,70]], PALETTE.ocean, 'Brandon');

  const insertPixel = db.prepare(`INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at) VALUES (?, ?, ?, ?, ?)`);
  const insertAll = db.transaction(() => {
    paintedPixels.forEach((p, i) => insertPixel.run(p.x, p.y, p.color, p.user, now - i * 30_000));
  });
  insertAll();

  db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(80);

  res.json({ success: true, message: `Demo state loaded. ${members.length} members, ${paintedPixels.length} pixels, 80% progress.` });
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
