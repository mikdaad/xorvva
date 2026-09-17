import axios from 'axios';

const API_BASE = '/api';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT ─────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: silent token refresh ──────────
// On 401: refresh once, replay the original request. Concurrent 401s
// queue behind a single refresh call.
//
// IMPORTANT: never triggered for /auth/login or /auth/refresh —
// a failed login is a real 401, not an expired session.
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(undefined);
  });
  failedQueue = [];
};

const isAuthEndpoint = (url?: string) =>
  !!url && (url.includes('/auth/login') || url.includes('/auth/refresh'));

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => client(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          token: refreshToken,
        });

        if (data.success) {
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          processQueue(null);
          return client(originalRequest);
        }
      } catch {
        processQueue(error);
        localStorage.clear();
        window.location.href = '/login';
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
