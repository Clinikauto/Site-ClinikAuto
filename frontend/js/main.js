// ========== CLINIKAUTO — main.js ==========

// --- Menu burger mobile (robuste: supporte id 'nav' ou 'main-nav' et fallback .nav) ---
const burger = document.getElementById('burger');
let nav = document.getElementById('nav') || document.getElementById('main-nav') || document.querySelector('.nav');

if (burger && nav) {
  burger.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    burger.classList.toggle('active');
    burger.setAttribute('aria-expanded', String(!!isOpen));
  });

  // Fermer le menu au clic sur un lien
  nav.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      burger.classList.remove('active');
      burger.setAttribute('aria-expanded', 'false');
    });
  });
}

// --- Header scroll effect ---
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    header.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
  } else {
    header.style.boxShadow = 'none';
  }
});

// --- Smooth scroll sur les liens d'ancrage ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// --- Formulaire de contact ---
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const nom     = document.getElementById('nom').value.trim();
    const prenom  = document.getElementById('prenom').value.trim();
    const tel     = document.getElementById('tel').value.trim();
    const email   = document.getElementById('email').value.trim();
    const adresse = document.getElementById('adresse').value.trim();
    const immat   = document.getElementById('immat').value.trim();
    const message = document.getElementById('message').value.trim();

    // Vérification tous champs obligatoires
    if (!nom || !prenom || !tel || !email || !adresse || !immat || !message) {
      // Mettre en rouge les champs vides
      ['nom','prenom','tel','email','adresse','immat','message'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value.trim()) {
          el.style.borderColor = 'var(--red)';
        } else if (el) {
          el.style.borderColor = '';
        }
      });
      alert('Merci de remplir tous les champs obligatoires.');
      return;
    }

    // Vérification format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      document.getElementById('email').style.borderColor = 'var(--red)';
      alert('Veuillez saisir une adresse email valide.');
      return;
    }

    // Vérification format téléphone (10 chiffres min)
    const telRegex = /^[\d\s\+\-\.]{10,}$/;
    if (!telRegex.test(tel)) {
      document.getElementById('tel').style.borderColor = 'var(--red)';
      alert('Veuillez saisir un numéro de téléphone valide.');
      return;
    }

    // Simulation envoi (à connecter à un backend ou service mail)
    const btn = form.querySelector('button[type="submit"]');
    btn.textContent = '✅ Message envoyé !';
    btn.disabled = true;
    btn.style.background = '#388E3C';

    setTimeout(() => {
      form.reset();
      ['nom','prenom','tel','email','adresse','immat','message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.borderColor = '';
      });
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer le message';
      btn.disabled = false;
      btn.style.background = '';
    }, 4000);
  });

  // Retirer le rouge au fur et à mesure que l'utilisateur saisit
  ['nom','prenom','tel','email','adresse','immat','message'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { el.style.borderColor = ''; });
  });
}

// --- Animation d'apparition au scroll ---
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.service-card, .apropos__card, .tarif-card, .temoignage-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ===== CLIENT STORE =====
const ClientStore = {
  get() {
    return JSON.parse(localStorage.getItem("client")) || {};
  },
  save(data) {
    const current = this.get();
    const updated = { ...current, ...data };
    localStorage.setItem("client", JSON.stringify(updated));
  }
};

// ===== VEHICULES =====
const VehiculeManager = {
  getAll() {
    return ClientStore.get().vehicules || [];
  },
  add(v) {
    const data = ClientStore.get();
    const list = data.vehicules || [];
    v.id = "v" + Date.now();
    list.push(v);
    ClientStore.save({ vehicules: list });
  },
  select(id) {
    ClientStore.save({ selectedVehiculeId: id });
  },
  getSelected() {
    const data = ClientStore.get();
    return (data.vehicules || []).find(v => v.id === data.selectedVehiculeId);
  }
};

// ===== AUTO SYNC =====
document.querySelectorAll("input, textarea").forEach(input => {
  const data = ClientStore.get();
  if (data[input.name]) input.value = data[input.name];

  input.addEventListener("input", () => {
    ClientStore.save({ [input.name]: input.value });
  });
});

// ===== ACTIONS =====
const Actions = {
  selectService(s) { ClientStore.save({ selectedService: s }); },
  selectDate(d) { ClientStore.save({ selectedDate: d }); },
  selectOccasion(o) { ClientStore.save({ selectedOccasion: o }); }
};

// ===== CONTACT AUTO MESSAGE =====
document.addEventListener("DOMContentLoaded", () => {
  const data = ClientStore.get();
  const v = VehiculeManager.getSelected();
  const textarea = document.querySelector("#contact textarea");

  if (textarea) {
    textarea.value =
`Demande client :

Nom : ${data.nom || ""}
Prénom : ${data.prenom || ""}
Téléphone : ${data.telephone || ""}

Véhicule : ${v ? v.immatriculation : ""}

Service : ${data.selectedService || ""}
Date : ${data.selectedDate || ""}
`;
  }
});
