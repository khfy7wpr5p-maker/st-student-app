# ST Student / SesliTab — arayüz kapanışı ve uyumluluk incelemesi

İlk inceleme: 21 Ekim 2026. Son kaynak/kayıt eşitlemesi: 28 Ekim 2026, Europe/Istanbul. Dosya adı ilk incelemenin bağlantısını korur. Bu çalışma yalnız belgeleri günceller; uygulama, öğretmen/backend davranışı, veritabanı, ses motoru ve dağıtım ayarları değiştirilmez.

## Güncel kaynak ve kabul durumu — 28 Ekim 2026

| Yüzey | Doğrulanmış kaynak / kayıt |
| --- | --- |
| Student kaynak baseline | `1bb7692a3153a37425b04352739bd87f1a031a04` — birleşmiş PR #76 |
| Kaynak Service Worker shell | `st-student-shell-v49`; eski `CACHE_NAME` v18 ve örnek cache v1 ayrı statik yüzeylerdir |
| Renderer source / contract / OSMD | `a015f9049149037c48ac764ab30ed2bcbbe200d3` / `0.2.0` / `2.1.2` |
| Ses runtime / public contract | `0.3.0` / `0.2.0`; sourceRevision `34637d92b8c8a7c56f0e6850449e747e7e4ef711` |
| Eser İste HTTP + round-trip | [SES-243](https://linear.app/seslitab/issue/SES-243) Done; teknik düzeltme ve kullanıcı PASS kaydı |
| iPhone/PWA cihaz kabulü | [SES-242](https://linear.app/seslitab/issue/SES-242) Done; 26 Ekim kullanıcı PASS/kapatma kararı |
| Nota/TAB tel–perde VoiceOver | [SES-259](https://linear.app/seslitab/issue/SES-259) Backlog; ertelenmiş geliştirme, tamamlandı sayılmaz |
| TAB exact tel/perde testleri | [Student #76](https://github.com/khfy7wpr5p-maker/st-student-app/pull/76) merged; [SES-228](https://linear.app/seslitab/issue/SES-228) Done |

Sürüm değerleri kaynak `service-worker.js` ve iki runtime manifestinden okunmuştur. PR #102/#103 çok partili ses ve açık part-enstrüman eşlemesini, #104 ses kalibrasyonu/MusicXML dinamiklerini, #105 çevrimdışı geri çekme uzlaştırmasını içerir. #106 belge eşitlemesidir; #76 yalnız test/fixture ve [doğrulama belgesi](qualification/ses228-tab-render.md) değiştirir. Ayrıntılar [mimari sözleşmesinin güncel bölümündedir](architecture.md).

Bu eşitleme yeni canlı Render sürümü, kurulu cihaz cache yükseltmesi veya bağımsız fiziksel test kanıtı değildir. Kullanıcı PASS kayıtları kendi kabul kapsamlarında geçerlidir; tüm platform/VoiceOver/offline matrisine genişletilmez.

## 21 Ekim kaynakları ve yayın kanıtı — tarihsel anlık görüntü

| Yüzey | Doğrulanmış kaynak / durum |
| --- | --- |
| ST Student | `a958dc077c822b3b6c31b51f283fad5d5b13439d` |
| Student kaynak ağacı | `793a773fdddd28de88ed731763368f3f66773286` |
| SesliTab öğretmen + API | `c1139563bb3120a9d4bbc359ba6d72205c8c0942` |
| Student renderer source | `a015f9049149037c48ac764ab30ed2bcbbe200d3` |
| Renderer contract / OSMD | `0.2.0` / `2.1.2` |
| Kurulu uygulama shell'i | `st-student-shell-v40`; eski `CACHE_NAME` v18 ve örnek cache v1 ayrı statik yüzeylerdir |
| Kalıcı Student | https://st-student-app.onrender.com |
| Kalıcı API | https://st-student-api.onrender.com/api/secure-delivery/v1 |
| Student birleşme sonrası CI | [39540928628](https://github.com/khfy7wpr5p-maker/st-student-app/actions/runs/39540928628), test + renderer + Chromium + WebKit + Pages başarılı |

Bu tablo ve CI bağlantısı 21 Ekim ilk incelemesinin tarihsel kaynaklarıdır; güncel kaynak veya kurulu cihaz sürümü değildir. Güncel kaynak ve kabul durumu yukarıdaki tabloda tutulur. Tarihsel test kanıtları kendi baseline'larına bağlıdır.

## Tamamlanan arayüz işleri

| PR | Sonuç |
| --- | --- |
| [Student #88](https://github.com/khfy7wpr5p-maker/st-student-app/pull/88) | Giriş sonrası Fusion ana ekran, Havuz / Çalışmalarım kartları |
| [#89](https://github.com/khfy7wpr5p-maker/st-student-app/pull/89) | Çalışmalarım ve Eser İste sunumu; istek listesi Eser İste içinde |
| [#90](https://github.com/khfy7wpr5p-maker/st-student-app/pull/90) | Havuz listesi, boş durum, detay ve geri dönüş tasarımı |
| [#91](https://github.com/khfy7wpr5p-maker/st-student-app/pull/91) | Eser çalışma ekranı; Nota / TAB / Akorlar, öğretmen notu, odak, transport ve tempo |
| [#92](https://github.com/khfy7wpr5p-maker/st-student-app/pull/92) | Telefonda doğal dikey nota akışı, erişilebilir alt kontroller ve ayrı %60–150 nota boyutu |
| [renderer #40](https://github.com/khfy7wpr5p-maker/st-score-rendering-layer/pull/40), [Student #93](https://github.com/khfy7wpr5p-maker/st-student-app/pull/93) | OSMD yeniden çiziminde turuncu Nota/TAB işaretleri ve fret ownership indeksinin korunması |
| [Student #94](https://github.com/khfy7wpr5p-maker/st-student-app/pull/94) | Yeşil HTML imlecin SVG ölçeği ve kırpılmış başlangıç noktasına göre hizalanması; v40 offline yükseltmesi |

Bu PR'lar birleşmiştir. Yeni kayıt/ritim üretimi, MIDI veya notaya dönüştürme bu arayüz kapanışının parçası değildir. Karar verilmemiş haftalık ritim / birlikte dinleme kartları eklenmemiştir.

## Güncel mimari sınırlar

SesliTab üreticidir: exact revision onayı, SCORE / CHORD_BOARD hazırlama, öğrenci yetkisi, atama yaşam döngüsü ve teslimi yönetir. Student tüketicidir: yetkili DTO/paketi doğrular ve sunar. `ACTIVE`, `COMPLETED`, `REPERTOIRE` geçişleri ve geri çekme öğretmen/backend otoritesindedir.

Havuz, duyuru/içerik listeleme domain'idir. Eser İste altındaki bekleyen istekler ayrı, öğretmen grubu kapsamında salt okunur sunumdur; öğrenciye başka öğrencinin atama veya öğretmen işlem yetkisini vermez. Görünen ad roster'daki `displayNameOrNickname` alanıdır; yetkilendirme anahtarı değildir.

Piece tek kimlikli çalışma olarak kalır. Nota, TAB ve Akorlar mevcut içerik varsa görünür. Öğretmen notu görünümler arasında korunur. CHORD_BOARD exact voicing/fret/finger/barre snapshot'ı MusicXML'e çevrilmez. Aynı başlıklı eserler başlıkla değil kimlikle açılır.

`StudentPlaybackPort` tek müzikal zaman otoritesidir. Tempo, play/pause, ölçü tekrarı ve measure replay mevcut portu kullanır. Turuncu takip exact source/event kanıtı ister. Yeşil imleç ölçü hedefini izler. İmleç için kullanılan animation frame yalnız görsel yerleşimi birleştirir; ikinci ses veya playback saati değildir.

Boyutlandırma yalnız öğrenci sunumudur. `notationCursorProjection.js`, OSMD'nin native `left/top/width/height` değerlerini değiştirmeden SVG ekran matrisine göre CSS transform uygular. Render değişimi ve resize gözlenir, yazımlar birleştirilir, sayfadan çıkışta observer'lar ve sahip olunan stiller temizlenir. OSMD autoResize sonrası eksik SVG viewBox yeniden kurulur. Müzikal kaynak, canonical pitch/timing/string/fret değişmez.

Paketler immutable kalır. Private MusicXML/paket verisi IndexedDB otoritesindedir; Service Worker yalnız statik uygulama/runtime dosyalarını cache'ler. Yeni Render servisi, schema/rules değişimi veya öğrenciye öğretmen yetkisi yoktur.

## Uyumluluk matrisi — tarihli kanıtlarla güncel kabul durumu

21 Ekim sözleşme/tarayıcı test sonuçları tarihsel kanıt olarak korunur; aşağıdaki güncel kullanıcı kabulü satırları Linear kayıtlarıyla eşitlenmiştir. Bu belge turunda testler yeniden çalıştırılmadı.

| Sınır | Sonuç | Kanıt / sınır |
| --- | --- | --- |
| Teacher SCORE v1 -> Student validator | PASS | Legacy ve GRAND_PIANO / CLASSICAL_GUITAR / VIOLIN paketleri gerçek üretici ve tüketici fonksiyonlarıyla kabul edildi |
| Opsiyonel TAB MusicXML | PASS | Null/var ayrımı ve kaynak metin bütünlüğü korundu |
| CHORD_BOARD v1 | PASS | Gerçek teacher snapshot, voicing ve öğretmen notu Student validator/restore ile korundu |
| Paket tipi ve Piece gizlilik sınırı | PASS | Yanlış SCORE/CHORD_BOARD union reddedildi; raw öğretmen Piece DTO sayılmadı |
| Piece yaşam döngüsü | PASS (sözleşme) | ACTIVE / COMPLETED / REPERTOIRE sanitize manifestleri kabul edildi; gerçek kullanıcı geçişi bu incelemede yapılmadı |
| Nota/TAB takip, ölçek ve yön değiştirme | PASS (tarayıcı) | Student CI'da Chromium 17/17, WebKit 17/17 |
| Bekleyen istek ad/öğretmen grubu domain'i | PASS (domain) | Mevcut teacher servis testlerinde roster ve PENDING-only sınırı geçti |
| Bekleyen istek HTTP / round-trip | PASS (kullanıcı kabulü) | Teacher #370 teknik düzeltmesi ve SES-243 Done; önceki 404 tarihsel bulgudur |
| SCORE/TAB farklı müzikal olaylar | Koşullu / bilinçli fail-closed | Paket şeması metni kabul edebilir; exact event kanıtı yoksa highlight UNAVAILABLE olur |
| iPhone/PWA cihaz kabulü | PASS (kullanıcı kabulü) | SES-242, 26 Ekim kullanıcı onayıyla Done; bağımsız yeni fiziksel test yapılmadı |
| Nota/TAB tel–perde VoiceOver | Ertelenmiş / Backlog | SES-259; temel VoiceOver gezinmesinin PASS'i bu yeni özelliğin tamamlandığı anlamına gelmez |

## Uyumsuzluklar ve kalan işler

### C-01 — Done / kullanıcı PASS: Bekleyen Eser İstekleri

Student `listSharedPendingWorkRequests()`, `GET /api/secure-delivery/v1/student/work-requests/pending` yolunu kullanır. [Teacher #370](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader/pull/370), authenticated GET adaptörünü mevcut domain ve yetki sınırlarıyla ekledi; birleşen kaynak `335245cc952972ec80866963087a4eb9bef68b1f`.

[SES-243 güncel kaydı](https://linear.app/seslitab/issue/SES-243), önceki dağıtım doğrulamasında pending GET'in tokensız **401** döndüğünü ve eksik route kaynaklı 404'ün giderildiğini bildirir. Student isteği → öğretmende görme/işleme → Student yenilemesi kullanıcı tarafından **PASS** doğrulanmış; görev **Done**. Bu eşitlemede yeni endpoint isteği veya üretim verisi işlemi yapılmadı.

Tarihsel ilk bulgu: 21 Ekim `c1139563bb3120a9d4bbc359ba6d72205c8c0942` Teacher baseline'ında yalnız POST route'u vardı; tokensız pending GET **404 NOT_FOUND**, kontrol amaçlı pieces/assignments GET'leri **401 UNAUTHENTICATED** dönmüştü. Bu ilk hata kaydı güncel kullanım engeli değildir. Ana Havuz ve Eser İste istek listesi ayrı domainler olarak kalır.

### C-02 — Belge eşitlemesi

Student README, mimari sözleşmesi ve bu rapor 28 Ekim kaynak/kabul kayıtlarıyla eşitlenmiştir. Eski v40 pinleri ve 404/eksik kabul anlatımları güncel durum olarak kullanılmaz; tarihsel kaynak ve test kanıtları korunur. Bu rapor Student belgeleriyle sınırlıdır; Teacher belgelerinin tamamına veya diğer tarihli durum/plan dosyalarına toplu güncellik garantisi vermez.

### C-03 — Orta: SCORE/TAB semantik eşleşmesi şema kabulü değildir

Farklı nota/perde/süre olaylarına sahip iki XML aynı esere iliştirilirse şema doğrulaması tek başına exact highlight garantisi vermez. Doğrudan karşılaştırmada aynı kaynak EXACT, farklı perde içeren TAB UNAVAILABLE üretti. Bu bir güvenlik sınırıdır; yanlış eşleşmeyi zorlamak veya XML'i sessizce değiştirmek çözüm değildir. Gelecekte üretici tarafında karşılaştırma/uyarı ayrı çalışma olabilir; bu incelemede yeni genel playback hatası doğrulanmadı.

### C-04 — Done kullanıcı kabulü; ayrı ertelenmiş VoiceOver geliştirmesi

[SES-242](https://linear.app/seslitab/issue/SES-242), Önder'in 26 Ekim “242 pass kapatabiliriz” kararıyla **Done** kapatıldı. Kullanıcı kaydı dokuz öğrencinin uygulamada çalışabildiğini bildirir; önceki altı öğrenci sayısı tarihsel kayıttır. Bu kabul, dokuz öğrencinin her birinde bütün cihaz/test matrisinin bağımsız çalıştırıldığı anlamına gelmez.

Temel VoiceOver gezinmesi ve Eser İste round-trip PASS kayıtları korunur. Nota/TAB içindeki gerçek tel–perde bilgisinin VoiceOver ile seslendirilmesi ayrı [SES-259](https://linear.app/seslitab/issue/SES-259) **Backlog/ertelenmiş** geliştirmesidir. Bilinmeyen tel/perde tahmin edilmeyecek; mevcut VoiceOver gezinmesi korunacak. Bu belge düzeltmesi yeni geliştirme başlatmaz.

SES-28 platform matrisi, SES-29 performans bütçeleri ve ayrı p/f dinleme teyidi SES-242 kapanışıyla topluca kapanmaz.

## 21 Ekim'de çalıştırılan kontroller — tarihsel kanıt

Aşağıdaki sonuçlar ilk incelemenin yukarıda belirtilen kaynaklarına aittir; 28 Ekim'de yeniden çalıştırılmış sonuçlar değildir.

- Student `npm test`: **744/744**, exit 0; kaynak ağacı canlı uygulama sürümüyle aynı.
- Student birleşmiş main CI: **Chromium 17/17**, **WebKit 17/17**, renderer provenance ve diğer işler başarılı.
- Gerçek Teacher üretici / Student tüketici modülleri arasında bellekte **15/15** pozitif/negatif uyumluluk senaryosu, exit 0.
- Teacher mevcut yedi domain/contract test dosyası **35/35**; ek üç dosya **8/8**, toplam **43/43**, exit 0.
- Teacher HTTP payload testini ayrıca deneme, temiz inceleme checkout'unda `express` kurulu olmadığı için **environment limitation** verdi. Bu test PASS sayılmadı; bağımlılık kurulmadı, paket/lockfile değiştirilmedi. Mevcut teacher CI production/regression gate sonuçları ayrıca okundu; tam teacher suite yeniden çalıştırıldı iddiası yoktur.
- Canlı Student için shell, arayüz, viewport/cursor ve renderer dosyaları HTTP GET ile kaynak baytlarıyla karşılaştırıldı. API'de yalnız üç tokensız GET kullanıldı; production veri yazımı yoktur.
- Context7 OSMD cursor/render belgeleri kullanılan pinned 2.1.2 kaynak koduyla karşılaştırıldı. Güncel upstream doküman sürümü runtime yükseltme gerekçesi yapılmadı.

## Kapanış kararı — 28 Ekim kayıt eşitlemesi

Proje kayıtları: [Notion mimari raporu](https://app.notion.com/p/4002be2e566481b48afbf46d3a9647a2) · [SES-243 Done](https://linear.app/seslitab/issue/SES-243) · [SES-242 kullanıcı PASS / Done](https://linear.app/seslitab/issue/SES-242) · [SES-259 ertelenmiş geliştirme](https://linear.app/seslitab/issue/SES-259).

Arayüzün önceki yayın kapanışı, Eser İste teknik düzeltmesi/kullanıcı PASS'i ve iPhone/PWA kullanıcı kabulü korunur. Ertelenmiş tel–perde VoiceOver geliştirmesi tamamlandı sayılmaz; diğer platform/performance kabulleri bu kapanışa katılmaz. SCORE/TAB exact eşleşme sınırı korunur.

Bu belge turunda üç Markdown dosyasının kaynak/kayıt tutarlılığı kontrol edilir; uygulama veya test dosyası, bağımlılık, servis ayarı, veritabanı ya da üretim verisi değiştirilmez. Yeni runtime CI, tarayıcı, fiziksel cihaz, canlı sürüm veya deploy kanıtı iddia edilmez.
