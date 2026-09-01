// scripts/backup.js
// Bazani ehtiyat nusxelemek ucun sade skript.
// Isletmek: npm run backup
// Tovsiye: server-de cron/pm2 vasitesile hər gün 1 defe avtomatik ishe salin, meselen:
//   0 3 * * * cd /path/to/hugu-servis && npm run backup >> backup.log 2>&1

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'hugu.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const KEEP = 14; // son 14 ehtiyat nusxe saxlanilir

if (!fs.existsSync(DB_PATH)) {
  console.error('Baza faylı tapılmadı:', DB_PATH);
  process.exit(1);
}
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(BACKUP_DIR, `hugu-${stamp}.db`);
fs.copyFileSync(DB_PATH, dest);
console.log('Ehtiyat nüsxə yaradıldı:', dest);

// Köhnə nüsxələri təmizlə
const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('hugu-') && f.endsWith('.db')).sort();
while (files.length > KEEP) {
  const old = files.shift();
  fs.unlinkSync(path.join(BACKUP_DIR, old));
  console.log('Köhnə nüsxə silindi:', old);
}
