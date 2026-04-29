/**
 * Script de création / mise à jour du compte administrateur Nino.
 * Utilisation : node backend/create-admin.js
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const EMAIL    = process.env.ADMIN_EMAIL    || 'clinikauto74@gmail.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Ninoadmin@FR115PB';
const NAME     = process.env.ADMIN_NAME     || 'Nino';

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) { console.error('Erreur ouverture DB:', err.message); process.exit(1); }
});

db.serialize(async () => {
    // Migrations préventives
    db.run("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''", () => {});

    try {
        const hash = await bcrypt.hash(PASSWORD, 10);
        db.run(
            `INSERT INTO users (email, password, role, name)
             VALUES (?, ?, 'admin', ?)
             ON CONFLICT(email) DO UPDATE SET
                 password = excluded.password,
                 role     = 'admin',
                 name     = excluded.name`,
            [EMAIL.toLowerCase().trim(), hash, NAME],
            function (err) {
                if (err) {
                    console.error('Erreur création compte:', err.message);
                } else {
                    console.log(`✓ Compte admin "${NAME}" prêt (${EMAIL})`);
                }
                db.close();
            }
        );
    } catch (err) {
        console.error('Erreur hash:', err.message);
        db.close();
        process.exit(1);
    }
});
