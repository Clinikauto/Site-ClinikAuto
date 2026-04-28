# 🚀 Démarrage du serveur ClinikAuto en local

## 📋 Prérequis

- **Node.js** installé (version 16+) - https://nodejs.org/
- **Windows** (le script `.bat` est pour Windows)

## 🎯 Utilisation

### Méthode 1: Fichier batch (FACILE) ⭐ Recommandé

1. **Double-cliquez** sur `start-server-test.bat`
2. Attendez que le navigateur s'ouvre automatiquement
3. Vous êtes redirigé vers http://localhost:3000/

### Méthode 2: Fichier PowerShell (Avancé)

```powershell
powershell -ExecutionPolicy Bypass -File start-server-test.ps1
```

### Méthode 3: Terminal manuel

```bash
cd site-clinikauto-clean
npm install  (première fois seulement)
npm start
```

Puis ouvrez: http://localhost:3000/

---

## 📍 Pages de test

| Page | URL |
|------|-----|
| 🏠 Accueil | http://localhost:3000/ |
| 🔐 Login | http://localhost:3000/frontend/login.html |
| 👤 Espace client | http://localhost:3000/frontend/espace-client.html |
| 📊 Admin | http://localhost:3000/frontend/admin.html |

---

## 👤 Identifiants de test

**Client existant:**
- Email: `looptest_1777363293@test.local`
- Rôle: Client

**Ou créer un nouveau compte** (bouton "S'inscrire")

---

## ⚙️ Endpoints API testables

- **Statut client**: http://localhost:3000/client-onboarding-status?email=looptest_1777363293@test.local
- **Créneaux libres**: http://localhost:3000/available-times?date=2026-04-28
- **Login**: `POST` http://localhost:3000/login

---

## 🛑 Arrêter le serveur

- Fermez la **fenêtre du serveur** (celle qui s'ouvre au lancement)
- Ou appuyez sur **Ctrl+C** dans le terminal

---

## 🆘 Dépannage

### ❌ "Node.js n'est pas installé"
→ Installez Node.js depuis https://nodejs.org/

### ❌ "Le port 3000 est déjà utilisé"
→ Fermez l'autre application utilisant le port 3000, ou modifiez:
   - Dans `backend/server.js`, changez la ligne: `const PORT = 3000` → `const PORT = 3001`

### ❌ "npm install échoue"
→ Supprimez le dossier `node_modules` et réessayez

---

## 📂 Structure du projet

```
site-clinikauto-clean/
├── backend/          ← Serveur Node.js
├── frontend/         ← Pages HTML/CSS/JS
├── clinikauto-agenda/ ← Module PHP (optionnel)
├── start-server-test.bat  ← Script de lancement
└── README-SETUP.md   ← Ce fichier
```

---

## 💡 Conseils

✅ Le serveur reste actif jusqu'à fermeture  
✅ Les changements dans `frontend/` se reflètent en direct  
✅ Ouvrez les outils développeur (F12) pour déboguer  
✅ Vérifiez la console pour les logs du serveur  

---

**ClinikAuto - Garage automobile de confiance** 🔧
