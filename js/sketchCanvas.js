'use strict';

/// Hand-drawn marks behind ordinary page elements — the ring round a chosen
/// word, the box round the mode switch, the pill round the text field.
///
/// The mark is drawn on a canvas laid behind the element and sized to it, so
/// the text stays real text: selectable, resizable, and laid out by the
/// browser. The canvas is bigger than the element on every side because a ring
/// is drawn outside what it circles, and a canvas clips.
const sketchPad = 36;

const decorations = new Set();

class SketchDecoration {
  /// `layers` are {shape, pen, colour, seedOffset}, where `shape` takes the
  /// element's size and `colour` is looked up at paint time — fading a mark
  /// out must not make it worth roughening again.
  constructor(element, layers, seed) {
    this.element = element;
    this.layers = layers;
    this.seed = seed;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sketch-layer';
    this.ctx = this.canvas.getContext('2d');
    this._for = null;
    this._shapes = [];
    this.visible = true;

    element.classList.add('sketched');
    element.prepend(this.canvas);
    decorations.add(this);
    this.draw();
  }

  remove() {
    decorations.delete(this);
    this.canvas.remove();
  }

  draw() {
    const w = this.element.offsetWidth;
    const h = this.element.offsetHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const fullW = w + sketchPad * 2;
    const fullH = h + sketchPad * 2;
    const key = `${w}x${h}@${dpr}`;
    if (this._for !== key) {
      this._for = key;
      this.canvas.width = Math.ceil(fullW * dpr);
      this.canvas.height = Math.ceil(fullH * dpr);
      this.canvas.style.width = `${fullW}px`;
      this.canvas.style.height = `${fullH}px`;
      this._shapes = this.layers.map(
        (layer) =>
          new BoiledShape({
            path: layer.shape(w, h),
            pen: layer.pen,
            seed: this.seed + (layer.seedOffset ?? 0),
          }),
      );
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fullW, fullH);
    if (!this.visible) return;
    ctx.save();
    ctx.translate(sketchPad, sketchPad);
    for (let i = 0; i < this._shapes.length; i++) {
      SketchPen.paint(ctx, this._shapes[i].frame(BoilClock.frame), this.layers[i].colour());
    }
    ctx.restore();
  }
}

function redrawDecorations() {
  for (const decoration of decorations) decoration.draw();
}
