const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS pixels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    color TEXT NOT NULL,
    owner TEXT
  )`);

  // Add some sample data
  db.run(`INSERT INTO pixels (x, y, color, owner) VALUES (?, ?, ?, ?)`, [1500, 1500, 'rgba(0, 212, 255, 0.3)', 'BTS']);
});

db.close();
