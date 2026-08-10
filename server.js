const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'weekends.db');
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS weekends (
    year INTEGER PRIMARY KEY,
    lake TEXT NOT NULL,
    location TEXT NOT NULL,
    dates TEXT NOT NULL DEFAULT '',
    album_url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
  );
`);

const count = db.prepare('SELECT COUNT(*) AS c FROM weekends').get().c;
if (count === 0) {
  const ins = db.prepare(
    'INSERT INTO weekends (year, lake, location) VALUES (?, ?, ?)'
  );
  ins.run(2022, 'Magician Lake', 'Dowagiac, MI');
  ins.run(2023, 'Shavehead Lake', 'Vandalia, MI');
  ins.run(2024, 'Shavehead Lake', 'Vandalia, MI');
  ins.run(2025, 'Shavehead Lake', 'Vandalia, MI');
  ins.run(2026, 'Fish Lake', 'White Pigeon, MI');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireSecret(req, res, next) {
  if (!ADMIN_SECRET) return next();
  const provided = req.body?.secret || req.query.secret;
  if (provided !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Invalid or missing secret' });
  }
  next();
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

app.get('/api/weekends', (req, res) => {
  const rows = db
    .prepare('SELECT year, lake, location, dates, album_url, cover_url, notes FROM weekends ORDER BY year ASC')
    .all();
  res.json(rows);
});

app.post('/api/weekends', requireSecret, (req, res) => {
  const { year, lake, location, dates = '', album_url = '', cover_url = '', notes = '' } = req.body || {};

  const y = parseInt(year, 10);
  if (!Number.isInteger(y) || y < 1990 || y > 2100) {
    return res.status(400).json({ error: 'Year must be between 1990 and 2100' });
  }
  if (!lake || !String(lake).trim()) {
    return res.status(400).json({ error: 'Lake name is required' });
  }
  if (!location || !String(location).trim()) {
    return res.status(400).json({ error: 'Location is required' });
  }
  if (!isValidUrl(album_url) || !isValidUrl(cover_url)) {
    return res.status(400).json({ error: 'Album and cover must be valid http(s) URLs' });
  }

  db.prepare(`
    INSERT INTO weekends (year, lake, location, dates, album_url, cover_url, notes)
    VALUES (@year, @lake, @location, @dates, @album_url, @cover_url, @notes)
    ON CONFLICT(year) DO UPDATE SET
      lake = excluded.lake,
      location = excluded.location,
      dates = excluded.dates,
      album_url = excluded.album_url,
      cover_url = excluded.cover_url,
      notes = excluded.notes
  `).run({
    year: y,
    lake: String(lake).trim(),
    location: String(location).trim(),
    dates: String(dates).trim(),
    album_url: String(album_url).trim(),
    cover_url: String(cover_url).trim(),
    notes: String(notes).trim(),
  });

  res.json({ ok: true });
});

app.delete('/api/weekends/:year', requireSecret, (req, res) => {
  const y = parseInt(req.params.year, 10);
  const result = db.prepare('DELETE FROM weekends WHERE year = ?').run(y);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'No weekend for that year' });
  }
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Shangri-La listening on http://localhost:${PORT}`);
});
