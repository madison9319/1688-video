import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../../../lib/supabase';
import { requireAdminApi } from '../../../lib/auth';

// 修改後台密碼
export default async function handler(req, res) {
  const s = requireAdminApi(req, res);
  if (!s) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method Not Allowed' });

  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '請輸入目前密碼與新密碼' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: '新密碼至少 8 個字' });

  const { data: admin } = await supabaseAdmin.from('vf_admins').select('id, password_hash').eq('id', s.id).maybeSingle();
  if (!admin || !bcrypt.compareSync(String(oldPassword), admin.password_hash)) {
    return res.status(400).json({ error: '目前密碼不正確' });
  }
  const { error } = await supabaseAdmin
    .from('vf_admins').update({ password_hash: bcrypt.hashSync(String(newPassword), 10) }).eq('id', s.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
}
