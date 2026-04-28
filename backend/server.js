const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const GOOGLE_REVIEWS_CACHE_MS = 5 * 60 * 1000;
const googleReviewsCache = {
        cacheKey: "",
        ts: 0,
        data: null
};
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const GOOGLE_CALENDAR_ICS_URL = String(process.env.GOOGLE_CALENDAR_ICS_URL || "").trim();
const GOOGLE_CALENDAR_DEFAULT_SERVICE = String(process.env.GOOGLE_CALENDAR_DEFAULT_SERVICE || "Réparation").trim() || "Réparation";
const GOOGLE_CALENDAR_SYNC_INTERVAL_MS = Math.max(60000, Number.parseInt(process.env.GOOGLE_CALENDAR_SYNC_INTERVAL_MS || "300000", 10) || 300000);
const GOOGLE_CALENDAR_SYNC_ENABLED = (() => {
    const raw = String(process.env.GOOGLE_CALENDAR_SYNC_ENABLED || "true").trim().toLowerCase();
    if (["0", "false", "no", "off"].includes(raw)) {
        return false;
    }
    return !!GOOGLE_CALENDAR_ICS_URL;
})();
const googleCalendarSyncState = {
    running: false,
    lastRunAt: 0,
    lastError: "",
    lastScanned: 0,
    lastImported: 0,
    timer: null
};

app.use(
    cors({
        origin: (origin, callback) => {
            // Autorise les pages ouvertes en file:// (Origin: null) pour usage local.
            if (!origin || origin === "null" || ALLOWED_ORIGINS.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Origin not allowed by CORS"));
        }
    })
);
app.use(express.json({ limit: '30mb' }));

// Base de donnees (chemin absolu basé sur __dirname)
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur ouverture DB:', err);
  } else {
    console.log('Base ouverte:', dbPath);
  }
});

// Activer les foreign keys
db.run('PRAGMA foreign_keys = ON;');

// Creation table utilisateurs
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'client'
)
`);

// Migration pour anciennes bases sans colonne role
db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client'", (err) => {
    if (err && !String(err.message || "").includes("duplicate column name")) {
        console.error("Erreur migration role:", err.message);
    }
});

// Migration pour ajouter le prénom/nom admin
db.run("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''", (err) => {
    if (err && !String(err.message || "").includes("duplicate column name")) {
        console.error("Erreur migration name:", err.message);
    }
});

db.run("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0", (err) => {
    if (err && !String(err.message || "").includes("duplicate column name")) {
        console.error("Erreur migration is_blocked:", err.message);
    }
});

// Table paramètres du site (clé/valeur)
db.run(`
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT
)
`);

// Fiches clients (admin: consultation/modification centralisée)
db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS client_profiles (
        user_id INTEGER PRIMARY KEY,
        nom TEXT DEFAULT '',
        prenom TEXT DEFAULT '',
        tel TEXT DEFAULT '',
        email TEXT DEFAULT '',
        adresse TEXT DEFAULT '',
        vehicules TEXT DEFAULT '[]',
        notes TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    `);

    // Initialiser les fiches pour les comptes existants (y compris anciens comptes déjà en base)
    db.run(
        `
        INSERT INTO client_profiles (user_id, email)
        SELECT u.id, u.email
        FROM users u
        WHERE u.role = 'client'
          AND NOT EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.user_id = u.id)
        `,
        (err) => {
            if (err) {
                console.error("Erreur initialisation client_profiles:", err.message);
            }
        }
    );
});

// Creation table rendez-vous
db.run(`
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    service TEXT,
    date TEXT,
    time TEXT,
    status TEXT DEFAULT 'pending',
    completion_summary TEXT DEFAULT '',
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
`);

db.run("ALTER TABLE appointments ADD COLUMN completion_summary TEXT DEFAULT ''", (err) => {
    if (err && !String(err.message || "").includes("duplicate column name")) {
        console.error("Erreur migration completion_summary:", err.message);
    }
});

db.run("ALTER TABLE appointments ADD COLUMN completed_at DATETIME", (err) => {
    if (err && !String(err.message || "").includes("duplicate column name")) {
        console.error("Erreur migration completed_at:", err.message);
    }
});

db.run(`
CREATE TABLE IF NOT EXISTS occasions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    titre TEXT NOT NULL,
    description TEXT NOT NULL,
    prix TEXT DEFAULT '0',
    statut TEXT DEFAULT 'disponible',
    annee TEXT,
    km TEXT,
    carburant TEXT,
    boite TEXT,
    etat TEXT,
    reference TEXT,
    compatible TEXT,
    photos TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS site_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    page TEXT NOT NULL,
    path TEXT NOT NULL,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS site_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    name TEXT NOT NULL,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// Journaux de connexion (admin: traçabilité IP/UA/succès)
db.run(`
CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    fail_reason TEXT,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// Index pour accélérer les requêtes par user_id et par date
db.run("CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_login_logs_at ON login_logs(logged_at)");

// Normalise les doublons existants puis applique la contrainte d'unicité de créneau actif.
db.serialize(() => {
    db.run(
        `
        UPDATE appointments
        SET status = 'cancelled'
        WHERE status != 'cancelled'
          AND id NOT IN (
              SELECT MIN(id)
              FROM appointments
              WHERE status != 'cancelled'
              GROUP BY date, time
          )
        `,
        (cleanupErr) => {
            if (cleanupErr) {
                console.error("Erreur nettoyage doublons RDV:", cleanupErr.message);
                return;
            }

            db.run(
                `
                CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_active
                ON appointments(date, time)
                WHERE status != 'cancelled'
                `,
                (indexErr) => {
                    if (indexErr) {
                        console.error("Erreur création index créneau unique:", indexErr.message);
                        return;
                    }
                    console.log("Index de créneau unique actif prêt.");
                }
            );
        }
    );
});

// Horaires disponibles
const availableHours = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
const allowedStatuses = new Set(["pending", "confirmed", "cancelled", "completed"]);
const allowedServices = new Set(["Réparation", "Lavage", "Pneus", "Électricité"]);

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(date) {
    return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (_err) {
        return fallback;
    }
}

function splitDisplayName(fullName) {
    const raw = String(fullName || "").trim().replace(/\s+/g, " ");
    if (!raw) {
        return { prenom: "", nom: "" };
    }
    const parts = raw.split(" ");
    if (parts.length === 1) {
        return { prenom: "", nom: parts[0] };
    }
    return {
        prenom: parts.slice(0, -1).join(" "),
        nom: parts[parts.length - 1]
    };
}

function upsertSiteSetting(key, value, callback) {
    db.run(
        "INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, String(value || "")],
        callback
    );
}

function isoDateOnly(dateValue) {
    const date = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toISOString().slice(0, 10);
}

function escapeIcsText(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
}

function toIcsLocalDate(dateStr, timeStr) {
    const [year, month, day] = String(dateStr || "").split("-");
    const [hour, minute] = String(timeStr || "09:00").split(":");
    const hh = String(Number.parseInt(hour, 10) || 9).padStart(2, "0");
    const mm = String(Number.parseInt(minute, 10) || 0).padStart(2, "0");
    return `${year}${month}${day}T${hh}${mm}00`;
}

function toIcsLocalDateEnd(dateStr, timeStr) {
    const [year, month, day] = String(dateStr || "").split("-");
    const [hour, minute] = String(timeStr || "09:00").split(":");
    const startHour = Number.parseInt(hour, 10);
    const endHour = Number.isNaN(startHour) ? 10 : Math.min(startHour + 1, 23);
    const mm = String(Number.parseInt(minute, 10) || 0).padStart(2, "0");
    return `${year}${month}${day}T${String(endHour).padStart(2, "0")}${mm}00`;
}

function buildAppointmentsIcs(appointments) {
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;

    const events = appointments.map((appt) => {
        const firstName = String(appt.prenom || "").trim();
        const lastName = String(appt.nom || "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || String(appt.email || "Client");
        const email = String(appt.email || "").trim();
        const phone = String(appt.tel || "").trim();
        const details = [
            `Client: ${fullName}`,
            email ? `Email: ${email}` : "",
            phone ? `Tel: ${phone}` : "",
            `Service: ${String(appt.service || "").trim()}`
        ].filter(Boolean).join(" | ");

        return [
            "BEGIN:VEVENT",
            `UID:rdv-${appt.id}-clinikauto@site`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${toIcsLocalDate(appt.date, appt.time)}`,
            `DTEND:${toIcsLocalDateEnd(appt.date, appt.time)}`,
            `SUMMARY:${escapeIcsText(`${String(appt.service || "Rendez-vous").trim()} - ${fullName}`)}`,
            `DESCRIPTION:${escapeIcsText(details)}`,
            "LOCATION:ClinikAuto",
            `STATUS:${appt.status === "cancelled" ? "CANCELLED" : appt.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`,
            "END:VEVENT"
        ].join("\r\n");
    });

    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ClinikAuto//Agenda Vroomly//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        ...events,
        "END:VCALENDAR"
    ].join("\r\n");
}

function upsertClientProfile(userId, payload, callback) {
    const nom = String(payload.nom || "").trim();
    const prenom = String(payload.prenom || "").trim();
    const tel = String(payload.tel || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const adresse = String(payload.adresse || "").trim();
    const notes = String(payload.notes || "").trim();
    const vehicules = JSON.stringify(Array.isArray(payload.vehicules) ? payload.vehicules : []);

    db.run(
        `
        INSERT INTO client_profiles (user_id, nom, prenom, tel, email, adresse, vehicules, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            nom = excluded.nom,
            prenom = excluded.prenom,
            tel = excluded.tel,
            email = excluded.email,
            adresse = excluded.adresse,
            vehicules = excluded.vehicules,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `,
        [userId, nom, prenom, tel, email, adresse, vehicules, notes],
        callback
    );
}

function dbGetAsync(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

function dbRunAsync(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve({ lastID: this.lastID, changes: this.changes || 0 });
        });
    });
}

function dbAllAsync(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(Array.isArray(rows) ? rows : []);
        });
    });
}

let loginLogsSchemaReadyPromise = null;

function ensureLoginLogsSchemaAsync() {
    if (loginLogsSchemaReadyPromise) {
        return loginLogsSchemaReadyPromise;
    }

    loginLogsSchemaReadyPromise = (async () => {
        await dbRunAsync(`
            CREATE TABLE IF NOT EXISTS login_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                email TEXT NOT NULL,
                ip TEXT,
                user_agent TEXT,
                success INTEGER NOT NULL DEFAULT 0,
                fail_reason TEXT,
                logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const columns = await dbAllAsync("PRAGMA table_info(login_logs)");
        const existing = new Set(columns.map((c) => c.name));

        if (!existing.has("user_id")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN user_id INTEGER");
        }
        if (!existing.has("email")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN email TEXT NOT NULL DEFAULT ''");
        }
        if (!existing.has("ip")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN ip TEXT");
        }
        if (!existing.has("user_agent")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN user_agent TEXT");
        }
        if (!existing.has("success")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN success INTEGER NOT NULL DEFAULT 0");
        }
        if (!existing.has("fail_reason")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN fail_reason TEXT");
        }
        if (!existing.has("logged_at")) {
            await dbRunAsync("ALTER TABLE login_logs ADD COLUMN logged_at DATETIME DEFAULT CURRENT_TIMESTAMP");
        }

        await dbRunAsync("CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id)");
        await dbRunAsync("CREATE INDEX IF NOT EXISTS idx_login_logs_at ON login_logs(logged_at)");
    })().catch((error) => {
        loginLogsSchemaReadyPromise = null;
        throw error;
    });

    return loginLogsSchemaReadyPromise;
}

function getSettingAsync(key) {
    return dbGetAsync("SELECT value FROM site_settings WHERE key = ?", [key]).then((row) => (row ? row.value : ""));
}

function upsertSiteSettingAsync(key, value) {
    return new Promise((resolve, reject) => {
        upsertSiteSetting(key, value, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(true);
        });
    });
}

function unfoldIcsLines(text) {
    return String(text || "")
        .replace(/\r\n[ \t]/g, "")
        .replace(/\n[ \t]/g, "");
}

function parseIcsEvents(icsText) {
    const content = unfoldIcsLines(icsText);
    const lines = content.split(/\r?\n/);
    const events = [];
    let current = null;

    for (const rawLine of lines) {
        const line = String(rawLine || "").trim();
        if (!line) continue;
        if (line === "BEGIN:VEVENT") {
            current = [];
            continue;
        }
        if (line === "END:VEVENT") {
            if (Array.isArray(current)) {
                events.push(current);
            }
            current = null;
            continue;
        }
        if (!Array.isArray(current)) {
            continue;
        }
        const sep = line.indexOf(":");
        if (sep <= 0) {
            continue;
        }
        const key = line.slice(0, sep).toUpperCase();
        const value = line.slice(sep + 1).trim();
        current.push({ key, value });
    }

    return events;
}

function getIcsField(event, fieldName) {
    const target = String(fieldName || "").toUpperCase();
    return event.find((item) => item.key === target || item.key.startsWith(`${target};`)) || null;
}

function getIcsFields(event, fieldName) {
    const target = String(fieldName || "").toUpperCase();
    return event.filter((item) => item.key === target || item.key.startsWith(`${target};`));
}

function toDateAndTimeParts(dateObj) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
        return null;
    }
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

function parseIcsDateTime(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
        return null;
    }

    if (/^\d{8}$/.test(value)) {
        return {
            date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
            time: "09:00"
        };
    }

    if (/^\d{8}T\d{6}Z$/.test(value)) {
        const year = Number.parseInt(value.slice(0, 4), 10);
        const month = Number.parseInt(value.slice(4, 6), 10);
        const day = Number.parseInt(value.slice(6, 8), 10);
        const hour = Number.parseInt(value.slice(9, 11), 10);
        const minute = Number.parseInt(value.slice(11, 13), 10);
        return toDateAndTimeParts(new Date(Date.UTC(year, month - 1, day, hour, minute, 0)));
    }

    if (/^\d{8}T\d{6}$/.test(value)) {
        const year = Number.parseInt(value.slice(0, 4), 10);
        const month = Number.parseInt(value.slice(4, 6), 10);
        const day = Number.parseInt(value.slice(6, 8), 10);
        const hour = Number.parseInt(value.slice(9, 11), 10);
        const minute = Number.parseInt(value.slice(11, 13), 10);
        return toDateAndTimeParts(new Date(year, month - 1, day, hour, minute, 0));
    }

    return null;
}

function extractEmailFromText(text) {
    const value = String(text || "");
    const mailto = value.match(/mailto:([^\s>;,]+)/i);
    if (mailto && isValidEmail(mailto[1])) {
        return mailto[1].toLowerCase();
    }
    const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email && isValidEmail(email[0])) {
        return email[0].toLowerCase();
    }
    return "";
}

function normalizeGoogleEvent(event) {
    const dtStartField = getIcsField(event, "DTSTART");
    if (!dtStartField || !dtStartField.value) {
        return null;
    }
    const start = parseIcsDateTime(dtStartField.value);
    if (!start || !isValidDate(start.date)) {
        return null;
    }

    const statusField = getIcsField(event, "STATUS");
    const statusRaw = String(statusField ? statusField.value : "").trim().toUpperCase();
    if (statusRaw === "CANCELLED") {
        return null;
    }

    const summaryField = getIcsField(event, "SUMMARY");
    const descriptionField = getIcsField(event, "DESCRIPTION");
    const attendees = getIcsFields(event, "ATTENDEE");

    const summary = String(summaryField ? summaryField.value : "").trim();
    const service = summary || GOOGLE_CALENDAR_DEFAULT_SERVICE;

    let email = "";
    for (const attendee of attendees) {
        email = extractEmailFromText(attendee.value);
        if (email) break;
    }
    if (!email) {
        email = extractEmailFromText(descriptionField ? descriptionField.value : "");
    }

    return {
        service: service.slice(0, 180),
        date: start.date,
        time: start.time,
        status: "pending",
        email
    };
}

async function syncGoogleCalendarToAppointments(options = {}) {
    const force = !!options.force;

    if (!GOOGLE_CALENDAR_SYNC_ENABLED) {
        return { enabled: false, imported: 0, scanned: 0, reason: "disabled" };
    }
    if (googleCalendarSyncState.running) {
        return { enabled: true, imported: 0, scanned: 0, reason: "already_running" };
    }

    const now = Date.now();
    if (!force && now - googleCalendarSyncState.lastRunAt < 45000) {
        return { enabled: true, imported: 0, scanned: googleCalendarSyncState.lastScanned, reason: "throttled" };
    }

    googleCalendarSyncState.running = true;
    googleCalendarSyncState.lastRunAt = now;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(GOOGLE_CALENDAR_ICS_URL, {
            method: "GET",
            headers: { "Cache-Control": "no-cache" },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const icsText = await response.text();
        const events = parseIcsEvents(icsText)
            .map(normalizeGoogleEvent)
            .filter(Boolean);

        const today = isoDateOnly();
        const recentEvents = events.filter((item) => item.date >= today);
        const scopedEvents = recentEvents.length ? recentEvents : events;
        googleCalendarSyncState.lastScanned = scopedEvents.length;

        if (!scopedEvents.length) {
            googleCalendarSyncState.lastImported = 0;
            googleCalendarSyncState.lastError = "";
            await upsertSiteSettingAsync("google_calendar_last_sync_at", new Date().toISOString());
            await upsertSiteSettingAsync("google_calendar_last_sync_count", "0");
            await upsertSiteSettingAsync("google_calendar_last_sync_error", "");
            return { enabled: true, imported: 0, scanned: 0 };
        }

        const emails = [...new Set(scopedEvents.map((item) => item.email).filter(Boolean))];
        let emailToUserId = {};
        if (emails.length) {
            const placeholders = emails.map(() => "?").join(",");
            const users = await dbAllAsync(`SELECT id, email FROM users WHERE LOWER(email) IN (${placeholders})`, emails);
            emailToUserId = (users || []).reduce((acc, user) => {
                acc[String(user.email || "").toLowerCase()] = user.id;
                return acc;
            }, {});
        }

        let imported = 0;
        for (const item of scopedEvents) {
            try {
                const userId = item.email ? (emailToUserId[item.email] || null) : null;
                const result = await dbRunAsync(
                    "INSERT OR IGNORE INTO appointments (user_id, service, date, time, status) VALUES (?, ?, ?, ?, ?)",
                    [userId, item.service, item.date, item.time, item.status]
                );
                if (result.changes > 0) {
                    imported += 1;
                }
            } catch (insertErr) {
                if (!String(insertErr.message || "").includes("UNIQUE constraint failed")) {
                    console.warn("Sync Google Calendar: insertion ignorée", insertErr.message);
                }
            }
        }

        googleCalendarSyncState.lastImported = imported;
        googleCalendarSyncState.lastError = "";
        await upsertSiteSettingAsync("google_calendar_last_sync_at", new Date().toISOString());
        await upsertSiteSettingAsync("google_calendar_last_sync_count", String(imported));
        await upsertSiteSettingAsync("google_calendar_last_sync_error", "");

        return { enabled: true, imported, scanned: scopedEvents.length };
    } catch (err) {
        const message = err && err.message ? err.message : "Erreur inconnue";
        googleCalendarSyncState.lastError = message;
        googleCalendarSyncState.lastImported = 0;
        await upsertSiteSettingAsync("google_calendar_last_sync_error", message).catch(() => {});
        return { enabled: true, imported: 0, scanned: 0, error: message };
    } finally {
        googleCalendarSyncState.running = false;
    }
}

function upsertClientProfileAsync(userId, payload) {
    return new Promise((resolve, reject) => {
        upsertClientProfile(userId, payload, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(true);
        });
    });
}

/**
 * Extrait l'IP réelle du client (supporte les proxies avec X-Forwarded-For).
 * Seules les adresses IPv4/IPv6 valides sont retournées, sinon "inconnue".
 */
function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const first = String(forwarded).split(",")[0].trim();
        if (first) return first.slice(0, 60);
    }
    const ip = req.socket?.remoteAddress || req.connection?.remoteAddress || "";
    return String(ip).slice(0, 60) || "inconnue";
}

/**
 * Calcule les champs manquants d'une fiche client.
 * Champs obligatoires : nom, prenom, tel, email, adresse, immatriculation (≥1 véhicule)
 */
function getProfileCompleteness(profile) {
    const missing = [];
    if (!String(profile.nom || "").trim()) missing.push("Nom");
    if (!String(profile.prenom || "").trim()) missing.push("Prénom");
    if (!String(profile.tel || "").trim()) missing.push("Téléphone");
    if (!String(profile.email || profile.account_email || "").trim()) missing.push("Email");
    if (!String(profile.adresse || "").trim()) missing.push("Adresse");
    const vehicles = Array.isArray(profile.vehicules) ? profile.vehicules : [];
    const hasImmat = vehicles.some((v) => String(v.immat || "").trim().length > 0);
    if (!hasImmat) missing.push("Immatriculation");
    return { is_complete: missing.length === 0, missing_fields: missing };
}

function mapOccasionRow(row) {
    return {
        ...row,
        photos: safeJsonParse(row.photos, []),
        image: row.image || null
    };
}

function normalizeRole(role) {
    const normalized = String(role || "client").trim().toLowerCase();
    return normalized === "admin" ? "admin" : "client";
}

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role || "client", name: user.name || "" },
        JWT_SECRET,
        { expiresIn: "12h" }
    );
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentification requise" });
    }

    const token = authHeader.slice(7);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        req.user.role = normalizeRole(req.user.role);

        if (req.user.role === "client") {
            db.get("SELECT COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ?", [req.user.id], (err, row) => {
                if (err || !row) {
                    return res.status(401).json({ error: "Session utilisateur introuvable" });
                }
                if (Number(row.is_blocked || 0) === 1) {
                    return res.status(403).json({ error: "Compte bloqué" });
                }
                next();
            });
            return;
        }

        next();
    } catch (_err) {
        return res.status(401).json({ error: "Token invalide ou expiré" });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Accès administrateur requis" });
    }
    next();
}

function ensureAdminFromEnv() {
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "";
    const adminName = (process.env.ADMIN_NAME || "").trim();

    if (!adminEmail || !adminPassword) {
        console.warn("Bootstrap admin ignoré: définissez ADMIN_EMAIL et ADMIN_PASSWORD pour créer/mettre à jour un compte admin.");
        return;
    }
    if (!isValidEmail(adminEmail) || adminPassword.length < 6) {
        console.warn("Bootstrap admin ignoré: ADMIN_EMAIL ou ADMIN_PASSWORD invalide.");
        return;
    }

    bcrypt.hash(adminPassword, 10)
        .then((hash) => {
            db.run(
                `
                INSERT INTO users (email, password, role, name)
                VALUES (?, ?, 'admin', ?)
                ON CONFLICT(email) DO UPDATE SET
                    password = excluded.password,
                    role = 'admin',
                    name = CASE WHEN excluded.name != '' THEN excluded.name ELSE name END
                `,
                [adminEmail, hash, adminName],
                (err) => {
                    if (err) {
                        console.error("Erreur bootstrap admin:", err.message);
                        return;
                    }
                    console.log("Compte admin prêt:", adminEmail, adminName ? `(${adminName})` : '');
                }
            );
        })
        .catch((err) => {
            console.error("Erreur hash bootstrap admin:", err.message);
        });
}

async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

// Route test - REDIRECTION VERS LOGIN
app.get("/", (req, res) => {
    res.redirect("/index.html");
});

// Inscription - AVEC CRYPTAGE
app.post("/register", async (req, res) => {
    const { email, password, name } = req.body;
    const safeName = typeof name === "string" ? name.trim() : "";

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Email invalide" });
    }
    if (typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ error: "Mot de passe trop court (6 min)" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            "INSERT INTO users (email, password, role, name) VALUES (?, ?, 'client', ?)",
            [email.toLowerCase().trim(), hashedPassword, safeName],
            function (err) {
                if (err) {
                    return res.status(400).json({ error: "Utilisateur deja existant" });
                }

                const splitName = splitDisplayName(safeName);
                upsertClientProfile(
                    this.lastID,
                    {
                        nom: splitName.nom,
                        prenom: splitName.prenom,
                        email: email.toLowerCase().trim(),
                        vehicules: []
                    },
                    (profileErr) => {
                        if (profileErr) {
                            console.error("Erreur création fiche client:", profileErr.message);
                        }
                        res.json({ message: "Inscription reussie" });
                    }
                );
            }
        );
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Vérifier l'existence d'un compte client (pour guider le parcours formulaire d'accueil)
app.get("/client-account/exists", (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();
    const nom = String(req.query.nom || "").trim().toLowerCase();

    if (!email && !nom) {
        return res.json({ exists: false });
    }

    const matchClauses = [];
    const params = [];

    if (email && isValidEmail(email)) {
        matchClauses.push("LOWER(email) = ?");
        params.push(email);
    }

    if (nom) {
        matchClauses.push("LOWER(name) = ?");
        params.push(nom);
    }

    if (matchClauses.length === 0) {
        return res.json({ exists: false });
    }

    db.get(
        `SELECT id FROM users WHERE role = 'client' AND (${matchClauses.join(" OR ")}) LIMIT 1`,
        params,
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: "Erreur serveur" });
            }
            res.json({ exists: Boolean(row) });
        }
    );
});

// Vérifier si un client importé existe déjà et s'il doit créer son mot de passe (première connexion)
app.get("/client-onboarding-status", (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();

    if (!isValidEmail(email)) {
        return res.json({ found: false, hasPassword: false });
    }

    db.get(
        `
        SELECT
            u.id,
            u.email,
            u.password,
            u.name,
            cp.nom,
            cp.prenom
        FROM users u
        LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.role = 'client' AND LOWER(u.email) = ?
        LIMIT 1
        `,
        [email],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: "Erreur serveur" });
            }
            if (!row) {
                return res.json({ found: false, hasPassword: false });
            }

            const fullName = [row.prenom || "", row.nom || ""].join(" ").trim() || row.name || "";
            const hasPassword = typeof row.password === "string" && row.password.trim().length > 0;

            res.json({
                found: true,
                hasPassword,
                displayName: fullName,
                email: row.email
            });
        }
    );
});

// Connexion
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
    const ip = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 400);

    try {
        await ensureLoginLogsSchemaAsync();
    } catch (schemaError) {
        console.error("Erreur migration login_logs:", schemaError.message);
    }

    if (!isValidEmail(email) || typeof password !== "string") {
        return res.status(400).json({ error: "Identifiants invalides" });
    }

    const logAttempt = (userId, success, failReason = "") => {
        db.run(
            "INSERT INTO login_logs (user_id, email, ip, user_agent, success, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
            [userId || null, normalizedEmail, ip, userAgent, success ? 1 : 0, failReason || null],
            () => {}
        );
    };

    try {
        db.get(
            "SELECT id, email, password, role, name, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE email = ?",
            [normalizedEmail],
            async (err, row) => {
                if (err) {
                    return res.status(500).json({ error: "Erreur serveur" });
                }
                if (!row) {
                    logAttempt(null, false, "Compte introuvable");
                    return res.status(401).json({ error: "Identifiants invalides" });
                }

                const hasPassword = typeof row.password === "string" && row.password.trim().length > 0;
                if (!hasPassword) {
                    logAttempt(row.id, false, "Première connexion — mot de passe non défini");
                    return res.status(403).json({
                        error: "Première connexion détectée : créez votre mot de passe depuis 'Mot de passe oublié'.",
                        code: "FIRST_LOGIN_SETUP_REQUIRED"
                    });
                }

                if (Number(row.is_blocked || 0) === 1) {
                    logAttempt(row.id, false, "Compte client bloqué");
                    return res.status(403).json({ error: "Compte bloqué. Contactez l'administrateur." });
                }

                const passwordMatch = await bcrypt.compare(password, row.password);

                if (!passwordMatch) {
                    logAttempt(row.id, false, "Mot de passe incorrect");
                    return res.status(401).json({ error: "Identifiants invalides" });
                }

                // Verrouillage accès admin: seul l'email ADMIN_EMAIL peut ouvrir une session admin.
                if (row.role === "admin" && adminEmail && normalizedEmail !== adminEmail) {
                    logAttempt(row.id, false, "Tentative accès admin non autorisé");
                    return res.status(403).json({ error: "Accès administrateur non autorisé" });
                }

                const user = {
                    id: row.id,
                    email: row.email,
                    role: normalizeRole(row.role),
                    name: row.name || ""
                };
                const token = signToken(user);
                logAttempt(row.id, true);

                res.json({ message: "Connexion OK", user, token });
            }
        );
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Réinitialisation simple du mot de passe par email
app.post("/forgot-password", async (req, res) => {
    const { email, newPassword } = req.body || {};
    const normalizedEmail = (email || "").toLowerCase().trim();
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Email invalide" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères" });
    }

    // Le mot de passe admin doit rester piloté par les variables d'environnement.
    if (adminEmail && normalizedEmail === adminEmail) {
        return res.status(403).json({ error: "Réinitialisation admin désactivée depuis cette page" });
    }

    try {
        const hashedPassword = await hashPassword(newPassword);

        db.run(
            "UPDATE users SET password = ? WHERE email = ?",
            [hashedPassword, normalizedEmail],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: "Erreur serveur" });
                }
                if (!this.changes) {
                    return res.status(404).json({ error: "Aucun compte trouvé pour cet email" });
                }
                res.json({ message: "Mot de passe réinitialisé" });
            }
        );
    } catch (_err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Prendre un rendez-vous
app.post("/appointment", requireAuth, (req, res) => {
    const { service, date, time } = req.body;
    const userId = req.user.id;

    if (!allowedServices.has(service)) {
        return res.status(400).json({ error: "Service invalide" });
    }
    if (!isValidDate(date) || !availableHours.includes(time)) {
        return res.status(400).json({ error: "Date ou heure invalide" });
    }

    db.run(
        "INSERT INTO appointments (user_id, service, date, time) VALUES (?, ?, ?, ?)",
        [userId, service, date, time],
        function (err) {
            if (err) {
                if (String(err.message || "").includes("UNIQUE constraint failed")) {
                    return res.status(409).json({ error: "Ce créneau est déjà réservé" });
                }
                return res.status(400).json({ error: "Erreur lors de la prise de RDV" });
            }
            res.json({ message: "Rendez-vous confirme !", appointment_id: this.lastID });
        }
    );
});

// Voir ses rendez-vous
app.get("/appointments/:user_id", requireAuth, (req, res) => {
    const userId = Number(req.params.user_id);

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    }
    if (req.user.role !== "admin" && req.user.id !== userId) {
        return res.status(403).json({ error: "Accès refusé" });
    }

    db.all(
        "SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC",
        [userId],
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }
            res.json(rows);
        }
    );
});

// Voir tous les rendez-vous (admin)
app.get("/all-appointments", requireAuth, requireAdmin, async (_req, res) => {
    try {
        await syncGoogleCalendarToAppointments({ force: false });
    } catch (_err) {
        // Ne bloque pas le tableau de bord si la sync Google échoue.
    }

    db.all(
        "SELECT * FROM appointments ORDER BY date DESC",
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }
            res.json(rows);
        }
    );
});

app.post("/admin/google-calendar/sync", requireAuth, requireAdmin, async (_req, res) => {
    const result = await syncGoogleCalendarToAppointments({ force: true });
    if (result.error) {
        return res.status(502).json({ error: `Synchronisation Google échouée: ${result.error}`, ...result });
    }
    res.json({
        message: "Synchronisation Google Calendar terminée",
        ...result
    });
});

app.get("/admin/google-calendar/sync-status", requireAuth, requireAdmin, async (_req, res) => {
    const lastSyncAt = await getSettingAsync("google_calendar_last_sync_at").catch(() => "");
    const lastSyncCount = await getSettingAsync("google_calendar_last_sync_count").catch(() => "0");
    const lastSyncError = await getSettingAsync("google_calendar_last_sync_error").catch(() => "");
    res.json({
        enabled: GOOGLE_CALENDAR_SYNC_ENABLED,
        sourceConfigured: !!GOOGLE_CALENDAR_ICS_URL,
        intervalMs: GOOGLE_CALENDAR_SYNC_INTERVAL_MS,
        running: googleCalendarSyncState.running,
        lastRunAt: googleCalendarSyncState.lastRunAt ? new Date(googleCalendarSyncState.lastRunAt).toISOString() : null,
        lastSyncAt: lastSyncAt || null,
        lastSyncCount: Number(lastSyncCount || 0),
        lastSyncError: lastSyncError || null,
        lastScanned: googleCalendarSyncState.lastScanned,
        lastImported: googleCalendarSyncState.lastImported
    });
});

app.get("/admin/appointments/export-ics", requireAuth, requireAdmin, (req, res) => {
    const filter = String(req.query.status || "confirmed").toLowerCase();
    const includeAll = filter === "all";
    const query = `
        SELECT
            a.id,
            a.user_id,
            a.service,
            a.date,
            a.time,
            a.status,
            u.email,
            cp.nom,
            cp.prenom,
            cp.tel
        FROM appointments a
        LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN client_profiles cp ON cp.user_id = a.user_id
        ${includeAll ? "" : "WHERE a.status = 'confirmed'"}
        ORDER BY a.date ASC, a.time ASC
    `;

    db.all(query, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Erreur export ICS" });
        }

        const exportedAt = new Date().toISOString();
        upsertSiteSetting("vroomly_last_export_at", exportedAt, () => {});
        upsertSiteSetting("vroomly_last_export_scope", includeAll ? "all" : "confirmed", () => {});
        upsertSiteSetting("vroomly_last_export_count", String((rows || []).length), () => {});

        const ics = buildAppointmentsIcs(rows || []);
        const today = new Date().toISOString().slice(0, 10);
        const suffix = includeAll ? "all" : "confirmed";
        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=\"rdv-clinikauto-vroomly-${suffix}-${today}.ics\"`);
        return res.status(200).send(ics);
    });
});

app.get("/admin/appointments/vroomly-sync-status", requireAuth, requireAdmin, (_req, res) => {
    db.get(
        "SELECT COUNT(*) AS confirmedCount FROM appointments WHERE status = 'confirmed'",
        (countErr, countRow) => {
            if (countErr) {
                return res.status(500).json({ error: "Erreur statut synchro" });
            }

            db.all(
                "SELECT key, value FROM site_settings WHERE key IN ('vroomly_last_export_at', 'vroomly_last_export_scope', 'vroomly_last_export_count', 'vroomly_last_reminder_ack_at')",
                (settingsErr, rows) => {
                    if (settingsErr) {
                        return res.status(500).json({ error: "Erreur statut synchro" });
                    }

                    const settings = {};
                    (rows || []).forEach((row) => {
                        settings[row.key] = row.value;
                    });

                    const confirmedCount = Number(countRow?.confirmedCount || 0);
                    const lastExportAt = settings.vroomly_last_export_at || null;
                    const lastReminderAckAt = settings.vroomly_last_reminder_ack_at || null;
                    const today = isoDateOnly();
                    const exportedToday = lastExportAt ? isoDateOnly(lastExportAt) === today : false;
                    const reminderAckToday = lastReminderAckAt ? isoDateOnly(lastReminderAckAt) === today : false;

                    const needsReminder = confirmedCount > 0 && !exportedToday && !reminderAckToday;

                    res.json({
                        confirmedCount,
                        lastExportAt,
                        lastExportScope: settings.vroomly_last_export_scope || null,
                        lastExportCount: Number(settings.vroomly_last_export_count || 0),
                        lastReminderAckAt,
                        exportedToday,
                        reminderAckToday,
                        needsReminder
                    });
                }
            );
        }
    );
});

app.post("/admin/appointments/vroomly-reminder-ack", requireAuth, requireAdmin, (_req, res) => {
    const ackAt = new Date().toISOString();
    upsertSiteSetting("vroomly_last_reminder_ack_at", ackAt, (err) => {
        if (err) {
            return res.status(500).json({ error: "Erreur enregistrement rappel" });
        }
        res.json({ message: "Rappel acquitté", at: ackAt });
    });
});

// Importer des rendez-vous en masse (admin)
app.post("/admin/appointments/import", requireAuth, requireAdmin, (req, res) => {
    const { appointments } = req.body;
    if (!Array.isArray(appointments) || appointments.length === 0) {
        return res.status(400).json({ error: "Aucun rendez-vous fourni" });
    }

    const MAX_IMPORT = 500;
    const rows = appointments.slice(0, MAX_IMPORT);

    // Collecter les emails uniques pour retrouver les user_id
    const emails = [...new Set(rows.map((r) => (r.email || "").trim().toLowerCase()).filter(Boolean))];

    const doInsert = (emailMap) => {
        let remaining = rows.length;
        let imported = 0;
        const errors = [];

        rows.forEach((row, idx) => {
            const service = String(row.service || "").trim();
            const date = String(row.date || "").trim();
            const time = String(row.time || "").trim();
            const status = ["pending", "confirmed", "cancelled"].includes(row.status) ? row.status : "pending";
            const email = String(row.email || "").trim().toLowerCase();
            const userId = emailMap[email] || null;

            if (!service || !date || !time) {
                errors.push({ ligne: idx + 1, raison: "Champs obligatoires manquants : service, date, heure" });
                if (--remaining === 0) return res.json({ imported, errors });
                return;
            }

            // Validation basique du format date (YYYY-MM-DD) et heure (HH:MM)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
                errors.push({ ligne: idx + 1, raison: "Format date (YYYY-MM-DD) ou heure (HH:MM) invalide" });
                if (--remaining === 0) return res.json({ imported, errors });
                return;
            }

            db.run(
                "INSERT OR IGNORE INTO appointments (user_id, service, date, time, status) VALUES (?, ?, ?, ?, ?)",
                [userId, service, date, time, status],
                function (err) {
                    if (err) {
                        errors.push({ ligne: idx + 1, raison: err.message });
                    } else if (this.changes > 0) {
                        imported++;
                    }
                    if (--remaining === 0) res.json({ imported, errors });
                }
            );
        });
    };

    if (emails.length === 0) {
        doInsert({});
    } else {
        const placeholders = emails.map(() => "?").join(",");
        db.all(`SELECT id, email FROM users WHERE LOWER(email) IN (${placeholders})`, emails, (err, users) => {
            const emailMap = {};
            if (!err && users) users.forEach((u) => { emailMap[u.email.toLowerCase()] = u.id; });
            doInsert(emailMap);
        });
    }
});

// Voir tous les comptes clients (admin)
// Profil administrateur connecté
app.get("/admin/profile", requireAuth, requireAdmin, (req, res) => {
    db.get("SELECT id, email, role, name FROM users WHERE id = ?", [req.user.id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: "Erreur serveur" });
        res.json({ id: row.id, email: row.email, role: row.role, name: row.name || "" });
    });
});

// Mettre à jour le profil admin
app.put("/admin/profile", requireAuth, requireAdmin, async (req, res) => {
    const { name, email, password, currentPassword } = req.body || {};
    const updates = [];
    const params = [];

    if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length < 2) {
            return res.status(400).json({ error: "Prénom invalide (min. 2 caractères)" });
        }
        updates.push("name = ?");
        params.push(name.trim());
    }

    if (email !== undefined) {
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Email invalide" });
        }
        updates.push("email = ?");
        params.push(email.toLowerCase().trim());
    }

    if (password !== undefined) {
        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({ error: "Mot de passe trop court (8 min)" });
        }
        if (!currentPassword) {
            return res.status(400).json({ error: "Mot de passe actuel requis" });
        }
        try {
            const row = await new Promise((resolve, reject) => {
                db.get("SELECT password FROM users WHERE id = ?", [req.user.id], (err, r) => err ? reject(err) : resolve(r));
            });
            const match = await bcrypt.compare(currentPassword, row.password);
            if (!match) return res.status(401).json({ error: "Mot de passe actuel incorrect" });
            const hash = await bcrypt.hash(password, 10);
            updates.push("password = ?");
            params.push(hash);
        } catch (err) {
            return res.status(500).json({ error: "Erreur serveur" });
        }
    }

    if (!updates.length) return res.status(400).json({ error: "Aucune modification fournie" });

    params.push(req.user.id);
    db.run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params, function(err) {
        if (err) {
            if (String(err.message || "").includes("UNIQUE")) {
                return res.status(409).json({ error: "Cet email est déjà utilisé" });
            }
            return res.status(500).json({ error: "Erreur mise à jour" });
        }
        res.json({ message: "Profil mis à jour" });
    });
});

// Paramètres du site
app.get("/admin/settings", requireAuth, requireAdmin, (_req, res) => {
    db.all("SELECT key, value FROM site_settings", (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur serveur" });
        const settings = {};
        (rows || []).forEach((r) => { settings[r.key] = r.value; });
        res.json(settings);
    });
});

app.put("/admin/settings", requireAuth, requireAdmin, (req, res) => {
    const allowed = ['address', 'phone', 'email', 'hours_weekday', 'hours_saturday', 'hours_sunday', 'google_maps_url', 'facebook_url'];
    const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: "Aucun paramètre valide" });
    const stmt = db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    entries.forEach(([k, v]) => stmt.run([k, String(v || '').slice(0, 500)]));
    stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: "Erreur sauvegarde" });
        res.json({ message: "Paramètres sauvegardés" });
    });
});

app.get("/admin/users", requireAuth, requireAdmin, (_req, res) => {
    db.all(
        `
        SELECT
            u.id,
            u.email,
            u.role,
            u.name,
            COALESCE(u.is_blocked, 0) AS is_blocked,
            COUNT(a.id) AS appointments_count,
            COALESCE(SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_count,
            COALESCE(SUM(CASE WHEN a.status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed_count,
            COALESCE(SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count,
            MAX(a.created_at) AS last_appointment_at
        FROM users u
        LEFT JOIN appointments a ON a.user_id = u.id
        GROUP BY u.id
        ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.id DESC
        `,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors du chargement des utilisateurs" });
            }
            res.json(rows || []);
        }
    );
});

app.post("/admin/users/:userId/impersonate", requireAuth, requireAdmin, (req, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    }

    db.get("SELECT id, email, role, name, COALESCE(is_blocked, 0) AS is_blocked FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: "Erreur serveur" });
        }
        if (!row) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }
        if (row.role !== "client") {
            return res.status(403).json({ error: "Impersonation réservée aux comptes client" });
        }
        if (Number(row.is_blocked || 0) === 1) {
            return res.status(403).json({ error: "Ce compte client est bloqué" });
        }

        const token = jwt.sign(
            {
                id: row.id,
                email: row.email,
                role: "client",
                name: row.name || "",
                impersonatedBy: req.user.id
            },
            JWT_SECRET,
            { expiresIn: "15m" }
        );

        res.json({
            token,
            user: {
                id: row.id,
                email: row.email,
                role: "client",
                name: row.name || ""
            }
        });
    });
});

app.put("/admin/users/:id/block", requireAuth, requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const blocked = req.body && req.body.blocked ? 1 : 0;

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    }
    if (req.user.id === userId) {
        return res.status(400).json({ error: "Vous ne pouvez pas modifier votre propre compte admin" });
    }

    db.get("SELECT id, role FROM users WHERE id = ?", [userId], (findErr, userRow) => {
        if (findErr) {
            return res.status(500).json({ error: "Erreur serveur" });
        }
        if (!userRow) {
            return res.status(404).json({ error: "Compte introuvable" });
        }
        if (userRow.role === "admin") {
            return res.status(403).json({ error: "Action interdite sur un compte admin" });
        }

        db.run("UPDATE users SET is_blocked = ? WHERE id = ?", [blocked, userId], (updateErr) => {
            if (updateErr) {
                return res.status(500).json({ error: "Erreur lors de la mise à jour du blocage" });
            }
            res.json({ message: blocked ? "Compte client bloqué" : "Compte client débloqué", blocked: !!blocked });
        });
    });
});

app.get("/admin/client-profiles", requireAuth, requireAdmin, (_req, res) => {
    db.all(
        `
        SELECT
            u.id AS user_id,
            u.email AS account_email,
            u.role,
            u.name,
            cp.nom,
            cp.prenom,
            cp.tel,
            cp.email,
            cp.adresse,
            cp.notes,
            cp.vehicules,
            cp.updated_at
        FROM users u
        LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.role = 'client'
        ORDER BY u.id DESC
        `,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors du chargement des fiches clients" });
            }
            const mapped = (rows || []).map((row) => {
                const vehicules = safeJsonParse(row.vehicules, []);
                const base = {
                    user_id: row.user_id,
                    account_email: row.account_email,
                    role: row.role,
                    name: row.name || "",
                    nom: row.nom || "",
                    prenom: row.prenom || "",
                    tel: row.tel || "",
                    email: row.email || row.account_email || "",
                    adresse: row.adresse || "",
                    notes: row.notes || "",
                    vehicules,
                    updated_at: row.updated_at || null
                };
                return { ...base, ...getProfileCompleteness(base) };
            });
            res.json(mapped);        }
    );
});

// Import en masse des comptes clients (ex: fichier XLSX parsé côté admin)
app.post("/admin/clients/import", requireAuth, requireAdmin, async (req, res) => {
    const rawClients = Array.isArray(req.body?.clients) ? req.body.clients : [];
    if (!rawClients.length) {
        return res.status(400).json({ error: "Aucune ligne client reçue" });
    }
    if (rawClients.length > 5000) {
        return res.status(400).json({ error: "Import trop volumineux (max 5000 lignes)" });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const summary = {
        total: rawClients.length,
        created: 0,
        updated: 0,
        skippedInvalid: 0,
        skippedAdmin: 0,
        pendingPasswordSetup: 0,
        errors: 0
    };

    for (const line of rawClients) {
        let email = String(line?.email || "").trim().toLowerCase();
        const tel = String(line?.tel || "").trim();

        // Si pas d'email valide mais un téléphone, on génère un placeholder
        if (!isValidEmail(email)) {
            if (tel) {
                const telClean = tel.replace(/[^0-9+]/g, '').slice(0, 20);
                email = `import_${telClean}@clinikauto.local`;
            } else {
                summary.skippedInvalid += 1;
                continue;
            }
        }
        if (adminEmail && email === adminEmail) {
            summary.skippedAdmin += 1;
            continue;
        }

        const nom = String(line?.nom || "").trim();
        const prenom = String(line?.prenom || "").trim();
        const providedName = String(line?.name || "").trim();
        const adresse = String(line?.adresse || "").trim();
        const notes = String(line?.notes || "").trim();
        const fullName = [prenom, nom].filter(Boolean).join(" ").trim() || providedName;

        try {
            const existing = await dbGetAsync(
                "SELECT id, email, role, name, password FROM users WHERE LOWER(email) = ? LIMIT 1",
                [email]
            );

            if (!existing) {
                const created = await dbRunAsync(
                    "INSERT INTO users (email, password, role, name) VALUES (?, NULL, 'client', ?)",
                    [email, fullName]
                );
                await upsertClientProfileAsync(created.lastID, {
                    nom,
                    prenom,
                    tel,
                    email,
                    adresse,
                    notes,
                    vehicules: []
                });

                summary.created += 1;
                summary.pendingPasswordSetup += 1;
                continue;
            }

            if (existing.role === "admin") {
                summary.skippedAdmin += 1;
                continue;
            }

            await dbRunAsync(
                "UPDATE users SET role = 'client', name = ? WHERE id = ?",
                [fullName || existing.name || "", existing.id]
            );

            await upsertClientProfileAsync(existing.id, {
                nom,
                prenom,
                tel,
                email,
                adresse,
                notes,
                vehicules: []
            });

            summary.updated += 1;
            const hasPassword = typeof existing.password === "string" && existing.password.trim().length > 0;
            if (!hasPassword) {
                summary.pendingPasswordSetup += 1;
            }
        } catch (error) {
            summary.errors += 1;
            console.error("Erreur import client:", error.message);
        }
    }

    return res.json({
        message: "Import clients terminé",
        ...summary
    });
});

app.put("/admin/client-profiles/:userId", requireAuth, requireAdmin, (req, res) => {
    const userId = Number(req.params.userId);
    const body = req.body || {};

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    }

    const email = String(body.email || "").trim().toLowerCase();
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: "Email invalide" });
    }

    const vehicules = Array.isArray(body.vehicules) ? body.vehicules : [];
    if (vehicules.length > 20) {
        return res.status(400).json({ error: "Trop de véhicules sur la fiche (max 20)" });
    }

    db.get("SELECT id, role, email FROM users WHERE id = ?", [userId], (findErr, userRow) => {
        if (findErr) {
            return res.status(500).json({ error: "Erreur serveur" });
        }
        if (!userRow) {
            return res.status(404).json({ error: "Utilisateur introuvable" });
        }
        if (userRow.role !== "client") {
            return res.status(403).json({ error: "Edition autorisée uniquement pour les fiches client" });
        }

        const nom = String(body.nom || "").trim();
        const prenom = String(body.prenom || "").trim();
        const fullName = [prenom, nom].filter(Boolean).join(" ").trim();
        const finalEmail = email || String(userRow.email || "").toLowerCase();

        upsertClientProfile(
            userId,
            {
                nom,
                prenom,
                tel: body.tel,
                email: finalEmail,
                adresse: body.adresse,
                vehicules,
                notes: body.notes
            },
            (profileErr) => {
                if (profileErr) {
                    return res.status(500).json({ error: "Erreur mise à jour fiche client" });
                }

                const nameToStore = fullName || userRow.name || "";
                db.run(
                    "UPDATE users SET name = ?, email = ? WHERE id = ?",
                    [nameToStore, finalEmail, userId],
                    (updateErr) => {
                        if (updateErr) {
                            if (String(updateErr.message || "").includes("UNIQUE")) {
                                return res.status(409).json({ error: "Cet email est déjà utilisé" });
                            }
                            return res.status(500).json({ error: "Erreur mise à jour compte utilisateur" });
                        }
                        res.json({ message: "Fiche client mise à jour" });
                    }
                );
            }
        );
    });
});

// Profil du client connecté (accès strictement privé au compte courant)
app.get("/me/profile", requireAuth, (req, res) => {
    if (normalizeRole(req.user.role) !== "client") {
        return res.status(403).json({ error: "Accès client requis" });
    }

    db.get(
        `
        SELECT
            u.id AS user_id,
            u.email AS account_email,
            u.name,
            cp.nom,
            cp.prenom,
            cp.tel,
            cp.email,
            cp.adresse,
            cp.vehicules,
            cp.updated_at
        FROM users u
        LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
        `,
        [req.user.id],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: "Erreur lors du chargement du profil" });
            }

            const profile = {
                user_id: row.user_id,
                account_email: row.account_email,
                name: row.name || "",
                nom: row.nom || "",
                prenom: row.prenom || "",
                tel: row.tel || "",
                email: row.email || row.account_email || "",
                adresse: row.adresse || "",
                vehicules: safeJsonParse(row.vehicules, []),
                updated_at: row.updated_at || null
            };
            res.json({ ...profile, ...getProfileCompleteness(profile) });
        }
    );
});

app.put("/me/profile", requireAuth, (req, res) => {
    if (req.user.role !== "client") {
        return res.status(403).json({ error: "Accès client requis" });
    }

    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: "Email invalide" });
    }

    const vehicules = Array.isArray(body.vehicules) ? body.vehicules : [];
    if (vehicules.length > 20) {
        return res.status(400).json({ error: "Trop de véhicules (max 20)" });
    }

    db.get("SELECT id, email FROM users WHERE id = ?", [req.user.id], (findErr, userRow) => {
        if (findErr || !userRow) {
            return res.status(500).json({ error: "Erreur serveur" });
        }

        const nom = String(body.nom || "").trim();
        const prenom = String(body.prenom || "").trim();
        const fullName = [prenom, nom].filter(Boolean).join(" ").trim();
        const finalEmail = email || String(userRow.email || "").toLowerCase();

        upsertClientProfile(
            req.user.id,
            {
                nom,
                prenom,
                tel: body.tel,
                email: finalEmail,
                adresse: body.adresse,
                vehicules,
                notes: ""
            },
            (profileErr) => {
                if (profileErr) {
                    return res.status(500).json({ error: "Erreur mise à jour profil" });
                }

                db.run(
                    "UPDATE users SET name = ?, email = ? WHERE id = ?",
                    [fullName || userRow.email, finalEmail, req.user.id],
                    (updateErr) => {
                        if (updateErr) {
                            if (String(updateErr.message || "").includes("UNIQUE")) {
                                return res.status(409).json({ error: "Cet email est déjà utilisé" });
                            }
                            return res.status(500).json({ error: "Erreur mise à jour compte" });
                        }

                        res.json({ message: "Profil client mis à jour" });
                    }
                );
            }
        );
    });
});

// Supprimer un compte client (admin)
app.delete("/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
    const userId = Number(req.params.id);

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "Identifiant utilisateur invalide" });
    }
    if (req.user.id === userId) {
        return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte admin" });
    }

    db.get(
        "SELECT id, role FROM users WHERE id = ?",
        [userId],
        (findErr, userRow) => {
            if (findErr) {
                return res.status(500).json({ error: "Erreur lors de la recherche du compte" });
            }
            if (!userRow) {
                return res.status(404).json({ error: "Compte introuvable" });
            }
            if (userRow.role === "admin") {
                return res.status(403).json({ error: "Suppression d'un compte admin interdite" });
            }

            db.serialize(() => {
                db.run(
                    "DELETE FROM appointments WHERE user_id = ?",
                    [userId],
                    (appointmentsErr) => {
                        if (appointmentsErr) {
                            return res.status(500).json({ error: "Erreur lors de la suppression des rendez-vous" });
                        }

                        db.run(
                            "DELETE FROM client_profiles WHERE user_id = ?",
                            [userId],
                            (profileErr) => {
                                if (profileErr) {
                                    return res.status(500).json({ error: "Erreur lors de la suppression de la fiche client" });
                                }

                                db.run(
                                    "DELETE FROM users WHERE id = ?",
                                    [userId],
                                    function (deleteErr) {
                                        if (deleteErr) {
                                            return res.status(500).json({ error: "Erreur lors de la suppression du compte" });
                                        }
                                        res.json({ message: "Compte client supprimé" });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        }
    );
});

// Mettre a jour un rendez-vous
app.put("/appointment/:id", requireAuth, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const completionSummary = String(req.body?.completionSummary || "").trim();

    if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: "Statut invalide" });
    }

    const nextSummary = status === "completed"
        ? (completionSummary || "Prestation réalisée en atelier ClinikAuto.")
        : "";
    const completedAt = status === "completed" ? new Date().toISOString() : null;

    db.run(
        "UPDATE appointments SET status = ?, completion_summary = ?, completed_at = ? WHERE id = ?",
        [status, nextSummary, completedAt, id],
        function (err) {
            if (err) {
                return res.status(400).json({ error: "Erreur lors de la mise a jour" });
            }
            if (!this.changes) {
                return res.status(404).json({ error: "Rendez-vous introuvable" });
            }
            res.json({ message: "Rendez-vous mis a jour" });
        }
    );
});

app.delete("/admin/appointments/cancelled", requireAuth, requireAdmin, (req, res) => {
    db.run(
        "DELETE FROM appointments WHERE status = 'cancelled'",
        function (err) {
            if (err) {
                return res.status(500).json({ error: "Erreur suppression des rendez-vous annulés" });
            }
            res.json({ message: "Rendez-vous annulés supprimés", deleted: this.changes || 0 });
        }
    );
});

// Disponibilites pour une date
// ─────────────────────────────────────────────────────────────────────────────
// AGENDA DOODLE — vue mensuelle
// GET /calendar-month/:year/:month   (sans token = vue publique, avec token admin = vue complète)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/calendar-month/:year/:month", (req, res) => {
    const year  = parseInt(req.params.year,  10);
    const month = parseInt(req.params.month, 10);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Paramètres year/month invalides" });
    }

    // Déterminer si l'appelant est admin (token optionnel)
    let isAdmin = false;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
        try {
            const payload = require("jsonwebtoken").verify(authHeader.slice(7), JWT_SECRET);
            if (payload.role === "admin") {
                isAdmin = true;
            }
        } catch (_) { /* token invalide → vue publique */ }
    }

    const monthStr = String(month).padStart(2, "0");
    const prefix   = `${year}-${monthStr}`;

    db.all(
        `SELECT a.id, a.date, a.time, a.status, a.service, a.notes,
                u.email AS client_email, u.name AS client_name,
                cp.phone AS client_phone
         FROM appointments a
         LEFT JOIN users u ON a.user_id = u.id
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
         WHERE a.date LIKE ? AND a.status != 'cancelled'
         ORDER BY a.date, a.time`,
        [`${prefix}-%`],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Erreur base de données" });
            }

            // Construire un objet { "2026-04-28": { slots: [...] } } pour chaque jour du mois
            const daysInMonth = new Date(year, month, 0).getDate();
            const days = {};

            for (let d = 1; d <= daysInMonth; d++) {
                const dayStr = `${prefix}-${String(d).padStart(2, "0")}`;
                days[dayStr] = { slots: availableHours.map(h => ({ time: h, status: "available" })) };
            }

            rows.forEach(row => {
                if (!days[row.date]) return;
                const slot = days[row.date].slots.find(s => s.time === row.time);
                if (!slot) return;
                slot.status = "booked";
                if (isAdmin) {
                    slot.id            = row.id;
                    slot.appointmentStatus = row.status;
                    slot.service       = row.service;
                    slot.notes         = row.notes;
                    slot.client_email  = row.client_email;
                    slot.client_name   = row.client_name;
                    slot.client_phone  = row.client_phone;
                }
            });

            res.json({ year, month, isAdmin, days });
        }
    );
});

app.get("/available-times/:date", (req, res) => {
    const { date } = req.params;

    if (!isValidDate(date)) {
        return res.status(400).json({ error: "Date invalide" });
    }

    db.all(
        "SELECT time FROM appointments WHERE date = ? AND status != 'cancelled'",
        [date],
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }

            const bookedTimes = rows.map(r => r.time);
            const availableTimes = availableHours.filter(hour => !bookedTimes.includes(hour));

            res.json({
                date,
                available: availableTimes,
                booked: bookedTimes,
                all: availableHours
            });
        }
    );
});

// Rendez-vous par date
app.get("/appointments-by-date/:date", (req, res) => {
    const { date } = req.params;

    if (!isValidDate(date)) {
        return res.status(400).json({ error: "Date invalide" });
    }

    db.all(
        "SELECT * FROM appointments WHERE date = ? AND status != 'cancelled' ORDER BY time",
        [date],
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }
            res.json(rows || []);
        }
    );
});

app.get("/occasions-data", (_req, res) => {
    db.all(
        "SELECT * FROM occasions ORDER BY datetime(created_at) DESC, id DESC",
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors du chargement des occasions" });
            }
            res.json((rows || []).map(mapOccasionRow));
        }
    );
});

app.post("/admin/occasions", requireAuth, requireAdmin, (req, res) => {
    const {
        id,
        type,
        titre,
        description,
        prix,
        statut,
        annee,
        km,
        carburant,
        boite,
        etat,
        reference,
        compatible,
        photos,
        image
    } = req.body || {};

    if (typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "Identifiant d'occasion invalide" });
    }
    if (!["voiture", "piece"].includes(type)) {
        return res.status(400).json({ error: "Type d'occasion invalide" });
    }
    if (typeof titre !== "string" || !titre.trim() || typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ error: "Titre et description sont obligatoires" });
    }
    if (!["disponible", "vendu"].includes(statut)) {
        return res.status(400).json({ error: "Statut d'occasion invalide" });
    }

    db.run(
        `
        INSERT INTO occasions (
            id, type, titre, description, prix, statut, annee, km, carburant, boite,
            etat, reference, compatible, photos, image, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            titre = excluded.titre,
            description = excluded.description,
            prix = excluded.prix,
            statut = excluded.statut,
            annee = excluded.annee,
            km = excluded.km,
            carburant = excluded.carburant,
            boite = excluded.boite,
            etat = excluded.etat,
            reference = excluded.reference,
            compatible = excluded.compatible,
            photos = excluded.photos,
            image = excluded.image,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
            id.trim(),
            type,
            titre.trim(),
            description.trim(),
            String(prix || "0"),
            statut,
            annee || null,
            km || null,
            carburant || null,
            boite || null,
            etat || null,
            reference || null,
            compatible || null,
            JSON.stringify(Array.isArray(photos) ? photos : []),
            image || null
        ],
        (err) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'occasion" });
            }

            db.get("SELECT * FROM occasions WHERE id = ?", [id.trim()], (selectErr, row) => {
                if (selectErr || !row) {
                    return res.json({ message: "Occasion enregistrée" });
                }
                res.json(mapOccasionRow(row));
            });
        }
    );
});

app.delete("/admin/occasions/:id", requireAuth, requireAdmin, (req, res) => {
    db.run("DELETE FROM occasions WHERE id = ?", [req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ error: "Erreur lors de la suppression de l'occasion" });
        }
        res.json({ message: "Occasion supprimée", deleted: this.changes || 0 });
    });
});

app.post("/analytics/visit", (req, res) => {
    const { sessionId, page, path: pagePath } = req.body || {};

    if (typeof page !== "string" || !page.trim() || typeof pagePath !== "string" || !pagePath.trim()) {
        return res.status(400).json({ error: "Données de visite invalides" });
    }

    db.run(
        "INSERT INTO site_visits (session_id, page, path) VALUES (?, ?, ?)",
        [typeof sessionId === "string" ? sessionId.slice(0, 120) : null, page.trim().slice(0, 120), pagePath.trim().slice(0, 255)],
        (err) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors de l'enregistrement de la visite" });
            }
            res.json({ ok: true });
        }
    );
});

app.post("/analytics/event", (req, res) => {
    const { sessionId, name, detail } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Nom d'événement invalide" });
    }

    db.run(
        "INSERT INTO site_events (session_id, name, detail) VALUES (?, ?, ?)",
        [
            typeof sessionId === "string" ? sessionId.slice(0, 120) : null,
            name.trim().slice(0, 120),
            detail === undefined ? null : JSON.stringify(detail)
        ],
        (err) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'événement" });
            }
            res.json({ ok: true });
        }
    );
});

app.get("/admin/analytics", requireAuth, requireAdmin, (_req, res) => {
    db.get(
        "SELECT COUNT(*) AS totalViews, COUNT(DISTINCT session_id) AS sessions, MAX(visited_at) AS lastVisitAt FROM site_visits",
        (summaryErr, summaryRow) => {
            if (summaryErr) {
                return res.status(500).json({ error: "Erreur lors du chargement des statistiques" });
            }

            db.all(
                "SELECT page, COUNT(*) AS count FROM site_visits GROUP BY page ORDER BY count DESC",
                (pagesErr, pageRows) => {
                    if (pagesErr) {
                        return res.status(500).json({ error: "Erreur lors du chargement des pages vues" });
                    }

                    db.all(
                        "SELECT name, COUNT(*) AS count FROM site_events GROUP BY name ORDER BY count DESC",
                        (eventsErr, eventRows) => {
                            if (eventsErr) {
                                return res.status(500).json({ error: "Erreur lors du chargement des événements" });
                            }

                            db.all(
                                "SELECT page, path, visited_at AS at FROM site_visits ORDER BY datetime(visited_at) DESC LIMIT 10",
                                (recentVisitsErr, recentVisitRows) => {
                                    if (recentVisitsErr) {
                                        return res.status(500).json({ error: "Erreur lors du chargement des visites récentes" });
                                    }

                                    db.all(
                                        "SELECT name, detail, created_at AS at FROM site_events ORDER BY datetime(created_at) DESC LIMIT 10",
                                        (recentEventsErr, recentEventRows) => {
                                            if (recentEventsErr) {
                                                return res.status(500).json({ error: "Erreur lors du chargement des événements récents" });
                                            }

                                            const pages = {};
                                            (pageRows || []).forEach((row) => {
                                                pages[row.page] = row.count;
                                            });

                                            const events = {};
                                            (eventRows || []).forEach((row) => {
                                                events[row.name] = row.count;
                                            });

                                            res.json({
                                                totalViews: summaryRow?.totalViews || 0,
                                                sessions: summaryRow?.sessions || 0,
                                                lastVisitAt: summaryRow?.lastVisitAt || null,
                                                pages,
                                                events,
                                                recentVisits: (recentVisitRows || []).map((row) => ({ page: row.page, path: row.path, at: row.at })),
                                                recentEvents: (recentEventRows || []).map((row) => ({
                                                    name: row.name,
                                                    detail: safeJsonParse(row.detail, row.detail),
                                                    at: row.at
                                                }))
                                            });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

app.get("/google-reviews", async (req, res) => {
    const apiKey = String(process.env.GOOGLE_PLACES_KEY || "").trim();
    let placeId = String(req.query.place_id || process.env.PLACE_ID || "").trim();
    const placeQuery = String(req.query.q || process.env.GOOGLE_PLACE_QUERY || "").trim();
    const envReviewUrl = String(req.query.review_url || process.env.GOOGLE_REVIEW_URL || "").trim();

    if (!apiKey) {
        return res.status(503).json({
            configured: false,
            error: "Google Reviews non configure",
            help: "Definissez GOOGLE_PLACES_KEY puis PLACE_ID ou GOOGLE_PLACE_QUERY"
        });
    }

    if (!placeId && !placeQuery) {
        return res.status(503).json({
            configured: false,
            error: "Google Reviews non configure",
            help: "Definissez PLACE_ID ou GOOGLE_PLACE_QUERY"
        });
    }

    const resolvePlaceIdFromQuery = async () => {
        if (!placeQuery) {
            return "";
        }
        const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(placeQuery)}&inputtype=textquery&fields=place_id&language=fr&key=${encodeURIComponent(apiKey)}`;
        const findResponse = await fetch(findUrl);
        const findPayload = await findResponse.json();
        if (!findResponse.ok || !Array.isArray(findPayload.candidates) || findPayload.candidates.length === 0) {
            return "";
        }
        return String(findPayload.candidates[0].place_id || "").trim();
    };

    if (!placeId) {
        placeId = await resolvePlaceIdFromQuery();
    }

    if (!placeId) {
        return res.status(404).json({
            configured: false,
            error: "Etablissement introuvable",
            help: "Verifiez GOOGLE_PLACE_QUERY ou fournissez PLACE_ID"
        });
    }

    const cacheKey = `${placeId}::${placeQuery}`;
    if (
        googleReviewsCache.data &&
        googleReviewsCache.cacheKey === cacheKey &&
        Date.now() - googleReviewsCache.ts < GOOGLE_REVIEWS_CACHE_MS
    ) {
        return res.json(googleReviewsCache.data);
    }

    const fields = ["name", "rating", "user_ratings_total", "reviews", "url"].join(",");
    const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}&language=fr&reviews_sort=newest&key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(apiUrl);
        const payload = await response.json();

        if (!response.ok || (payload.status && payload.status !== "OK")) {
            return res.status(502).json({
                configured: true,
                error: "Erreur Google Places",
                googleStatus: payload.status || response.status
            });
        }

        const result = payload.result || {};
        const reviewUrl = envReviewUrl || `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
        const data = {
            configured: true,
            placeId,
            name: result.name || "",
            rating: Number(result.rating || 0),
            user_ratings_total: Number(result.user_ratings_total || 0),
            reviews: Array.isArray(result.reviews) ? result.reviews : [],
            maps_url: result.url || "",
            write_review_url: reviewUrl
        };

        googleReviewsCache.cacheKey = cacheKey;
        googleReviewsCache.ts = Date.now();
        googleReviewsCache.data = data;

        return res.json(data);
    } catch (error) {
        return res.status(500).json({
            configured: true,
            error: "Impossible de recuperer les avis Google",
            detail: String(error && error.message ? error.message : error)
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAUX DE CONNEXION (admin)
// ─────────────────────────────────────────────────────────────────────────────

// Liste paginée des derniers logs (tous utilisateurs ou filtré par user_id)
app.get("/admin/login-logs", requireAuth, requireAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const userId = req.query.user_id ? Number(req.query.user_id) : null;

    const whereClauses = [];
    const params = [];

    if (userId && !Number.isNaN(userId)) {
        whereClauses.push("ll.user_id = ?");
        params.push(userId);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    try {
        await ensureLoginLogsSchemaAsync();

        const countRow = await dbGetAsync(
            `SELECT COUNT(*) AS total FROM login_logs ll ${where}`,
            params
        );

        const rows = await dbAllAsync(
            `
            SELECT
                ll.id,
                ll.user_id,
                ll.email,
                ll.ip,
                ll.user_agent,
                ll.success,
                ll.fail_reason,
                ll.logged_at,
                u.name AS user_name,
                u.role AS user_role
            FROM login_logs ll
            LEFT JOIN users u ON u.id = ll.user_id
            ${where}
            ORDER BY ll.logged_at DESC
            LIMIT ? OFFSET ?
            `,
            [...params, limit, offset]
        );

        res.json({
            total: countRow?.total || 0,
            limit,
            offset,
            logs: (rows || []).map((r) => ({
                id: r.id,
                user_id: r.user_id,
                email: r.email,
                ip: r.ip || "—",
                user_agent: r.user_agent || "—",
                success: r.success === 1,
                fail_reason: r.fail_reason || null,
                logged_at: r.logged_at,
                user_name: r.user_name || "",
                user_role: r.user_role || "client"
            }))
        });
    } catch (_error) {
        return res.status(500).json({ error: "Erreur chargement logs" });
    }
});

// Résumé des logs pour un client spécifique
app.get("/admin/login-logs/:userId", requireAuth, requireAdmin, async (req, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) return res.status(400).json({ error: "Identifiant invalide" });

    try {
        await ensureLoginLogsSchemaAsync();
        const rows = await dbAllAsync(
            `SELECT id, email, ip, user_agent, success, fail_reason, logged_at
             FROM login_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 50`,
            [userId]
        );
        res.json((rows || []).map((r) => ({
            id: r.id,
            email: r.email,
            ip: r.ip || "—",
            user_agent: r.user_agent || "—",
            success: r.success === 1,
            fail_reason: r.fail_reason || null,
            logged_at: r.logged_at
        })));
    } catch (_error) {
        return res.status(500).json({ error: "Erreur chargement logs" });
    }
});

// Servir frontend
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/index", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dashboard.html"));
});

app.get("/appointment", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/appointment.html"));
});

app.get("/occasions", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/occasions.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/register.html"));
});

ensureLoginLogsSchemaAsync().catch((error) => {
    console.error("Erreur initialisation login_logs:", error.message);
});

// Start server
app.listen(3000, () => {
    console.log("Serveur lance sur http://localhost:3000");
    ensureAdminFromEnv();

    if (GOOGLE_CALENDAR_SYNC_ENABLED) {
        console.log("Sync Google Calendar activee (intervalle ms):", GOOGLE_CALENDAR_SYNC_INTERVAL_MS);
        // Lancement initial sans bloquer le démarrage serveur.
        setTimeout(() => {
            syncGoogleCalendarToAppointments({ force: true })
                .then((result) => {
                    if (result.error) {
                        console.warn("Sync Google initiale en erreur:", result.error);
                        return;
                    }
                    console.log(`Sync Google initiale OK: ${result.imported} importés / ${result.scanned} lus`);
                })
                .catch((err) => console.warn("Sync Google initiale impossible:", err.message));
        }, 1500);

        googleCalendarSyncState.timer = setInterval(() => {
            syncGoogleCalendarToAppointments({ force: true }).catch((err) => {
                console.warn("Sync Google periodique impossible:", err.message);
            });
        }, GOOGLE_CALENDAR_SYNC_INTERVAL_MS);
    } else {
        console.log("Sync Google Calendar desactivee (definir GOOGLE_CALENDAR_ICS_URL).");
    }
});

// Proper DB close on exit
process.on('SIGINT', () => {
  console.log('Fermeture de la base de donnees...');
    if (googleCalendarSyncState.timer) {
        clearInterval(googleCalendarSyncState.timer);
    }
  db.close(() => {
    process.exit(0);
  });
});
