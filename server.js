require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const { Server } = require('socket.io');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, process.env.DATABASE_FILE || 'bakuservis.db');
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const usePostgres = Boolean(DATABASE_URL);

let db = null;
let pool = null;
if (usePostgres) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 10)
  });
  pool.on('error', (error) => console.error('PostgreSQL pool error:', error));
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new sqlite3.Database(DB_PATH);
  db.configure('busyTimeout', 5000);
}

const ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USER || process.env.ADMIN_USER || 'huseynmanfli844@gmail.com';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASS || process.env.ADMIN_PASS || 'Baku2019';
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';
const ADMIN_ROLE = 'ADMIN';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || 'huseynmanafli844@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Baku Servis <noreply@bakuservis.az>';
const ADMIN_EMAIL = 'huseynmanafli844@gmail.com';
const AZERBAIJANI_PHONE_REGEX = /^(\+994|994|0)?(50|51|55|60|70|77|99)\d{7}$/;
const SUPER_ADMIN_EMAIL_ALIASES = Array.from(new Set([
  ADMIN_USERNAME,
  'huseynmanfli844@gmail.com',
  'huseynmanafli844@gmail.com',
  ADMIN_USERNAME.replace('manfli', 'manafli'),
  ADMIN_USERNAME.replace('manafli', 'manfli')
].filter(Boolean)));

function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'SUPER_ADMIN' || role === 'SUPERADMIN') return SUPER_ADMIN_ROLE;
  return ADMIN_ROLE;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sanitizePhoneInput(value) {
  const raw = String(value || '').trim();
  const hasLeadingPlus = raw.startsWith('+');
  const withoutFormatting = raw.replace(/[\s\-\(\)]/g, '');
  const digits = withoutFormatting.replace(/[^\d]/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
}

function isValidAzerbaijaniPhone(value) {
  return AZERBAIJANI_PHONE_REGEX.test(sanitizePhoneInput(value));
}

function normalizePhone(value) {
  const digits = sanitizePhoneInput(value).replace(/\D/g, '');
  if (!digits) return '';
  const withoutCountry = digits.startsWith('994') ? digits.slice(3) : digits;
  const withoutZero = withoutCountry.replace(/^0+/, '');
  return withoutZero.slice(0, 9);
}

function formatPhoneDisplay(value) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.length <= 2) return `+994 ${digits}`;
  if (digits.length <= 5) return `+994 ${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 7) return `+994 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return `+994 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}

const BOT_HANDOFF_NOTICE = 'Anladım, məsələni tam dəqiqləşdirmək üçün müraciətinizi texniki operatorumuza yönləndirdim. ⏱️ Əməkdaşlarımız 15 dəqiqə ərzində bu canlı çat vasitəsilə sizə birbaşa cavab verəcək.';

function normalizeBotText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\səığöüçş]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getIntentKeywords(text) {
  const greetingPattern = /(salam|salamlar|salam aleykum|aleykum salam|xos gorduk|xoş gəldiniz|mühəndis|mühendis)/;
  const courtesyPattern = /(necesiz|necesiniz|sağol|sagol|tesekkur|təshəkkür|teşekkür|ne var ne yox|ne var ne yox)/;
  const printerPattern = /(printer|print|kartric|kartrij|cartirj|kartridj|kaput|cap|çap|çap)/;
  const formatPattern = /(format|windows|əməliyyat sistemi|emeliyyat sistemi|os|operating system|driver|drayver|quraşdırma|qurasdirma)/;
  const pricingPattern = /(qiymet|qiymət|qiyməti|pulla|kassa|neçədir|nece|qeder|nedir|deyer|dəyər)/;
  const trackingPattern = /(izleme|izləmə|status|sifaris|sifariş|kod|kodu|haradadir|haradadır|harada|sifarisin|statusu)/;

  if (greetingPattern.test(text)) return 'greeting';
  if (courtesyPattern.test(text)) return 'courtesy';
  if (printerPattern.test(text)) return 'printer';
  if (formatPattern.test(text)) return 'format';
  if (pricingPattern.test(text)) return 'pricing';
  if (trackingPattern.test(text)) return 'tracking';
  return null;
}

function hasRepeatedTopic(currentText, historyMessages = []) {
  const current = normalizeBotText(currentText);
  if (!current) return false;

  const customerHistory = historyMessages
    .filter((msg) => String(msg.sender_type || '').toLowerCase() === 'customer')
    .map((msg) => normalizeBotText(msg.message));

  if (customerHistory.length < 2) return false;

  const currentKeywords = current.split(' ').filter((word) => word.length > 3);
  if (!currentKeywords.length) return false;

  return customerHistory.filter((msg) => {
    if (!msg) return false;
    return currentKeywords.some((keyword) => msg.includes(keyword));
  }).length >= 2;
}

function getKnowledgeBaseReply(message, historyMessages = []) {
  const text = normalizeBotText(message);
  const intent = getIntentKeywords(text);
  const customerHistory = historyMessages
    .filter((msg) => String(msg.sender_type || '').toLowerCase() === 'customer')
    .map((msg) => normalizeBotText(msg.message));
  const totalCustomerTurns = customerHistory.length;

  if (!text) {
    return 'Salam! Baku Servis IT Support və texniki xidmət mərkəzinə xoş gəlmisiniz. Sizə necə kömək edə bilərəm? 🛠️';
  }

  if (hasRepeatedTopic(message, historyMessages) || totalCustomerTurns >= 3 || (!intent && text.length >= 5)) {
    return BOT_HANDOFF_NOTICE;
  }

  if (intent === 'greeting') {
    return 'Salam! Necəsiniz? Baku Servis IT Support və texniki xidmət mərkəzinə xoş gəlmisiniz. Sizə necə kömək edə bilərəm? 🛠️';
  }

  if (intent === 'courtesy') {
    return 'Sağ olun, siz necəsiniz? 😊 Kompüterinizdə, printerinizdə və ya digər avadanlıqlarınızda hər hansı texniki problem var?';
  }

  if (intent === 'printer') {
    return 'Printer servis xidmətlərimiz mövcuddur! Cihazı 20 ₼-yə tam diaqnostika edib yoxlayırıq, təmiri və detal dəyişimi qiymətini isə yoxladıqdan sonra sizinlə razılaşdırırıq. 🖨️';
  }

  if (intent === 'format') {
    return 'Windows 10/11 formatı, lisenziyalı quraşdırma və drayverlərin yazılması xidmətimiz var. Qiyməti ortalama 25 ₼ təşkil edir.';
  }

  if (intent === 'pricing') {
    return 'Xidmət qiymətlərimiz görüləcək işə görə dəyişir:\n• Format və Dəstək: ~25 ₼\n• Virus Təmizliyi: ~15 ₼\n• SSD / Avadanlıq quraşdırılması: ~50 ₼\nİlk diaqnostika pulsuzdur.';
  }

  if (intent === 'tracking') {
    return 'Sifarişinizin statusunu öyrənmək üçün ana səhifədəki "İzləmə et" bölməsinə izləmə kodunuzu daxil etməyiniz kifayətdir.';
  }

  return BOT_HANDOFF_NOTICE;
}

function generateTrackingCode() {
  return `HG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function buildNotificationHtml({ title, details, summary }) {
  const rows = Object.entries(details || {}).map(([label, value]) => `
    <tr>
      <td style="padding:8px 10px; border-bottom:1px solid #eef2ff; color:#475569; font-weight:600;">${label}</td>
      <td style="padding:8px 10px; border-bottom:1px solid #eef2ff; color:#0f172a;">${value}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:20px 24px;color:#fff;">
          <h2 style="margin:0;font-size:24px;">${title}</h2>
        </div>
        <div style="padding:20px 24px;">
          <p style="margin:0 0 16px;color:#334155;">${summary}</p>
          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden;">
            ${rows}
          </table>
        </div>
      </div>
    </div>
  `;
}

async function sendGmailNotification({ to, from, subject, text, html }) {
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER || SMTP_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || SMTP_PASS;
  const recipient = to || process.env.NOTIFICATION_EMAIL || gmailUser || ADMIN_EMAIL;

  if (!gmailUser || !gmailAppPassword || !recipient) {
    console.warn('Gmail credentials are not configured; skipping email notification.');
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword
      }
    });

    const info = await transporter.sendMail({
      from: from || gmailUser,
      to: recipient,
      subject,
      text,
      html
    });

    console.log('✅ Email sent successfully:', info.response);
    return info;
  } catch (error) {
    console.error('❌ Email notification failed:', error);
    return null;
  }
}

async function sendTelegramNotification(text) {
  const telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!telegramToken || !telegramChatId) return null;

  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(body.description || `Telegram HTTP ${response.status}`);
    console.log('Telegram notification sent successfully.');
    return body;
  } catch (error) {
    console.error('Telegram notification failed:', error.message || error);
    return null;
  }
}

function sendAdminEmail({ title, summary, details }) {
  const subject = title;
  const text = `${summary}\n\n${Object.entries(details || {}).map(([key, value]) => `${key}: ${value}`).join('\n')}`;
  return sendGmailNotification({
    from: process.env.GMAIL_USER || process.env.EMAIL_USER || MAIL_FROM,
    to: process.env.NOTIFICATION_EMAIL || process.env.GMAIL_USER || ADMIN_EMAIL,
    subject,
    text,
    html: buildNotificationHtml({ title, summary, details })
  });
}

function emitAdminNotification(payload) {
  io.emit('admin:notification', {
    title: payload.title || 'Yeni bildiriş',
    message: payload.message || 'Yeni tədbir baş verdi.',
    meta: payload.meta || {}
  });
}

function requireAdmin(req, res, next) {
  const role = normalizeRole(req.session?.user?.role || req.session?.adminRole || 'ADMIN');
  if (req.session && req.session.adminId && (role === ADMIN_ROLE || role === SUPER_ADMIN_ROLE)) {
    req.session.user = req.session.user || {};
    req.session.user.role = role;
    return next();
  }
  return res.status(401).json({ error: 'Admin girişi tələb olunur.' });
}

function requireSuperAdmin(req, res, next) {
  const role = normalizeRole(req.session?.user?.role || req.session?.adminRole || 'ADMIN');
  if (req.session && req.session.adminId && role === SUPER_ADMIN_ROLE) {
    req.session.user = req.session.user || {};
    req.session.user.role = role;
    return next();
  }
  return res.status(403).json({ error: 'Bu əməliyyat üçün super admin icazəsi tələb olunur.' });
}

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function run(sql, params = []) {
  if (usePostgres) {
    const normalizedSql = convertPlaceholders(sql);
    const querySql = /^\s*INSERT\s/i.test(normalizedSql) && !/\bRETURNING\b/i.test(normalizedSql)
      ? `${normalizedSql.trim().replace(/;$/, '')} RETURNING id`
      : normalizedSql;
    return pool.query(querySql, params).then((result) => ({
      lastInsertRowid: result.rows[0]?.id || null,
      changes: result.rowCount || 0
    }));
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  if (usePostgres) {
    const normalizedSql = convertPlaceholders(sql);
    return pool.query(normalizedSql, params).then((result) => result.rows[0]);
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  if (usePostgres) {
    const normalizedSql = convertPlaceholders(sql);
    return pool.query(normalizedSql, params).then((result) => result.rows || []);
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureOrdersTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_name TEXT NOT NULL,
      device_model TEXT,
      device_info TEXT,
      status TEXT NOT NULL DEFAULT 'Gözləmədə',
      quoted_price REAL DEFAULT 0,
      final_price REAL DEFAULT 0,
      is_onsite INTEGER NOT NULL DEFAULT 0,
      address TEXT,
      latitude REAL,
      longitude REAL,
      payment_method TEXT NOT NULL DEFAULT 'later',
      payment_status TEXT NOT NULL DEFAULT 'Ödənilməyib',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const orderColumns = new Set((await all('PRAGMA table_info(orders)')).map((col) => col.name));
  const orderColumnsToAdd = ['device_model', 'is_onsite', 'address', 'latitude', 'longitude', 'payment_method', 'payment_status', 'quoted_price', 'final_price'];
  for (const column of orderColumnsToAdd) {
    if (!orderColumns.has(column)) {
      const typeMap = {
        device_model: 'TEXT', quoted_price: 'REAL DEFAULT 0', final_price: 'REAL DEFAULT 0',
        is_onsite: 'INTEGER NOT NULL DEFAULT 0', address: 'TEXT', latitude: 'REAL', longitude: 'REAL',
        payment_method: "TEXT NOT NULL DEFAULT 'later'", payment_status: "TEXT NOT NULL DEFAULT 'Ödənilməyib'"
      };
      await run(`ALTER TABLE orders ADD COLUMN ${column} ${typeMap[column]}`);
    }
  }
}

async function ensurePostgresDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'ADMIN', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT');
  await run("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'ADMIN'");
  await run(`CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'ADMIN', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run("ALTER TABLE admins ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'ADMIN'");
  await run(`CREATE TABLE IF NOT EXISTS services (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL DEFAULT 'Genel', price NUMERIC(12, 2) DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run('ALTER TABLE services ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) DEFAULT 0');

  const requestSchema = `id SERIAL PRIMARY KEY, tracking_code TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, service_name TEXT NOT NULL, device_model TEXT, device_info TEXT, status TEXT NOT NULL DEFAULT 'Gözləmədə', quoted_price NUMERIC(12, 2) DEFAULT 0, final_price NUMERIC(12, 2) DEFAULT 0, is_onsite INTEGER NOT NULL DEFAULT 0, address TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, payment_method TEXT NOT NULL DEFAULT 'later', payment_status TEXT NOT NULL DEFAULT 'Ödənilməyib', idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`;
  await run(`CREATE TABLE IF NOT EXISTS requests (${requestSchema})`);
  await run(`CREATE TABLE IF NOT EXISTS orders (${requestSchema})`);
  await run(`CREATE TABLE IF NOT EXISTS chat_messages (id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'admin', 'bot')), message TEXT NOT NULL, customer_name TEXT, customer_phone TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS customer_name TEXT');
  await run('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS customer_phone TEXT');
  await run('ALTER TABLE requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_idempotency_key ON requests (idempotency_key) WHERE idempotency_key IS NOT NULL');
  await run('CREATE INDEX IF NOT EXISTS idx_requests_tracking_code ON requests (tracking_code)');
  await run('CREATE INDEX IF NOT EXISTS idx_requests_customer_phone ON requests (customer_phone)');
  await run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages (session_id, created_at)');

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const user = await get('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1', [ADMIN_USERNAME, ADMIN_USERNAME]);
  if (!user) await run('INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, ?)', [ADMIN_USERNAME, ADMIN_USERNAME, passwordHash, SUPER_ADMIN_ROLE]);
  const admin = await get('SELECT * FROM admins WHERE LOWER(username) = LOWER(?) LIMIT 1', [ADMIN_USERNAME]);
  if (!admin) await run('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)', [ADMIN_USERNAME, passwordHash, SUPER_ADMIN_ROLE]);

  for (const [name, category] of [['Phone Diagnostic & Repair', 'Personal Tech'], ['Laptop Maintenance & Repair', 'Personal Tech'], ['Corporate IT Support', 'Corporate IT Support'], ['Server & Network Management', 'Server/Network Management']]) {
    if (!await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1', [name])) await run('INSERT INTO services (name, category) VALUES (?, ?)', [name, category]);
  }
}

async function safeAddColumn(tableName, columnName, columnType = 'TEXT', defaultExpression = '') {
  try {
    const tableInfo = await all(`PRAGMA table_info(${tableName})`);
    const exists = new Set((tableInfo || []).map((column) => column.name));
    if (exists.has(columnName)) {
      return;
    }

    const definition = defaultExpression ? `${columnType} ${defaultExpression}` : columnType;
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch (error) {
    console.warn(`Schema migration warning for ${tableName}.${columnName}:`, error.message || error);
  }
}

async function ensureChatMessagesTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'admin', 'bot')),
      message TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await safeAddColumn('chat_messages', 'customer_name', 'TEXT');
  await safeAddColumn('chat_messages', 'customer_phone', 'TEXT');
}

async function ensureDatabase() {
  if (usePostgres) {
    await ensurePostgresDatabase();
    return;
  }

  await ensureOrdersTable();

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const userColumns = new Set((await all('PRAGMA table_info(users)')).map((col) => col.name));
  if (!userColumns.has('role')) {
    await run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN'");
  }
  if (!userColumns.has('username')) {
    await run('ALTER TABLE users ADD COLUMN username TEXT');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const adminColumns = new Set((await all('PRAGMA table_info(admins)')).map((col) => col.name));
  if (!adminColumns.has('role')) {
    await run("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN'");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'Genel',
      price REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await ensureChatMessagesTable();

  await run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_name TEXT NOT NULL,
      device_model TEXT,
      device_info TEXT,
      status TEXT NOT NULL DEFAULT 'Gözləmədə',
      quoted_price REAL DEFAULT 0,
      final_price REAL DEFAULT 0,
      is_onsite INTEGER NOT NULL DEFAULT 0,
      address TEXT,
      latitude REAL,
      longitude REAL,
      payment_method TEXT NOT NULL DEFAULT 'later',
      payment_status TEXT NOT NULL DEFAULT 'Ödənilməyib',
      idempotency_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await safeAddColumn('requests', 'idempotency_key', 'TEXT');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_idempotency_key ON requests (idempotency_key) WHERE idempotency_key IS NOT NULL');

  const chatTableDefinition = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'");
  if (!chatTableDefinition || !chatTableDefinition.sql || !chatTableDefinition.sql.includes("'bot'")) {
    const migrateChatTable = async () => {
      try {
        const existingRows = await all('SELECT * FROM chat_messages ORDER BY id ASC');
        await run('ALTER TABLE chat_messages RENAME TO chat_messages_old');
        await run(`
          CREATE TABLE chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'admin', 'bot')),
            message TEXT NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        if (existingRows.length) {
          const columns = ['id', 'session_id', 'sender_type', 'message', 'customer_name', 'customer_phone', 'created_at'];
          for (const row of existingRows) {
            await run(
              `INSERT INTO chat_messages (${columns.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [row.id, row.session_id, row.sender_type, row.message, row.customer_name || null, row.customer_phone || null, row.created_at]
            );
          }
        }
        await run('DROP TABLE chat_messages_old');
      } catch (error) {
        console.warn('Schema migration warning for chat_messages:', error.message || error);
      }
    };

    const tableExists = await get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'");
    if (tableExists) {
      await migrateChatTable();
    } else {
      await run(`
        CREATE TABLE chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          sender_type TEXT NOT NULL CHECK(sender_type IN ('customer', 'admin', 'bot')),
          message TEXT NOT NULL,
          customer_name TEXT,
          customer_phone TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    }
  }

  const requestColumns = new Set((await all('PRAGMA table_info(requests)')).map((col) => col.name));
  const requestColumnsToAdd = ['device_model', 'is_onsite', 'address', 'latitude', 'longitude', 'payment_method', 'payment_status', 'idempotency_key'];
  for (const column of requestColumnsToAdd) {
    if (!requestColumns.has(column)) {
      const typeMap = {
        device_model: 'TEXT',
        is_onsite: 'INTEGER NOT NULL DEFAULT 0',
        address: 'TEXT',
        latitude: 'REAL',
        longitude: 'REAL',
        payment_method: "TEXT NOT NULL DEFAULT 'later'",
        payment_status: "TEXT NOT NULL DEFAULT 'Ödənilməyib'"
      };
      await run(`ALTER TABLE requests ADD COLUMN ${column} ${typeMap[column]}`);
    }
  }

  const serviceColumns = new Set((await all('PRAGMA table_info(services)')).map((col) => col.name));
  if (!serviceColumns.has('price')) {
    await run('ALTER TABLE services ADD COLUMN price REAL DEFAULT 0');
  }

  const superAdminPasswordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const userLookupArgs = SUPER_ADMIN_EMAIL_ALIASES.flatMap((candidate) => [candidate, candidate]);
  const userLookupQuery = `SELECT * FROM users WHERE ${SUPER_ADMIN_EMAIL_ALIASES.map(() => 'LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').join(' OR ')}`;
  const userRecord = await get(userLookupQuery, userLookupArgs);
  if (!userRecord) {
    await run('INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, ?)', [ADMIN_USERNAME, ADMIN_USERNAME, superAdminPasswordHash, SUPER_ADMIN_ROLE]);
    console.log(`Default super admin created: ${ADMIN_USERNAME}`);
  } else {
    await run('UPDATE users SET email = ?, username = ?, password_hash = ?, role = ? WHERE id = ?', [ADMIN_USERNAME, ADMIN_USERNAME, superAdminPasswordHash, SUPER_ADMIN_ROLE, userRecord.id]);
  }

  const legacyAdmin = await get('SELECT * FROM admins WHERE LOWER(username) = LOWER(?)', [ADMIN_USERNAME]);
  if (!legacyAdmin) {
    await run('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)', [ADMIN_USERNAME, superAdminPasswordHash, SUPER_ADMIN_ROLE]);
  } else {
    await run('UPDATE admins SET password_hash = ?, role = ? WHERE id = ?', [superAdminPasswordHash, SUPER_ADMIN_ROLE, legacyAdmin.id]);
  }

  const seedServices = [
    ['Phone Diagnostic & Repair', 'Personal Tech'],
    ['Laptop Maintenance & Repair', 'Personal Tech'],
    ['Corporate IT Support', 'Corporate IT Support'],
    ['Server & Network Management', 'Server/Network Management']
  ];

  for (const [name, category] of seedServices) {
    const exists = await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?)', [name]);
    if (!exists) {
      await run('INSERT INTO services (name, category) VALUES (?, ?)', [name, category]);
    }
  }
}

async function startServer() {
  try {
    await ensureDatabase();
    server.listen(PORT, HOST, () => {
      console.log(`Baku Servis server started on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

function shutdown(signal) {
  console.log(`${signal} received; closing server and database safely.`);
  server.close(() => {
    const closeDatabase = (error) => {
      if (error) {
        console.error('Database close failed:', error);
        process.exitCode = 1;
      }
      process.exit();
    };

    if (usePostgres) {
      pool.end().then(() => closeDatabase()).catch(closeDatabase);
      return;
    }

    db.close(closeDatabase);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bakuservis-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: https://unpkg.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' http://localhost:3000 https: ws: wss:",
    "form-action 'self'",
    "frame-src 'self' https://www.google.com https://www.google.com/maps",
    "upgrade-insecure-requests"
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  next();
});

app.get('/', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).send('Baku Servis backend is running!');
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Sitemap: https://bakuservis.az/sitemap.xml'
  ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: 'https://bakuservis.az/', priority: '1.0', changefreq: 'daily' },
    { loc: 'https://bakuservis.az/#services', priority: '0.8', changefreq: 'weekly' },
    { loc: 'https://bakuservis.az/#request-panel', priority: '0.8', changefreq: 'weekly' },
    { loc: 'https://bakuservis.az/#track', priority: '0.7', changefreq: 'weekly' }
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, priority, changefreq }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'İstifadəçi adı və şifrə tələb olunur.' });
    }

    const candidateUser = await get('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [username, username]);
    if (!candidateUser || !bcrypt.compareSync(password, candidateUser.password_hash)) {
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə.' });
    }

    req.session.adminId = candidateUser.id;
    req.session.adminUser = candidateUser.email || candidateUser.username || username;
    req.session.adminRole = normalizeRole(candidateUser.role || ADMIN_ROLE);
    req.session.user = {
      id: candidateUser.id,
      email: candidateUser.email || candidateUser.username || username,
      role: req.session.adminRole
    };

    return res.json({ ok: true, username: req.session.adminUser, role: req.session.adminRole, isSuperAdmin: req.session.adminRole === SUPER_ADMIN_ROLE });
  } catch (error) {
    console.error('POST /api/login error:', error);
    return res.status(500).json({ error: 'Mobil giriş zamanı xəta baş verdi.' });
  }
});

app.get('/api/services', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM services ORDER BY created_at DESC');
    return res.json(rows.map((row) => ({
      ...row,
      price: Number(row.price || 0)
    })));
  } catch (error) {
    console.error('GET /api/services error:', error);
    return res.status(500).json({ error: 'Xidmətlər yüklənə bilmədi.' });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'Genel';
    const price = Number(req.body.price || 0);

    if (!name) {
      return res.status(400).json({ error: 'Xidmət adı tələb olunur.' });
    }

    const dup = await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?)', [name]);
    if (dup) {
      return res.status(409).json({ error: 'Bu xidmət artıq mövcuddur.' });
    }

    const info = await run('INSERT INTO services (name, category, price, created_at) VALUES (?, ?, ?, ?)', [name, category, Number.isFinite(price) ? price : 0, nowIso()]);
    const row = await get('SELECT * FROM services WHERE id = ?', [info.lastInsertRowid]);
    return res.status(201).json({ ok: true, service: row });
  } catch (error) {
    console.error('POST /api/admin/services error:', error);
    return res.status(500).json({ error: 'Xidmət əlavə edilə bilmədi.' });
  }
});

app.get('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM services ORDER BY created_at DESC');
    return res.json(rows.map((row) => ({
      ...row,
      price: Number(row.price || 0)
    })));
  } catch (error) {
    console.error('GET /api/admin/services error:', error);
    return res.status(500).json({ error: 'Xidmətlər yüklənə bilmədi.' });
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'Genel';
    const price = Number(req.body.price || 0);

    if (!name) {
      return res.status(400).json({ error: 'Xidmət adı tələb olunur.' });
    }

    await run('UPDATE services SET name = ?, category = ?, price = ? WHERE id = ?', [name, category, Number.isFinite(price) ? price : 0, id]);
    const row = await get('SELECT * FROM services WHERE id = ?', [id]);
    return res.json({ ok: true, service: row });
  } catch (error) {
    console.error('PUT /api/admin/services/:id error:', error);
    return res.status(500).json({ error: 'Xidmət yenilənə bilmədi.' });
  }
});

app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await run('DELETE FROM services WHERE id = ?', [id]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Xidmət tapılmadı.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/admin/services error:', error);
    return res.status(500).json({ error: 'Xidmət silinə bilmədi.' });
  }
});

app.get('/api/orders/live-board', async (req, res) => {
  try {
    const rows = await all(`
      SELECT id, service_name, COALESCE(device_model, device_info, 'Model bilinmir') AS device_model, status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 6
    `);

    return res.json({
      ok: true,
      orders: (rows || []).map((row) => ({
        id: row.id,
        service_name: row.service_name || 'Xidmət',
        device_model: row.device_model || 'Model bilinmir',
        status: row.status || 'Gözləmədə',
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error('GET /api/orders/live-board error:', error);
    return res.status(500).json({ error: 'İzləmə lövhəsi yüklənə bilmədi.' });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const customer_name = String(req.body.customer_name || '').trim();
    const submittedPhone = sanitizePhoneInput(req.body.customer_phone || '');
    const customer_phone = normalizePhone(submittedPhone);
    const service_name = String(req.body.service_name || '').trim();
    const idempotency_key = String(req.body.idempotency_key || '').trim().slice(0, 120);
    const device_info = String(req.body.device_info || '').trim();
    const device_model = String(req.body.device_model || device_info || '').trim();
    const onsite_address = String(req.body.address || '').trim();

    if (!customer_name || !customer_phone || !service_name) {
      return res.status(400).json({ error: 'Ad, telefon və xidmət sahələri mütləqdir.' });
    }

    if (!isValidAzerbaijaniPhone(submittedPhone)) {
      return res.status(400).json({ error: 'Düzgün Azərbaycan mobil nömrəsi daxil edin.' });
    }

    if (idempotency_key) {
      const existingRequest = await get('SELECT * FROM requests WHERE idempotency_key = ? LIMIT 1', [idempotency_key]);
      if (existingRequest) {
        return res.status(200).json({
          ok: true,
          success: true,
          duplicate: true,
          request_id: existingRequest.id,
          tracking_code: existingRequest.tracking_code,
          payment_method: existingRequest.payment_method,
          payment_status: existingRequest.payment_status,
          created_at: formatDate(existingRequest.created_at),
          status: existingRequest.status
        });
      }
    }

    const serviceExists = await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?)', [service_name]);
    if (!serviceExists) {
      return res.status(400).json({ error: 'Seçilmiş xidmət bazada tapılmadı.' });
    }

    const is_onsite = ['1', 'true', 'yes', 'on'].includes(String(req.body.is_onsite || '').toLowerCase());
    const address = String(req.body.address || '').trim();
    const latitude = Number(req.body.latitude || 0);
    const longitude = Number(req.body.longitude || 0);
    const paymentMethod = String(req.body.payment_method || 'later').trim().toLowerCase();
    const normalizedPaymentMethod = ['prepay', 'later', 'öncədən', 'sonradan', 'onlayn', 'laterpay'].includes(paymentMethod)
      ? (paymentMethod === 'prepay' || paymentMethod === 'öncədən' || paymentMethod === 'onlayn' ? 'prepay' : 'later')
      : 'later';

    if (is_onsite && (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude))) {
      return res.status(400).json({ error: 'Səyyar xidmət üçün ünvan və xəritə koordinatları mütləqdir.' });
    }

    const tracking_code = generateTrackingCode();
    const timestamp = nowIso();
    const paymentStatus = normalizedPaymentMethod === 'prepay' ? 'Ödənilməyib' : 'Təhvil Veriləndə Ödənəcək';

    const requestInsert = [
      tracking_code,
      customer_name,
      customer_phone,
      service_name,
      device_model || device_info || null,
      device_info || null,
      'Gözləmədə',
      0,
      0,
      is_onsite ? 1 : 0,
      address || null,
      Number.isFinite(latitude) ? latitude : null,
      Number.isFinite(longitude) ? longitude : null,
      normalizedPaymentMethod,
      paymentStatus,
      idempotency_key || null,
      timestamp,
      timestamp
    ];

    const orderInsert = [...requestInsert.slice(0, 15), ...requestInsert.slice(16)];
    const result = await run(`
      INSERT INTO requests (tracking_code, customer_name, customer_phone, service_name, device_model, device_info, status, quoted_price, final_price, is_onsite, address, latitude, longitude, payment_method, payment_status, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, requestInsert);

    const orderResult = await run(`
      INSERT INTO orders (tracking_code, customer_name, customer_phone, service_name, device_model, device_info, status, quoted_price, final_price, is_onsite, address, latitude, longitude, payment_method, payment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, orderInsert);

    emitAdminNotification({
      title: 'Yeni müraciət',
      message: `${customer_name} yeni servis müraciəti göndərdi.`,
      meta: {
        customer_name,
        service_name,
        customer_phone,
        status: 'Gözləmədə',
        tracking_code
      }
    });

    void sendAdminEmail({
      title: `🔔 Yeni Müraciət var: ${tracking_code}`,
      summary: 'Sistemə yeni xidmət müraciəti daxil olub.',
      details: {
        'Müştəri': customer_name,
        'Telefon': customer_phone,
        'Xidmət': service_name,
        'Cihaz': device_info || '-',
        'Ünvan / Yerləşmə': onsite_address || address || 'Servisdə',
        'Səyyar xidmət': is_onsite ? 'Bəli' : 'Xeyr',
        'Ödəniş üsulu': normalizedPaymentMethod,
        'İzləmə kodu': tracking_code
      }
    }).catch((emailError) => {
      console.error('❌ Email error:', emailError);
    });

    void sendTelegramNotification(`🔔 Yeni müraciət\n\n👤 ${customer_name}\n📞 ${customer_phone}\n🛠️ ${service_name}\n💻 ${device_info || '-'}\n🔑 ${tracking_code}`);

    return res.status(200).json({
      ok: true,
      success: true,
      request_id: result.lastInsertRowid || orderResult.lastInsertRowid,
      tracking_code,
      payment_method: normalizedPaymentMethod,
      payment_status: paymentStatus,
      created_at: formatDate(timestamp),
      status: 'Gözləmədə'
    });
  } catch (error) {
    console.error('POST /api/requests error:', error);
    return res.status(500).json({ error: 'Müraciət yaradılarkən xəta baş verdi.' });
  }
});

app.get('/api/requests/track/:code', async (req, res) => {
  try {
    const rawInput = String(req.params.code || '').trim();
    const code = rawInput.toUpperCase();
    const phoneDigits = normalizePhone(rawInput);
    const phoneCandidates = Array.from(new Set([
      phoneDigits,
      phoneDigits ? `0${phoneDigits}` : '',
      phoneDigits ? `994${phoneDigits}` : ''
    ].filter(Boolean)));

    let row = null;
    if (code) {
      row = await get('SELECT * FROM requests WHERE tracking_code = ? LIMIT 1', [code]);
    }
    if (!row && phoneCandidates.length) {
      const phoneQuery = `SELECT * FROM requests WHERE customer_phone IN (${phoneCandidates.map(() => '?').join(', ')}) ORDER BY created_at DESC LIMIT 1`;
      row = await get(phoneQuery, phoneCandidates);
    }

    if (!row) {
      return res.status(404).json({ error: 'Bu izləmə kodu və ya telefon nömrəsi ilə müraciət tapılmadı.' });
    }

    return res.json({
      ok: true,
      request: {
        id: row.id,
        tracking_code: row.tracking_code,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        service_name: row.service_name,
        device_info: row.device_info,
        status: row.status,
        quoted_price: Number(row.quoted_price || 0),
        final_price: Number(row.final_price || 0),
        payment_method: row.payment_method || 'later',
        payment_status: row.payment_status || 'Ödənilməyib',
        is_onsite: Boolean(row.is_onsite),
        address: row.address || '',
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        created_at_formatted: formatDate(row.created_at),
        updated_at_formatted: formatDate(row.updated_at)
      }
    });
  } catch (error) {
    console.error('GET /api/requests/track error:', error);
    return res.status(500).json({ error: 'İzləmə məlumatı alınarkən xəta baş verdi.' });
  }
});

app.get('/api/admin/requests', requireAdmin, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM requests ORDER BY created_at DESC');
    return res.json(rows.map((row) => ({
      ...row,
      quoted_price: Number(row.quoted_price || 0),
      final_price: Number(row.final_price || 0),
      payment_method: row.payment_method || 'later',
      payment_status: row.payment_status || 'Ödənilməyib',
      is_onsite: Boolean(row.is_onsite),
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null
    })));
  } catch (error) {
    console.error('GET /api/admin/requests error:', error);
    return res.status(500).json({ error: 'Müraciətlər yüklənə bilmədi.' });
  }
});

app.get('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  try {
    const row = await get('SELECT * FROM requests WHERE id = ?', [Number(req.params.id)]);
    if (!row) {
      return res.status(404).json({ error: 'Müraciət tapılmadı.' });
    }
    return res.json({ request: row });
  } catch (error) {
    console.error('GET /api/admin/requests/:id error:', error);
    return res.status(500).json({ error: 'Müraciət detalları yüklənə bilmədi.' });
  }
});

app.put('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || 'Gözləmədə').trim();
    const quoted_price = Number(req.body.quoted_price || 0);
    const final_price = Number(req.body.final_price || 0);
    const payment_status = String(req.body.payment_status || 'Ödənilməyib').trim();
    const payment_method = String(req.body.payment_method || 'later').trim().toLowerCase();
    const normalizedPaymentMethod = payment_method === 'prepay' ? 'prepay' : 'later';

    await run(`
      UPDATE requests
      SET status = ?, quoted_price = ?, final_price = ?, payment_method = ?, payment_status = ?, updated_at = ?
      WHERE id = ?
    `, [status, quoted_price, final_price, normalizedPaymentMethod, payment_status, nowIso(), id]);

    const row = await get('SELECT * FROM requests WHERE id = ?', [id]);
    return res.json({ ok: true, updated: row });
  } catch (error) {
    console.error('PUT /api/admin/requests/:id error:', error);
    return res.status(500).json({ error: 'Müraciət yenilənə bilmədi.' });
  }
});

app.post('/api/requests/:id/pay', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await get('SELECT * FROM requests WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Müraciət tapılmadı.' });
    }

    const cardNumber = String(req.body.card_number || '').replace(/\s+/g, '');
    const expiry = String(req.body.expiry || '').trim();
    const cvc = String(req.body.cvc || '').trim();

    if (!cardNumber || !expiry || !cvc) {
      return res.status(400).json({ error: 'Kart məlumatları tam doldurulmalıdır.' });
    }

    const paymentStatus = 'Ödənilib';
    const nextStatus = row.status === 'Gözləmədə' || row.status === 'Qiymətləndirildi' ? 'Hazırdır' : row.status || 'Hazırdır';

    await run(`
      UPDATE requests
      SET payment_status = ?, status = ?, updated_at = ?
      WHERE id = ?
    `, [paymentStatus, nextStatus, nowIso(), id]);

    return res.json({ ok: true, payment_status: paymentStatus, status: nextStatus });
  } catch (error) {
    console.error('POST /api/requests/:id/pay error:', error);
    return res.status(500).json({ error: 'Ödəniş işlənə bilmədi.' });
  }
});

app.post('/api/requests/:id/confirm-cash', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await get('SELECT * FROM requests WHERE id = ?', [id]);
    if (!row) {
      return res.status(404).json({ error: 'Müraciət tapılmadı.' });
    }

    const paymentStatus = 'Təhvil veriləndə ödənəcək';
    const nextStatus = 'Təhvil veriləndə ödənəcək';

    await run(`
      UPDATE requests
      SET payment_status = ?, status = ?, payment_method = 'later', updated_at = ?
      WHERE id = ?
    `, [paymentStatus, nextStatus, nowIso(), id]);

    return res.json({ ok: true, payment_status: paymentStatus, status: nextStatus, payment_method: 'later' });
  } catch (error) {
    console.error('POST /api/requests/:id/confirm-cash error:', error);
    return res.status(500).json({ error: 'Təhvil alarkən ödəniş qeydlənə bilmədi.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const lookupCandidates = Array.from(new Set([
      username,
      ADMIN_USERNAME,
      'huseynmanfli844@gmail.com',
      'huseynmanafli844@gmail.com',
      username.replace('manfli', 'manafli'),
      username.replace('manafli', 'manfli'),
      ADMIN_USERNAME.replace('manfli', 'manafli'),
      ADMIN_USERNAME.replace('manafli', 'manfli')
    ].filter(Boolean)));
    const lookupQuery = `SELECT * FROM users WHERE ${lookupCandidates.map(() => 'LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').join(' OR ')}`;
    const lookupArgs = lookupCandidates.flatMap((candidate) => [candidate, candidate]);

    const user = await get(lookupQuery, lookupArgs);
    const admin = !user ? await get('SELECT * FROM admins WHERE LOWER(username) = LOWER(?)', [username]) : null;
    const account = user || admin;

    if (!account || !bcrypt.compareSync(password, account.password_hash)) {
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə.' });
    }

    const role = normalizeRole((account.role || (username.toLowerCase() === ADMIN_USERNAME.toLowerCase() ? SUPER_ADMIN_ROLE : ADMIN_ROLE)));
    req.session.adminId = account.id;
    req.session.adminUser = account.email || account.username || username;
    req.session.adminRole = role;
    req.session.user = {
      id: account.id,
      email: account.email || account.username || username,
      role
    };

    return res.json({ ok: true, username: req.session.adminUser, role, isSuperAdmin: role === SUPER_ADMIN_ROLE });
  } catch (error) {
    console.error('POST /api/admin/login error:', error);
    return res.status(500).json({ error: 'Admin girişi zamanı xəta.' });
  }
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.adminId) {
    const role = normalizeRole(req.session.user?.role || req.session.adminRole || ADMIN_ROLE);
    return res.json({
      loggedIn: true,
      username: req.session.adminUser,
      role,
      isSuperAdmin: role === SUPER_ADMIN_ROLE
    });
  }
  return res.json({ loggedIn: false });
});

app.get('/api/admin/users', requireSuperAdmin, async (req, res) => {
  try {
    const rows = await all('SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC');
    return res.json({ ok: true, users: rows.map((row) => ({ ...row, role: normalizeRole(row.role) })) });
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    return res.status(500).json({ error: 'Admin siyahısı yüklənə bilmədi.' });
  }
});

app.post('/api/admin/create-admin', requireSuperAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Düzgün e-poçt ünvanı daxil edin.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır.' });
    }

    const existing = await get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Bu admin artıq mövcuddur.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const role = ADMIN_ROLE;
    const result = await run('INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, ?)', [email, email, passwordHash, role]);
    const newUser = await get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);

    return res.status(201).json({ ok: true, user: { id: newUser.id, email: newUser.email, username: newUser.username || newUser.email, role: normalizeRole(newUser.role) } });
  } catch (error) {
    console.error('POST /api/admin/create-admin error:', error);
    return res.status(500).json({ error: 'Yeni admin yaradılarkən xəta baş verdi.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post('/api/chat/send', async (req, res) => {
  try {
    const sessionId = String(req.body.session_id || '').trim() || `guest-${Date.now()}`;
    const senderType = String(req.body.sender_type || '').trim();
    const message = String(req.body.message || '').trim();
    const customerName = String(req.body.customer_name || '').trim();
    const customerPhone = normalizePhone(req.body.customer_phone || '');

    if (!['customer', 'admin', 'bot'].includes(senderType) || !message) {
      return res.status(400).json({ error: 'Göndərən və mesaj mütləqdir.' });
    }

    const existingSessionMeta = await get(
      'SELECT customer_name, customer_phone FROM chat_messages WHERE session_id = ? AND (customer_name IS NOT NULL OR customer_phone IS NOT NULL) ORDER BY id DESC LIMIT 1',
      [sessionId]
    );
    const resolvedCustomerName = customerName || existingSessionMeta?.customer_name || 'Müştəri';
    const resolvedCustomerPhone = customerPhone || existingSessionMeta?.customer_phone || '';

    const saved = await run(
      'INSERT INTO chat_messages (session_id, sender_type, message, customer_name, customer_phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, senderType, message, senderType === 'customer' ? resolvedCustomerName : (existingSessionMeta?.customer_name || null), senderType === 'customer' ? resolvedCustomerPhone : (existingSessionMeta?.customer_phone || null), nowIso()]
    );

    const row = await get('SELECT * FROM chat_messages WHERE id = ?', [saved.lastInsertRowid]);

    if (senderType === 'customer') {
      const sessionHistory = await all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
      const botReply = getKnowledgeBaseReply(message, sessionHistory);
      const botSaved = await run(
        'INSERT INTO chat_messages (session_id, sender_type, message, customer_name, customer_phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, 'bot', botReply, resolvedCustomerName, resolvedCustomerPhone, nowIso()]
      );
      const botRow = await get('SELECT * FROM chat_messages WHERE id = ?', [botSaved.lastInsertRowid]);

      emitAdminNotification({
        title: 'Yeni canlı chat',
        message: `Yeni mesaj: ${message}`,
        meta: {
          session_id: sessionId,
          sender_type: 'customer',
          customer_name: resolvedCustomerName,
          customer_phone: resolvedCustomerPhone
        }
      });

      void sendAdminEmail({
        title: 'Baku Servis — Canlı chat mesajı',
        summary: 'Canlı çatda yeni müştəri mesajı daxil olub.',
        details: {
          'Session ID': sessionId,
          'Müştəri': resolvedCustomerName,
          'Telefon': formatPhoneDisplay(resolvedCustomerPhone) || resolvedCustomerPhone || '-',
          'Müştəri mesajı': message,
          'Bot cavabı': botReply
        }
      }).catch((emailError) => {
        console.error('Email notification failed (non-blocking):', emailError);
      });
    void sendTelegramNotification(`🔔 Yeni canlı chat mesajı\n\n👤 Müştəri: ${resolvedCustomerName}\n📞 Telefon: ${resolvedCustomerPhone || '-'}\n💬 Mesaj: ${message}\n🤖 Bot cavabı: ${botReply}`);
      return res.status(201).json({ ok: true, message: row, bot_message: botRow, reply: botReply });
    }

    io.emit('chat:message', { session_id: sessionId, sender_type: senderType, message });
    return res.status(201).json({ ok: true, message: row });
  } catch (error) {
    console.error('POST /api/chat/send error:', error);
    return res.status(500).json({ error: 'Mesaj göndərilmədi.' });
  }
});

app.get('/api/chat/history/:sessionId', async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'Session id tələb olunur.' });
    }

    const rows = await all('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
    return res.json({ ok: true, messages: rows || [] });
  } catch (error) {
    console.error('GET /api/chat/history error:', error);
    return res.status(500).json({ error: 'Çat tarixçəsi yüklənə bilmədi.' });
  }
});

app.get('/api/admin/chats', requireAdmin, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM chat_messages ORDER BY created_at DESC');
    const sessions = new Map();

    for (const row of rows) {
      const existing = sessions.get(row.session_id) || {
        session_id: row.session_id,
        customer_name: row.customer_name || 'Müştəri',
        customer_phone: row.customer_phone || '',
        last_message: '',
        last_message_at: row.created_at,
        unread_count: 0,
        messages: []
      };

      if (row.customer_name) existing.customer_name = row.customer_name;
      if (row.customer_phone) existing.customer_phone = row.customer_phone;
      existing.last_message = row.message;
      existing.last_message_at = row.created_at;
      existing.messages.push(row);
      if (row.sender_type === 'customer') {
        existing.unread_count += 1;
      }
      sessions.set(row.session_id, existing);
    }

    const chats = Array.from(sessions.values())
      .map((chat) => ({
        ...chat,
        unread_count: Number(chat.unread_count || 0),
        last_message_at: chat.last_message_at || new Date().toISOString(),
        customer_name: chat.customer_name || chat.session_id,
        customer_phone: chat.customer_phone || ''
      }))
      .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));

    return res.json({ ok: true, chats });
  } catch (error) {
    console.error('GET /api/admin/chats error:', error);
    return res.status(500).json({ error: 'Canlı çat siyahısı yüklənə bilmədi.' });
  }
});

io.on('connection', (socket) => {
  socket.on('admin:join', () => {
    socket.emit('admin:joined', { ok: true });
  });
});

startServer();
