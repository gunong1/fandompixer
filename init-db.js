const Database = require('better-sqlite3');
const db = new Database('database.db');

const createTable = db.prepare(`CREATE TABLE IF NOT EXISTS pixels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  color TEXT NOT NULL,
  owner TEXT
)`);
createTable.run();

const insert = db.prepare(`INSERT INTO pixels (x, y, color, owner) VALUES (?, ?, ?, ?)`);
insert.run(1500, 1500, 'rgba(0, 212, 255, 0.3)', 'BTS');

db.close();
