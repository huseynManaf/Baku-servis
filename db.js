require('dotenv').config();
const path = require('path');

// If DATABASE_URL is set, use pg Pool with SSL suitable for Render/Postgres
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Export a wrapper that by default uses the pool. If initial connection
  // test fails (e.g. ENETUNREACH on IPv6), we'll replace this with an
  // in-memory safe adapter so the server stays up and provides informative logs.
  let exported = {
    query: (text, params) => pool.query(text, params),
    pool
  };
  module.exports = exported;

  // Test connectivity once at startup; on failure, log and fallback.
  (async () => {
    try {
      await pool.query('SELECT 1');
      console.log('Postgres: connection test ok');
    } catch (err) {
      console.error('Postgres connection test failed:', err && err.message);
      console.error('Falling back to in-memory DB adapter. Check DATABASE_URL and network (IPv4/IPv6).');
      // Build simple in-memory adapter (non-persistent)
      const data = { services: [], requests: [], messages: [], payments: [], admins: [] };
      let idCounter = 1;
      const adapter = {
        query: async (sql, params = []) => {
          const s = sql.trim().toUpperCase();
          if (s.startsWith('SELECT * FROM SERVICES')) return { rows: data.services.filter(s=>s.is_active) };
          if (/SELECT\s+ID\s+FROM\s+REQUESTS\s+WHERE\s+TRACKING_CODE/.test(s)) {
            const code = params[0];
            const row = data.requests.find(r => r.tracking_code === code);
            return { rows: row ? [{ id: row.id }] : [] };
          }
          if (s.startsWith('INSERT INTO REQUESTS')) {
            const [tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type] = params;
            const rec = { id: idCounter++, tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type, created_at: new Date().toISOString() };
            data.requests.push(rec);
            return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
          }
          if (/SELECT \* FROM REQUESTS WHERE TRACKING_CODE =/.test(s) || /SELECT \* FROM REQUESTS WHERE ID =/.test(s)) {
            const codeOrId = params[0];
            const byId = /WHERE ID =/.test(s);
            const row = byId ? data.requests.find(r => r.id == codeOrId) : data.requests.find(r => r.tracking_code === codeOrId && r.phone === params[1]);
            return { rows: row ? [row] : [] };
          }
          if (s.startsWith('INSERT INTO MESSAGES')) {
            const [request_id, sender, body] = params;
            const rec = { id: idCounter++, request_id, sender, body, created_at: new Date().toISOString() };
            data.messages.push(rec);
            return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
          }
          if (s.startsWith('INSERT INTO PAYMENTS')) {
            const [request_id, amount, method, status] = params;
            const rec = { id: idCounter++, request_id, amount, method, status, created_at: new Date().toISOString() };
            data.payments.push(rec);
            return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
          }
          return { rows: [] };
        }
      };
      // Replace exported binding so rest of app uses fallback
      module.exports = adapter;
    }
  })();
} else {
  // Try better-sqlite3 for local dev (fast, zero-config). If not present,
  // fall back to a simple in-memory adapter so the app doesn't crash.
  try {
    const Database = require('better-sqlite3');
    const dbFile = path.join(__dirname, 'data', 'hugu.sqlite');
    const sqlite = new Database(dbFile);
    module.exports = {
      query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
          try {
            const op = sql.trim().split(/\s+/)[0].toUpperCase();
            if (op === 'SELECT') {
              const stmt = sqlite.prepare(sql);
              const rows = params && params.length ? stmt.all(...params) : stmt.all();
              resolve({ rows });
            } else if (op === 'INSERT') {
              const stmt = sqlite.prepare(sql);
              const info = stmt.run(...params);
              resolve({ rows: [{ id: info.lastInsertRowid }], lastInsertRowid: info.lastInsertRowid });
            } else {
              const stmt = sqlite.prepare(sql);
              const info = stmt.run(...params);
              resolve({ rows: [], info });
            }
          } catch (err) {
            reject(err);
          }
        });
      }
    };
  } catch (e) {
    console.warn('better-sqlite3 not installed — using in-memory DB adapter (non-persistent)');
    const data = { services: [], requests: [], messages: [], payments: [], admins: [] };
    let idCounter = 1;
    const adapter = {
      query: async (sql, params = []) => {
        const s = sql.trim().toUpperCase();
        if (s.startsWith('SELECT * FROM SERVICES')) return { rows: data.services.filter(s=>s.is_active) };
        if (/SELECT\s+ID\s+FROM\s+REQUESTS\s+WHERE\s+TRACKING_CODE/.test(s)) {
          const code = params[0];
          const row = data.requests.find(r => r.tracking_code === code);
          return { rows: row ? [{ id: row.id }] : [] };
        }
        if (s.startsWith('INSERT INTO REQUESTS')) {
          const [tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type] = params;
          const rec = { id: idCounter++, tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type, created_at: new Date().toISOString() };
          data.requests.push(rec);
          return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
        }
        if (/SELECT \* FROM REQUESTS WHERE TRACKING_CODE =/.test(s) || /SELECT \* FROM REQUESTS WHERE ID =/.test(s)) {
          // simple parameter handling
          const codeOrId = params[0];
          const byId = /WHERE ID =/.test(s);
          const row = byId ? data.requests.find(r => r.id == codeOrId) : data.requests.find(r => r.tracking_code === codeOrId && r.phone === params[1]);
          return { rows: row ? [row] : [] };
        }
        if (s.startsWith('INSERT INTO MESSAGES')) {
          const [request_id, sender, body] = params;
          const rec = { id: idCounter++, request_id, sender, body, created_at: new Date().toISOString() };
          data.messages.push(rec);
          return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
        }
        if (s.startsWith('INSERT INTO PAYMENTS')) {
          const [request_id, amount, method, status] = params;
          const rec = { id: idCounter++, request_id, amount, method, status, created_at: new Date().toISOString() };
          data.payments.push(rec);
          return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
        }
        // default
        return { rows: [] };
      }
    };
    module.exports = adapter;
  }
}
