'use strict';

/// Where the reminders go once they are saved, beyond this device.
///
/// A no-op until the reminding layer takes it over. The sheet works on its own
/// — reminders live in the browser's storage and the app never needs a server
/// to draw a day — so nothing here may be required for the app to run.
const Sync = {
  /// Called after every change that reached storage, with every reminder.
  changed(reminders) {},
};
