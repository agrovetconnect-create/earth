import { ensureCsrfToken } from './http.js';

const API_BASE = '/api/control';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface StaffSession {
  token: string;
  staff: {
    id: string;
    email: string;
    role: string;
    full_name?: string;
  };
}

let currentStaffSession: StaffSession | null = null;

export const getStoredStaff = (): StaffSession | null => currentStaffSession;

export const setStoredStaff = (session: StaffSession | null): void => {
  currentStaffSession = session
    ? { token: '', staff: session.staff }
    : null;
};

async function request(path: string, options: RequestInit = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (STATE_CHANGING_METHODS.has(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 403 && STATE_CHANGING_METHODS.has(method)) {
    const cloned = await response.clone().json().catch(() => null);
    const code = cloned?.error?.code ?? cloned?.error;
    if (typeof code === 'string' && code.toUpperCase().includes('CSRF')) {
      const freshCsrf = await ensureCsrfToken(true);
      if (freshCsrf) headers.set('X-CSRF-Token', freshCsrf);
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers,
      });
    }
  }

  if (response.status === 401) {
    setStoredStaff(null);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errMsg =
      typeof error?.error === 'string'
        ? error.error
        : error?.error?.message || 'Request failed';
    throw new Error(errMsg);
  }
  return response.json();
}

export const controlApi = {
  login: async (credentials: any): Promise<StaffSession> => {
    const result = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const session: StaffSession = { token: '', staff: result.staff };
    setStoredStaff(session);
    return session;
  },
  logout: async (): Promise<void> => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort cookie & server session revocation.
    }
    setStoredStaff(null);
  },
  getMe: () => request('/auth/me'),
  getMetrics: () => request('/metrics'),
  getAuditLogs: () => request('/audit-logs'),
  listStaff: () => request('/staff'),
  createStaff: (data: any) =>
    request('/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateStaff: (id: string, data: any) =>
    request(`/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  searchUsers: (query: string) => request(`/support/users?q=${encodeURIComponent(query)}`),
  getCmsPage: (page: string) => request(`/cms/${page}`),
  updateCmsPage: (page: string, data: any) =>
    request(`/cms/${page}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  getCmsHistory: (page: string) => request(`/cms/${page}/history`),
  restoreCmsRevision: (page: string, filename: string) =>
    request(`/cms/${page}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }),
  getFaqs: () => request('/faqs'),
};
