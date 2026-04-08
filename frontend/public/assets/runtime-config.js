(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const backendBase = isLocal
    ? 'http://localhost:5000'
    : 'https://wastezero-api.vercel.app';
  const socketEnabled = isLocal;

  window.__WZ_CONFIG__ = window.__WZ_CONFIG__ || {
    BACKEND_URL: backendBase,
    API_URL: `${backendBase}/api`,
    SOCKET_URL: backendBase,
    SOCKET_ENABLED: socketEnabled,
  };
})();
