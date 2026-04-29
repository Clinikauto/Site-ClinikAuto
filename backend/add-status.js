const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.join(__dirname, "database.db");
const db = new sqlite3.Database(dbPath, (err) => {
 if (err) { console.error("OPEN ERR", err); process.exit(1); }
 db.run("ALTER TABLE appointments ADD COLUMN status TEXT DEFAULT 'pending'", [], (err) => {
 if (err) { console.error("ALTER ERR", err); } else { console.log("Colonne 'status' ajoutée (default: pending)."); }
 db.close(() => process.exit(0));
 });
});
