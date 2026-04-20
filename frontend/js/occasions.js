// ========== CLINIKAUTO — occasions.js ==========

const OCC_KEY        = 'clinikauto_annonces';
const GARAGE_LAT     = 46.0452;
const GARAGE_LNG     = 6.5134;
const GARAGE_ADRESSE = '118 Clos des Teppes, 74950 Scionzier';

// ===== UTILS =====
function chargerAnnonces() {
  try { return JSON.parse(localStorage.getItem(OCC_KEY) || '[]'); } catch { return []; }
}

function formatPrix(prix) {
  if (!prix || prix === '0') return 'Prix sur demande';
  return Number(prix).toLocaleString('fr-FR') + ' \u20ac';
}

// Retourne le tableau de photos d'une annonce (compatibilité ancien format)
function getPhotos(a) {
  let photos = [];
  if (Array.isArray(a.photos) && a.photos.length > 0) {
    photos = a.photos.filter(Boolean);
  } else if (a.image) {
    photos = [a.image];
  }
  return photos;
}

// ===== GALERIE =====
const galState = {};

function genGalerie(photos, id) {
  if (!photos || photos.length === 0) {
    return '<div class="gal-placeholder"><i class="fa-solid fa-image"></i></div>';
  }
  if (photos.length === 1) {
    return '<div class="gal-single"><img src="' + photos[0] + '" alt="Photo" onerror="this.parentElement.innerHTML=\'<div class=gal-placeholder><i class=fa-solid\\ fa-image></i></div>\'" /></div>';
  }
  var slides = photos.map(function(p, i) {
    return '<img src="' + p + '" alt="Photo ' + (i+1) + '" class="gal-slide" onerror="this.style.display=\'none\'" />';
  }).join('');
  var dots = photos.map(function(_, i) {
    return '<span class="gal-dot' + (i === 0 ? ' active' : '') + '" data-gal="' + id + '" data-idx="' + i + '"></span>';
  }).join('');
  galState[id] = 0;
  return '<div class="gal-slider" id="' + id + '">' +
    '<div class="gal-track" id="' + id + '-track">' + slides + '</div>' +
    '<button class="gal-btn gal-btn--prev" data-gal="' + id + '" data-dir="-1"><i class="fa-solid fa-chevron-left"></i></button>' +
    '<button class="gal-btn gal-btn--next" data-gal="' + id + '" data-dir="1"><i class="fa-solid fa-chevron-right"></i></button>' +
    '<div class="gal-dots" id="' + id + '-dots">' + dots + '</div>' +
    '</div>';
}

function slideGal(id, dir) {
  var track = document.getElementById(id + '-track');
  if (!track) return;
  var total = track.children.length;
  if (!galState[id]) galState[id] = 0;
  galState[id] = (galState[id] + dir + total) % total;
  track.style.transform = 'translateX(-' + (galState[id] * 100) + '%)';
  document.querySelectorAll('#' + id + '-dots .gal-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === galState[id]);
  });
}

function goSlide(id, idx) {
  galState[id] = idx;
  var track = document.getElementById(id + '-track');
  if (!track) return;
  track.style.transform = 'translateX(-' + (idx * 100) + '%)';
  document.querySelectorAll('#' + id + '-dots .gal-dot').forEach(function(d, i) {
    d.classList.toggle('active', i === idx);
  });
}

// Délégation d'événements pour les galeries (évite les problèmes onclick dans innerHTML)
document.addEventListener('click', function(e) {
  // Bouton prev/next galerie
  var btn = e.target.closest('.gal-btn');
  if (btn) {
    var galId = btn.dataset.gal;
    var dir   = parseInt(btn.dataset.dir);
    slideGal(galId, dir);
    return;
  }
  // Point de navigation galerie
  var dot = e.target.closest('.gal-dot');
  if (dot) {
    goSlide(dot.dataset.gal, parseInt(dot.dataset.idx));
    return;
  }
});

// ===== CARTE ANNONCE =====
function genererCarte(a) {
  var vendu  = a.statut === 'vendu';
  var photos = getPhotos(a);

  var imgHtml = photos.length > 0
    ? '<img src="' + photos[0] + '" alt="' + a.titre + '" loading="lazy" onerror="this.style.display=\'none\'" />'
    : '<div class="occ-card__img-placeholder"><i class="fa-solid fa-' + (a.type === 'voiture' ? 'car' : 'gears') + '"></i></div>';

  var metaHtml = '';
  if (a.type === 'voiture') {
    if (a.annee)     metaHtml += '<span><i class="fa-solid fa-calendar"></i> ' + a.annee + '</span>';
    if (a.km)        metaHtml += '<span><i class="fa-solid fa-road"></i> ' + Number(a.km).toLocaleString('fr-FR') + ' km</span>';
    if (a.carburant) metaHtml += '<span><i class="fa-solid fa-gas-pump"></i> ' + a.carburant + '</span>';
    if (a.boite)     metaHtml += '<span><i class="fa-solid fa-gear"></i> ' + a.boite + '</span>';
  } else {
    if (a.etat)      metaHtml += '<span><i class="fa-solid fa-star"></i> ' + a.etat + '</span>';
    if (a.reference) metaHtml += '<span><i class="fa-solid fa-barcode"></i> R\u00e9f: ' + a.reference + '</span>';
  }

  var photoBadge = photos.length > 1
    ? '<span class="occ-card__photo-count"><i class="fa-solid fa-images"></i> ' + photos.length + '</span>'
    : '';

  var btnReserv = !vendu
    ? '<button class="occ-card__btn occ-card__btn--reserv" data-reserv="' + a.id + '"><i class="fa-solid fa-calendar-check"></i> R\u00e9server</button>'
    : '';

  return '<div class="occ-card" data-id="' + a.id + '" data-type="' + a.type + '">' +
    '<div class="occ-card__img" data-modal="' + a.id + '">' +
    imgHtml +
    '<span class="occ-card__badge occ-card__badge--' + a.type + '">' + (a.type === 'voiture' ? 'V\u00e9hicule' : 'Pi\u00e8ce') + '</span>' +
    (vendu ? '<span class="occ-card__badge occ-card__badge--vendu">VENDU</span>' : '') +
    photoBadge +
    '</div>' +
    '<div class="occ-card__body">' +
    '<h2 class="occ-card__title">' + a.titre + '</h2>' +
    '<p class="occ-card__desc">' + (a.description || 'Contactez-nous pour plus d\'informations.') + '</p>' +
    '<div class="occ-card__meta">' + metaHtml + '</div>' +
    '<div class="occ-card__footer">' +
    '<span class="occ-card__price' + (vendu ? ' occ-card__price--vendu' : '') + '">' + formatPrix(a.prix) + '</span>' +
    '<div class="occ-card__btns">' +
    '<button class="occ-card__btn occ-card__btn--detail" data-modal="' + a.id + '"><i class="fa-solid fa-eye"></i> Voir</button>' +
    btnReserv +
    '</div></div></div></div>';
}

// ===== GPS =====
function genGPS(small) {
  var h = small ? 16 : 18;
  return '<div class="modal-gps">' +
    '<span><i class="fa-solid fa-location-dot"></i> ' + GARAGE_ADRESSE + '</span>' +
    '<a href="https://waze.com/ul?ll=' + GARAGE_LAT + ',' + GARAGE_LNG + '&navigate=yes" target="_blank" rel="noopener" class="gps-btn gps-btn--waze">' +
    '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Waze_logo.svg/40px-Waze_logo.svg.png" alt="Waze" height="' + h + '" /> Waze</a>' +
    '<a href="https://www.google.com/maps/dir/?api=1&destination=' + GARAGE_LAT + ',' + GARAGE_LNG + '" target="_blank" rel="noopener" class="gps-btn gps-btn--google">' +
    '<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Google_Maps_icon_%282015-2020%29.svg/30px-Google_Maps_icon_%282015-2020%29.svg.png" alt="Google Maps" height="' + h + '" /> Google Maps</a>' +
    '<a href="https://maps.apple.com/?daddr=' + GARAGE_LAT + ',' + GARAGE_LNG + '" target="_blank" rel="noopener" class="gps-btn gps-btn--apple">' +
    '<i class="fa-brands fa-apple"></i> Plans</a></div>';
}

// ===== MODAL DÉTAIL =====
function ouvrirModal(id) {
  var annonces = chargerAnnonces();
  var a = annonces.find(function(x) { return x.id === id; });
  if (!a) return;

  var photos  = getPhotos(a);
  var vendu   = a.statut === 'vendu';
  var galHtml = genGalerie(photos, 'modal-gal');

  var specsHtml = '';
  if (a.type === 'voiture') {
    if (a.annee)     specsHtml += '<div class="modal-spec"><span>Ann\u00e9e</span><strong>' + a.annee + '</strong></div>';
    if (a.km)        specsHtml += '<div class="modal-spec"><span>Kilom\u00e9trage</span><strong>' + Number(a.km).toLocaleString('fr-FR') + ' km</strong></div>';
    if (a.carburant) specsHtml += '<div class="modal-spec"><span>Carburant</span><strong>' + a.carburant + '</strong></div>';
    if (a.boite)     specsHtml += '<div class="modal-spec"><span>Bo\u00eete</span><strong>' + a.boite + '</strong></div>';
    if (a.couleur)   specsHtml += '<div class="modal-spec"><span>Couleur</span><strong>' + a.couleur + '</strong></div>';
    if (a.puissance) specsHtml += '<div class="modal-spec"><span>Puissance</span><strong>' + a.puissance + ' ch</strong></div>';
  } else {
    if (a.etat)       specsHtml += '<div class="modal-spec"><span>\u00c9tat</span><strong>' + a.etat + '</strong></div>';
    if (a.reference)  specsHtml += '<div class="modal-spec"><span>R\u00e9f\u00e9rence</span><strong>' + a.reference + '</strong></div>';
    if (a.compatible) specsHtml += '<div class="modal-spec"><span>Compatible</span><strong>' + a.compatible + '</strong></div>';
  }

  var btnReserv = !vendu
    ? '<button class="btn btn--primary" data-reserv="' + a.id + '" onclick="fermerModal()"><i class="fa-solid fa-calendar-check"></i> ' + (a.type === 'voiture' ? 'R\u00e9server / Essayer' : 'R\u00e9server &amp; Acompte') + '</button>'
    : '';

  document.getElementById('modalContent').innerHTML =
    '<div class="modal-galerie">' + galHtml + '</div>' +
    '<div class="modal-body">' +
    '<span class="modal-badge modal-badge--' + a.type + '">' + (a.type === 'voiture' ? 'V\u00e9hicule' : 'Pi\u00e8ce d\u00e9tach\u00e9e') + '</span>' +
    '<h2 class="modal-title">' + a.titre + '</h2>' +
    '<p class="modal-price">' + (vendu ? '<s style="color:#999">VENDU</s>' : formatPrix(a.prix)) + '</p>' +
    '<p class="modal-desc">' + (a.description || 'Contactez-nous pour plus d\'informations.') + '</p>' +
    (specsHtml ? '<div class="modal-specs">' + specsHtml + '</div>' : '') +
    genGPS(false) +
    '<div class="modal-actions">' +
    btnReserv +
    '<a href="tel:+33620185627" class="btn btn--outline" style="color:var(--dark);border-color:#ccc"><i class="fa-solid fa-phone"></i> Appeler</a>' +
    '</div></div>';

  document.getElementById('occModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fermerModal() {
  document.getElementById('occModal').style.display = 'none';
  document.body.style.overflow = '';
}

// ===== MODAL RÉSERVATION =====
function ouvrirReservation(id) {
  var annonces = chargerAnnonces();
  var a = annonces.find(function(x) { return x.id === id; });
  if (!a) return;

  var isVoiture = a.type === 'voiture';
  var prix      = Number(a.prix) || 0;
  var acompte   = prix > 0 ? Math.round(prix * 0.30) : 0;
  var reste     = prix - acompte;

  var acompteHtml = '';
  if (!isVoiture) {
    acompteHtml =
      '<div class="reserv-acompte">' +
      '<h4><i class="fa-solid fa-euro-sign"></i> Acompte par virement (30%)</h4>' +
      '<p>Pour r\u00e9server cette pi\u00e8ce, versez un acompte de <strong>30%</strong> par virement :</p>' +
      '<div class="virement-info">' +
      '<div class="virement-info__row"><span>B\u00e9n\u00e9ficiaire</span><strong>ClinikAuto</strong></div>' +
      '<div class="virement-info__row"><span>IBAN</span><strong>\u00c0 renseigner</strong></div>' +
      '<div class="virement-info__row"><span>BIC</span><strong>\u00c0 renseigner</strong></div>' +
      '<div class="virement-info__row"><span>R\u00e9f\u00e9rence</span><strong>' + a.titre + '</strong></div>' +
      (prix > 0
        ? '<div class="virement-info__row virement-info__row--highlight"><span>Acompte \u00e0 verser (30%)</span><strong>' + acompte.toLocaleString('fr-FR') + ' \u20ac</strong></div>' +
          '<div class="virement-info__row"><span>Reste \u00e0 payer au retrait</span><strong>' + reste.toLocaleString('fr-FR') + ' \u20ac</strong></div>' +
          '<div class="virement-info__row"><span>Prix total</span><strong>' + prix.toLocaleString('fr-FR') + ' \u20ac</strong></div>'
        : '<div class="virement-info__row virement-info__row--highlight"><span>Acompte (30%)</span><strong>\u00c0 convenir</strong></div>') +
      '</div>' +
      '<p class="reserv-note"><i class="fa-solid fa-circle-info"></i> L\'acompte est d\u00e9duit du prix final lors du retrait.</p>' +
      '</div>';
  }

  var today = new Date().toISOString().split('T')[0];

  document.getElementById('reservationContent').innerHTML =
    '<div class="reserv-header">' +
    '<h3><i class="fa-solid fa-calendar-check"></i> ' + (isVoiture ? 'R\u00e9server / Essayer' : 'R\u00e9server cette pi\u00e8ce') + '</h3>' +
    '<div class="reserv-annonce"><strong>' + a.titre + '</strong><span>' + formatPrix(a.prix) + '</span></div>' +
    '</div>' +
    '<div class="reserv-body">' +
    acompteHtml +
    '<div class="reserv-form">' +
    '<h4><i class="fa-solid fa-clock"></i> ' + (isVoiture ? 'Demander un rendez-vous essai' : 'Choisir un cr\u00e9neau de retrait') + '</h4>' +
    '<p class="reserv-horaires"><i class="fa-solid fa-calendar"></i> Lundi \u2013 Vendredi : 9h\u201312h / 14h\u201318h</p>' +
    genGPS(true) +
    '<div class="reserv-fields">' +
    '<div class="reserv-field"><label>Nom &amp; Pr\u00e9nom *</label><input type="text" id="rNomClient" placeholder="Votre nom et pr\u00e9nom" /></div>' +
    '<div class="reserv-field"><label>T\u00e9l\u00e9phone *</label><input type="tel" id="rTelClient" placeholder="06 XX XX XX XX" /></div>' +
    '<div class="reserv-field"><label>Email *</label><input type="email" id="rEmailClient" placeholder="votre@email.fr" /></div>' +
    '<div class="reserv-field"><label>Date souhait\u00e9e *</label><input type="date" id="rDate" min="' + today + '" /></div>' +
    '<div class="reserv-field"><label>Heure souhait\u00e9e *</label>' +
    '<select id="rHeure"><option value="">— Choisir —</option>' +
    '<option>09h00</option><option>09h30</option><option>10h00</option><option>10h30</option><option>11h00</option><option>11h30</option>' +
    '<option>14h00</option><option>14h30</option><option>15h00</option><option>15h30</option><option>16h00</option><option>16h30</option><option>17h00</option><option>17h30</option>' +
    '</select></div>' +
    '<div class="reserv-field reserv-field--full"><label>Message (optionnel)</label>' +
    '<textarea id="rMessage" rows="2" placeholder="' + (isVoiture ? 'Questions sur le v\u00e9hicule, reprise...' : 'Pr\u00e9cisions sur votre commande...') + '"></textarea></div>' +
    '</div>' +
    '<div class="reserv-error" id="reservError" style="display:none"><i class="fa-solid fa-circle-exclamation"></i> <span id="reservErrorMsg"></span></div>' +
    '<div class="reserv-actions">' +
    '<button class="btn btn--primary" id="btnEnvoyerReserv"><i class="fa-solid fa-paper-plane"></i> Envoyer ma demande</button>' +
    '<button class="btn" style="background:var(--light);color:var(--dark)" onclick="fermerReservation()">Annuler</button>' +
    '</div>' +
    '<p style="font-size:0.8rem;color:var(--grey);margin-top:8px">* Champs obligatoires</p>' +
    '</div></div>';

  // Attacher l'événement sur le bouton envoyer
  document.getElementById('btnEnvoyerReserv').addEventListener('click', function() {
    envoyerReservation(a.id, a.type, a.titre);
  });

  document.getElementById('modalReservation').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fermerReservation() {
  document.getElementById('modalReservation').style.display = 'none';
  document.body.style.overflow = '';
}

function envoyerReservation(id, type, titre) {
  var nom   = document.getElementById('rNomClient').value.trim();
  var tel   = document.getElementById('rTelClient').value.trim();
  var email = document.getElementById('rEmailClient').value.trim();
  var date  = document.getElementById('rDate').value;
  var heure = document.getElementById('rHeure').value;
  var errEl  = document.getElementById('reservError');
  var errMsg = document.getElementById('reservErrorMsg');

  if (!nom || !tel || !email || !date || !heure) {
    errMsg.textContent = 'Veuillez remplir tous les champs obligatoires.';
    errEl.style.display = 'flex'; return;
  }

  var message = document.getElementById('rMessage').value.trim();
  var sujet   = encodeURIComponent('Demande de RDV \u2014 ' + titre);
  var corps   = encodeURIComponent(
    'Demande de rendez-vous ClinikAuto\n\n' +
    'Annonce : ' + titre + '\n' +
    'Type : ' + (type === 'voiture' ? 'V\u00e9hicule' : 'Pi\u00e8ce d\u00e9tach\u00e9e') + '\n\n' +
    'Client : ' + nom + '\n' +
    'T\u00e9l\u00e9phone : ' + tel + '\n' +
    'Email : ' + email + '\n\n' +
    'Date souhait\u00e9e : ' + new Date(date).toLocaleDateString('fr-FR') + ' \u00e0 ' + heure + '\n\n' +
    (message ? 'Message : ' + message : '')
  );

  window.location.href = 'mailto:clinikauto74@gmail.com?subject=' + sujet + '&body=' + corps;

  document.getElementById('reservationContent').innerHTML =
    '<div style="text-align:center;padding:48px 24px">' +
    '<div style="font-size:4rem;margin-bottom:16px">\u2705</div>' +
    '<h3 style="font-family:var(--font-title);font-size:1.8rem;margin-bottom:12px;letter-spacing:1px">Demande envoy\u00e9e !</h3>' +
    '<p style="color:var(--grey);margin-bottom:8px">Votre client mail va s\'ouvrir. Sinon contactez-nous :</p>' +
    '<a href="tel:+33620185627" class="btn btn--primary" style="margin:16px auto;display:inline-flex"><i class="fa-solid fa-phone"></i> 06 20 18 56 27</a>' +
    '</div>';

  setTimeout(fermerReservation, 5000);
}

// ===== AFFICHER ANNONCES =====
function afficherAnnonces(filtre, recherche) {
  filtre    = filtre    || 'tous';
  recherche = recherche || '';

  var annonces = chargerAnnonces();
  var grid     = document.getElementById('occGrid');
  var empty    = document.getElementById('occEmpty');
  var compteur = document.getElementById('compteur');

  var filtrees = annonces.filter(function(a) {
    var matchType = filtre === 'tous' || a.type === filtre;
    var matchRech = recherche === '' ||
      a.titre.toLowerCase().indexOf(recherche.toLowerCase()) !== -1 ||
      (a.description || '').toLowerCase().indexOf(recherche.toLowerCase()) !== -1;
    return matchType && matchRech;
  });

  filtrees.sort(function(a, b) {
    if (a.statut === 'vendu' && b.statut !== 'vendu') return 1;
    if (a.statut !== 'vendu' && b.statut === 'vendu') return -1;
    return new Date(b.date) - new Date(a.date);
  });

  if (filtrees.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    compteur.textContent = 'Aucune annonce trouv\u00e9e';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtrees.map(genererCarte).join('');
    var dispo = filtrees.filter(function(a) { return a.statut !== 'vendu'; }).length;
    compteur.textContent = filtrees.length + ' annonce' + (filtrees.length > 1 ? 's' : '') + ' \u2014 ' + dispo + ' disponible' + (dispo > 1 ? 's' : '');
  }
}

// ===== DÉLÉGATION ÉVÉNEMENTS PRINCIPALE =====
document.addEventListener('DOMContentLoaded', function() {
  afficherAnnonces();

  // Filtres
  document.querySelectorAll('.filtre-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filtre-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      afficherAnnonces(btn.dataset.filtre, document.getElementById('searchInput').value);
    });
  });

  // Recherche
  document.getElementById('searchInput').addEventListener('input', function(e) {
    var filtre = document.querySelector('.filtre-btn.active').dataset.filtre;
    afficherAnnonces(filtre, e.target.value);
  });

  // Délégation pour ouvrir modal et réservation depuis la grille
  document.getElementById('occGrid').addEventListener('click', function(e) {
    var modalBtn = e.target.closest('[data-modal]');
    if (modalBtn) { ouvrirModal(modalBtn.dataset.modal); return; }
    var reservBtn = e.target.closest('[data-reserv]');
    if (reservBtn) { ouvrirReservation(reservBtn.dataset.reserv); return; }
  });

  // Fermer modals
  document.getElementById('modalClose').addEventListener('click', fermerModal);
  document.getElementById('modalOverlay').addEventListener('click', fermerModal);

  // Bouton réserver depuis modal détail (délégation)
  document.getElementById('modalContent').addEventListener('click', function(e) {
    var reservBtn = e.target.closest('[data-reserv]');
    if (reservBtn) { fermerModal(); ouvrirReservation(reservBtn.dataset.reserv); }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { fermerModal(); fermerReservation(); }
  });
});
