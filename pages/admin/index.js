import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '../../components/AdminLayout';
import { requireAdminSSR } from '../../lib/auth';
import { api } from '../../lib/client';
import { fmtPoints } from '../../lib/format';

export function getServerSideProps(ctx) {
  const g = requireAdminSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

export default function AdminHome() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/admin/stats').then(setS).catch((e) => setErr(e.message));
  }, []);

  return (
    <AdminLayout title="總覽">
      <h1>總覽</h1>
      {err && <div className="err">{err}</div>}
      <div className="stats">
        <div className="stat"><span>會員人數（使用中）</span><b>{s ? `${s.activeCount} / ${s.memberCount}` : '…'}</b></div>
        <div className="stat"><span>會員剩餘點數合計</span><b>{s ? fmtPoints(s.totalPoints) : '…'}</b></div>
        <div className="stat"><span>本月 AI 用掉的點數</span><b>{s ? fmtPoints(s.monthUsedPoints) : '…'}</b></div>
        <div className="stat"><span>本月 AI 實際成本（NT$）</span><b>{s ? fmtPoints(Math.round(s.monthCost)) : '…'}</b></div>
        <div className="stat"><span>本月加點合計</span><b>{s ? fmtPoints(s.monthAdded) : '…'}</b></div>
      </div>
      <div className="panel">
        <h2>常用</h2>
        <div className="row">
          <Link className="btn pri" href="/admin/members">＋ 新增會員／加點</Link>
          <Link className="btn" href="/admin/ledger">看點數明細</Link>
          <Link className="btn" href="/admin/settings">設定加速器下載網址</Link>
        </div>
      </div>
    </AdminLayout>
  );
}
