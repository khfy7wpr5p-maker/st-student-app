# STUDENT-06 — iPhone / Safari / VoiceOver Acceptance

Bu kontrol listesi gerçek fiziksel cihaz kabulü içindir. Otomatik testler erişilebilirlik sözleşmesini korur; gerçek VoiceOver davranışını taklit ettiğini iddia etmez.

## Ön koşullar

- HTTPS üzerinden açılabilen Student App deployment.
- Firebase Authentication + Cloud Firestore production-like configuration.
- En az bir Public Pool çalışması.
- En az bir öğrenciye özel çalışma.
- Offline testi için daha önce çevrimiçi açılmış ve IndexedDB'ye kaydedilmiş bir çalışma.
- Nota kabulü yapılacaksa aynı browser context içinde doğrulanmış ST Score Rendering Host runtime.

## A. Safari temel kullanım — PASS (2026-09-22)

Gerçek fiziksel iPhone/Safari üzerinde doğrulandı:

1. Firebase Email/Password ile giriş başarılı.
2. Ana Sayfa açıldı.
3. Havuz listesi açıldı ve `Test Havuz Çalışması` göründü.
4. Benim Çalışmalarım listesi açıldı ve `Test Kişisel Çalışma` göründü.
5. Kişisel çalışma açıldı.
6. Firestore manifest + chunk transport gerçek veride başarılı oldu.
7. Ham kimlik, Firebase hata metni, MusicXML veya debug içeriği öğrenci UI'ına çıkmadı.

## B. VoiceOver — PASS (2026-09-22)

Kullanıcı gerçek cihazda VoiceOver ile doğruladı:

- Ana Sayfa heading/control sırası anlaşılır.
- `Havuz`, `Benim Çalışmalarım` ve `Çıkış` görünen Türkçe adlarıyla okunuyor.
- Practice ekranında çalışma başlığı, `Ana Sayfa`, `Nota` ve `Dinleme` bölümleri anlaşılır okunuyor.
- Teknik kimlik, Firebase provider ayrıntısı veya package iç detayı okunmuyor.

## C. VoiceOver odak korunumu — PASS (2026-09-22)

Gerçek cihaz testi:

1. VoiceOver odağı Ana Sayfa'da `Havuz` kontrolüne getirildi.
2. Ağ durumu çevrimiçi/çevrimdışı değiştirildi.
3. Durum metni yeniden çizildi.

Sonuç:
- Bağlantı durumu değişti.
- VoiceOver odağı `Havuz` kontrolünde kaldı.
- Kullanıcı ekranın başına fırlatılmadı.

Bu davranış repository'de otomatik regresyon testiyle de korunur.

## D. Offline çalışma — PASS (2026-09-22)

Gerçek cihazda şu akış doğrulandı:

1. Kişisel çalışma çevrimiçiyken açıldı.
2. Package cihaz cache'ine alındı.
3. Wi-Fi ve hücresel veri kapatıldı.
4. Safari yeniden kullanıldı / sayfa yeniden yüklendi.
5. Uygulama `Çevrimdışı` durumunu gösterdi.
6. `Test Kişisel Çalışma` yeniden açıldı.

Sonuç:
- Static shell offline açıldı.
- Restore edilmiş öğrenci oturumu yalnız kendi ACTIVE cache'ini açtı.
- Ağ kesilmesi mevcut cache'i REVOKED yapmadı.
- Offline reload fiziksel cihazda başarılı oldu.

## E. Notasyon / playback runtime — NOT RUN / NOT BLOCKING

Current production-like Student App deployment içinde doğrulanmış ST Score Rendering Host runtime ve trusted playback port bağlı değildir.

Bu nedenle Practice ekranında:

- `Nota görünümü bu çalışma için kullanılamıyor.`
- `Dinleme bu çalışma için kullanılamıyor.`

durumlarının görülmesi STUDENT-06 başarısızlığı değildir. Renderer/playback runtime entegrasyonu ayrı integration/deployment işi olarak kalır.

## Firestore test verisi

Mobil Firebase Console bazı string değerlerini boş kaydettiği için fiziksel kabul verisi güvenli seed aracıyla oluşturuldu:

- `scripts/student06SeedFixture.js`
- `scripts/seed-student06-firestore.mjs`

Araç:
- varsayılan dry-run çalışır;
- yalnız açık `--apply` ile yazar;
- Student App'e write yetkisi vermez;
- Firestore Security Rules'ı değiştirmez;
- yalnız dört bounded test dokümanını atomik commit ile yazar;
- public/private package chunk'larını gerçek transport sözleşmesine uygun üretir.

Cloud Shell dry-run sonucu:
- `DRY RUN: 4 bounded writes`

Canlı seed sonucu:
- `COMMITTED: 4 bounded writes`

## Otomatik doğrulama

Exact feature head öncesindeki son code/test doğrulaması:
- 198 test
- 198 pass
- 0 fail

Kapsam:
- Firebase Auth / Firestore browser wiring
- offline cache + service worker
- VoiceOver focus restoration regression
- bounded My Work diagnostics
- secure STUDENT-06 Firestore seed plan + CLI

## STUDENT-06 kapanış

A-D fiziksel iPhone/Safari/VoiceOver acceptance bölümleri PASS.

E bölümü yalnız renderer/playback runtime production deployment'a bağlandığında ayrıca doğrulanacaktır ve mevcut STUDENT-06 kapanışını bloklamaz.
