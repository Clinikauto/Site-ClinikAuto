const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const p = path.join(__dirname, "database.db");
const db = new sqlite3.Database(p, (err) => {
 if (err) {
 console.error("OPEN ERR", err);
 process.exit(1);
 }
 console.log("DB opened", p);
 db.all("SELECT time FROM appointments WHERE date = ? AND status != 'cancelled'", ["2026-04-24"], (err, rows) => {
 if (err) {
 console.error("QUERY ERR", err);
 } else {
 console.log("ROWS", rows);
 }
 db.close(() => process.exit(0));
 });
});
