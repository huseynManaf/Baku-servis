# Baku Servis — Peşəkar Telefon, Noutbuk və Server Texniki Xidmət Platforması

Bu layihə tam işlək bir prototipdir: müştəri sifariş forması + canlı yazışma (chat) +
onlayn ödəniş (demo rejimində) + admin panel (xidmət/qiymət idarəsi, müraciətlərə baxış,
statuslar) + SQLite bazası.

## 1. Quraşdırma

Lazımdır: **Node.js 18+** (https://nodejs.org saytından yükləyin).

```bash
cd bakuservis
npm install
cp .env.example .env
# .env faylını açıb SESSION_SECRET, ADMIN_USER, ADMIN_PASS dəyərlərini dəyişin
npm start
```

Server ayağa qalxanda konsolda görəcəksiniz:
```
Baku Servis 3000 portunda işə düşdü -> http://localhost:3000
```

- Müştəri saytı: **http://localhost:3000**
- Admin panel: **http://localhost:3000/admin.html**

İlk admin girişi belədir (`.env.example`-də təyin olunub, `.env` faylınıza kopyalayanda gəlir):
- **İstifadəçi adı:** `huseynmanfli844@gmail.com`
- **Şifrə:** `Baku2019`

Bu, yalnız `admins` cədvəli boş olanda (yəni bazanı ilk dəfə işə saldığınızda) avtomatik
yaradılır. Şifrəni dəyişmək istəsəniz, hazırkı versiyada bunu bazanı silib (`data/bakuservis.db`)
yeni `.env` dəyərləri ilə yenidən başlatmaqla edə bilərsiniz — istəsəniz ayrıca "şifrə dəyiş"
ekranı da əlavə edə bilərəm ki, bunu panelin özündən edəsiniz.

**Əlaqə məlumatları saytda:**
- E-poçt: `huseynmanfli844@gmail.com`
- WhatsApp / telefon: `+994 70 716 41 42` — həm yuxarı naviqasiyada, həm sağ-alt küncdəki
  yaşıl dəyirmi düymədə bu nömrəyə `wa.me` linki var. Müştəri bu düyməyə basanda birbaşa
  WhatsApp açılır və əvvəlcədən yazılmış salamlama mesajı ilə sizə (bu nömrəyə) yazmaq üçün
  hazır olur — bu tam WhatsApp-ın öz funksiyasıdır, ayrıca server tərəfi tələb etmir.

## 2. Necə işləyir (icmal)

**Müştəri tərəfi (`index.html`)**
- Xidmətlər siyahısı bazadan avtomatik yüklənir (admin paneldən idarə olunur).
- "Müraciət et" forması: ad, telefon, xidmət, problem izahı, cihaz növü.
- "Ustanı evə çağırıram" seçiləndə xəritə (OpenStreetMap/Leaflet, pulsuz, API açarı tələb
  etmir) açılır, müştəri xəritədə klikləyib öz məkanını qeyd edir.
- Müraciət göndəriləndə müştəriyə **izləmə kodu** (məs: `HG-A1B2C3`) verilir.
- "Sifarişimi izlə" bölməsindən kod + telefon ilə statusu görür, admin ilə birbaşa yazışa bilir.
- Qiymət təsdiqlənəndən sonra "Kartla ödə" düyməsi görünür (bax: bölmə 4 — ödəniş).

**Admin panel (`admin.html`)**
- Giriş etdikdən sonra: idarə paneli (statistika), müraciətlər siyahısı (statusa görə
  filtrlənir), hər müraciətin detalı (yazışma + status/qiymət dəyişmə), xidmətlər idarəsi
  (əlavə et/redaktə et/sil, qiymət və endirim təyin et).
- Admin müraciətin üzərinə klikləyib müştəri ilə yazışa, statusunu dəyişə
  (yeni → baxılır → qiymətləndirildi → icrada → hazır → təhvil verilib), qiymət təyin edə bilir.

## 3. Verilənlər bazası

Server `DATABASE_URL` təyin olunanda PostgreSQL (Railway PostgreSQL və ya Supabase) istifadə
edir. Bu rejimdə müraciətlər, chat mesajları, adminlər, xidmətlər və sifarişlər xarici SQL
bazasına yazılır; kod deploy-u və `git push` həmin məlumatlara toxunmur. `DATABASE_URL` boş
olanda lokal development üçün `data/bakuservis.db` SQLite fallback-i işləyir.

Railway-də PostgreSQL servisi yaradın və onun `DATABASE_URL` dəyişənini tətbiqə əlavə edin.
SQLite istifadə edilirsə, Railway Volume mount path-i `DATA_DIR` dəyişəninə verin. Runtime
baza fayllarını Git-ə əlavə etməyin.

**Bazanı "ayaqda saxlamaq" üçün görülən tədbirlər:**
- `WAL` (Write-Ahead Log) rejimi aktivdir — eyni anda oxuma/yazma münaqişəsini azaldır və
  qəfil çökmə zamanı məlumat itkisi riskini minimuma endirir.
- `foreign_keys` və `busy_timeout` aktivdir — "database is locked" xətalarının qarşısını alır.
- Bütün cədvəllərdə indekslər var (status, telefon, müraciət ID-si üzrə axtarış sürətli olsun deyə).
- SQLite development bazası üçün `npm run backup` əmri ilə konsistent anlıq surət `backups/`
  qovluğunda yaradılır, son 14 nüsxə saxlanılır. PostgreSQL rejimində əsas qoruma xarici
  bazanın Railway/Supabase backup və point-in-time recovery imkanlarıdır. SQLite backup-ını
  serverinizdə **cron** və ya **pm2** ilə hər gecə avtomatlaşdıra bilərsiniz:
  ```
  0 3 * * * cd /tam/yol/bakuservis && npm run backup >> backup.log 2>&1
  ```
- Server tərəfində gözlənilməz xətalar (`uncaughtException`, `unhandledRejection`) tutulur və
  loglanır ki, server bir xəta üzündən tamamilə dayanmasın.
- Böyüdükcə (çoxlu eyni anlı istifadəçi, çoxlu server instansı) SQLite-dan PostgreSQL/MySQL-ə
  keçmək məntiqli olar — mimarı elə qurulub ki, `db.js` faylını dəyişməklə bu keçid mümkündür,
  qalan kod (server.js) demək olar toxunulmaz qalır.

## 4. Onlayn ödəniş — VACIB qeyd

Hazırkı kodda ödəniş **demo/simulyasiya rejimindədir**: "Kartla ödə" düyməsi basılanda
sistem ödənişi avtomatik "ödənildi" statusuna keçirir, real pul hərəkəti olmur. Bunun
səbəbi: real kart ödənişi almaq üçün Azərbaycanda lisenziyalı bir ödəniş provayderi ilə
(məs. **Payriff**, **AzeriCard**, bankların e-manat/e-commerce xidmətləri — Kapital Bank,
ABB, Pasha Bank və s.) müqavilə bağlamaq, onlardan **merchant ID və API açarları** almaq
lazımdır — bunları mən sizin adınıza yarada bilmərəm.

Real inteqrasiya üçün addımlar:
1. Seçdiyiniz bankdan/provayderdən "internet-ekvayrinq" (online ödəniş) xidmətinə müraciət edin.
2. Sizə API sənədləri və test (sandbox) açarları veriləcək.
3. `server.js` faylında `/api/requests/:id/pay` endpoint-i daxilindəki demo blokunu silib,
   yerinə provayderin API-sinə sorğu göndərən kodu yazmaq lazımdır (adətən: ödəniş sessiyası
   yaradılır → müştəri provayderin təhlükəsiz səhifəsinə yönləndirilir → ödəniş nəticəsi
   "webhook" vasitəsilə sizin serverə bildirilir → `payments` cədvəli yenilənir).
4. Mən bu inteqrasiyanı sizin seçdiyiniz provayderin API sənədlərini paylaşdığınız təqdirdə
   addım-addım əlavə edə bilərəm — hazırkı struktur (payments cədvəli, status axını) məhz bu
   keçidə hazır şəkildə qurulub.

**Qeyd (admin sessiyası haqqında):** hazırda admin girişi Express-in daxili yaddaş (memory)
sessiya saxlayıcısından istifadə edir — server yenidən başladıqda bütün adminlər yenidən
giriş etməli olur, bu normaldır. Çox böyümüş, çoxlu server instansı olan layihələrdə
sessiyanı da bazada saxlamaq lazım gələ bilər, bunu da tələb olunanda əlavə edə bilərəm.

## 5. Deploy (canlıya çıxarmaq)

Sadə variantlar:
- **VPS (məs. Hetzner, DigitalOcean, Azerbaycanlı hostinq)**: Node.js quraşdırın, layihəni
  yükləyin, `pm2 start server.js --name bakuservis` ilə daimi işlək saxlayın, Nginx ilə
  domenə bağlayın və pulsuz SSL üçün Let's Encrypt/Certbot istifadə edin.
- **Platform-as-a-service** (Railway, Render və s.): layihəni GitHub-a atıb birbaşa qoşa bilərsiniz.

Domen adı və server seçimi ilə bağlı da kömək lazımdırsa deyin.

## 6. Fayl strukturu

```
bakuservis/
  server.js          -> bütün API endpoint-ləri
  db.js               -> SQLite sxemi, seed data, stabillik tənzimləmələri
  scripts/backup.js   -> baza ehtiyat nüsxəsi
  public/
    index.html        -> müştəri saytı
    admin.html         -> admin panel
    css/style.css      -> dizayn
    js/main.js         -> müştəri saytının məntiqi
    js/admin.js         -> admin panelin məntiqi
  data/bakuservis.db -> (avtomatik yaranır) verilənlər bazası
  backups/            -> ehtiyat nüsxələr
  .env                -> gizli tənzimləmələr (sizin doldurmalısınız)
```

## 7. Növbəti təkmilləşdirmə fikirləri

- SMS bildirişi (status dəyişəndə müştəriyə SMS) — Azərbaycanda SMS API provayderi lazımdır.
- Real ödəniş inteqrasiyası (bax bölmə 4).
- Şəkil yükləmə (müştəri cihazın şəklini əlavə etsin).
- Çoxlu usta/işçi hesabı və tapşırıq bölgüsü.
- E-poçt/SMS ilə giriş təsdiqi (2FA) admin panel üçün.

Hazır olduqda bunlardan hər hansını əlavə etməyimi istəsəniz, deyin.
