/**
 * One-time script to merge duplicate users caused by case-insensitive login
 * creating separate DB rows for e.g. "Erik" vs "erik".
 *
 * Finds all case-insensitive duplicates automatically, merges into the
 * lowercase canonical name. If only the capitalised row exists it is
 * renamed; if both exist their stats are summed.
 */

const Database = require('better-sqlite3');
const DB_PATH  = process.env.DB_PATH || require('path').join(__dirname, 'shangri-la.db');
const db       = new Database(DB_PATH);

// Find all names that have a case-insensitive duplicate
const allNames = db.prepare('SELECT name FROM users').all().map(r => r.name);
const seen = new Map(); // lowercase -> [original names]
for (const name of allNames) {
  const key = name.toLowerCase();
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(name);
}

const duplicateGroups = [...seen.values()].filter(group => group.length > 1);

if (duplicateGroups.length === 0) {
  console.log('No duplicate users found.');
  process.exit(0);
}

console.log(`Found ${duplicateGroups.length} duplicate group(s):\n`);

const mergeGroup = db.transaction((names) => {
  const canonical = names[0].toLowerCase();
  const others    = names.filter(n => n !== canonical);

  console.log(`Merging into "${canonical}": ${names.join(', ')}`);

  // Ensure the canonical (lowercase) row exists
  const canonicalRow = db.prepare('SELECT * FROM users WHERE name = ?').get(canonical);
  if (!canonicalRow) {
    // Rename the first non-canonical row to canonical
    const source = others.shift();
    console.log(`  Renaming "${source}" -> "${canonical}"`);
    db.prepare('UPDATE users             SET name = ? WHERE name = ?').run(canonical, source);
    db.prepare('UPDATE pixels            SET user_name = ? WHERE user_name = ?').run(canonical, source);
    db.prepare('UPDATE user_achievements SET user_name = ? WHERE user_name = ?').run(canonical, source);
  }

  // Merge any remaining duplicates into the canonical row
  for (const dup of others) {
    const dupRow = db.prepare('SELECT * FROM users WHERE name = ?').get(dup);
    if (!dupRow) continue;

    console.log(`  Absorbing "${dup}" (visits=${dupRow.total_visits}, pixels=${dupRow.pixels_placed})`);

    db.prepare(`
      UPDATE users SET
        total_visits     = total_visits     + ?,
        pixels_placed    = pixels_placed    + ?,
        pixels_remaining = pixels_remaining + ?,
        last_visit       = MAX(last_visit, ?)
      WHERE name = ?
    `).run(dupRow.total_visits, dupRow.pixels_placed, dupRow.pixels_remaining, dupRow.last_visit, canonical);

    const pixelsMoved = db.prepare(
      'UPDATE pixels SET user_name = ? WHERE user_name = ?'
    ).run(canonical, dup).changes;
    console.log(`    Pixels re-attributed: ${pixelsMoved}`);

    db.prepare(`
      INSERT OR IGNORE INTO user_achievements (user_name, achievement_key, earned_at)
      SELECT ?, achievement_key, earned_at FROM user_achievements WHERE user_name = ?
    `).run(canonical, dup);
    db.prepare('DELETE FROM user_achievements WHERE user_name = ?').run(dup);

    db.prepare('DELETE FROM users WHERE name = ?').run(dup);
  }

  const merged = db.prepare('SELECT * FROM users WHERE name = ?').get(canonical);
  console.log(`  Result: visits=${merged.total_visits}, pixels=${merged.pixels_placed}\n`);
});

for (const group of duplicateGroups) {
  mergeGroup(group);
}

console.log('All merges complete.');
