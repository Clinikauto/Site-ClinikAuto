**Audit initial du projet ClinikAuto — 2026-04-29**

Résumé
- Objectif: transformer le projet existant en CRM complet pour la gestion d'un garage (clients, véhicules, interventions, devis, factures, stock, dashboard).
- Ce document présente l'inventaire, problèmes identifiés et recommandations immédiates.

1) Inventaire rapide
- Backend principal: [backend/server.js](backend/server.js) — Express + SQLite, routes et logique métier existante.
- Frontend: dossier `frontend/` — pages HTML statiques, CSS et JS (client side). Voir [frontend/package.json](frontend/package.json).
- API/Serverless utilitaires: `api/` (book.js, stripe-*.js, google-reviews.js).
- Scripts/Tools: `tools/` (load-test.js, local-runner.js, smoke-test.js).
- Déploiement: `Dockerfile`, `docker-compose.yml`, `deploy/` (systemd, nginx, scripts).
- Backups & utilitaires: `scripts/`, `backups/` et `backups/metrics.json`.
- Composer PHP: `clinikauto-agenda/composer.json` (module PHP pour agenda).

2) Dépendances importantes
- `package.json` (racine): bcrypt, express@5.x, sqlite3, raw-body, node-fetch@2, stripe, xlsx.
- Observations: `bcrypt` cause des problèmes d'installation sur Windows (prébuilds) — prévoir `bcryptjs` ou instructions build. `express@5` est installé; vérifier compatibilité des middlewares.
- `frontend/package.json` contient `express` et `sqlite3` (probablement superflu pour la build front-end).

3) Problèmes et risques identifiés
- Installation sur Windows: `bcrypt` prébuild a posé un verrouillage (déjà résolu localement), garder une alternative pour CI Windows.
- JSON malformé: erreurs de parsing détectées; logging persistant ajouté (`backend/logs/malformed-json.log`).
- Manque d'entités DB pour CRM: pas de tables dédiées pour `vehicles`, `interventions`, `invoices`, `quotes`, `parts_stock` — il faut migrer/étendre la schema SQLite.
- Tests: pas ou peu de tests unitaires/E2E; une CI minimale existe mais sera à étendre.
- Frontend: UI statique fragmentée; il faudra un espace admin SPA ou pages admin consolidées pour CRUD.

4) Recommandations immédiates (priorité haute)
- Ajouter migrations/schémas pour les entités CRM (SQLite): `clients`, `vehicles`, `interventions`, `quotes`, `invoices`, `parts`, `stock_movements`.
- Standardiser l'API REST (routes CRUD) sous `backend/api/` ou `backend/routes/` ; implémenter contrôleurs et validations (express + ajouts de middleware).
- Auth & RBAC: mettre en place JWT + rôles (`admin`, `mechanic`, `reception`) et protéger les endpoints CRUD.
- Remplacer (ou fournir fallback) `bcrypt` par `bcryptjs` pour éviter problèmes de build sur Windows/CI, ou documenter installation des outils natifs.
- Nettoyer `frontend/package.json` (supprimer `express`/`sqlite3` si inutiles) et décider architecture frontend (mini-SPA admin en vanilla JS ou intégrer un framework léger).
- Ajouter tests smoke/API plus complets et E2E (ex: Playwright/CDP) dans `.github/workflows/ci.yml`.

5) Prochaines étapes proposées (itératif)
- Phase 1 (1-3 jours): définir schéma DB CRM + écrire migrations + endpoints CRUD basiques pour `clients` et `vehicles`.
- Phase 2 (3-7 jours): UI admin pages pour clients/vehicules + authentification et rôles + tests smoke automatisés.
- Phase 3 (7-14 jours): interventions/devis/factures/stock + importation des données existantes + dashboards analytiques basiques.
- Phase 4: dockerisation complète, CI/CD, sauvegardes et monitoring.

6) Fichiers à examiner/supprimer (suggestions)
- Vérifier et supprimer si obsolètes: fichiers de test locaux non utilisés, `frontend/node_modules/` si présent, archives temporaires dans repo root.
- Corriger `frontend/package.json` si des dépendances serveur y figurent.

Annexes
- Fichiers lus lors de l'audit: [package.json](package.json), [frontend/package.json](frontend/package.json), [backend/server.js](backend/server.js), [clinikauto-agenda/composer.json](clinikauto-agenda/composer.json), `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`.

Si vous validez, j'attaque la Phase 1: proposer le modèle de données SQL (migrations) et implémenter les endpoints CRUD `clients` + `vehicles` sur une branche `feature/crm-schema-clients-vehicles`.
