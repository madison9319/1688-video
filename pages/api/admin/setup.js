import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabase';
import { makeCookie } from '../../../lib/session';

// 第一次使用：資料庫裡還沒有任何管理員時，才允許建立第一個帳號
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!process.env.SUPABASE_URL) return res.status(503).json({ error: '尚未連接資料庫（.env 還沒填 Supabase）' });

  const { count } = await supabaseAdmin.from('vf_admins').select('id', { count: 'exact', head: true });
  if (count && count > 0) return res.status(403).json({ error: '已經建立過管理員，請直接登入' });

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (username.length < 3) return res.status(400).json({ error: '帳號至少 3 個字' });
  if (password.length < 8) return res.status(400).json({ error: '密碼至少 8 個字' });

  const { data, error } = await supabaseAdmin
    .from('vf_admins')
    .insert({ username, password_hash: bcrypt.hashSync(password, 10) })
    .select('id, username')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Set-Cookie', makeCookie('admin', data.id, data.username));
  res.status(200).json({ ok: true });
}
