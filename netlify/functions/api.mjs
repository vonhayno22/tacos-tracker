import { getStore } from '@netlify/blobs';
import { timingSafeEqual, randomBytes } from 'node:crypto';

export const config = { path: '/api/*' };

/* Every metric a client page can show. Anything not in a client's list is removed from the data before it leaves the server. */
const METRIC_KEYS = ['spend', 'sales', 'orders', 'units', 'tacos', 'sessions', 'cvr'];
const ID_RE = /^[a-z0-9-]{1,60}$/;
const WID_RE = /^[A-Z]{2}__\d{4}-\d{2}-\d{2}$/;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
const fail = (status, error) => json({ error }, status);

function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
const newSlug = (id) => id + '-' + randomBytes(3).toString('hex');

/* Remove numbers the client may not see. Spend that is hidden is folded into one "hid" number so Total spend and TACOS stay right. */
export function stripForClient(weeks, shownList) {
  const shown = new Set(shownList);
  const hide = METRIC_KEYS.filter((k) => !shown.has(k));
  const keepSpend = shown.has('spend') || shown.has('tacos');
  const out = weeks.map((w) => {
    const o = Object.assign({}, w);
    delete o.unmatchedSp; delete o.unmatchedSd;
    o.children = (w.children || []).map((r) => {
      const c = Object.assign({}, r);
      let hid = c.hid || 0;
      hid += (c.sp || 0) + (c.sd || 0); c.sp = 0; c.sd = 0;
      if (!shown.has('units') && !shown.has('cvr')) c.units = 0;
      if (!shown.has('orders')) c.orders = 0;
      if (!shown.has('sessions') && !shown.has('cvr')) c.sessions = 0;
      if (!shown.has('sales') && !shown.has('tacos')) c.sales = 0;
      if (keepSpend && hid) c.hid = +hid.toFixed(2); else delete c.hid;
      return c;
    });
    return o;
  });
  return { weeks: out, hide };
}

export async function handle(req, store, env) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const get = async (key, def) => (await store.get(key, { type: 'json' })) ?? def;
  const put = (key, val) => store.setJSON(key, val);

  /* Public: one client's page, by its private link. No password. */
  if (method === 'GET' && parts[0] === 'public') {
    const slug = String(url.searchParams.get('slug') || '').toLowerCase();
    if (!ID_RE.test(slug)) return fail(404, 'Not found');
    const clients = await get('clients', {});
    const id = Object.keys(clients).find((k) => clients[k].slug === slug);
    if (!id) return fail(404, 'Not found');
    const wkObj = await get('weeks-' + id, {});
    const shown = Array.isArray(clients[id].shown) ? clients[id].shown : METRIC_KEYS;
    const { weeks, hide } = stripForClient(Object.values(wkObj), shown);
    const latest = weeks.map((w) => w.savedAt || '').sort().pop() || null;
    return json({ client: { id, name: clients[id].name }, weeks, hide, generatedAt: latest });
  }

  /* Everything else needs the admin password. */
  if (!env.ADMIN_PASSWORD) return fail(500, 'ADMIN_PASSWORD is not set in Netlify (Site configuration > Environment variables).');
  if (!sameSecret(req.headers.get('x-admin-password'), env.ADMIN_PASSWORD)) return fail(401, 'Wrong password');

  const body = async () => { try { return await req.json(); } catch (e) { return null; } };

  if (method === 'GET' && parts[0] === 'ping') return json({ ok: true });

  if (method === 'GET' && parts[0] === 'clients') {
    const c = await get('clients', {});
    return json({ clients: Object.keys(c).map((id) => ({ id, name: c[id].name, shareToken: c[id].slug, shown: c[id].shown })) });
  }
  if (method === 'PUT' && parts[0] === 'clients' && parts[1]) {
    const id = parts[1]; const b = await body();
    if (!ID_RE.test(id) || !b || typeof b.name !== 'string' || !b.name.trim()) return fail(400, 'Bad client');
    const c = await get('clients', {});
    c[id] = Object.assign({}, c[id] || { slug: newSlug(id) }, { name: b.name.trim().slice(0, 80) });
    await put('clients', c);
    return json({ id, name: c[id].name, shareToken: c[id].slug, shown: c[id].shown });
  }
  if (method === 'POST' && parts[0] === 'clients' && parts[2] === 'token') {
    const id = parts[1]; const c = await get('clients', {});
    if (!c[id]) return fail(404, 'Client not found');
    c[id].slug = newSlug(id); await put('clients', c);
    return json({ shareToken: c[id].slug });
  }
  if (method === 'PUT' && parts[0] === 'cols' && parts[1]) {
    const id = parts[1]; const b = await body(); const c = await get('clients', {});
    if (!c[id]) return fail(404, 'Client not found');
    if (!b || !Array.isArray(b.shown)) return fail(400, 'Bad request');
    c[id].shown = b.shown.filter((k) => METRIC_KEYS.includes(k));
    await put('clients', c);
    return json({ ok: true, shown: c[id].shown });
  }
  if (method === 'GET' && parts[0] === 'data') {
    const id = url.searchParams.get('client'); const c = await get('clients', {});
    if (!c[id]) return fail(404, 'Client not found');
    return json({
      client: { id, name: c[id].name, shareToken: c[id].slug, shown: c[id].shown },
      weeks: Object.values(await get('weeks-' + id, {})),
      tracked: await get('tracked-' + id, {}),
    });
  }
  if (parts[0] === 'weeks' && parts[1] && parts[2]) {
    const [, cid, wid] = parts; const c = await get('clients', {});
    if (!c[cid]) return fail(404, 'Client not found');
    if (!WID_RE.test(wid)) return fail(400, 'Bad week id');
    const wk = await get('weeks-' + cid, {});
    if (method === 'PUT') {
      const b = await body();
      if (!b || !Array.isArray(b.children)) return fail(400, 'Bad week');
      wk[wid] = b;
    } else if (method === 'DELETE') delete wk[wid];
    else return fail(405, 'Method not allowed');
    await put('weeks-' + cid, wk);
    return json({ ok: true });
  }
  if (method === 'PUT' && parts[0] === 'tracked' && parts[1]) {
    const b = await body(); const c = await get('clients', {});
    if (!c[parts[1]]) return fail(404, 'Client not found');
    if (!b || typeof b !== 'object') return fail(400, 'Bad request');
    await put('tracked-' + parts[1], b);
    return json({ ok: true });
  }
  return fail(404, 'Not found');
}

export default async (req) => {
  try {
    return await handle(req, getStore({ name: 'tacos', consistency: 'strong' }), process.env);
  } catch (e) {
    return fail(500, 'Server error: ' + (e && e.message ? e.message : e));
  }
};
