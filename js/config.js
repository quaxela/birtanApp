'use strict';

/// Where this copy of the app sends its reminders, and who sends the
/// notifications. All three blank means the app runs entirely on this device:
/// the sheet works, nothing is uploaded, and no notification is scheduled.
///
/// None of these are secrets. The Supabase key here is the public one, which
/// only reaches rows the signed-in user owns; the OneSignal key that can send
/// to anybody lives on the server and never in this file. See SETUP.md.
const PopletConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  oneSignalAppId: '',
};
