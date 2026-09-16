'use strict';

/// Turkish date names.
///
/// Hardcoded rather than pulled from a locale library: the prototype ships in
/// one language, and a table of twelve strings is cheaper and clearer.
const monthNames = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const weekdayNames = [
  'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
];

/// Monday first, matching how a Turkish calendar is laid out.
const weekdayInitials = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

/// Monday is 1 and Sunday 7, where JavaScript counts Sunday as 0.
function weekdayOf(day) {
  return ((day.getDay() + 6) % 7) + 1;
}

function monthOf(day) {
  return monthNames[day.getMonth()];
}

function weekdayNameOf(day) {
  return weekdayNames[weekdayOf(day) - 1];
}

/// "14 Eylül, Pazartesi"
function longDate(day) {
  return `${day.getDate()} ${monthOf(day)}, ${weekdayNameOf(day)}`;
}

/// Days in the month `day` falls in. Day zero of the next month is the last
/// day of this one.
function daysInMonth(day) {
  return new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
}

/// How many blank cells come before the 1st, with weeks starting on Monday.
function leadingBlanks(month) {
  return weekdayOf(new Date(month.getFullYear(), month.getMonth(), 1)) - 1;
}

/// Strips the time so a day can be compared and keyed by date alone.
function dayOf(t) {
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/// Whole days, built through the constructor rather than by adding hours:
/// across a daylight-saving boundary a "day" is 23 or 25 hours.
function addDays(day, days) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/// "2026-09-14". Calendar days only; nothing in this app has a time.
function isoDay(day) {
  const pad = (n, width) => String(n).padStart(width, '0');
  return `${pad(day.getFullYear(), 4)}-${pad(day.getMonth() + 1, 2)}-${pad(day.getDate(), 2)}`;
}

function parseIsoDay(text) {
  const parts = String(text).split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
