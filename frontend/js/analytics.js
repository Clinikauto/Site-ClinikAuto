(function () {
  const SESSION_KEY = 'clinikauto_site_session';
  const API_BASE = window.CLINIKAUTO_API_BASE || (window.location.protocol === 'file:' ? 'http://localhost:3000' : '');
  const PAGE_NAMES = {
    '/': 'Accueil',
    '/index.html': 'Accueil',
    '/login': 'Connexion',
    '/login.html': 'Connexion',
    '/register': 'Inscription',
    '/register.html': 'Inscription',
    '/dashboard': 'Espace client',
    '/dashboard.html': 'Espace client',
    '/appointment': 'Rendez-vous',
    '/appointment.html': 'Rendez-vous',
    '/occasions': 'Occasions',
    '/occasions.html': 'Occasions',
    '/admin': 'Administration',
    '/admin.html': 'Administration',
    '/espace-client.html': 'Espace client avancé'
  };

  function currentPath() {
    const path = (window.location.pathname || '/').replace(/\\/g, '/');
    return path || '/';
  }

  function pageNameFromPath(path) {
    if (PAGE_NAMES[path]) {
      return PAGE_NAMES[path];
    }
    const fileName = path.split('/').pop() || 'page';
    return fileName.replace('.html', '') || 'Page';
  }

  function getSessionId() {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  function sendPayload(url, payload) {
    const body = JSON.stringify({ ...payload, sessionId: getSessionId() });

    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(url, blob);
        return;
      } catch (_err) {
      }
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  }

  function trackVisit() {
    const path = currentPath();
    sendPayload(API_BASE + '/analytics/visit', {
      page: pageNameFromPath(path),
      path
    });
  }

  function trackEvent(name, detail) {
    sendPayload(API_BASE + '/analytics/event', { name, detail: detail || null });
  }

  window.ClinikAutoAnalytics = {
    getStats: function () {
      return {};
    },
    getSessionId,
    trackEvent
  };

  trackVisit();
})();