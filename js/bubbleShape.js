'use strict';

const stonePen = new SketchPen({ width: 2.8 });
const soapPen = new SketchPen({ width: 1.8, style: new RoughStyle({ roughness: 1.1 }) });
const heartPen = new SketchPen({ width: 2.4 });
const shinePen = new SketchPen({ width: 1.4, passes: 1 });

/// How much wider than its label's circle a heart is drawn.
const heartOversize = 1.16;

/// How much bigger than its label's circle a bubble is in a theme.
///
/// The pile is simulated at this size, so a shape that needs more room than a
/// circle — a heart's lobes and point — doesn't run into its neighbours or
/// through the walls.
function bubbleScale(family) {
  return family === 'ask' ? heartOversize : 1;
}

/// How a bubble `size` across is drawn in a theme. `seed` makes each bubble's
/// wobble its own, and the same from one frame to the next.
function bubbleLook(family, size, seed) {
  switch (family) {
    case 'deniz':
      return {
        outline: new BoiledShape({ path: bubbleOutline(size, size), pen: soapPen, seed }),
        highlight: new BoiledShape({ path: soapShine(size, size), pen: shinePen, seed: seed + 900 }),
        fill: bubbleOutline(size, size),
        labelLift: 0,
      };
    case 'ask':
      return {
        outline: new BoiledShape({ path: heartOutline(size, size), pen: heartPen, seed }),
        highlight: null,
        fill: heartOutline(size, size),
        /// A heart's middle is higher than the middle of its box.
        labelLift: 0.04,
      };
    default:
      return {
        outline: new BoiledShape({ path: stoneOutline(size, size, seed), pen: stonePen, seed }),
        highlight: null,
        fill: null,
        labelLift: 0,
      };
  }
}

/// The same shapes without the pen, for small previews.
function previewOutline(family, size) {
  switch (family) {
    case 'deniz':
      return bubbleOutline(size, size);
    case 'ask':
      return heartOutline(size, size);
    default:
      return stoneOutline(size, size, 7);
  }
}

/// The outline of one reminder: a circle, sized to hold its wrapped label.
function bubbleOutline(w, h) {
  return new SPath().addOval(0, 0, w, h);
}

/// A pebble: round, but not quite. The radius wanders a few percent around the
/// edge, differently for every bubble, and never bulges out of the box.
function stoneOutline(w, h, seed) {
  const wobble = (k) => seededUnit((seed % 100003) + k * 101);

  const most = 0.035 + 0.03 + 0.012;
  const a2 = 0.035 * wobble(1);
  const a3 = 0.03 * wobble(2);
  const a5 = 0.012 * wobble(3);
  const p2 = wobble(4) * TAU;
  const p3 = wobble(5) * TAU;
  const p5 = wobble(6) * TAU;

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 / (1 + most);
  const steps = 72;

  const path = new SPath();
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const r =
      radius *
      (1 + a2 * Math.sin(2 * t + p2) + a3 * Math.sin(3 * t + p3) + a5 * Math.sin(5 * t + p5));
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  return path.close();
}

/// Two glints on a soap bubble: a long one top left, a short one bottom right.
function soapShine(w, h) {
  const r = Math.min(w, h) * 0.36;
  return new SPath()
    .addArc(w / 2, h / 2, r, Math.PI * 1.05, Math.PI * 0.42)
    .addArc(w / 2, h / 2, r, Math.PI * 0.18, Math.PI * 0.14);
}

/// A heart a little wider and taller than its box, so a label sized for a
/// circle still fits between the lobes and the point.
function heartOutline(boxW, boxH) {
  const w = boxW * heartOversize;
  const h = boxH * 1.12;
  const left = (boxW - w) / 2;
  const top = (boxH - h) / 2 + boxH * 0.02;
  const at = (x, y) => ({ x: left + x * w, y: top + y * h });

  const start = at(0.5, 0.26);
  const path = new SPath().moveTo(start.x, start.y);
  const curve = (c1, c2, end) => path.cubicTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);

  curve(at(0.38, 0.02), at(0.0, 0.06), at(0.02, 0.36));
  curve(at(0.04, 0.62), at(0.34, 0.8), at(0.5, 0.98));
  curve(at(0.66, 0.8), at(0.96, 0.62), at(0.98, 0.36));
  curve(at(1.0, 0.06), at(0.62, 0.02), start);
  return path.close();
}
