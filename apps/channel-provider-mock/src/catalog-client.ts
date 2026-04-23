import { channelMockConfig } from './config';

async function request(path: string, options: { method: 'GET' | 'POST'; body?: unknown; writeAuth?: boolean }) {
  const response = await fetch(`${channelMockConfig.catalogBaseUrl}${path}`, {
    method: options.method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.writeAuth ? { 'x-api-key': channelMockConfig.apiKey } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method} ${path} -> ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }
  return payload as Record<string, unknown>;
}

export const catalogClient = {
  health: () => request('/health', { method: 'GET' }),
  manifest: () => request('/ocp/manifest', { method: 'GET' }),
  contracts: () => request('/ocp/contracts', { method: 'GET' }),
  registerProvider: (registration: unknown) =>
    request('/ocp/providers/register', { method: 'POST', body: registration, writeAuth: true }),
  syncObjects: (syncRequest: unknown) =>
    request('/ocp/objects/sync', { method: 'POST', body: syncRequest, writeAuth: true }),
  getProvider: (providerId: string) => request(`/ocp/providers/${providerId}`, { method: 'GET' }),
  query: (body: unknown) => request('/ocp/query', { method: 'POST', body }),
  resolve: (body: unknown) => request('/ocp/resolve', { method: 'POST', body }),
};
