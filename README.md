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

STUDENT-02, provider-neutral öğrenci session ve Sharing Layer sözleşmelerini tanımlar. Gerçek auth/bulut sağlayıcısı ve UI framework'ü hâlâ bilinçli olarak seçilmemiştir.


## STUDENT-03 durumu

Minimal öğrenci uygulaması shell'i eklenmiştir:

- Giriş
- Ana Sayfa
- Havuz
- Benim Çalışmalarım
- Çalışmayı Aç

UI, STUDENT-02 salt-okunur Sharing Service'ine bağlanan provider-neutral controller kullanır. Gerçek auth/bulut sağlayıcısı henüz bağlanmamıştır; varsayılan static giriş sayfası sahte öğrenci hesabı üretmez.
