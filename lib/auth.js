import { readSession, clearCookie } from './session';
import { supabaseAdmin } from './supabase';

// ── SSR：後台頁面守衛 ── 回傳 { redirect } 或 { admin }
export function requireAdminSSR(ctx) {
  const s = readSession('admin', ctx.req.headers.cookie);
  if (!s) return { redirect: { destination: '/admin/login', permanent: false } };
  return { admin: s };
}

// ── API：後台 ──
export function requireAdminApi(req, res) {
  const s = readSession('admin', req.headers.cookie);
  if (!s) { res.status(401).json({ error: '未登入或已過期，請重新登入' }); return null; }
  return s;
}

// ── SSR：會員頁面守衛（只看 cookie，資料由頁面自己的 API 讀）──
export function requireMemberSSR(ctx) {
  const s = readSession('member', ctx.req.headers.cookie);
  if (!s) return { redirect: { destination: `/login?next=${encodeURIComponent(ctx.resolvedUrl || '/studio')}`, permanent: false } };
  return { member: s };
}

// ── API：會員（每次都回資料庫確認沒被停用）──
export async function requireMemberApi(req, res) {
  const s = readSession('member', req.headers.cookie);
  if (!s) { res.status(401).json({ error: '請先登入' }); return null; }
  if (!process.env.SUPABASE_URL) { res.status(503).json({ error: '系統尚未連接資料庫' }); return null; }
  const { data: m } = await supabaseAdmin.from('vf_members')
    .select('id, username, name, points, status').eq('id', s.id).maybeSingle();
  if (!m || m.status !== 'active') {
    res.setHeader('Set-Cookie', clearCookie('member'));
    res.status(401).json({ error: m ? '此帳號已被停用，請聯絡管理員' : '請重新登入' });
    return null;
  }
  return m;
}
