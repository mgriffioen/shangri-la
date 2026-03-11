/**
 * seed-demo.js
 *
 * Populates the DB with a rich mid-game state for UI testing.
 * Run with:  node seed-demo.js
 * Reset after:  node seed-demo.js --reset  (clears demo data and exits)
 */

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shangri-la.db');
const db      = new Database(DB_PATH);

const RESET = process.argv.includes('--reset');

// ─── Clear existing data ───────────────────────────────────────────────────────
db.exec(`
  DELETE FROM pixels;
  DELETE FROM users;
  DELETE FROM user_achievements;
  DELETE FROM group_achievements;
  UPDATE global_stats SET value = 0 WHERE key = 'progress';
`);

if (RESET) {
  console.log('✅  DB cleared. Exiting.');
  process.exit(0);
}

// ─── Members ──────────────────────────────────────────────────────────────────
const now = Date.now();
const hour = 3_600_000;

const members = [
  { name: 'Mark',     visits: 27, pixels: 215, lastVisit: now - 2 * hour  },
  { name: 'Sean',     visits: 18, pixels: 88,  lastVisit: now - 5 * hour  },
  { name: 'Carl',     visits: 12, pixels: 55,  lastVisit: now - 14 * hour },
  { name: 'Benedict', visits: 37,  pixels: 131,  lastVisit: now - 20 * hour },
  { name: 'Dusty',    visits: 50,  pixels: 22,  lastVisit: now - 30 * hour },
  { name: 'Paul',     visits: 103,  pixels: 102,  lastVisit: now - 48 * hour },
  { name: 'Erik',     visits: 14,  pixels: 55,   lastVisit: now - 60 * hour },
  { name: 'Brandon',  visits: 81,  pixels: 153,   lastVisit: now - 72 * hour },
];

const insertUser = db.prepare(`
  INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining)
  VALUES (@name, @lastVisit, @visits, @pixels, 3)
`);
for (const m of members) insertUser.run(m);

// ─── Individual achievements ───────────────────────────────────────────────────
// lake_livin  → place 1 pixel
// tgif        → visit 5 times
// perfect_spiral → visit 15 times
// gets_it     → visit 25 times
// nice        → place 69 pixels
// omp         → place 200 pixels

const insertAch = db.prepare(`
  INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
  VALUES (?, ?, ?)
`);

for (const m of members) {
  // Everyone who joined gets lake_livin
  insertAch.run(m.name, 'lake_livin', now - m.visits * hour);

  if (m.visits >= 5)  insertAch.run(m.name, 'tgif',           now - (m.visits - 5)  * hour);
  if (m.visits >= 15) insertAch.run(m.name, 'perfect_spiral', now - (m.visits - 15) * hour);
  if (m.visits >= 25) insertAch.run(m.name, 'gets_it',        now - (m.visits - 25) * hour);
  if (m.pixels >= 69)  insertAch.run(m.name, 'nice', now - 2 * hour);
  if (m.pixels >= 200) insertAch.run(m.name, 'omp',  now - 1 * hour);
}

// ─── Group achievements ────────────────────────────────────────────────────────
// we_did_it   → all 8 builders visited  ✓ (all 8 are in)
// slide_raft  → 100 pixels placed        ✓ (433 total)
// nice_nice   → 420 pixels placed        ✓
// home_invasion, coming_going, shangri_la → not yet

const insertGroup = db.prepare(`
  INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)
`);
insertGroup.run('we_did_it',  now - 50 * hour);
insertGroup.run('slide_raft', now - 30 * hour);
insertGroup.run('nice_nice',  now - 10 * hour);

// ─── Pixels ───────────────────────────────────────────────────────────────────
// Paint a recognisable island shape on the 32×32 canvas.

const PALETTE = {
  ocean:   '#1a6691',
  sand:    '#deb887',
  grass:   '#2e7d32',
  tree:    '#1b5e20',
  rock:    '#607d8b',
  flower:  '#e91e63',
  path:    '#c19a6b',
};

// Helper: fill a rectangle
function rect(x0, y0, x1, y1, color, userName) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      pixels.push({ x, y, color, userName });
    }
  }
}

const pixels = [];

// Central island mass — sandy base
rect(8, 8, 23, 23, PALETTE.sand, 'Mark');

// Grassy interior
rect(10, 10, 21, 21, PALETTE.grass, 'Mark');

// Tree clusters
rect(11, 11, 13, 13, PALETTE.tree, 'Sean');
rect(18, 11, 20, 13, PALETTE.tree, 'Carl');
rect(11, 18, 13, 20, PALETTE.tree, 'Benedict');
rect(18, 18, 20, 20, PALETTE.tree, 'Dusty');

// Rocky shoreline patches
[[8,8],[8,23],[23,8],[23,23],[9,9],[9,22],[22,9],[22,22]].forEach(([x,y]) => {
  pixels.push({ x, y, color: PALETTE.rock, userName: 'Paul' });
});

// Central path cross
rect(15, 10, 16, 21, PALETTE.path, 'Mark');
rect(10, 15, 21, 16, PALETTE.path, 'Mark');

// Flower spots
[[14,12],[17,12],[14,19],[17,19],[12,15],[19,15]].forEach(([x,y]) => {
  pixels.push({ x, y, color: PALETTE.flower, userName: 'Erik' });
});

// A few ocean pixels near shore
[[7,15],[7,16],[24,15],[24,16],[15,7],[16,7],[15,24],[16,24]].forEach(([x,y]) => {
  pixels.push({ x, y, color: PALETTE.ocean, userName: 'Brandon' });
});

const insertPixel = db.prepare(`
  INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at) VALUES (?, ?, ?, ?, ?)
`);
const insertMany = db.transaction(() => {
  pixels.forEach((p, i) => insertPixel.run(p.x, p.y, p.color, p.userName, now - i * 60_000));
});
insertMany();

// ─── Progress ─────────────────────────────────────────────────────────────────
// 433 total pixels / 1024 (32×32) ≈ 42% — set to a round number for display
const totalPixels = members.reduce((s, m) => s + m.pixels, 0);
const progress    = parseFloat(((totalPixels / (32 * 32)) * 100).toFixed(2));

db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(progress);

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log(`✅  Demo data seeded.`);
console.log(`   Members : ${members.length}`);
console.log(`   Pixels  : ${pixels.length} placed on canvas`);
console.log(`   Progress: ${progress}%`);
console.log(`   Group achievements unlocked: we_did_it, slide_raft, nice_nice`);
console.log(`\n   To reset: node seed-demo.js --reset`);
