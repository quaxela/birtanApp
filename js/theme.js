'use strict';

/// Every colour the app draws with, as {r, g, b, a}.
function colour(hex, alpha = 1) {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
    a: alpha,
  };
}

function rgba(c, mul = 1) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a * mul})`;
}

/// Mixes two colours, for the water that deepens towards the bottom.
function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: a.a + (b.a - a.a) * t,
  };
}

/// The looks the app can take. Each comes as a day and a night.
const families = ['defter', 'deniz', 'ask'];

/// How each theme is called on the settings page.
const familyNames = { defter: 'defter', deniz: 'deniz', ask: 'aşk' };

const appearances = ['auto', 'day', 'night'];
const appearanceNames = { auto: 'otomatik', day: 'gündüz', night: 'gece' };

/// paper: the page itself. ink: the pen — everything drawn by hand uses this.
/// faintInk: secondary marks. grid: the printed pattern, deliberately quiet.
/// hint: placeholder text. bubbleFill: inside a bubble, where the theme tints
/// them; clear in the notebook, where a bubble is only ink.
const themes = {
  /// Squared exercise book: warm paper, faint blue rules, dark blue ballpoint.
  defter_day: {
    family: 'defter',
    name: 'gündüz',
    paper: colour(0xfcfaf4),
    ink: colour(0x23355e),
    faintInk: colour(0x8a93a5),
    grid: colour(0xdde4ee),
    hint: colour(0xb6becb),
    bubbleFill: colour(0x000000, 0),
    dark: false,
  },
  /// The same book after dark: chalk on slate.
  defter_night: {
    family: 'defter',
    name: 'gece',
    paper: colour(0x171a20),
    ink: colour(0xe8eaf0),
    faintInk: colour(0x7e8694),
    grid: colour(0x242932),
    hint: colour(0x4e5563),
    bubbleFill: colour(0x000000, 0),
    dark: true,
  },
  /// Shallow water in the sun: pale aqua, sea-blue ink, soap bubbles.
  deniz_day: {
    family: 'deniz',
    name: 'gündüz',
    paper: colour(0xe6f4f8),
    ink: colour(0x14506a),
    faintInk: colour(0x5f8c9d),
    grid: colour(0xbfe1ea),
    hint: colour(0x9cc3cf),
    bubbleFill: colour(0x7fd3e6, 0.18),
    dark: false,
  },
  /// The same sea at night: deep navy and moonlit foam.
  deniz_night: {
    family: 'deniz',
    name: 'gece',
    paper: colour(0x0b2230),
    ink: colour(0xd7f3fa),
    faintInk: colour(0x6e97a6),
    grid: colour(0x16384a),
    hint: colour(0x3f6474),
    bubbleFill: colour(0x90d8ea, 0.15),
    dark: true,
  },
  /// A love letter: blush paper, raspberry ink, hearts.
  ask_day: {
    family: 'ask',
    name: 'gündüz',
    paper: colour(0xfff1f3),
    ink: colour(0x9e2a48),
    faintInk: colour(0xb9748a),
    grid: colour(0xf7d3db),
    hint: colour(0xe3afbc),
    bubbleFill: colour(0xe86a8a, 0.12),
    dark: false,
  },
  /// By candlelight: deep wine and pink.
  ask_night: {
    family: 'ask',
    name: 'gece',
    paper: colour(0x2a1119),
    ink: colour(0xffd9e1),
    faintInk: colour(0xb27d8b),
    grid: colour(0x45202c),
    hint: colour(0x6e3c4a),
    bubbleFill: colour(0xff8fab, 0.14),
    dark: true,
  },
};

function themeOf(family, dark) {
  return themes[`${family}_${dark ? 'night' : 'day'}`] ?? themes.defter_day;
}

/// The choices made on the settings page.
const Settings = {
  defaults: { family: 'defter', appearance: 'auto' },

  /// The theme to draw with, given whether the browser itself is dark.
  themeFor(settings, systemDark) {
    const dark =
      settings.appearance === 'auto' ? systemDark : settings.appearance === 'night';
    return themeOf(settings.family, dark);
  },

  /// Reads settings back, keeping the default for anything missing or unknown
  /// — a theme removed in a later version must not stop the app opening.
  fromJson(json) {
    if (!json || typeof json !== 'object') return { ...Settings.defaults };
    return {
      family: families.includes(json.theme) ? json.theme : 'defter',
      appearance: appearances.includes(json.appearance) ? json.appearance : 'auto',
    };
  },

  toJson(settings) {
    return { theme: settings.family, appearance: settings.appearance };
  },
};
