import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import StudioLayout from '../components/StudioLayout';
import AcceleratorPanel from '../components/AcceleratorPanel';
import { requireMemberSSR } from '../lib/auth';
import { api } from '../lib/client';
import {
  checkAccelerator, isOlder, listProjects, loadProject, saveProject, deleteProject, saveFile, deleteFile, fileUrl, fileB64,
  fetchUrl, prepareStt, startRender, renderStatus, outputUrl, openFile,
} from '../lib/accelerator';
import { uid, photoToB64 } from '../lib/studioState';
import { wordsToLines } from '../lib/recording';
import { newDrama, dramaBody, cutSheet, AGES } from '../lib/drama';
import { fmtPoints } from '../lib/format';
import PostCaption from '../components/studio/PostCaption';

export function getServerSideProps(ctx) {
  const g = requireMemberSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

const MIN_ACCEL = '1.4.0';
const STEPS = ['角色與產品', '30 秒劇本', '分鏡圖', '生成影片', '標題字幕'];
const TALK_STEPS = ['照片與內容', '台詞', '（不用分鏡）', '生成影片', '標題字幕'];
const POLL_MS = 15000;

export default function Drama() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [download, setDownload] = useState({});
  const [accel, setAccel] = useState(null);
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState('');
  const [d, setD] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [quote, setQuote] = useState(null);
  const [titles, setTitles] = useState([]);
  const [render, setRender] = useState(null);
  const [, setTick] = useState(0); // 讓「生成中幾分鐘了」會更新
  const dirty = useRef(false);
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { pid, d };

  useEffect(() => {
    api('/api/member/me').then((j) => { setMe(j.member); setDownload(j.accelerator); }).catch(() => {});
    let alive = true;
    const tick = async () => { const s = await checkAccelerator(); if (alive) setAccel(s); };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const tooOld = !!accel?.online && isOlder(accel.version, MIN_ACCEL);
  const online = !!accel?.online && !tooOld;

  // 打開專案（?p=編號）
  useEffect(() => {
    if (!online || !router.isReady) return;
    const want = typeof router.query.p === 'string' ? router.query.p : '';
    if (want && want === latest.current.pid) return;
    (async () => {
      setProjects((await listProjects().catch(() => [])).filter((x) => x.kind === 'drama'));
      if (!want) {
        router.replace({ pathname: '/drama', query: { p: `d-${uid(10)}` } }, undefined, { shallow: true });
        return;
      }
      let proj;
      try { proj = await loadProject(want); } catch (e) { proj = newDrama(); }
      dirty.current = false;
      setPid(want);
      setD({ ...newDrama(), ...proj });
      setStep(proj.wanVideo ? 5 : proj.cells?.length ? 4 : proj.script ? 2 : 1);
      setErr(''); setMsg(''); setRender(null);
    })();
  }, [online, router.isReady, router.query.p]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const { pid: id, d: proj } = latest.current;
    if (!id || !proj || !dirty.current) return;
    dirty.current = false;
    try {
      await saveProject(id, proj);
      setProjects((list) => (list.some((x) => x.id === id && x.name === (proj.name || '未命名影片')) ? list
        : [{ id, name: proj.name || '未命名影片', kind: 'drama' }, ...list.filter((x) => x.id !== id)]));
    } catch (e) { dirty.current = true; setErr('存檔失敗：請確認本機加速器有開著'); }
  }, []);
  const update = useCallback((fn) => {
    setD((prev) => (prev ? fn(prev) : prev));
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);
  const set = (path, v) => update((prev) => {
    const [a, b] = path.split('.');
    return b ? { ...prev, [a]: { ...prev[a], [b]: v } } : { ...prev, [a]: v };
  });

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

  const run = (label, fn) => async (...args) => {
    setErr(''); setMsg(''); setBusy(label);
    try { await fn(...args); } catch (e) { setErr(e.message); }
    setBusy('');
  };

  // ── 照片 ──
  const savePhoto = async (file, prefix) => {
    const name = `${prefix}_${uid(6)}.jpg`;
    await saveFile(pid, name, await photoToB64(file, 1280));
    return name;
  };
  const setRolePhoto = run('photo', async (who, file) => {
    if (!file) return;
    const name = await savePhoto(file, who);
    if (d[who].photo) deleteFile(pid, d[who].photo);
    set(`${who}.photo`, name);
  });
  const addProductPhotos = run('photo', async (files) => {
    const names = [];
    for (const f of [...files].slice(0, 6)) names.push(await savePhoto(f, 'product'));
    update((prev) => {
      const photos = [...prev.product.photos, ...names].slice(0, 6);
      const use = [...prev.product.use, ...names].filter((n) => photos.includes(n)).slice(0, 3);
      return { ...prev, product: { ...prev.product, photos, use } };
    });
  });
  const toggleUse = (n) => update((prev) => {
    const on = prev.product.use.includes(n);
    if (!on && prev.product.use.length >= 3) return prev;
    return { ...prev, product: { ...prev.product, use: on ? prev.product.use.filter((x) => x !== n) : [...prev.product.use, n] } };
  });
  const removeProductPhoto = (n) => { deleteFile(pid, n); update((prev) => ({ ...prev, product: { ...prev.product, photos: prev.product.photos.filter((x) => x !== n), use: prev.product.use.filter((x) => x !== n) } })); };

  // ── ② 劇本 ──
  const writeScript = run('script', async () => {
    const j = await ai('drama-script', dramaBody(d));
    update((prev) => ({ ...prev, script: j.script, name: prev.name || j.script.title, title: { ...prev.title, text: prev.title.text || j.script.title } }));
    setMsg('✅ 劇本寫好了，可以直接改台詞和畫面描述');
  });
  const setShot = (i, patch) => update((prev) => ({ ...prev, script: { ...prev.script, shots: prev.script.shots.map((s, k) => (k === i ? { ...s, ...patch } : s)) } }));
  const setLine = (i, j, patch) => setShot(i, { lines: d.script.shots[i].lines.map((l, k) => (k === j ? { ...l, ...patch } : l)) });

  // ── ③ 分鏡圖 ──
  const makeCells = async (sheet, grid) => {
    const { cells: b64s } = await cutSheet(fileUrl(pid, sheet), grid);
    if (b64s.length > 9) throw new Error(`這張圖切出 ${b64s.length} 格，萬相最多用 9 格，請換一張 9 格以內的分鏡總圖`);
    const names = [];
    for (const b of b64s) {
      const n = `cell_${uid(6)}.jpg`;
      await saveFile(pid, n, b);
      names.push(n);
    }
    d.cells.forEach((c) => deleteFile(pid, c));
    update((prev) => ({ ...prev, board: sheet, grid: names.length, cells: names }));
    return names.length;
  };
  const drawBoard = run('board', async () => {
    const refs = [];
    if (d.female.photo && (d.roleMode === 'two' || d.narrator === 'female')) refs.push({ kind: 'female', b64: await fileB64(pid, d.female.photo) });
    if (d.male.photo && (d.roleMode === 'two' || d.narrator === 'male')) refs.push({ kind: 'male', b64: await fileB64(pid, d.male.photo) });
    for (const n of d.product.use.slice(0, 4 - refs.length)) refs.push({ kind: 'product', b64: await fileB64(pid, n) });
    setMsg('AI 畫分鏡總圖中（大約 30～60 秒）…');
    const j = await ai('drama-board', { ...dramaBody(d), refs });
    const sheet = `board_${uid(6)}.jpg`;
    await saveFile(pid, sheet, j.b64);
    if (d.board) deleteFile(pid, d.board);
    const n = await makeCells(sheet, 9);
    setMsg(`✅ 分鏡總圖畫好了，也自動切成 ${n} 格。不滿意可以重畫，或換掉某一格`);
  });
  const uploadBoard = run('board', async (file, grid) => {
    if (!file) return;
    const sheet = await savePhoto(file, 'board');
    if (d.board) deleteFile(pid, d.board);
    const n = await makeCells(sheet, grid);
    setMsg(`✅ 已自動找格線切成 ${n} 格`);
  });
  const replaceCell = run('cell', async (i, file) => {
    if (!file) return;
    const n = await savePhoto(file, 'cell');
    deleteFile(pid, d.cells[i]);
    update((prev) => ({ ...prev, cells: prev.cells.map((c, k) => (k === i ? n : c)) }));
  });

  // ── ④ 萬相生成 ──
  useEffect(() => {
    if (step !== 4 || !d) return;
    api('/api/ai/wan-submit', 'POST', { ...dramaBody(d), quote: true, duration: d.gen.duration, resolution: d.gen.resolution }).then((j) => setQuote(j.points)).catch(() => setQuote(null));
  }, [step, d?.gen.duration, d?.gen.resolution]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = run('wan', async () => {
    if (!d.script?.shots?.length) throw new Error('請先在第 2 步寫好劇本');
    const talk = d.mode === 'talk';
    const talkPhoto = d[d.narrator].photo;
    if (talk && !talkPhoto) throw new Error('請先在第 1 步上傳照片');
    if (!talk && !d.cells.length) throw new Error('請先在第 3 步準備分鏡圖');
    if (!confirm(`萬相會把${talk ? '這張照片' : ` ${d.cells.length} 格分鏡`}做成 ${d.gen.duration} 秒的影片（${d.gen.resolution}），要用 ${fmtPoints(quote)} 點。\n生成大約要 5～15 分鐘，失敗會自動退點。確定送出？`)) return;
    const cells = [];
    for (const c of talk ? [talkPhoto] : d.cells) cells.push(await fileB64(pid, c));
    const productB64 = !talk && d.product.use[0] && cells.length < 10 ? await fileB64(pid, d.product.use[0]) : undefined;
    const j = await ai('wan-submit', { ...dramaBody(d), ...d.gen, cells, productB64 });
    update((prev) => ({ ...prev, job: { id: j.jobId, startedAt: Date.now() } }));
    setMsg('✅ 已送出，萬相生成中。可以先去做別的事，回到這頁會自動接著等');
  });

  // 有工作在跑：每 15 秒問一次；做好就下載到電腦
  useEffect(() => {
    if (!d?.job || !online) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api(`/api/ai/wan-status?job=${d.job.id}`);
        if (stop) return;
        if (s.status === 'succeeded') {
          setMsg('萬相做好了，下載到你的電腦中…');
          const name = `wan_${uid(6)}.mp4`;
          await fetchUrl(pid, s.videoUrl, name);
          if (d.wanVideo) deleteFile(pid, d.wanVideo);
          update((prev) => ({ ...prev, job: null, wanVideo: name, words: null, lines: [] }));
          setMsg('🎉 短劇影片做好了！下一步可以加標題和字幕');
          setStep(5);
          return;
        }
        if (s.status === 'failed') {
          update((prev) => ({ ...prev, job: null }));
          setErr(s.error);
          api('/api/member/me').then((j) => setMe(j.member)).catch(() => {});
          return;
        }
      } catch (e) {
        if (!stop) setErr(`查詢進度失敗：${e.message}（會繼續再試）`);
      }
      if (!stop) { setTick((x) => x + 1); setTimeout(tick, POLL_MS); }
    };
    const t = setTimeout(tick, 3000);
    return () => { stop = true; clearTimeout(t); };
  }, [d?.job?.id, online]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ⑤ 標題字幕（不重新生成，只重新剪；第一次要聽打影片的聲音）──
  const aiTitles = run('titles', async () => {
    const lines = (d.script?.shots || []).flatMap((s) => s.lines.map((l) => l.text));
    const j = await ai('titles', { lines });
    setTitles(j.titles);
  });
  const transcribeVideo = async () => {
    setMsg('AI 聽打影片的對白，對齊字幕時間…');
    const stt = await prepareStt(pid, d.wanVideo);
    const b64 = await fileB64(pid, stt.name);
    deleteFile(pid, stt.name);
    const hint = (d.script?.shots || []).flatMap((s) => s.lines.map((l) => l.text)).join('，');
    const j = await ai('transcribe', { b64, duration: stt.duration, hint });
    const lines = wordsToLines(j.words).map((l) => ({ id: uid(), ...l }));
    update((prev) => ({ ...prev, words: j.words, lines }));
    return lines;
  };
  const finish = run('render', async () => {
    let lines = d.lines;
    if (d.subtitle.enabled && !d.words) lines = await transcribeVideo();
    await flush();
    setMsg('剪成片中…');
    const spec = {
      name: d.name || d.title.text || '短劇', preview: false, width: 1080, height: 1920, quality: 'normal',
      syncVideo: true, voiceFile: d.wanVideo,
      lines: lines.map((l) => ({ text: l.text, start: l.start, end: l.end })),
      scenes: [{ file: d.wanVideo, from: 0 }],
      subtitle: d.subtitle, title: d.title, intro: { type: 'none' }, outro: { type: 'none' }, motion: false, transition: 'fade',
    };
    if (!spec.lines.length) spec.lines = [{ text: '', start: 0, end: 0.5 }];
    if (!d.subtitle.enabled) spec.subtitle = { ...d.subtitle, enabled: false };
    const { jobId } = await startRender(pid, spec);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await renderStatus(jobId);
      setRender(s);
      if (s.status === 'running') continue;
      if (s.status === 'error') throw new Error(`剪片失敗：${s.error}`);
      update((prev) => ({ ...prev, lastVideo: { file: s.file, fileName: s.fileName } }));
      setMsg('🎉 成片做好了！');
      return;
    }
  });

  const removeProject = async () => {
    if (!confirm('確定要刪除這支短劇的專案？（照片、分鏡圖、萬相影片都會刪掉；已經做好的成片不會刪）')) return;
    await deleteProject(pid).catch(() => {});
    dirty.current = false;
    setPid('');
    router.push({ pathname: '/drama' }, undefined, { shallow: true });
  };

  const talk = d?.mode === 'talk';
  const steps = talk ? TALK_STEPS : STEPS;
  const photoBox = (who, label) => (
    <div className="role-card">
      <div className="face-pic">{d[who].photo ? <img src={fileUrl(pid, d[who].photo)} alt="" /> : <span>{who === 'female' ? '👩' : '👨'}</span>}</div>
      <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 0 }}>
        <b>{label}</b>
        <input className="inp" value={d[who].name} maxLength={20} onChange={(e) => set(`${who}.name`, e.target.value)} placeholder="名字（可以不填）" />
        <div className="row" style={{ gap: 6 }}>
          <select className="sel" style={{ width: 'auto' }} value={d[who].age} onChange={(e) => set(`${who}.age`, e.target.value)}>{AGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="btn sm">📷 {d[who].photo ? '換大頭照' : '上傳大頭照'}<input type="file" accept="image/*" hidden onChange={(e) => { setRolePhoto(who, e.target.files[0]); e.target.value = ''; }} /></label>
          {d[who].photo && <button className="btn sm" onClick={() => { deleteFile(pid, d[who].photo); set(`${who}.photo`, null); }}>移除</button>}
        </div>
      </div>
    </div>
  );

  return (
    <StudioLayout title="萬相短劇" me={me}>
      {!online ? (
        <div className="panel">
          <h2>💻 先打開本機加速器</h2>
          {tooOld && <div className="err">萬相短劇需要 {MIN_ACCEL} 以上的加速器（你的是 {accel.version}），請下載新版。</div>}
          <AcceleratorPanel download={download} />
        </div>
      ) : !d ? <p className="mute">打開專案中…</p> : (
        <>
          <div className="proj-bar">
            <select className="sel" value={pid} onChange={async (e) => { await flush(); router.push({ pathname: '/drama', query: { p: e.target.value } }, undefined, { shallow: true }); }}>
              {!projects.some((x) => x.id === pid) && <option value={pid}>（新短劇）</option>}
              {projects.map((x) => <option key={x.id} value={x.id}>🎭 {x.name}</option>)}
            </select>
            <input className="inp" value={d.name} maxLength={30} onChange={(e) => set('name', e.target.value)} placeholder="幫這支短劇取個名字" />
            <button className="btn" onClick={async () => { await flush(); router.push({ pathname: '/drama' }, undefined, { shallow: true }); }}>＋ 新短劇</button>
            <button className="btn danger" onClick={removeProject}>🗑</button>
          </div>
          <div className="stepnav">
            {steps.map((s, i) => <button key={s} className={step === i + 1 ? 'on' : ''} onClick={() => setStep(i + 1)}><b>{i + 1}</b>{s}</button>)}
          </div>
          {msg && <div className="ok">{msg}</div>}
          {err && <div className="err">{err}</div>}

          <div className="studio-main">
            {step === 1 && (
              <div className="step" style={{ display: 'grid', gap: 14 }}>
                <div className="chips">
                  <button className={`chip big${!talk ? ' on' : ''}`} onClick={() => set('mode', 'drama')}>🎬 分鏡短劇（1～2 人演出）</button>
                  <button className={`chip big${talk ? ' on' : ''}`} onClick={() => set('mode', 'talk')}>🗣️ 讓照片開口說話</button>
                </div>
                <h2>{talk ? '🗣️ 誰要開口說話？' : '🎭 誰來演？賣什麼？'}</h2>
                {talk && <p className="mute" style={{ margin: 0 }}>上傳一張照片（人或寵物都可以），寫好台詞，萬相會讓照片裡的主角對著鏡頭說話，聲音是 AI 配的。</p>}
                {!talk && <div className="chips">
                  <button className={`chip big${d.roleMode === 'one' ? ' on' : ''}`} onClick={() => set('roleMode', 'one')}>🧍 一個人對著鏡頭說</button>
                  <button className={`chip big${d.roleMode === 'two' ? ' on' : ''}`} onClick={() => set('roleMode', 'two')}>🧑‍🤝‍🧑 兩個人對話</button>
                </div>}
                <div className="row">
                  <span className="mute">{talk ? '配什麼聲音' : d.roleMode === 'two' ? '誰介紹產品（另一個人負責發問和反應）' : '誰來說'}</span>
                  <button className={`chip${d.narrator === 'female' ? ' on' : ''}`} onClick={() => set('narrator', 'female')}>👩 {talk ? '女生聲音' : '女主角'}</button>
                  <button className={`chip${d.narrator === 'male' ? ' on' : ''}`} onClick={() => set('narrator', 'male')}>👨 {talk ? '男生聲音' : '男主角'}</button>
                </div>
                <div className="grid2">
                  {(talk ? d.narrator === 'female' : d.roleMode === 'two' || d.narrator === 'female') && photoBox('female', talk ? '📷 要開口說話的照片' : '👩 女主角')}
                  {(talk ? d.narrator === 'male' : d.roleMode === 'two' || d.narrator === 'male') && photoBox('male', talk ? '📷 要開口說話的照片' : '👨 男主角')}
                </div>
                {!talk && d.roleMode === 'two' && <div className="fld"><label>兩人的關係（可以不填）</label><input className="inp" value={d.relation} maxLength={60} onChange={(e) => set('relation', e.target.value)} placeholder="例如：夫妻、閨蜜、同事、母子" /></div>}
                <p className="mute" style={{ fontSize: 12, margin: 0 }}>🔒 大頭照只用來讓 AI 畫出同一個人，請用自己或已經同意的人的照片（寵物也可以）。</p>

                <h3 style={{ margin: '8px 0 0' }}>🛍️ 產品（沒有產品也可以，就寫純劇情）</h3>
                <div className="fld"><label>產品名稱</label><input className="inp" value={d.product.name} maxLength={60} onChange={(e) => set('product.name', e.target.value)} placeholder="例如：XX 空氣清淨機" /></div>
                <div className="fld"><label>產品說明、賣點（可以直接貼文案）</label><textarea className="ta" rows={4} value={d.product.desc} onChange={(e) => set('product.desc', e.target.value)} /></div>
                <div>
                  <label className="btn sm">📷 上傳產品圖<input type="file" accept="image/*" multiple hidden onChange={(e) => { addProductPhotos(e.target.files); e.target.value = ''; }} /></label>
                  <span className="mute" style={{ fontSize: 13, marginLeft: 8 }}>點圖片可以選／不選（打 ✓ 的會給 AI 當參考，最多 3 張）</span>
                  <div className="thumbs">
                    {d.product.photos.map((n) => (
                      <div key={n} className={`thumb${d.product.use.includes(n) ? ' on' : ''}`} onClick={() => toggleUse(n)}>
                        <img src={fileUrl(pid, n)} alt="" />
                        {d.product.use.includes(n) && <b>✓</b>}
                        <button onClick={(e) => { e.stopPropagation(); removeProductPhoto(n); }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="fld"><label>{talk ? '想講什麼、背景和動作（可以不填）' : '劇本情境'}</label><textarea className="ta" rows={2} value={d.scenario} onChange={(e) => set('scenario', e.target.value)} placeholder={talk ? '例如：在咖啡店裡跟大家打招呼，介紹今天的新品' : '例如：老公下班回家一直打噴嚏，老婆拿出清淨機'} /></div>
                <div className="row">
                  <span className="mute">影片長度</span>
                  <select className="sel" style={{ width: 'auto' }} value={d.seconds} onChange={(e) => { set('seconds', Number(e.target.value)); set('gen.duration', Number(e.target.value)); }}>{[15, 20, 30].map((s) => <option key={s} value={s}>{s} 秒</option>)}</select>
                  <span className="mute">說話速度</span>
                  <select className="sel" style={{ width: 'auto' }} value={d.speed} onChange={(e) => set('speed', e.target.value)}><option value="slow">慢一點</option><option value="normal">自然</option><option value="fast">快一點</option></select>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="step" style={{ display: 'grid', gap: 12 }}>
                <h2>📝 {d.seconds} 秒短劇劇本（9 個鏡頭）</h2>
                <div className="row">
                  <button className="btn pri" disabled={!!busy} onClick={writeScript}>{busy === 'script' ? 'AI 寫劇本中…' : d.script ? '🔄 重寫一份（約 0.1 點）' : '✍️ AI 寫劇本（約 0.1 點）'}</button>
                </div>
                {d.script && d.script.shots.map((s, i) => (
                  <div key={i} className="shot">
                    <b className="shot-no">鏡頭 {i + 1}</b>
                    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                      {s.lines.map((l, j) => (
                        <div key={j} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <select className="sel" style={{ width: 'auto' }} value={l.who} onChange={(e) => setLine(i, j, { who: e.target.value })}>
                            <option value="female">{d.female.name || '女主角'}</option>
                            <option value="male">{d.male.name || '男主角'}</option>
                          </select>
                          <input className="inp" value={l.text} maxLength={60} onChange={(e) => setLine(i, j, { text: e.target.value })} />
                          <button className="btn sm" onClick={() => setShot(i, { lines: s.lines.filter((_, k) => k !== j) })}>✕</button>
                        </div>
                      ))}
                      {s.lines.length < 3 && <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setShot(i, { lines: [...s.lines, { who: d.narrator, text: '' }] })}>＋ 台詞</button>}
                      <textarea className="ta" rows={2} style={{ fontSize: 13 }} value={s.visual} onChange={(e) => setShot(i, { visual: e.target.value })} placeholder="畫面描述（給 AI 畫分鏡用，中英文都可以）" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 3 && talk && (
              <div className="step"><h2>🗣️ 照片開口說話不用分鏡圖</h2><p className="mute">直接到下一步生成影片就可以。</p></div>
            )}
            {step === 3 && !talk && (
              <div className="step" style={{ display: 'grid', gap: 12 }}>
                <h2>🎨 分鏡圖</h2>
                <p className="mute" style={{ margin: 0 }}>AI 會照劇本、你的主角和產品畫一張 9 格分鏡總圖，再自動切成 9 格。也可以上傳自己畫好的分鏡總圖。</p>
                <div className="row">
                  <button className="btn pri" disabled={!!busy || !d.script} onClick={drawBoard}>{busy === 'board' ? '處理中…' : d.board ? '🔄 重畫分鏡總圖（約 1.5 點）' : '🎨 AI 畫 9 格分鏡總圖（約 1.5 點）'}</button>
                  <label className="btn">📤 上傳分鏡總圖（自動切格）<input type="file" accept="image/*" hidden onChange={(e) => { uploadBoard(e.target.files[0], 9); e.target.value = ''; }} /></label>
                </div>
                {!d.script && <div className="err" style={{ margin: 0 }}>請先在第 2 步寫好劇本</div>}
                {d.board && (
                  <div className="board-wrap">
                    <img className="board" src={fileUrl(pid, d.board)} alt="" />
                    <div>
                      <div className="mute" style={{ fontSize: 13, marginBottom: 6 }}>切好的 {d.cells.length} 格（點「換」可以換成自己的圖）</div>
                      <div className="cells">
                        {d.cells.map((c, i) => (
                          <div key={c} className="cell">
                            <img src={fileUrl(pid, c)} alt="" />
                            <b>{i + 1}</b>
                            <label className="btn sm">換<input type="file" accept="image/*" hidden onChange={(e) => { replaceCell(i, e.target.files[0]); e.target.value = ''; }} /></label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="step" style={{ display: 'grid', gap: 12 }}>
                <h2>🎬 萬相 Wan 3.0 生成影片</h2>
                <p className="mute" style={{ margin: 0 }}>{talk ? '讓照片裡的主角對著鏡頭說話，有 AI 原生配音。' : `把 ${d.cells.length || 9} 格分鏡一次做成整支影片（人物、場景、產品前後連戲），有 AI 原生配音。`}</p>
                <div className="grid2">
                  <div className="fld"><label>整支多長</label><select className="sel" value={d.gen.duration} onChange={(e) => set('gen.duration', Number(e.target.value))}>{[10, 15, 20, 25, 30].map((s) => <option key={s} value={s}>{s} 秒</option>)}</select></div>
                  <div className="fld"><label>解析度</label><select className="sel" value={d.gen.resolution} onChange={(e) => set('gen.resolution', e.target.value)}><option value="480P">480P（最便宜，手機上看還可以）</option><option value="720P">720P（推薦，清楚很多，價格是 480P 的兩倍）</option><option value="1080P">1080P（最清楚，價格是 480P 的四倍）</option></select></div>
                  <div className="fld"><label>畫面比例</label><select className="sel" value={d.gen.ratio} onChange={(e) => set('gen.ratio', e.target.value)}><option value="9:16">9:16 直式</option><option value="16:9">16:9 橫式</option><option value="1:1">1:1 方形</option></select></div>
                </div>
                <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={d.gen.audio} onChange={(e) => set('gen.audio', e.target.checked)} /> 🔊 讓 AI 一起做聲音（對白、環境音，價格一樣）</label>
                <div className="summary">
                  <div><span>{talk ? '照片' : '分鏡'}</span><b>{talk ? (d[d.narrator].photo ? '1 張' : '還沒放') : `${d.cells.length} 格`}</b></div>
                  <div><span>長度</span><b>{d.gen.duration} 秒</b></div>
                  <div><span>要用</span><b>{quote == null ? '…' : `${fmtPoints(quote)} 點`}</b></div>
                  <div><span>你剩</span><b>{me ? fmtPoints(me.points) : '…'} 點</b></div>
                </div>
                {d.job ? (
                  <div className="progress-box">
                    <div>⏳ 萬相生成中（{Math.round((Date.now() - d.job.startedAt) / 60000)} 分鐘了），大約要 5～15 分鐘。可以關掉這頁，之後回來會自動接著等。</div>
                    <div className="bar"><i style={{ width: `${Math.min(95, ((Date.now() - d.job.startedAt) / 600000) * 100)}%` }} /></div>
                  </div>
                ) : (
                  <div className="row">
                    <button className="btn pri lg" disabled={!!busy || !d.script || (talk ? !d[d.narrator].photo : !d.cells.length)} onClick={submit}>{busy === 'wan' ? '送出中…' : `🎬 ${talk ? '生成說話影片' : '生成分鏡影片'}（${quote == null ? '…' : fmtPoints(quote)} 點）`}</button>
                    {d.wanVideo && <button className="btn" onClick={() => setStep(5)}>已經有做好的影片 → 去上字幕</button>}
                  </div>
                )}
                <p className="mute" style={{ fontSize: 13, margin: 0 }}>按下去之前會再問一次。萬相失敗會自動退點；成功後影片會自動存到你的電腦。</p>
              </div>
            )}

            {step === 5 && (
              <div className="step" style={{ display: 'grid', gap: 12 }}>
                <h2>🏷️ 標題、字幕</h2>
                {!d.wanVideo ? <p className="mute">還沒有萬相做好的影片，請先到第 4 步生成。</p> : (
                  <>
                    <video src={fileUrl(pid, d.wanVideo)} controls playsInline className="result-video" style={{ maxHeight: 420 }} />
                    <div className="row">
                      <input className="inp" style={{ flex: 1, minWidth: 200 }} value={d.title.text} maxLength={24} onChange={(e) => set('title.text', e.target.value)} placeholder="影片標題（放在畫面上方，不放就留空）" />
                      <button className="btn" disabled={!!busy} onClick={aiTitles}>{busy === 'titles' ? '想標題中…' : '🔥 AI 想 3 個標題'}</button>
                    </div>
                    {titles.length > 0 && <div className="chips">{titles.map((t) => <button key={t} className="chip" onClick={() => set('title.text', t)}>{t}</button>)}</div>}
                    <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={d.subtitle.enabled} onChange={(e) => set('subtitle.enabled', e.target.checked)} /> 🅰 成片加上字幕（AI 聽影片的對白自動對齊，第一次約 0.1 點）</label>
                    {d.lines.length > 0 && d.subtitle.enabled && (
                      <div className="vlines">
                        {d.lines.map((l, i) => (
                          <div key={l.id} className="vline" style={{ gridTemplateColumns: '24px minmax(0,1fr) 60px' }}>
                            <span className="mute">{i + 1}</span>
                            <input className="inp" value={l.text} onChange={(e) => update((prev) => ({ ...prev, lines: prev.lines.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)) }))} />
                            <span className="mute" style={{ fontSize: 12 }}>{l.start.toFixed(1)}s</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="row">
                      <button className="btn pri lg" disabled={!!busy} onClick={finish}>{busy === 'render' ? `剪成片中…${render?.progress ? ` ${render.progress}%` : ''}` : '🎬 做成片（不重新生成、不花萬相的錢）'}</button>
                    </div>
                    {d.lastVideo && (
                      <div className="done-box">
                        <h3>🎉 成片</h3>
                        <video key={d.lastVideo.fileName} src={outputUrl(d.lastVideo.fileName)} controls playsInline className="result-video" />
                        <div className="row"><button className="btn pri" onClick={() => openFile(d.lastVideo.file).catch((e) => setErr(e.message))}>📂 打開影片所在的資料夾</button></div>
                        <PostCaption ai={ai} title={d.title.text} lines={(d.lines.length ? d.lines : (d.script?.shots || []).flatMap((s) => s.lines)).map((l) => l.text)} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="step-foot">
              {step > 1 ? <button className="btn" onClick={() => setStep(step - 1)}>← 上一步</button> : <span />}
              {step < 5 && <button className="btn pri" onClick={() => setStep(step + 1)}>下一步：{steps[step]} →</button>}
            </div>
          </div>
        </>
      )}
    </StudioLayout>
  );
}
