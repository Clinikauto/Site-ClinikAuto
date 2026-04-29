(function () {
  const AppData = {
    save(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_err) {
        // Ignore storage errors silently.
      }
    },
    get(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (_err) {
        return null;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (_err) {
        // Ignore storage errors silently.
      }
    }
  };

  window.AppData = AppData;
})();
