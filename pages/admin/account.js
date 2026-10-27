import { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { requireAdminSSR } from '../../lib/auth';
import { api } from '../../lib/client';

export function getServerSideProps(ctx) {
  const g = requireAdminSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: { username: g.admin.name } };
}

export default function Account({ username }) {
  const [f, setF] = useState({ oldPassword: '', newPassword: '', again: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (f.newPassword !== f.again) return setErr('兩次輸入的新密碼不一樣');
    try {
      await api('/api/admin/account', 'PUT', f);
      setMsg('密碼已更新，下次登入請用新密碼');
      setF({ oldPassword: '', newPassword: '', again: '' });
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <AdminLayout title="修改密碼">
      <h1>修改密碼</h1>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <form className="panel" style={{ maxWidth: 440, display: 'grid', gap: 14 }} onSubmit={save}>
        <div style={{ color: 'var(--mute)' }}>目前帳號：<b style={{ color: 'var(--fg)' }}>{username}</b></div>
        <div className="fld">
          <label htmlFor="op">目前密碼</label>
          <input id="op" className="inp" type="password" value={f.oldPassword} onChange={set('oldPassword')} autoComplete="current-password" required />
        </div>
        <div className="fld">
          <label htmlFor="np">新密碼（至少 8 個字）</label>
          <input id="np" className="inp" type="password" value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" required />
        </div>
        <div className="fld">
          <label htmlFor="np2">再輸入一次新密碼</label>
          <input id="np2" className="inp" type="password" value={f.again} onChange={set('again')} autoComplete="new-password" required />
        </div>
        <button className="btn pri">更新密碼</button>
      </form>
    </AdminLayout>
  );
}
