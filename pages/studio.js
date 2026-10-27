import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import StudioLayout from '../components/StudioLayout';
import AcceleratorPanel from '../components/AcceleratorPanel';
import StepScript from '../components/studio/StepScript';
import StepScenes from '../components/studio/StepScenes';
import StepVoice from '../components/studio/StepVoice';
import StepStyle from '../components/studio/StepStyle';
import StepRender from '../components/studio/StepRender';
import PhonePreview from '../components/studio/PhonePreview';
import { requireMemberSSR } from '../lib/auth';
import { api } from '../lib/client';
import { checkAccelerator, listProjects, loadProject, saveProject, deleteProject, isOlder, applyStyle } from '../lib/accelerator';
import { newProject, uid, applyStyleTo } from '../lib/studioState';

export function getServerSideProps(ctx) {
  const g = requireMemberSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

const STEPS = ['寫文稿', '放畫面', '配聲音', '標題字幕', '做影片'];
const MIN_ACCEL = '1.4.0';

export default function Studio() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [download, setDownload] = useState({});
  const [prices, setPrices] = useState(null);
  const [accel, setAccel] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState('');
  const [p, setP] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [pickId, setPickId] = useState(null);
  const dirty = useRef(false);
  const saveTimer = useRef(null);
  const latest = useRef({ pid: '', p: null });
  latest.current = { pid, p };

  // 會員資料、價格
  useEffect(() => {
    api('/api/member/me').then((j) => { setMe(j.member); setDownload(j.accelerator); setPrices(j.prices); }).catch(() => {});
  }, []);

  // 加速器狀態：沒連上時每 5 秒再試
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await checkAccelerator();
      if (alive) setAccel(s);
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  // 做影片功能需要 1.4.0 以上的加速器
  const tooOld = !!accel?.online && isOlder(accel.version, MIN_ACCEL);
  const online = !!accel?.online && !tooOld;

  // 打開專案（網址 ?p=專案編號；沒有就開新的）
  useEffect(() => {
    if (!online || !router.isReady) return;
    const want = typeof router.query.p === 'string' ? router.query.p : '';
    if (want && want === latest.current.pid) return;
    (async () => {
      setProjects((await listProjects().catch(() => [])).filter((x) => x.kind !== 'drama'));
      if (!want) {
        const id = `v-${uid(10)}`;
        router.replace({ pathname: '/studio', query: { p: id } }, undefined, { shallow: true });
        return;
      }
      let proj;
      try {
        proj = await loadProject(want);
      } catch (e) {
        // 新影片：套用「我的固定樣式」
        proj = applyStyleTo(newProject(), await applyStyle(want).catch(() => null));
      }
      dirty.current = false;
      setPid(want);
      setP({ ...newProject(), ...proj, _loadedAt: Date.now() });
      setStep(proj.lines?.length ? (proj.scenes?.some((s) => s.file) ? 5 : 2) : 1);
    })();
  }, [online, router.isReady, router.query.p]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自動存檔（改完 0.8 秒後存到電腦）
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const { pid: id, p: proj } = latest.current;
    if (!id || !proj || !dirty.current) return;
    dirty.current = false;
    const { _loadedAt, ...data } = proj;
    try {
      await saveProject(id, data);
      setSaveErr('');
      // 新專案第一次存檔、或改了名字 → 更新上方的專案清單
      setProjects((list) => {
        const name = data.name || '未命名影片';
        const hit = list.find((x) => x.id === id);
        if (hit && hit.name === name) return list;
        return [{ id, name, updatedAt: Date.now() }, ...list.filter((x) => x.id !== id)];
      });
    } catch (e) {
      dirty.current = true;
      setSaveErr('存檔失敗：請確認本機加速器有開著');
    }
  }, []);
  const update = useCallback((fn) => {
    setP((prev) => (prev ? fn(prev) : prev));
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 800);
  }, [flush]);
  useEffect(() => {
    const h = () => { flush(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [flush]);

  // 呼叫 AI（伺服器扣點），回來順便更新右上角點數
  const ai = useCallback(async (kind, body) => {
    try {
      const j = await api(`/api/ai/${kind}`, 'POST', body);
      if (j.balance != null) setMe((m) => (m ? { ...m, points: j.balance } : m));
      return j;
    } catch (e) {
      api('/api/member/me').then((j) => setMe(j.member)).catch(() => {});
      throw e;
    }
  }, []);

  const openProject = async (id) => {
    await flush();
    router.push({ pathname: '/studio', query: id ? { p: id } : {} }, undefined, { shallow: true });
  };
  const removeProject = async () => {
    if (!confirm('確定要刪除這支影片的專案？（文稿、AI 圖、配音都會刪掉；已經做好的影片檔不會刪）')) return;
    await deleteProject(pid).catch(() => {});
    dirty.current = false;
    setPid('');
    openProject('');
  };

  const stepProps = { p, pid, update, ai, prices, busy, setBusy };

  return (
    <StudioLayout title="做影片" me={me}>
      {!online ? (
        <div className="panel">
          <h2>💻 先打開本機加速器</h2>
          {tooOld && <div className="err">你電腦上的加速器是舊版（{accel.version}），做影片需要 {MIN_ACCEL} 以上。請關掉黑色視窗，下載新版解壓縮後再打開。</div>}
          <AcceleratorPanel download={download} />
        </div>
      ) : !p ? (
        <p className="mute">打開專案中…</p>
      ) : (
        <>
          {prices && !prices.aiReady && <div className="err">管理員還沒設定 AI 金鑰，AI 寫稿、畫圖、配音暫時不能用（自己的照片和文稿還是可以做影片）。</div>}
          {saveErr && <div className="err">{saveErr}</div>}
          <div className="proj-bar">
            <select className="sel" value={pid} onChange={(e) => openProject(e.target.value)}>
              {!projects.some((x) => x.id === pid) && <option value={pid}>（新影片）</option>}
              {projects.map((x) => <option key={x.id} value={x.id}>📁 {x.name}</option>)}
            </select>
            <input className="inp" value={p.name} maxLength={30} onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))} placeholder="幫這支影片取個名字（存檔用）" />
            <button className="btn" onClick={() => openProject('')}>＋ 新影片</button>
            <button className="btn danger" onClick={removeProject}>🗑</button>
          </div>

          <div className="stepnav">
            {STEPS.map((s, i) => (
              <button key={s} className={step === i + 1 ? 'on' : ''} onClick={() => setStep(i + 1)}>
                <b>{i + 1}</b>{s}
              </button>
            ))}
          </div>

          <div className="studio">
            <div className="studio-main">
              {step === 1 && <StepScript {...stepProps} />}
              {step === 2 && <StepScenes {...stepProps} onPick={setPickId} />}
              {step === 3 && <StepVoice {...stepProps} />}
              {step === 4 && <StepStyle {...stepProps} />}
              {step === 5 && <StepRender {...stepProps} flush={flush} goStep={setStep} />}
              <div className="step-foot">
                {step > 1 ? <button className="btn" onClick={() => setStep(step - 1)}>← 上一步</button> : <span />}
                {step < 5 && <button className="btn pri" onClick={() => setStep(step + 1)}>下一步：{STEPS[step]} →</button>}
              </div>
            </div>
            <aside className="studio-side">
              <PhonePreview p={p} pid={pid} pickId={pickId} />
            </aside>
          </div>
        </>
      )}
    </StudioLayout>
  );
}
