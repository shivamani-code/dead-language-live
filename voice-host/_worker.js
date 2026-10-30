// Serves the voice clips with CORS under /a/* (static assets are otherwise served directly, without CORS headers).
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': '*' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (u.pathname.startsWith('/a/')) {
      const name = u.pathname.slice(3).replace(/[^a-zA-Z0-9._-]/g, '');
      const r = await env.ASSETS.fetch(new Request(new URL('/c/' + name, u.origin), { method: 'GET' }));
      const h = new Headers(r.headers);
      Object.entries(cors).forEach(([k, v]) => h.set(k, v));
      h.set('cache-control', 'public, max-age=604800');
      return new Response(r.body, { status: r.status, headers: h });
    }
    return env.ASSETS.fetch(req);
  }
};
