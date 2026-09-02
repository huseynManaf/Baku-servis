require('dotenv').config();
const path = require('path');

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  module.exports = pool;
} else {
  // Fallback to local SQLite for development when DATABASE_URL is not set
  const Database = require('better-sqlite3');
  const dbFile = path.join(__dirname, 'data', 'hugu.sqlite');
  const sqlite = new Database(dbFile);

  // Provide a minimal compatible `query` API that returns a Promise
  module.exports = {
    query: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        try {
          const t = sql.trim().split(/\s+/)[0].toUpperCase();
          if (t === 'SELECT') {
            const stmt = sqlite.prepare(sql);
            const rows = params && params.length ? stmt.all(...params) : stmt.all();
            resolve({ rows });
          } else if (t === 'INSERT') {
            require('dotenv').config();
            const path = require('path');

            // Prefer Postgres when DATABASE_URL is provided
            if (process.env.DATABASE_URL) {
              const { Pool } = require('pg');
              const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
              });
              module.exports = pool;
            } else {
              // When DATABASE_URL not set try to use better-sqlite3 if available,
              // otherwise provide a safe in-memory adapter so the server doesn't crash.
              try {
                const Database = require('better-sqlite3');
                const sqlite = new Database(path.join(__dirname, 'data', 'hugu.sqlite'));
                module.exports = {
                  query: (sql, params = []) => {
                    return new Promise((resolve, reject) => {
                      try {
                        const t = sql.trim().split(/\s+/)[0].toUpperCase();
                        if (t === 'SELECT') {
                          const stmt = sqlite.prepare(sql);
                          const rows = params && params.length ? stmt.all(...params) : stmt.all();
                          resolve({ rows });
                        } else if (t === 'INSERT') {
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
                // better-sqlite3 not installed or failed to load — use a simple in-memory adapter
                console.warn('better-sqlite3 not available, using in-memory fallback DB (non-persistent)');

                const data = {
                  services: [],
                  requests: [],
                  messages: [],
                  payments: [],
                  admins: []
                };
                let idCounter = 1;

                const matchStarts = (sql, pattern) => sql.trim().toUpperCase().startsWith(pattern);

                const adapter = {
                  query: async (sql, params = []) => {
                    const s = sql.trim();
                    // Simple handlers for queries used in server.js
                    if (matchStarts(s, 'SELECT * FROM SERVICES')) {
                      const rows = data.services.filter(svc => svc.is_active !== 0 && svc.is_active !== false);
                      return { rows };
                    }
                    if (/SELECT\s+ID\s+FROM\s+REQUESTS\s+WHERE\s+TRACKING_CODE/i.test(s)) {
                      const code = params[0];
                      const row = data.requests.find(r => r.tracking_code === code);
                      return { rows: row ? [{ id: row.id }] : [] };
                    }
                    if (matchStarts(s, 'INSERT INTO REQUESTS')) {
                      const [tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type] = params;
                      const rec = { id: idCounter++, tracking_code, customer_name, phone, service_id, device_info, problem_description, address_text, latitude, longitude, visit_type, created_at: new Date().toISOString() };
                      data.requests.push(rec);
                      return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
                    }
                    if (/SELECT \* FROM REQUESTS WHERE TRACKING_CODE = \$1 AND PHONE = \$2/i.test(s) || /SELECT \* FROM REQUESTS WHERE TRACKING_CODE = \?/i.test(s)) {
                      const code = params[0];
                      const phone = params[1];
                      const row = data.requests.find(r => r.tracking_code === code && r.phone === phone);
                      return { rows: row ? [row] : [] };
                    }
                    if (/SELECT \* FROM REQUESTS WHERE ID = \$1/i.test(s) || /SELECT \* FROM REQUESTS WHERE ID = \?/i.test(s)) {
                      const id = params[0];
                      const row = data.requests.find(r => r.id == id);
                      return { rows: row ? [row] : [] };
                    }
                    if (/SELECT \* FROM MESSAGES WHERE REQUEST_ID =/i.test(s)) {
                      const id = params[0];
                      const rows = data.messages.filter(m => m.request_id == id).sort((a,b)=>a.id-b.id);
                      return { rows };
                    }
                    if (matchStarts(s, 'INSERT INTO MESSAGES')) {
                      const [request_id, sender, body] = params;
                      const rec = { id: idCounter++, request_id, sender, body, created_at: new Date().toISOString() };
                      data.messages.push(rec);
                      return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
                    }
                    if (matchStarts(s, 'INSERT INTO PAYMENTS')) {
                      const [request_id, amount, method, status] = params;
                      const rec = { id: idCounter++, request_id, amount, method, status, created_at: new Date().toISOString() };
                      data.payments.push(rec);
                      return { rows: [{ id: rec.id }], lastInsertRowid: rec.id };
                    }
                    if (matchStarts(s, 'UPDATE PAYMENTS SET STATUS')) {
                      const [status, id] = params;
                      const rec = data.payments.find(p => p.id == id);
                      if (rec) rec.status = status;
                      return { rows: [] };
                    }
                    if (matchStarts(s, 'UPDATE REQUESTS SET IS_PAID')) {
                      const [id] = params;
                      const rec = data.requests.find(r => r.id == id);
                      if (rec) rec.is_paid = 1;
                      return { rows: [] };
                    }
                    if (/SELECT \* FROM ADMINS WHERE USERNAME =/i.test(s)) {
                      const username = params[0];
                      const row = data.admins.find(a => a.username === username);
                      return { rows: row ? [row] : [] };
                    }
                    if (/SELECT r\.\*, s\.name AS service_name FROM requests r/i.test(s)) {
                      // simple join: attach service_name if exists
                      const rows = data.requests.map(r => ({ ...r, service_name: (data.services.find(sv=>sv.id==r.service_id)||{}).name || null }));
                      return { rows };
                    }
                    if (matchStarts(s, 'SELECT COUNT(*)')) {
                      // crude counts
                      const c = data.requests.length;
                      return { rows: [{ c }] };
                    }

                    // Default: return empty
                    return { rows: [] };
                  }
                };

                module.exports = adapter;
              }
            }