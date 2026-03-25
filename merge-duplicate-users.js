/**
 * One-time script to merge duplicate users caused by case-insensitive login
 * creating separate DB rows for e.g. "Erik" vs "erik".
 *
 * For each pair, the lowercase name is kept as canonical (matches the login
 * normalisation fix). Stats are summed, pixels and achievements are
 * re-attributed, then the old row is deleted.
 */

const Database = require('better-sqlite3');
const DB_PATH  = process.env.DB_PATH || require('path').join(__dirname, 'shangri-la.db');
const db       = new Database(DB_PATH);

const PAIRS = [
  { keep: 'erik', drop: 'Erik' },
  { keep: 'mark', drop: 'Mark' },
];

const merge = db.transaction(({ keep, drop }) => {
  const keeper  = db.prepare('SELECT * FROM users WHERE name = ?').get(keep);
  const dropper = db.prepare('SELECT * FROM users WHERE name = ?').get(drop);

  if (!keeper)  { console.log(`SKIP: "${keep}" not found`);  return; }
  if (!dropper) { console.log(`SKIP: "${drop}" not found`);  return; }

  console.log(`Merging "${drop}" into "${keep}"`);
  console.log(`  Before: ${keep}  visits=${keeper.total_visits}  pixels=${keeper.pixels_placed}`);
  console.log(`  Before: ${drop}  visits=${dropper.total_visits}  pixels=${dropper.pixels_placed}`);

  // Merge numeric stats into the keeper row
  db.prepare(`
    UPDATE users SET
      total_visits     = total_visits     + ?,
      pixels_placed    = pixels_placed    + ?,
      pixels_remaining = pixels_remaining + ?,
      last_visit       = MAX(last_visit, ?)
    WHERE name = ?
  `).run(
    dropper.total_visits,
    dropper.pixels_placed,
    dropper.pixels_remaining,
    dropper.last_visit,
    keep,
  );

  // Re-attribute pixels placed by the dropped name
  const pixelsMoved = db.prepare(
    'UPDATE pixels SET user_name = ? WHERE user_name = ?'
  ).run(keep, drop).changes;
  console.log(`  Pixels re-attributed: ${pixelsMoved}`);

  // Merge achievements (ignore duplicates already earned by keeper)
  const achievementsMoved = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
    SELECT ?, achievement_key, earned_at FROM user_achievements WHERE user_name = ?
  `).run(keep, drop).changes;
  console.log(`  Achievements merged: ${achievementsMoved}`);
  db.prepare('DELETE FROM user_achievements WHERE user_name = ?').run(drop);

  // Delete the duplicate row
  db.prepare('DELETE FROM users WHERE name = ?').run(drop);

  const merged = db.prepare('SELECT * FROM users WHERE name = ?').get(keep);
  console.log(`  After:  ${keep}  visits=${merged.total_visits}  pixels=${merged.pixels_placed}`);
  console.log(`  Done.\n`);
});

for (const pair of PAIRS) {
  merge(pair);
}

console.log('All merges complete.');
