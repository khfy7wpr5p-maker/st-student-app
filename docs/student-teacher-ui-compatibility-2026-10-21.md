# ST Student / SesliTab — arayüz kapanışı ve uyumluluk incelemesi

İnceleme tarihi: 21 Ekim 2026, Europe/Istanbul. Bu çalışma yalnız belgeleri ve proje kayıtlarını günceller; uygulama, öğretmen/backend davranışı, veritabanı, ses motoru ve dağıtım ayarları değiştirilmez.

## Kaynaklar ve yayın kanıtı

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

Kod tabanı referansları belge commit'lerinden önceki uygulama sürümleridir. Sonraki belge commit'i bu SHA'lardan farklı olabilir; uygulama dosyalarını değiştirmez.

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

## Uyumluluk matrisi

| Sınır | Sonuç | Kanıt / sınır |
| --- | --- | --- |
| Teacher SCORE v1 -> Student validator | PASS | Legacy ve GRAND_PIANO / CLASSICAL_GUITAR / VIOLIN paketleri gerçek üretici ve tüketici fonksiyonlarıyla kabul edildi |
| Opsiyonel TAB MusicXML | PASS | Null/var ayrımı ve kaynak metin bütünlüğü korundu |
| CHORD_BOARD v1 | PASS | Gerçek teacher snapshot, voicing ve öğretmen notu Student validator/restore ile korundu |
| Paket tipi ve Piece gizlilik sınırı | PASS | Yanlış SCORE/CHORD_BOARD union reddedildi; raw öğretmen Piece DTO sayılmadı |
| Piece yaşam döngüsü | PASS (sözleşme) | ACTIVE / COMPLETED / REPERTOIRE sanitize manifestleri kabul edildi; gerçek kullanıcı geçişi bu incelemede yapılmadı |
| Nota/TAB takip, ölçek ve yön değiştirme | PASS (tarayıcı) | Student CI'da Chromium 17/17, WebKit 17/17 |
| Bekleyen istek ad/öğretmen grubu domain'i | PASS (domain) | Mevcut teacher servis testlerinde roster ve PENDING-only sınırı geçti |
| Bekleyen istek HTTP bağlantısı | FAIL | Student GET çağrısına karşı backend route eksik; canlı 404 |
| SCORE/TAB farklı müzikal olaylar | Koşullu / bilinçli fail-closed | Paket şeması metni kabul edebilir; exact event kanıtı yoksa highlight UNAVAILABLE olur |
| Fiziksel iPhone/PWA ve gerçek teacher/student kabulü | Doğrulanmadı | WebKit motor testi gerçek cihaz/VoiceOver veya oturumlu canlı kullanıcı testi değildir |

## Uyumsuzluklar ve kalan işler

### C-01 — Yüksek: Bekleyen Eser İstekleri GET route'u eksik

Student `src/providers/secureDelivery/secureDeliveryApiClient.js` içindeki `listSharedPendingWorkRequests()` şu yolu çağırır:

`GET /api/secure-delivery/v1/student/work-requests/pending`

SesliTab `backend/delivery/http/studentWorkRequestRouter.js` yalnız POST `/student/work-requests` kaydeder. `listSharedPendingForStudent()` domain metodu ve production `rosterStore` bağlantısı mevcuttur; HTTP GET adaptörü yoktur.

Canlı, tokensız ve salt okunur kontrol: pending adresi **404 NOT_FOUND / Endpoint bulunamadı**; aynı origin'deki `/student/pieces` ve `/student/assignments` **401 UNAUTHENTICATED** döndürdü. Bu, eksik route'u kimlik doğrulama gereksiniminden ayırır. Gerçek öğrenci içeriği okunmadı veya oluşturulmadı.

Takip: [SES-243](https://linear.app/seslitab/issue/SES-243). Öneri mevcut router'a authenticated GET bağlamak ve mevcut domain DTO'sunu kullanmaktır. Öğretmen dönüşüm/silme akışı, POST ve güvenlik sınırları korunmalıdır. Bu inceleme düzeltmeyi uygulamaz. Ana Havuz ile Eser İste istek listesi aynı endpoint değildir.

### C-02 — Orta: Mimari belgeler kodun gerisinde

Teacher ürün belgesi Ağustos baseline'ında öğrenci teslimini yok sayıyor; Student belgeleri eski renderer pinlerini/cache'leri ve yalnız SCORE follow sınırını güncel gibi anlatıyordu. Bu belge PR'larında güncel indeks/sınırlar eklendi; tarihli geçmiş kanıtlar silinmedi. Önceki açık belge PR'ları Teacher #369 ve Student #87 yeniden kullanıldı. Belge PR'ı yayımlamak main'e merge veya yeni runtime deploy anlamına gelmez.

### C-03 — Orta: SCORE/TAB semantik eşleşmesi şema kabulü değildir

Farklı nota/perde/süre olaylarına sahip iki XML aynı esere iliştirilirse şema doğrulaması tek başına exact highlight garantisi vermez. Doğrudan karşılaştırmada aynı kaynak EXACT, farklı perde içeren TAB UNAVAILABLE üretti. Bu bir güvenlik sınırıdır; yanlış eşleşmeyi zorlamak veya XML'i sessizce değiştirmek çözüm değildir. Gelecekte üretici tarafında karşılaştırma/uyarı ayrı çalışma olabilir; bu incelemede yeni genel playback hatası doğrulanmadı.

### C-04 — Kabul açığı: gerçek cihaz ve öğretmen/öğrenci round-trip

Arayüz uygulaması/yayını tamamlanmıştır; gerçek iPhone/PWA yükseltmesi, VoiceOver ve öğrenci isteği -> öğretmen listesi -> mevcut dönüşüm/kaldırma -> öğrenci yenilemesi canlı kabulü yapılmış sayılmaz. [SES-242](https://linear.app/seslitab/issue/SES-242) bağımsız kabul takibi olarak açık tutulur; C-01 çözülmeden bekleyen liste round-trip'ine PASS verilemez.

## Çalıştırılan kontroller

- Student `npm test`: **744/744**, exit 0; kaynak ağacı canlı uygulama sürümüyle aynı.
- Student birleşmiş main CI: **Chromium 17/17**, **WebKit 17/17**, renderer provenance ve diğer işler başarılı.
- Gerçek Teacher üretici / Student tüketici modülleri arasında bellekte **15/15** pozitif/negatif uyumluluk senaryosu, exit 0.
- Teacher mevcut yedi domain/contract test dosyası **35/35**; ek üç dosya **8/8**, toplam **43/43**, exit 0.
- Teacher HTTP payload testini ayrıca deneme, temiz inceleme checkout'unda `express` kurulu olmadığı için **environment limitation** verdi. Bu test PASS sayılmadı; bağımlılık kurulmadı, paket/lockfile değiştirilmedi. Mevcut teacher CI production/regression gate sonuçları ayrıca okundu; tam teacher suite yeniden çalıştırıldı iddiası yoktur.
- Canlı Student için shell, arayüz, viewport/cursor ve renderer dosyaları HTTP GET ile kaynak baytlarıyla karşılaştırıldı. API'de yalnız üç tokensız GET kullanıldı; production veri yazımı yoktur.
- Context7 OSMD cursor/render belgeleri kullanılan pinned 2.1.2 kaynak koduyla karşılaştırıldı. Güncel upstream doküman sürümü runtime yükseltme gerekçesi yapılmadı.

## Kapanış kararı

Proje kayıtları: [Notion mimari raporu](https://app.notion.com/p/4002be2e566481b48afbf46d3a9647a2?pvs=204) · [Linear ortak raporu](https://linear.app/seslitab/document/st-student-seslitab-arayuz-kapanisi-ve-uyumluluk-21-ekim-2026-9bb283940577) · [SES-243 açık API hatası](https://linear.app/seslitab/issue/SES-243) · [SES-242 açık kabul takibi](https://linear.app/seslitab/issue/SES-242).

Arayüz geliştirme ve yayımlama işi tamamlandı. Öğretmen ve çalışan müzik özellikleri bu belge çalışmasında değiştirilmedi. **İki proje bütünü için koşulsuz PASS verilmez:** C-01 doğrulanmış bağlantı hatası ve C-04 kabul açığı ayrı kalır. Tarihsel görevler/PR'lar körlemesine silinmez; kanıtsız cihaz/öğretmen kabulü Done olarak işaretlenmez.
