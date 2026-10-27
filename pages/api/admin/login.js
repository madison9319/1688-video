import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabase';
import { makeCookie } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!process.env.SUPABASE_URL) return res.status(503).json({ error: '尚未連接資料庫（.env 還沒填 Supabase）' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '請輸入帳號密碼' });

  const { data: admin } = await supabaseAdmin
    .from('vf_admins')
    .select('id, username, password_hash')
    .eq('username', String(username).trim())
    .maybeSingle();

  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  res.setHeader('Set-Cookie', makeCookie('admin', admin.id, admin.username));
  res.status(200).json({ ok: true });
}
