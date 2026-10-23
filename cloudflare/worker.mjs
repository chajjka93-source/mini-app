const SITE = 'https://chajjka93-source.github.io';

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': SITE,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (request.method === 'GET') return reply(200, { ok: true, service: 'mini-app-form' });
    if (request.headers.get('Origin') !== SITE) return reply(403, { ok: false });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { ok: false });
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply(503, { ok: false });
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415, { ok: false });
    try {
      // Read at most 16 KB, including when Content-Length is absent.
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { ok: false });
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return reply(413, { ok: false });
        }
        chunks.push(value);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      const data = JSON.parse(new TextDecoder().decode(body));
      const field = (key, max, min = 1) => {
        const value = typeof data?.[key] === 'string' ? data[key].trim() : '';
        if (value.length < min || value.length > max) throw new Error('Invalid field');
        return value;
      };
      let text;
      if (data?.type === 'lead') {
        const email = field('email', 254);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { ok: false });
        text = `Новая заявка с сайта\n\nИмя: ${field('name', 100, 2)}\nEmail: ${email}\n\nЗадача: ${field('message', 2500, 5)}`;
      } else if (data?.type === 'review') {
        text = `Запрос на бесплатный разбор\n\nИмя: ${field('name', 100)}\nКонтакт: ${field('contact', 200)}\nСфера: ${field('business', 100)}\nЦель: ${field('goal', 100)}\nЗадача: ${field('details', 2000, 5)}\nСайт или соцсети: ${field('link', 500, 0) || 'Не указаны'}`;
      } else return reply(400, { ok: false });
      if (text.length > 4096) return reply(400, { ok: false });
      const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.CHAT_ID, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(12000)
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) return reply(502, { ok: false });
      return reply(200, { ok: true });
    } catch (error) {
      return reply(error instanceof SyntaxError || error.message === 'Invalid field' ? 400 : 502, { ok: false });
    }
  }
};
