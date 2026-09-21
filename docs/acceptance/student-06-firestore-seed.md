# STUDENT-06 Firestore Test Seed

Bu araç yalnız STUDENT-06 fiziksel iPhone kabul testi için bounded test verisi üretir.

## Güvenlik sınırları

- Student App Firestore write yetkisi kazanmaz.
- `firebase/firestore.rules` değiştirilmez.
- Varsayılan çalışma modu dry-run'dır; `--apply` verilmeden canlı veri değişmez.
- Canlı yazım yalnız kısa ömürlü Google OAuth access token ile yapılır.
- Token repository'ye, komut çıktısına veya Student App'e yazılmaz.
- Araç yalnız dört sabit test dokümanını yazar:
  - `publicPublications/pub-test-public`
  - `publicPublications/pub-test-public/chunks/0`
  - `students/<studentId>/publications/pub-test-private`
  - `students/<studentId>/publications/pub-test-private/chunks/0`

## Cloud Shell

Repository branch'ini alın:

```bash
git clone --branch feat/student-06-iphone-voiceover-acceptance --single-branch \
  https://github.com/khfy7wpr5p-maker/st-student-app.git
cd st-student-app
```

Önce dry-run:

```bash
node scripts/seed-student06-firestore.mjs \
  --project st-student-app-85cde \
  --student V2FRODboGdVHruCXhGrZEmelXEC2 \
  --published-at 2026-09-22T00:00:00Z
```

Çıktıda `DRY RUN: 4 bounded writes` görülmelidir.

Sonra canlı test verisini tek atomik Firestore commit ile yazın:

```bash
FIRESTORE_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
node scripts/seed-student06-firestore.mjs \
  --project st-student-app-85cde \
  --student V2FRODboGdVHruCXhGrZEmelXEC2 \
  --published-at 2026-09-22T00:00:00Z \
  --apply
```

Başarılı sonuç:

```text
COMMITTED: 4 bounded writes
```

Access tokenı sohbet içine, GitHub issue/PR'a veya dosyaya kopyalamayın.

## Beklenen Student App sonucu

- Havuz: `Test Havuz Çalışması`
- Benim Çalışmalarım: `Test Kişisel Çalışma`
- Her iki çalışma da gerçek package chunk'ı içerir; `Çalışmayı Aç` Firestore transport katmanını gerçek veride doğrulayabilir.
