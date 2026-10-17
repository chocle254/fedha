// Adds the signed-in user's Supabase token to every request this app makes
// to its own /api routes, so the server can refuse strangers (see
// lib/require-user.js). Installed once from pages/_app.js. Requests to other
// sites, and the public certificate check, are left untouched.
import { getSession } from './supabase';

let installed = false;

export function installApiAuth() {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
      const path = sameOrigin ? new URL(url, window.location.origin).pathname : '';
      if (path.startsWith('/api/') && !path.startsWith('/api/certificate/')) {
        const session = await getSession();
        if (session?.access_token) {
          const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
          if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${session.access_token}`);
          return original(input, { ...init, headers });
        }
      }
    } catch {
      // Never let the auth helper break a request — fall through unchanged.
    }
    return original(input, init);
  };
}
