const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

// Base de données
const db = new sqlite3.Database("./backend/database.db");

// Création table utilisateurs
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
)
`);

// Création table rendez-vous
db.run(`
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    service TEXT,
    date TEXT,
    time TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
)
`);

// Horaires disponibles
const availableHours = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

// Route test - REDIRECTION VERS LOGIN
app.get("/", (req, res) => {
    res.redirect("/login");
});

// Inscription - AVEC CRYPTAGE
app.post("/register", async (req, res) => {
    const { email, password } = req.body;

    try {
        // Crypter le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            "INSERT INTO users (email, password) VALUES (?, ?)",
            [email, hashedPassword],
            function (err) {
                if (err) {
                    return res.status(400).json({ error: "Utilisateur déjà existant" });
                }
                res.json({ message: "Inscription réussie" });
            }
        );
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Connexion - AVEC VÉRIFICATION CRYPTÉE
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        db.get(
            "SELECT * FROM users WHERE email = ?",
            [email],
            async (err, row) => {
                if (!row) {
                    return res.status(401).json({ error: "Identifiants invalides" });
                }

                // Comparer le mot de passe en clair avec le crypté
                const passwordMatch = await bcrypt.compare(password, row.password);

                if (!passwordMatch) {
                    return res.status(401).json({ error: "Identifiants invalides" });
                }

                // Renvoyer l'utilisateur SANS le mot de passe
                const user = {
                    id: row.id,
                    email: row.email
                };

                res.json({ message: "Connexion OK", user });
            }
        );
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Route pour prendre un rendez-vous
app.post("/appointment", (req, res) => {
    const { user_id, service, date, time } = req.body;

    db.run(
        "INSERT INTO appointments (user_id, service, date, time) VALUES (?, ?, ?, ?)",
        [user_id, service, date, time],
        function (err) {
            if (err) {
                return res.status(400).json({ error: "Erreur lors de la prise de RDV" });
            }
            res.json({ message: "Rendez-vous confirmé !", appointment_id: this.lastID });
        }
    );
});

// Route pour voir ses rendez-vous
app.get("/appointments/:user_id", (req, res) => {
    const { user_id } = req.params;

    db.all(
        "SELECT * FROM appointments WHERE user_id = ? ORDER BY date DESC",
        [user_id],
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }
            res.json(rows);
        }
    );
});

// Route pour voir TOUS les rendez-vous (admin)
app.get("/all-appointments", (req, res) => {
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

// Route pour mettre à jour un rendez-vous (confirmer/annuler)
app.put("/appointment/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    db.run(
        "UPDATE appointments SET status = ? WHERE id = ?",
        [status, id],
        function (err) {
            if (err) {
                return res.status(400).json({ error: "Erreur lors de la mise à jour" });
            }
            res.json({ message: "Rendez-vous mis à jour" });
        }
    );
});

// ============ NOUVELLES ROUTES CALENDRIER ============

// Route pour obtenir les horaires disponibles d'une date
app.get("/available-times/:date", (req, res) => {
    const { date } = req.params;

    // Récupérer les rendez-vous de cette date
    db.all(
        "SELECT time FROM appointments WHERE date = ? AND status != 'cancelled'",
        [date],
        (err, rows) => {
            if (err) {
                return res.status(400).json({ error: "Erreur" });
            }

            // Créneaux pris
            const bookedTimes = rows.map(r => r.time);

            // Créneaux disponibles
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

// Route pour obtenir les rendez-vous d'une date (pour le calendrier)
app.get("/appointments-by-date/:date", (req, res) => {
    const { date } = req.params;

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

// Servir les fichiers frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Routes pour les pages HTML
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

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/register.html"));
});

// Lancement serveur
app.listen(3000, () => {
    console.log("Serveur lancé sur http://localhost:3000");
});