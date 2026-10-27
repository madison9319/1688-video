import { useEffect, useState } from 'react';
import StudioLayout from '../components/StudioLayout';
import { requireMemberSSR } from '../lib/auth';
import { api, fmtTime } from '../lib/client';
import { fmtPoints, KIND_LABEL } from '../lib/format';

export function getServerSideProps(ctx) {
  const g = requireMemberSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

export default function Points() {
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/member/me').then((j) => setMe(j.member)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    setData(null);
    api(`/api/member/ledger?page=${page}`).then(setData).catch((e) => setErr(e.message));
  }, [page]);

  return (
    <StudioLayout title="我的點數" me={me}>
      {err && <div className="err">{err}</div>}
      <div className="stats">
        <div className="stat"><span>剩餘點數</span><b style={{ color: 'var(--pri)' }}>{me ? fmtPoints(me.points) : '…'} 點</b></div>
        <div className="stat"><span>怎麼算</span><div style={{ marginTop: 6 }}>1 點＝NT$1。AI 畫圖、配音、做影片都會先顯示要用幾點，確認才扣。點數不夠請找管理員加點。</div></div>
      </div>
      <div className="panel">
        <h2>點數明細</h2>
        <div className="tbl-wrap">
          {!data ? <p className="mute">讀取中…</p> : !data.rows.length ? <p className="mute">還沒有紀錄</p> : (
            <table className="tbl">
              <thead><tr><th>時間</th><th>種類</th><th>說明</th><th className="num">點數</th><th className="num">剩下</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mute" style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</td>
                    <td><span className="tag">{KIND_LABEL[r.kind]}</span></td>
                    <td>{r.reason}</td>
                    <td className={`num ${Number(r.delta) >= 0 ? 'plus' : 'minus'}`}>{Number(r.delta) >= 0 ? '+' : ''}{fmtPoints(r.delta)}</td>
                    <td className="num">{fmtPoints(r.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.pages > 1 && (
          <div className="pager">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
            <span className="mute">第 {page} / {data.pages} 頁</span>
            <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>下一頁</button>
          </div>
        )}
      </div>
    </StudioLayout>
  );
}
