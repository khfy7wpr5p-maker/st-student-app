# STUDENT-06 — iPhone / Safari / VoiceOver Acceptance

Bu kontrol listesi gerçek fiziksel cihaz kabulü içindir. Otomatik testler erişilebilirlik sözleşmesini korur; gerçek VoiceOver davranışını taklit ettiğini iddia etmez.

## Ön koşullar

- HTTPS üzerinden açılabilen Student App deployment.
- Firebase Authentication + Cloud Firestore production-like configuration.
- En az bir teacher-approved Public Pool çalışması.
- En az bir teacher-approved öğrenciye özel çalışma.
- Offline testi için daha önce çevrimiçi açılmış ve IndexedDB'ye kaydedilmiş bir çalışma.
- Nota kabulü yapılacaksa aynı browser context içinde doğrulanmış ST Score Rendering Host runtime.

Raw repository default bootstrap Firebase credential/config üretmez ve sahte öğrenci hesabı oluşturmaz. Bu nedenle gerçek giriş + Firestore + cihaz offline kabulü provisioning tamamlanmadan PASS sayılamaz.

## A. Safari temel kullanım

1. Uygulamayı Safari'de aç.
2. Giriş yap.
3. Ana Sayfa -> Havuz -> Çalışmayı Aç akışını tamamla.
4. Ana Sayfa -> Benim Çalışmalarım -> Çalışmayı Aç akışını tamamla.

PASS:
- Sayfa yatay taşma olmadan kullanılabilir.
- Ekran yakınlaştırması engellenmez.
- Ana eylemler rahat dokunulabilir.
- Ham kimlik, Firebase hata metni, MusicXML veya debug bilgisi görünmez.

## B. VoiceOver

1. iPhone Ayarlar -> Erişilebilirlik -> VoiceOver'u aç.
2. Safari'ye dön.
3. Sağ/sol kaydırma ile başlıkları ve kontrolleri sırayla dolaş.
4. Havuz, Benim Çalışmalarım, Çıkış ve Çalışmayı Aç kontrollerini VoiceOver ile çalıştır.

PASS:
- Sayfa başlığı ve bölüm başlıkları anlaşılır okunur.
- Butonlar görünen Türkçe adlarıyla okunur.
- Nota mevcutsa "Nota" adlı region erişilebilir.
- Tempo kontrolünün "Tempo" etiketi okunur.
- Ölçü tekrar checkbox'ı adıyla okunur.
- Teknik ID veya provider ayrıntıları okunmaz.

## C. VoiceOver odak korunumu

1. Ana Sayfa'da VoiceOver odağını "Havuz" düğmesine getir.
2. Ağ durumunu değiştir: çevrimdışı -> çevrimiçi veya tersi.
3. Ekranın durum metninin değişmesini bekle.

PASS:
- "Çevrimiçi" / "Çevrimdışı" durumu duyurulur.
- Aynı ekran yeniden çizildiğinde VoiceOver odağı aynı "Havuz" kontrolünde kalır.
- Kullanıcı ekranın başına fırlatılmaz.

Bu davranış repository'de otomatik regresyon testiyle de korunur.

## D. Offline çalışma

1. İnternet açıkken giriş yap ve bir çalışmayı aç.
2. Çalışmanın cihazda mevcut olduğunu doğrula.
3. Wi-Fi ve hücresel veriyi kapat.
4. Uygulamayı tekrar kullan ve cache'lenmiş çalışmayı aç.
5. Safari sayfasını yeniden yükle.
6. İnterneti tekrar aç.

PASS:
- Static shell açılabilir.
- Restore edilmiş güvenilir öğrenci kimliği varsa yalnız o öğrenciye ait ACTIVE cache açılır.
- Cache'lenmemiş çalışma offline açılmaz.
- Ağ hatası mevcut geçerli cache'i REVOKED yapmaz.
- İnternet geri geldiğinde foreground sync tekrar çalışabilir.

## E. Notasyon

Nota runtime production deployment'a bağlanmışsa:

1. Nota içeren çalışmayı aç.
2. VoiceOver ile "Nota" region'ına ilerle.
3. Ekranı dikey ve yatay yönelimde kontrol et.

PASS:
- Nota alanı kaybolmaz.
- Çalışma başlığı ve diğer kontroller kullanılabilir kalır.
- Renderer hatası bütün Practice ekranını kilitlemez.

Runtime bağlanmamışsa notation UNAVAILABLE görünmesi STUDENT-06 başarısızlığı değildir; production renderer deployment eksikliği olarak kaydedilir.

## Kanıt kaydı

Her fiziksel testte kaydet:

- cihaz modeli
- iOS sürümü
- Safari sürümü/build bilgisi bulunabiliyorsa
- VoiceOver açık/kapalı
- test adımı
- PASS / FAIL
- FAIL ise kısa açıklama ve ekran görüntüsü/ekran kaydı

## STUDENT-06 kapanış koşulu

STUDENT-06 ancak gerçek fiziksel iPhone üzerinde A-D bölümleri doğrulandıktan sonra tamamen PASS sayılır. E bölümü renderer runtime deployment'ı mevcutsa ayrıca doğrulanır.
