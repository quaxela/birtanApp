'use strict';

const framePen = new SketchPen({
  width: 4.2,
  style: new RoughStyle({ roughness: 1.3, wavelength: 160, overshoot: 0 }),
});
const facePen = new SketchPen({
  width: 3.2,
  passes: 1,
  style: new RoughStyle({ roughness: 0.8 }),
});

/// Where the head goes and where the sheet ends, for a page of a given size.
///
/// The drawing and the page layout both read this, so the floor the bubbles
/// land on is always the line drawn under them.
class HeadFrameLayout {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    /// Across the top of the head, where the frame line runs into it.
    this.headWidth = clamp(w * 0.34, 110, 180);
    /// The height of the frame's bottom line, which is the sheet's floor.
    /// A short window still keeps most of itself for the bubbles.
    this.floor = Math.max(h - this.headWidth * 1.15, h * 0.5);
  }

  get centre() {
    return this.width / 2;
  }

  /// The room under the floor that the head takes up.
  get below() {
    return this.height - this.floor;
  }
}

/// How far the drawn sides sit in from the edges of the screen.
HeadFrameLayout.inset = 10;

/// The frame's left side and bottom, running on into the left of the head —
/// one line, the way it would be drawn without lifting the pen.
function frameLeft(w, h) {
  return frameSide(new HeadFrameLayout(w, h), false);
}

function frameRight(w, h) {
  return frameSide(new HeadFrameLayout(w, h), true);
}

function frameSide(layout, mirrored) {
  const x = (fromLeft) => (mirrored ? layout.width - fromLeft : fromLeft);

  const edge = HeadFrameLayout.inset;
  const hw = layout.headWidth;
  const f = layout.floor;
  const below = layout.below;
  // Where the head's side meets the frame, counted from the nearer edge.
  const join = layout.centre - hw / 2;
  const run = join - edge;

  return new SPath()
    .moveTo(x(edge), -8)
    .lineTo(x(edge), f - 6)
    // The bottom line wanders a little on its way to the head.
    .quadTo(x(edge + run * 0.3), f + 5, x(edge + run * 0.6), f)
    .quadTo(x(edge + run * 0.85), f - 4, x(join), f + 2)
    // Down the side of the head to the ear.
    .lineTo(x(join + hw * 0.02), f + below * 0.22)
    // The ear: out in a loop and back.
    .cubicTo(
      x(join - hw * 0.16), f + below * 0.18,
      x(join - hw * 0.18), f + below * 0.42,
      x(join + hw * 0.04), f + below * 0.4,
    )
    // Jaw and neck, narrowing to where the shoulders begin.
    .cubicTo(
      x(join + hw * 0.06), f + below * 0.55,
      x(join + hw * 0.14), f + below * 0.68,
      x(join + hw * 0.24), f + below * 0.76,
    );
}

/// Shoulders, running off the bottom of the screen.
function headShoulders(w, h) {
  const layout = new HeadFrameLayout(w, h);
  const c = layout.centre;
  const hw = layout.headWidth;
  const f = layout.floor;
  const below = layout.below;
  const bottom = h + 6;

  return new SPath()
    .moveTo(c - hw * 0.95, bottom)
    .cubicTo(
      c - hw * 0.9, f + below * 0.86,
      c - hw * 0.5, f + below * 0.82,
      c - hw * 0.22, f + below * 0.84,
    )
    .moveTo(c + hw * 0.22, f + below * 0.84)
    .cubicTo(
      c + hw * 0.5, f + below * 0.82,
      c + hw * 0.9, f + below * 0.86,
      c + hw * 0.95, bottom,
    );
}

/// Two dots for eyes, a hooked nose and a flat little mouth.
function headFace(w, h) {
  const layout = new HeadFrameLayout(w, h);
  const c = layout.centre;
  const hw = layout.headWidth;
  const f = layout.floor;
  const below = layout.below;
  const eyeY = f + below * 0.22;
  const eye = hw * 0.025;

  return new SPath()
    .addCircle(c - hw * 0.2, eyeY, eye)
    .addCircle(c + hw * 0.22, eyeY + below * 0.02, eye)
    .moveTo(c + hw * 0.01, f + below * 0.28)
    .quadTo(c - hw * 0.01, f + below * 0.36, c + hw * 0.03, f + below * 0.4)
    .lineTo(c + hw * 0.07, f + below * 0.39)
    .moveTo(c - hw * 0.07, f + below * 0.52)
    .lineTo(c + hw * 0.06, f + below * 0.52);
}

/// The frame around the sheet and the head it comes out of, drawn by the same
/// hand as the bubbles. Roughening it is expensive and the page only changes
/// size when the window does, so the shapes are kept until then.
class HeadFrameDrawing {
  constructor() {
    this._for = null;
    this._shapes = [];
  }

  _ensure(w, h) {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (this._for === key) return;
    this._for = key;
    this._shapes = [
      new BoiledShape({ path: frameLeft(w, h), pen: framePen, seed: 2718 }),
      new BoiledShape({ path: frameRight(w, h), pen: framePen, seed: 2729 }),
      new BoiledShape({ path: headShoulders(w, h), pen: framePen, seed: 2741 }),
      new BoiledShape({ path: headFace(w, h), pen: facePen, seed: 2755 }),
    ];
  }

  paint(ctx, w, h, theme, frame) {
    this._ensure(w, h);
    for (const shape of this._shapes) {
      SketchPen.paint(ctx, shape.frame(frame), theme.ink);
    }
  }
}
