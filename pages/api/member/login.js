import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabase';
import { makeCookie } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!process.env.SUPABASE_URL) return res.status(503).json({ error: '系統尚未連接資料庫' });
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: '請輸入帳號和密碼' });

  const { data: m } = await supabaseAdmin.from('vf_members')
    .select('id, name, password_hash, status').eq('username', username).maybeSingle();
  if (!m || !bcrypt.compareSync(password, m.password_hash)) return res.status(401).json({ error: '帳號或密碼錯誤' });
  if (m.status !== 'active') return res.status(403).json({ error: '此帳號已被停用，請聯絡管理員' });

  await supabaseAdmin.from('vf_members').update({ last_login_at: new Date().toISOString() }).eq('id', m.id);
  res.setHeader('Set-Cookie', makeCookie('member', m.id, m.name));
  return res.status(200).json({ ok: true });
}
