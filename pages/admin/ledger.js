import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AdminLayout from '../../components/AdminLayout';
import { requireAdminSSR } from '../../lib/auth';
import { api, fmtTime } from '../../lib/client';
import { fmtPoints, KIND_LABEL } from '../../lib/format';

export function getServerSideProps(ctx) {
  const g = requireAdminSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

export default function Ledger() {
  const router = useRouter();
  const member = router.query.member || '';
  const kind = router.query.kind || '';
  const page = Number(router.query.page) || 1;
  const [members, setMembers] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/admin/members').then((j) => setMembers(j.members)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!router.isReady) return;
    setData(null);
    const qs = new URLSearchParams({ page: String(page), ...(member && { member }), ...(kind && { kind }) });
    api(`/api/admin/ledger?${qs}`).then(setData).catch((e) => setErr(e.message));
  }, [router.isReady, member, kind, page]);

  const go = (patch) => {
    const q = { ...(member && { member }), ...(kind && { kind }), ...patch };
    Object.keys(q).forEach((k) => !q[k] && delete q[k]);
    router.push({ pathname: '/admin/ledger', query: q });
  };

  return (
    <AdminLayout title="點數明細">
      <h1>點數明細</h1>
      {err && <div className="err">{err}</div>}
      <div className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <select className="sel" style={{ width: 'auto' }} value={member} onChange={(e) => go({ member: e.target.value, page: '' })}>
            <option value="">全部會員</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.username}）</option>)}
          </select>
          <select className="sel" style={{ width: 'auto' }} value={kind} onChange={(e) => go({ kind: e.target.value, page: '' })}>
            <option value="">全部種類</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {data && <span className="mute">共 {data.total} 筆</span>}
        </div>
        <div className="tbl-wrap">
          {!data ? <p className="mute">讀取中…</p> : !data.rows.length ? <p className="mute">沒有紀錄</p> : (
            <table className="tbl">
              <thead>
                <tr><th>時間</th><th>會員</th><th>種類</th><th>說明</th><th className="num">點數</th><th className="num">餘額</th><th className="num">實際成本</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</td>
                    <td>{r.vf_members?.name || '—'}</td>
                    <td><span className={`tag${r.kind === 'admin_add' ? ' green' : r.kind === 'usage' ? ' pri' : ''}`}>{KIND_LABEL[r.kind]}</span></td>
                    <td>{r.reason}</td>
                    <td className={`num ${Number(r.delta) >= 0 ? 'plus' : 'minus'}`}>{Number(r.delta) >= 0 ? '+' : ''}{fmtPoints(r.delta)}</td>
                    <td className="num">{fmtPoints(r.balance_after)}</td>
                    <td className="num mute">{r.cost_twd != null ? `NT$ ${fmtPoints(r.cost_twd)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.pages > 1 && (
          <div className="pager">
            <button className="btn sm" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>上一頁</button>
            <span className="mute">第 {page} / {data.pages} 頁</span>
            <button className="btn sm" disabled={page >= data.pages} onClick={() => go({ page: String(page + 1) })}>下一頁</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
