/**
 * Cloudflare Worker: приём заявок с формы сайта.
 *
 * Маршрут: POST /api/lead
 * Каналы доставки: MAX Bot API + резервное письмо (Resend).
 *
 * Переменные окружения (секреты ставятся через `wrangler secret put`):
 *   MAX_BOT_TOKEN   — токен бота из «MAX для партнёров» → Чат-боты → Настройки
 *   MAX_USER_ID     — user_id получателя заявок в MAX
 *   RESEND_API_KEY  — ключ Resend для дублирования на e-mail
 *   LEAD_EMAIL      — адрес получателя заявок
 *   MAIL_FROM       — подтверждённый отправитель в Resend
 *   ALLOWED_ORIGINS — список origin через запятую (по умолчанию прод-домен)
 */

const MAX_API_URL = 'https://platform-api2.max.ru/messages';
const RESEND_API_URL = 'https://api.resend.com/emails';

const DEFAULT_ORIGINS = ['https://askuyr.github.io'];

const LIMITS = {
  name: 100,
  phone: 32,
  email: 254,
  message: 2000
};

const RATE_WINDOW_SECONDS = 45;

const digits = (value) => String(value || '').replace(/\D/g, '');

function corsHeaders(origin, allowed) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(body, status, origin, allowed) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin, allowed)
    }
  });
}

function validate(payload) {
  const errors = {};

  const name = String(payload.name || '').trim();
  if (name.length < 2) errors.name = 'Укажите имя.';
  if (name.length > LIMITS.name) errors.name = 'Имя слишком длинное.';

  const phone = String(payload.phone || '').trim();
  const phoneDigits = digits(phone).length;
  if (phoneDigits < 10 || phoneDigits > 11) errors.phone = 'Укажите корректный телефон.';

  const email = String(payload.email || '').trim();
  if (email) {
    if (email.length > LIMITS.email) {
      errors.email = 'Адрес слишком длинный.';
    } else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(email)) {
      errors.email = 'Укажите корректный e-mail.';
    }
  }

  const message = String(payload.message || '').trim();
  if (message.length > LIMITS.message) errors.message = 'Сообщение слишком длинное.';

  if (payload.consent !== true) errors.consent = 'Требуется согласие на обработку данных.';

  return {
    errors,
    data: { name, phone, email, message }
  };
}

async function isRateLimited(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const url = new URL(request.url);
  const key = new Request(`${url.origin}/__rate/${encodeURIComponent(ip)}`, { method: 'GET' });

  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return true;

  await cache.put(key, new Response('1', {
    headers: { 'Cache-Control': `max-age=${RATE_WINDOW_SECONDS}` }
  }));
  return false;
}

function buildMessage(data, request) {
  const lines = [
    'Новая заявка с сайта',
    '',
    `Имя: ${data.name}`,
    `Телефон: ${data.phone}`
  ];
  if (data.email) lines.push(`E-mail: ${data.email}`);
  if (data.message) {
    lines.push('', 'Ситуация:', data.message);
  }
  lines.push('', `Страница: ${request.headers.get('Referer') || '—'}`);
  lines.push(`Время (UTC): ${new Date().toISOString()}`);
  return lines.join('\n');
}

async function sendToMax(env, text) {
  if (!env.MAX_BOT_TOKEN || !env.MAX_USER_ID) {
    return { channel: 'max', ok: false, skipped: true, reason: 'not-configured' };
  }

  const response = await fetch(`${MAX_API_URL}?user_id=${encodeURIComponent(env.MAX_USER_ID)}`, {
    method: 'POST',
    headers: {
      'Authorization': env.MAX_BOT_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, disable_link_preview: true })
  });

  if (!response.ok) {
    return { channel: 'max', ok: false, reason: `http-${response.status}` };
  }
  return { channel: 'max', ok: true };
}

async function sendToEmail(env, data, text) {
  if (!env.RESEND_API_KEY || !env.LEAD_EMAIL || !env.MAIL_FROM) {
    return { channel: 'email', ok: false, skipped: true, reason: 'not-configured' };
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.LEAD_EMAIL],
      reply_to: data.email || undefined,
      subject: `Заявка с сайта: ${data.name}`,
      text
    })
  });

  if (!response.ok) {
    return { channel: 'email', ok: false, reason: `http-${response.status}` };
  }
  return { channel: 'email', ok: true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
    }

    if (url.pathname !== '/api/lead') {
      return json({ ok: false, error: 'not-found' }, 404, origin, allowed);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method-not-allowed' }, 405, origin, allowed);
    }

    if (origin && !allowed.includes(origin)) {
      return json({ ok: false, error: 'forbidden-origin' }, 403, origin, allowed);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return json({ ok: false, error: 'invalid-json' }, 400, origin, allowed);
    }

    // Honeypot: заполненное скрытое поле означает бота. Отвечаем как при успехе.
    if (payload.company) {
      return json({ ok: true }, 200, origin, allowed);
    }

    const { errors, data } = validate(payload);
    if (Object.keys(errors).length) {
      return json({ ok: false, error: 'validation', fields: errors }, 422, origin, allowed);
    }

    if (await isRateLimited(request, env)) {
      return json({ ok: false, error: 'rate-limited' }, 429, origin, allowed);
    }

    const text = buildMessage(data, request);

    const results = await Promise.all([
      sendToMax(env, text).catch((error) => ({ channel: 'max', ok: false, reason: String(error) })),
      sendToEmail(env, data, text).catch((error) => ({ channel: 'email', ok: false, reason: String(error) }))
    ]);

    const delivered = results.filter((result) => result.ok);
    const configured = results.filter((result) => !result.skipped);

    if (delivered.length === 0) {
      if (configured.length === 0) {
        return json({ ok: false, error: 'channels-not-configured' }, 503, origin, allowed);
      }
      return json({ ok: false, error: 'delivery-failed', results }, 502, origin, allowed);
    }

    return json({ ok: true, delivered: delivered.map((result) => result.channel) }, 200, origin, allowed);
  }
};
