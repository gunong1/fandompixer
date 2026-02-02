const Database = require('better-sqlite3');
const db = new Database('database.db');

console.log('[RESET] Clearing all pixels from the database...');

try {
    // Delete all rows from pixels table
    const info = db.prepare('DELETE FROM pixels').run();
    console.log(`[RESET] Deleted ${info.changes} pixels.`);

    // Reset the auto-increment counter
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'pixels\'').run();
    console.log('[RESET] Auto-increment ID reset.');

    console.log('[RESET] Canvas reset complete. Please restart the server if running.');
} catch (error) {
    console.error('[RESET] Error:', error.message);
} finally {
    db.close();
}
