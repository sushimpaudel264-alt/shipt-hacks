// Thin client for the Codelingo FastAPI backend (see backend/main.py).
// getToken() returns the session token (or null); it is sent as a Bearer token.

export class ApiError extends Error {
  /** status is undefined for network failures (offline, server down). */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
  get offline() { return this.status === undefined; }
}

export function createApi(baseUrl, getToken = () => null) {
  const base = (baseUrl || '').replace(/\/$/, '');

  async function request(path, { method = 'GET', body, keepalive } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(base + path, {
        method,
        keepalive,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError("You're offline or the server can't be reached.");
    }
    if (!res.ok) {
      // FastAPI errors look like {detail: "message"} or {detail: [{msg, loc}, ...]} for validation.
      let detail = `${method} ${path} failed with ${res.status}`;
      try {
        const data = await res.json();
        if (typeof data.detail === 'string') detail = data.detail;
        else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
          const d = data.detail[0];
          const field = (d.loc || []).filter((p) => p !== 'body').join(' › ');
          detail = field ? `${field}: ${d.msg}` : d.msg;
        }
      } catch { /* not JSON */ }
      throw new ApiError(detail, res.status);
    }
    return res.json();
  }

  const id = encodeURIComponent;

  return {
    /** Accounts. register/login resolve to {token, user}. */
    roles: () => request('/api/auth/roles'),
    register: (form) => request('/api/auth/register', { method: 'POST', body: form }),
    login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/auth/me'),

    /** Published courses: summaries with outlines, and full content for studying / downloading. */
    getCourses: () => request('/api/courses'),
    getCourse: (courseId) => request(`/api/courses/${id(courseId)}`),

    /** Progress: the server merges what it is sent and returns the merged document. */
    getProgress: () => request('/api/me/progress'),
    syncProgress: (progress, { keepalive = false } = {}) =>
      request('/api/me/progress', { method: 'PUT', body: progress, keepalive }),
    resetProgress: () => request('/api/me/progress', { method: 'DELETE' }),

    leaderboard: () => request('/api/leaderboard'),

    /** Administrators. */
    admin: {
      list: () => request('/api/admin/courses'),
      create: (content) => request('/api/admin/courses', { method: 'POST', body: content }),
      get: (courseId) => request(`/api/admin/courses/${id(courseId)}`),
      save: (courseId, content) => request(`/api/admin/courses/${id(courseId)}`, { method: 'PUT', body: content }),
      publish: (courseId) => request(`/api/admin/courses/${id(courseId)}/publish`, { method: 'POST' }),
      unpublish: (courseId) => request(`/api/admin/courses/${id(courseId)}/unpublish`, { method: 'POST' }),
      remove: (courseId) => request(`/api/admin/courses/${id(courseId)}`, { method: 'DELETE' }),
    },
  };
}
