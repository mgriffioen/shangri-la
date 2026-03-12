/**
 * seed-demo.js
 *
 * Populates the DB with a rich late-game state (~80% progress) for UI testing.
 * Run with:  node seed-demo.js
 * Reset:     node seed-demo.js --reset
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
// 800 total visits × 0.1% = 80% progress
const now  = Date.now();
const hour = 3_600_000;

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

// ─── Individual achievements ───────────────────────────────────────────────────
// Everyone has 88+ visits and 340+ pixels — all 6 achievements earned by all
const insertAch = db.prepare(`
  INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
  VALUES (?, ?, ?)
`);

for (const m of members) {
  insertAch.run(m.name, 'lake_livin',      now - m.visits        * hour);
  insertAch.run(m.name, 'tgif',            now - (m.visits - 5)  * hour);
  insertAch.run(m.name, 'perfect_spiral',  now - (m.visits - 15) * hour);
  insertAch.run(m.name, 'gets_it',         now - (m.visits - 25) * hour);
  insertAch.run(m.name, 'nice',            now - (m.visits - 40) * hour);
  insertAch.run(m.name, 'omp',             now - (m.visits - 80) * hour);
}

// ─── Group achievements ────────────────────────────────────────────────────────
// All except shangri_la (100%) — island is at 80%, still going
const insertGroup = db.prepare(`
  INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)
`);
insertGroup.run('we_did_it',    now - 780 * hour);
insertGroup.run('backflip',     now - 770 * hour);
insertGroup.run('bring_it_on',  now - 755 * hour);
insertGroup.run('hot_dog_house',now - 700 * hour);
insertGroup.run('slide_raft',   now - 600 * hour);
insertGroup.run('nice_nice',    now - 400 * hour);
insertGroup.run('this_economy', now - 300 * hour);
insertGroup.run('home_invasion',now - 200 * hour);
insertGroup.run('coming_going', now - 100 * hour);

// ─── Island pixels ────────────────────────────────────────────────────────────
// 80×80 canvas. Paint a large, detailed island with beach, grass, trees,
// paths, ponds, rocks, flowers, and a small dock.

const PALETTE = {
  ocean:  '#1a6691',
  sand:   '#deb887',
  grass:  '#2e7d32',
  tree:   '#1b5e20',
  rock:   '#607d8b',
  flower: '#e91e63',
  path:   '#c19a6b',
};

const pixels = [];

function rect(x0, y0, x1, y1, color, userName) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      pixels.push({ x, y, color, userName });
}

function dots(coords, color, userName) {
  for (const [x, y] of coords)
    pixels.push({ x, y, color, userName });
}

// Sandy island footprint
rect(10, 10, 69, 69, PALETTE.sand,  'Mark');

// Grassy interior
rect(14, 14, 65, 65, PALETTE.grass, 'Sean');

// ── Tree clusters ──────────────────────────────────────────────────────────────
rect(15, 15, 21, 21, PALETTE.tree, 'Carl');      // NW corner
rect(58, 15, 64, 21, PALETTE.tree, 'Benedict');  // NE corner
rect(15, 58, 21, 64, PALETTE.tree, 'Dusty');     // SW corner
rect(58, 58, 64, 64, PALETTE.tree, 'Paul');      // SE corner
rect(36, 17, 43, 23, PALETTE.tree, 'Erik');      // N central
rect(36, 56, 43, 62, PALETTE.tree, 'Brandon');   // S central
rect(17, 36, 23, 43, PALETTE.tree, 'Carl');      // W central
rect(56, 36, 62, 43, PALETTE.tree, 'Benedict');  // E central

// ── Main path network ──────────────────────────────────────────────────────────
rect(38, 14, 39, 65, PALETTE.path, 'Mark');   // N-S spine
rect(14, 38, 65, 39, PALETTE.path, 'Mark');   // E-W spine

// Diagonal paths through quadrants (3 cells wide, diagonal approximation)
dots([
  [25,25],[26,25],[25,26],[26,26],[27,26],[26,27],[27,27],[28,27],[27,28],[28,28],
  [50,25],[51,25],[50,26],[51,26],[52,26],[51,27],[52,27],[53,27],[52,28],[53,28],
  [25,50],[26,50],[25,51],[26,51],[27,51],[26,52],[27,52],[28,52],[27,53],[28,53],
  [50,50],[51,50],[50,51],[51,51],[52,51],[51,52],[52,52],[53,52],[52,53],[53,53],
], PALETTE.path, 'Sean');

// ── Central plaza (at crossing) ────────────────────────────────────────────────
rect(34, 34, 45, 45, PALETTE.sand, 'Sean');

// ── Inner ponds ────────────────────────────────────────────────────────────────
rect(26, 26, 31, 31, PALETTE.ocean, 'Carl');   // NW pond
rect(48, 26, 53, 31, PALETTE.ocean, 'Carl');   // NE pond
rect(26, 48, 31, 53, PALETTE.ocean, 'Carl');   // SW pond
rect(48, 48, 53, 53, PALETTE.ocean, 'Carl');   // SE pond

// ── Rocky shoreline ────────────────────────────────────────────────────────────
dots([
  // Island edge rock accents
  [10,10],[10,11],[11,10],  [68,10],[69,10],[69,11],
  [10,68],[10,69],[11,69],  [68,69],[69,68],[69,69],
  // Midpoint rocks along each edge
  [10,38],[10,39],[10,40],  [69,38],[69,39],[69,40],
  [38,10],[39,10],[40,10],  [38,69],[39,69],[40,69],
  // Scattered interior rocks
  [33,20],[34,20],[45,20],[46,20],
  [20,33],[20,34],[20,45],[20,46],
  [59,33],[59,34],[59,45],[59,46],
  [33,59],[34,59],[45,59],[46,59],
], PALETTE.rock, 'Paul');

// ── Flowers ────────────────────────────────────────────────────────────────────
dots([
  // Around central plaza
  [33,33],[46,33],[33,46],[46,46],
  // Along paths
  [28,38],[29,38],[50,38],[51,38],
  [38,28],[38,29],[38,50],[38,51],
  // Near tree clusters
  [22,22],[22,23],[23,22],
  [56,22],[57,22],[56,23],
  [22,56],[22,57],[23,57],
  [56,56],[57,56],[56,57],
  // Scattered
  [30,18],[40,18],[50,18],
  [18,30],[18,40],[18,50],
  [61,30],[61,40],[61,50],
  [30,61],[40,61],[50,61],
], PALETTE.flower, 'Erik');

// ── Small dock extending north into ocean ─────────────────────────────────────
dots([
  [38,7],[39,7],[38,8],[39,8],[38,9],[39,9],
], PALETTE.path, 'Brandon');

// ── Ocean pixels near shore (wave accents) ─────────────────────────────────────
dots([
  [8,38],[8,39],[8,40],[71,38],[71,39],[71,40],
  [38,8],[39,8],[40,8],[38,71],[39,71],[40,71],
  [9,20],[9,21],[9,50],[9,51],
  [70,20],[70,21],[70,50],[70,51],
  [20,9],[21,9],[50,9],[51,9],
  [20,70],[21,70],[50,70],[51,70],
], PALETTE.ocean, 'Brandon');

// ─── Insert pixels ─────────────────────────────────────────────────────────────
const insertPixel = db.prepare(`
  INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at)
  VALUES (?, ?, ?, ?, ?)
`);
const insertMany = db.transaction(() => {
  pixels.forEach((p, i) => insertPixel.run(p.x, p.y, p.color, p.userName, now - i * 30_000));
});
insertMany();

// ─── Progress ─────────────────────────────────────────────────────────────────
db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(80);

// ─── Done ─────────────────────────────────────────────────────────────────────
const totalVisits = members.reduce((s, m) => s + m.visits, 0);
console.log('✅  Demo data seeded (late-game state).');
console.log(`   Members : ${members.length}`);
console.log(`   Pixels  : ${pixels.length} placed on canvas`);
console.log(`   Progress: 80%  (${totalVisits} total visits × 0.1%)`);
console.log(`   Canvas  : 80×80`);
console.log(`   Group achievements: all except shangri_la`);
console.log(`   Individual achievements: all 6 for every member`);
console.log(`\n   To reset: node seed-demo.js --reset`);
