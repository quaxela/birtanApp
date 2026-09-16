-- Poplet'in sunucu tarafı: hatırlatmaların kaydı ve kime ait oldukları.
--
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştırın. En alttaki
-- zamanlayıcı bölümünde iki yeri kendi projenizin değerleriyle değiştirmeniz
-- gerekiyor; o hali ile bu dosyayı depoya geri koymayın (servis anahtarı
-- içerir).

create table if not exists public.reminders (
  -- Uygulamanın kendi kimliği. Sunucu yeni bir kimlik üretmez; böylece aynı
  -- hatırlatma iki kez yüklendiğinde satır çoğalmaz. Kimlik cihazda üretildiği
  -- için tek başına değil, sahibiyle birlikte anahtar: iki cihazın aynı kimliği
  -- üretmesi ihtimali küçük ama sonucu karışık olurdu.
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,

  label text not null,
  start_day date not null,
  -- Bildirimin gideceği saat, kullanıcının kendi saatiyle.
  at_time time not null default '09:00',
  -- O saatin hangi saat diliminde okunacağı. Saklanan an UTC'dir; bu alan
  -- olmadan yaz saati geçişlerinde bildirim bir saat kayar.
  zone text not null default 'UTC',
  repeat text not null default 'none'
    check (repeat in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  -- Tekrarlayan bir hatırlatmanın patlatıldığı günler. O günler atlanır.
  done date[] not null default '{}',

  -- OneSignal'da bekleyen bildirimin kimliği ve hangi an için kurulduğu.
  -- Hatırlatma değişince önce bu iptal edilir, sonra yenisi kurulur.
  onesignal_id text,
  scheduled_for timestamptz,

  updated_at timestamptz not null default now(),

  primary key (user_id, id)
);

create index if not exists reminders_user_idx on public.reminders (user_id);
-- Zamanı geçmiş kayıtları bulan işin taradığı sütun.
create index if not exists reminders_scheduled_idx on public.reminders (scheduled_for);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reminders_touch on public.reminders;
create trigger reminders_touch
  before update on public.reminders
  for each row execute function public.touch_updated_at();

-- Herkes yalnızca kendi satırlarını görür ve yazar. Uygulama isimsiz giriş
-- kullanıyor: tarayıcı ilk açılışta kendine bir kimlik alır, satırlar ona ait
-- olur.
alter table public.reminders enable row level security;

drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Zamanlayıcı
--
-- Tek seferlik hatırlatmalar için gerekmez: bunlar kaydedildikleri anda
-- OneSignal'a ileri tarihli olarak kurulur. Bu iş, gönderilmiş bir tekrarın
-- bir sonrakini kurmak ve uygulama hiç açılmasa da kaçan bir şey kalmamasını
-- sağlamak için var.
--
-- PROJE_REF ve SERVIS_ANAHTARI yerlerine kendi değerlerinizi yazın:
--   PROJE_REF       Proje URL'sindeki alt alan adı (abcdefgh.supabase.co)
--   SERVIS_ANAHTARI Settings ▸ API ▸ service_role anahtarı

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('poplet-rollover')
where exists (select 1 from cron.job where jobname = 'poplet-rollover');

select cron.schedule(
  'poplet-rollover',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJE_REF.supabase.co/functions/v1/rollover-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer SERVIS_ANAHTARI'
    ),
    body := jsonb_build_object('at', now()),
    timeout_milliseconds := 20000
  );
  $$
);
