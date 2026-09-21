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


## 10. STUDENT-02 — Account + Sharing Layer

### Kimlik

- Authenticated öğrenci oturumu kararlı dahili `studentId` taşır.
- `email` ve `displayName` yalnız sunum/giriş sağlayıcısı bağlamı içindir; yetkilendirme anahtarı değildir.
- Geçerli `studentId` bulunmayan oturum unauthenticated kabul edilir.

### Sharing kayıtları

Practice Package ile operasyonel `Publication` kaydı ayrı sorumluluklardır.

- `public_pool` Publication kaydı `recipientStudentId` taşımaz.
- `student_private` Publication kaydı hedef `recipientStudentId` taşır.
- Package içindeki STUDENT-01 publication metadata ile operasyonel Publication scope/recipient bilgisi publish sırasında eşleşmek zorundadır.
- `revokedAt` bulunan yayınlar yeni online Public Pool / My Work okumalarından çıkarılır.
- STUDENT-02, daha önce cihaza indirilmiş offline veriyi uzaktan sildiğini iddia etmez.

### Provider sınırı

Core paylaşım servisi vendor SDK'sına değil repository davranışlarına bağlıdır.

İlk adapter'lar deterministik in-memory uygulamalardır. Gerçek auth/persistence sağlayıcısı, credential, billing ve production provisioning bu aşamada seçilmez.

### Sürüm güvenliği

- `packageId` repository içinde overwrite edilemez.
- Repository, kabul edilen Practice Package'ın deep-frozen snapshot'ını saklar.
- Yeni teacher-approved revision ayrı `packageId` / ayrı sürüm olarak yayınlanır.
- Var olan yayınlanmış paket sessizce mutate edilmez.


### Servis yüzeyleri

STUDENT-02 iki ayrı servis yüzeyi kullanır:

- `createSharingService`: Student App için salt-okunur yüzeydir; yalnız Public Pool, My Work ve tek çalışma okuma işlemlerini sunar. `publish` veya `revoke` işlemi içermez.
- `createSharingManagementService`: Sharing Layer'ın güvenilen yönetim yüzeyidir; yayınlama ve geri çekme işlemlerini içerir. Bu yüzey Student App'e verilmez. Gerçek provider/admin kimlik doğrulaması STUDENT-02 kapsamı dışındadır ve provider adapter aşamasında bağlanacaktır.

Public Pool ve My Work sorguları repository adapter sonucuna körü körüne güvenmez. Public Pool yalnız `public_pool`; My Work yalnız oturumdaki aynı `studentId` hedefli `student_private` kayıtlarını kabul eder. Yanlış scope döndüren adapter sonucu fail-closed biçimde reddedilir.

`revokedAt`, null değilse boş olmayan bir string olmak zorundadır. Bu aşamada timestamp biçiminin provider-level canonicalization'ı ayrıca seçilmemiştir.

Gerçek persistence adapter'ı eklenirken package + publication yazımının atomik/transactional davranışı ayrıca tanımlanmalıdır; STUDENT-02'nin deterministik in-memory adapter'ı production veritabanı transaction'ı iddiasında bulunmaz.


## 11. STUDENT-03 — Minimal Student App Shell

### UI yaklaşımı

STUDENT-03 yeni framework veya dependency eklemez. Shell vanilla ECMAScript modules ve semantic HTML ile çalışır.

Katmanlar:

- `studentAppController.js`: navigation ve safe UI state.
- `renderStudentApp.js`: semantic HTML renderer.
- `shellActions.js`: whitelist edilmiş öğrenci action dispatcher.
- `mountStudentApp.js`: ince browser event/mount adapter.
- `index.html` + `main.js`: sağlayıcısız güvenli static giriş noktası.

### Ekranlar

- Sign In
- Home
- Public Pool
- My Work
- Practice shell

Practice ekranı STUDENT-03'te yalnız güvenli başlık/navigation yüzeyidir. Nota, playback, ritim, Guitar TAB, keman görünümü ve offline cache daha sonraki bounded aşamalardır.

### Veri minimizasyonu

Controller, Sharing Service'den gelen tam Practice Package'ı renderer'a taşımaz.

UI state'e yalnız:

- `publicationId`
- `packageId`
- `title`

özetleri alınır.

MusicXML, `recipientStudentId`, approval/revision internalleri, OMR/debug/editor alanları renderer'a taşınmaz.

Authenticated session da dış adapter nesnesi olarak tutulmaz. Controller yalnız frozen `{ studentId }` snapshot'ı saklar; dışarıdaki session nesnesi mutate edilse bile mevcut öğrenci kimliği değişmez.

### Yetki yüzeyi

Student shell yalnız read/navigation action'ları tanır:

- Public Pool
- My Work
- Home
- Open Practice
- Sign Out
- host-provided Sign In request

`publish`, `revoke`, delete ve diğer management/write action'ları unsupported'tur.

### Auth provider sınırı

STUDENT-03 auth sağlayıcısı seçmez ve credential saklamaz. Browser mount gelecekteki host/provider'dan `requestSignIn` callback alabilir.

Default `main.js` herhangi bir fake kullanıcı veya credential üretmez. Provider yokken Sign In action'ı disabled render edilir.

### Erişilebilirlik tabanı

- semantic headings
- semantic nav
- gerçek button elementleri
- list semantics
- görünür empty-state metni
- `role="status"` / `aria-live="polite"` status region
- keyboard-visible focus styling

Gerçek iPhone/Safari/VoiceOver kabul testi STUDENT-06'da yapılacaktır.
