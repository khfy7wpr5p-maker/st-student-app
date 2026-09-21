# ST Student App

ST Student App, SesliTab öğretmen uygulamasında hazırlanıp **öğretmen tarafından onaylanan** çalışmaların öğrenci tarafından erişilebilir ve salt-okunur biçimde kullanılacağı uygulamadır.

## MVP akışı

Giriş -> Havuz / Benim Çalışmalarım -> Çalışmayı Aç -> Nota / Ritim / Dinle / varsa TAB veya Keman -> çevrimdışı çalışma

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

STUDENT-02, provider-neutral öğrenci session ve Sharing Layer sözleşmelerini tanımlar. Bu aşamada gerçek auth/bulut sağlayıcısı seçilmemişti. STUDENT-05 ile production provider kararı Firebase Authentication + Cloud Firestore olarak alınmıştır; Firebase proje provisioning/configuration bilgileri henüz repository'ye bağlanmamıştır.


## STUDENT-03 durumu

Minimal öğrenci uygulaması shell'i eklenmiştir:

- Giriş
- Ana Sayfa
- Havuz
- Benim Çalışmalarım
- Çalışmayı Aç

UI, STUDENT-02 salt-okunur Sharing Service'ine bağlanan provider-neutral controller kullanır. STUDENT-05 Firebase adapter'larını eklemiştir; buna rağmen varsayılan static giriş noktası production Firebase config/credential üretmez ve sahte öğrenci hesabı oluşturmaz.


## STUDENT-04 durumu

Salt-okunur Practice Workspace capability-aware çalışır:

- `AVAILABLE`: özellik gerçekten kullanılabilir.
- `UNAVAILABLE`: paket/runtime bu özelliği güvenilir biçimde sağlamıyor.
- `ERROR`: özellik başlatılırken/çalışırken hata oluştu; diğer özellikler bağımsız kalır.

Nota, Student App-owned adapter üzerinden ST Score Rendering Layer sözleşmesine bağlanır. Student App doğrudan OSMD import etmez ve renderer assetlerini/CDN adreslerini bundle etmez.

Practice Package içindeki MusicXML yalnız private render girdisidir; öğrenci HTML'ine veya hata mesajlarına yazılmaz.

Mevcut package sözleşmesi canonical event zamanlamasını tanımlamadığı için varsayılan build playback üretmez. Trusted playback port bağlanmadığında Dinleme, tempo değiştirme ve ölçü tekrarı dürüstçe `UNAVAILABLE` kalır.

`content.guitarTab` ve `content.violin` nesnelerinin iç sözleşmesi henüz tanımlı değildir; yalnız nesnenin varlığı bu capability'leri açmaz. MusicXML'in kendi içinde bulunan tablature, ST renderer tarafından notation sunumunun parçası olarak gösterilebilir.

Not: Default bootstrap ST notation adapter'ını bağlar ancak doğrulanmış renderer runtime asset graph'ını deploy etmez. `globalThis.__ST_SCORE_RENDER_HOST__` bulunmadığında notation `UNAVAILABLE` olur.


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

Gerçek fiziksel iPhone / Safari / VoiceOver kabul testi STUDENT-06 kapsamındadır.
