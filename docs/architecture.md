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

STUDENT-05 ile production provider kararı **Firebase Authentication + Cloud Firestore (Spark)** olarak alınmıştır. Firebase seçimi adapter sınırının arkasındadır; Student App core vendor SDK tiplerine bağlı değildir.

Firebase Authentication kullanıcı `uid` değeri ilk production adapter için kararlı `studentId` olarak kullanılır. E-posta, display name veya nickname yetkilendirme kimliği yerine geçmez.

STUDENT-06 ile browser production Firebase wiring'i repository'ye bağlanmıştır. Browser client project config değeri yetkilendirme otoritesi değildir; admin credential, servis hesabı ve secret authority repository'ye commit edilmez. Default bootstrap sahte kullanıcı üretmez ve authenticated Firebase `uid` olmadan öğrenci oturumu oluşturmaz.

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

Authenticated session da dış adapter nesnesi olarak tutulmaz. Controller yalnız frozen `{ studentId }` snapshot'ı saklar; dışarıdaki session nesnesi mutate edilse bile mevcut öğrenci kimliği değişmez. Controller'ın dışarı sunduğu UI state ve item listeleri de frozen'dır.

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


## 12. STUDENT-04 — Read-only Practice Workspace

### Capability modeli

Practice Workspace birbirinden bağımsız capability durumları kullanır:

- `AVAILABLE`
- `UNAVAILABLE`
- `ERROR`

İlk anahtarlar:

- notation
- playback
- tempoChange
- measureRepeat
- guitarTab
- violin

Bir capability'nin hata/eksikliği bütün çalışma ekranını kilitlemez.

### Güvenli workspace projection

Authorized Practice Package iki ayrı iç yüzeye ayrılır:

```text
authorized delivery item
  -> safe frozen workspace view-model -> Student HTML
  -> private frozen render source     -> notation adapter only
```

Student UI state yalnız gerekli sunum bilgilerini taşır. MusicXML, canonical event ham verisi, approvedRevision, publication nesnesi, recipient, OMR/debug/editor alanları HTML renderer'a verilmez.

MusicXML private render source olarak tutulur ve yalnız notation adapter'a geçirilir.

### Notation sınırı

Student App doğrudan OpenSheetMusicDisplay kullanmaz.

Student App-owned `createStNotationAdapter()` şu ST-owned runtime sınırını feature-detect eder:

```text
globalThis.__ST_SCORE_RENDER_HOST__
```

Beklenen renderer contract version:

`0.2.0`

Mimari doğrulamada referans alınan ST Score Rendering Layer revision:

`13c32eefccd5bf2c227e815aa27aae4a0583801d`

Runtime'ın `renderMusicXml` ve `dispose` metodları birlikte yoksa ve güvenilir same-origin runtime kurulabilir değilse notation `UNAVAILABLE` olur. STUDENT-07A ile installable pinned runtime da capability discovery'ye dahildir. Runtime yükleme/render hatası bounded biçimde notation `ERROR` durumuna çevrilir; ham exception öğrenciye çıkmaz.

Practice HTML, notation AVAILABLE olduğunda renderer-owned DOM hedefi olarak:

`#st-score-root`

oluşturur.

Mount katmanı notation lifecycle'ını serialize eder. Aynı immutable package aynı DOM generation içinde tekrar render edilmez. Package değişiminde önce eski presentation dispose edilir, sonra yeni kaynak render edilir. Practice ekranından çıkış ve mount destroy da aktif notation presentation'ını dispose eder.

### Runtime asset gerçekliği

STUDENT-04 aşamasında renderer runtime asset graph'ı henüz Student App'e bağlanmamıştı. STUDENT-07A ile bu eksik production entegrasyonu same-origin ve pinned biçimde tamamlanır:

- Rendering Layer source revision: `49dcb4737e802f956fc483ab2c8eac62a2508846`
- renderer contract: `0.2.0`
- OSMD vendor pin: `2.1.2`
- asset root: `vendor/st-score-runtime/`
- provenance/integrity authority: `runtime-manifest.json`
- bare module specifier çözümü: Student App static import map
- load order: vendor OSMD global -> ST browser bootstrap -> `st-score-render-host-ready`
- `#st-score-root`, runtime bootstrap yüklenmeden önce Practice DOM içinde mevcut olmalıdır.

Student App doğrudan OSMD nesnelerini ürün sözleşmesi yapmaz. Runtime CDN'den alınmaz. Service Worker yalnız bu static runtime graph'ını app shell ile cache'ler; private Practice Package hiçbir zaman Cache Storage'a taşınmaz.

### Playback ve practice kontrolleri

ST Score Rendering Layer playback motoru değildir.

Practice Package v1 şu anda `canonicalEvents: array<object>` taşır fakat güvenilir onset/duration playback şeması tanımlamaz. Student App bu veriden timing tahmin etmez.

Default bootstrap trusted playback port inject etmez; bu nedenle playback `UNAVAILABLE` olur.

Bir gelecekteki trusted playback port playback'i ancak şu gerçek metodları sağladığında AVAILABLE yapabilir:

- `canPlayPackage`
- `playPackage`
- `pausePackage`
- `restartPackage`

Tempo değişikliği ayrıca:

- öğretmenin `allowTempoChange === true` iznini,
- `canChangeTempoForPackage`,
- `setTempoForPackage`

gerektirir.

Ölçü tekrarı ayrıca:

- öğretmenin `allowMeasureRepeat === true` iznini,
- `canRepeatMeasureForPackage`,
- `setMeasureRepeatEnabledForPackage`

gerektirir.

Bu port package timing'inin gerçek otoritesidir; Student App canonicalEvents yapısını tahmin etmez.

Trusted playback/practice port çağrısı runtime sırasında hata verirse yalnız ilgili capability `ERROR` durumuna geçirilir: playback hatası notation'ı değiştirmez; tempo hatası playback'i değiştirmez; measure-repeat hatası playback'i değiştirmez. Raw backend exception state/HTML içine yazılmaz ve shell yalnız bounded öğrenci mesajı gösterir.

### TAB ve keman

`content.guitarTab` ve `content.violin` nesnelerinin item contract'ları tanımlı olmadığı için non-null olmaları capability'yi AVAILABLE yapmaz.

MusicXML içinde renderer'ın desteklediği tablature varsa bu notation rendering'in parçası olarak gösterilebilir; Student App ayrıca string/fret çıkarımı yapmaz.

### Güvenlik ve erişilebilirlik

- Student App publish/revoke/edit/delete surface eklemez.
- Practice state frozen snapshot'tır.
- Ham MusicXML öğrenci HTML/status metnine girmez.
- Internal exception metinleri öğrenciye gösterilmez.
- Notation region accessible label taşır.
- Unavailable kontroller sahte aktif button olarak gösterilmez.
- STUDENT-06 genel iPhone/Safari/VoiceOver acceptance tamamlanmıştır. STUDENT-07A'nın yeni notation runtime davranışı için renderer-specific fiziksel acceptance merge öncesi tekrar yapılmalıdır.
- Offline cache/sync STUDENT-05 kapsamındadır.


## 13. STUDENT-05 — Offline Cache and Sync

### Veri sahipliği

STUDENT-05 üç farklı storage sorumluluğunu ayırır:

- **Cloud Firestore:** online publication manifest metadata'sı ve bounded Practice Package chunk teslimi.
- **IndexedDB:** öğrenci cihazındaki canonical private Practice Package offline cache'i.
- **Service Worker + Cache Storage:** yalnız static application shell.

Service Worker private Practice Package deposu değildir ve IndexedDB'nin yerini alamaz.

### Online ve offline Practice açılışı

Çevrimiçi Practice açılışında önce Sharing Layer authorization başarılı olmak zorundadır. Yetkili delivery item döndükten sonra IndexedDB cache yazımı best-effort yapılır. IndexedDB quota/availability gibi cache hataları yetkili online Practice'i engellemez ve raw provider hata metni Student UI'a çıkmaz.

Offline Practice açılışı için:

1. güvenilir bir authenticated `studentId` restore edilmiş olmalıdır;
2. cache kaydı aynı öğrenciye ait olmalıdır;
3. kayıt `ACTIVE` olmalıdır;
4. `student_private` paketlerde recipient aynı `studentId` ile eşleşmelidir.

Cross-student cache okumaları fail-closed davranır.

### Sürüm ve revocation davranışı

Offline cache kimliği `studentId + publicationId + packageId` bileşimidir.

- Yeni approved `packageId`, eski immutable snapshot'ı overwrite etmez.
- Aynı publication'ın birden fazla immutable package sürümü cihazda korunabilir.
- Offline list/open yüzeyi yalnız en yeni ACTIVE cached sürümü sunar.
- Foreground sync her publication'ı bir kez doğrular.
- Provider açıkça `REVOKED` döndürürse aynı publication'ın cihazdaki bütün package sürümleri REVOKED olur.
- Provider `ACTIVE` ve cache'deki belirli bir `packageId` döndürürse yalnız o exact immutable sürümün verification zamanı yenilenir.
- Provider daha yeni fakat henüz cache'lenmemiş bir ACTIVE `packageId` bildirirse eski cache otomatik silinmez veya revoke edilmez.
- Network/provider/sync exception veya geçersiz provider sonucu revocation kanıtı sayılmaz.

### Firestore taşıma sözleşmesi

Firestore Practice Package transport:

- publication manifest + bounded chunk documents kullanır;
- Public Pool / My Work listelerinde package chunk'larını çekmez;
- chunk'ları yalnız Practice açıkça açılırken alır;
- chunk payload sınırını `256 * 1024` byte olarak uygular;
- chunk count, index, toplam byte, UTF-8 ve JSON bütünlüğünü yeniden doğrular;
- reconstructed package'ı tekrar publishability doğrulamasından geçirir.

Client Security Rules read-only'dir. Public kayıtlar authenticated öğrencilere okunabilir; private kayıtlar yalnız `request.auth.uid == studentId` olduğunda okunabilir. Client publish/revoke/write yetkisi taşımaz.

### Bilinçli olarak bulunmayan bileşenler

STUDENT-05 aşağıdakileri eklemez:

- Firebase Cloud Storage
- Background Sync API
- push notification
- billing / paid-plan automation
- production credential provisioning
- Teacher App contract değişikliği

Fiziksel iPhone / Safari / VoiceOver acceptance ve gerçek cihaz offline akış testi STUDENT-06'ya bırakılmıştır.


## 14. STUDENT-07A — Production Notation Runtime Integration

STUDENT-07A'nın amacı authorized Practice Package MusicXML'ini mevcut `Nota` bölgesinde ST-owned Rendering Layer browser runtime üzerinden göstermek; teacher authority, private offline package storage ve bağımsız capability modelini değiştirmemektir.

Runtime yalnız notation presentation authority'sine sahiptir. Student App:

- `vendor/st-score-runtime/` altındaki manifest-doğrulanmış same-origin export'u kullanır;
- Practice ekranı açılmadan renderer bootstrap'ını çalıştırmaz;
- OSMD vendor global'ını bootstrap'tan önce yükler;
- static import map ile yalnız pinned local ST module yollarını çözer;
- aynı Practice içindeki repaint sırasında aktif `#st-score-root` DOM kimliğini korur;
- package değişimi, Practice'ten çıkış, sign-out veya mount destroy durumunda aktif renderer lifecycle'ını dispose eder;
- runtime/contract/render hatasını yalnız notation capability'sine sınırlar;
- raw MusicXML, runtime exception veya provider detail'i öğrenci HTML/status yüzeyine taşımaz;
- offline notation için static renderer asset graph'ını Service Worker cache'ine ekler;
- private Practice Package'ı IndexedDB dışına taşımaz.

STUDENT-07A playback authority eklemez. Playback, tempo ve measure-repeat için güvenilir timing/playback port keşfi ayrı STUDENT-07B kapsamındadır.
