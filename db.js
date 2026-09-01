// db.js
// SQLite bazasi ile elaqe, schema qurulmasi ve ilkin (seed) melumatlar.
// better-sqlite3 sinxron ishleyir - kicik/orta trafikli sayt ucun en stabil ve sade secimdir.

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'hugu.db');
const db = new Database(DB_PATH);

// --- Bazani ayaqda saxlamaq / stabillik ucun tenzimlemeler ---
// WAL rejimi: eyni anda oxuma/yazma munaqishesini azaldir, chokme zamani data itkisini minimuma endirir
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

// --- SCHEMA ---
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'umumi',
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  discount_price REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  image_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_code TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  device_info TEXT,
  problem_description TEXT,
  address_text TEXT,
  latitude REAL,
  longitude REAL,
  visit_type TEXT NOT NULL DEFAULT 'servis', -- 'servis' (mushteri gelir) | 'evde' (usta gedir)
  status TEXT NOT NULL DEFAULT 'yeni', -- yeni -> baxilir -> qiymetlendirildi -> icrada -> hazir -> teslim -> legv
  quoted_price REAL,
  final_price REAL,
  is_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, -- 'customer' | 'admin'
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'card', -- 'card' | 'nagd'
  status TEXT NOT NULL DEFAULT 'gozleyir', -- gozleyir | odenildi | legv
  provider_ref TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests(phone);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_payments_request ON payments(request_id);
`);

// --- Seed: ilk admin (yalniz cedvel bosdursa) ---
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
if (adminCount === 0) {
  const defaultUser = process.env.ADMIN_USER || 'huseynmanfli844@gmail.com';
  const defaultPass = process.env.ADMIN_PASS || 'Baku2019';
  const hash = bcrypt.hashSync(defaultPass, 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(defaultUser, hash);
  console.log('----------------------------------------------------');
  console.log('Ilk admin hesabi yaradildi:');
  console.log('  istifadeci adi:', defaultUser);
  console.log('  shifre       :', defaultPass);
  console.log('ILK GIRISHDEN SONRA .env FAYLINDA MUTLEQ DEYISHIN!');
  console.log('----------------------------------------------------');
}

// --- Seed: numune xidmetler (yalniz cedvel bosdursa) ---
const serviceCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (serviceCount === 0) {
  const insert = db.prepare(`INSERT INTO services (name, category, description, price, discount_price) VALUES (?,?,?,?,?)`);
  const seedData = [
    ['Windows format + drayver qurulmasi', 'format', 'Tam format, Windows 10/11 qurulmasi, butun drayverler ve esas proqramlar.', 30, 25],
    ['Notebook ekran deyishilmesi', 'notebook', 'Sinmish/xetli noutbuk ekranlarinin orijinal ehtiyat hisse ile deyishilmesi.', 80, null],
    ['Viruslardan temizleme', 'temizlik', 'Sistemin tam virus/zerarli proqram taramasi ve temizlenmesi.', 20, null],
    ['SSD/HDD qurashdirma ve data kochurme', 'hardware', 'Yeni disk qurashdirilmasi, mevcud melumatlarin itkisiz kochurulmesi.', 25, null],
    ['Komputer yigilmasi (PC Build)', 'hardware', 'Sifarishe uygun komponentlerden komputerin yigilmasi ve testi.', 40, null],
    ['Noutbuk sotenmesi problemi', 'notebook', 'Termopasta deyishilmesi, ventilyator temizliyi, soyutma sisteminin yenilenmesi.', 35, 30]
  ];
  const insertMany = db.transaction((rows) => rows.forEach(r => insert.run(...r)));
  insertMany(seedData);
}

module.exports = db;
