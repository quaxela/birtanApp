'use strict';

/// How often a reminder comes back.
const repeats = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

/// How each repeat reads on the edit panel.
const repeatNames = {
  none: 'tekrar yok',
  daily: 'her gün',
  weekly: 'her hafta',
  monthly: 'her ay',
  yearly: 'her yıl',
};

/// The time of day a reminder is due when nothing else is said. Reminders are
/// made in a hurry, from one line of text; the hour is something you go back
/// and change on the ones that need it.
const defaultTime = '09:00';

/// The zone the browser is in, which is the zone a reminder's hour is meant in
/// — 09:00 is nine o'clock where the user is, not in UTC.
function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    return 'UTC';
  }
}

/// One reminder, and the days it falls on.
///
/// A repeating reminder is stored once rather than copied onto every day: its
/// days are worked out from `start` and `repeat`, which is what lets one edit
/// reach every occurrence at once.
class Reminder {
  constructor({ id, label, start, time = defaultTime, zone = null, repeat = 'none', done = [] }) {
    this.id = id;
    this.label = label;
    /// "09:00" — when the notification for one of its days goes out. The sheet
    /// itself has no clock; this is only ever read by the reminding.
    this.time = time;
    /// The zone that hour is meant in, kept per reminder: one made in Istanbul
    /// should still go off at nine Istanbul time when read abroad.
    this.zone = zone ?? localZone();
    /// The day it was put on. For a repeating reminder, the first of its days
    /// and the one the rest are measured from.
    this.start = start;
    this.repeat = repeat;
    /// Days a repeating reminder was popped on, as ISO strings. Popping one
    /// clears only that day; a one-off is deleted outright instead.
    this.done = new Set(done);
  }

  /// Whether it is on the page for `day`, which must be a bare date.
  occursOn(day) {
    if (day < this.start || this.done.has(isoDay(day))) return false;
    switch (this.repeat) {
      case 'daily':
        return true;
      case 'weekly':
        return weekdayOf(day) === weekdayOf(this.start);
      case 'monthly':
        return day.getDate() === this._dayOfMonthIn(day);
      case 'yearly':
        return day.getMonth() === this.start.getMonth() && day.getDate() === this._dayOfMonthIn(day);
      default:
        return isoDay(day) === isoDay(this.start);
    }
  }

  /// `start`'s day of the month, in `day`'s month — moved back to the last day
  /// where the month is too short, so the 31st falls on the 30th and
  /// 29 February on the 28th outside leap years.
  _dayOfMonthIn(day) {
    return Math.min(this.start.getDate(), daysInMonth(day));
  }

  copyWith(changes) {
    return new Reminder({
      id: this.id,
      label: this.label,
      start: this.start,
      time: this.time,
      zone: this.zone,
      repeat: this.repeat,
      done: [...this.done],
      ...changes,
    });
  }

  toJson() {
    const json = {
      id: this.id,
      label: this.label,
      start: isoDay(this.start),
      time: this.time,
      zone: this.zone,
      repeat: this.repeat,
    };
    if (this.done.size > 0) json.done = [...this.done].sort();
    return json;
  }

  /// Reads one back, or null if the record isn't one: a save cut short loses
  /// that reminder rather than the whole sheet.
  static fromJson(json) {
    if (!json || typeof json !== 'object') return null;
    const start = typeof json.start === 'string' ? parseIsoDay(json.start) : null;
    if (typeof json.id !== 'string' || typeof json.label !== 'string' || !start) return null;
    if (json.label.trim() === '') return null;

    return new Reminder({
      id: json.id,
      label: json.label,
      start,
      // Records written before reminders had an hour read back at the default
      // one rather than being thrown away.
      time: isClockTime(json.time) ? json.time : defaultTime,
      zone: typeof json.zone === 'string' && json.zone !== '' ? json.zone : localZone(),
      repeat: repeats.includes(json.repeat) ? json.repeat : 'none',
      done: Array.isArray(json.done) ? json.done.filter((d) => typeof d === 'string') : [],
    });
  }
}

/// "09:00", and nothing else. A time input can be cleared, and a reminder with
/// an empty hour would be scheduled for nowhere.
function isClockTime(text) {
  return typeof text === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}
