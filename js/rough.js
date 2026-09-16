'use strict';

/// How hard the imaginary hand shakes.
class RoughStyle {
  constructor({
    roughness = 1.6,
    tremor = 0.4,
    wavelength = 90,
    tremorWavelength = 13,
    overshoot = 15,
    sampleStep = 5,
  } = {}) {
    this.roughness = roughness;
    this.tremor = tremor;
    this.wavelength = wavelength;
    this.tremorWavelength = tremorWavelength;
    this.overshoot = overshoot;
    this.sampleStep = sampleStep;
  }

  copyWith(changes) {
    return new RoughStyle({ ...this, ...changes });
  }
}

/// Walks `path` and pushes every sample sideways by seeded noise, so the
/// result reads as a line drawn by hand rather than computed.
///
/// Closed contours are deliberately left open: the pen carries `overshoot`
/// pixels past its own starting point and the drift there no longer matches,
/// which is exactly what a hand-drawn circle does at the seam.
function roughenPath(path, style, seed) {
  const drift = new ValueNoise(seed);
  const shake = new ValueNoise(seed * 31 + 17);
  const strokes = [];

  for (const metric of path.metrics()) {
    const length = metric.length;
    if (length < style.sampleStep) continue;

    const end = metric.closed ? length + style.overshoot : length;
    const points = [];

    for (let d = 0; d <= end; d += style.sampleStep) {
      const on = metric.at(Math.min(d % length, length));
      // Noise is fed the unwrapped distance, so the overshoot tail drifts away
      // from where the line began instead of retracing it.
      const deviation =
        drift.at(d / style.wavelength) * style.roughness +
        shake.at(d / style.tremorWavelength) * style.tremor;
      points.push({
        x: on.x - on.ty * deviation,
        y: on.y + on.tx * deviation,
      });
    }

    if (points.length >= 2) strokes.push(points);
  }

  return strokes;
}

/// A Catmull-Rom spline through `pts`, so the samples read as one flowing line
/// instead of a chain of segments.
function appendSmooth(path, pts, startNewSubpath) {
  if (pts.length < 2) return;

  if (startNewSubpath) {
    path.moveTo(pts[0].x, pts[0].y);
  } else {
    path.lineTo(pts[0].x, pts[0].y);
  }

  if (pts.length === 2) {
    path.lineTo(pts[1].x, pts[1].y);
    return;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    path.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

function smoothPath(pts) {
  const path = new Path2D();
  appendSmooth(path, pts, true);
  return path;
}

/// Builds a closed outline around `centre` whose thickness varies along its
/// length, then fills it. A uniform line width is the single loudest tell that
/// a line came from a computer; a real nib loads up in the middle of a stroke
/// and lifts at both ends.
function ribbon(centre, { width, seed = 0, taper = 0.22, pressure = 0.34 }) {
  if (centre.length < 2) return new Path2D();

  const noise = new ValueNoise(seed * 7 + 3);
  const left = [];
  const right = [];
  const last = centre.length - 1;

  for (let i = 0; i <= last; i++) {
    const prev = centre[Math.max(i - 1, 0)];
    const next = centre[Math.min(i + 1, last)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const t = i / last;
    // Lift the pen at both ends, and let the pressure wander in between.
    const ends = Math.min(Math.min(t, 1 - t) / taper, 1);
    const lift = 0.12 + 0.88 * Math.sin((ends * Math.PI) / 2);
    const wander = 1 + noise.at(t * 3.3) * pressure;
    const half = width * 0.5 * lift * wander;

    left.push({ x: centre[i].x - (dy / len) * half, y: centre[i].y + (dx / len) * half });
    right.push({ x: centre[i].x + (dy / len) * half, y: centre[i].y - (dx / len) * half });
  }

  if (left.length < 2) return new Path2D();

  const path = new Path2D();
  appendSmooth(path, left, true);
  appendSmooth(path, right.reverse(), false);
  path.closePath();
  return path;
}
