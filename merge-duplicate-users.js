/**
 * One-time script to merge duplicate users caused by case-insensitive login
 * creating separate DB rows for e.g. "Erik" vs "erik".
 *
 * Always merges into the lowercase canonical name. If only the capitalised
 * row exists it is renamed; if both exist their stats are summed.
 */

const Database = require('better-sqlite3');
const DB_PATH  = process.env.DB_PATH || require('path').join(__dirname, 'shangri-la.db');
const db       = new Database(DB_PATH);

const NAMES = ['erik', 'mark'];

const merge = db.transaction((canonical) => {
  const capitalised = canonical.charAt(0).toUpperCase() + canonical.slice(1);

  const lower = db.prepare('SELECT * FROM users WHERE name = ?').get(canonical);
  const upper = db.prepare('SELECT * FROM users WHERE name = ?').get(capitalised);

  if (!upper) { console.log(`SKIP: "${capitalised}" not found, nothing to merge.\n`); return; }

  if (!lower) {
    // Only the capitalised row exists — just rename it
    console.log(`Renaming "${capitalised}" -> "${canonical}"`);
    db.prepare('UPDATE users             SET name = ? WHERE name = ?').run(canonical, capitalised);
    db.prepare('UPDATE pixels            SET user_name = ? WHERE user_name = ?').run(canonical, capitalised);
    db.prepare('UPDATE user_achievements SET user_name = ? WHERE user_name = ?').run(canonical, capitalised);
    console.log(`  Done.\n`);
    return;
  }

  // Both rows exist — sum stats into the lowercase row then drop the capitalised one
  console.log(`Merging "${capitalised}" into "${canonical}"`);
  console.log(`  Before: ${canonical}    visits=${lower.total_visits}  pixels=${lower.pixels_placed}`);
  console.log(`  Before: ${capitalised}  visits=${upper.total_visits}  pixels=${upper.pixels_placed}`);

  db.prepare(`
    UPDATE users SET
      total_visits     = total_visits     + ?,
      pixels_placed    = pixels_placed    + ?,
      pixels_remaining = pixels_remaining + ?,
      last_visit       = MAX(last_visit, ?)
    WHERE name = ?
  `).run(upper.total_visits, upper.pixels_placed, upper.pixels_remaining, upper.last_visit, canonical);

  const pixelsMoved = db.prepare(
    'UPDATE pixels SET user_name = ? WHERE user_name = ?'
  ).run(canonical, capitalised).changes;
  console.log(`  Pixels re-attributed: ${pixelsMoved}`);

  const achievementsMoved = db.prepare(`
    INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
    SELECT ?, achievement_key, earned_at FROM user_achievements WHERE user_name = ?
  `).run(canonical, capitalised).changes;
  console.log(`  Achievements merged: ${achievementsMoved}`);
  db.prepare('DELETE FROM user_achievements WHERE user_name = ?').run(capitalised);

  db.prepare('DELETE FROM users WHERE name = ?').run(capitalised);

  const merged = db.prepare('SELECT * FROM users WHERE name = ?').get(canonical);
  console.log(`  After: ${canonical}  visits=${merged.total_visits}  pixels=${merged.pixels_placed}`);
  console.log(`  Done.\n`);
});

for (const name of NAMES) {
  merge(name);
}

console.log('All merges complete.');
