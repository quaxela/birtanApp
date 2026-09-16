'use strict';

/// Deterministic 1-D value noise.
///
/// Uses the classic `fract(sin(x) * large)` hash, so a shape wobbles the same
/// way on every machine and in every browser.
class ValueNoise {
  constructor(seed) {
    this.seed = seed;
  }

  _hash(i) {
    const x = Math.sin(i * 12.9898 + this.seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /// Smoothly interpolated noise in -1..1.
  at(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = this._hash(i);
    const b = this._hash(i + 1);
    return (a + (b - a) * u) * 2 - 1;
  }
}

/// A repeatable value in [0, 1) for a seed. The patterns in the background and
/// the per-bubble wobble both want one number, not a whole noise field.
function seededUnit(seed) {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/// A number from a string, so a reminder's id can seed its own drawing and
/// keep the same one across launches.
function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
