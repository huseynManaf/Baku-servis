const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'bakuservis.sqlite');
const username = 'huseynmanfli844@gmail.com';
const password = 'Baku2019';

const db = new sqlite3.Database(dbPath);

db.get('SELECT username, password_hash FROM admins WHERE username = ?', [username], (err, row) => {
  if (err) {
    console.error('DB_ERROR');
    console.error(err.message);
    db.close();
    process.exit(1);
  }

  if (!row) {
    console.log(JSON.stringify({ found: false, username, password, match: false }, null, 2));
    db.close();
    return;
  }

  const match = bcrypt.compareSync(password, row.password_hash);
  console.log(JSON.stringify({ found: true, username: row.username, match }, null, 2));
  db.close();
});
