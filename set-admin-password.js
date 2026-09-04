const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'data', 'bakuservis.sqlite');
const username = 'huseynmanfli844@gmail.com';
const password = 'Baku2019';
const hash = bcrypt.hashSync(password, 10);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('UPDATE admins SET password_hash = ? WHERE username = ?', [hash, username], function (err) {
    if (err) {
      console.error('UPDATE_ERROR');
      console.error(err.message);
      db.close();
      process.exit(1);
    }

    db.get('SELECT username, password_hash FROM admins WHERE username = ?', [username], (getErr, row) => {
      if (getErr) {
        console.error('SELECT_ERROR');
        console.error(getErr.message);
        db.close();
        process.exit(1);
      }

      const match = !!(row && bcrypt.compareSync(password, row.password_hash));
      console.log(JSON.stringify({ username: row && row.username, match, hashSaved: !!row }));
      db.close();
    });
  });
});
