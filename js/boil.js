'use strict';

/// Drives the "boil": hand-drawn animation redraws every cel, so outlines
/// shimmer instead of sitting perfectly still. We fake it with a handful of
/// precomputed variants on a slow cycle.
///
/// One clock for the whole app on purpose — when shapes boil out of step the
/// screen looks noisy rather than drawn.
const BoilClock = {
  frameCount: 3,
  fps: 8,
  frame: 0,
  _timer: null,
  _listeners: new Set(),

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.frame = (this.frame + 1) % this.frameCount;
      for (const listener of this._listeners) listener(this.frame);
    }, Math.round(1000 / this.fps));
  },

  stop() {
    clearInterval(this._timer);
    this._timer = null;
  },

  onFrame(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  },
};

/// A shape roughened once per boil frame and kept, because roughening is the
/// expensive half and the frames repeat forever.
class BoiledShape {
  constructor({ path, pen, seed }) {
    this.path = path;
    this.pen = pen;
    this.seed = seed;
    this._frames = new Array(BoilClock.frameCount).fill(null);
  }

  frame(index) {
    const i = ((index % BoilClock.frameCount) + BoilClock.frameCount) % BoilClock.frameCount;
    if (!this._frames[i]) {
      this._frames[i] = this.pen.build(this.path, this.seed + i * 104729);
    }
    return this._frames[i];
  }
}
