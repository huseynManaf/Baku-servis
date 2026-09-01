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

function publicRequest(row) {
  // mushteriye/adminə qaytarilan zaman heç bir gizli sahə yoxdur, sadece formatlayiriq
  return row;
}

// =====================================================
// XİDMƏTLƏR (ictimai - hər kəs görə bilər)
// =====================================================
app.get('/api/services', (req, res) => {
  const rows = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY category, name').all();
  res.json(rows);
});

// =====================================================
// MÜŞTƏRI MÜRACİƏTLƏRİ
// =====================================================

// Yeni muraciet yarat
app.post('/api/requests', (req, res) => {
  const { customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type } = req.body;

  if (!customer_name || !phone || !problem_description) {
    return res.status(400).json({ error: 'Ad, telefon ve problem izahi mecburidir' });
  }
  if (visit_type === 'evde' && !address_text) {
    return res.status(400).json({ error: 'Evde xidmet ucun unvan gerekdir' });
  }

  let code;
  do { code = genTrackingCode(); } while (db.prepare('SELECT id FROM requests WHERE tracking_code = ?').get(code));

  const stmt = db.prepare(`
    INSERT INTO requests (tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type)
    VALUES (@tracking_code, @customer_name, @phone, @service_id, @device_info, @problem_description, @address_text, @latitude, @longitude, @visit_type)
  `);
  const info = stmt.run({
    tracking_code: code,
    customer_name,
    phone,
    service_id: service_id || null,
    device_info: device_info || null,
    problem_description,
    address_text: address_text || null,
    latitude: latitude || null,
    longitude: longitude || null,
    visit_type: visit_type === 'evde' ? 'evde' : 'servis'
  });

  // Ilk mesaji sistem adindan chat-e yazaq
  db.prepare('INSERT INTO messages (request_id, sender, body) VALUES (?, ?, ?)')
    .run(info.lastInsertRowid, 'admin', 'Muraciətiniz qeyde alindi. Qisa zamanda sizinle elaqe saxlayacagiq.');

  res.json({ ok: true, tracking_code: code, id: info.lastInsertRowid });
});

// Muraciet melumatlarini izleme kodu + telefon ile gormek
app.get('/api/requests/track', (req, res) => {
  const { code, phone } = req.query;
  if (!code || !phone) return res.status(400).json({ error: 'Kod ve telefon lazimdir' });
  const row = db.prepare('SELECT * FROM requests WHERE tracking_code = ? AND phone = ?').get(code, phone);
  if (!row) return res.status(404).json({ error: 'Muraciet tapilmadi' });
  res.json(publicRequest(row));
});

// Chat mesajlarini gormek (musteri terefi - kod+telefon ile)
app.get('/api/requests/:id/messages', (req, res) => {
  const { code, phone } = req.query;
  const reqRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });

  // Admin sessiyasi varsa avtomatik icaze, yoxdursa kod+telefon yoxlanilir
  if (!(req.session && req.session.adminId)) {
    if (reqRow.tracking_code !== code || reqRow.phone !== phone) {
      return res.status(403).json({ error: 'Icaze yoxdur' });
    }
  }
  const msgs = db.prepare('SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC').all(req.params.id);
  res.json(msgs);
});

// Mushteri mesaj yazir
app.post('/api/requests/:id/messages', (req, res) => {
  const { code, phone, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Bosh mesaj' });
  const reqRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });
  if (reqRow.tracking_code !== code || reqRow.phone !== phone) {
    return res.status(403).json({ error: 'Icaze yoxdur' });
  }
  db.prepare('INSERT INTO messages (request_id, sender, body) VALUES (?, ?, ?)').run(req.params.id, 'customer', body.trim());
  res.json({ ok: true });
});

// Mock onlayn odenish - mushteri "kart ile ode" deyende
app.post('/api/requests/:id/pay', (req, res) => {
  const { code, phone, method } = req.body;
  const reqRow = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Tapilmadi' });
  if (reqRow.tracking_code !== code || reqRow.phone !== phone) return res.status(403).json({ error: 'Icaze yoxdur' });
  const amount = reqRow.final_price || reqRow.quoted_price;
  if (!amount) return res.status(400).json({ error: 'Hele qiymet tesdiqlenmeyib' });

  const info = db.prepare('INSERT INTO payments (request_id, amount, method, status) VALUES (?, ?, ?, ?)')
    .run(req.params.id, amount, method || 'card', 'gozleyir');

  // === DEMO REJIMI ===
  // Bu bloku real bank/PSP (mes: Payriff, AzeriCard, Kapital Bank E-manat) inteqrasiyasi ile evez edin.
  // Hazirda yalniz simulyasiya edir - odenishi avtomatik "odenildi" statusuna kechirir.
  db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('odenildi', info.lastInsertRowid);
  db.prepare('UPDATE requests SET is_paid = 1 WHERE id = ?').run(req.params.id);

  res.json({ ok: true, payment_id: info.lastInsertRowid, amount, status: 'odenildi', demo: true });
});

// =====================================================
// ADMIN - GİRİŞ
// =====================================================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Istifadeci adi ve ya shifre yanlishdir' });
  }
  req.session.adminId = admin.id;
  req.session.adminUser = admin.username;
  res.json({ ok: true, username: admin.username });
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
app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'hamisi') {
    rows = db.prepare(`
      SELECT r.*, s.name AS service_name FROM requests r
      LEFT JOIN services s ON s.id = r.service_id
      WHERE r.status = ? ORDER BY r.created_at DESC`).all(status);
  } else {
    rows = db.prepare(`
      SELECT r.*, s.name AS service_name FROM requests r
      LEFT JOIN services s ON s.id = r.service_id
      ORDER BY r.created_at DESC`).all();
  }
  res.json(rows);
});

app.get('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const row = db.prepare(`
    SELECT r.*, s.name AS service_name FROM requests r
    LEFT JOIN services s ON s.id = r.service_id WHERE r.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tapilmadi' });
  const messages = db.prepare('SELECT * FROM messages WHERE request_id = ? ORDER BY id ASC').all(req.params.id);
  const payments = db.prepare('SELECT * FROM payments WHERE request_id = ? ORDER BY id DESC').all(req.params.id);
  res.json({ request: row, messages, payments });
});

app.put('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const { status, quoted_price, final_price } = req.body;
  const fields = [];
  const values = {};
  if (status) { fields.push('status = @status'); values.status = status; }
  if (quoted_price !== undefined) { fields.push('quoted_price = @quoted_price'); values.quoted_price = quoted_price; }
  if (final_price !== undefined) { fields.push('final_price = @final_price'); values.final_price = final_price; }
  if (!fields.length) return res.status(400).json({ error: 'Deyishiklik yoxdur' });
  fields.push("updated_at = datetime('now')");
  values.id = req.params.id;
  db.prepare(`UPDATE requests SET ${fields.join(', ')} WHERE id = @id`).run(values);
  res.json({ ok: true });
});

// Admin chat-e cavab yazir
app.post('/api/admin/requests/:id/messages', requireAdmin, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Bosh mesaj' });
  db.prepare('INSERT INTO messages (request_id, sender, body) VALUES (?, ?, ?)').run(req.params.id, 'admin', body.trim());
  res.json({ ok: true });
});

// =====================================================
// ADMIN - XİDMƏTLƏR (əlavə et / redaktə / sil)
// =====================================================
app.get('/api/admin/services', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY category, name').all());
});

app.post('/api/admin/services', requireAdmin, (req, res) => {
  const { name, category, description, price, discount_price } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Ad ve qiymet mecburidir' });
  const info = db.prepare(`INSERT INTO services (name, category, description, price, discount_price) VALUES (?,?,?,?,?)`)
    .run(name, category || 'umumi', description || '', price, discount_price || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  const { name, category, description, price, discount_price, is_active } = req.body;
  db.prepare(`
    UPDATE services SET
      name = COALESCE(@name, name),
      category = COALESCE(@category, category),
      description = COALESCE(@description, description),
      price = COALESCE(@price, price),
      discount_price = @discount_price,
      is_active = COALESCE(@is_active, is_active),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: name ?? null,
    category: category ?? null,
    description: description ?? null,
    price: price ?? null,
    discount_price: discount_price === undefined ? null : discount_price,
    is_active: is_active === undefined ? null : (is_active ? 1 : 0)
  });
  res.json({ ok: true });
});

app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// =====================================================
// ADMIN - SADƏ STATİSTİKA
// =====================================================
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM requests').get().c;
  const yeni = db.prepare("SELECT COUNT(*) c FROM requests WHERE status = 'yeni'").get().c;
  const icrada = db.prepare("SELECT COUNT(*) c FROM requests WHERE status = 'icrada'").get().c;
  const hazir = db.prepare("SELECT COUNT(*) c FROM requests WHERE status = 'hazir'").get().c;
  const gelir = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status = 'odenildi'").get().s;
  res.json({ total, yeni, icrada, hazir, gelir });
});

// ---------- Xeta idaresi (bazani ayaqda saxlamaq ucun) ----------
app.use((err, req, res, next) => {
  console.error('[XETA]', err);
  res.status(500).json({ error: 'Server xetasi bash verdi. Bir az sonra yeniden cehd edin.' });
});

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

app.listen(PORT, () => {
  console.log(`HUGU Servis ${PORT} portunda ishe dushdu -> http://localhost:${PORT}`);
});
