import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '../../components/AdminLayout';
import { requireAdminSSR } from '../../lib/auth';
import { api, fmtTime } from '../../lib/client';
import { fmtPoints } from '../../lib/format';

export function getServerSideProps(ctx) {
  const g = requireAdminSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

export default function Members() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState(null); // { type:'new'|'points'|'edit', member }

  const load = () => api('/api/admin/members').then((j) => setList(j.members)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const done = (text) => { setModal(null); setMsg(text); setErr(''); load(); };

  const toggle = async (m) => {
    const to = m.status === 'active' ? 'disabled' : 'active';
    if (to === 'disabled' && !confirm(`確定要停用「${m.name}」？停用後他就不能登入。`)) return;
    try {
      await api('/api/admin/members', 'PATCH', { id: m.id, status: to });
      done(to === 'disabled' ? `已停用 ${m.name}` : `已恢復 ${m.name}`);
    } catch (e) { setErr(e.message); }
  };

  return (
    <AdminLayout title="會員與點數">
      <h1>
        會員與點數
        <button className="btn pri" onClick={() => setModal({ type: 'new' })}>＋ 新增會員</button>
      </h1>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="panel tbl-wrap">
        {!list ? <p className="mute">讀取中…</p> : !list.length ? (
          <p className="mute">還沒有會員。按上面「＋ 新增會員」幫團隊成員開帳號。</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>名字</th><th>帳號</th><th className="num">剩餘點數</th><th className="num">本月用掉</th>
                <th className="num">本月成本</th><th>最後登入</th><th>狀態</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b>{m.note && <div className="mute" style={{ fontSize: 12 }}>{m.note}</div>}</td>
                  <td>{m.username}</td>
                  <td className="num"><b>{fmtPoints(m.points)}</b></td>
                  <td className="num">{fmtPoints(m.month_points)}</td>
                  <td className="num">NT$ {fmtPoints(Math.round(m.month_cost * 10) / 10)}</td>
                  <td className="mute">{fmtTime(m.last_login_at) || '還沒登入過'}</td>
                  <td>{m.status === 'active' ? <span className="tag green">使用中</span> : <span className="tag red">已停用</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm acc" onClick={() => setModal({ type: 'points', member: m })}>加點／扣點</button>{' '}
                    <Link className="btn sm" href={`/admin/ledger?member=${m.id}`}>明細</Link>{' '}
                    <button className="btn sm" onClick={() => setModal({ type: 'edit', member: m })}>修改</button>{' '}
                    <button className={`btn sm${m.status === 'active' ? ' danger' : ''}`} onClick={() => toggle(m)}>
                      {m.status === 'active' ? '停用' : '恢復'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal?.type === 'new' && <NewMember onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'points' && <PointsBox m={modal.member} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'edit' && <EditMember m={modal.member} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function NewMember({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', username: '', password: '', note: '', points: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { member } = await api('/api/admin/members', 'POST', f);
      if (Number(f.points) > 0) {
        await api('/api/admin/points', 'POST', { memberId: member.id, amount: Number(f.points), type: 'add', reason: '開帳號送點' });
      }
      onDone(`已新增 ${member.name}（帳號 ${member.username}）。請把帳號密碼告訴他。`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <Modal title="新增會員" onClose={onClose}>
      <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
        {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
        <div className="fld"><label>名字</label><input className="inp" value={f.name} onChange={set('name')} placeholder="例如：小美" required /></div>
        <div className="fld">
          <label>登入帳號</label>
          <input className="inp" value={f.username} onChange={set('username')} placeholder="例如：amy01" autoComplete="off" required />
          <div className="help">3～30 個英文字母或數字</div>
        </div>
        <div className="fld"><label>密碼（至少 6 個字）</label><input className="inp" value={f.password} onChange={set('password')} autoComplete="new-password" required /></div>
        <div className="fld"><label>先送幾點（可以不填）</label><input className="inp" type="number" min="0" step="1" value={f.points} onChange={set('points')} placeholder="例如：500" /></div>
        <div className="fld"><label>備註（只有後台看得到）</label><input className="inp" value={f.note} onChange={set('note')} /></div>
        <div className="acts">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button className="btn pri" disabled={busy}>{busy ? '建立中…' : '建立帳號'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PointsBox({ m, onClose, onDone }) {
  const [type, setType] = useState('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const j = await api('/api/admin/points', 'POST', { memberId: m.id, amount: Number(amount), type, reason });
      onDone(`${m.name} ${type === 'add' ? '加' : '扣'}了 ${fmtPoints(amount)} 點，現在剩 ${fmtPoints(j.balance)} 點`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <Modal title={`${m.name}：加點／扣點`} onClose={onClose}>
      <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
        {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
        <div className="mute">目前剩 <b style={{ color: 'var(--fg)', fontSize: 18 }}>{fmtPoints(m.points)}</b> 點（1 點＝NT$1）</div>
        <div className="row">
          <label className="row" style={{ gap: 4 }}><input type="radio" checked={type === 'add'} onChange={() => setType('add')} /> 加點</label>
          <label className="row" style={{ gap: 4 }}><input type="radio" checked={type === 'deduct'} onChange={() => setType('deduct')} /> 扣點</label>
        </div>
        <div className="fld">
          <label>點數</label>
          <input className="inp" type="number" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            {[100, 300, 500, 1000].map((n) => (
              <button type="button" key={n} className="btn sm" onClick={() => setAmount(String(n))}>{n}</button>
            ))}
          </div>
        </div>
        <div className="fld"><label>原因（會員看得到）</label><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'add' ? '例如：10 月儲值' : '例如：加錯點數'} /></div>
        <div className="acts">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button className={`btn ${type === 'add' ? 'pri' : 'danger'}`} disabled={busy}>{busy ? '處理中…' : type === 'add' ? '確定加點' : '確定扣點'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditMember({ m, onClose, onDone }) {
  const [f, setF] = useState({ name: m.name, note: m.note || '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api('/api/admin/members', 'PATCH', { id: m.id, name: f.name, note: f.note, password: f.password || undefined });
      onDone(f.password ? `已更新 ${f.name}，新密碼要記得告訴他` : `已更新 ${f.name}`);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <Modal title={`修改：${m.name}（帳號 ${m.username}）`} onClose={onClose}>
      <form style={{ display: 'grid', gap: 12 }} onSubmit={save}>
        {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
        <div className="fld"><label>名字</label><input className="inp" value={f.name} onChange={set('name')} required /></div>
        <div className="fld"><label>備註</label><input className="inp" value={f.note} onChange={set('note')} /></div>
        <div className="fld">
          <label>重設密碼（不改就留空）</label>
          <input className="inp" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder="至少 6 個字" />
        </div>
        <div className="acts">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button className="btn pri" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
        </div>
      </form>
    </Modal>
  );
}
