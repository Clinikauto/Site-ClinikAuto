Clinik-Auto — backend serverless (branche feature/backend)

Contenu :
- api/book.js
- api/stripe-session.js
- api/stripe-webhook.js
- api/google-reviews.js

Dépendances : npm install

Variables d'environnement à configurer (Vercel -> Settings -> Environment Variables):
- STRIPE_SECRET_KEY
- STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- GOOGLE_PLACES_KEY
- PLACE_ID (optionnel)
- NOTIFY_EMAIL (optionnel)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (optionnel)

Instructions rapide :
1) npm install
2) vercel dev  (pour tester localement)
3) git checkout -b feature/backend
4) git add api package.json README-backend.md
5) git commit -m "Add backend serverless functions (book, stripe, reviews)"
6) git push origin feature/backend
7) Ouvrir une Pull Request sur GitHub (ou utilisez 'gh pr create' si vous avez GitHub CLI)
