const runtimeConfig = (globalThis as any).__WZ_CONFIG__ || {};
const backendUrl = runtimeConfig.BACKEND_URL || 'https://wastezero-5g6q.onrender.com';
const socketUrl = runtimeConfig.SOCKET_URL || backendUrl;

function defaultSocketEnabled(url: string): boolean {
  try {
    return !new URL(url).hostname.toLowerCase().endsWith('.vercel.app');
  } catch {
    return true;
  }
}

const socketEnabled =
  typeof runtimeConfig.SOCKET_ENABLED === 'boolean'
    ? runtimeConfig.SOCKET_ENABLED
    : runtimeConfig.SOCKET_ENABLED === 'true'
      ? true
      : runtimeConfig.SOCKET_ENABLED === 'false'
        ? false
        : defaultSocketEnabled(socketUrl);

export const environment = {
  production: true,
  backendUrl,
  apiUrl: runtimeConfig.API_URL || `${backendUrl}/api`,
  socketUrl,
  socketEnabled,
};
