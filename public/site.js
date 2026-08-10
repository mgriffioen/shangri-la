const PALETTES = [
  { accent: '#5eead4', deep: '#0f3d3a', glow: 'rgba(94, 234, 212, 0.18)' },
  { accent: '#c4b5fd', deep: '#2e2a55', glow: 'rgba(196, 181, 253, 0.18)' },
  { accent: '#fcd34d', deep: '#4a3517', glow: 'rgba(252, 211, 77, 0.16)' },
  { accent: '#7dd3fc', deep: '#123c55', glow: 'rgba(125, 211, 252, 0.18)' },
  { accent: '#fda4af', deep: '#4c2030', glow: 'rgba(253, 164, 175, 0.16)' },
];

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

// Group consecutive same-lake years into "eras"
function groupEras(weekends) {
  const eras = [];
  for (const w of weekends) {
    const last = eras[eras.length - 1];
    if (last && last.lake === w.lake) {
      last.weekends.push(w);
    } else {
      eras.push({ lake: w.lake, location: w.location, weekends: [w] });
    }
  }
  return eras;
}

function eraYearsLabel(era) {
  const years = era.weekends.map((w) => w.year);
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
}

function coverHtml(w, palette) {
  if (w.cover_url) {
    return `
      <div class="card-cover">
        <img src="${esc(w.cover_url)}" alt="Shangri-La ${w.year} at ${esc(w.lake)}" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.parentNode.classList.add('cover-broken'); this.remove();">
        <div class="cover-fallback" style="--era-accent:${palette.accent}; --era-deep:${palette.deep}">
          <span class="cover-year">${w.year}</span>
        </div>
      </div>`;
  }
  return `
    <div class="card-cover cover-placeholder" style="--era-accent:${palette.accent}; --era-deep:${palette.deep}">
      <svg class="cover-waves" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,30 C25,20 50,40 75,32 C100,24 125,42 150,34 C175,26 190,36 200,32 L200,60 L0,60 Z" fill="currentColor" opacity="0.25"/>
        <path d="M0,42 C25,34 50,50 75,44 C100,38 125,52 150,46 C175,40 190,48 200,44 L200,60 L0,60 Z" fill="currentColor" opacity="0.4"/>
      </svg>
      <span class="cover-year">${w.year}</span>
    </div>`;
}

function albumButton(w) {
  if (w.album_url) {
    return `<a class="btn btn-album" href="${esc(w.album_url)}" target="_blank" rel="noopener">Open the album &#8599;</a>`;
  }
  return `<span class="btn btn-disabled">Album coming soon</span>`;
}

function cardHtml(w, palette) {
  return `
    <article class="card">
      ${coverHtml(w, palette)}
      <div class="card-body">
        <div class="card-head">
          <span class="card-year">${w.year}</span>
          ${w.dates ? `<span class="card-dates">${esc(w.dates)}</span>` : ''}
        </div>
        ${w.notes ? `<p class="card-notes">${esc(w.notes)}</p>` : ''}
        ${albumButton(w)}
      </div>
    </article>`;
}

function renderStats(weekends) {
  const el = document.getElementById('hero-stats');
  if (!weekends.length) {
    el.innerHTML = '';
    return;
  }
  const lakes = new Set(weekends.map((w) => w.lake)).size;
  const first = weekends[0].year;
  el.innerHTML = `
    <div class="stat"><span class="stat-num">${weekends.length}</span><span class="stat-label">summers</span></div>
    <div class="stat"><span class="stat-num">${lakes}</span><span class="stat-label">lakes</span></div>
    <div class="stat"><span class="stat-num">${first}</span><span class="stat-label">where it started</span></div>`;
}

function renderFeatured(weekends, paletteByYear) {
  const el = document.getElementById('featured');
  const now = new Date().getFullYear();
  const latest = weekends[weekends.length - 1];
  if (!latest || latest.year < now) {
    el.innerHTML = '';
    return;
  }
  const palette = paletteByYear.get(latest.year);
  el.innerHTML = `
    <div class="featured" style="--era-accent:${palette.accent}; --era-glow:${palette.glow}">
      <p class="featured-kicker">This summer</p>
      <h2 class="featured-lake">${esc(latest.lake)}</h2>
      <p class="featured-location">${esc(latest.location)}${latest.dates ? ` &middot; ${esc(latest.dates)}` : ''}</p>
      ${latest.notes ? `<p class="featured-notes">${esc(latest.notes)}</p>` : ''}
      ${albumButton(latest)}
    </div>`;
}

function renderTimeline(weekends) {
  const timeline = document.getElementById('timeline');
  if (!weekends.length) {
    timeline.innerHTML = `
      <div class="empty">
        <p>No summers on record yet.</p>
        <p><a href="/admin">Add the first one</a></p>
      </div>`;
    return { paletteByYear: new Map() };
  }

  const eras = groupEras(weekends);
  const paletteByYear = new Map();

  // Assign palettes in chronological era order so colors stay stable,
  // then display newest era (and newest year within each era) first.
  eras.forEach((era, i) => {
    era.palette = PALETTES[i % PALETTES.length];
    era.weekends.forEach((w) => paletteByYear.set(w.year, era.palette));
  });

  const html = eras
    .slice()
    .reverse()
    .map((era) => {
      const palette = era.palette;
      return `
        <section class="era" style="--era-accent:${palette.accent}; --era-glow:${palette.glow}">
          <header class="era-head">
            <span class="era-marker" aria-hidden="true"></span>
            <div>
              <p class="era-years">${eraYearsLabel(era)}</p>
              <h2 class="era-lake">${esc(era.lake)}</h2>
              <p class="era-location">${esc(era.location)}</p>
            </div>
          </header>
          <div class="era-cards">
            ${era.weekends.slice().reverse().map((w) => cardHtml(w, palette)).join('')}
          </div>
        </section>`;
    })
    .join('');

  timeline.innerHTML = `<h2 class="timeline-title">The story so far</h2><div class="timeline-line">${html}</div>`;
  return { paletteByYear };
}

async function load() {
  const res = await fetch('/api/weekends');
  const weekends = await res.json();
  renderStats(weekends);
  const { paletteByYear } = renderTimeline(weekends);
  renderFeatured(weekends, paletteByYear);
}

load();
