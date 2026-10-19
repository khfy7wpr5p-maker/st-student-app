# ST Student — Kanıta Dayalı Güncel Proje Durumu (19 Ekim 2026)

> **Belge türü:** Güncel kod ve görev senkronizasyonu. Aşağıdaki 'merged' yalnız GitHub durumu anlamına gelir; iPhone cihazı, PWA/offline cache, production bundle veya gerçek öğrenci hesabındaki davranışın kesin kabulü olarak yorumlanamaz. Bu belge dışında uygulama kodu ya da üretim altyapısı değiştirilmedi.

## Kaynak ve sürüm

- Repo: https://github.com/khfy7wpr5p-maker/st-student-app
- Doğrulanmış `main` HEAD: `0cec9dcfc6d58da4bde1521494ae662cb4a438ae` (2026-10-19 17:52 UTC).
- **Merged:** [#84 — embedded notation/TAB turuncu takip](https://github.com/khfy7wpr5p-maker/st-student-app/pull/84), [#85 — score cursor ve turuncu highlight retry](https://github.com/khfy7wpr5p-maker/st-student-app/pull/85), [#86 — audio manifest beklemeden Student shell mount](https://github.com/khfy7wpr5p-maker/st-student-app/pull/86).
- Önceki ilgili merged PR'lar: [#81 — generated TAB playback highlighting](https://github.com/khfy7wpr5p-maker/st-student-app/pull/81), [#82 — generated TAB follow shell](https://github.com/khfy7wpr5p-maker/st-student-app/pull/82), [#78 — assigned instruments](https://github.com/khfy7wpr5p-maker/st-student-app/pull/78), [#79 — guitar/piano playback](https://github.com/khfy7wpr5p-maker/st-student-app/pull/79).
- **Açık PR:** [#76 — gerçek Guitar TAB fret render kanıtı](https://github.com/khfy7wpr5p-maker/st-student-app/pull/76) — açık PR, tamamlandı sayılmaz.

## Linear ile eşleştirilmiş çalışma durumu

- **SES-193 — Done:** Backend read optimization/offline durability/authority safety; mevcut test ve gerçek davranış kanıtları issue'da izlenir. https://linear.app/seslitab/issue/SES-193
- **SES-238 — Done:** Teacher/Student ortak Piece eligibility performans süreci; production backfill ve indeks kabul ayrıntıları Linear kaydındadır. https://linear.app/seslitab/issue/SES-238
- **SES-183 — Todo:** TAB interactive follow parity (orange note/chord, green measure cursor, measure tap); 19 Ekim GitHub PR #84–86 merged bilgisi nedeniyle yeniden exact-runtime kabul ve issue-triage gereklidir. Bu belge, sorunun fiziksel cihazda çözüldüğünü iddia etmez. https://linear.app/seslitab/issue/SES-183
- **SES-237 — In Progress:** Teacher TAB export + Student orange follow ortak kapatma işi. https://linear.app/seslitab/issue/SES-237
- **SES-234 — Todo:** Teacher-selected playback instrument entegrasyonunun kalan ürün kabulü; önceki PR #78/#79 merging bu issue'nun bütün kabul koşullarının geçtiğini kendi başına kanıtlamaz. https://linear.app/seslitab/issue/SES-234
- **SES-69 — In Progress:** Violin audio student integration. https://linear.app/seslitab/issue/SES-69
- **SES-214 — In Progress:** Account Service production deploy/integrated E2E gate. https://linear.app/seslitab/issue/SES-214
- **SES-200 — In Review:** Account Service V1 umbrella. https://linear.app/seslitab/issue/SES-200

## Ürün sözleşmesi ve korumalar

1. Student arayüzünde OMR/nota editörü bulunmaz; öğrenci öğretmenin kaynak notasını ve onaylı revizyonu değiştiremez.
2. Playback otoritesiyle çizim/takip otoritesi ayrıdır. Exact event mapping yoksa tahmini nota/pitch/SVG proximity kullanarak turuncu vurgu üretme.
3. Score-only, çok-staff, gömülü TAB ve ayrı Guitar TAB kaynağı davranışları birbirinden bağımsız test edilir. Yeşil ölçü cursor, turuncu nota takibi ve measure-tap replay üç ayrı kabul koşuludur.
4. Eski ödevler, revoked/aktif Piece yaşam döngüsü, cache/offline, performans ve erişim otoritesi korunur.
5. Öğretmen seçtiği klasik gitar, grand piyano veya keman playback seçenekleri için device/browser ses testiyle gerçek doğrulama gerekir; 'PR merged' tek başına ses kabulü değildir.

## İzlenmesi gereken test kanıtları

- **Öğrenci cihazları:** iPhone/Safari/VoiceOver, Android/Chrome, ilk açılış, yeniden giriş ve offline/PWA cache.
- **Takip:** score ve TAB staff, turuncu nota/akor, yeşil imleç, measure tap, tempo, rapid play/pause, source reload.
- **Veri ve maliyet:** eski revoked Piece'ler öğrenci listesinde görünmemeli; Firestore read sayıları canlı kullanım ve billing raporlarıyla doğrulanmalı. Kod içi tahmini read sayıları gerçek faturalanan sayı değildir.
- **Güvenlik:** role/roster/teacher approval/revoke ve exact revision hat boyunca korunur.
- Bu dokümantasyon turunda CI, cihaz testi, Firebase billing veya üretim deploy kontrolü yeniden çalıştırılmadı.

## İlgili kaynaklar

- [Linear SesliTab Student](https://linear.app/seslitab/project/seslitab-student-e937fdeae5ec)
- [Notion GTAB closeout](https://app.notion.com/p/3fd2be2e566481eda586d61d48c41b28)
- [Notion Firestore read incelemesi](https://app.notion.com/p/3fc2be2e56648140aea9c57a2e3bfc55)
- [SesliTab Core repo](https://github.com/khfy7wpr5p-maker/seslitab-guitar-reader)

## Kaynak gerçeği

Protected main ve exact runtime kanıtı, eski roadmap/draft metinlerinden üstündür. Eski kayıtlar silinmez; güncellenirken 'tarihsel baseline' olarak işaretlenir.
