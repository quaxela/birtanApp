// Zamanlayıcının çağırdığı işlev: gönderilmiş tekrarların bir sonrakini kurar.
//
// Tek seferlik bir hatırlatmanın bildirimi kaydedildiği anda kurulur ve o
// kadardır. Tekrarlayan biri ise her seferinde yalnızca bir sonraki günü için
// kurulu durur — çalan bildirimden sonra onu ileri taşıyacak bir şey lazım, ve
// o şey uygulamanın açılması olamaz. Kaçmış bir şey varsa da burada yakalanır.
//
// Kimlik doğrulaması Supabase'in kendi katmanında: bu işlev yalnızca servis
// anahtarıyla çağrılabilir (bkz. schema.sql'deki cron işi).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncUser } from '../_shared/schedule.ts';

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date().toISOString();

  // İlgilenilenler: bildirimi geçmişte kalmış olanlar ve hiç kurulmamışlar.
  // Bekleyen bir bildirimi olan ve zamanı gelmemiş kayıtlara dokunulmaz.
  const { data, error } = await admin
    .from('reminders')
    .select('user_id, scheduled_for')
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`);

  if (error) {
    console.error('rollover-reminders', error);
    return new Response(JSON.stringify({ error: String(error.message) }), { status: 500 });
  }

  const users = [...new Set((data ?? []).map((row: { user_id: string }) => row.user_id))];
  let scheduled = 0;
  const failed: string[] = [];

  for (const userId of users) {
    try {
      // Bir kullanıcının hatırlatmaları hepsi birden gözden geçirilir; kayıt
      // başına ayrı ayrı uğraşmaktan hem daha basit hem de daha az istek.
      scheduled += await syncUser(admin, userId);
    } catch (failure) {
      // Biri patladı diye geri kalan herkes bildirimsiz kalmasın.
      console.error('rollover-reminders', userId, failure);
      failed.push(userId);
    }
  }

  return new Response(JSON.stringify({ users: users.length, scheduled, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
