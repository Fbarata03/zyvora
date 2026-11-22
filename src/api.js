const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
let accessToken = null;
export function setAccessToken(token) { accessToken = token; }
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Pedido falhou (${response.status})`);
  return data;
}
export async function authenticate(mode, payload) {
  const result = await apiRequest(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) });
  if (result.accessToken) setAccessToken(result.accessToken);
  return result;
}
export async function restoreSession() {
  try {
    const result = await apiRequest('/auth/refresh', { method: 'POST' });
    setAccessToken(result.accessToken);
    return apiRequest('/auth/me');
  } catch { return null; }
}
