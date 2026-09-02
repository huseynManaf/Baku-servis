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
}