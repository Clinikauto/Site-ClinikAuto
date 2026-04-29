(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  const PROFILE_KEYS = ['nom', 'prenom', 'email', 'telephone', 'immatriculation'];

  let cachedProfile = null;
  let cachedProfileLoaded = false;
  let syncTimer = null;

  function parseStored(raw) {
    if (raw === null || raw === undefined) {
      return '';
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return raw;
    }
  }

  function getStorageValue(key) {
    const value = parseStored(localStorage.getItem(key));
    return value == null ? '' : String(value).trim();
  }

  function saveStorageValue(key, value) {
    const normalized = String(value || '').trim();
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (_err) {
      // Ignore storage errors silently.
    }
  }

  function resolveKey(field) {
    const name = String(field && (field.name || field.id) || '').trim().toLowerCase();
    if (!name) return '';

    const keyMap = {
      nom: 'nom',
      prenom: 'prenom',
      firstname: 'prenom',
      lastname: 'nom',
      email: 'email',
      mail: 'email',
      courriel: 'email',
      e_mail: 'email',
      tel: 'telephone',
      telephoneportable: 'telephone',
      mobile: 'telephone',
      gsm: 'telephone',
      telephone: 'telephone',
      phone: 'telephone',
      immat: 'immatriculation',
      immatriculation: 'immatriculation',
      plaque: 'immatriculation',
      plaqueimmat: 'immatriculation',
      plaque_immat: 'immatriculation',
      vehiculeimmat: 'immatriculation'
    };

    return keyMap[name] || name;
  }

  function getAuthToken() {
    return localStorage.getItem('token')
      || sessionStorage.getItem('token')
      || sessionStorage.getItem('clinikauto_client_token')
      || '';
  }

  function extractProfileMap(profile) {
    const vehicle = Array.isArray(profile && profile.vehicules) && profile.vehicules.length
      ? (profile.vehicules[0] || {})
      : {};

    return {
      nom: String((profile && profile.nom) || '').trim(),
      prenom: String((profile && profile.prenom) || '').trim(),
      email: String((profile && profile.email) || '').trim(),
      telephone: String((profile && profile.tel) || '').trim(),
      immatriculation: String((vehicle && vehicle.immat) || '').trim()
    };
  }

  async function loadProfileIfPossible() {
    if (cachedProfileLoaded) {
      return cachedProfile;
    }

    const token = getAuthToken();
    if (!token) {
      cachedProfileLoaded = true;
      cachedProfile = null;
      return null;
    }

    try {
      const response = await fetch(API_BASE + '/me/profile', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!response.ok) {
        throw new Error('profile-unavailable');
      }
      cachedProfile = await response.json();
      const map = extractProfileMap(cachedProfile);
      PROFILE_KEYS.forEach((key) => {
        if (map[key]) {
          saveStorageValue(key, map[key]);
        }
      });
    } catch (_err) {
      cachedProfile = null;
    }

    cachedProfileLoaded = true;
    return cachedProfile;
  }

  function ensureHelperNode(field, text) {
    let node = field.parentElement ? field.parentElement.querySelector('.field-helper-error') : null;
    if (!node) {
      node = document.createElement('small');
      node.className = 'field-helper-error';
      if (field.parentElement) {
        field.parentElement.appendChild(node);
      }
    }
    node.textContent = text;
  }

  function clearHelperNode(field) {
    if (!field || !field.parentElement) return;
    const node = field.parentElement.querySelector('.field-helper-error');
    if (node) {
      node.remove();
    }
  }

  function markFieldError(field) {
    field.classList.add('error');
    field.setAttribute('aria-invalid', 'true');
    ensureHelperNode(field, 'Ce champ est requis.');
  }

  function clearFieldError(field) {
    field.classList.remove('error');
    field.removeAttribute('aria-invalid');
    clearHelperNode(field);
  }

  function showAutofillNotice(form, count) {
    if (!form || !count) {
      return;
    }

    let notice = form.querySelector('.smart-autofill-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'smart-autofill-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      form.insertBefore(notice, form.firstChild);
    }
    notice.textContent = count > 1
      ? (count + ' champs ont ete pre-remplis depuis votre profil.')
      : '1 champ a ete pre-rempli depuis votre profil.';
  }

  function collectFromForm(form) {
    const payload = {};
    form.querySelectorAll('input, select, textarea').forEach((field) => {
      const key = resolveKey(field);
      if (!key) return;
      const value = String(field.value || '').trim();
      if (value) {
        payload[key] = value;
      }
    });
    return payload;
  }

  async function syncProfileToBackend(extraValues) {
    const token = getAuthToken();
    if (!token) {
      return;
    }

    const values = {};
    PROFILE_KEYS.forEach((key) => {
      values[key] = getStorageValue(key);
    });
    Object.assign(values, extraValues || {});

    try {
      const profileResponse = await fetch(API_BASE + '/me/profile', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!profileResponse.ok) {
        return;
      }
      const profile = await profileResponse.json();
      const vehicules = Array.isArray(profile.vehicules) ? [...profile.vehicules] : [];
      if (values.immatriculation) {
        if (!vehicules.length) {
          vehicules.push({ id: Date.now().toString(), immat: values.immatriculation });
        } else {
          vehicules[0] = { ...vehicules[0], immat: values.immatriculation };
        }
      }

      await fetch(API_BASE + '/me/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          nom: values.nom || profile.nom || '',
          prenom: values.prenom || profile.prenom || '',
          email: values.email || profile.email || '',
          tel: values.telephone || profile.tel || '',
          adresse: profile.adresse || '',
          vehicules
        })
      });
    } catch (_err) {
      // Ignore backend sync errors silently.
    }
  }

  function scheduleProfileSync(extraValues) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncProfileToBackend(extraValues);
    }, 700);
  }

  async function autofillFromSources(form) {
    await loadProfileIfPossible();

    const fields = form.querySelectorAll('[required]');
    let autofilledCount = 0;
    fields.forEach((field) => {
      const key = resolveKey(field);
      if (!key) return;
      if (String(field.value || '').trim()) return;

      const localValue = getStorageValue(key);
      if (localValue) {
        field.value = localValue;
        autofilledCount += 1;
      }
    });

    showAutofillNotice(form, autofilledCount);
  }

  async function validateAndAutofill(form) {
    const requiredFields = Array.from(form.querySelectorAll('[required]'));
    const valuesBefore = new Map();
    requiredFields.forEach((field) => {
      valuesBefore.set(field, String(field.value || '').trim());
    });

    await autofillFromSources(form);

    let hasMissing = false;
    let firstMissing = null;

    requiredFields.forEach((field) => {
      const key = resolveKey(field);
      const localValue = key ? getStorageValue(key) : '';

      if (!String(field.value || '').trim()) {
        if (localValue) {
          field.value = localValue;
          clearFieldError(field);
        } else {
          hasMissing = true;
          markFieldError(field);
          if (!firstMissing) {
            firstMissing = field;
          }
        }
      } else {
        clearFieldError(field);
        if (key) {
          saveStorageValue(key, field.value);
        }
      }
    });

    const autofilledCount = requiredFields.filter((field) => {
      const before = valuesBefore.get(field) || '';
      const after = String(field.value || '').trim();
      return !before && !!after;
    }).length;
    showAutofillNotice(form, autofilledCount);

    if (firstMissing) {
      firstMissing.focus();
    }

    if (!hasMissing) {
      scheduleProfileSync(collectFromForm(form));
    }

    return !hasMissing;
  }

  function bindForm(form) {
    if (!form || form.dataset.smartValidationBound === '1') {
      return;
    }
    form.dataset.smartValidationBound = '1';

    autofillFromSources(form).then(() => {
      // Initial autofill done.
    });

    form.querySelectorAll('[required], input, select, textarea').forEach((field) => {
      field.addEventListener('input', () => {
        const key = resolveKey(field);
        clearFieldError(field);
        if (key) {
          saveStorageValue(key, field.value);
        }
      });

      field.addEventListener('blur', () => {
        const key = resolveKey(field);
        if (key) {
          saveStorageValue(key, field.value);
          scheduleProfileSync({ [key]: String(field.value || '').trim() });
        }
      });
    });

    form.addEventListener('submit', async (event) => {
      const isValid = await validateAndAutofill(form);
      if (!isValid) {
        event.preventDefault();
      }
    }, true);
  }

  function initSmartValidation() {
    document.querySelectorAll('form').forEach(bindForm);
  }

  window.validateAndAutofill = validateAndAutofill;
  window.initSmartValidation = initSmartValidation;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartValidation);
  } else {
    initSmartValidation();
  }
})();
