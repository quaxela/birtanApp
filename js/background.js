'use strict';

/// The printed page behind everything, in the current theme's pattern.
///
/// Printed, not drawn: the squares, bubbles and hearts are perfectly regular on
/// purpose. The pen is what wobbles. Roughening the paper as well would make
/// the whole screen uniformly noisy and flatten the hand-drawn quality out of
/// existence.
///
/// `scale` shrinks the pattern for the small swatches on the settings page —
/// the squares have to read as squares, not as a smudge.
function paintThemeBackground(ctx, w, h, theme, scale = 1) {
  ctx.fillStyle = rgba(theme.paper);
  ctx.fillRect(0, 0, w, h);

  switch (theme.family) {
    case 'deniz':
      paintSea(ctx, w, h, theme, scale);
      break;
    case 'ask':
      paintHearts(ctx, w, h, theme, scale);
      break;
    default:
      paintSquares(ctx, w, h, theme, 24 * scale);
  }
}

function paintSquares(ctx, w, h, theme, step) {
  ctx.save();
  ctx.strokeStyle = rgba(theme.grid);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/// Water, a shade deeper towards the bottom, with bubbles rising through it.
function paintSea(ctx, w, h, theme, scale) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, rgba(theme.paper));
  gradient.addColorStop(1, rgba(mix(theme.paper, theme.grid, 0.6)));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = rgba(theme.grid);
  ctx.lineWidth = 1.4 * scale;
  scatter(w, h, 58 * scale, (row, col, x, y) => {
    const radius = (3 + 9 * seededUnit(row * 5 + col * 11)) * scale;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.stroke();
    if (radius > 8 * scale) {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.6, Math.PI * 1.1, Math.PI * 1.55);
      ctx.stroke();
    }
  });
  ctx.restore();
}

/// Small hearts, each leaning its own way.
function paintHearts(ctx, w, h, theme, scale) {
  ctx.save();
  ctx.fillStyle = rgba(theme.grid);
  scatter(w, h, 52 * scale, (row, col, x, y) => {
    const half = (6 + 5 * seededUnit(row * 5 + col * 11)) * scale;
    const heart = heartOutline(half * 2, half * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((seededUnit(row * 19 + col * 23) - 0.5) * 0.7);
    ctx.translate(-half, -half);
    ctx.fill(heart.p2d);
    ctx.restore();
  });
  ctx.restore();
}

/// Visits a loose lattice of spots, skipping some and nudging the rest, so the
/// pattern reads as scattered but never clumps or leaves holes.
function scatter(w, h, cell, at) {
  for (let row = 0; row * cell < h + cell; row++) {
    for (let col = 0; col * cell < w + cell; col++) {
      if (seededUnit(row * 31 + col * 7) < 0.35) continue;
      const shift = row % 2 === 1 ? 0.5 : 0;
      at(
        row,
        col,
        (col + shift + (seededUnit(row * 13 + col * 29) - 0.5) * 0.6) * cell,
        (row + (seededUnit(row * 17 + col * 3) - 0.5) * 0.6) * cell,
      );
    }
  }
}
