// ========== CLINIKAUTO - espace-client.js ==========

const SESSION_KEY = 'clinikauto_client_session';
const TOKEN_KEY = 'token';
const SESSION_TOKEN_KEY = 'clinikauto_client_token';
const IMPERSONATION_TOKEN_KEY = 'clinikauto_client_impersonation_token';
const SESSION_OK_HASH = 'session-ok';
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

let currentClient = null;
let currentAppointments = [];
let loginInFlight = false;
let runtimeToken = '';

// ===== UTILS =====
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function normaliserImmat(v) {
  return String(v || '').toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '-');
}
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function authHeaders() {
  const token = sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)
    || localStorage.getItem(TOKEN_KEY)
    || sessionStorage.getItem(SESSION_TOKEN_KEY)
    || runtimeToken
    || '';
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
}

function persistClientToken(token) {
  const value = String(token || '');
  runtimeToken = value;
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch (_err) {
    // Ignore localStorage failure (mode privé, restrictions navigateur, etc.)
  }
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, value);
  } catch (_err) {
    // Ignore sessionStorage failure silently.
  }
}

function clearClientToken() {
  runtimeToken = '';
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (_err) {
  }
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (_err) {
  }
}

async function postJson(url, payload) {
  const response = await fetch(API_BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

async function apiAuth(url, method = 'GET', payload = null) {
  const response = await fetch(API_BASE + url, {
    method,
    headers: authHeaders(),
    body: payload ? JSON.stringify(payload) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'Erreur serveur');
    err.status = response.status;
    throw err;
  }
  return data;
}

function setAuthenticatedUI(isAuthenticated) {
  const screenConnexion = document.getElementById('screenConnexion');
  const screenDashboard = document.getElementById('screenDashboard');
  if (!screenConnexion || !screenDashboard) {
    return;
  }

  screenConnexion.classList.toggle('is-hidden', isAuthenticated);
  screenDashboard.classList.toggle('is-hidden', !isAuthenticated);
  screenConnexion.style.display = isAuthenticated ? 'none' : 'block';
  screenDashboard.style.display = isAuthenticated ? 'block' : 'none';
}

async function loadMyProfile() {
  currentClient = await apiAuth('/me/profile');
  return currentClient;
}

async function saveMyProfile(payload) {
  await apiAuth('/me/profile', 'PUT', payload);
  return loadMyProfile();
}

async function loadMyAppointments() {
  const userId = Number(currentClient && currentClient.user_id);
  if (!Number.isFinite(userId)) {
    currentAppointments = [];
    return currentAppointments;
  }
  currentAppointments = await apiAuth('/appointments/' + userId);
  return currentAppointments;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('ecToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'ec-toast ec-toast--' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 3500);
}

// Afficher/masquer mot de passe
function togglePwd(inputId, btn) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden
    ? '<i class="fa-solid fa-eye-slash"></i>'
    : '<i class="fa-solid fa-eye"></i>';
}

// ===== ONGLETS AUTH =====
function setAuthTab(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('panelLogin').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('panelRegister').style.display = tab === 'register' ? 'block' : 'none';
  ['loginError', 'registerError'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ===== CONNEXION =====
async function seConnecter() {
  if (loginInFlight) {
    return;
  }

  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pwd = document.getElementById('loginPwd').value;
  const errEl = document.getElementById('loginError');
  const errMsg = document.getElementById('loginErrorMsg');
  const loginBtn = document.querySelector('#panelLogin .btn--primary');

  if (!email || !pwd) {
    errMsg.textContent = 'Veuillez remplir email et mot de passe.';
    errEl.style.display = 'flex';
    return;
  }

  loginInFlight = true;
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.style.opacity = '0.7';
    loginBtn.style.cursor = 'wait';
  }

  // Étape 1 : tentative de connexion (seules erreurs = mauvais identifiants / compte bloqué / réseau)
  let loginData;
  try {
    loginData = await postJson('/login', { email, password: pwd });
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (msg && /bloqu/i.test(msg)) {
      errMsg.textContent = msg;
    } else if (!msg || /fetch|network|Failed/i.test(msg)) {
      errMsg.textContent = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    } else {
      errMsg.textContent = 'Email ou mot de passe incorrect.';
    }
    errEl.style.display = 'flex';
    document.getElementById('loginPwd').value = '';
    loginInFlight = false;
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.style.opacity = '';
      loginBtn.style.cursor = '';
    }
    return;
  }

  if (loginData.user.role === 'admin') {
    loginInFlight = false;
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.style.opacity = '';
      loginBtn.style.cursor = '';
    }
    window.location.href = 'admin.html';
    return;
  }

  // Étape 2 : login OK → stocker le token et basculer immédiatement vers le dashboard.
  persistClientToken(loginData.token);
  sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
  localStorage.setItem(SESSION_KEY, String(loginData.user.id));
  localStorage.removeItem('user');
  localStorage.removeItem('clinikauto_clients');

  errEl.style.display = 'none';
  setAuthenticatedUI(true);
  document.getElementById('dashPrenom').textContent = (loginData.user.name || '').split(' ')[0];

  // Étape 3 : charger le profil complet en arrière-plan (échec non bloquant)
  try {
    await loadMyProfile();
    await loadMyAppointments();
    document.getElementById('dashPrenom').textContent = currentClient.prenom || (loginData.user.name || '').split(' ')[0];
    afficherVehicules(currentClient);
    afficherInfos(currentClient);
    afficherInterventions(currentAppointments);
  } catch (_profileErr) {
    // Profil non chargé — afficher données minimales sans bloquer
    afficherVehicules({ vehicules: [] });
    afficherInfos({ nom: '', prenom: '', tel: '', email: loginData.user.email, adresse: '' });
    afficherInterventions([]);
  } finally {
    loginInFlight = false;
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.style.opacity = '';
      loginBtn.style.cursor = '';
    }
  }
}

// ===== MOT DE PASSE OUBLIÉ =====
function motDePasseOublie() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  if (!email) {
    alert('Entrez d\'abord votre email puis cliquez sur "Mot de passe oublié".');
    return;
  }
  alert('Contactez ClinikAuto au 06 20 18 56 27 ou à clinikauto74@gmail.com pour réinitialiser votre mot de passe.');
}

// ===== INSCRIPTION =====
async function sInscrire() {
  const nom = document.getElementById('rNom').value.trim();
  const prenom = document.getElementById('rPrenom').value.trim();
  const tel = document.getElementById('rTel').value.trim();
  const email = document.getElementById('rEmail').value.trim().toLowerCase();
  const adresse = document.getElementById('rAdresse').value.trim();
  const pwd = document.getElementById('rPwd').value;
  const pwd2 = document.getElementById('rPwd2').value;
  const immat = normaliserImmat(document.getElementById('rImmat').value.trim());
  const marque = document.getElementById('rMarque').value.trim();
  const modele = document.getElementById('rModele').value.trim();

  const errEl = document.getElementById('registerError');
  const errMsg = document.getElementById('registerErrorMsg');

  if (!nom || !prenom || !tel || !email || !adresse || !pwd || !immat || !marque || !modele) {
    errMsg.textContent = 'Veuillez remplir tous les champs obligatoires.';
    errEl.style.display = 'flex';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errMsg.textContent = 'Adresse email invalide.';
    errEl.style.display = 'flex';
    return;
  }
  if (pwd.length < 6) {
    errMsg.textContent = 'Le mot de passe doit contenir au moins 6 caractères.';
    errEl.style.display = 'flex';
    return;
  }
  if (pwd !== pwd2) {
    errMsg.textContent = 'Les mots de passe ne correspondent pas.';
    errEl.style.display = 'flex';
    return;
  }

  const vehicule = {
    id: genId(),
    immat,
    marque,
    modele,
    annee: document.getElementById('rAnnee').value,
    carburant: document.getElementById('rCarburant').value,
    km: document.getElementById('rKm').value
  };

  try {
    await postJson('/register', { email, password: pwd, name: prenom + ' ' + nom });
    const data = await postJson('/login', { email, password: pwd });

    persistClientToken(data.token);
    sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
    localStorage.setItem(SESSION_KEY, String(data.user.id));
    localStorage.removeItem('user');
    localStorage.removeItem('clinikauto_clients');

    await saveMyProfile({
      nom,
      prenom,
      tel,
      email,
      adresse,
      vehicules: [vehicule]
    });
    await loadMyAppointments();

    errEl.style.display = 'none';
    afficherDashboard(currentClient);
    toast('Compte créé avec succès !');
  } catch (err) {
    errMsg.textContent = err.message || 'Erreur lors de la création du compte.';
    errEl.style.display = 'flex';
  }
}

// ===== DASHBOARD =====
function afficherDashboard(client) {
  setAuthenticatedUI(true);
  document.getElementById('dashPrenom').textContent = client.prenom || '';
  afficherVehicules(client);
  afficherInfos(client);
  afficherInterventions(currentAppointments);
}

function formatDateTimeFr(dateValue, timeValue) {
  const raw = timeValue ? String(dateValue || '') + 'T' + String(timeValue || '') + ':00' : String(dateValue || '');
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return [dateValue, timeValue].filter(Boolean).join(' ');
  }
  return date.toLocaleDateString('fr-FR') + (timeValue ? ' a ' + timeValue : '');
}

function afficherInterventions(appointments) {
  const container = document.getElementById('dashInterventions');
  if (!container) {
    return;
  }

  const rows = Array.isArray(appointments) ? appointments : [];
  const completed = rows
    .filter((appointment) => (appointment.status || 'pending') === 'completed')
    .sort((a, b) => {
      const left = new Date((a.completed_at || a.date || '') + 'T' + (a.time || '00:00') + ':00').getTime();
      const right = new Date((b.completed_at || b.date || '') + 'T' + (b.time || '00:00') + ':00').getTime();
      return right - left;
    });

  if (!completed.length) {
    container.innerHTML = '<p class="ec-empty-note">Aucune prestation effectuee n\'est encore disponible.</p>';
    return;
  }

  container.innerHTML = completed.map((appointment) => {
    const summary = String(appointment.completion_summary || 'Prestation realisee en atelier ClinikAuto.').trim();
    const completedLabel = appointment.completed_at
      ? new Date(appointment.completed_at).toLocaleString('fr-FR')
      : formatDateTimeFr(appointment.date, appointment.time);
    return `
      <article class="ec-int-card">
        <div class="ec-int-card__head">
          <div class="ec-int-card__title">${escapeHtml(appointment.service || 'Prestation atelier')}</div>
          <span class="ec-int-chip"><i class="fa-solid fa-circle-check"></i> Terminee</span>
        </div>
        <div class="ec-int-meta">Rendez-vous du ${escapeHtml(formatDateTimeFr(appointment.date, appointment.time))}</div>
        <div class="ec-int-meta">Cloturee le ${escapeHtml(completedLabel)}</div>
        <div class="ec-int-summary">${escapeHtml(summary)}</div>
      </article>
    `;
  }).join('');
}

function seDeconnecter() {
  const confirmLogout = window.confirm(
    'Voulez-vous vraiment vous déconnecter ?\n\n'
    + 'Oui: enregistrer les changements et fermer la session.\n'
    + 'Non: annuler la commande et garder la session ouverte.'
  );
  if (!confirmLogout) {
    toast('Déconnexion annulée.', 'success');
    return;
  }

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('user');
  clearClientToken();
  sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
  location.reload();
}

// ===== VEHICULES =====
function afficherVehicules(client) {
  const container = document.getElementById('dashVehicules');
  const vehicules = Array.isArray(client.vehicules) ? client.vehicules : [];
  if (vehicules.length === 0) {
    container.innerHTML = '<p class="ec-empty-note">Aucun véhicule enregistré.</p>';
    return;
  }
  container.innerHTML = vehicules.map((v) => `
    <div class="ec-veh-card">
      <div class="ec-veh-card__immat">${escapeHtml(v.immat)}</div>
      <div class="ec-veh-card__name">${escapeHtml(v.marque)} ${escapeHtml(v.modele)}</div>
      <div class="ec-veh-card__specs">
        ${v.annee ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-calendar"></i> ${escapeHtml(v.annee)}</span>` : ''}
        ${v.carburant ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-gas-pump"></i> ${escapeHtml(v.carburant)}</span>` : ''}
        ${v.km ? `<span class="ec-veh-card__spec"><i class="fa-solid fa-road"></i> ${Number(v.km).toLocaleString('fr-FR')} km</span>` : ''}
      </div>
      <div class="ec-veh-card__actions">
        <button class="ec-veh-btn ec-veh-btn--edit" onclick="ouvrirModalVehicule('${escapeHtml(v.id)}')">
          <i class="fa-solid fa-pen"></i> Modifier
        </button>
        ${vehicules.length > 1 ? `
        <button class="ec-veh-btn ec-veh-btn--del" onclick="supprimerVehicule('${escapeHtml(v.id)}')">
          <i class="fa-solid fa-trash"></i> Supprimer
        </button>` : ''}
      </div>
    </div>
  `).join('');
}

function ouvrirModalVehicule(vehId = null) {
  const client = currentClient;
  if (!client) return;

  document.getElementById('modalVehId').value = vehId || '';
  if (vehId) {
    const v = (client.vehicules || []).find((x) => x.id === vehId);
    if (!v) return;
    document.getElementById('modalVehTitre').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier le véhicule';
    document.getElementById('vImmat').value = v.immat || '';
    document.getElementById('vMarque').value = v.marque || '';
    document.getElementById('vModele').value = v.modele || '';
    document.getElementById('vAnnee').value = v.annee || '';
    document.getElementById('vCarburant').value = v.carburant || '';
    document.getElementById('vKm').value = v.km || '';
  } else {
    document.getElementById('modalVehTitre').innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter un véhicule';
    ['vImmat', 'vMarque', 'vModele', 'vAnnee', 'vKm'].forEach((id) => { document.getElementById(id).value = ''; });
    document.getElementById('vCarburant').selectedIndex = 0;
  }

  document.getElementById('modalVehicule').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fermerModalVehicule() {
  document.getElementById('modalVehicule').style.display = 'none';
  document.body.style.overflow = '';
}

async function sauvegarderVehicule() {
  const immat = normaliserImmat(document.getElementById('vImmat').value.trim());
  const marque = document.getElementById('vMarque').value.trim();
  const modele = document.getElementById('vModele').value.trim();
  if (!immat || !marque || !modele) {
    toast('Immat, marque et modèle sont requis.', 'error');
    return;
  }

  const vehId = document.getElementById('modalVehId').value;
  const veh = {
    id: vehId || genId(),
    immat,
    marque,
    modele,
    annee: document.getElementById('vAnnee').value,
    carburant: document.getElementById('vCarburant').value,
    km: document.getElementById('vKm').value
  };

  const vehicules = Array.isArray(currentClient.vehicules) ? [...currentClient.vehicules] : [];
  if (vehId) {
    const idx = vehicules.findIndex((v) => v.id === vehId);
    if (idx !== -1) vehicules[idx] = veh;
  } else {
    const doublon = vehicules.some((v) => normaliserImmat(v.immat) === immat);
    if (doublon) {
      toast('Immatriculation déjà enregistrée.', 'error');
      return;
    }
    vehicules.push(veh);
  }

  try {
    await saveMyProfile({
      nom: currentClient.nom,
      prenom: currentClient.prenom,
      tel: currentClient.tel,
      email: currentClient.email,
      adresse: currentClient.adresse,
      vehicules
    });
    fermerModalVehicule();
    afficherVehicules(currentClient);
    toast(vehId ? 'Véhicule modifié !' : 'Véhicule ajouté !');
  } catch (err) {
    toast(err.message || 'Mise à jour véhicule impossible.', 'error');
  }
}

async function supprimerVehicule(vehId) {
  if (!confirm('Supprimer ce véhicule ?')) return;
  const vehicules = (currentClient.vehicules || []).filter((v) => v.id !== vehId);
  try {
    await saveMyProfile({
      nom: currentClient.nom,
      prenom: currentClient.prenom,
      tel: currentClient.tel,
      email: currentClient.email,
      adresse: currentClient.adresse,
      vehicules
    });
    afficherVehicules(currentClient);
    toast('Véhicule supprimé');
  } catch (err) {
    toast(err.message || 'Suppression impossible.', 'error');
  }
}

// ===== INFOS CLIENT =====
function afficherInfos(client) {
  const isIncomplete = client.is_complete === false;
  const missingFields = Array.isArray(client.missing_fields) ? client.missing_fields : [];
  document.getElementById('infosDisplay').innerHTML = `
    ${isIncomplete ? `<div style="grid-column:1/-1;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 14px;color:#8a4b00;font-size:0.9rem;margin-bottom:4px;">
      <i class="fa-solid fa-triangle-exclamation"></i> <strong>Fiche incomplète</strong> — Merci de compléter : ${missingFields.join(', ')}
    </div>` : ''}
    <div class="ec-info-item"><span>Nom</span><strong>${escapeHtml(client.nom) || '<em style="color:#b91c1c">Non renseigné</em>'}</strong></div>
    <div class="ec-info-item"><span>Prénom</span><strong>${escapeHtml(client.prenom) || '<em style="color:#b91c1c">Non renseigné</em>'}</strong></div>
    <div class="ec-info-item"><span>Portable</span><strong>${escapeHtml(client.tel) || '<em style="color:#b91c1c">Non renseigné</em>'}</strong></div>
    <div class="ec-info-item"><span>Email</span><strong>${escapeHtml(client.email) || '<em style="color:#b91c1c">Non renseigné</em>'}</strong></div>
    <div class="ec-info-item ec-info-item--full"><span>Adresse</span><strong>${escapeHtml(client.adresse) || '<em style="color:#b91c1c">Non renseigné</em>'}</strong></div>
  `;
}

function toggleEditInfos() {
  const display = document.getElementById('infosDisplay');
  const form = document.getElementById('infosForm');
  const client = currentClient;
  const isOpen = form.style.display !== 'none';
  if (isOpen) {
    form.style.display = 'none';
    display.style.display = 'grid';
    document.getElementById('btnEditInfos').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier';
  } else {
    document.getElementById('eNom').value = client.nom || '';
    document.getElementById('ePrenom').value = client.prenom || '';
    document.getElementById('eTel').value = client.tel || '';
    document.getElementById('eEmail').value = client.email || '';
    document.getElementById('eAdresse').value = client.adresse || '';
    form.style.display = 'grid';
    display.style.display = 'none';
    document.getElementById('btnEditInfos').innerHTML = '<i class="fa-solid fa-xmark"></i> Annuler';
  }
}

async function sauvegarderInfos() {
  const nom = document.getElementById('eNom').value.trim();
  const prenom = document.getElementById('ePrenom').value.trim();
  const tel = document.getElementById('eTel').value.trim();
  const email = document.getElementById('eEmail').value.trim().toLowerCase();
  const adresse = document.getElementById('eAdresse').value.trim();
  const newPwd = document.getElementById('eNewPwd').value;
  const newPwd2 = document.getElementById('eNewPwd2').value;

  if (!nom || !prenom || !tel || !email || !adresse) {
    toast('Tous les champs sont requis.', 'error');
    return;
  }
  if (newPwd || newPwd2) {
    toast('La modification du mot de passe se fait via la page de connexion.', 'error');
    return;
  }

  try {
    await saveMyProfile({
      nom,
      prenom,
      tel,
      email,
      adresse,
      vehicules: currentClient.vehicules || []
    });
    document.getElementById('dashPrenom').textContent = prenom;
    afficherInfos(currentClient);
    toggleEditInfos();
    toast('Informations mises à jour !');
  } catch (err) {
    toast(err.message || 'Mise à jour impossible.', 'error');
  }
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  setAuthenticatedUI(false);

  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  const hashParams = new URLSearchParams(hash);
  const hasSessionOk = hash === SESSION_OK_HASH || hashParams.get('session') === 'ok';
  const tokenFromHash = String(hashParams.get('token') || '').trim();
  const impersonationToken = hashParams.get('impersonate');

  if (tokenFromHash) {
    persistClientToken(tokenFromHash);
  }

  if (impersonationToken || hasSessionOk) {
    // Nettoyer le hash d'URL après lecture du marqueur de session/impersonation.
    if (impersonationToken) {
      sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, impersonationToken);
    }
    if (!impersonationToken) {
      sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  const token = sessionStorage.getItem(IMPERSONATION_TOKEN_KEY)
    || localStorage.getItem(TOKEN_KEY)
    || sessionStorage.getItem(SESSION_TOKEN_KEY)
    || runtimeToken;

  // Si la session vient d'être validée, forcer l'affichage du dashboard avant les appels réseau.
  if (token && hasSessionOk) {
    setAuthenticatedUI(true);
  }

  if (token) {
    try {
      await loadMyProfile();
      await loadMyAppointments();
      afficherDashboard(currentClient);
    } catch (err) {
      const status = Number(err && err.status);
      // Ne réinitialiser la session que si le token est réellement invalide / interdit.
      if (status === 401 || status === 403) {
        sessionStorage.removeItem(IMPERSONATION_TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('user');
        clearClientToken();
        setAuthenticatedUI(false);
      } else {
        // Erreur technique temporaire: garder la session pour éviter une boucle retour connexion.
        setAuthenticatedUI(true);
      }
    }
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fermerModalVehicule();
  });
});
