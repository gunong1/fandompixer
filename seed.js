const Database = require('better-sqlite3');
const db = new Database('database.db');

// --- Configuration ---
const CONFIG = {
    CANVAS_SIZE: 1000,
    TARGET_FILL_PERCENT: 0.08, // 8% coverage (~80,000 pixels)
    CLUSTER_MIN: 5,
    CLUSTER_MAX: 60,
    BATCH_SIZE: 500, // Insert in batches
};

// --- Data Sets ---
const GROUPS = [
    { name: 'PLAVE', colors: ['#5E5DFA', '#9F9EFF', '#121280'] },
    { name: 'SEVENTEEN', colors: ['#F7CAC9', '#92A8D1', '#FFFFFF'] }, // Rose Quartz & Serenity
    { name: 'BTS', colors: ['#8A2BE2', '#9370DB', '#4B0082'] }, // Purple
    { name: 'NEWJEANS', colors: ['#0055FF', '#F8C8DC', '#FFFFFF'] }, // Blue/Pink_Tokki
    { name: 'IVE', colors: ['#FF0050', '#000000', '#FFFFFF'] },
    { name: 'RIIZE', colors: ['#F47920', '#FFFFFF', '#000000'] }, // Orange
    { name: 'AESPA', colors: ['#AE98D3', '#7A5BC7', '#000000'] },
    { name: 'NCT', colors: ['#C4F704', '#000000', '#556B2F'] }, // Neon Green
    { name: 'DAY6', colors: ['#000000', '#FFFFFF', '#FFD700'] },
    { name: 'TXT', colors: ['#7CC3D6', '#FFFFFF'] },
    { name: 'STRAYKIDS', colors: ['#DC143C', '#000000'] },
    { name: 'ZEROBASEONE', colors: ['#0065D1', '#FFFFFF'] },
];

const NICK_PREFIXES = [
    'Anonymous', 'Happy', 'Lovely', 'Super', 'Hyper', 'Shiny', 'Blue', 'Red',
    'Tiny', 'Giant', 'Baby', 'Master', 'Doctor', 'Prof', 'Fan', 'Stan',
    'My', 'Our', 'Best', 'Top'
];
const NICK_ROOTS = [
    'Fan', 'Stan', 'Lover', 'Pixel', 'Artist', 'Clicker', 'Gamer', 'Star',
    'Moon', 'Sun', 'Rabbit', 'Tiger', 'Cat', 'Dog', 'Bear', 'Panda'
];
const NICK_SUFFIXES = ['123', '99', '00', '77', 'Pro', 'God', 'King', 'Queen', 'X', 'Z'];

// --- Helper Functions ---
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateNickname() {
    if (Math.random() < 0.3) {
        return getRandomItem(NICK_PREFIXES) + getRandomItem(NICK_ROOTS);
    } else if (Math.random() < 0.6) {
        return getRandomItem(NICK_ROOTS) + getRandomItem(NICK_SUFFIXES);
    } else {
        return getRandomItem(NICK_PREFIXES) + getRandomItem(NICK_ROOTS) + getRandomItem(NICK_SUFFIXES);
    }
}

// --- Main Execution ---
console.log(`[SEED] Starting Seeding Process (Sparse Mode)...`);
console.log(`[SEED] Target: Fill ~${(CONFIG.TARGET_FILL_PERCENT * 100)}% of Canvas`);

// 0. RESET CANVAS (Requested to fix "clumped" look)
console.log(`[SEED] Clearing previous pixels to apply new style...`);
db.prepare('DELETE FROM pixels').run();
db.prepare('DELETE FROM sqlite_sequence WHERE name=\'pixels\'').run(); // Reset ID
console.log(`[SEED] Database Cleared!`);

// 1. Load Existing Pixels (Should be empty now)
const existingCoords = new Set();
// const rows = db.prepare('SELECT x, y FROM pixels').all();
// rows.forEach(r => existingCoords.add(`${r.x},${r.y}`));

const targetTotal = Math.pow(CONFIG.CANVAS_SIZE, 2) * CONFIG.TARGET_FILL_PERCENT;
let addedCount = 0;

console.log(`[SEED] Target Total: ${targetTotal}`);

// 2. Generate Batches
const insertStmt = db.prepare(`
    INSERT INTO pixels (x, y, color, idol_group_name, owner_nickname, purchased_at, expires_at)
    VALUES (@x, @y, @color, @idol_group_name, @owner_nickname, @purchased_at, @expires_at)
`);

const insertMany = db.transaction((pixels) => {
    for (const p of pixels) insertStmt.run(p);
});

let pendingBatch = [];

// Cluster Generator (Spray / Cloud Style)
function generateCluster(existingCoords) {
    const cluster = [];

    // Pick Metadata
    const group = getRandomItem(GROUPS);
    const color = getRandomItem(group.colors);
    const nickname = generateNickname();
    const groupName = group.name;

    // Pick Center
    let cx = getRandomInt(0, CONFIG.CANVAS_SIZE - 1);
    let cy = getRandomInt(0, CONFIG.CANVAS_SIZE - 1);

    // Determine Cluster Properties (Sparse Cloud)
    // Radius: Wider area (30~80px)
    // Count: 10~40 pixels (Low density)
    const radius = getRandomInt(30, 80);
    const count = getRandomInt(10, 40);

    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < count; i++) {
        // Random Polar Coordinate for Cloud effect
        const angle = Math.random() * Math.PI * 2;
        // Sqrt for uniform circle, or without for center-bias
        const dist = Math.sqrt(Math.random()) * radius;

        const px = Math.floor(cx + Math.cos(angle) * dist);
        const py = Math.floor(cy + Math.sin(angle) * dist);

        const key = `${px},${py}`;

        // Bounds Check
        if (px >= 0 && px < CONFIG.CANVAS_SIZE && py >= 0 && py < CONFIG.CANVAS_SIZE) {
            // Collision Check
            if (!existingCoords.has(key)) {
                cluster.push({
                    x: px,
                    y: py,
                    color: color,
                    idol_group_name: groupName,
                    owner_nickname: nickname,
                    purchased_at: now,
                    expires_at: expires
                });
                existingCoords.add(key);
            }
        }
    }
    return cluster;
}

while (existingCoords.size < targetTotal) {
    const cluster = generateCluster(existingCoords);
    if (cluster.length === 0) continue;

    pendingBatch.push(...cluster);
    addedCount += cluster.length;

    if (pendingBatch.length >= CONFIG.BATCH_SIZE) {
        insertMany(pendingBatch);
        process.stdout.write(`\r[SEED] Added ${addedCount} pixels...`);
        pendingBatch = [];
    }
}

// Flush remaining
if (pendingBatch.length > 0) {
    insertMany(pendingBatch);
}

console.log(`\n[SEED] Completed! Added ${addedCount} pixels.`);
console.log(`[SEED] Total Occupied: ${existingCoords.size}`);
db.close();
