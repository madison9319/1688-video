import crypto from 'crypto';

// 兩種登入：後台管理員（8 小時）、會員（30 天），各用各的 cookie
const ROLES = {
  admin: { cookie: 'vf_admin_session', maxAge: 60 * 60 * 8 },
  member: { cookie: 'vf_member_session', maxAge: 60 * 60 * 24 * 30 },
};
const SECRET = () => process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';

function sign(value) {
  return crypto.createHmac('sha256', SECRET()).update(value).digest('hex');
}

export function makeCookie(role, id, name) {
  const { cookie, maxAge } = ROLES[role];
  const expires = Date.now() + maxAge * 1000;
  const payload = `${role}.${id}.${expires}`;
  const value = encodeURIComponent(`${payload}.${sign(payload)}.${Buffer.from(String(name || '')).toString('base64')}`);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${cookie}=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function clearCookie(role) {
  return `${ROLES[role].cookie}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readSession(role, cookieHeader) {
  const m = (cookieHeader || '').match(new RegExp(`${ROLES[role].cookie}=([^;]+)`));
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length < 4) return null;
  const nameB64 = parts.pop();
  const sig = parts.pop();
  const payload = parts.join('.');
  if (sign(payload) !== sig) return null;
  const [r, id, expiresStr] = payload.split('.');
  if (r !== role) return null;
  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return null;
  let name = '';
  try { name = Buffer.from(nameB64, 'base64').toString('utf8'); } catch (e) {}
  return { id, name };
}
