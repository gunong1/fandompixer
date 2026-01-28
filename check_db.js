const Database = require('better-sqlite3');
const db = new Database('database.db');
try {
    const info = db.pragma('table_info(pixels)');
    console.log("Columns:", info.map(c => c.name).join(', '));
} catch (e) { console.error(e); }
db.close();
