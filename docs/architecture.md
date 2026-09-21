# ST Student App v1 Mimari Sözleşmesi

## 1. Amaç

ST Student App, öğretmenin SesliTab içinde düzenleyip onayladığı çalışmayı öğrencinin hesabında açar. Öğrenci OMR, MusicXML düzenleme veya öğretmen editörüyle uğraşmaz.

## 2. İlk sürüm kullanıcı yüzeyi

Yalnız dört ana adım hedeflenir:

1. Giriş
2. Havuz
3. Benim Çalışmalarım
4. Çalışmayı Aç

Çalışma görünümünde nota, ritim, playback ve paket içinde mevcutsa Guitar TAB veya keman verisi gösterilebilir.

## 3. Sistem sınırı

```text
Teacher App
  -> teacher_approved revision
  -> Sharing Layer
  -> Practice Package v1
  -> Student App
```

Student App öğretmen veritabanını doğrudan okumaz. Paylaşım katmanı öğrenciye yalnız gerekli ve onaylanmış veriyi verir.

## 4. Paylaşım kapsamları

v1 yalnız iki kapsam tanır:

- `public_pool`: tüm yetkili öğrencilerin görebileceği ortak havuz.
- `student_private`: yalnız belirtilen öğrenci hesabına ait çalışma.

Grup, mesajlaşma, puanlama, sosyal profil ve ödeme sistemi v1 kapsamı dışındadır.

## 5. Practice Package ilkeleri

- Paket tek bir teacher-approved revision'a bağlıdır.
- Revizyon kimliği paket içinde korunur.
- Yeni öğretmen düzeltmesi eski paketi sessizce değiştirmez.
- Yeni revizyon yeniden onaylanmadan öğrenciye yayınlanamaz.
- Student App paketi salt-okunur tüketir.
- OMR çalışma verisi, editor state, debug çıktıları ve öğretmen kontrol alanları pakete girmez.
- Canonical müzik olayları downstream nota/ritim/playback tüketicileri için ortak kaynak olarak taşınır.
- MusicXML öğrenciye dosya arayüzü olarak gösterilmez; score render girdisi olarak paket içinde bulunabilir.

## 6. Offline-first

Öğrenci bir çalışmayı ilk kez çevrimiçi indirir. Practice Package cihazda yerel olarak saklanabilir. Ağ yokken indirilen çalışma açılmaya devam eder.

Yeni onaylı revizyon geldiğinde Student App bunu ayrı sürüm olarak algılar. Eski indirilen çalışma sessizce mutate edilmez.

## 7. Kimlik ve sunucu

Auth ve depolama sağlayıcısı bu pakette seçilmez. Yaklaşık 40 öğrenci için yönetilen bir servis yeterli olabilir; ancak Firebase, Supabase veya başka sağlayıcı seçimi ayrı ve ölçülü bir karar paketidir.

Sunucu/servis katmanının minimum sorumlulukları:

- kullanıcı kimliği
- öğrenci yetkilendirmesi
- public/private paylaşım kaydı
- Practice Package teslimi
- paylaşımı geri çekme
- yeni onaylı sürüm bilgisini sağlama

## 8. Güvenlik

- `student_private` içerik yalnız hedef öğrenci tarafından okunabilir.
- Student App teacher approval üretemez.
- Student App kaynak revizyonu değiştiremez.
- Paket içinde gereksiz kişisel veri taşınmaz.
- Public havuz içeriği ile kişisel atama aynı erişim kaydı gibi ele alınmaz.

## 9. Sonraki bounded paketler

1. Practice Package v1 sözleşmesi ve testleri — bu paket.
2. Auth + Sharing Layer karar ve güvenlik sözleşmesi.
3. Minimal Student App shell: Giriş / Havuz / Benim Çalışmalarım.
4. Salt-okunur çalışma ekranı.
5. Offline cache/sync.
6. iPhone VoiceOver ve erişilebilirlik kabul testleri.
