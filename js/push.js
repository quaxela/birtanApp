'use strict';

/// The reminding: what turns a bubble into a notification that arrives with
/// the app closed.
///
/// Nothing on the sheet depends on any of this. With `js/config.js` left blank
/// the whole layer reports itself off and the app is exactly what it was — a
/// drawing of today that lives in this browser. With it filled in, every save
/// is mirrored to the user's own rows in Supabase, and a server function books
/// the next occurrence of each reminder with OneSignal.
///
/// The key that can send a notification to anybody is never here. This file
/// only ever carries the public Supabase key and the OneSignal app id, both of
/// which are meant to be read by whoever opens the page.
const Push = {
  /// off | unsupported | needs-install | needs-permission | denied | on | error
  state: 'off',
  detail: '',

  _listeners: new Set(),
  _supabase: null,
  _user: null,
  _oneSignal: null,
  _queued: null,
  _pending: Promise.resolve(),

  get configured() {
    return Boolean(
      PopletConfig.supabaseUrl && PopletConfig.supabaseAnonKey && PopletConfig.oneSignalAppId,
    );
  },

  /// True once notifications are actually going out. Everything else — no
  /// configuration, no permission, a phone that hasn't installed the app — is
  /// a reason the sheet still works and nothing rings.
  get running() {
    return this.state === 'on';
  },

  onState(listener) {
    this._listeners.add(listener);
    listener(this.state, this.detail);
    return () => this._listeners.delete(listener);
  },

  _setState(state, detail = '') {
    this.state = state;
    this.detail = detail;
    for (const listener of this._listeners) listener(state, detail);
  },

  /// Reads where the browser stands without asking it for anything: on iOS a
  /// page that was never added to the home screen cannot be given permission
  /// at all, and saying so is more use than a button that fails.
  start() {
    if (!this.configured) {
      this._setState('off');
      return;
    }
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
      this._setState(isApple() && !installed() ? 'needs-install' : 'unsupported');
      return;
    }
    if (isApple() && !installed()) {
      this._setState('needs-install');
      return;
    }
    if (Notification.permission === 'denied') {
      this._setState('denied');
      return;
    }
    if (Notification.permission !== 'granted') {
      this._setState('needs-permission');
      return;
    }
    // Already allowed on an earlier visit: pick straight up where it left off.
    this._run();
  },

  /// Asks for permission and turns the reminding on. Has to be called from
  /// something the user actually tapped — browsers refuse the prompt
  /// otherwise.
  async enable() {
    if (!this.configured || this.state === 'on') return;
    try {
      const oneSignal = await this._loadOneSignal();
      await oneSignal.Notifications.requestPermission();
      if (!oneSignal.Notifications.permission) {
        this._setState(Notification.permission === 'denied' ? 'denied' : 'needs-permission');
        return;
      }
      await this._run();
    } catch (error) {
      this._fail(error);
    }
  },

  /// Signs in, names this browser to OneSignal, and sends up whatever the
  /// sheet is holding.
  async _run() {
    try {
      const [supabase, oneSignal] = await Promise.all([
        this._loadSupabase(),
        this._loadOneSignal(),
      ]);
      if (!supabase || !this._user) return;

      // The notification is addressed to the signed-in user rather than to
      // this browser, so a reminder made on a laptop still rings on a phone
      // that opened the same sheet.
      await oneSignal.login(this._user.id);

      // Açık denmeden önce bir kere gerçekten yüklenir. "Bildirimler açık"
      // yazıp hiçbir şeyin kurulmamış olması, hiç söz vermemekten kötüdür.
      if (this._queued) await this._upload(this._queued);
      this._setState('on');
    } catch (error) {
      this._fail(error);
    }
  },

  /// Every reminder, as the server keeps them. Called after each save.
  send(reminders) {
    this._queued = reminders.map((reminder) => ({
      id: reminder.id,
      label: reminder.label,
      start_day: isoDay(reminder.start),
      at_time: reminder.time,
      zone: reminder.zone,
      repeat: reminder.repeat,
      done: [...reminder.done],
    }));
    if (!this.running) return;

    // Chained rather than fired in parallel, so a slow upload can never land
    // on top of a newer one, and collapsed while one is in flight: a run of
    // pops is one state, not five.
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => {
      const rows = this._queued;
      this._pending = this._pending
        .then(() => this._upload(rows))
        // Sonraki kayıt yeniden dener; bu arada ayarlar sayfası neyin ters
        // gittiğini söyler, çünkü kurulduğunu sanmak en kötüsü.
        .catch((error) => this._fail(error));
    }, 600);
  },

  async _upload(rows) {
    const supabase = this._supabase;
    const user = this._user;
    if (!supabase || !user) return;

    if (rows.length > 0) {
      const { error } = await supabase
        .from('reminders')
        .upsert(rows.map((row) => ({ ...row, user_id: user.id })), { onConflict: 'user_id,id' });
      if (error) throw error;
    }

    // Whatever is no longer on the sheet is no longer a reminder. Deleting by
    // "not one of these" rather than tracking each removal keeps the two sides
    // in step even after a launch that missed a change.
    let gone = supabase.from('reminders').delete().eq('user_id', user.id);
    if (rows.length > 0) gone = gone.not('id', 'in', `(${rows.map((row) => `"${row.id}"`).join(',')})`);
    const { error: removeError } = await gone;
    if (removeError) throw removeError;

    // The rows are only the record; this is what actually books the next one
    // of each with OneSignal, and calls off the ones that changed.
    const { error: functionError } = await supabase.functions.invoke('sync-reminders');
    if (functionError) throw functionError;
  },

  async _loadSupabase() {
    if (this._supabase) return this._supabase;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(PopletConfig.supabaseUrl, PopletConfig.supabaseAnonKey);

    // No account, no password, no sign-in screen: the browser is given an
    // identity of its own the first time, and keeps it. It is what the rows
    // belong to and what a notification is addressed to.
    const existing = await supabase.auth.getSession();
    let user = existing.data.session ? existing.data.session.user : null;
    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }

    this._supabase = supabase;
    this._user = user;
    return supabase;
  },

  _loadOneSignal() {
    if (this._oneSignal) return Promise.resolve(this._oneSignal);
    return new Promise((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({ appId: PopletConfig.oneSignalAppId });
          this._oneSignal = OneSignal;
          resolve(OneSignal);
        } catch (error) {
          reject(error);
        }
      });

      if (!document.getElementById('onesignal-sdk')) {
        const script = document.createElement('script');
        script.id = 'onesignal-sdk';
        script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
        script.defer = true;
        script.onerror = () => reject(new Error('OneSignal SDK indirilemedi'));
        document.head.append(script);
      }
    });
  },

  _fail(error) {
    console.warn('Poplet hatırlatma kurulamadı:', error);
    this._setState('error', error && error.message ? error.message : String(error));
  },
};

/// Whether the page is running as an installed app rather than in a tab. On
/// iOS this is the whole question: Safari only hands a page notifications once
/// it has been added to the home screen.
function installed() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function isApple() {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/// The sheet saves; this is where the save goes next.
Sync.changed = (reminders) => Push.send(reminders);
