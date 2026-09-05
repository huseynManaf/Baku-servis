// scripts/backup.js
// Bazani ehtiyat nusxelemek ucun sade skript.
// Isletmek: npm run backup
// Tovsiye: server-de cron/pm2 vasitesile hər gün 1 defe avtomatik ishe salin, meselen:
//   0 3 * * * cd /path/to/bakuservis && npm run backup >> backup.log 2>&1

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.PERSISTENT_DATA_DIR || path.join(__dirname, '..', 'data'));
const DB_PATH = path.join(DATA_DIR, process.env.DATABASE_FILE || 'bakuservis.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const KEEP = 14; // son 14 ehtiyat nusxe saxlanilir

if (!fs.existsSync(DB_PATH)) {
  console.error('Baza faylı tapılmadı:', DB_PATH);
  process.exit(1);
}
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(BACKUP_DIR, `bakuservis-${stamp}.db`);
if (fs.existsSync(dest)) fs.unlinkSync(dest);

const db = new sqlite3.Database(DB_PATH, (openError) => {
  if (openError) {
    console.error('Baza backup üçün açıla bilmədi:', openError.message);
    process.exitCode = 1;
    return;
  }

  db.run('VACUUM INTO ?', [dest], (backupError) => {
    db.close(() => {
      if (backupError) {
        console.error('SQLite backup uğursuz oldu:', backupError.message);
        process.exitCode = 1;
        return;
      }

      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
        console.error('SQLite backup uğursuz oldu: boş snapshot yaradıldı.');
        process.exitCode = 1;
        return;
      }

      console.log('Ehtiyat nüsxə yaradıldı:', dest);

      // Köhnə nüsxələri təmizlə
      const files = fs.readdirSync(BACKUP_DIR).filter((file) => file.startsWith('bakuservis-') && file.endsWith('.db')).sort();
      while (files.length > KEEP) {
        const old = files.shift();
        fs.unlinkSync(path.join(BACKUP_DIR, old));
        console.log('Köhnə nüsxə silindi:', old);
      }
    });
  });
});
