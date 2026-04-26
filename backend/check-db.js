const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const p = path.join(__dirname, "database.db");
const db = new sqlite3.Database(p, (err) => {
 if (err) {
 console.error("OPEN ERR", err);
 process.exit(1);
 }
 console.log("DB opened", p);
 db.all("PRAGMA table_info(appointments)", [], (e, rows) => {
 if (e) {
 console.error("PRAGMA ERR", e);
 } else {
 console.log("SCHEMA:", rows);
 }
 db.all("SELECT * FROM appointments LIMIT 10", [], (e2, rows2) => {
 if (e2) {
 console.error("SELECT ERR", e2);
 } else {
 console.log("SAMPLE ROWS:", rows2);
 }
 db.close(() => process.exit(0));
 });
 });
});
