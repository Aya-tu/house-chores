// Cloudflare Worker (مجاني): بيبعت إشعارات Web Push حتى والتطبيق مقفول
// المتطلبات: KV namespace باسم الربط (Binding) = KV  +  Cron Trigger: 0 6 * * *  (٨ صباحًا بتوقيت القاهرة تقريبًا)
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...H, 'Content-Type': 'application/json' } });
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

async function vapid(env) {
  let k = await env.KV.get('vapid', 'json');
  if (!k) {
    const p = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    k = { priv: await crypto.subtle.exportKey('jwk', p.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', p.publicKey)) };
    await env.KV.put('vapid', JSON.stringify(k));
  }
  return k;
}

async function jwt(k, aud) {
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'mailto:admin@example.com' })}`;
  const key = await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return `${data}.${b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data)))}`;
}

async function send(env, name, s, msg) {
  const id = name.split(':').pop();
  await env.KV.put('msg:' + id, JSON.stringify(msg), { expirationTtl: 3600 });
  const k = await vapid(env);
  const r = await fetch(s.sub.endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Authorization: `vapid t=${await jwt(k, new URL(s.sub.endpoint).origin)}, k=${k.pub}` }
  });
  if (r.status === 404 || r.status === 410) await env.KV.delete(name);
}

async function fanout(env, prefix, msg, skip) {
  const list = await env.KV.list({ prefix });
  await Promise.all(list.keys.map(async ({ name }) => {
    const s = await env.KV.get(name, 'json');
    if (s && s.me !== skip) await send(env, name, s, msg);
  }));
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    if (u.pathname === '/key') return J({ key: (await vapid(env)).pub });
    if (u.pathname === '/msg') {
      const m = await env.KV.get('msg:' + (u.searchParams.get('id') || ''), 'json');
      return J(m || { title: 'أسبوع المطبخ', body: 'فيه تحديث جديد 🍳' });
    }
    if (req.method === 'POST') {
      const b = await req.json();
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(b.room || '')) return J({ error: 'room' }, 400);
      if (u.pathname === '/subscribe' && b.sub && b.sub.endpoint) {
        await env.KV.put(`sub:${b.room}:${await sha(b.sub.endpoint)}`, JSON.stringify({ room: b.room, me: b.me, sub: b.sub }));
        return J({ ok: 1 });
      }
      if (u.pathname === '/notify') {
        await fanout(env, `sub:${b.room}:`, { title: String(b.title).slice(0, 60), body: String(b.body).slice(0, 140) }, b.from);
        return J({ ok: 1 });
      }
    }
    return J({ ok: 1 });
  },
  async scheduled(_, env, ctx) {
    ctx.waitUntil(fanout(env, 'sub:', { title: 'مهام النهارده 📋', body: 'افتحي التطبيق وشوفي مهامك ودورك في الطبخ والتنظيف' }, null));
  }
};
