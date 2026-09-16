# Bildirim kurulumu

Uygulama bu dosyada anlatılanların hiçbiri yapılmadan da çalışır: hatırlatmalar
tarayıcıda durur, hiçbir şey dışarı gitmez. Aşağıdakiler, uygulama kapalıyken
telefona bildirim gelmesi içindir.

Toplamda üç hesap gerekiyor ve üçü de bu ölçekte ücretsiz: Supabase (kayıtlar),
OneSignal (bildirim), Vercel (siteyi yayınlamak). Hesapları sizin açmanız
gerekiyor; ben sizin adınıza hesap açamam.

## Nasıl çalışıyor

```
Hatırlatma kaydedilir
  → satır Supabase'e yazılır
  → sync-reminders işlevi bir sonraki günü hesaplar
  → OneSignal'a "şu an gönder" diye kurulur (send_after)
  → zamanı gelince bildirim düşer, Safari kapalı olsa bile
```

Hatırlatma değişirse eski bildirim iptal edilip yenisi kurulur. Tekrarlayan bir
hatırlatmanın yalnızca bir sonraki günü kuruludur; çalan bildirimden sonra
sıradakini 15 dakikada bir çalışan `rollover-reminders` işi kurar.

## 1. Supabase

1. [supabase.com](https://supabase.com) üzerinde yeni bir proje açın.
2. **Authentication ▸ Sign In / Providers ▸ Anonymous sign-ins** ayarını açın.
   Uygulamada giriş ekranı yok; tarayıcı ilk açılışta kendine isimsiz bir
   kimlik alır ve satırlar ona ait olur.
3. **SQL Editor**'de `supabase/schema.sql` dosyasını çalıştırın. En alttaki
   zamanlayıcı bölümünde iki yeri kendi değerlerinizle değiştirin:
   - `PROJE_REF` → proje URL'nizdeki alt alan adı
   - `SERVIS_ANAHTARI` → **Settings ▸ API ▸ service_role** anahtarı

   Bu anahtar gizlidir; doldurduğunuz SQL'i depoya geri koymayın.

## 2. OneSignal

1. [onesignal.com](https://onesignal.com) üzerinde bir uygulama oluşturun,
   platform olarak **Web** seçin.
2. **Typical Site** kurulumunu seçin ve **Site URL** olarak sitenin yayına
   çıkacağı adresi yazın (örn. `https://poplet.vercel.app`). Adres birebir
   eşleşmeli.
3. OneSignal size bir `OneSignalSDKWorker.js` indirtmek isteyecek — gerek yok,
   o dosya bu depoda zaten var ve içine uygulamanın çevrimdışı kopyası da
   eklenmiş durumda. Bir sayfada tek bir service worker olabildiği için ikisi
   aynı dosyada.
4. **Settings ▸ Keys & IDs** sayfasından şunları alın:
   - **App ID** (herkese açık, `js/config.js` içine girilecek)
   - **REST API Key** (gizli, yalnızca sunucuda duracak)

## 3. Sunucu işlevleri

[Supabase CLI](https://supabase.com/docs/guides/cli) ile:

```bash
npm install -g supabase
supabase login
supabase link --project-ref PROJE_REF

supabase secrets set \
  ONESIGNAL_APP_ID=onesignal-app-id \
  ONESIGNAL_REST_API_KEY=onesignal-rest-anahtari \
  SITE_URL=https://siteniz.vercel.app

supabase functions deploy sync-reminders
supabase functions deploy rollover-reminders
```

`SITE_URL`, bildirime dokunulduğunda açılacak adres. OneSignal'ın gizli anahtarı
yalnızca burada durur; tarayıcıya hiç inmez.

## 4. Uygulama ayarları

`js/config.js` dosyasını doldurun:

```js
const PopletConfig = {
  supabaseUrl: 'https://PROJE_REF.supabase.co',
  supabaseAnonKey: 'Settings ▸ API ▸ anon/publishable anahtarı',
  oneSignalAppId: 'OneSignal App ID',
};
```

Üçü de buraya girilir ve üçü de gizli değildir: Supabase'in bu anahtarı yalnızca
giriş yapmış kullanıcının kendi satırlarına ulaşır, bunu da `schema.sql`'deki
RLS kuralı sağlar.

## 5. Yayınlamak

Vercel'de **New Project ▸ Import** ile depoyu seçin. Derleme adımı yok:

- Framework Preset: **Other**
- Build Command: boş
- Output Directory: boş (kök dizin)

Bildirimler `https` ister; Vercel'in verdiği adres bunu zaten sağlıyor.

## 6. iPhone'da açmak

Bu adım atlanamaz — iOS'ta Safari, yalnızca ana ekrana eklenmiş bir web
uygulamasına bildirim izni verir (iOS 16.4+).

1. Siteyi **Safari**'de açın.
2. **Paylaş ▸ Ana Ekrana Ekle**.
3. Uygulamayı **ana ekrandaki simgeden** açın (sekmeden değil).
4. Çarka dokunun ▸ **bildirimleri aç** ▸ iOS'un sorduğu izni verin.

Ayarlar sayfasında "Bildirimler açık" yazıyorsa kurulum tamam.

## 7. Denemek

Bir hatırlatma ekleyin, dokunup saatini birkaç dakika sonrasına alın, **tamam**
deyin. Uygulamayı tamamen kapatın. Saati geldiğinde bildirim düşmeli.

Supabase panelinde **Table Editor ▸ reminders** satırında `onesignal_id` ve
`scheduled_for` dolmuşsa bildirim kurulmuş demektir.

## Sorun giderme

| Belirti | Bakılacak yer |
| --- | --- |
| Ayarlarda "ana ekrana ekle" yazıyor | Uygulama sekmeden açılmış; ana ekrandaki simgeden açın. |
| "bildirimleri aç" dokununca bir şey olmuyor | OneSignal'daki Site URL ile sitenin adresi birebir aynı mı? |
| Satır yazılıyor ama `onesignal_id` boş | **Edge Functions ▸ sync-reminders ▸ Logs**. Genelde eksik veya yanlış `ONESIGNAL_REST_API_KEY`. |
| Bildirim hiç gelmiyor | OneSignal ▸ **Audience ▸ Subscriptions**'da cihaz görünüyor mu? Görünmüyorsa izin verilmemiştir. |
| Tekrarlayan hatırlatma bir kez gelip susuyor | `rollover-reminders` işi çalışmıyor. SQL Editor'de: `select * from cron.job_run_details order by start_time desc limit 10;` |
| Saat yanlış | Kayıttaki `zone` alanı. Saat, o saat diliminde okunur; UTC olarak saklanır. |

## Bilinmesi gerekenler

- Web Push garantili bir alarm değildir. İnternet yoksa, Odak modu açıksa veya
  telefon bildirimleri kısıtlıyorsa gecikebilir. İlaç gibi kaçırılmaması gereken
  şeyler için native bir uygulama daha doğrudur.
- Kimlik tarayıcıda durur. Safari verilerini silerseniz ya da başka bir cihazdan
  açarsanız o cihaz kendine yeni bir kimlik alır; eski satırlar sahipsiz kalır.
  Hatırlatmalar zaten cihazda da duruyor, sheet boşalmaz — ama bildirimler yeni
  kimlik üzerinden kurulur.
- Zamanlama mantığının testi:
  `node --experimental-strip-types supabase/functions/_shared/schedule.test.mjs`
