# ST Student App

ST Student App, SesliTab öğretmen uygulamasında hazırlanıp **öğretmen tarafından onaylanan** çalışmaların öğrenci tarafından erişilebilir ve salt-okunur biçimde kullanılacağı uygulamadır.

## Mevcut ürün akışı

Giriş -> Havuz / Benim Çalışmalarım -> Çalışmayı Aç -> Nota / Dinle -> çevrimdışı çalışma

Mevcut `main`, STUDENT-07B playback baseline'ını içerir. Bir sonraki ürün mimarisi ayrıca tasarlanmıştır; aşağıdaki STUDENT-08/09 bölümü henüz uygulanmış davranış iddiası değildir.

## Değişmez sınırlar

- Öğrenci uygulamasında OMR veya Audiveris yoktur.
- Öğrenci uygulamasında nota editörü yoktur.
- Öğrenci teacher-approved kaynak veriyi değiştiremez.
- Yalnız `teacher_approved` revizyonlar Practice Package üretimine girebilir.
- Ortak havuz ile öğrenciye özel çalışmalar ayrı erişim kapsamlarıdır.
- Offline kullanım ilk sürüm mimarisinin parçasıdır.
- Ham debug, validator, revision iç yapıları ve öğretmen araçları öğrenci arayüzünde gösterilmez.

## İlk geliştirme paketi

`Practice Package v1` öğretmen uygulaması ile öğrenci uygulaması arasındaki veri sınırını tanımlar.

- Şema: `schemas/practice-package-v1.schema.json`
- Doğrulayıcı: `src/contracts/practicePackage.js`
- Mimari: `docs/architecture.md`
- Test: `test/practicePackage.test.js`

## Çalıştırma

Node.js kurulu bir ortamda:

```bash
npm test
```

STUDENT-02, provider-neutral öğrenci session ve Sharing Layer sözleşmelerini tanımlar. STUDENT-05 ile production provider kararı Firebase Authentication + Cloud Firestore olarak alınmış, STUDENT-06 ile browser production bağlantısı ve gerçek iPhone/Safari/VoiceOver kabul akışı doğrulanmıştır. Repository yalnız browser istemcisinin gerekli Firebase project config değerlerini taşır; admin credential, servis hesabı veya secret authority taşımaz.


## STUDENT-03 durumu

Minimal öğrenci uygulaması shell'i eklenmiştir:

- Giriş
- Ana Sayfa
- Havuz
- Benim Çalışmalarım
- Çalışmayı Aç

UI, STUDENT-02 salt-okunur Sharing Service'ine bağlanan provider-neutral controller kullanır. STUDENT-05 Firebase adapter'larını, STUDENT-06 ise gerçek browser Firebase wiring'ini bağlamıştır. Varsayılan giriş noktası sahte öğrenci hesabı oluşturmaz; giriş gerçek Firebase Authentication oturumuna bağlıdır.


## STUDENT-04 durumu

Salt-okunur Practice Workspace capability-aware çalışır:

- `AVAILABLE`: özellik gerçekten kullanılabilir.
- `UNAVAILABLE`: paket/runtime bu özelliği güvenilir biçimde sağlamıyor.
- `ERROR`: özellik başlatılırken/çalışırken hata oluştu; diğer özellikler bağımsız kalır.

Nota, Student App-owned adapter üzerinden ST Score Rendering Layer sözleşmesine bağlanır. Student App doğrudan OSMD package API'sini ürün sözleşmesi olarak kullanmaz. STUDENT-07A, Rendering Layer'ın sabitlenmiş browser runtime export'unu same-origin `vendor/st-score-runtime/` altında taşır; renderer için CDN drift'i kullanılmaz.

Practice Package içindeki MusicXML yalnız private render girdisidir; öğrenci HTML'ine veya hata mesajlarına yazılmaz.

Practice Package v1 içindeki `canonicalEvents` nesne dizisi güvenilir onset/duration playback şeması değildir ve Student App bunu hiçbir zaman timing kaynağı olarak tahmin etmez. STUDENT-07B feature branch'inin default browser bootstrap'ı artık ayrı Student App-owned playback portunu inject eder. Güvenilir bir trusted timing provider yoksa desteklenen `score-partwise` MusicXML bounded biçimde `APPROXIMATE` playback planına derlenir; unsupported/unsafe MusicXML playback'i `UNAVAILABLE` bırakır ve notation bağımsız kalır.

STUDENT-07B PR #8 ile `main` dalına merge edilmiştir. Feature head `5de1575e05f1822b1ee79ff113b4795c077a2a0b`, merge commit `a5ede988f198c49b70021d621554b55e6b961502`'dir. Post-merge CI #380 **314/314 PASS** vermiş; deterministic piano-bank regeneration/zero-diff ve `git diff --check` kapıları da geçmiştir. Fiziksel iPhone/Safari/VoiceOver Task 14 **16/16 PASS** olarak tamamlanmıştır. Offline kabul sırasında bulunan notation-root connectivity repaint hatası TDD ile düzeltilmiş ve Service Worker cache'i v5'e yükseltilmiştir.

STUDENT-07B çekirdeği iki kalite kullanır: güvenilir dış timing provider'dan doğrulanmış plan varsa `FULL`; aksi halde desteklenen MusicXML'den bounded derlenen `APPROXIMATE`. Default route `APPROXIMATE`'tır. Ses motoru aynı-origin Web Audio + deterministik yerel piyano bankası kullanır. Banka bir oktavdaki 12 kromatik perde sınıfını (C–B) temsil eden 12 PCM16 WAV örneğidir; bu ifade “aynı anda yalnız 12 ses” anlamına gelmez. Farklı oktavlar `playbackRate` ile eşlenir ve çok sesli MusicXML aynı anda birden fazla note event çalabilir.

`content.guitarTab` ve `content.violin` nesnelerinin iç sözleşmesi henüz tanımlı değildir; yalnız nesnenin varlığı bu capability'leri açmaz. MusicXML'in kendi içinde bulunan tablature, ST renderer tarafından notation sunumunun parçası olarak gösterilebilir.

STUDENT-07A durumunda default bootstrap yalnız Practice ekranında ihtiyaç olduğunda same-origin runtime loader'ı çalıştırır. Pin: Rendering Layer `49dcb4737e802f956fc483ab2c8eac62a2508846`, renderer contract `0.2.0`, OSMD `2.1.2`. Runtime önce vendor OSMD varlığını, sonra ST browser bootstrap'ını yükler; contract/asset hatası notation capability'sini bounded `ERROR`/`UNAVAILABLE` durumuna düşürür ve diğer Practice capability'lerini kilitlemez. Service Worker v5 notation runtime modülleriyle birlikte playback modüllerini de static shell'e alır; piano manifest/license/notices ve 12 WAV dosyası best-effort static playback cache'ine girer. Private Practice Package verisi yalnız IndexedDB'de kalır ve Cache Storage'a taşınmaz. STUDENT-07A renderer-specific fiziksel iPhone/Safari kabul testi tamamlanmıştır: nota ilk render, 10–15 saniye stabil kalma, yön değişimi, Ana Sayfa'dan yeniden açma ve offline reload/reopen akışları PASS.


## STUDENT-05 durumu

Offline cache ve foreground sync katmanı production provider kararıyla tanımlanmıştır:

- Production cloud provider: **Firebase Authentication + Cloud Firestore (Spark)**.
- Authenticated Firebase `uid`, Student App içindeki kararlı `studentId` değeridir.
- Firebase adapter'ları core sözleşmelerin arkasındadır; Student App core provider-neutral kalır.
- Practice Package'ın cihaz içi canonical offline deposu **IndexedDB**'dir.
- Service Worker yalnız explicit same-origin static app shell dosyalarını Cache Storage'da tutar; private Practice Package saklamaz.
- Çevrimiçi ve yetkili Practice açılışı, paketi IndexedDB'ye best-effort kaydeder. Cache yazımı başarısız olursa yetkili online çalışma engellenmez.
- Offline açılış, restore edilmiş güvenilir `studentId` oturumu ve o öğrenciye ait ACTIVE cache kaydı gerektirir.
- Online doğrulamada açık `REVOKED` sonucu öğrenilirse aynı publication'ın bütün cached package sürümleri erişime kapatılır.
- Ağ/provider/sync hatası tek başına geçerli ACTIVE cache'i REVOKED yapmaz.
- Aynı publication için yeni `packageId` eski immutable snapshot'ın üzerine yazılmaz; ayrı kayıt olarak korunur. Offline list/open davranışı en yeni ACTIVE cached sürümü seçer.
- Firestore'da listeleme yalnız publication manifest metadata'sını okur. Practice açılırken gerekli package chunk'ları alınır ve her chunk en fazla **256 KiB** olabilir.
- Firebase Cloud Storage, Background Sync API ve push notification STUDENT-05 kapsamında kullanılmaz.
- Firebase project provisioning, production config ve credential değerleri repository'ye commit edilmemiştir.

STUDENT-06 fiziksel iPhone / Safari / VoiceOver kabul testi tamamlanmıştır. STUDENT-07A notation runtime fiziksel doğrulaması ve STUDENT-07B playback/offline/VoiceOver Task 14 kabulü de tamamlanmıştır.


## STUDENT-08/09 tasarım yönü

Bu bölüm **design-only** durumdadır; henüz mevcut ürün davranışı değildir.

Hedef öğrenci arayüzü mümkün olduğunca sade tutulur:

- sol navigasyon: Havuz / Benim Çalışmalarım / Çıkış;
- iki-pane kullanılabilen ekranda yaklaşık %25 navigasyon, %75 içerik;
- Havuz yalnız repertuar ve duyuru kart/detayıdır; nota ekranı yoktur;
- Havuz varsayılan herkese açık, istenirse çoklu seçilen öğrencilere görünür;
- Benim Çalışmalarım: Aktif / Bitmiş / Repertuarım;
- completion ve repertuara alma yalnız öğretmen authority'sidir; öğrenci "Hazırım" butonu yoktur;
- aynı çalışma birden fazla öğrenciye atanabilir, fakat her öğrenci için ayrı private assignment ve ayrı öğretmen notu tutulur;
- çalışma tipleri: `SCORE` ve `CHORD_BOARD`;
- Chord Board ödevi MusicXML'e dönüştürülmez; öğretmenin seçtiği exact voicing snapshot'ı korunur;
- score practice'te öğrenci nota seçmez; ölçüye dokunmak o ölçünün bir kez dinlenmesini hedefler;
- playback cursor ve aktif nota/akor highlight otomatik geri bildirimdir.

Tasarım belgesi: `docs/superpowers/specs/2026-09-22-student-08-09-simple-sharing-interactive-practice-design.md`.

Rendering Layer ve Chord Board bu tasarımda read-only architectural dependencies/references olarak değerlendirilmiştir. Bu dokümantasyon değişikliği cross-repository runtime veya source write yetkisi vermez.
