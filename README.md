# poplet

Bugün ne varsa bir baloncuk. Yaptıysan patlat.

Düz bir web uygulaması: HTML, CSS ve canvas üzerine yazılmış JavaScript. Derleme
adımı, paket yöneticisi, bağımlılık yok — dosyaları bir yere koyup açmak yeterli.

Kendi başına, bir sunucuya hiç bağlanmadan çalışır. İsteğe bağlı olarak
hatırlatmalar bildirime dönüşebilir; uygulama kapalıyken telefona düşen türden.
Onun kurulumu [SETUP.md](SETUP.md) içinde.

## Çalıştırmak

Bir yerel sunucu ile:

```bash
python3 -m http.server 8777
```

Sonra tarayıcıda `http://localhost:8777` adresini açın. (`index.html` dosyasına
çift tıklayarak da açılır; tek fark, `file://` altında bazı tarayıcıların yazı
tiplerini yüklememesi ve uygulamanın yedek yazı tipiyle çizilmesidir.)

Yayınlamak için klasörün tamamını statik dosya olarak sunan herhangi bir yere
kopyalamak yeterli.

## Ne nerede

| Dosya | İş |
| --- | --- |
| `index.html`, `app.css` | Sayfanın iskeleti; metin ve düğmeler gerçek DOM olarak kalır, geri kalanı çizilir. |
| `js/geom.js` | Yol (path) çizimi, düzleştirme ve yay uzunluğuna göre örnekleme. |
| `js/noise.js`, `js/rough.js`, `js/pen.js`, `js/boil.js` | El çizimi görüntüsü: gürültü, çizgiyi yana itme, değişken kalınlıklı kalem, kaynama (boil) saati. |
| `js/world.js` | Baloncuk fiziği — yerçekimi, yığılma, uyku, fırlatma. |
| `js/controller.js`, `js/book.js` | Bir günün baloncukları ve bütün hatırlatıcılar; ekleme, patlatma, tekrar. |
| `js/bubbleShape.js`, `js/background.js`, `js/headFrame.js` | Temaların şekilleri: çakıl taşı, sabun köpüğü, kalp; zemin deseni; çerçeve ve kafa. |
| `js/text.js` | Yazının ölçülmesi ve bir dairenin içine en iyi nasıl sığdığı. |
| `js/app.js` | Sayfanın kendisi: dokunuşlar, üst çubuk, ekleme alanı, düzenleme paneli, takvim, ayarlar. |
| `js/config.js` | Sunucu ayarları. Boşsa uygulama yalnızca bu cihazda çalışır. |
| `js/push.js`, `js/sync.js` | Bildirim katmanı: isimsiz giriş, kayıtların yüklenmesi, izin durumu. |
| `OneSignalSDKWorker.js` | Tek service worker: hem çevrimdışı kopya hem bildirim alıcısı. |
| `supabase/` | Veritabanı şeması, zamanlayıcı ve iki sunucu işlevi. |

## Veriler

Hatırlatıcılar ve ayarlar tarayıcının `localStorage` alanında durur
(`poplet.reminders`, `poplet.settings`). Sheet'in tek kaynağı budur: bildirim
kurulumu yapılmamışsa veri cihazdan hiç çıkmaz, yapılmışsa aynı kayıtların bir
kopyası kullanıcının kendi Supabase satırlarına yazılır — yalnızca bildirimin
kurulabilmesi için.

Her hatırlatmanın kendi saati ve saat dilimi vardır (düzenleme panelinden).
Sheet'in kendisi saat göstermez; saat yalnızca bildirimin ne zaman gideceğini
belirler.
