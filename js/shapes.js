'use strict';

/// Marks that get drawn around other parts of the page. Shared so the sheet,
/// the calendar and the settings page all circle a word the same way.

/// A loose ring, the way you'd circle the option you meant.
function circleAround(w, h) {
  return new SPath().addOval(-6, -3, w + 12, h + 6);
}

/// A wider ring for a single character or number.
function ringAround(w, h) {
  return new SPath().addOval(-(h * 0.42), -(h * 0.22), w + h * 0.84, h * 1.44);
}

/// A box round a whole control. Two bare words read as a label; the enclosure
/// is what says "this is a thing you touch".
function modeFrame(w, h) {
  return new SPath().addRRect(-16, -9, w + 32, h + 18, 26);
}

/// The outline of a text field styled as one long bubble.
function composerPill(w, h) {
  return new SPath().addRRect(0, 0, w, h, h / 2);
}

/// The outline of a panel risen over the sheet.
function panelOutline(w, h) {
  return new SPath().addRRect(0, 0, w, h, 26);
}

/// A cog, for the way to settings.
function cog(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.72;
  const teeth = 8;

  const path = new SPath();
  for (let i = 0; i < teeth * 4; i++) {
    const angle = (i / (teeth * 4)) * TAU;
    const r = i % 4 < 2 ? outer : inner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  path.close();
  return path.addCircle(cx, cy, outer * 0.32);
}
