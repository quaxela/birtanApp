'use strict';

/// Draws a clean path the way a felt-tip pen would: roughened, and gone over
/// more than once. The second pass is what sells it — nobody draws a shape in a
/// single confident stroke, and the slight doubling reads as hand pressure.
class SketchPen {
  constructor({ width = 2.4, passes = 2, variableWidth = true, style = new RoughStyle() } = {}) {
    this.width = width;
    this.passes = passes;
    this.variableWidth = variableWidth;
    this.style = style;
  }

  /// The expensive half: roughening and spline building. Cache the result.
  build(source, seed) {
    const out = [];

    for (let pass = 0; pass < this.passes; pass++) {
      const passSeed = seed + pass * 7919;
      // Later passes wander a little more, as if retracing by eye.
      const style =
        pass === 0 ? this.style : this.style.copyWith({ roughness: this.style.roughness * 1.25 });
      const width = this.width * (SketchPen.passWidth[pass] ?? SketchPen.passWidth.at(-1));
      const opacity = SketchPen.passOpacity[pass] ?? SketchPen.passOpacity.at(-1);

      for (const points of roughenPath(source, style, passSeed)) {
        if (this.variableWidth) {
          out.push({
            path: ribbon(points, { width, seed: passSeed }),
            filled: true,
            opacity,
          });
        } else {
          out.push({
            path: smoothPath(points),
            filled: false,
            strokeWidth: width,
            opacity,
          });
        }
      }
    }

    return out;
  }

  /// The cheap half: run this every frame.
  static paint(ctx, strokes, color, opacity = 1) {
    for (const stroke of strokes) {
      ctx.save();
      if (stroke.filled) {
        ctx.fillStyle = rgba(color, stroke.opacity * opacity);
        ctx.fill(stroke.path);
      } else {
        ctx.strokeStyle = rgba(color, stroke.opacity * opacity);
        ctx.lineWidth = stroke.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(stroke.path);
      }
      ctx.restore();
    }
  }
}

SketchPen.passWidth = [1.0, 0.72, 0.55];
SketchPen.passOpacity = [1.0, 0.5, 0.3];
