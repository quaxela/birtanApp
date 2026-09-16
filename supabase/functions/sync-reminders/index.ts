// Uygulamanın her kayıttan sonra çağırdığı işlev.
//
// İstemci hatırlatmaları kendi satırlarına yazar; burada olan şey o satırların
// bildirimlerinin kurulması. Bunun ayrı bir işlev olmasının tek sebebi var:
// OneSignal'ın herkese bildirim gönderebilen anahtarı tarayıcıya konamaz.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { syncUser } from '../_shared/schedule.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authorization = request.headers.get('Authorization') ?? '';

  // Kullanıcının kendi oturumuyla açılan istemci: kim olduğu istekte yazana
  // değil, imzalı oturuma bakılarak bulunur ve satırlara da yalnızca onun
  // erişimiyle dokunulur.
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'oturum yok' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const changed = await syncUser(client, user.id);
    return new Response(JSON.stringify({ scheduled: changed }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (failure) {
    console.error('sync-reminders', failure);
    return new Response(JSON.stringify({ error: String(failure) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
