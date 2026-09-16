'use strict';

/// One bubble as the simulation sees it: a horizontal capsule that falls,
/// leans on its neighbours, and never turns.
///
/// Rotation is left out of the model entirely rather than locked after the
/// fact — labels have to stay level to stay readable, and dropping angular
/// motion removes the part of rigid-body simulation that makes stacks jitter.
class BubbleBody {
  constructor({ id, x, y, size }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    /// Bodies are square boxes; width and height are the same.
    this.size = size;

    this.asleep = false;
    /// Held under a finger: it goes where the finger goes, and whatever it
    /// touches is moved out of its way rather than the other way round.
    this.held = false;
    /// Thrown by hand. It bounces off what it hits until it next comes to
    /// rest; the rest of the pile only ever nestles.
    this.bouncy = false;
    this.still = 0;
    this.wasAt = null;
  }

  get radius() {
    return this.size / 2;
  }

  /// Half the length of the capsule's spine — the straight part between caps.
  /// Zero while the bodies are square, kept because the solver is written for
  /// capsules and a wider label shape would need it.
  get spine() {
    return Math.max(this.size / 2 - this.radius, 0);
  }

  contains(px, py) {
    const dx = Math.max(Math.abs(px - this.x) - this.spine, 0);
    const dy = py - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  wake() {
    this.asleep = false;
    this.still = 0;
    this.wasAt = null;
  }
}

/// A small impulse solver for a pile of capsules under gravity.
///
/// Deliberately soft: positions are corrected only part of the way each
/// iteration and almost no energy is returned on impact, so bubbles nestle
/// into each other the way a bag of them does. A rigid engine would give hard,
/// clacking contacts, which is the wrong feel for this.
class BubbleWorld {
  constructor({ gravity = 2400 } = {}) {
    this.gravity = gravity;
    this.bodies = [];
    this.width = 0;
    this.height = 0;
    this._held = null;
  }

  add(body) {
    this.bodies.push(body);
    // A new arrival lands on a pile that may have settled; nothing under it
    // would otherwise move out of the way.
    for (const other of this.bodies) other.wake();
  }

  remove(id) {
    this.bodies = this.bodies.filter((b) => b.id !== id);
    if (this._held && this._held.id === id) this._held = null;
    for (const body of this.bodies) body.wake();
  }

  hitTest(x, y) {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      if (this.bodies[i].contains(x, y)) return this.bodies[i];
    }
    return null;
  }

  /// Picks up the body `id`. Until `release` it ignores gravity and goes
  /// wherever `moveHeld` puts it.
  grab(id) {
    for (const body of this.bodies) {
      if (body.id !== id) continue;
      if (this._held) this._held.held = false;
      this._held = body;
      body.held = true;
      body.vx = 0;
      body.vy = 0;
      body.wake();
      return;
    }
  }

  /// Moves the held body, kept inside the walls. The velocity is the finger's,
  /// so whatever the body knocks into is knocked at that speed.
  moveHeld(x, y, vx, vy) {
    const body = this._held;
    if (!body) return;
    const half = body.size / 2;
    const r = body.radius;
    body.x = clamp(x, half, Math.max(this.width - half, half));
    body.y = clamp(y, r, Math.max(this.height - r, r));
    body.vx = vx;
    body.vy = vy;
    body.wake();
  }

  /// Lets go of the held body, thrown at a believable speed at most.
  release(vx, vy) {
    const body = this._held;
    if (!body) return;
    this._held = null;
    const speed = Math.hypot(vx, vy);
    const scale = speed > BubbleWorld.maxThrow ? BubbleWorld.maxThrow / speed : 1;
    body.held = false;
    body.bouncy = true;
    body.vx = vx * scale;
    body.vy = vy * scale;
    body.wake();
  }

  /// Advances the simulation. Long frames are cut into smaller steps so a
  /// stutter cannot throw a bubble through the floor.
  step(dt) {
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0) {
      const slice = Math.min(remaining, BubbleWorld.maxStep);
      this._wakeUnsupported();
      this._integrate(slice);
      for (let i = 0; i < BubbleWorld.iterations; i++) this._solve();
      this._sleepSettled(slice);
      remaining -= slice;
    }
  }

  _integrate(dt) {
    const damp = Math.max(1 - BubbleWorld.damping * dt, 0);
    for (const body of this.bodies) {
      if (body.asleep || body.held) continue;
      body.vy += this.gravity * dt;
      body.vx *= damp;
      body.vy *= damp;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
  }

  _solve() {
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        this._pair(this.bodies[i], this.bodies[j]);
      }
    }
    for (const body of this.bodies) this._againstWalls(body);
  }

  _againstWalls(body) {
    if (body.held) return;
    const half = body.size / 2;
    const r = body.radius;
    const bounce = body.bouncy ? BubbleWorld.thrownRestitution : BubbleWorld.restitution;

    if (body.x - half < 0) {
      body.x = half;
      body.vx = Math.abs(body.vx) * bounce;
    } else if (body.x + half > this.width) {
      body.x = this.width - half;
      body.vx = -Math.abs(body.vx) * bounce;
    }

    const floor = this.height - r;
    if (body.y > floor) {
      body.y = floor;
      if (body.vy > 0) {
        body.vx *= BubbleWorld.friction;
        body.vy = -body.vy * bounce;
      }
    }
  }

  _pair(a, b) {
    if (a.asleep && b.asleep) return;

    const contact = closestBetween(a, b);
    const overlap = a.radius + b.radius - contact.distance;
    if (overlap <= 0) return;

    // A held bubble shoves: whatever it touches wakes up and gets out of the way.
    if (a.held) b.wake();
    if (b.held) a.wake();

    // A settled bubble acts as ground: it absorbs the contact without moving
    // and without being woken. Waking on mere contact makes neighbours reset
    // each other's rest timers forever, and a pile that never sleeps burns
    // battery drawing a picture that isn't changing.
    const aMoves = !a.asleep && !a.held;
    const bMoves = !b.asleep && !b.held;
    if (!aMoves && !bMoves) return;
    const share = 1 / ((aMoves ? 1 : 0) + (bMoves ? 1 : 0));

    // Push apart, but only partway and only past a tolerance — correcting
    // fully every iteration makes a settled pile buzz.
    const push = Math.max(overlap - BubbleWorld.slop, 0) * BubbleWorld.correction * share;
    if (aMoves) {
      a.x -= contact.nx * push;
      a.y -= contact.ny * push;
    }
    if (bMoves) {
      b.x += contact.nx * push;
      b.y += contact.ny * push;
    }

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const along = rvx * contact.nx + rvy * contact.ny;
    if (along > 0) return;

    const bounce =
      a.bouncy || b.bouncy ? BubbleWorld.thrownRestitution : BubbleWorld.restitution;
    const impulse = -(1 + bounce) * along * share;
    if (aMoves) {
      a.vx -= contact.nx * impulse;
      a.vy -= contact.ny * impulse;
    }
    if (bMoves) {
      b.vx += contact.nx * impulse;
      b.vy += contact.ny * impulse;
    }

    const tx = -contact.ny;
    const ty = contact.nx;
    const drag = (rvx * tx + rvy * ty) * BubbleWorld.friction * share;
    if (aMoves) {
      a.vx += tx * drag;
      a.vy += ty * drag;
    }
    if (bMoves) {
      b.vx -= tx * drag;
      b.vy -= ty * drag;
    }
  }

  _sleepSettled(dt) {
    for (const body of this.bodies) {
      if (body.asleep || body.held) continue;

      const was = body.wasAt;
      body.wasAt = { x: body.x, y: body.y };
      if (!was) {
        body.still = 0;
        continue;
      }

      if (Math.hypot(body.x - was.x, body.y - was.y) / dt < BubbleWorld.sleepDrift) {
        body.still += dt;
        if (body.still >= BubbleWorld.sleepAfter) {
          body.asleep = true;
          body.vx = 0;
          body.vy = 0;
          body.bouncy = false;
        }
      } else {
        body.still = 0;
      }
    }
  }

  /// Wakes any sleeping body with nothing left underneath it.
  ///
  /// A settled bubble absorbs contacts without being woken, so one asleep on
  /// top of another stays put even when the bubble holding it up slides away —
  /// nothing ever touches it again, and it hangs in the air.
  _wakeUnsupported() {
    for (const body of this.bodies) {
      if (body.asleep && !this._isSupported(body)) body.wake();
    }
  }

  _isSupported(body) {
    if (body.y + body.radius >= this.height - BubbleWorld.supportGap) return true;

    for (const other of this.bodies) {
      if (other === body) continue;
      const contact = closestBetween(body, other);
      // Only something it rests on counts: below it, not merely beside it.
      if (
        contact.ny > 0.1 &&
        contact.distance <= body.radius + other.radius + BubbleWorld.supportGap
      ) {
        return true;
      }
    }
    return false;
  }

  get settled() {
    return this.bodies.every((b) => b.asleep);
  }
}

BubbleWorld.iterations = 8;
BubbleWorld.restitution = 0.04;
BubbleWorld.thrownRestitution = 0.6;
/// Pixels per second. A flick can measure far faster than anything a bubble
/// should do, and a throw that fast just vanishes into a wall.
BubbleWorld.maxThrow = 2500;
BubbleWorld.friction = 0.55;
BubbleWorld.correction = 0.45;
BubbleWorld.slop = 0.4;
/// Pixels per second of *actual* movement. Residual velocity is the wrong
/// thing to measure: in a deep stack the solver cancels each body's fall only
/// approximately, so a pile that is visibly frozen still carries 10-20 px/s
/// that never decays. What matters is whether anything moved.
BubbleWorld.sleepDrift = 12;
BubbleWorld.sleepAfter = 0.4;
/// How far above what holds it up a sleeping body may sit and still count as
/// held. The solver leaves resting contacts a hair apart.
BubbleWorld.supportGap = 2;
BubbleWorld.maxStep = 1 / 50;
/// Bleeds off sliding energy. Circles keep finding new gaps to slip into, and
/// without this a fresh pile takes several seconds to stop shuffling.
BubbleWorld.damping = 1.6;

/// Shortest distance between two horizontal spines, and the direction that
/// separates them.
function closestBetween(a, b) {
  const dy = b.y - a.y;
  const aLeft = a.x - a.spine;
  const aRight = a.x + a.spine;
  const bLeft = b.x - b.spine;
  const bRight = b.x + b.spine;

  let dx = 0;
  if (aRight < bLeft) {
    dx = bLeft - aRight;
  } else if (bRight < aLeft) {
    dx = bRight - aLeft;
  }

  const distance = Math.hypot(dx, dy);
  // Dead centre on top of each other: pick a direction so they can part.
  if (distance < 0.0001) return { nx: 0, ny: 1, distance: 0 };
  return { nx: dx / distance, ny: dy / distance, distance };
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}
