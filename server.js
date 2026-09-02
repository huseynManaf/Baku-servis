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
            customer_name, phone, service_id, device_info, 
            problem_description, address_text, latitude, longitude, visit_type 
        } = req.body;

        if (!customer_name || !phone || !problem_description) {
            return res.status(400).json({ error: 'Ad, telefon və problem izahı məcburidir' });
        }

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
            service_id || null, 
            device_info || null, 
            problem_description, 
            address_text || null, 
            latitude || null, 
            longitude || null, 
            visit_type || 'maqaza'
        ];

        const result = await db.query(queryText, values);

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
    if (!row) return res.status(404).json({ error: 'Muraciet tapilmadi' });
    res.json(publicRequest(row));
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
    console.error(err && err.stack ? err.stack : err);
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
    const messagesRes = await db.query('SELECT * FROM messages WHERE request_id = $1 ORDER BY id ASC', [req.params.id]);
    const paymentsRes = await db.query('SELECT * FROM payments WHERE request_id = $1 ORDER BY id DESC', [req.params.id]);
    res.json({ request: row, messages: messagesRes.rows, payments: paymentsRes.rows });
  } catch (err) {
    console.error('Admin get request error:');
    console.error(err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Server xətası', details: err && err.message ? err.message : String(err) });
  }
});

app.put('/api/admin/requests/:id', requireAdmin, async (req, res) => {
  try {
    const { status, quoted_price, final_price } = req.body;
    const parts = [];
    const params = [];
    if (status) { params.push(status); parts.push(`status = $${params.length}`); }
    if (quoted_price !== undefined) { params.push(quoted_price); parts.push(`quoted_price = $${params.length}`); }
    if (final_price !== undefined) { params.push(final_price); parts.push(`final_price = $${params.length}`); }
    if (!parts.length) return res.status(400).json({ error: 'Deyishiklik yoxdur' });
    params.push(new Date().toISOString()); parts.push(`updated_at = $${params.length}`);
    params.push(req.params.id);
    const q = `UPDATE requests SET ${parts.join(', ')} WHERE id = $${params.length}`;
    await db.query(q, params);
    res.json({ ok: true });
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
    const totalRes = await db.query('SELECT COUNT(*) AS c FROM requests');
    const yeniRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'yeni'");
    const icradaRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'icrada'");
    const hazirRes = await db.query("SELECT COUNT(*) AS c FROM requests WHERE status = 'hazir'");
    const gelirRes = await db.query("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status = 'odenildi'");
    const total = parseInt(totalRes.rows[0].c, 10);
    const yeni = parseInt(yeniRes.rows[0].c, 10);
    const icrada = parseInt(icradaRes.rows[0].c, 10);
    const hazir = parseInt(hazirRes.rows[0].c, 10);
    const gelir = parseFloat(gelirRes.rows[0].s);
    res.json({ total, yeni, icrada, hazir, gelir });
  } catch (err) {
    console.error('Admin stats error:');
    console.error(err && err.stack ? err.stack : err);
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

app.listen(PORT, () => {
  console.log(`HUGU Servis ${PORT} portunda ishe dushdu -> http://localhost:${PORT}`);
});
