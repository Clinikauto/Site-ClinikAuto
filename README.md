# ClinikAuto — Site Web du Garage

Site web complet pour le garage **ClinikAuto** situé à Scionzier (74950, Haute-Savoie).

## Description

ClinikAuto est un garage familial proposant des services de réparation, entretien, lavage, vente de pneus et de véhicules d'occasion. Ce site web inclut :

- Une **page d'accueil** vitrine complète avec toutes les sections (À propos, Services, Tarifs, Galerie, Avis, Contact)
- Une **page Occasions** pour les annonces de véhicules et pièces d'occasion
- Un **espace client** avec authentification, gestion du profil et des véhicules
- Un **système de prise de RDV** avec calendrier interactif
- Une **interface administrateur** sécurisée par code

## Stack Technique

| Couche     | Technologies                        |
|------------|-------------------------------------|
| Frontend   | HTML5, CSS3, JavaScript (Vanilla)   |
| Backend    | Node.js, Express                    |
| Base de données | SQLite (via sqlite3)           |
| Sécurité   | bcrypt (hachage des mots de passe)  |
| Fonts      | Google Fonts (Bebas Neue + Nunito)  |
| Icônes     | Font Awesome 6.5                    |

## Démarrage rapide

### Prérequis

- [Node.js](https://nodejs.org/) v16 ou supérieur

### Installation

```bash
# Installer les dépendances
npm install

# Démarrer le serveur
node backend/server.js
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## Structure des dossiers

```
Site-ClinikAuto/
├── backend/
│   └── server.js          # Serveur Express + routes API
├── frontend/
│   ├── CSS/
│   │   ├── style.css          # CSS principal (page d'accueil)
│   │   ├── occasions.css      # CSS page occasions
│   │   └── espace-client.css  # CSS espace client
│   ├── js/
│   │   ├── main.js            # JS principal (burger menu, etc.)
│   │   ├── occasions.js       # JS gestion des annonces
│   │   └── espace-client.js   # JS espace client
│   ├── images/                # Logo et photos du garage
│   ├── index.html             # Page d'accueil principale
│   ├── occasions.html         # Page annonces occasions
│   ├── espace-client.html     # Espace client (login + dashboard)
│   ├── login.html             # Connexion simple
│   ├── register.html          # Inscription
│   ├── dashboard.html         # Tableau de bord client
│   ├── appointment.html       # Prise de rendez-vous
│   └── admin.html             # Interface administrateur
├── package.json
└── README.md
```

## Pages disponibles

| URL            | Description                              |
|----------------|------------------------------------------|
| `/`            | Redirige vers `/login`                   |
| `index.html`   | Page d'accueil principale (accès direct) |
| `/login`       | Connexion utilisateur                    |
| `/register`    | Création de compte                       |
| `/dashboard`   | Tableau de bord client (auth requise)    |
| `/appointment` | Prise de rendez-vous (auth requise)      |
| `/admin`       | Interface admin (code admin requis)      |
| `occasions.html` | Annonces véhicules & pièces d'occasion |
| `espace-client.html` | Espace client complet (localStorage) |

## Variables d'environnement

Créez un fichier `.env` à la racine pour personnaliser la configuration :

```env
ADMIN_CODE=clinikauto2025
```

| Variable     | Description                        | Défaut          |
|--------------|------------------------------------|-----------------|
| `ADMIN_CODE` | Code d'accès à l'interface admin   | `clinikauto2025`|

## Accès administrateur

Pour accéder à l'interface admin :

1. Aller sur `/login?admin=1`
2. Se connecter avec un compte utilisateur
3. Saisir le code administrateur (`clinikauto2025` par défaut)
4. Redirection automatique vers `/admin`

## Contact

**ClinikAuto** — 118 Clos des Teppes, 74950 Scionzier  
📞 06 20 18 56 27  
📧 clinikauto74@gmail.com
