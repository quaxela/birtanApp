'use strict';

const todaysSeed = ['su iç', 'diş hekimini ara', '10 dk yürü', 'çöpü çıkar', 'İzmir biletini al'];

/// Every day its own page, and the reminders that fall on them.
///
/// Reminders live here, once each; a day's page is worked out from them. Each
/// day keeps a separate SheetController, so the pile you left on Tuesday is
/// still arranged the same way when you come back to it. Only the visible day
/// is ticked; the others are frozen exactly where they settled.
class SheetBook {
  constructor({ now = new Date(), sample = todaysSeed, onChange = () => {} } = {}) {
    /// The real calendar day, fixed when the app started.
    this.today = dayOf(now);
    this.selected = this.today;
    this.onChange = onChange;

    this._sample = sample;
    this._reminders = [];
    this._days = new Map();
    this._made = 0;
  }

  get reminders() {
    return this._reminders;
  }

  reminder(id) {
    return this._reminders.find((r) => r.id === id) ?? null;
  }

  /// What falls on a day, the way a sheet wants it.
  notesOn(day) {
    return this._reminders
      .filter((reminder) => reminder.occursOn(dayOf(day)))
      .map((reminder) => ({ id: reminder.id, label: reminder.label }));
  }

  /// Reads back what was saved. Called once at startup, before the first frame
  /// that matters.
  restore() {
    const saved = ReminderStore.load();
    this._reminders = [];
    if (saved === null) {
      // Only storage that has never been written gets the sample. A sheet the
      // user emptied comes back empty.
      this._reminders = this._sample.map(
        (label) => new Reminder({ id: this._newId(), label, start: this.today }),
      );
      ReminderStore.save(this._reminders);
    } else {
      this._reminders = saved;
    }
    this._syncOpenDays();
    Sync.changed(this._reminders);
    this.onChange();
  }

  /// Unique across launches, since reminders outlive the run that made them.
  _newId() {
    return `r${Date.now().toString(36)}${this._made++}`;
  }

  /// Adding and popping go through the book rather than the controller, so a
  /// change can never reach the screen without also reaching storage.
  add(label, { atX = null } = {}) {
    const text = label.trim();
    if (text === '') return;
    const reminder = new Reminder({ id: this._newId(), label: text, start: this.selected });
    this._reminders.push(reminder);
    this.current.add(text, { id: reminder.id, atX });
    this._save();
    this.onChange();
  }

  /// Pops whatever is under a point on the page being shown.
  popAt(x, y) {
    const item = this.current.itemAt(x, y);
    return item !== null && this.pop(item.reminderId);
  }

  /// Done with a reminder on the page being shown. A one-off goes for good; a
  /// repeating one only for this day, and is back on its next.
  pop(id) {
    const index = this._reminders.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const reminder = this._reminders[index];
    if (reminder.repeat === 'none') {
      this._reminders.splice(index, 1);
    } else {
      this._reminders[index] = reminder.copyWith({
        done: [...reminder.done, isoDay(this.selected)],
      });
    }
    this.current.popById(id);
    this._save();
    this.onChange();
    return true;
  }

  /// Changes what a reminder says and how often it comes back, on every day it
  /// falls on.
  ///
  /// A changed repeat is measured from the page being shown, so the bubble
  /// being edited stays where it is: a daily reminder switched to weekly on a
  /// Wednesday becomes a Wednesday one.
  edit(id, { label, repeat, time }) {
    const index = this._reminders.findIndex((r) => r.id === id);
    const text = label.trim();
    if (index === -1 || text === '') return;

    const before = this._reminders[index];
    this._reminders[index] = before.copyWith({
      label: text,
      repeat,
      time: time ?? before.time,
      start: repeat === before.repeat ? before.start : this.selected,
    });
    this._syncOpenDays();
    this._save();
    this.onChange();
  }

  /// Takes a reminder off every day it falls on, without the pop.
  delete(id) {
    const index = this._reminders.findIndex((r) => r.id === id);
    if (index === -1) return;
    this._reminders.splice(index, 1);
    this._syncOpenDays();
    this._save();
    this.onChange();
  }

  _syncOpenDays() {
    for (const [key, sheet] of this._days) {
      sheet.syncWith(this.notesOn(parseIsoDay(key)));
    }
  }

  _save() {
    ReminderStore.save(this._reminders);
    // Storage first, then anywhere else it has to go: a reminder that reached
    // the server but not this device would come back on the next launch.
    Sync.changed(this._reminders);
  }

  get onToday() {
    return isoDay(this.selected) === isoDay(this.today);
  }

  get current() {
    return this.controllerFor(this.selected);
  }

  controllerFor(day) {
    const key = isoDay(dayOf(day));
    if (!this._days.has(key)) {
      this._days.set(key, new SheetController(this.notesOn(dayOf(day))));
    }
    return this._days.get(key);
  }

  /// Whether a day has anything on it — used to mark the calendar. Repeats
  /// count, so a daily reminder marks every day from its first.
  hasAnything(day) {
    const date = dayOf(day);
    return this._reminders.some((reminder) => reminder.occursOn(date));
  }

  select(day) {
    const next = dayOf(day);
    if (isoDay(next) === isoDay(this.selected)) return;
    this.selected = next;
    this.controllerFor(next);
    this.onChange();
  }

  step(days) {
    this.select(addDays(this.selected, days));
  }

  goToToday() {
    this.select(this.today);
  }
}
