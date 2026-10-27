import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { readSession } from '../lib/session';

export function getServerSideProps({ req, query }) {
  if (readSession('member', req.headers.cookie)) {
    return { redirect: { destination: safeNext(query.next), permanent: false } };
  }
  return { props: {} };
}

// 只允許跳回本站頁面
function safeNext(n) {
  return typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : '/studio';
}

export default function Login() {
  const router = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const r = await fetch('/api/member/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error || '登入失敗');
    router.push(safeNext(router.query.next));
  };

  return (
    <>
      <Head>
        <title>登入｜1688影片工廠</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="login-wrap">
        <form className="login" onSubmit={submit}>
          <div className="logo">🎬</div>
          <h1>1688影片工廠</h1>
          <p className="sub">AI 自動做短影音：配圖 × 配音 × 字幕</p>
          {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
          <div className="fld">
            <label htmlFor="u">帳號</label>
            <input id="u" className="inp" value={username} onChange={(e) => setU(e.target.value)} autoComplete="username" required />
          </div>
          <div className="fld">
            <label htmlFor="p">密碼</label>
            <input id="p" className="inp" type="password" value={password} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn pri lg" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
          <p className="sub" style={{ margin: 0 }}>還沒有帳號？請向管理員申請</p>
        </form>
      </div>
    </>
  );
}
