'use strict';

/// The small amount of storage this app needs, in the browser's own.
///
/// Wrapped rather than used directly because local storage can throw outright
/// — a private window, or a browser told to keep no site data — and a reminder
/// that cannot be saved is still worth showing.
const KeyValue = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },

  write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Poplet could not save:', error);
    }
  },
};

/// Reminders on disk: every reminder, in one JSON list.
///
/// One list rather than a record per day because of repeats — a daily reminder
/// would otherwise have to be written onto every day it will ever fall on.
const ReminderStore = {
  key: 'poplet.reminders',

  /// Every reminder, or null if nothing has ever been saved — which is not the
  /// same as a sheet the user emptied, and only the first gets the sample.
  load() {
    const raw = KeyValue.read(ReminderStore.key);
    if (raw === null) return null;
    return decodeList(raw)
      .map((entry) => Reminder.fromJson(entry))
      .filter((reminder) => reminder !== null);
  },

  save(reminders) {
    KeyValue.write(ReminderStore.key, JSON.stringify(reminders.map((r) => r.toJson())));
  },
};

/// The settings page's choices, kept in the same place as the reminders.
const SettingsStore = {
  key: 'poplet.settings',

  /// What was saved, or the defaults if nothing readable was.
  load() {
    const raw = KeyValue.read(SettingsStore.key);
    if (raw === null) return { ...Settings.defaults };
    try {
      return Settings.fromJson(JSON.parse(raw));
    } catch (error) {
      return { ...Settings.defaults };
    }
  },

  save(settings) {
    KeyValue.write(SettingsStore.key, JSON.stringify(Settings.toJson(settings)));
  },
};

/// A JSON list, with anything unreadable counting as empty: a record cut short
/// by the tab being closed mid-save must not stop the app opening.
function decodeList(raw) {
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw);
    return Array.isArray(decoded) ? decoded : [];
  } catch (error) {
    return [];
  }
}
