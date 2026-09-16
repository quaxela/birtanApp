'use strict';

/// Paths, flattened and measured.
///
/// The drawing engine needs two things from a shape: something the browser can
/// fill or stroke, and something that can be walked at a constant speed so the
/// pen can be pushed sideways along it. A Path2D alone gives only the first, so
/// every command is recorded twice — once into a Path2D, once into a polyline.
const TAU = Math.PI * 2;

/// Control-point offset that turns a quarter of a circle into a cubic.
const KAPPA = 0.5522847498307936;

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/// Enough segments to keep the polyline within a pixel or so of the curve,
/// judged by the control polygon — cheap, and always an overestimate.
function cubicSteps(p0, p1, p2, p3) {
  const rough = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  return Math.max(4, Math.min(64, Math.ceil(rough / 3)));
}

class SPath {
  constructor() {
    /// {pts: [{x, y}], closed: bool}
    this.subs = [];
    this.p2d = new Path2D();
    this._cur = null;
    this._last = null;
    this._start = null;
    this._metrics = null;
  }

  moveTo(x, y) {
    this._cur = { pts: [{ x, y }], closed: false };
    this.subs.push(this._cur);
    this.p2d.moveTo(x, y);
    this._last = { x, y };
    this._start = { x, y };
    return this;
  }

  lineTo(x, y) {
    if (!this._cur) return this.moveTo(x, y);
    this._cur.pts.push({ x, y });
    this.p2d.lineTo(x, y);
    this._last = { x, y };
    return this;
  }

  cubicTo(x1, y1, x2, y2, x, y) {
    const p0 = this._last || { x: x1, y: y1 };
    if (!this._cur) this.moveTo(p0.x, p0.y);
    const p1 = { x: x1, y: y1 };
    const p2 = { x: x2, y: y2 };
    const p3 = { x, y };
    const steps = cubicSteps(p0, p1, p2, p3);
    for (let i = 1; i <= steps; i++) {
      this._cur.pts.push(cubicAt(p0, p1, p2, p3, i / steps));
    }
    this.p2d.bezierCurveTo(x1, y1, x2, y2, x, y);
    this._last = p3;
    return this;
  }

  quadTo(cx, cy, x, y) {
    const p0 = this._last || { x: cx, y: cy };
    // A quadratic is a cubic whose controls sit two thirds of the way out.
    return this.cubicTo(
      p0.x + (2 / 3) * (cx - p0.x),
      p0.y + (2 / 3) * (cy - p0.y),
      x + (2 / 3) * (cx - x),
      y + (2 / 3) * (cy - y),
      x,
      y,
    );
  }

  close() {
    if (this._cur) {
      this._cur.closed = true;
      this.p2d.closePath();
      this._last = this._start;
    }
    this._cur = null;
    return this;
  }

  addOval(x, y, w, h) {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    this.moveTo(cx + rx, cy);
    this.cubicTo(cx + rx, cy + ry * KAPPA, cx + rx * KAPPA, cy + ry, cx, cy + ry);
    this.cubicTo(cx - rx * KAPPA, cy + ry, cx - rx, cy + ry * KAPPA, cx - rx, cy);
    this.cubicTo(cx - rx, cy - ry * KAPPA, cx - rx * KAPPA, cy - ry, cx, cy - ry);
    this.cubicTo(cx + rx * KAPPA, cy - ry, cx + rx, cy - ry * KAPPA, cx + rx, cy);
    return this.close();
  }

  addCircle(cx, cy, r) {
    return this.addOval(cx - r, cy - r, r * 2, r * 2);
  }

  addRRect(x, y, w, h, radius) {
    const r = Math.min(radius, Math.min(w, h) / 2);
    const k = r * KAPPA;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.cubicTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.cubicTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.cubicTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    this.lineTo(x, y + r);
    this.cubicTo(x, y + r - k, x + r - k, y, x + r, y);
    return this.close();
  }

  /// An open arc, sampled directly: it is never filled, only walked.
  addArc(cx, cy, r, start, sweep) {
    const steps = Math.max(6, Math.ceil((Math.abs(sweep) / TAU) * 64));
    for (let i = 0; i <= steps; i++) {
      const a = start + (sweep * i) / steps;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) {
        this.moveTo(x, y);
      } else {
        this.lineTo(x, y);
      }
    }
    this._cur = null;
    return this;
  }

  /// Every point moved by the same amount. Used where a shape is built around
  /// the origin and then placed.
  shifted(dx, dy) {
    const out = new SPath();
    for (const sub of this.subs) {
      out.moveTo(sub.pts[0].x + dx, sub.pts[0].y + dy);
      for (let i = 1; i < sub.pts.length; i++) {
        out.lineTo(sub.pts[i].x + dx, sub.pts[i].y + dy);
      }
      if (sub.closed) out.close();
    }
    return out;
  }

  /// Each contour with its length, and a way to ask where a given distance
  /// along it lands and which way the pen is pointing there.
  metrics() {
    if (this._metrics) return this._metrics;
    this._metrics = this.subs
      .map((sub) => {
        const pts = sub.closed ? sub.pts.concat([sub.pts[0]]) : sub.pts;
        const lengths = [0];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += dist(pts[i - 1], pts[i]);
          lengths.push(total);
        }
        return {
          closed: sub.closed,
          length: total,
          at(d) {
            const target = Math.max(0, Math.min(d, total));
            let i = 1;
            while (i < lengths.length - 1 && lengths[i] < target) i++;
            const span = lengths[i] - lengths[i - 1] || 1;
            const t = (target - lengths[i - 1]) / span;
            const a = pts[i - 1];
            const b = pts[i];
            const len = dist(a, b) || 1;
            return {
              x: a.x + (b.x - a.x) * t,
              y: a.y + (b.y - a.y) * t,
              tx: (b.x - a.x) / len,
              ty: (b.y - a.y) / len,
            };
          },
        };
      })
      .filter((m) => m.length > 0);
    return this._metrics;
  }
}
