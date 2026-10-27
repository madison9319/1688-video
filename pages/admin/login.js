import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { readSession } from '../../lib/session';
import { supabaseAdmin } from '../../lib/supabase';

export async function getServerSideProps({ req }) {
  if (readSession('admin', req.headers.cookie)) return { redirect: { destination: '/admin', permanent: false } };
  if (!process.env.SUPABASE_URL) return { props: { noDb: true, needsSetup: false } };
  const { count } = await supabaseAdmin.from('vf_admins').select('id', { count: 'exact', head: true });
  return { props: { noDb: false, needsSetup: !count } };
}

export default function Login({ noDb, needsSetup }) {
  const router = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [password2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (needsSetup && password !== password2) return setErr('兩次輸入的密碼不一樣');
    setBusy(true);
    const r = await fetch(needsSetup ? '/api/admin/setup' : '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || '登入失敗');
    router.push('/admin');
  };

  return (
    <>
      <Head>
        <title>後台登入｜1688影片工廠</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="login-wrap">
        <form className="login" onSubmit={submit}>
          <h1>1688影片工廠 後台</h1>
          {noDb && <div className="err">還沒連接資料庫：請先在 .env 填好 Supabase 設定。</div>}
          {needsSetup && <p>第一次使用，請建立管理員帳號</p>}
          {err && <div className="err">{err}</div>}
          <div className="fld">
            <label htmlFor="u">帳號</label>
            <input id="u" className="inp" value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" required />
          </div>
          <div className="fld">
            <label htmlFor="p">密碼{needsSetup && '（至少 8 個字）'}</label>
            <input id="p" className="inp" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete={needsSetup ? 'new-password' : 'current-password'} required />
          </div>
          {needsSetup && (
            <div className="fld">
              <label htmlFor="p2">再輸入一次密碼</label>
              <input id="p2" className="inp" type="password" value={password2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" required />
            </div>
          )}
          <button className="btn pri" style={{ padding: 11, fontSize: 16 }} disabled={busy || noDb}>
            {busy ? '處理中…' : needsSetup ? '建立帳號並登入' : '登入'}
          </button>
        </form>
      </div>
    </>
  );
}
