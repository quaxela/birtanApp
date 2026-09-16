'use strict';

/// How far into the 420ms pop the bubble actually bursts.
const burstAt = 0.24;
const popSeconds = 0.42;

/// One reminder: the task, the body the simulation moves, the wrapped label,
/// and the roughened outline — expensive enough to build once and keep.
class SheetItem {
  constructor({ id, reminderId, label, body, fitted, tilt }) {
    this.id = id;
    this.reminderId = reminderId;
    this.label = label;
    this.body = body;
    this.fitted = fitted;
    this.diameter = fitted.diameter;
    /// A degree or two of lean, fixed per bubble. The drawing is allowed to be
    /// wonky; the label is not, so this is applied to the outline alone.
    this.tilt = tilt;

    this.pop = 0;
    /// True from the moment it was tapped, not from when the burst finishes.
    this.popping = false;
    this.popped = false;
    this._lookFamily = null;
    this._look = null;
  }

  /// How this bubble is drawn in a theme. Built on first use and again only
  /// when the theme changes family: roughening is the expensive half of
  /// drawing, so it happens once per bubble per theme.
  lookFor(family) {
    if (this._lookFamily !== family || !this._look) {
      this._lookFamily = family;
      this._look = bubbleLook(family, this.diameter, hashString(this.id));
    }
    return this._look;
  }
}

/// Owns the simulation and the reminders on one day's sheet.
class SheetController {
  constructor(notes = []) {
    this.world = new BubbleWorld();
    this.items = [];
    this._pending = [...notes];
    this._nextId = 1;
    this._unnamed = 0;
    this._dropIn = 0;
    this._shapeScale = 1;
    this._grip = { x: 0, y: 0 };
  }

  /// Every reminder this day still holds, in the order they were added.
  ///
  /// Includes ones queued but not yet dropped: a restored day holds its
  /// reminders in the queue until it is actually looked at. Anything already
  /// tapped is excluded — a reminder is done the moment you decide it is.
  get notes() {
    return [
      ...this.items.filter((i) => !i.popping).map((i) => ({ id: i.reminderId, label: i.label })),
      ...this._pending,
    ];
  }

  /// Nothing left to animate: no drops queued, no pops running, pile at rest.
  get idle() {
    return (
      this._pending.length === 0 && this.world.settled && this.items.every((i) => !i.popping)
    );
  }

  /// Resizes every bubble's body for a theme whose shapes need more room than
  /// a circle. The same scale again does nothing, so this can be called on
  /// every paint.
  setShapeScale(scale) {
    if (scale === this._shapeScale) return;
    this._shapeScale = scale;
    for (const item of this.items) {
      item.body.size = item.diameter * scale;
      item.body.wake();
    }
  }

  setBounds(w, h) {
    if (this.world.width === w && this.world.height === h) return;
    this.world.width = w;
    this.world.height = h;
    for (const body of this.world.bodies) body.wake();
  }

  /// Drops a reminder onto the sheet. `id` names the reminder behind the
  /// bubble; a sheet with nothing stored behind it can leave it out.
  add(rawLabel, { id = null, atX = null } = {}) {
    const label = rawLabel.trim();
    if (label === '') return;
    const note = { id: id ?? `unnamed${this._unnamed++}`, label };

    // With no size yet there is nowhere to drop it, so it waits its turn.
    if (this.world.width === 0 || this.world.height === 0) {
      this._pending.push(note);
      return;
    }

    const fitted = fitCircle(label, this.world.width * 0.8, labelFontSize);
    const r = (fitted.diameter * this._shapeScale) / 2;
    const x = clamp(atX ?? this.world.width / 2, r, Math.max(this.world.width - r, r));

    // Dropped in from just above the sheet, so it visibly falls into place
    // rather than appearing fully formed.
    this._insert(note, fitted, x, -fitted.diameter * this._shapeScale);
  }

  _insert(note, fitted, x, y, at = null) {
    const id = `b${this._nextId++}`;
    const body = new BubbleBody({ id, x, y, size: fitted.diameter * this._shapeScale });
    this.world.add(body);

    const item = new SheetItem({
      id,
      reminderId: note.id,
      label: note.label,
      body,
      fitted,
      tilt: (seededUnit(hashString(id) * 45 + 233) * 2 - 1) * 0.035,
    });
    if (at === null) {
      this.items.push(item);
    } else {
      this.items.splice(at, 0, item);
    }
    return item;
  }

  /// The bubble under a point, unless it is already on its way out.
  itemAt(x, y) {
    const body = this.world.hitTest(x, y);
    if (!body) return null;
    const item = this.items.find((i) => i.body.id === body.id);
    return !item || item.popping ? null : item;
  }

  /// Pops the bubble for a reminder. One still waiting to drop in leaves
  /// quietly — there is nothing on screen yet to burst.
  popById(reminderId) {
    const waiting = this._pending.findIndex((note) => note.id === reminderId);
    if (waiting !== -1) {
      this._pending.splice(waiting, 1);
      return true;
    }
    for (const item of this.items) {
      if (!item.popping && item.reminderId === reminderId) {
        item.popping = true;
        return true;
      }
    }
    return false;
  }

  /// Picks up the bubble under a point to drag it, if one is there. The grip
  /// is where the finger took hold, so it doesn't jump to centre itself.
  grab(x, y) {
    const item = this.itemAt(x, y);
    if (!item) return false;
    this._grip = { x: item.body.x - x, y: item.body.y - y };
    this.world.grab(item.body.id);
    return true;
  }

  dragTo(x, y, vx = 0, vy = 0) {
    this.world.moveHeld(x + this._grip.x, y + this._grip.y, vx, vy);
  }

  letGo(vx = 0, vy = 0) {
    this.world.release(vx, vy);
  }

  /// Brings the sheet in line with the reminders that fall on its day.
  ///
  /// For changes made away from this sheet — an edit, a deletion, a repeat that
  /// now lands here — so nothing bursts: a reminder no longer on the day is
  /// taken off, a new one drops in, and one that says something else is
  /// rewritten where it sits.
  syncWith(wanted) {
    const labelFor = new Map(wanted.map((note) => [note.id, note.label]));

    this._pending = this._pending
      .filter((note) => labelFor.has(note.id))
      .map((note) => ({ id: note.id, label: labelFor.get(note.id) }));

    for (const item of [...this.items]) {
      if (item.popping) continue;
      const label = labelFor.get(item.reminderId);
      if (label === undefined) {
        this.items.splice(this.items.indexOf(item), 1);
        this.world.remove(item.body.id);
      } else if (label !== item.label) {
        this._relabel(item, label);
      }
    }

    const shown = new Set(this.notes.map((note) => note.id));
    for (const note of wanted) {
      if (!shown.has(note.id)) this._pending.push({ ...note });
    }
  }

  /// Swaps a bubble for one sized to `label`, on the same spot and at the same
  /// place in the drawing order. The pile makes room if it grew.
  _relabel(item, label) {
    const at = this.items.indexOf(item);
    this.items.splice(at, 1);
    this.world.remove(item.body.id);
    this._insert(
      { id: item.reminderId, label },
      fitCircle(label, this.world.width * 0.8, labelFontSize),
      item.body.x,
      item.body.y,
      at,
    );
  }

  tick(dt) {
    this._advancePending(dt);

    const finished = [];
    for (const item of this.items) {
      if (!item.popping || item.pop >= 1) continue;
      item.pop = Math.min(item.pop + dt / popSeconds, 1);

      if (!item.popped && item.pop >= burstAt) {
        item.popped = true;
        // Gone for good — and the pile above drops into the gap it leaves.
        this.world.remove(item.body.id);
      }
      if (item.pop >= 1) finished.push(item);
    }

    if (finished.length > 0) {
      this.items = this.items.filter((i) => !finished.includes(i));
    }

    if (!this.world.settled) this.world.step(dt);
  }

  /// Feeds the starting reminders in one at a time so the sheet fills up the
  /// way it would in use, instead of all five landing in one clump.
  _advancePending(dt) {
    if (this._pending.length === 0 || this.world.width === 0) return;
    this._dropIn -= dt;
    if (this._dropIn > 0) return;
    this._dropIn = 0.22;
    const remainingAfter = this._pending.length - 1;
    const note = this._pending.shift();
    this.add(note.label, {
      id: note.id,
      atX: this.world.width * (0.25 + (0.5 * remainingAfter) / 5),
    });
  }
}

/// Draws one bubble whole, centred on a point: the outline leaning, the label
/// level.
function paintBubble(ctx, item, { x, y, theme, frame = 0, scale = 1, opacity = 1 }) {
  const look = item.lookFor(theme.family);
  const d = item.diameter;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.rotate(item.tilt);
  ctx.translate(-d / 2, -d / 2);
  if (look.fill && theme.bubbleFill.a > 0) {
    ctx.fillStyle = rgba(theme.bubbleFill, opacity);
    ctx.fill(look.fill.p2d);
  }
  SketchPen.paint(ctx, look.outline.frame(frame), theme.ink, opacity);
  if (look.highlight) {
    SketchPen.paint(ctx, look.highlight.frame(frame), theme.ink, 0.4 * opacity);
  }
  ctx.restore();

  // The label rides the bubble but never leans with it.
  ctx.translate(0, -d * look.labelLift);
  paintLines(ctx, item.fitted.lines, item.fitted.fontSize, theme.ink, opacity);
  ctx.restore();
}

/// Draws every reminder on a sheet, and the torn film flying off the ones just
/// popped.
function paintSheet(ctx, controller, theme, frame) {
  for (const item of controller.items) {
    const t = item.pop;
    const intact = clamp(1 - t / burstAt, 0, 1);

    if (intact > 0) {
      paintBubble(ctx, item, {
        x: item.body.x,
        y: item.body.y,
        theme,
        frame,
        scale: popScale(t),
        opacity: intact,
      });
    }

    if (t > 0 && t < 0.8) {
      paintBurst(ctx, item.body.x, item.body.y, item.diameter, t, hashString(item.id), theme.ink);
    }
  }
}

/// Swell, then snap. Without the wind-up the burst reads as the bubble merely
/// vanishing.
function popScale(t) {
  return t < 0.16 ? 1 + 0.13 * (t / 0.16) : 1.13 + 0.25 * ((t - 0.16) / 0.08);
}

function paintBurst(ctx, x, y, diameter, t, seed, ink) {
  const progress = clamp((t - 0.2) / 0.55, 0, 1);
  if (progress <= 0) return;

  const reach = diameter * 0.5;
  ctx.save();
  ctx.strokeStyle = rgba(ink, (1 - progress) * 0.8);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU + (seededUnit((seed + i) * 45 + 233) - 0.5) * 0.8;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const sx = x + dx * reach * (0.7 + progress * 1.3);
    const sy = y + dy * reach * (0.7 + progress * 1.3);
    const len = 10 * (1 - progress * 0.6);
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + dx * len, sy + dy * len);
  }
  ctx.stroke();
  ctx.restore();
}
