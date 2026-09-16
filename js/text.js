'use strict';

/// The handwriting, and how much of it fits where.
const labelFontSize = 28;

function handFont(size, family = 'Caveat') {
  return `${size}px ${family}, cursive`;
}

/// One canvas kept aside for measuring. Laying text out is the only thing the
/// sheet needs a measurement for, and making a context per call is wasteful.
const measureCtx = document.createElement('canvas').getContext('2d');

function measureText(text, font) {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/// Breaks `text` at spaces so no line runs past `maxWidth`. A word longer than
/// the limit is left alone rather than cut in half — "İzmir bileti / ni al"
/// looks like a rendering fault rather than a design.
function wrapLines(text, maxWidth, font) {
  const words = text.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [''];

  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`;
    if (measureText(candidate, font) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

/// The width of the longest word: laying out narrower than this only breaks
/// words down the middle.
function longestWordWidth(text, font) {
  return Math.max(
    ...text.split(/\s+/).filter((w) => w !== '').map((word) => measureText(word, font)),
    0,
  );
}

/// Diameter of the circle that contains the laid-out text, plus a margin that
/// scales with the type — a fixed 30px ring looks generous at small sizes and
/// mean at full size.
function circleAroundText(width, height, fontSize) {
  return Math.hypot(width, height) + 30 * (fontSize / labelFontSize);
}

/// Picks the line width that needs the smallest circle around it.
///
/// A circle is a hostile container for text: set the label on one line and the
/// circle has to be as wide as the sentence, but wrap it too narrow and the
/// stack of lines makes it as tall. The cheapest way to find the balance is to
/// lay the text out at a handful of widths and keep the best.
function fitCircle(label, limit, fontSize) {
  const font = handFont(fontSize);
  const oneLine = measureText(label, font);
  const narrowest = longestWordWidth(label, font);

  // The unwrapped line is always a candidate, and the baseline to beat.
  let best = circleAroundText(oneLine, fontSize, fontSize);
  let bestLines = [label];

  for (let step = 3; step <= 7; step++) {
    const width = Math.max((oneLine * step) / 8, narrowest);
    const lines = wrapLines(label, width, font);
    const laidOut = Math.max(...lines.map((line) => measureText(line, font)));
    const needed = circleAroundText(laidOut, lines.length * fontSize, fontSize);
    if (needed < best) {
      best = needed;
      bestLines = lines;
    }
  }

  return {
    lines: bestLines,
    fontSize,
    diameter: Math.min(Math.max(best, 84 * (fontSize / labelFontSize)), limit),
  };
}

/// Draws a fitted label centred on the origin.
function paintLines(ctx, lines, fontSize, colour, opacity = 1) {
  ctx.save();
  ctx.font = handFont(fontSize);
  ctx.fillStyle = rgba(colour, opacity);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = (-(lines.length - 1) * fontSize) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, top + i * fontSize);
  }
  ctx.restore();
}
