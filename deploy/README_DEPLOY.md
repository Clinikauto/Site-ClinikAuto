# Déploiement ClinikAuto (OVH VPS)

Résumé des étapes pour déployer sur un VPS (Debian/Ubuntu) :

1. Transférer le projet

 - Copier l'archive `mon_projet.tar.gz` ou cloner le repo sur le VPS

2. Installer Node.js et dépendances

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential
sudo npm install -g pm2
```

3. Déployer l'application

```bash
sudo mkdir -p /var/www/clinikauto
sudo chown $USER:$USER /var/www/clinikauto
tar -xzvf mon_projet.tar.gz -C /var/www/clinikauto --strip-components=0
cd /var/www/clinikauto
npm install --production
```

4. Variables d'environnement (ex: `/etc/clinikauto.env`)

```
PORT=3000
JWT_SECRET=supersecret
SMTP_HOST=smtp.example
SMTP_PORT=587
SMTP_USER=... 
SMTP_PASS=...
```

Protéger le fichier :

```bash
sudo chown root:www-data /etc/clinikauto.env
sudo chmod 640 /etc/clinikauto.env
```

5. Systemd service

Copier `deploy/systemd/clinikauto.service` vers `/etc/systemd/system/` puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now clinikauto
sudo journalctl -u clinikauto -f
```

6. Nginx

 - Copier `deploy/nginx/clinikauto.conf` dans `/etc/nginx/sites-available/` puis créer un lien et recharger nginx :

```bash
sudo ln -s /etc/nginx/sites-available/clinikauto.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

7. HTTPS avec Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

8. Sauvegardes

 - Sauvegarder `backend/database.db` régulièrement et stocker hors-serveur.

9. Tests post-déploiement

 - `curl -I http://127.0.0.1:3000/` should return a 200/302.
 - Vérifier pages statiques et fonctionnalités (login, réservations, paiements si activés).
