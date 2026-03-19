/**
 * seed-endgame.js
 *
 * Loads the island in a near-complete state (99.9% progress).
 * The next login by any member will push it to 100%, triggering
 * the full endgame: confetti burst, celebration modal, and timelapse.
 *
 * Run with:  node seed-endgame.js
 */

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'shangri-la.db');
const db      = new Database(DB_PATH);

// ─── Ensure schema columns exist (added by server at startup) ─────────────────
for (const col of [
  'undo_available INTEGER DEFAULT 0',
  'undo_x INTEGER',
  'undo_y INTEGER',
  'undo_prev_color TEXT',
  'undo_prev_user TEXT',
  'trivia_used INTEGER DEFAULT 0',
  'endgame_seen INTEGER DEFAULT 0',
]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {}
}

// ─── Clear existing data ───────────────────────────────────────────────────────
db.exec(`
  DELETE FROM pixels;
  DELETE FROM users;
  DELETE FROM user_achievements;
  DELETE FROM group_achievements;
  UPDATE global_stats SET value = 0 WHERE key = 'progress';
`);

const now  = Date.now();
const hour = 3_600_000;

// ─── Members ──────────────────────────────────────────────────────────────────
// pixels_remaining = 0, last_visit = long ago → each member can visit immediately
const members = [
  { name: 'Mark',     visits: 130, pixels: 820 },
  { name: 'Sean',     visits: 100, pixels: 660 },
  { name: 'Carl',     visits: 95,  pixels: 420 },
  { name: 'Benedict', visits: 100, pixels: 390 },
  { name: 'Dusty',    visits: 88,  pixels: 340 },
  { name: 'Paul',     visits: 92,  pixels: 360 },
  { name: 'Erik',     visits: 98,  pixels: 400 },
  { name: 'Brandon',  visits: 97,  pixels: 480 },
];

const insertUser = db.prepare(`
  INSERT INTO users (name, last_visit, total_visits, pixels_placed, pixels_remaining, endgame_seen)
  VALUES (@name, 0, @visits, @pixels, 0, 0)
`);
for (const m of members) insertUser.run(m);

// ─── Individual achievements ───────────────────────────────────────────────────
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

// ─── Group achievements ────────────────────────────────────────────────────────
// All milestone achievements except shangri_la (that's the one about to fire)
const insertGroup = db.prepare(`
  INSERT OR IGNORE INTO group_achievements (achievement_key, earned_at) VALUES (?, ?)
`);
insertGroup.run('we_did_it',     now - 780 * hour);
insertGroup.run('backflip',      now - 770 * hour);
insertGroup.run('bring_it_on',   now - 755 * hour);
insertGroup.run('hot_dog_house', now - 700 * hour);
insertGroup.run('slide_raft',    now - 600 * hour);
insertGroup.run('nice_nice',     now - 400 * hour);
insertGroup.run('this_economy',  now - 300 * hour);
insertGroup.run('home_invasion', now - 200 * hour);
insertGroup.run('coming_going',  now - 100 * hour);
insertGroup.run('dustys_by',     now - 80  * hour);
insertGroup.run('worms',         now - 60  * hour);
insertGroup.run('flossmore',     now - 50  * hour);
insertGroup.run('people_forget', now - 30  * hour);
insertGroup.run('shavehead_lake',now - 10  * hour);

// ─── Island pixels (80×80 canvas, detailed island) ────────────────────────────
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
  for (const [x, y] of coords) pixels.push({ x, y, color, userName });
}

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
dots([[25,25],[26,25],[25,26],[26,26],[27,26],[26,27],[27,27],[28,27],[27,28],[28,28],[50,25],[51,25],[50,26],[51,26],[52,26],[51,27],[52,27],[53,27],[52,28],[53,28],[25,50],[26,50],[25,51],[26,51],[27,51],[26,52],[27,52],[28,52],[27,53],[28,53],[50,50],[51,50],[50,51],[51,51],[52,51],[51,52],[52,52],[53,52],[52,53],[53,53]], PALETTE.path,  'Sean');
rect(34, 34, 45, 45, PALETTE.sand,  'Sean');
rect(26, 26, 31, 31, PALETTE.ocean, 'Carl');
rect(48, 26, 53, 31, PALETTE.ocean, 'Carl');
rect(26, 48, 31, 53, PALETTE.ocean, 'Carl');
rect(48, 48, 53, 53, PALETTE.ocean, 'Carl');
dots([[10,10],[10,11],[11,10],[68,10],[69,10],[69,11],[10,68],[10,69],[11,69],[68,69],[69,68],[69,69],[10,38],[10,39],[10,40],[69,38],[69,39],[69,40],[38,10],[39,10],[40,10],[38,69],[39,69],[40,69],[33,20],[34,20],[45,20],[46,20],[20,33],[20,34],[20,45],[20,46],[59,33],[59,34],[59,45],[59,46],[33,59],[34,59],[45,59],[46,59]], PALETTE.rock,  'Paul');
dots([[33,33],[46,33],[33,46],[46,46],[28,38],[29,38],[50,38],[51,38],[38,28],[38,29],[38,50],[38,51],[22,22],[22,23],[23,22],[56,22],[57,22],[56,23],[22,56],[22,57],[23,57],[56,56],[57,56],[56,57],[30,18],[40,18],[50,18],[18,30],[18,40],[18,50],[61,30],[61,40],[61,50],[30,61],[40,61],[50,61]], PALETTE.flower,'Erik');
dots([[38,7],[39,7],[38,8],[39,8],[38,9],[39,9]], PALETTE.path, 'Brandon');
dots([[8,38],[8,39],[8,40],[71,38],[71,39],[71,40],[38,8],[39,8],[40,8],[38,71],[39,71],[40,71],[9,20],[9,21],[9,50],[9,51],[70,20],[70,21],[70,50],[70,51],[20,9],[21,9],[50,9],[51,9],[20,70],[21,70],[50,70],[51,70]], PALETTE.ocean, 'Brandon');

const insertPixel = db.prepare(`
  INSERT OR REPLACE INTO pixels (x, y, color, user_name, placed_at)
  VALUES (?, ?, ?, ?, ?)
`);
const insertMany = db.transaction(() => {
  pixels.forEach((p, i) => insertPixel.run(p.x, p.y, p.color, p.userName, now - (pixels.length - i) * 30_000));
});
insertMany();

// ─── Progress: 99.9% — one visit away from 100% ───────────────────────────────
db.prepare("UPDATE global_stats SET value = ? WHERE key = 'progress'").run(99.9);

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log('✅  Endgame demo seeded.');
console.log(`   Progress : 99.9%  (one login away from 100%)`);
console.log(`   Pixels   : ${pixels.length} placed`);
console.log(`   Canvas   : 80×80 (will jump to 96×96 on completion)`);
console.log(`   Members  : ${members.length} — all ready to visit (cooldown cleared)`);
console.log('');
console.log('   ➜  Start the server, open the app, and log in as any member.');
console.log('   ➜  Their visit will push progress to 100% and trigger the endgame.');
