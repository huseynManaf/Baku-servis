// server.js
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory services version to notify clients when services change
let servicesVersion = 1;

function bumpServicesVersion() { servicesVersion = (servicesVersion || 1) + 1; }

// Simple login middleware for regular users
function requireUser(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Giriş tələb olunur' });
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'hugu-servis-cox-gizli-acar-deyisin',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 saat
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// ---------- Kömekci funksiyalar ----------
function genTrackingCode() {
  return 'HG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'Giris teleb olunur' });
}

async function ensureAdminsTableAndDefault() {
  // Try to create admins table if missing and optionally insert default admin
  try {
    // Try Postgres-style table creation first (SERIAL)
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);
    } catch (e2) {
      // If Postgres-style failed (e.g., running on SQLite), try a SQLite-compatible DDL
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
      } catch (e3) {
        console.error('Failed to create admins table with both Postgres and SQLite DDL:', e3);
      }
    }

    const defUser = process.env.DEFAULT_ADMIN_USER;
    const defPass = process.env.DEFAULT_ADMIN_PASS;
    if (defUser && defPass) {
      const check = await db.query('SELECT id FROM admins WHERE username = $1', [defUser]);
      if (!check.rows || check.rows.length === 0) {
        const hash = bcrypt.hashSync(defPass, 10);
        await db.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [defUser, hash]);
        console.log('Default admin created from environment variable DEFAULT_ADMIN_USER');
      }
    }
  } catch (e) {
    // Non-fatal: log and continue. Upstream handlers will surface errors to client.
    console.error('ensureAdminsTableAndDefault error:');
    console.error(e);
  }
}

async function ensureMessagesAndPayments() {
  try {
    // Postgres-style DDL
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          request_id INTEGER NOT NULL,
          sender TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          request_id INTEGER NOT NULL,
          amount NUMERIC NOT NULL,
          method TEXT,
          status TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);
    } catch (e2) {
      // Try SQLite-compatible DDL
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            sender TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
        await db.query(`
          CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
      } catch (e3) {
        console.error('Failed to create messages/payments tables with both Postgres and SQLite DDL:', e3);
      }
    }
  } catch (err) {
    console.error('ensureMessagesAndPayments error:');
    console.error(err);
  }
}

async function ensureUsersTable() {
  try {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          phone TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);
    } catch (e2) {
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
      } catch (e3) {
        console.error('Failed to create users table with both Postgres and SQLite DDL:', e3);
      }
    }
  } catch (err) {
    console.error('ensureUsersTable error:', err);
  }
}

function publicRequest(row) {
  // mushteriye/adminə qaytarilan zaman heç bir gizli sahə yoxdur, sadece formatlayiriq
  return row;
}

function formatStatusLabel(status) {
  const map = {
    yeni: 'Yeni',
    baxilir: 'Baxılır',
    qiymetlendirildi: 'Qiymətləndirildi',
    icrada: 'İcrada',
    hazir: 'Hazırdır',
    teslim: 'Təhvil verilib',
    legv: 'Ləğv edilib'
  };
  return map[status] || status;
}

async function addRequestUpdateMessage(requestId, previousRow, nextValues) {
  try {
    await ensureMessagesAndPayments();
    const parts = [];
    const statusBefore = previousRow && previousRow.status ? previousRow.status : null;
    const statusAfter = nextValues && nextValues.status !== undefined ? nextValues.status : statusBefore;
    if (statusAfter && statusBefore && statusAfter !== statusBefore) {
      parts.push(`Status dəyişdirildi: ${formatStatusLabel(statusBefore)} → ${formatStatusLabel(statusAfter)}`);
    }
    const prevQuoted = previousRow && previousRow.quoted_price !== null && previousRow.quoted_price !== undefined ? Number(previousRow.quoted_price) : null;
    const nextQuoted = nextValues && nextValues.quoted_price !== undefined ? Number(nextValues.quoted_price) : prevQuoted;
    if (nextQuoted !== null && prevQuoted !== null && nextQuoted !== prevQuoted) {
      parts.push(`Təklif olunan qiymət: ${nextQuoted} ₼`);
    } else if (nextQuoted !== null && prevQuoted === null && nextValues && nextValues.quoted_price !== undefined) {
      parts.push(`Təklif olunan qiymət: ${nextQuoted} ₼`);
    }
    const prevFinal = previousRow && previousRow.final_price !== null && previousRow.final_price !== undefined ? Number(previousRow.final_price) : null;
    const nextFinal = nextValues && nextValues.final_price !== undefined ? Number(nextValues.final_price) : prevFinal;
    if (nextFinal !== null && prevFinal !== null && nextFinal !== prevFinal) {
      parts.push(`Son qiymət: ${nextFinal} ₼`);
    } else if (nextFinal !== null && prevFinal === null && nextValues && nextValues.final_price !== undefined) {
      parts.push(`Son qiymət: ${nextFinal} ₼`);
    }
    if (!parts.length) return;
    const body = parts.join(' | ');
    await db.query('INSERT INTO messages (request_id, sender, body) VALUES ($1, $2, $3)', [requestId, 'admin', body]);
  } catch (err) {
    console.error('addRequestUpdateMessage error:', err && err.message ? err.message : err);
  }
}

// =====================================================
// XİDMƏTLƏR (ictimai - hər kəs görə bilər)
// =====================================================
// (Keçmiş SQLite-based route silindi — Postgres versiyası aşağıdadır)

// =====================================================
// MÜŞTƏRI MÜRACİƏTLƏRİ
// =====================================================

// ====================================================
// XİDMƏTLƏR (İctimai)
// ====================================================
app.get('/api/services', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM services WHERE is_active = true ORDER BY category, name');
        res.json(rows);
    } catch (error) {
      console.error('Xidmətlər alma xətası:');
      console.error(error && error.stack ? error.stack : error);
      res.status(500).json({ error: 'Server xətası baş verdi', details: error && error.message ? error.message : String(error) });
    }
});

// ====================================================
// MÜŞTƏRİ MÜRACİƏTLƏRİ
// ====================================================
app.post('/api/requests', async (req, res) => {
    try {
    const {
      customer_name: rawCustomerName,
      phone: rawPhone,
      service_id,
      device_info: rawDeviceInfo,
      problem_description: rawProblemDescription,
      address_text: rawAddressText,
      latitude: rawLatitude,
      longitude: rawLongitude,
      visit_type: rawVisitType
    } = req.body || {};

    const customer_name = (rawCustomerName || '').toString().trim().slice(0,200);
    let phone = (rawPhone || '').toString().trim();
    // Normalize phone: keep digits and leading +
    phone = (phone.startsWith('+') ? '+' : '') + phone.replace(/[^0-9]/g, '');
    const problem_description = (rawProblemDescription || '').toString().trim().slice(0,2000);
    const address_text = rawAddressText ? rawAddressText.toString().trim().slice(0,500) : null;
    const device_info = rawDeviceInfo ? rawDeviceInfo.toString().trim().slice(0,500) : null;

    if (!customer_name || !phone || !problem_description) {
      return res.status(400).json({ error: 'Ad, telefon və problem izahı məcburidir' });
    }

    // Coerce numeric fields
    let svcId = null;
    if (service_id !== undefined && service_id !== null && service_id !== '') {
      svcId = Number(service_id);
      if (Number.isNaN(svcId)) return res.status(400).json({ error: 'Xidmət identifikatoru düzgün deyil' });
    }

    let latitude = null, longitude = null;
    if (rawLatitude !== undefined && rawLatitude !== null && rawLatitude !== '') {
      latitude = parseFloat(rawLatitude);
      if (Number.isNaN(latitude)) return res.status(400).json({ error: 'Latitude düzgün deyil' });
    }
    if (rawLongitude !== undefined && rawLongitude !== null && rawLongitude !== '') {
      longitude = parseFloat(rawLongitude);
      if (Number.isNaN(longitude)) return res.status(400).json({ error: 'Longitude düzgün deyil' });
    }

    const allowedVisit = ['servis', 'evde'];
    const visit_type = allowedVisit.includes((rawVisitType || '').toString()) ? rawVisitType : 'servis';

    if (visit_type === 'evde' && !address_text) {
      return res.status(400).json({ error: 'Evdə xidmət üçün ünvan gərəkdir' });
    }

        // Unikal izləmə kodu yaratmaq
        let code;
        let exists = true;
        while (exists) {
            code = genTrackingCode();
            const check = await db.query('SELECT id FROM requests WHERE tracking_code = $1', [code]);
            if (check.rows.length === 0) exists = false;
        }

        const queryText = `
            INSERT INTO requests 
            (tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;

        const values = [
          code,
          customer_name,
          phone,
          svcId,
          device_info || null,
          problem_description,
          address_text || null,
          latitude,
          longitude,
          visit_type
        ];

        const result = await db.query(queryText, values);

        // Try to link request with logged-in user if user_id column exists
        try {
          if (req.session && req.session.userId) {
            await db.query('UPDATE requests SET user_id = $1 WHERE id = $2', [req.session.userId, result.rows[0].id]);
          }
        } catch (e) {
          // ignore if column doesn't exist
        }

        res.json({ success: true, id: result.rows[0].id, tracking_code: code });
    } catch (error) {
        console.error('Müraciət yaratma xətası:');
        console.error(error && error.stack ? error.stack : error);
        res.status(500).json({ error: 'Server xətası baş verdi', details: error && error.message ? error.message : String(error) });
    }
});



// Muraciet melumatlarini izleme kodu + telefon ile gormek
app.get('/api/requests/track', async (req, res) => {
  try {
    const { code, phone } = req.query;
    if (!code || !phone) return res.status(400).json({ error: 'Kod ve telefon lazimdir' });
    const result = await db.query('SELECT * FROM requests WHERE tracking_code = $1 AND phone = $2', [code, phone]);
    const row = result.rows[0];
    console.log('--> TRACKING FETCH FOR CODE:', code, 'DB ROW:', row);
    if (!row) return res.status(404).json({ error: 'Muraciet tapilmadi' });

    const latest = {
      ...row,
      status: row.status || row.request_status || 'yeni',
      quoted_price: row.quoted_price !== null && row.quoted_price !== undefined ? Number(row.quoted_price) : (row.quotedPrice !== null && row.quotedPrice !== undefined ? Number(row.quotedPrice) : null),
      final_price: row.final_price !== null && row.final_price !== undefined ? Number(row.final_price) : (row.finalPrice !== null && row.finalPrice !== undefined ? Number(row.finalPrice) : null),
      is_paid: Boolean(row.is_paid)
    };

    res.json(publicRequest(latest));
  } catch (err) {
    console.error('Tracking error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// Chat mesajlarini gormek (musteri terefi - kod+telefon ile)
app.get('/api/requests/:id/messages', async (req, res) => {
  try {
    const { code, phone } = req.query;
    const reqRes = await db.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    const reqRow = reqRes.rows[0];
    if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });

    if (!(req.session && req.session.adminId)) {
      if (reqRow.tracking_code !== code || reqRow.phone !== phone) {
        return res.status(403).json({ error: 'Icaze yoxdur' });
      }
    }
    const msgsRes = await db.query('SELECT * FROM messages WHERE request_id = $1 ORDER BY id ASC', [req.params.id]);
    res.json(msgsRes.rows);
  } catch (err) {
    console.error('Get messages error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// Mushteri mesaj yazir
app.post('/api/requests/:id/messages', async (req, res) => {
  try {
    const { code, phone, body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Bosh mesaj' });
    const reqRes = await db.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    const reqRow = reqRes.rows[0];
    if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });
    if (reqRow.tracking_code !== code || reqRow.phone !== phone) {
      return res.status(403).json({ error: 'Icaze yoxdur' });
    }
    await db.query('INSERT INTO messages (request_id, sender, body) VALUES ($1, $2, $3)', [req.params.id, 'customer', body.trim()]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Post customer message error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// Mock onlayn odenish - mushteri "kart ile ode" deyende
app.post('/api/requests/:id/pay', async (req, res) => {
  try {
    const { code, phone, method } = req.body;
    const reqRes = await db.query('SELECT * FROM requests WHERE id = $1', [req.params.id]);
    const reqRow = reqRes.rows[0];
    if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });
    if (reqRow.tracking_code !== code || reqRow.phone !== phone) return res.status(403).json({ error: 'Icaze yoxdur' });
    const amount = reqRow.final_price || reqRow.quoted_price;
    if (!amount) return res.status(400).json({ error: 'Hele qiymet tesdiqlenmeyib' });

    const payRes = await db.query('INSERT INTO payments (request_id, amount, method, status) VALUES ($1, $2, $3, $4) RETURNING id', [req.params.id, amount, method || 'card', 'gozleyir']);
    const paymentId = payRes.rows[0].id;

    // DEMO: avtomatik ödəniş tamamlandı kimi göstərin
    await db.query('UPDATE payments SET status = $1 WHERE id = $2', ['odenildi', paymentId]);
    await db.query('UPDATE requests SET is_paid = 1 WHERE id = $1', [req.params.id]);

    res.json({ ok: true, payment_id: paymentId, amount, status: 'odenildi', demo: true });
  } catch (err) {
    console.error('Payment error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// =====================================================
// ADMIN - GİRİŞ
// =====================================================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    // Ensure admins table exists and optionally create a default admin from env
    await ensureAdminsTableAndDefault();
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).json({ error: 'Istifadeci adi ve ya shifre yanlishdir' });
    }
    req.session.adminId = admin.id;
    req.session.adminUser = admin.username;
    res.json({ ok: true, username: admin.username });
  } catch (err) {
    console.error('Admin login error:');
    console.error(err);
    // If the error indicates missing relation/table, provide actionable message
    if (err && err.code === '42P01') {
      return res.status(500).json({ error: 'Verilənlər bazasında `admins` cədvəli yoxdur', details: err.message });
    }
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.adminId) return res.json({ loggedIn: true, username: req.session.adminUser });
  res.json({ loggedIn: false });
});

// =====================================================
// ADMIN - MÜRACİƏTLƏR
// =====================================================
app.get('/api/admin/requests', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let q, params = [];
    if (status && status !== 'hamisi') {
      q = `SELECT r.*, s.name AS service_name FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE r.status = $1 ORDER BY r.created_at DESC`;
      params = [status];
    } else {
      q = `SELECT r.*, s.name AS service_name FROM requests r LEFT JOIN services s ON s.id = r.service_id ORDER BY r.created_at DESC`;
    }
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Admin requests list error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.get('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  try {
    const reqRes = await db.query(`SELECT r.*, s.name AS service_name FROM requests r LEFT JOIN services s ON s.id = r.service_id WHERE r.id = $1`, [req.params.id]);
    const row = reqRes.rows[0];
    if (!row) return res.status(404).json({ error: 'Tapilmadi' });

    const normalizedRequest = {
      ...row,
      status: row.status || '',
      quoted_price: row.quoted_price === null || row.quoted_price === undefined ? '' : Number(row.quoted_price),
      final_price: row.final_price === null || row.final_price === undefined ? '' : Number(row.final_price)
    };

    let messages = [];
    let payments = [];
    try {
      const messagesRes = await db.query('SELECT * FROM messages WHERE request_id = $1 ORDER BY id ASC', [req.params.id]);
      messages = messagesRes.rows || [];
    } catch (e) {
      console.error('Failed to load messages for request', req.params.id, e && e.message ? e.message : e);
      messages = [];
    }
    try {
      const paymentsRes = await db.query('SELECT * FROM payments WHERE request_id = $1 ORDER BY id DESC', [req.params.id]);
      payments = paymentsRes.rows || [];
    } catch (e) {
      console.error('Failed to load payments for request', req.params.id, e && e.message ? e.message : e);
      payments = [];
    }
    res.json({ request: normalizedRequest, messages, payments });
  } catch (err) {
    console.error('Admin get request error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

function normalizeMoneyValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (str === '') return null;
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
}

async function updateRequestRecord(requestId, payload) {
  const { status, quoted_price, final_price } = payload || {};
  console.log('--> ADMIN UPDATE RECEIVED:', requestId, payload);

  const reqRes = await db.query('SELECT * FROM requests WHERE id = $1', [requestId]);
  const previousRow = reqRes.rows[0];
  if (!previousRow) {
    return { error: 'Tapilmadi', statusCode: 404 };
  }

  const statusValue = status !== undefined && status !== null && status !== '' ? status : previousRow.status;
  const quotedValueRaw = quoted_price === undefined ? previousRow.quoted_price : normalizeMoneyValue(quoted_price);
  const finalValueRaw = final_price === undefined ? previousRow.final_price : normalizeMoneyValue(final_price);
  const quotedValue = quotedValueRaw !== null && quotedValueRaw !== undefined ? Number(quotedValueRaw) : null;
  const finalValue = finalValueRaw !== null && finalValueRaw !== undefined ? Number(finalValueRaw) : null;

  const isPg = !!(db && db.pool);
  const sql = isPg
    ? 'UPDATE requests SET status = $1, quoted_price = $2, final_price = $3, updated_at = $4 WHERE id = $5'
    : 'UPDATE requests SET status = ?, quoted_price = ?, final_price = ?, updated_at = ? WHERE id = ?';

  const params = isPg
    ? [statusValue, quotedValue, finalValue, new Date().toISOString(), requestId]
    : [statusValue, quotedValue, finalValue, new Date().toISOString(), requestId];

  console.log('SQL UPDATE:', sql, 'PARAMS:', params);
  const result = await db.query(sql, params);
  console.log('--> DB UPDATE RESULT:', result);

  const updatedQuery = await db.query('SELECT * FROM requests WHERE id = $1', [requestId]);
  const updatedRow = updatedQuery.rows[0];
  await addRequestUpdateMessage(requestId, previousRow, { status: statusValue, quoted_price: quotedValue, final_price: finalValue });
  return { success: true, data: updatedRow };
}

app.put('/api/requests/:id', requireAdmin, async (req, res) => {
  try {
    console.log('--> ADMIN UPDATE RECEIVED:', req.params.id, req.body);
    const result = await updateRequestRecord(req.params.id, req.body);
    if (result && result.error) return res.status(result.statusCode || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('Admin update request error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/requests/:id', requireAdmin, async (req, res) => {
  try {
    console.log('--> ADMIN UPDATE RECEIVED:', req.params.id, req.body);
    const result = await updateRequestRecord(req.params.id, req.body);
    if (result && result.error) return res.status(result.statusCode || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('Admin update request error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.put('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  try {
    console.log('--> ADMIN UPDATE RECEIVED:', req.params.id, req.body);
    const result = await updateRequestRecord(req.params.id, req.body);
    if (result && result.error) return res.status(result.statusCode || 400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('Admin update request error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// Admin chat-e cavab yazir
app.post('/api/admin/requests/:id/messages', requireAdmin, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Bosh mesaj' });
    await db.query('INSERT INTO messages (request_id, sender, body) VALUES ($1, $2, $3)', [req.params.id, 'admin', body.trim()]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin post message error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// =====================================================
// ADMIN - XİDMƏTLƏR (əlavə et / redaktə / sil)
// =====================================================
app.get('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM services ORDER BY category, name');
    res.json(result.rows);
  } catch (err) {
    console.error('Admin services list error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const { name, category, description, price, discount_price } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Ad ve qiymet mecburidir' });
    const result = await db.query('INSERT INTO services (name, category, description, price, discount_price) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, category || 'umumi', description || '', price, discount_price || null]);
    bumpServicesVersion();
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Admin create service error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const { name, category, description, price, discount_price, is_active } = req.body;
    const parts = [];
    const params = [];
    if (name !== undefined) { params.push(name); parts.push(`name = $${params.length}`); }
    if (category !== undefined) { params.push(category); parts.push(`category = $${params.length}`); }
    if (description !== undefined) { params.push(description); parts.push(`description = $${params.length}`); }
    if (price !== undefined) { params.push(price); parts.push(`price = $${params.length}`); }
    if (discount_price !== undefined) { params.push(discount_price); parts.push(`discount_price = $${params.length}`); }
    if (is_active !== undefined) { params.push(is_active ? 1 : 0); parts.push(`is_active = $${params.length}`); }
    parts.push(`updated_at = $${params.length + 1}`); params.push(new Date().toISOString());
    params.push(req.params.id);
    const q = `UPDATE services SET ${parts.join(', ')} WHERE id = $${params.length}`;
    await db.query(q, params);
    bumpServicesVersion();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin update service error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    bumpServicesVersion();
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin delete service error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// =====================================================
// ADMIN - SADƏ STATİSTİKA
// =====================================================
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    let total = 0, yeni = 0, icrada = 0, hazir = 0, gelir = 0.0;
    try {
      const totalRes = await db.query('SELECT COUNT(*) AS c FROM requests');
      total = parseInt(totalRes.rows[0].c, 10);
    } catch (e) {
      console.error('Failed to count requests total:', e && e.message ? e.message : e);
      total = 0;
    }
    try {
      const yeniRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'yeni'");
      yeni = parseInt(yeniRes.rows[0].c, 10);
    } catch (e) { console.error('Failed to count yeni:', e && e.message ? e.message : e); yeni = 0; }
    try {
      const icradaRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'icrada'");
      icrada = parseInt(icradaRes.rows[0].c, 10);
    } catch (e) { console.error('Failed to count icrada:', e && e.message ? e.message : e); icrada = 0; }
    try {
      const hazirRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'hazir'");
      hazir = parseInt(hazirRes.rows[0].c, 10);
    } catch (e) { console.error('Failed to count hazir:', e && e.message ? e.message : e); hazir = 0; }
    try {
      const gelirRes = await db.query("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status = 'odenildi'");
      gelir = parseFloat(gelirRes.rows[0].s);
    } catch (e) { console.error('Failed to sum gelir:', e && e.message ? e.message : e); gelir = 0.0; }
    res.json({ total, yeni, icrada, hazir, gelir });
  } catch (err) {
    console.error('Admin stats error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// Expose services version so clients can poll and reload service list
app.get('/api/services/version', (req, res) => {
  res.json({ version: servicesVersion || 1 });
});

// Regular user registration/login
app.post('/api/register', async (req, res) => {
  try {
    let { username, password, phone } = req.body || {};
    username = (username || '').toString().trim().slice(0,80);
    password = (password || '').toString();
    phone = phone ? phone.toString().trim().slice(0,40) : null;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    // Check existing username first to return friendly error
    try {
      const chk = await db.query('SELECT id FROM users WHERE username = $1', [username]);
      if (chk.rows && chk.rows.length) return res.status(409).json({ error: 'username_taken', details: 'Bu istifadəçi adı artıq mövcuddur' });
    } catch (e) {
      // ignore check failures and try insert; fallback
    }

    const hash = bcrypt.hashSync(password, 10);
    try {
      const result = await db.query('INSERT INTO users (username, password_hash, phone) VALUES ($1,$2,$3) RETURNING id, username', [username, hash, phone || null]);
      const user = result.rows[0];
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ ok: true, id: user.id, username: user.username });
    } catch (errInsert) {
      // Duplicate key handling for Postgres/SQLite
      const msg = (errInsert && errInsert.code === '23505') || (errInsert && /unique/i.test(String(errInsert.message || '')));
      if (msg) return res.status(409).json({ error: 'username_taken', details: 'Bu istifadəçi adı artıq mövcuddur' });
      throw errInsert;
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash || '')) return res.status(401).json({ error: 'invalid credentials' });
    req.session.userId = user.id; req.session.username = user.username;
    res.json({ ok: true, id: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) return res.json({ loggedIn: true, id: req.session.userId, username: req.session.username });
  res.json({ loggedIn: false });
});

// User's requests list
app.get('/api/user/requests', requireUser, async (req, res) => {
  try {
    // attempt to select requests linked to user_id; if schema lacks user_id, return empty
    try {
      const r = await db.query('SELECT * FROM requests WHERE user_id = $1 ORDER BY created_at DESC', [req.session.userId]);
      return res.json(r.rows || []);
    } catch (e) {
      console.error('Failed to load user requests (maybe user_id missing):', e && e.message ? e.message : e);
      return res.json([]);
    }
  } catch (err) {
    console.error('User requests error:', err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

// ---------- Xeta idaresi (bazani ayaqda saxlamaq ucun) ----------
app.use((err, req, res, next) => {
  console.error('[XETA]');
  console.error(err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Server xetasi bash verdi. Bir az sonra yeniden cehd edin.', details: err && err.message ? err.message : String(err) });
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

// Initialize essential tables (admins, messages, payments) before listening
(async () => {
  try {
    await ensureAdminsTableAndDefault();
    await ensureMessagesAndPayments();
    await ensureUsersTable();
    // try to add user_id column to requests table if missing
    try {
      await db.query('ALTER TABLE requests ADD COLUMN IF NOT EXISTS user_id INTEGER');
    } catch (e) {
      // Some DBs (SQLite) don't support IF NOT EXISTS in ALTER; try a safe path
      try { await db.query('ALTER TABLE requests ADD COLUMN user_id INTEGER'); } catch (ee) { /* ignore */ }
    }
  } catch (e) {
    console.error('Startup table initialization error:', e);
  }
  app.listen(PORT, () => {
    console.log(`HUGU Servis ${PORT} portunda ishe dushdu -> http://localhost:${PORT}`);
  });
})();
