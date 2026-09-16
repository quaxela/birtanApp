// Zamanlamanın testi. Çalıştırmak için:
//
//   node --experimental-strip-types supabase/functions/_shared/schedule.test.mjs
//
// Burada sınanan şey bir hatırlatmanın hangi ana kurulacağı: tekrarlar, ayın
// kısa olduğu haller ve yaz saati geçişleri. Bunlar gözle görülmez — yanlış
// olduğunda bildirim bir saat geç gelir ya da hiç gelmez.
import { nextOccurrence, zonedTimeToUtc } from './schedule.ts';

let failures = 0;
function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}\n       beklenen ${expected}\n       gelen    ${actual}`);
}

const base = (over = {}) => ({
  id: 'r1', user_id: 'u1', label: 'ilacı al',
  start_day: '2026-09-16', at_time: '09:00:00', zone: 'Europe/Istanbul',
  repeat: 'none', done: [], onesignal_id: null, scheduled_for: null, ...over,
});

const iso = (d) => (d ? d.toISOString() : 'null');

// Istanbul is UTC+3 all year.
check('tek seferlik, saati gelmemiş',
  iso(nextOccurrence(base(), new Date('2026-09-16T04:00:00Z'))),
  '2026-09-16T06:00:00.000Z');

check('tek seferlik, saati geçmiş → yok',
  iso(nextOccurrence(base(), new Date('2026-09-16T07:00:00Z'))),
  'null');

check('günlük, bugünün saati geçmiş → yarın',
  iso(nextOccurrence(base({ repeat: 'daily' }), new Date('2026-09-16T07:00:00Z'))),
  '2026-09-17T06:00:00.000Z');

check('günlük, yarın patlatılmış → ertesi gün',
  iso(nextOccurrence(base({ repeat: 'daily', done: ['2026-09-17'] }), new Date('2026-09-16T07:00:00Z'))),
  '2026-09-18T06:00:00.000Z');

// 16 Eylül 2026 Çarşamba
check('haftalık → gelecek çarşamba',
  iso(nextOccurrence(base({ repeat: 'weekly' }), new Date('2026-09-16T07:00:00Z'))),
  '2026-09-23T06:00:00.000Z');

check('aylık → gelecek ayın 16sı',
  iso(nextOccurrence(base({ repeat: 'monthly' }), new Date('2026-09-16T07:00:00Z'))),
  '2026-10-16T06:00:00.000Z');

check('aylık 31 → kısa ayda 30',
  iso(nextOccurrence(base({ start_day: '2026-10-31', repeat: 'monthly' }), new Date('2026-11-01T00:00:00Z'))),
  '2026-11-30T06:00:00.000Z');

check('yıllık → gelecek yıl',
  iso(nextOccurrence(base({ repeat: 'yearly' }), new Date('2026-09-16T07:00:00Z'))),
  '2027-09-16T06:00:00.000Z');

check('29 Şubat yıllık → artık olmayan yılda 28',
  iso(nextOccurrence(base({ start_day: '2024-02-29', repeat: 'yearly' }), new Date('2026-01-01T00:00:00Z'))),
  '2026-02-28T06:00:00.000Z');

check('ileri tarihli, henüz başlamamış',
  iso(nextOccurrence(base({ start_day: '2026-12-25', at_time: '20:30:00' }), new Date('2026-09-16T07:00:00Z'))),
  '2026-12-25T17:30:00.000Z');

// Berlin: 2026-03-29 saat 02:00'de yaz saatine geçer (+1 → +2)
check('yaz saatinden önce Berlin 09:00 = 08:00 UTC',
  iso(nextOccurrence(base({ zone: 'Europe/Berlin', start_day: '2026-03-28' }), new Date('2026-03-27T00:00:00Z'))),
  '2026-03-28T08:00:00.000Z');

check('yaz saatinden sonra Berlin 09:00 = 07:00 UTC',
  iso(nextOccurrence(base({ zone: 'Europe/Berlin', start_day: '2026-03-30' }), new Date('2026-03-27T00:00:00Z'))),
  '2026-03-30T07:00:00.000Z');

check('geçişin atlanan saatine denk gelen 02:30 kaybolmaz',
  iso(zonedTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin')),
  '2026-03-29T01:30:00.000Z');

check('güney yarımküre, negatif fark (Sao Paulo UTC-3)',
  iso(nextOccurrence(base({ zone: 'America/Sao_Paulo' }), new Date('2026-09-16T00:00:00Z'))),
  '2026-09-16T12:00:00.000Z');

check('bir dakika içindeki an kurulmaz, sonrakine geçer',
  iso(nextOccurrence(base({ repeat: 'daily' }), new Date('2026-09-16T05:59:30Z'))),
  '2026-09-17T06:00:00.000Z');

console.log(failures === 0 ? '\nhepsi geçti' : `\n${failures} test patladı`);
process.exit(failures === 0 ? 0 : 1);
