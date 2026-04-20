// ========== CLINIKAUTO — espace-client.js ==========

const CLIENTS_KEY = 'clinikauto_clients';
const SESSION_KEY = 'clinikauto_client_session';

// ===== UTILS =====
function getClients() {
  try { return JSON.parse(localStorage.getItem(CLIENTS_KEY) || '[]'); } catch { return []; }
}
function saveClients(data) { localStorage.setItem(CLIENTS_KEY, JSON.stringify(data)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function normaliserImmat(v) { return v.toUpperCase().replace(/\s/g,'').replace(/[^A-Z0-9]/g,'-'); }

// Afficher/masquer mot de passe
function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
}

// Hash simple du mot de passe (obfuscation côté client)
function hashPassword(pwd) {
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    hash = ((hash << 5) - hash) + pwd.charCodeAt(i);
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16) + '_' + pwd.length;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('ecToast');
  el.textContent = msg;
  el.className = 'ec-toast ec-toast--' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ===== ONGLETS AUTH =====
function setAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('panelLogin').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('panelRegister').style.display = tab === 'register' ? 'block' : 'none';
  // Reset erreurs
  ['loginError','registerError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ===== CONNEXION =====
function seConnecter() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pwd   = document.getElementById('loginPwd').value;
  const errEl = document.getElementById('loginError');
  const errMsg = document.getElementById('loginErrorMsg');

  if (!email || !pwd) {
    errMsg.textContent = 'Veuillez remplir email et mot de passe.';
    errEl.style.display = 'flex'; return;
  }

  const clients = getClients();
  const client  = clients.find(c => c.email.toLowerCase() === email && c.password === hashPassword(pwd));

  if (!client) {
    errMsg.textContent = 'Email ou mot de passe incorrect.';
    errEl.style.display = 'flex';
    document.getElementById('loginPwd').value = '';
    return;
  }

  errEl.style.display = 'none';
  localStorage.setItem(SESSION_KEY, client.id);
  afficherDashboard(client);
}

// ===== MOT DE PASSE OUBLIÉ =====
function motDePasseOublie() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  if (!email) {
    alert('Entrez d\'abord votre email puis cliquez sur "Mot de passe oublié".');
    return;
  }
  const clients = getClients();
  const client  = clients.find(c => c.email.toLowerCase() === email);
  if (!client) {
    alert('Aucun compte trouvé pour cet email.');
    return;
  }
  // En production, envoyer un vrai email. Ici on affiche un message de contact.
  alert('Contactez ClinikAuto au 06 20 18 56 27 ou à clinikauto74@gmail.com pour réinitialiser votre mot de passe.');
}

// ===== INSCRIPTION =====
function sInscrire() {
  const nom     = document.getElementById('rNom').value.trim();
  const prenom  = document.getElementById('rPrenom').value.trim();
  const tel     = document.getElementById('rTel').value.trim();
  const email   = document.getElementById('rEmail').value.trim().toLowerCase();
  const adresse = document.getElementById('rAdresse').value.trim();
  const pwd     = document.getElementById('rPwd').value;
  const pwd2    = document.getElementById('rPwd2').value;
  const immat   = normaliserImmat(document.getElementById('rImmat').value.trim());
  const marque  = document.getElementById('rMarque').value.trim();
  const modele  = document.getElementById('rModele').value.trim();

  const errEl  = document.getElementById('registerError');
  const errMsg = document.getElementById('registerErrorMsg');

  // Validations
  if (!nom || !prenom || !tel || !email || !adresse || !pwd || !immat || !marque || !modele) {
    errMsg.textContent = 'Veuillez remplir tous les champs obligatoires.';
    errEl.style.display = 'flex'; return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errMsg.textContent = 'Adresse email invalide.';
    errEl.style.display = 'flex'; return;
  }
  if (pwd.length < 6) {
    errMsg.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
    errEl.style.display = 'flex'; return;
  }
  if (pwd !== pwd2) {
    errMsg.textContent = 'Les mots de passe ne correspondent pas.';
    errEl.style.display = 'flex'; return;
  }

  const clients = getClients();

  if (clients.some(c => c.email.toLowerCase() === email)) {
    errMsg.textContent = 'Un compte existe déjà avec cet email.';
    errEl.style.display = 'flex'; return;
  }
  if (clients.some(c => c.vehicules && c.vehicules.some(v => normaliserImmat(v.immat) === immat))) {
    errMsg.textContent = 'Cette immatriculation est déjà enregistrée.';
    errEl.style.display = 'flex'; return;
  }

  const vehicule = {
    id: genId(), immat, marque, modele,
    annee:     document.getElementById('rAnnee').value,
    carburant: document.getElementById('rCarburant').value,
    km:        document.getElementById('rKm').value,
  };

  const client = {
    id: genId(), nom, prenom, tel, email, adresse,
    password: hashPassword(pwd),
    vehicules: [vehicule],
    dateInscription: new Date().toISOString(),
  };

  clients.push(client);
  saveClients(clients);
  errEl.style.display = 'none';
  localStorage.setItem(SESSION_KEY, client.id);
  afficherDashboard(client);
  toast('✅ Compte créé avec succès !');
}

// ===== DASHBOARD =====
function afficherDashboard(client) {
  document.getElementById('screenConnexion').style.display = 'none';
  document.getElementById('screenDashboard').style.display = 'block';
  document.getElementById('dashPrenom').textContent = client.prenom;
  afficherVehicules(client);
  afficherInfos(client);
}

function getClientSession() {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return getClients().find(c => c.id === id) || null;
}

function seDeconnecter() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

// ===== VÉHICULES =====
function afficherVehicules(client) {
  const container = document.getElementById('dashVehicules');
  if (!client.vehicules || client.vehicules.length === 0) {
    container.innerHTML = '<p style="color:var(--grey)">Aucun véhicule enregistré.</p>';
    return;
  }
  container.innerHTML = client.vehicules.map(v => `
    <div class="ec-veh-card">
      <div class="ec-veh-card__immat">${v.immat}</div>
      <div class="ec-veh-card__name">${v.marque} ${v.modele}</div>
      <div class="ec-veh-card__specs">
        ${v.annee     ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-calendar"></i> ${v.annee}</span>` : ''}
        ${v.carburant ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-gas-pump"></i> ${v.carburant}</span>` : ''}
        ${v.km        ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-road"></i> ${Number(v.km).toLocaleString('fr-FR')} km</span>` : ''}
      </div>
      <div class="ec-veh-card__actions">
        <button class="ec-veh-btn ec-veh-btn--edit" onclick="ouvrirModalVehicule('${v.id}')">
          <i class="fa-solid fa-pen"></i> Modifier
        </button>
        ${client.vehicules.length > 1 ? `
        <button class="ec-veh-btn ec-veh-btn--del" onclick="supprimerVehicule('${v.id}')">
          <i class="fa-solid fa-trash"></i> Supprimer
        </button>` : ''}
      </div>
    </div>
  `).join('');
}

function ouvrirModalVehicule(vehId = null) {
  const client = getClientSession();
  if (!client) return;
  document.getElementById('modalVehId').value = vehId || '';
  if (vehId) {
    const v = client.vehicules.find(x => x.id === vehId);
    if (!v) return;
    document.getElementById('modalVehTitre').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier le véhicule';
    document.getElementById('vImmat').value     = v.immat;
    document.getElementById('vMarque').value    = v.marque;
    document.getElementById('vModele').value    = v.modele;
    document.getElementById('vAnnee').value     = v.annee || '';
    document.getElementById('vCarburant').value = v.carburant || '';
    document.getElementById('vKm').value        = v.km || '';
  } else {
    document.getElementById('modalVehTitre').innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter un véhicule';
    ['vImmat','vMarque','vModele','vAnnee','vKm'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('vCarburant').selectedIndex = 0;
  }
  document.getElementById('modalVehicule').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fermerModalVehicule() {
  document.getElementById('modalVehicule').style.display = 'none';
  document.body.style.overflow = '';
}

function sauvegarderVehicule() {
  const immat  = normaliserImmat(document.getElementById('vImmat').value.trim());
  const marque = document.getElementById('vMarque').value.trim();
  const modele = document.getElementById('vModele').value.trim();
  if (!immat || !marque || !modele) { toast('⚠️ Immat, marque et modèle sont requis.', 'error'); return; }

  const clients  = getClients();
  const clientId = localStorage.getItem(SESSION_KEY);
  const idx      = clients.findIndex(c => c.id === clientId);
  if (idx === -1) return;

  const vehId = document.getElementById('modalVehId').value;
  const veh = {
    id: vehId || genId(), immat, marque, modele,
    annee:     document.getElementById('vAnnee').value,
    carburant: document.getElementById('vCarburant').value,
    km:        document.getElementById('vKm').value,
  };

  if (vehId) {
    const vi = clients[idx].vehicules.findIndex(v => v.id === vehId);
    if (vi !== -1) clients[idx].vehicules[vi] = veh;
    toast('✅ Véhicule modifié !');
  } else {
    const doublon = clients.some((c, i) => i !== idx && c.vehicules && c.vehicules.some(v => normaliserImmat(v.immat) === immat));
    if (doublon) { toast('⚠️ Immatriculation déjà enregistrée.', 'error'); return; }
    clients[idx].vehicules.push(veh);
    toast('✅ Véhicule ajouté !');
  }

  saveClients(clients);
  fermerModalVehicule();
  afficherVehicules(clients[idx]);
}

function supprimerVehicule(vehId) {
  if (!confirm('Supprimer ce véhicule ?')) return;
  const clients  = getClients();
  const clientId = localStorage.getItem(SESSION_KEY);
  const idx      = clients.findIndex(c => c.id === clientId);
  if (idx === -1) return;
  clients[idx].vehicules = clients[idx].vehicules.filter(v => v.id !== vehId);
  saveClients(clients);
  afficherVehicules(clients[idx]);
  toast('🗑️ Véhicule supprimé');
}

// ===== INFOS CLIENT =====
function afficherInfos(client) {
  document.getElementById('infosDisplay').innerHTML = `
    <div class="ec-info-item"><span>Nom</span><strong>${client.nom}</strong></div>
    <div class="ec-info-item"><span>Prénom</span><strong>${client.prenom}</strong></div>
    <div class="ec-info-item"><span>Portable</span><strong>${client.tel}</strong></div>
    <div class="ec-info-item"><span>Email</span><strong>${client.email}</strong></div>
    <div class="ec-info-item" style="grid-column:1/-1"><span>Adresse</span><strong>${client.adresse}</strong></div>
  `;
}

function toggleEditInfos() {
  const display = document.getElementById('infosDisplay');
  const form    = document.getElementById('infosForm');
  const client  = getClientSession();
  const isOpen  = form.style.display !== 'none';
  if (isOpen) {
    form.style.display    = 'none';
    display.style.display = 'grid';
    document.getElementById('btnEditInfos').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier';
  } else {
    document.getElementById('eNom').value     = client.nom;
    document.getElementById('ePrenom').value  = client.prenom;
    document.getElementById('eTel').value     = client.tel;
    document.getElementById('eEmail').value   = client.email;
    document.getElementById('eAdresse').value = client.adresse;
    form.style.display    = 'grid';
    display.style.display = 'none';
    document.getElementById('btnEditInfos').innerHTML = '<i class="fa-solid fa-xmark"></i> Annuler';
  }
}

function sauvegarderInfos() {
  const nom     = document.getElementById('eNom').value.trim();
  const prenom  = document.getElementById('ePrenom').value.trim();
  const tel     = document.getElementById('eTel').value.trim();
  const email   = document.getElementById('eEmail').value.trim().toLowerCase();
  const adresse = document.getElementById('eAdresse').value.trim();
  const newPwd  = document.getElementById('eNewPwd').value;
  const newPwd2 = document.getElementById('eNewPwd2').value;

  if (!nom || !prenom || !tel || !email || !adresse) { toast('⚠️ Tous les champs sont requis.', 'error'); return; }

  if (newPwd) {
    if (newPwd.length < 6) { toast('⚠️ Mot de passe trop court (6 min).', 'error'); return; }
    if (newPwd !== newPwd2) { toast('⚠️ Les mots de passe ne correspondent pas.', 'error'); return; }
  }

  const clients  = getClients();
  const clientId = localStorage.getItem(SESSION_KEY);
  const idx      = clients.findIndex(c => c.id === clientId);
  if (idx === -1) return;

  clients[idx] = { ...clients[idx], nom, prenom, tel, email, adresse };
  if (newPwd) clients[idx].password = hashPassword(newPwd);

  saveClients(clients);
  document.getElementById('dashPrenom').textContent = prenom;
  afficherInfos(clients[idx]);
  toggleEditInfos();
  toast('✅ Informations mises à jour !');
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  const client = getClientSession();
  if (client) afficherDashboard(client);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fermerModalVehicule(); });
});
