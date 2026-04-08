(function () {
  const existing = window.__WZ_CONFIG__ || {};
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const backendBase = existing.BACKEND_URL || (isLocal
    ? 'http://localhost:5000'
    : 'https://wastezero-5g6q.onrender.com');
  const socketUrl = existing.SOCKET_URL || backendBase;

  function defaultSocketEnabled(url) {
    try {
      return !new URL(url).hostname.toLowerCase().endsWith('.vercel.app');
    } catch {
      return true;
    }
  }

  const socketEnabled =
    typeof existing.SOCKET_ENABLED === 'boolean'
      ? existing.SOCKET_ENABLED
      : existing.SOCKET_ENABLED === 'true'
        ? true
        : existing.SOCKET_ENABLED === 'false'
          ? false
          : defaultSocketEnabled(socketUrl);

  window.__WZ_CONFIG__ = {
    ...existing,
    BACKEND_URL: backendBase,
    API_URL: existing.API_URL || `${backendBase}/api`,
    SOCKET_URL: socketUrl,
    SOCKET_ENABLED: socketEnabled,
  };
})();
