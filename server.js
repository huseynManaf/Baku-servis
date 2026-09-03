require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'hugu.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(DB_PATH);
db.configure('busyTimeout', 5000);

const ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USER || process.env.ADMIN_USER || 'huseynmanfli844@gmail.com';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASS || process.env.ADMIN_PASS || 'Baku2019';

function nowIso() {
  return new Date().toISOString();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function generateTrackingCode() {
  return `HG-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'Admin girişi tələb olunur.' });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastInsertRowid: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'Genel',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_name TEXT NOT NULL,
      device_info TEXT,
      status TEXT NOT NULL DEFAULT 'Gözləmədə',
      quoted_price REAL DEFAULT 0,
      final_price REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const admin = await get('SELECT id FROM admins WHERE username = ?', [ADMIN_USERNAME]);
  if (!admin) {
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    await run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [ADMIN_USERNAME, passwordHash]);
    console.log(`Default admin created: ${ADMIN_USERNAME}`);
  }

  const seedServices = [
    ['Format', 'Laptop'],
    ['Virus Təmizliyi', 'Komputer'],
    ['SSD Quraşdırma', 'Hardware'],
    ['BIOS reset', 'Hardware']
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
    app.listen(PORT, () => {
      console.log(`HUGU Servis server started on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'hugu-servis-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/services', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM services ORDER BY created_at DESC');
    return res.json(rows);
  } catch (error) {
    console.error('GET /api/services error:', error);
    return res.status(500).json({ error: 'Xidmətlər yüklənə bilmədi.' });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'Genel';

    if (!name) {
      return res.status(400).json({ error: 'Xidmət adı tələb olunur.' });
    }

    const dup = await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?)', [name]);
    if (dup) {
      return res.status(409).json({ error: 'Bu xidmət artıq mövcuddur.' });
    }

    const info = await run('INSERT INTO services (name, category, created_at) VALUES (?, ?, ?)', [name, category, nowIso()]);
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
    return res.json(rows);
  } catch (error) {
    console.error('GET /api/admin/services error:', error);
    return res.status(500).json({ error: 'Xidmətlər yüklənə bilmədi.' });
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

app.post('/api/requests', async (req, res) => {
  try {
    const customer_name = String(req.body.customer_name || '').trim();
    const customer_phone = String(req.body.customer_phone || '').trim();
    const service_name = String(req.body.service_name || '').trim();
    const device_info = String(req.body.device_info || '').trim();

    if (!customer_name || !customer_phone || !service_name) {
      return res.status(400).json({ error: 'Ad, telefon və xidmət sahələri mütləqdir.' });
    }

    const exists = await get('SELECT id FROM services WHERE LOWER(name) = LOWER(?)', [service_name]);
    if (!exists) {
      return res.status(400).json({ error: 'Seçilmiş xidmət bazada tapılmadı.' });
    }

    const tracking_code = generateTrackingCode();
    const timestamp = nowIso();
    const result = await run(`
      INSERT INTO requests (tracking_code, customer_name, customer_phone, service_name, device_info, status, quoted_price, final_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tracking_code, customer_name, customer_phone, service_name, device_info || null, 'Gözləmədə', 0, 0, timestamp, timestamp]);

    return res.status(201).json({
      ok: true,
      request_id: result.lastInsertRowid,
      tracking_code,
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
    const code = String(req.params.code || '').trim().toUpperCase();
    const row = await get('SELECT * FROM requests WHERE tracking_code = ?', [code]);

    if (!row) {
      return res.status(404).json({ error: 'Bu izləmə kodu ilə müraciət tapılmadı.' });
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
      final_price: Number(row.final_price || 0)
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

    await run(`
      UPDATE requests
      SET status = ?, quoted_price = ?, final_price = ?, updated_at = ?
      WHERE id = ?
    `, [status, quoted_price, final_price, nowIso(), id]);

    const row = await get('SELECT * FROM requests WHERE id = ?', [id]);
    return res.json({ ok: true, updated: row });
  } catch (error) {
    console.error('PUT /api/admin/requests/:id error:', error);
    return res.status(500).json({ error: 'Müraciət yenilənə bilmədi.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const admin = await get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Yanlış istifadəçi adı və ya şifrə.' });
    }

    req.session.adminId = admin.id;
    req.session.adminUser = admin.username;
    return res.json({ ok: true, username: admin.username });
  } catch (error) {
    console.error('POST /api/admin/login error:', error);
    return res.status(500).json({ error: 'Admin girişi zamanı xəta.' });
  }
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ loggedIn: true, username: req.session.adminUser });
  }
  return res.json({ loggedIn: false });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

startServer();
