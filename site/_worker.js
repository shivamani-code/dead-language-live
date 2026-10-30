// _worker.js — Dead Language Live edge routes (no secrets): translation + natural-voice relay, and the voice engine files.
const CORS = { 'access-control-allow-origin': '*' };
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36';
export default {
  async fetch(req, env, ctx) {
    const u = new URL(req.url);
    try {
      if (u.pathname === '/api/tr') {
        const q = (u.searchParams.get('q') || '').slice(0, 500), sl = u.searchParams.get('sl') || 'auto';
        if (!q) return new Response('[]', { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });
        const urls = [
          `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sl)}&tl=sa&q=${encodeURIComponent(q)}`,
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=sa&dt=t&q=${encodeURIComponent(q)}`,
        ];
        for (const g of urls) {
          const r = await fetch(g, { headers: { 'user-agent': UA } });
          if (r.ok) return new Response(await r.text(), { headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
        }
        return new Response('{"error":"translation upstream unavailable"}', { status: 502, headers: { ...CORS, 'content-type': 'application/json' } });
      }
      if (u.pathname === '/api/tts') {
        const q = (u.searchParams.get('q') || '').slice(0, 200), tl = (u.searchParams.get('tl') || 'hi').replace(/[^a-zA-Z-]/g, '');
        if (!q) return new Response('', { status: 400, headers: CORS });
        const g = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(q)}`;
        const r = await fetch(g, { headers: { 'user-agent': UA, 'referer': 'https://translate.google.com/' } });
        if (!r.ok) return new Response('', { status: 502, headers: CORS });
        return new Response(r.body, { headers: { ...CORS, 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' } });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: { ...CORS, 'content-type': 'application/json' } });
    }
    return env.ASSETS.fetch(req);
  }
};
