/* ─────────────────────────────────────────────────────────────────────────────
   Building Shangri-La — Frontend
   ───────────────────────────────────────────────────────────────────────────── */

// ─── Palette ──────────────────────────────────────────────────────────────────
const PALETTE_NAMES = {
  // Row 1: Ocean
  '#0d3b52': 'Deep Ocean',
  '#1a6691': 'Ocean Blue',
  '#5dade2': 'Sky Blue',
  '#aed6f1': 'Pale Blue',
  '#e8f4f8': 'Sea Foam',
  // Row 2: Sand / Earth
  '#5d4037': 'Dark Brown',
  '#8b6914': 'Mud',
  '#c19a6b': 'Camel',
  '#deb887': 'Burlywood',
  '#fff8dc': 'Cornsilk',
  // Row 3: Vegetation
  '#004d40': 'Deep Jungle',
  '#33691e': 'Swamp',
  '#1b5e20': 'Dark Forest',
  '#2e7d32': 'Forest Green',
  '#43a047': 'Grass',
  '#81c784': 'Light Green',
  '#c8e6c9': 'Mint',
  // Row 4: Rock / Stone
  '#37474f': 'Slate',
  '#607d8b': 'Blue Grey',
  '#90a4ae': 'Stone',
  '#cfd8dc': 'Pale Stone',
  '#eceff1': 'Snow',
  '#fafafa': 'White',
  // Row 5: Accent
  '#b71c1c': 'Crimson',
  '#e65100': 'Burnt Orange',
  '#ff6f00': 'Lava',
  '#f9a825': 'Amber',
  '#f4e09a': 'Desert Sand',
  '#7b1fa2': 'Purple',
  '#e91e63': 'Pink',
};
const PALETTE = Object.keys(PALETTE_NAMES);


const CELL_SIZE     = 10;
const OCEAN_COLOR   = '#0d3b52';
const GRID_COLOR    = 'rgba(255,255,255,0.06)';
const POLL_INTERVAL = 30_000; // ms between background state refreshes

// ─── App State ────────────────────────────────────────────────────────────────
const state = {
  userName:        null,
  user:            null,          // { name, total_visits, pixels_remaining, pixels_placed, last_visit }
  pixels:          new Map(),     // key: "x,y" → { x, y, color, user_name }
  progress:        0,
  canvasSize:      32,
  showGrid:        true,
  selectedColor:   PALETTE[8],   // default: burlywood sand
  hoverCell:       null,         // { x, y } | null
  nextVisitTime:   null,
  chosenEmoji:     null,
  undoAvailable:   false,
  pendingUndo:     null,  // { x, y, prevColor, prevUser } for optimistic rollback
  achievements:    { individual: { definitions: [], earned: [] }, group: { definitions: [], earned: [] } },
  leaderboard:     [],
  members:         [],
  pollTimer:       null,
  countdownTimer:  null,
  achievementQueue:    [],
  popupBusy:           false,
  popupTimer:          null,
  currentAchievement:  null,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas          = document.getElementById('island-canvas');
const ctx             = canvas.getContext('2d');
const canvasWrapper   = document.getElementById('canvas-wrapper');

// ─── Canvas Rendering ─────────────────────────────────────────────────────────

function resizeCanvas(size) {
  const px = size * CELL_SIZE;
  canvas.width  = px;
  canvas.height = px;
}

function drawCanvas() {
  const size = state.canvasSize;
  ctx.fillStyle = OCEAN_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Placed pixels
  for (const [, pix] of state.pixels) {
    ctx.fillStyle = pix.color;
    ctx.fillRect(pix.x * CELL_SIZE, pix.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  // Grid lines
  if (state.showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(canvas.width, i * CELL_SIZE);
      ctx.stroke();
    }
  }

  // Hover highlight
  if (state.hoverCell) {
    const { x, y } = state.hoverCell;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(
      x * CELL_SIZE + 0.75,
      y * CELL_SIZE + 0.75,
      CELL_SIZE - 1.5,
      CELL_SIZE - 1.5
    );
    // Ghost pixel with selected color
    if (canPlacePixel()) {
      ctx.fillStyle = state.selectedColor + 'aa'; // 67% opacity
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
}

// ─── Canvas Events ────────────────────────────────────────────────────────────

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left)  * scaleX;
  const cy = (e.clientY - rect.top)   * scaleY;
  return {
    x: Math.floor(cx / CELL_SIZE),
    y: Math.floor(cy / CELL_SIZE),
  };
}

canvas.addEventListener('mousemove', (e) => {
  const cell = cellFromEvent(e);
  if (cell.x >= 0 && cell.x < state.canvasSize &&
      cell.y >= 0 && cell.y < state.canvasSize) {
    state.hoverCell = cell;
    document.getElementById('hover-coords').textContent = `(${cell.x}, ${cell.y})`;
  } else {
    state.hoverCell = null;
    document.getElementById('hover-coords').textContent = '';
  }
  drawCanvas();
});

canvas.addEventListener('mouseleave', () => {
  state.hoverCell = null;
  document.getElementById('hover-coords').textContent = '';
  drawCanvas();
});

canvas.addEventListener('click', async (e) => {
  if (!state.userName) {
    showToast('Enter your name first!');
    return;
  }
  if (!canPlacePixel()) {
    showToast(
      state.user?.pixels_remaining === 0
        ? 'No pixels left — come back in 4 hours 20 minutes!'
        : 'Log in to place pixels.'
    );
    return;
  }

  const cell = cellFromEvent(e);
  if (cell.x < 0 || cell.x >= state.canvasSize ||
      cell.y < 0 || cell.y >= state.canvasSize) return;

  await placePixel(cell.x, cell.y, state.selectedColor);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function canPlacePixel() {
  return state.user && state.user.pixels_remaining > 0;
}

const AVATAR_EMOJIS = ['🐬','🦜','🦩','🐠','🦋','🌺','🍍','🐙','🦀','🌴','🐚','🦈','🐊','🥏','🍉','🌊','🐿️','🦭','🦁','🌵'];

function avatarEmoji(name) {
  let hash = 0;
  for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_EMOJIS[Math.abs(hash) % AVATAR_EMOJIS.length];
}

function getAvatarEmoji(name) {
  if (name === state.userName && state.chosenEmoji) return state.chosenEmoji;
  return avatarEmoji(name);
}

/** Deterministic avatar color from name */
function avatarColor(name) {
  const colors = ['#1a6691','#2e7d32','#6a1b9a','#c62828','#e65100','#00838f'];
  let hash = 0;
  for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

// ─── Achievement Popup ────────────────────────────────────────────────────────

function enqueueAchievements(list) {
  state.achievementQueue.push(...list);
  if (!state.popupBusy) showNextAchievement();
}

function showNextAchievement() {
  if (state.achievementQueue.length === 0) {
    state.popupBusy = false;
    return;
  }
  state.popupBusy = true;
  state.currentAchievement = state.achievementQueue.shift();
  const ach = state.currentAchievement;
  const popup = document.getElementById('achievement-popup');

  document.getElementById('popup-icon').textContent = ach.icon;
  document.getElementById('popup-type').textContent =
    ach.type === 'group' ? '🌍 Group Achievement Unlocked!' : '✨ Achievement Unlocked!';
  document.getElementById('popup-name').textContent = ach.name;
  document.getElementById('popup-desc').textContent = ach.description;

  popup.classList.add('visible');
  popup.setAttribute('aria-hidden', 'false');

  state.popupTimer = setTimeout(() => dismissAchievementPopup(), 5000);
}

function dismissAchievementPopup() {
  clearTimeout(state.popupTimer);
  state.popupTimer = null;
  const popup = document.getElementById('achievement-popup');
  popup.classList.remove('visible');
  popup.setAttribute('aria-hidden', 'true');
  setTimeout(showNextAchievement, 400);
}

async function shareAchievement() {
  const ach = state.currentAchievement;
  if (!ach) return;
  const text = `I just unlocked "${ach.name}" ${ach.icon}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Building Shangri-La', text });
    } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  }
}

// ─── Trivia ───────────────────────────────────────────────────────────────────

function b64decode(str) {
  return decodeURIComponent(atob(str).split('').map(c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
}

function showTriviaState(id) {
  for (const s of ['offer', 'loading', 'question', 'result']) {
    document.getElementById(`trivia-${s}-state`).hidden = s !== id;
  }
}

function showTriviaOffer() {
  document.getElementById('trivia-overlay').hidden = false;
  showTriviaState('offer');
}

function closeTriviaModal() {
  document.getElementById('trivia-overlay').hidden = true;
}

async function loadTriviaQuestion() {
  showTriviaState('loading');
  try {
    const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple&encode=base64');
    const data = await res.json();
    if (data.response_code !== 0 || !data.results?.length) throw new Error();
    const q = data.results[0];
    const correct  = b64decode(q.correct_answer);
    const answers  = [correct, ...q.incorrect_answers.map(b64decode)]
      .sort(() => Math.random() - 0.5);

    document.getElementById('trivia-meta').textContent =
      `${b64decode(q.category)} · ${b64decode(q.difficulty)}`;
    document.getElementById('trivia-q').textContent = b64decode(q.question);

    const container = document.getElementById('trivia-answers');
    container.innerHTML = '';
    for (const answer of answers) {
      const btn = document.createElement('button');
      btn.className = 'trivia-answer-btn';
      btn.textContent = answer;
      btn.addEventListener('click', () => handleTriviaAnswer(answer, correct, container));
      container.appendChild(btn);
    }
    showTriviaState('question');
  } catch {
    closeTriviaModal();
    showToast('Could not load question — maybe next time!');
  }
}

async function handleTriviaAnswer(chosen, correct, container) {
  container.querySelectorAll('.trivia-answer-btn').forEach(b => {
    b.disabled = true;
    if (b.textContent === correct) b.classList.add('correct');
    else if (b.textContent === chosen) b.classList.add('wrong');
  });

  if (chosen === correct) {
    try {
      const data = await apiTriviaReward();
      state.user.pixels_remaining = data.pixels_remaining;
      state.nextVisitTime = null;
      await new Promise(r => setTimeout(r, 700));
      closeTriviaModal();
      renderPixelDots();
      renderVisitStatus(false);
      state.members = await apiFetchMembers();
      renderMembers();
    } catch (err) {
      closeTriviaModal();
      showToast(err.message);
    }
  } else {
    await new Promise(r => setTimeout(r, 1200));
    document.getElementById('trivia-result-icon').textContent = '😔';
    document.getElementById('trivia-result-msg').textContent =
      'Sorry, maybe next time!';
    showTriviaState('result');
  }
}

async function apiTriviaReward() {
  const res = await fetch('/api/trivia-reward', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: state.userName }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to claim reward');
  return res.json();
}

// ─── Avatar Picker ────────────────────────────────────────────────────────────

function buildAvatarPicker() {
  const picker = document.getElementById('avatar-picker');
  picker.innerHTML = '';
  const current = getAvatarEmoji(state.userName);
  for (const emoji of AVATAR_EMOJIS) {
    const btn = document.createElement('button');
    btn.className = 'avatar-option' + (emoji === current ? ' selected' : '');
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.chosenEmoji = emoji;
      localStorage.setItem(`shangri-la-emoji:${state.userName}`, emoji);
      document.getElementById('user-avatar').textContent = emoji;
      // Refresh picker selection state
      picker.querySelectorAll('.avatar-option').forEach(b =>
        b.classList.toggle('selected', b.textContent === emoji)
      );
      // Refresh members board (updates the current user's row)
      renderMembers();
      closAvatarPicker();
    });
    picker.appendChild(btn);
  }
}

function openAvatarPicker() {
  document.getElementById('avatar-picker').hidden = false;
}

function closAvatarPicker() {
  document.getElementById('avatar-picker').hidden = true;
}

// ─── UI Renderers ─────────────────────────────────────────────────────────────

function renderPixelDots() {
  const container = document.getElementById('pixels-dots');
  container.innerHTML = '';
  const total = 12;
  const remaining = state.user?.pixels_remaining ?? 0;
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'pixel-dot' + (i >= remaining ? ' spent' : '');
    container.appendChild(dot);
  }
}

function renderVisitStatus(newVisit) {
  const statusEl   = document.getElementById('visit-status');
  const cooldownEl = document.getElementById('cooldown-box');
  const pixelsEl   = document.getElementById('pixels-box');

  if (!state.user) return;

  if (state.user.pixels_remaining > 0) {
    statusEl.className = 'visit-status ' + (newVisit ? 'new-visit' : 'active');
    statusEl.textContent = newVisit
      ? `Welcome! You have ${state.user.pixels_remaining} pixels to place.`
      : `You have ${state.user.pixels_remaining} pixel${state.user.pixels_remaining !== 1 ? 's' : ''} left this visit.`;
    cooldownEl.style.display = 'none';
    pixelsEl.style.display   = 'block';
    renderPixelDots();
    document.getElementById('undo-btn').style.display = state.undoAvailable ? 'inline-block' : 'none';
  } else {
    statusEl.className   = 'visit-status waiting';
    statusEl.textContent = 'You‘ve used all your pixels. See you in 4:20! 🤙';
    cooldownEl.style.display = 'block';
    pixelsEl.style.display   = 'none';
    startCountdown();
  }
}

function startCountdown() {
  clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(() => {
    if (!state.nextVisitTime) return;
    const remaining = state.nextVisitTime - Date.now();
    if (remaining <= 0) {
      clearInterval(state.countdownTimer);
      document.getElementById('cooldown-timer').textContent = '00:00:00';
      // Prompt refresh
      document.getElementById('visit-status').textContent = 'I’ve got 69 problems, but it’s 420 somewhere: refresh to visit!';
      return;
    }
    document.getElementById('cooldown-timer').textContent = formatCountdown(remaining);
  }, 1000);
  // Render immediately
  const remaining = (state.nextVisitTime || Date.now()) - Date.now();
  document.getElementById('cooldown-timer').textContent = formatCountdown(Math.max(0, remaining));
}

function renderProgress() {
  const pct = Math.min(100, state.progress);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent  = pct.toFixed(1) + '%';

  const stages = [
    { min: 0,   label: 'Stage 1 — Raft-sized (32×32)' },
    { min: 25,  label: 'Stage 2 — Getting Paw Paw vibes... (48×48)' },
    { min: 50,  label: 'Stage 3 — Frog Hollow says what? (64×64)' },
    { min: 75,  label: 'Stage 4 — Jello Shots on Shavehead Lake (80×80)' },
    { min: 100, label: 'Stage 5 — Shangri-La (96×96)' },
  ];
  const stage = [...stages].reverse().find(s => pct >= s.min) || stages[0];
  document.getElementById('canvas-stage-label').textContent = stage.label;
}

function renderInfoBar() {
  const pct = Math.min(100, state.progress);
  document.getElementById('info-bar-fill').style.width = pct + '%';
  const { totalPixels, uniqueVisitors } = state.stats || {};
  document.getElementById('info-bar-stats').textContent =
    `${pct.toFixed(1)}% · ${totalPixels ?? 0} px placed · ${uniqueVisitors ?? 0}/8 builders`;
}

function renderStats() {
  const { totalPixels, uniqueVisitors, totalVisits } = state.stats || {};

  const earnedGroupKeys = new Set(state.achievements.group.earned.map(e => e.achievement_key));
  const groupAchievementsHtml = state.achievements.group.definitions
    .filter(d => earnedGroupKeys.has(d.key))
    .map(d => `
    <div class="stat-group-achievement earned">
      <span class="stat-group-icon">${d.icon}</span>
      <span class="stat-group-name">${d.name}</span>
    </div>`).join('');

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-tile">
      <div class="stat-value">${totalPixels ?? 0}</div>
      <div class="stat-label">Pixels placed</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${uniqueVisitors ?? 0} / 8</div>
      <div class="stat-label">Hunks visited</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${totalVisits ?? 0}</div>
      <div class="stat-label">Total visits</div>
    </div>
    <div class="stat-tile">
      <div class="stat-value">${state.canvasSize}×${state.canvasSize}</div>
      <div class="stat-label">Map size</div>
    </div>
    ${groupAchievementsHtml}
  `;
}

function renderUserAchievement() {
  const earned = state.achievements.individual.earned;
  const latest = earned.slice().sort((a, b) => b.earned_at - a.earned_at)[0];
  const def = latest
    ? state.achievements.individual.definitions.find(d => d.key === latest.achievement_key)
    : null;
  document.getElementById('user-achievement').textContent = def
    ? `${def.icon} ${def.name}`
    : '';
}

function renderAchievements() {
  const { individual, group } = state.achievements;

  const earnedIndividualKeys = new Set(individual.earned.map(e => e.achievement_key));
  const earnedGroupKeys      = new Set(group.earned.map(e => e.achievement_key));

  const toHtml = (d, earned) => `
    <div class="achievement-item ${earned ? '' : 'locked'}">
      <div class="ach-icon">${d.icon}</div>
      <div class="ach-text">
        <div class="ach-name">${d.name}</div>
        <div class="ach-desc">${d.description}</div>
      </div>
    </div>
  `;

  const sorted = arr => [...arr].sort((a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0));

  const indItems = individual.definitions.map(d => ({ ...d, earned: earnedIndividualKeys.has(d.key) }));
  const grpItems = group.definitions.map(d =>       ({ ...d, earned: earnedGroupKeys.has(d.key) }));

  document.getElementById('achievements-list-individual').innerHTML = sorted(indItems).map(a => toHtml(a, a.earned)).join('');
  document.getElementById('achievements-list-group').innerHTML      = sorted(grpItems).map(a => toHtml(a, a.earned)).join('');
}

function renderMembers() {
  const sorted = [...state.members].sort((a, b) => {
    if (a.joined && !b.joined) return -1;
    if (!a.joined && b.joined) return 1;
    return b.pixels_placed - a.pixels_placed;
  });

  document.getElementById('members-board').innerHTML = sorted.map(m => {
    const earnedBadges = m.joined
      ? state.achievements.individual.definitions
          .filter(d => m.achievements.includes(d.key))
          .map(d => `<span class="member-badge">${d.icon} ${d.name}</span>`)
          .join('')
      : '';
    return `
      <div class="member-row ${m.joined ? '' : 'not-joined'} ${m.name === state.userName ? 'is-me' : ''}">
        <div class="member-avatar" style="${m.joined ? `background:${avatarColor(m.name)}` : ''}">
          ${m.joined ? getAvatarEmoji(m.name) : '?'}
        </div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.name)}</div>
          ${m.joined && earnedBadges ? `<div class="member-badges">${earnedBadges}</div>` : ''}
          ${!m.joined ? `<div class="member-level">Yet to arrive…</div>` : ''}
        </div>
        ${m.joined ? `<div class="member-stats"><span class="member-px">${m.pixels_placed}px</span><span class="member-v">${m.total_visits}v</span></div>` : ''}
      </div>
    `;
  }).join('') || '<div style="color:var(--text-muted);font-size:0.82rem">No crew yet.</div>';
}

function renderPalette() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = PALETTE.map(color => `
    <div
      class="swatch ${color === state.selectedColor ? 'active' : ''}"
      style="background:${color}"
      data-color="${color}"
      title="${PALETTE_NAMES[color]}"
    ></div>
  `).join('');

  grid.querySelectorAll('.swatch').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedColor = el.dataset.color;
      renderPalette();
      document.getElementById('selected-swatch').style.background = state.selectedColor;
    });
  });

  document.getElementById('selected-swatch').style.background = state.selectedColor;
}

function renderCanvasSizeLabel() {
  document.getElementById('canvas-size-label').textContent =
    `${state.canvasSize}×${state.canvasSize} grid`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function apiLogin(name) {
  const res = await fetch('/api/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Login failed');
  return res.json();
}

async function apiFetchState() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Failed to fetch state');
  return res.json();
}

async function apiFetchAchievements(name) {
  const res = await fetch(`/api/achievements?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Failed to fetch achievements');
  return res.json();
}

async function apiFetchLeaderboard() {
  const res = await fetch('/api/leaderboard');
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

async function apiFetchMembers() {
  const res = await fetch('/api/members');
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
}

async function apiPlacePixel(x, y, color) {
  const res = await fetch('/api/place', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: state.userName, x, y, color }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to place pixel');
  }
  return res.json();
}

async function apiUndoPixel() {
  const res = await fetch('/api/undo', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: state.userName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to undo');
  }
  return res.json();
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function placePixel(x, y, color) {
  // Save undo state before optimistic update
  const prevPixel = state.pixels.get(`${x},${y}`) ?? null;
  state.pendingUndo = { x, y, prevColor: prevPixel?.color ?? null, prevUser: prevPixel?.user_name ?? null };

  // Optimistic update
  state.pixels.set(`${x},${y}`, { x, y, color, user_name: state.userName });
  state.user.pixels_remaining--;
  state.undoAvailable = state.user.pixels_remaining > 0;
  drawCanvas();
  renderPixelDots();
  renderVisitStatus(false);

  try {
    const data = await apiPlacePixel(x, y, color);
    state.user.pixels_remaining = data.pixels_remaining;
    state.undoAvailable = data.undoAvailable ?? false;
    if (data.nextVisitTime) state.nextVisitTime = data.nextVisitTime;

    if (data.newAchievements?.length) {
      enqueueAchievements(data.newAchievements);
      // Refresh achievements panel
      const achData = await apiFetchAchievements(state.userName);
      state.achievements = achData;
      renderAchievements();
    }

    renderPixelDots();
    renderVisitStatus(false);

    if (data.offerTrivia) showTriviaOffer();

    // Refresh members board
    state.members = await apiFetchMembers();
    renderMembers();
  } catch (err) {
    // Roll back
    state.pixels.delete(`${x},${y}`);
    state.user.pixels_remaining++;
    state.undoAvailable = false;
    state.pendingUndo = null;
    drawCanvas();
    renderPixelDots();
    renderVisitStatus(false);
    showToast(err.message);
  }
}

async function performUndo() {
  if (!state.undoAvailable || !state.pendingUndo) return;

  const { x, y, prevColor, prevUser } = state.pendingUndo;

  // Optimistic update
  state.undoAvailable = false;
  state.pendingUndo = null;
  if (prevColor) {
    state.pixels.set(`${x},${y}`, { x, y, color: prevColor, user_name: prevUser });
  } else {
    state.pixels.delete(`${x},${y}`);
  }
  state.user.pixels_remaining++;
  drawCanvas();
  renderPixelDots();
  renderVisitStatus(false);

  try {
    const data = await apiUndoPixel();
    state.user.pixels_remaining = data.pixels_remaining;
    // Sync canvas with server truth
    if (data.restoredPixel) {
      state.pixels.set(`${data.restoredPixel.x},${data.restoredPixel.y}`, data.restoredPixel);
    } else if (data.undonePixel) {
      state.pixels.delete(`${data.undonePixel.x},${data.undonePixel.y}`);
    }
    drawCanvas();
    renderPixelDots();
    renderVisitStatus(false);
    state.members = await apiFetchMembers();
    renderMembers();
  } catch (err) {
    showToast(err.message);
  }
}

async function loadState() {
  const [stateData, members] = await Promise.all([
    apiFetchState(),
    apiFetchMembers(),
  ]);

  const prevSize     = state.canvasSize;
  state.pixels       = new Map(stateData.pixels.map(p => [`${p.x},${p.y}`, p]));
  state.progress     = stateData.progress;
  state.canvasSize   = stateData.canvasSize;
  state.stats        = stateData.stats;
  state.members      = members;

  // Canvas expand animation
  if (state.canvasSize !== prevSize) {
    resizeCanvas(state.canvasSize);
    canvasWrapper.classList.add('expanding');
    setTimeout(() => canvasWrapper.classList.remove('expanding'), 900);
  }

  if (state.userName) {
    state.achievements = await apiFetchAchievements(state.userName);
    renderAchievements();
    renderUserAchievement();
  }

  drawCanvas();
  renderProgress();
  renderStats();
  renderInfoBar();
  renderMembers();
  renderCanvasSizeLabel();
}

async function login(name) {
  const data = await apiLogin(name);

  state.userName      = name;
  state.user          = data.user;
  state.nextVisitTime = data.nextVisitTime;
  state.undoAvailable = data.undoAvailable ?? false;

  // Save to localStorage for next time
  localStorage.setItem('shangri-la-name', name);

  // Load persisted emoji choice for this user
  state.chosenEmoji = localStorage.getItem(`shangri-la-emoji:${name}`) || null;

  // Show user sections
  document.getElementById('section-login').style.display   = 'none';
  document.getElementById('section-user').style.display    = '';
  document.getElementById('section-palette').style.display = '';

  // Populate user panel
  const avatarEl = document.getElementById('user-avatar');
  avatarEl.textContent      = getAvatarEmoji(name);
  avatarEl.style.background = avatarColor(name);
  buildAvatarPicker();

  document.getElementById('user-name-display').textContent = name;
  document.getElementById('user-meta').textContent =
    `${data.user.total_visits} visit${data.user.total_visits !== 1 ? 's' : ''} · ${data.user.pixels_placed} pixels`;

  renderVisitStatus(data.newVisit);
  renderPalette();

  // Load achievements for this user
  state.achievements = await apiFetchAchievements(name);
  renderAchievements();
  renderUserAchievement();
  renderStats();
  renderMembers();

  // Show any newly earned achievements
  if (data.newAchievements?.length) {
    enqueueAchievements(data.newAchievements);
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      await loadState();
    } catch (e) {
      // silent — network hiccup
    }
  }, POLL_INTERVAL);
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

document.getElementById('undo-btn').addEventListener('click', () => performUndo());
document.getElementById('popup-dismiss-btn').addEventListener('click', () => dismissAchievementPopup());
document.getElementById('popup-share-btn').addEventListener('click', () => shareAchievement());
document.getElementById('cooldown-share-btn').addEventListener('click', async () => {
  const text = 'Check out my progress on the island';
  const url  = location.href;
  if (navigator.share) {
    try { await navigator.share({ title: 'Building Shangri-La', text, url }); } catch {}
  } else {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast('Copied to clipboard!');
  }
});
document.getElementById('trivia-yes-btn').addEventListener('click', () => loadTriviaQuestion());
document.getElementById('trivia-no-btn').addEventListener('click', () => closeTriviaModal());
document.getElementById('trivia-close-btn').addEventListener('click', () => closeTriviaModal());

document.getElementById('user-avatar').addEventListener('click', (e) => {
  e.stopPropagation();
  const picker = document.getElementById('avatar-picker');
  picker.hidden ? openAvatarPicker() : closAvatarPicker();
});

document.addEventListener('click', () => closAvatarPicker());

document.getElementById('name-btn').addEventListener('click', async () => {
  const input = document.getElementById('name-input');
  const name  = input.value.trim();
  if (!name) {
    showError('Please enter your name.');
    return;
  }
  try {
    await login(name);
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('name-btn').click();
});


document.getElementById('grid-toggle').addEventListener('change', (e) => {
  state.showGrid = e.target.checked;
  drawCanvas();
});

function showError(msg) {
  const el = document.getElementById('login-error');
  el.textContent    = msg;
  el.style.display  = '';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  resizeCanvas(state.canvasSize);
  drawCanvas();
  renderCanvasSizeLabel();

  // Load global state (canvas + stats) immediately, no login required
  try {
    await loadState();
  } catch (e) {
    showToast('Could not reach the server. Is it running?');
  }

  startPolling();

  // Auto-login if name saved
  const savedName = localStorage.getItem('shangri-la-name');
  if (savedName) {
    document.getElementById('name-input').value = savedName;
    try {
      await login(savedName);
    } catch (e) {
      // Name might not exist yet or other error — let user re-enter
    }
  }
}

init();
