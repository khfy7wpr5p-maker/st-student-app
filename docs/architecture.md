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
- Canonical müzik olayları downstream nota/ritim tüketicileri için ortak kaynak olarak taşınır. Practice Package v1 `canonicalEvents` alanı güvenilir onset/duration playback şeması tanımlamadığı için STUDENT-07B timing bu alandan türetilmez.
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

- Rendering Layer source revision: `78eec1d958923e871b5069f5026eed9e4ead2c33`
- renderer contract: `0.2.0`
- OSMD vendor pin: `2.1.2`
- asset root: `vendor/st-score-runtime/`
- provenance/integrity authority: `runtime-manifest.json`
- bare module specifier çözümü: Student App static import map
- load order: vendor OSMD global -> ST browser bootstrap -> `st-score-render-host-ready`
- `#st-score-root`, runtime bootstrap yüklenmeden önce Practice DOM içinde mevcut olmalıdır.

Student App doğrudan OSMD nesnelerini ürün sözleşmesi yapmaz. Runtime CDN'den alınmaz. Service Worker v4 notation ve playback modül graph'ını app shell ile cache'ler; piano manifest/license/notices ve 12 yerel WAV asset'i ayrı best-effort static listede tutulur. Private Practice Package hiçbir zaman Cache Storage'a taşınmaz.

### Playback ve practice kontrolleri

ST Score Rendering Layer playback motoru değildir. STUDENT-07B playback authority'si Student App içindeki ayrı bir playback katmanıdır.

Practice Package v1 hâlâ `canonicalEvents: array<object>` taşır fakat güvenilir onset/duration playback şeması tanımlamaz. Student App bu alandan timing tahmin etmez. Playback timing yalnız iki kaynaktan gelebilir:

1. exact package kimliğine bağlı, doğrulanmış trusted `FULL PlaybackPlan`;
2. desteklenen `score-partwise` MusicXML'den bounded derlenen `APPROXIMATE PlaybackPlan`.

Default STUDENT-07B route `APPROXIMATE`'tır. Trusted provider açıkça geçerli `FULL` plan döndürmedikçe `FULL` iddiası yapılmaz. Invalid/non-null trusted sonuç veya provider error fail-closed davranır; sessizce approximate'a düşülmez.

STUDENT-07B feature branch'inde şu çekirdek katmanlar uygulanmıştır:

- `src/playback/playbackPlan.js`: immutable plan sözleşmesi, quality, note/measure bounds.
- `src/playback/musicXmlPlaybackDom.js`: namespace-agnostic MusicXML DOM yardımcıları.
- `src/playback/musicXmlApproximatePlayback.js`: bounded approximate compiler.
- `src/playback/playbackPlanResolver.js`: trusted FULL precedence + explicit-null approximate fallback.
- `src/playback/pianoSampleBank.js`: same-origin 12-note chromatic piano bank manifest/loader.
- `src/playback/webAudioPianoEngine.js`: Web Audio scheduler, pause/resume/restart, tempo ve current-measure repeat.
- `src/playback/studentPlaybackPort.js`: Practice Workspace'in existing playback port yüzeyi üzerinde resolver + engine birleşimi.

Approximate compiler mevcut kapsamda chord, `backup/forward` polifonisi, tie merge, divisions, part transposition, numeric tempo map ve multi-part global measure alignment davranışlarını bounded biçimde işler. `score-timewise`, oversized XML, malformed timing cursor veya unsupported/unsafe materyal fail-closed olur. D.C./D.S./volta/repeat navigation, percussion ve ornament execution için kesinlik iddiası yapılmaz.

### Piyano ses bankası

Playback asset'leri `vendor/st-piano/` altındadır. Banka:

- 12 deterministik, repository-generated mono PCM16 WAV dosyası taşır;
- C4–B4 arasındaki 12 kromatik perde sınıfını temsil eder;
- 44.1 kHz, 2.5 saniye/sample'dır;
- toplam WAV payload'u 2,646,528 byte'dır;
- üçüncü taraf ses kaydı içermez;
- SHA-256 ve byte-length provenance bilgilerini `runtime-manifest.json` içinde taşır.

Bu mimari 12-note sample bank kullanır; polyphony'yi 12 simultaneous voice ile sınırlamaz. MIDI perde sınıfı C–B referans sample'ına eşlenir, oktav farkı `playbackRate = 2 ** ((midi - referenceMidi) / 12)` ile uygulanır. STUDENT-07B'de bütün part/voice'lar şimdilik aynı piyano sound family'sini kullanır.

### Playback kontrol sözleşmesi

Practice playback AVAILABLE olmak için validated plan + supported audio engine gerekir. Public Practice port yüzeyi:

- `canPlayPackage`
- `playPackage`
- `pausePackage`
- `restartPackage`
- `getPlaybackQualityForPackage`
- `getReferenceTempoForPackage`
- `disposePackage`

Tempo değişikliği ayrıca:

- öğretmenin `allowTempoChange === true` iznini,
- `canChangeTempoForPackage`,
- `setTempoForPackage`

gerektirir ve STUDENT-07B range'i 20–300 BPM'dir.

Ölçü tekrarı ayrıca:

- öğretmenin `allowMeasureRepeat === true` iznini,
- `canRepeatMeasureForPackage`,
- `setMeasureRepeatEnabledForPackage`

gerektirir. Repeat current-measure domain'ini enable anında capture eder.

Package switch, Home/Public Pool/My Work navigation, session change ve sign-out eski playback ownership'ini best-effort dispose eder. Slow sample load completion generation token ile stale hale getirilir; eski package gecikmiş async completion'dan ses başlatamaz.

Playback/practice port çağrısı hata verirse yalnız ilgili capability `ERROR` durumuna geçirilir: playback hatası notation'ı değiştirmez; tempo hatası playback'i değiştirmez; measure-repeat hatası playback'i değiştirmez. Raw backend exception state/HTML içine yazılmaz.

### Mevcut STUDENT-07B checkpoint

Feature branch: `feat/student-07b-hybrid-playback`.

- Task 1–13: otomatik geliştirme ve verification kapsamı tamamlanmıştır.
- Task 10 GREEN: `ceabfb1ec3a660166fd3260df7ce6a53db7893ac`, CI #311, 297/297 PASS.
- Task 11 GREEN: `0613f4b5d3a10ca478e085620d0c4147f2d47fcd`, CI #322, 302/302 PASS.
- Task 12 GREEN: `3a53ff08dbcd62ae0ccb0da063b4c88fbe319681`, CI #327, 307/307 PASS.
- Default browser bootstrap resolver + local piano sample bank + lazy Web Audio engine + StudentPlaybackPort'u bağlar. AudioContext yalnız playback etkileşimi gerektiğinde oluşturulur.
- Service Worker cache adı `st-student-shell-v4`'tür. Yedi playback modülü strict shell cache içindedir; piano manifest/license/notices ve 12 WAV best-effort static cache içindedir.
- Package switch/navigation/session/sign-out ve mount destroy aktif playback ownership'ini bounded biçimde dispose eder.
- Playback/sample/tempo/repeat hataları capability-local kalır; MusicXML, generated plan veya provider/sample hata detayı UI state/HTML'e taşınmaz.
- Task 13 automated verification code head: `9d7efe310ae0109454261d5c1d69d4f619aa27ad`; CI #338, 312/312 PASS. CI ayrıca `npm ci`, deterministik piano-bank regeneration + zero diff ve `git diff --check` çalıştırmıştır. Bağımsız Codex Engineering Guardrails review; spec/plan uyumu, parser/timing bounds, Web Audio lifecycle/race davranışı, authority/data-minimization, offline asset seti ve generated-audio provenance sınırlarında yeni material defect bulmamıştır.
- Task 14 fiziksel iPhone/Safari/VoiceOver, offline audio ve interaction acceptance henüz yapılmamıştır; bu kapı geçmeden merge-ready/production-ready iddiası yapılmaz.

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
- STUDENT-06 genel iPhone/Safari/VoiceOver acceptance tamamlanmıştır. STUDENT-07A'nın yeni notation runtime davranışı fiziksel iPhone/Safari üzerinde doğrulanmıştır: ilk render, 10–15 saniye stabil kalma, orientation change, Practice'ten çıkıp yeniden açma ve offline reload/reopen PASS.
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

Offline cache kimliği `studentId + access identity + packageId` bileşimidir.

- `PUBLICATION` erişiminde access identity `publicationId` değeridir.
- `SECURE_DELIVERY` erişiminde access identity exact `deliveryId` değeridir.
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


## 15. STUDENT-08 — Secure Delivery CHORD_BOARD Consumer

STUDENT-08 Secure Delivery consumer'ı iki öğrenci çalışma tipini strict discriminator ile ayırır:

```text
Secure Delivery assignment
  -> practiceType = SCORE
       -> mevcut SCORE Practice
       -> MusicXML / notation / playback sınırı
  -> practiceType = CHORD_BOARD
       -> dedicated CHORD_BOARD workspace
       -> exact immutable gitar akoru snapshot'ı
```

CHORD_BOARD, SCORE Practice Workspace'e veya MusicXML'e dönüştürülmez.

### Secure Delivery package sınırı

Secure Delivery assignment row artık yalnız şu iki tipi kabul eder:

- `SCORE`: mevcut `StudentPracticePackageV1` sözleşmesi değişmeden doğrulanır.
- `CHORD_BOARD`: `StudentChordBoardPackageV1` strict sözleşmesiyle doğrulanır ve restore edilir.

CHORD_BOARD paketinde:

- `schemaVersion === "1.0.0"`;
- `packageType === "CHORD_BOARD"`;
- `packageId === assignmentAuthority.assignmentId`;
- `assignmentAuthority.state === "teacher_assigned"`;
- `publication.scope === "student_private"`;
- assignment row ile package assignment/teacher-note authority eşleşir;
- unknown field, mixed SCORE/CHORD_BOARD payload, identity mismatch ve malformed voicing fail-closed olur.

SCORE package'ına `packageType` alanı eklenmez. Yanlış discriminator ile bir package diğer tipe fallback etmez.

### Exact akor otoritesi

CHORD_BOARD müzikal otoritesi `content.chordBoard` içindeki immutable snapshot'tır.

Snapshot:

- altıncı telden birinci tele doğru altı exact fret/finger değeri taşır;
- fret `-1` kapalı, `0` açık, `1..20` basılı tel anlamına gelir;
- finger `-1` kapalı, `0` açık, `1..4` sol el parmağı anlamına gelir;
- bare `finger/fret/fromString/toString` geometrisini exact korur;
- symbol, catalog order veya voicing index üzerinden yeni pozisyon türetmez.

Student UI provenance ve fingerprint internallerini göstermez.

### Student08 read/controller ayrımı

Online read service iki ayrı method kullanır:

- `getScorePracticeItem({ session, assignmentId })`
- `getChordBoardPracticeItem({ session, assignmentId })`

Her iki envelope explicit `practiceType` taşır. SCORE methodu CHORD_BOARD'u; CHORD_BOARD methodu SCORE'u fail-closed reddeder.

Controller:

- SCORE assignment'ı mevcut `PRACTICE` ekranına açar;
- CHORD_BOARD assignment'ı ayrı `CHORD_BOARD` ekranına açar;
- CHORD_BOARD açılırken notation runtime, MusicXML parser veya SCORE playback ownership başlatmaz;
- session-generation kontrolüyle önceki öğrenci oturumundan geç gelen async sonucu yok sayar;
- renderer state'e raw package yerine yalnız student-safe chord view model taşır.

### Öğrenci CHORD_BOARD workspace

My Work içindeki desteklenen CHORD_BOARD kartı mevcut `open-assignment` read/navigation action'ıyla açılır.

Dedicated workspace salt-okunurdur ve:

- akor sembolü/başlığı;
- altı telin exact muted/open/fretted durumu;
- exact fret ve finger numarası;
- exact bare geometrisi;
- öğretmen notu;
- bounded offline availability

gösterir.

Visual chord diagram `aria-hidden` sunum katmanıdır. Ayrı semantic listede her tel VoiceOver için metinle ifade edilir; bare bilgisi de finger/fret/string aralığıyla metinsel olarak sunulur. SCORE `#st-score-root`, tempo, measure-repeat ve playback kontrolleri bu workspace'e girmez.

### Offline ve revocation

SCORE ve CHORD_BOARD Secure Delivery package'ları aynı authorized IndexedDB repository'yi kullanır; ayrı CHORD_BOARD database/store oluşturulmaz.

Yeni Secure Delivery offline kayıtları explicit `practiceType` taşır. Record kimliği değişmez:

```text
studentId + SECURE_DELIVERY:deliveryId + packageId
```

Kurallar:

- online read sonrası authorized package best-effort cache edilir;
- cache yazım hatası yetkili online açılışı engellemez;
- offline reopen yalnız aynı authenticated local `studentId` + exact accessRef + ACTIVE kayıt ile mümkündür;
- SCORE cache CHORD_BOARD read'i, CHORD_BOARD cache SCORE read'i karşılayamaz;
- eski persisted Secure Delivery SCORE kaydı `practiceType` taşımıyorsa yalnız package'ın legacy SCORE sözleşmesine uyduğu durumda SCORE olarak restore edilir;
- CHORD_BOARD tipi symbol/content tahminiyle infer edilmez;
- exact 404/NOT_FOUND mevcut Secure Delivery status sözleşmesinde REVOKED olur;
- transient provider failure revocation kanıtı değildir.

IndexedDB store adı ve primary key formatı bu entegrasyonda değiştirilmez.

Private SCORE/CHORD_BOARD package payload'ları Service Worker Cache Storage'a girmez. Service Worker yalnız static application shell/runtime asset'lerini cache'ler.

### Güvenlik sınırı

Student App assignment/lifecycle için salt-okunurdur.

UI veya public controller state'e şunlar taşınmaz:

- Firebase ID token / provider UID;
- teacher ID veya recipient list;
- Firestore path/evidence ID;
- package provenance repository/commit/catalog fingerprint;
- voicing fingerprint;
- backend stack trace veya raw provider detail.

Authorization request/body student ID'den değil authenticated server response + mevcut local session'dan gelir. Cross-student cache erişimi fail-closed davranır.

### Bu aşamanın eklemediği davranışlar

STUDENT-08 CHORD_BOARD consumer:

- öğretmen editörü veya lifecycle write authority eklemez;
- chord selection/editing eklemez;
- yeni chord audio/playback eklemez;
- SesliTab producer veya `st-guitar-chord-board` repository'sine runtime dependency eklemez;
- production Firebase credential/rules/index/deployment değişikliği yapmaz.
