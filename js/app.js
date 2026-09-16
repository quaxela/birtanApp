'use strict';

/// The page: what is drawn where, and what a tap on it means.

const circlePen = new SketchPen({
  width: 1.9,
  style: new RoughStyle({ roughness: 1.7, overshoot: 16 }),
});
const modePen = new SketchPen({
  width: 1.5,
  passes: 1,
  style: new RoughStyle({ roughness: 1.9, overshoot: 26 }),
});
const cogPen = new SketchPen({
  width: 1.8,
  passes: 1,
  style: new RoughStyle({ roughness: 0.9 }),
});
const outlinePen = new SketchPen({ width: 2.3 });
const markPen = new SketchPen({
  width: 1.9,
  style: new RoughStyle({ roughness: 1.6, overshoot: 18 }),
});

const el = (id) => document.getElementById(id);

const ui = {
  app: el('app'),
  paper: el('paper'),
  sheet: el('sheet'),
  topbar: el('topbar'),
  cog: el('cog'),
  date: el('date'),
  backToday: el('back-today'),
  mode: el('mode'),
  modeAdd: el('mode-add'),
  modePop: el('mode-pop'),
  composer: el('composer'),
  composerPill: document.querySelector('.composer-pill'),
  composerInput: el('composer-input'),
  scrim: el('scrim'),
  panel: el('panel'),
  panelBody: document.querySelector('.panel-body'),
  panelLabel: el('panel-label'),
  panelTime: el('panel-time'),
  panelRepeats: el('panel-repeats'),
  panelDelete: el('panel-delete'),
  panelPop: el('panel-pop'),
  panelSave: el('panel-save'),
  calendar: el('calendar'),
  monthName: el('month-name'),
  weekdayRow: el('weekday-row'),
  monthGrid: el('month-grid'),
  settings: el('settings'),
  themeRow: el('theme-row'),
  appearanceRow: el('appearance-row'),
  push: el('push'),
  pushNote: el('push-note'),
  pushAction: el('push-action'),
};

const paperCtx = ui.paper.getContext('2d');
const sheetCtx = ui.sheet.getContext('2d');
const headFrame = new HeadFrameDrawing();

const state = {
  settings: SettingsStore.load(),
  systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  theme: null,
  popMode: true,
  editing: null,
  editRepeat: 'none',
  calendarMonth: null,
  dropAt: null,
  /// The sheet's own rectangle inside the page: inside the drawn sides, under
  /// the top bar, down to the line the head sits behind.
  rect: { left: 0, top: 0, width: 0, height: 0 },
  paperDirty: true,
  sheetDirty: true,
};

const book = new SheetBook({ onChange: () => bookChanged() });

/* ------------------------------------------------------------------ theme */

/// Settled before anything is built: a mark drawn at startup asks for its
/// colour as it is drawn, and there is no frame in which there is no theme.
state.theme = currentTheme();

function currentTheme() {
  return Settings.themeFor(state.settings, state.systemDark);
}

function applyTheme() {
  state.theme = currentTheme();
  const root = document.documentElement.style;
  root.setProperty('--paper', rgba(state.theme.paper));
  root.setProperty('--ink', rgba(state.theme.ink));
  root.setProperty('--faint', rgba(state.theme.faintInk));
  root.setProperty('--hint', rgba(state.theme.hint));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', rgba(state.theme.paper));

  state.paperDirty = true;
  state.sheetDirty = true;
  redrawDecorations();
  drawPagePapers();
  drawSwatches();
}

/* ----------------------------------------------------------------- layout */

/// Sizes a canvas to its box in device pixels and hands back a context ready
/// to be drawn in logical ones.
function prepare(canvas, ctx, w, h) {
  const dpr = window.devicePixelRatio || 1;
  const pixelW = Math.round(w * dpr);
  const pixelH = Math.round(h * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function relayout() {
  const w = ui.app.clientWidth;
  const h = ui.app.clientHeight;
  if (w === 0 || h === 0) return;

  const layout = new HeadFrameLayout(w, h);
  const side = HeadFrameLayout.inset + 4;
  const top = ui.topbar.offsetHeight;

  state.rect = {
    left: side,
    top,
    width: Math.max(w - side * 2, 1),
    height: Math.max(layout.floor - top, 1),
  };

  // Every open day is sized, not just the one on screen: a day laid out at the
  // old size would drop its pile through the floor when it is next opened.
  for (const sheet of book._days.values()) {
    sheet.setBounds(state.rect.width, state.rect.height);
  }

  state.paperDirty = true;
  state.sheetDirty = true;
  drawPagePapers();
  redrawDecorations();
}

/* ---------------------------------------------------------------- drawing */

function drawPaper() {
  const w = ui.app.clientWidth;
  const h = ui.app.clientHeight;
  const ctx = prepare(ui.paper, paperCtx, w, h);
  paintThemeBackground(ctx, w, h, state.theme);
  headFrame.paint(ctx, w, h, state.theme, BoilClock.frame);
  state.paperDirty = false;
}

function drawSheet() {
  const w = ui.app.clientWidth;
  const h = ui.app.clientHeight;
  const ctx = prepare(ui.sheet, sheetCtx, w, h);
  ctx.clearRect(0, 0, w, h);

  const sheet = book.current;
  sheet.setBounds(state.rect.width, state.rect.height);
  sheet.setShapeScale(bubbleScale(state.theme.family));

  ctx.save();
  ctx.translate(state.rect.left, state.rect.top);
  paintSheet(ctx, sheet, state.theme, BoilClock.frame);
  ctx.restore();
  state.sheetDirty = false;
}

/// The paper behind the calendar and the settings page. They are the same
/// notebook turned to a different page — a plain panel over a ruled one reads
/// as a different app.
function drawPagePapers() {
  for (const page of [ui.calendar, ui.settings]) {
    if (page.hidden) continue;
    const canvas = page.querySelector('.page-paper');
    const ctx = prepare(canvas, canvas.getContext('2d'), page.clientWidth, page.clientHeight);
    paintThemeBackground(ctx, page.clientWidth, page.clientHeight, state.theme);
  }
}

let lastFrameAt = null;

function loop(now) {
  const seconds = lastFrameAt === null ? 1 / 60 : (now - lastFrameAt) / 1000;
  lastFrameAt = now;

  const sheet = book.current;
  if (!sheet.idle) {
    sheet.tick(Math.min(Math.max(seconds, 0), 0.05));
    state.sheetDirty = true;
  }

  if (state.paperDirty) drawPaper();
  if (state.sheetDirty) drawSheet();

  requestAnimationFrame(loop);
}

/* ------------------------------------------------------- pointer on sheet */

const drag = { active: false, id: null, from: null, at: null, time: 0, moved: 0, vx: 0, vy: 0 };

function sheetPoint(event) {
  const box = ui.sheet.getBoundingClientRect();
  return {
    x: event.clientX - box.left - state.rect.left,
    y: event.clientY - box.top - state.rect.top,
  };
}

function insideSheet(point) {
  return (
    point.x >= 0 && point.y >= 0 && point.x <= state.rect.width && point.y <= state.rect.height
  );
}

ui.sheet.addEventListener('pointerdown', (event) => {
  if (state.editing !== null) return;
  const point = sheetPoint(event);
  if (!insideSheet(point)) return;

  try {
    // Keeps a bubble under the finger even when it leaves the canvas. Not
    // every pointer can be captured, and one that can't is still a drag.
    ui.sheet.setPointerCapture(event.pointerId);
  } catch (error) {
    /* carried on without capture */
  }
  drag.id = event.pointerId;
  drag.from = point;
  drag.at = point;
  drag.time = event.timeStamp;
  drag.moved = 0;
  drag.vx = 0;
  drag.vy = 0;
  // Dragging is for add mode only. In pop mode a finger on a bubble means
  // "done", and a pop that turned into a drag halfway would be neither.
  drag.active = !state.popMode && !isComposing() && book.current.grab(point.x, point.y);
  if (drag.active) state.sheetDirty = true;
});

ui.sheet.addEventListener('pointermove', (event) => {
  if (drag.id !== event.pointerId) return;
  const point = sheetPoint(event);
  const seconds = Math.max((event.timeStamp - drag.time) / 1000, 0.001);
  drag.moved += Math.hypot(point.x - drag.at.x, point.y - drag.at.y);
  drag.vx = (point.x - drag.at.x) / seconds;
  drag.vy = (point.y - drag.at.y) / seconds;
  drag.at = point;
  drag.time = event.timeStamp;

  if (drag.active) {
    book.current.dragTo(point.x, point.y, drag.vx, drag.vy);
    state.sheetDirty = true;
  }
});

function endDrag(event) {
  if (drag.id !== event.pointerId) return;
  const point = drag.at;
  const wasDragging = drag.active;
  drag.id = null;
  drag.active = false;

  // Anything that stayed put is a tap, even on a bubble that was picked up:
  // in add mode a finger held still on a bubble means "open this one".
  const tapped = drag.moved <= 10;
  // A finger that stopped before it lifted throws nothing, whatever the last
  // move measured.
  const held = event.timeStamp - drag.time > 100;

  if (wasDragging) {
    const still = tapped || held;
    book.current.letGo(still ? 0 : drag.vx, still ? 0 : drag.vy);
    state.sheetDirty = true;
  }

  if (tapped) tapSheet(point);
}

ui.sheet.addEventListener('pointerup', endDrag);
ui.sheet.addEventListener('pointercancel', (event) => {
  if (drag.id !== event.pointerId) return;
  if (drag.active) book.current.letGo(0, 0);
  drag.id = null;
  drag.active = false;
  state.sheetDirty = true;
});

function tapSheet(point) {
  if (state.popMode) {
    if (book.popAt(point.x, point.y)) state.sheetDirty = true;
    return;
  }
  if (isComposing()) {
    closeComposer();
    return;
  }

  const item = book.current.itemAt(point.x, point.y);
  if (item) {
    openPanel(item.reminderId);
    return;
  }
  openComposer(point.x);
}

/* ---------------------------------------------------------------- top bar */

function bookChanged() {
  ui.date.textContent = longDate(book.selected);
  ui.backToday.hidden = book.onToday;
  state.sheetDirty = true;
  if (!ui.calendar.hidden) drawMonth();
}

ui.date.addEventListener('click', () => openCalendar());
ui.backToday.addEventListener('click', () => book.goToToday());
for (const arrow of document.querySelectorAll('[data-step]')) {
  arrow.addEventListener('click', () => book.step(Number(arrow.dataset.step)));
}

/// A word to tap, ringed by hand when it is the one chosen.
function circledWord(element, isActive) {
  const decoration = new SketchDecoration(
    element,
    [{ shape: circleAround, pen: circlePen, colour: () => state.theme.ink }],
    hashString(element.textContent || 'word'),
  );
  decoration.visible = isActive;
  element.classList.toggle('active', isActive);
  decoration.draw();
  return {
    decoration,
    setActive(active) {
      decoration.visible = active;
      element.classList.toggle('active', active);
      decoration.draw();
    },
  };
}

const modeWords = {
  add: circledWord(ui.modeAdd, false),
  pop: circledWord(ui.modePop, true),
};

new SketchDecoration(
  ui.mode,
  [{ shape: modeFrame, pen: modePen, colour: () => state.theme.faintInk }],
  5150,
);

new SketchDecoration(
  ui.cog,
  [
    {
      shape: (w, h) => cog(24, 24).shifted((w - 24) / 2, (h - 24) / 2),
      pen: cogPen,
      colour: () => state.theme.faintInk,
    },
  ],
  6061,
);

function setMode(pop) {
  state.popMode = pop;
  modeWords.pop.setActive(pop);
  modeWords.add.setActive(!pop);
  closeComposer();
  closePanel();
}

ui.modeAdd.addEventListener('click', () => setMode(false));
ui.modePop.addEventListener('click', () => setMode(true));

/* -------------------------------------------------------------- composer */

new SketchDecoration(
  ui.composerPill,
  [{ shape: composerPill, pen: outlinePen, colour: () => state.theme.faintInk }],
  7717,
);

function isComposing() {
  return !ui.composer.hidden;
}

function openComposer(atX) {
  state.dropAt = atX;
  ui.composer.hidden = false;
  ui.composerInput.value = '';
  redrawDecorations();
  ui.composerInput.focus();
}

function closeComposer() {
  ui.composer.hidden = true;
  ui.composerInput.blur();
}

function commitComposer() {
  const text = ui.composerInput.value;
  closeComposer();
  book.add(text, { atX: state.dropAt });
}

ui.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  commitComposer();
});

// Enter rather than a button: the form has nothing to press, and a phone's
// keyboard offers "done" in the corner.
ui.composerInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  commitComposer();
});

/* ------------------------------------------------------------ edit panel */

new SketchDecoration(
  ui.panelBody,
  [{ shape: panelOutline, pen: outlinePen, colour: () => state.theme.faintInk }],
  3141,
);

/// Nothing is saved until "tamam": saving as you type would rewrite a
/// repeating reminder on every page it falls on, a keystroke at a time.
const repeatWords = repeats.map((repeat) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word';
  button.textContent = repeatNames[repeat];
  ui.panelRepeats.append(button);
  const word = circledWord(button, false);
  button.addEventListener('click', () => {
    state.editRepeat = repeat;
    for (const other of repeatWords) other.word.setActive(other.repeat === repeat);
  });
  return { repeat, word };
});

function openPanel(id) {
  const reminder = book.reminder(id);
  if (!reminder) return;
  state.editing = id;
  state.editRepeat = reminder.repeat;
  ui.panelLabel.value = reminder.label;
  ui.panelTime.value = reminder.time;
  for (const other of repeatWords) other.word.setActive(other.repeat === reminder.repeat);
  ui.panel.hidden = false;
  ui.scrim.hidden = false;
  redrawDecorations();
}

function closePanel() {
  state.editing = null;
  ui.panel.hidden = true;
  ui.scrim.hidden = true;
}

// Tapping outside the panel closes it without saving.
ui.scrim.addEventListener('pointerdown', () => closePanel());

ui.panelSave.addEventListener('click', () => {
  const id = state.editing;
  if (id === null) return;
  book.edit(id, {
    label: ui.panelLabel.value,
    repeat: state.editRepeat,
    // A time field can be cleared, and an emptied one means "leave it alone"
    // rather than "no hour at all".
    time: ui.panelTime.value || undefined,
  });
  closePanel();
});

ui.panelDelete.addEventListener('click', () => {
  const id = state.editing;
  closePanel();
  if (id !== null) book.delete(id);
});

ui.panelPop.addEventListener('click', () => {
  const id = state.editing;
  closePanel();
  if (id !== null) book.pop(id);
});

ui.panelLabel.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') ui.panelSave.click();
});

/* --------------------------------------------------------------- calendar */

for (const initial of weekdayInitials) {
  const span = document.createElement('span');
  span.textContent = initial;
  ui.weekdayRow.append(span);
}

/// Rings are drawn only for today and the selected day. Roughening is the
/// expensive half of the drawing engine, and forty-two hand-drawn circles a
/// frame would cost far more than the two that carry meaning.
let dayDecorations = [];

function drawMonth() {
  const month = state.calendarMonth;
  ui.monthName.textContent = `${monthOf(month)} ${month.getFullYear()}`;

  for (const decoration of dayDecorations) decoration.remove();
  dayDecorations = [];
  ui.monthGrid.replaceChildren();

  for (let i = 0; i < leadingBlanks(month); i++) {
    ui.monthGrid.append(document.createElement('div'));
  }

  for (let d = 1; d <= daysInMonth(month); d++) {
    const day = new Date(month.getFullYear(), month.getMonth(), d);
    const isToday = isoDay(day) === isoDay(book.today);
    const isSelected = isoDay(day) === isoDay(book.selected);

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day-cell';
    cell.classList.toggle('chosen', isSelected || isToday);

    const number = document.createElement('span');
    number.className = 'day-number';
    number.textContent = String(d);
    cell.append(number);

    const dot = document.createElement('span');
    dot.className = book.hasAnything(day) ? 'day-dot' : 'day-dot empty';
    cell.append(dot);

    if (isSelected || isToday) {
      dayDecorations.push(
        new SketchDecoration(
          number,
          [
            {
              shape: ringAround,
              pen: markPen,
              colour: () => (isSelected ? state.theme.ink : state.theme.faintInk),
            },
          ],
          d * 97 + month.getMonth(),
        ),
      );
    }

    cell.addEventListener('click', () => {
      closeCalendar();
      book.select(day);
      closeComposer();
      closePanel();
    });
    ui.monthGrid.append(cell);
  }
}

function openCalendar() {
  state.calendarMonth = new Date(book.selected.getFullYear(), book.selected.getMonth(), 1);
  ui.calendar.hidden = false;
  drawMonth();
  drawPagePapers();
}

function closeCalendar() {
  ui.calendar.hidden = true;
}

for (const arrow of document.querySelectorAll('[data-month]')) {
  arrow.addEventListener('click', () => {
    const by = Number(arrow.dataset.month);
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() + by,
      1,
    );
    drawMonth();
  });
}

/* --------------------------------------------------------------- settings */

const swatches = [];

for (const family of families) {
  const choice = document.createElement('div');
  choice.className = 'theme-choice';

  const canvas = document.createElement('canvas');
  choice.append(canvas);

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'word';
  name.textContent = familyNames[family];
  choice.append(name);
  ui.themeRow.append(choice);

  const word = circledWord(name, family === state.settings.family);
  const pick = () => chooseFamily(family);
  canvas.addEventListener('click', pick);
  name.addEventListener('click', pick);
  swatches.push({ family, canvas, word });
}

const appearanceWords = appearances.map((appearance) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word';
  button.textContent = appearanceNames[appearance];
  ui.appearanceRow.append(button);
  const word = circledWord(button, appearance === state.settings.appearance);
  button.addEventListener('click', () => {
    state.settings = { ...state.settings, appearance };
    SettingsStore.save(state.settings);
    for (const other of appearanceWords) other.word.setActive(other.appearance === appearance);
    applyTheme();
  });
  return { appearance, word };
});

function chooseFamily(family) {
  state.settings = { ...state.settings, family };
  SettingsStore.save(state.settings);
  for (const swatch of swatches) swatch.word.setActive(swatch.family === family);
  applyTheme();
}

/// A swatch of one theme — its paper, pattern and a bubble — each shown the
/// way it would look right now.
function drawSwatches() {
  for (const swatch of swatches) {
    const preview = Settings.themeFor(
      { ...state.settings, family: swatch.family },
      state.systemDark,
    );
    const size = swatch.canvas.offsetWidth || 84;
    const ctx = prepare(swatch.canvas, swatch.canvas.getContext('2d'), size, size);
    paintThemeBackground(ctx, size, size, preview, 0.6);

    const side = size * 0.56;
    const shape = previewOutline(preview.family, side).shifted((size - side) / 2, (size - side) / 2);
    ctx.fillStyle = rgba(preview.bubbleFill);
    ctx.fill(shape.p2d);
    ctx.strokeStyle = rgba(preview.ink);
    ctx.lineWidth = 2;
    ctx.stroke(shape.p2d);
  }
}

ui.cog.addEventListener('click', () => {
  ui.settings.hidden = false;
  drawPagePapers();
  drawSwatches();
  redrawDecorations();
});

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => {
    el(button.dataset.close).hidden = true;
  });
}

/* ---------------------------------------------------------- the reminding */

/// What the settings page says about notifications, for each way the browser
/// can stand. Silence where there is nothing to configure: a copy of the app
/// with no server behind it should not advertise a feature it hasn't got.
const pushNotes = {
  unsupported: { note: 'Bu tarayıcı bildirim gönderemiyor.', action: null },
  'needs-install': {
    note: 'Bildirim için uygulamayı ana ekrana ekle: Paylaş ▸ Ana Ekrana Ekle. Sonra buradan aç.',
    action: null,
  },
  'needs-permission': { note: 'Hatırlatmalar bildirim olarak gelsin mi?', action: 'bildirimleri aç' },
  denied: {
    note: 'Bildirimlere izin verilmemiş. Telefonun Ayarlar ▸ Bildirimler bölümünden açabilirsin.',
    action: null,
  },
  on: { note: 'Bildirimler açık. Uygulama kapalıyken de gelir.', action: null },
  error: { note: 'Bildirimler kurulamadı.', action: 'yeniden dene' },
};

Push.onState((pushState, detail) => {
  const shown = pushNotes[pushState];
  ui.push.hidden = !shown;
  if (!shown) return;

  ui.pushNote.textContent = detail ? `${shown.note} (${detail})` : shown.note;
  ui.pushNote.classList.toggle('is-on', pushState === 'on');
  ui.pushAction.hidden = !shown.action;
  if (shown.action) ui.pushAction.textContent = shown.action;
});

ui.pushAction.addEventListener('click', () => Push.enable());

/* ------------------------------------------------------------------ keys */

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!ui.settings.hidden) {
    ui.settings.hidden = true;
  } else if (!ui.calendar.hidden) {
    closeCalendar();
  } else if (state.editing !== null) {
    closePanel();
  } else if (isComposing()) {
    closeComposer();
  }
});

/* --------------------------------------------------------------- startup */

window.addEventListener('resize', () => relayout());
window.addEventListener('orientationchange', () => setTimeout(relayout, 120));

/// The on-screen keyboard shrinks the viewport rather than the page, so the
/// composer is lifted by hand to sit just above it.
if (window.visualViewport) {
  const lift = () => {
    const covered = Math.max(
      window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop,
      0,
    );
    ui.composer.style.transform = `translateY(${-covered}px)`;
    ui.panel.style.transform = `translateY(${-covered}px)`;
  };
  window.visualViewport.addEventListener('resize', lift);
  window.visualViewport.addEventListener('scroll', lift);
}

BoilClock.onFrame(() => {
  state.paperDirty = true;
  state.sheetDirty = true;
  redrawDecorations();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  state.systemDark = event.matches;
  applyTheme();
});

/// The app's own copy of itself, so a phone with no signal still opens its
/// sheet — and, where notifications are configured, the worker that receives
/// them. One worker serves both; a page may only have one.
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('OneSignalSDKWorker.js').catch((error) => {
    // Opened straight off the disk, or served without https. Neither stops the
    // app running; only the offline copy and the notifications are lost.
    console.warn('Poplet çevrimdışı kopyası kurulamadı:', error);
  });
}

async function start() {
  // Nothing is measured until the handwriting is actually available: a label
  // fitted in the fallback font would size its bubble wrong and keep it.
  try {
    await Promise.all([
      document.fonts.load(`${labelFontSize}px Caveat`),
      document.fonts.load('13px PatrickHand'),
    ]);
  } catch (error) {
    // A font that won't load is drawn in whatever the browser falls back to.
  }

  applyTheme();
  book.restore();
  // After the reminders, so the top bar is its final height and the day that
  // was restored is sized before its first tick.
  bookChanged();
  relayout();
  BoilClock.start();
  requestAnimationFrame(loop);

  registerWorker();
  Push.start();
}

start();
