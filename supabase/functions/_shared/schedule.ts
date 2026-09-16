// Bir hatırlatmanın bir sonraki gününü bulmak ve o an için OneSignal'a bildirim
// kurmak. Hem kullanıcının kendi çağırdığı işlev hem de zamanlayıcı bunu
// kullanır; iki yerde iki ayrı tarih hesabı olsaydı biri diğerinden kayardı.

export type Reminder = {
  id: string;
  user_id: string;
  label: string;
  start_day: string;
  at_time: string;
  zone: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  done: string[] | null;
  onesignal_id: string | null;
  scheduled_for: string | null;
};

/// Bir bildirimin kurulabilmesi için gereken en yakın an. Şimdiye çok yakın bir
/// zamanı kurmanın anlamı yok: OneSignal'a ulaşması da bir şey sürüyor.
const leadMs = 60 * 1000;

/// En fazla kaç gün ileriye bakılacağı. Yıllık tekrarda bir sonraki gün 366 gün
/// sonra olabilir; bundan ötesi bir hata demektir.
const horizonDays = 400;

/// `zone` saat diliminde `day` gününün `time` saati, UTC olarak.
///
/// İki geçişli: önce o yerel saatin UTC sayılmış hali için geçerli fark
/// bulunur, sonra o farkla düzeltilen an için fark yeniden okunur. Tek geçiş,
/// yaz saatinin değiştiği günlerde bir saat şaşar.
export function zonedTimeToUtc(day: string, time: string, zone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const asIfUtc = Date.UTC(year, month - 1, date, hour, minute, 0);

  const firstGuess = new Date(asIfUtc - zoneOffset(new Date(asIfUtc), zone));
  return new Date(asIfUtc - zoneOffset(firstGuess, zone));
}

/// `zone` saat diliminin `at` anındaki UTC'den farkı, milisaniye.
function zoneOffset(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - at.getTime();
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/// Uygulamadaki kuralın aynısı: bir hatırlatma hangi günlere düşer.
function occursOn(reminder: Reminder, day: Date, start: Date): boolean {
  if (day < start) return false;
  if ((reminder.done ?? []).includes(isoDay(day))) return false;

  switch (reminder.repeat) {
    case 'daily':
      return true;
    case 'weekly':
      return day.getUTCDay() === start.getUTCDay();
    case 'monthly':
      return day.getUTCDate() === dayOfMonthIn(start, day);
    case 'yearly':
      return day.getUTCMonth() === start.getUTCMonth() &&
        day.getUTCDate() === dayOfMonthIn(start, day);
    default:
      return isoDay(day) === isoDay(start);
  }
}

/// Ayın kısa olduğu yerde geriye çekilmiş gün: 31'i olmayan ayda 30, artık
/// olmayan yılda 29 Şubat yerine 28.
function dayOfMonthIn(start: Date, day: Date): number {
  return Math.min(start.getUTCDate(), daysInMonth(day.getUTCFullYear(), day.getUTCMonth()));
}

/// Bir hatırlatmanın bildirim gönderilecek ilk anı, ya da artık gelmeyecekse
/// null. Günler kullanıcının saat diliminde sayılır; dönen an UTC'dir.
export function nextOccurrence(reminder: Reminder, now: Date): Date | null {
  const start = new Date(`${reminder.start_day}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;

  // Bugün hangi gün — kullanıcının bulunduğu yerde, sunucuda değil.
  const todayThere = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: reminder.zone }).format(now)}T00:00:00Z`,
  );
  const first = todayThere > start ? todayThere : start;

  for (let i = 0; i < horizonDays; i++) {
    const day = new Date(first.getTime() + i * 86400000);
    if (!occursOn(reminder, day, start)) {
      // Tek seferlik bir hatırlatmanın tek günü vardır; geçtiyse aramaya devam
      // etmenin anlamı yok.
      if (reminder.repeat === 'none' && day > start) return null;
      continue;
    }
    const at = zonedTimeToUtc(isoDay(day), reminder.at_time.slice(0, 5), reminder.zone);
    if (at.getTime() > now.getTime() + leadMs) return at;
  }
  return null;
}

// ---------------------------------------------------------------- OneSignal

const oneSignalApi = 'https://api.onesignal.com/notifications';

function oneSignalHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    // v16 anahtarları "Key" ile gönderilir; daha eski bir anahtar kullanıyorsanız
    // burası "Basic <anahtar>" olur.
    Authorization: `Key ${Deno.env.get('ONESIGNAL_REST_API_KEY')}`,
  };
}

/// İleri tarihli bildirimi kurar ve OneSignal'ın mesaj kimliğini döndürür.
/// Bildirim kullanıcıya gönderilir, tarayıcıya değil: aynı sheet'i açmış ikinci
/// bir cihaz da çalar.
export async function scheduleNotification(
  reminder: Reminder,
  at: Date,
): Promise<string | null> {
  const response = await fetch(oneSignalApi, {
    method: 'POST',
    headers: oneSignalHeaders(),
    body: JSON.stringify({
      app_id: Deno.env.get('ONESIGNAL_APP_ID'),
      target_channel: 'push',
      include_aliases: { external_id: [reminder.user_id] },
      headings: { en: 'poplet', tr: 'poplet' },
      contents: { en: reminder.label, tr: reminder.label },
      send_after: at.toISOString(),
      // Aynı hatırlatmanın eski bildirimi ekranda duruyorsa yenisi onun yerine
      // geçer, yan yana iki tane birikmez.
      web_push_topic: reminder.id,
      url: Deno.env.get('SITE_URL') || undefined,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OneSignal kurulamadı (${response.status}): ${JSON.stringify(body)}`);
  }
  // Hedefte hiç abone yoksa OneSignal kimlik döndürmez; kurulacak bir şey de
  // yoktur. Kullanıcı bildirime izin verdiğinde yeniden denenir.
  return typeof body.id === 'string' ? body.id : null;
}

/// Bekleyen bir bildirimi iptal eder. Çoktan gönderilmiş bir mesaj iptal
/// edilemez ve bu bir hata değildir — hatırlatma zaten çalmıştır.
export async function cancelNotification(messageId: string): Promise<void> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  await fetch(`${oneSignalApi}/${messageId}?app_id=${appId}`, {
    method: 'DELETE',
    headers: oneSignalHeaders(),
  }).catch(() => {});
}

/// Bir kullanıcının bütün hatırlatmalarını OneSignal'daki haliyle aynı yere
/// getirir: değişenin eskisi iptal edilir, yeni an için yenisi kurulur.
///
/// Değişmeyene dokunulmaz. Bu işlev her kayıttan sonra çağrıldığı için, her
/// seferinde her bildirimi yeniden kurmak hem yavaş olurdu hem de OneSignal'da
/// gereksiz trafik yaratırdı.
export async function syncUser(client: any, userId: string): Promise<number> {
  const { data, error } = await client.from('reminders').select('*').eq('user_id', userId);
  if (error) throw error;

  const now = new Date();
  let changed = 0;

  for (const reminder of (data ?? []) as Reminder[]) {
    const next = nextOccurrence(reminder, now);
    const wanted = next ? next.toISOString() : null;
    const booked = reminder.scheduled_for ? new Date(reminder.scheduled_for).toISOString() : null;

    // Kurulu olan zaten doğru ana bakıyorsa dokunma.
    if (wanted === booked && (wanted === null || reminder.onesignal_id)) continue;

    if (reminder.onesignal_id) await cancelNotification(reminder.onesignal_id);
    const messageId = next ? await scheduleNotification(reminder, next) : null;

    const { error: saveError } = await client
      .from('reminders')
      .update({ onesignal_id: messageId, scheduled_for: wanted })
      .eq('user_id', userId)
      .eq('id', reminder.id);
    if (saveError) throw saveError;
    changed++;
  }

  return changed;
}
