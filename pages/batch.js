import { useEffect, useRef, useState } from 'react';
import StudioLayout from '../components/StudioLayout';
import AcceleratorPanel from '../components/AcceleratorPanel';
import { requireMemberSSR } from '../lib/auth';
import { api } from '../lib/client';
import { checkAccelerator, listProjects, loadProject, saveFile, uploadRaw, probeFile, isOlder, openOutputFolder, applyStyle } from '../lib/accelerator';
import { newProject, uid, syncLines, suggestSceneCount, photoToB64, applyStyleTo } from '../lib/studioState';
import { autoMake } from '../lib/pipeline';
import { WRITE_STYLES, IMAGE_STYLES, QUALITIES, ASPECTS, VOICES, TONES } from '../lib/studioOptions';
import { fmtPoints } from '../lib/format';

export function getServerSideProps(ctx) {
  const g = requireMemberSSR(ctx);
  return g.redirect ? { redirect: g.redirect } : { props: {} };
}

const MIN_ACCEL = '1.4.0';
const isVideo = (f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name);

// 一次做好幾支：每支文稿不同、素材不重複，全部自動做完
export default function Batch() {
  const [me, setMe] = useState(null);
  const [prices, setPrices] = useState(null);
  const [download, setDownload] = useState({});
  const [accel, setAccel] = useState(null);
  const [projects, setProjects] = useState([]);

  // 文稿
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('story');
  const [seconds, setSeconds] = useState(45);
  const [count, setCount] = useState(3);
  const [scripts, setScripts] = useState(['']);
  // 畫面、聲音、樣式
  const [source, setSource] = useState('ai'); // ai／photos
  const [aspect, setAspect] = useState('9:16');
  const [imageStyle, setImageStyle] = useState('photo');
  const [quality, setQuality] = useState('medium');
  const [sceneCount, setSceneCount] = useState(0); // 0＝自動
  const [face, setFace] = useState(null); // File
  const [pool, setPool] = useState([]); // File[]
  const [voice, setVoice] = useState({ mode: 'ai', voice: 'nova', tone: 'natural', speed: 1 });
  const [bgm, setBgm] = useState(null); // File
  const [wantTitle, setWantTitle] = useState(true);
  const [template, setTemplate] = useState('');
  // 執行
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]); // [{ name, status, log, pid, file }]
  const stopRef = useRef(false);

  useEffect(() => {
    api('/api/member/me').then((j) => { setMe(j.member); setPrices(j.prices); setDownload(j.accelerator); }).catch(() => {});
    let alive = true;
    const tick = async () => { const s = await checkAccelerator(); if (alive) setAccel(s); };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const online = !!accel?.online && !isOlder(accel.version, MIN_ACCEL);
  useEffect(() => { if (online) listProjects().then((l) => setProjects(l.filter((x) => x.kind !== 'drama'))).catch(() => {}); }, [online]);

  const ai = async (kind, body) => {
    const j = await api(`/api/ai/${kind}`, 'POST', body);
    if (j.balance != null) setMe((m) => (m ? { ...m, points: j.balance } : m));
    return j;
  };

  const write = async () => {
    setErr(''); setBusy('write');
    try {
      const j = await ai('write', { topic, style, seconds, count });
      setScripts(j.scripts.map((s) => s.join('\n')));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const valid = scripts.map((s) => s.trim()).filter(Boolean);
  const lineCounts = valid.map((s) => s.split('\n').filter((l) => l.trim()).length);
  const chars = valid.reduce((a, s) => a + s.replace(/\s/g, '').length, 0);
  const scenesPer = valid.map((s) => sceneCount || suggestSceneCount({ lines: syncLines([], s) }));
  const imgPrice = (prices?.image?.[quality] ?? 0) + (face ? prices?.face ?? 0 : 0);
  const estimate = Math.round((
    (source === 'ai' ? scenesPer.reduce((a, n) => a + n, 0) * imgPrice + valid.length * 0.05 : 0)
    + (voice.mode === 'ai' ? (chars / 100) * (prices?.ttsPer100 ?? 0) : 0)
    + (wantTitle ? valid.length * 0.01 : 0)
  ) * 100) / 100;

  // 照片／影片平均分給每支影片，盡量不重複
  const splitPool = () => {
    const groups = valid.map(() => []);
    pool.forEach((f, i) => groups[i % valid.length].push(f));
    return groups.map((g, i) => (g.length ? g : [pool[i % pool.length]]));
  };

  const start = async () => {
    setErr('');
    if (!valid.length) return setErr('請先準備文稿');
    if (source === 'photos' && !pool.length) return setErr('請先放照片或影片');
    if (me && estimate > me.points) return setErr(`點數不夠：大約要 ${fmtPoints(estimate)} 點，你剩 ${fmtPoints(me.points)} 點`);
    if (!confirm(`要一次做 ${valid.length} 支影片，大約會用 ${fmtPoints(estimate)} 點，確定開始？\n（做的時候不要關掉這個網頁和加速器）`)) return;
    stopRef.current = false;
    setBusy('run');
    let tpl = null;
    if (template && template !== '__mine') tpl = await loadProject(template).catch(() => null);
    const groups = source === 'photos' ? splitPool() : [];
    const list = valid.map((s, i) => ({ name: `第 ${i + 1} 支`, status: 'wait', log: '等待中', pid: `v-${uid(10)}`, file: null }));
    setJobs(list);
    const setJob = (i, patch) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));

    for (let i = 0; i < valid.length; i++) {
      if (stopRef.current) { setJob(i, { status: 'stop', log: '已停止' }); continue; }
      const job = list[i];
      setJob(i, { status: 'run', log: '準備素材' });
      try {
        // 選「我的固定樣式」：樣式的檔案（Logo、音樂）複製到這支影片的資料夾
        const base = template === '__mine' ? applyStyleTo(newProject(), await applyStyle(job.pid).catch(() => null)) : newProject();
        const p = {
          ...base,
          ...(tpl && { subtitle: tpl.subtitle, title: { ...tpl.title, text: '' }, intro: { ...tpl.intro, text: '' }, outro: tpl.outro, motion: tpl.motion, output: tpl.output }),
          name: '',
          aspect, imageStyle, quality, voice, sceneCount: sceneCount || 0,
          lines: syncLines([], valid[i]),
        };
        // 素材放進這支影片的專案資料夾
        let photos = null;
        if (source === 'photos') {
          photos = [];
          for (const f of groups[i]) {
            const id = uid();
            if (isVideo(f)) {
              const name = `clip_${id}.${(f.name.match(/\.(mp4|mov|m4v|webm)$/i)?.[1] || 'mp4').toLowerCase()}`;
              await uploadRaw(job.pid, name, f);
              const info = await probeFile(job.pid, name);
              photos.push({ file: name, thumb: info.thumb, kind: 'video' });
            } else {
              const name = `photo_${id}.jpg`;
              await saveFile(job.pid, name, await photoToB64(f));
              photos.push({ file: name, kind: 'image' });
            }
          }
        }
        let faceFile = null;
        if (face && source === 'ai') {
          faceFile = `face_${uid(6)}.jpg`;
          await saveFile(job.pid, faceFile, await photoToB64(face, 1024));
          p.face = { file: faceFile };
        }
        if (bgm) {
          const ext = (bgm.name.match(/\.(mp3|m4a|wav)$/i)?.[1] || 'mp3').toLowerCase();
          const name = `bgm_${uid(6)}.${ext}`;
          await uploadRaw(job.pid, name, bgm);
          p.bgm = { file: name, name: bgm.name, volume: voice.mode === 'ai' ? 0.12 : 0.5 };
        }
        const done = await autoMake({ pid: job.pid, project: p, ai, photos, faceFile, wantTitle, log: (t) => setJob(i, { log: t }) });
        setJob(i, { status: 'done', log: '完成', name: done.title.text || job.name, file: done.lastVideo.fileName });
      } catch (e) {
        setJob(i, { status: 'error', log: e.message });
        if (/點數不夠/.test(e.message)) stopRef.current = true;
      }
    }
    setBusy('');
    listProjects().then((l) => setProjects(l.filter((x) => x.kind !== 'drama'))).catch(() => {});
  };

  const cell = { display: 'grid', gap: 12 };

  return (
    <StudioLayout title="一次做好幾支" me={me}>
      {!online ? (
        <div className="panel">
          <h2>💻 先打開本機加速器</h2>
          {accel?.online && <div className="err">這個功能需要 {MIN_ACCEL} 以上的加速器（你的是 {accel.version}），請下載新版。</div>}
          <AcceleratorPanel download={download} />
        </div>
      ) : (
        <>
          <section className="hero" style={{ padding: '20px 22px' }}>
            <h1>📦 一次做好幾支影片</h1>
            <p>每支的文稿不一樣、素材不重複；設定好按一下，AI 畫圖、配音、剪片全部自動做完。</p>
          </section>
          {err && <div className="err">{err}</div>}

          <div className="panel" style={cell}>
            <h2 style={{ margin: 0 }}>① 文稿（每支一篇）</h2>
            <div className="ai-box open">
              <div className="ai-body" style={{ paddingTop: 14 }}>
                <div className="fld"><label>✨ AI 幫我寫：想講什麼</label><textarea className="ta" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：上班族的 5 個健康小習慣" /></div>
                <div className="chips">{WRITE_STYLES.map(([k, v]) => <button key={k} className={`chip${style === k ? ' on' : ''}`} onClick={() => setStyle(k)}>{v}</button>)}</div>
                <div className="row">
                  <span className="mute">每支</span>
                  <select className="sel" style={{ width: 'auto' }} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>{[30, 45, 60, 90].map((s) => <option key={s} value={s}>{s} 秒</option>)}</select>
                  <span className="mute">寫</span>
                  <select className="sel" style={{ width: 'auto' }} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[2, 3, 4, 5].map((s) => <option key={s} value={s}>{s} 篇</option>)}</select>
                  <button className="btn pri" disabled={!!busy || !topic.trim()} onClick={write}>{busy === 'write' ? 'AI 寫稿中…' : '✨ 幫我寫（約 0.1 點）'}</button>
                </div>
              </div>
            </div>
            <p className="mute" style={{ margin: 0, fontSize: 13 }}>也可以自己貼：每支一個框，一句一行。</p>
            {scripts.map((s, i) => (
              <div key={i} className="fld">
                <label>第 {i + 1} 支（{s.split('\n').filter((l) => l.trim()).length} 句）{scripts.length > 1 && <button className="btn sm danger" style={{ marginLeft: 8 }} onClick={() => setScripts(scripts.filter((_, k) => k !== i))}>刪掉</button>}</label>
                <textarea className="ta" rows={5} value={s} onChange={(e) => setScripts(scripts.map((x, k) => (k === i ? e.target.value : x)))} />
              </div>
            ))}
            <div><button className="btn sm" onClick={() => setScripts([...scripts, ''])}>＋ 再加一支</button></div>
          </div>

          <div className="panel" style={cell}>
            <h2 style={{ margin: 0 }}>② 畫面</h2>
            <div className="chips">
              <button className={`chip big${source === 'ai' ? ' on' : ''}`} onClick={() => setSource('ai')}>🎨 AI 畫圖</button>
              <button className={`chip big${source === 'photos' ? ' on' : ''}`} onClick={() => setSource('photos')}>📷 用我的照片、影片（平均分給每支，不重複）</button>
            </div>
            <div className="grid2">
              <div className="fld"><label>畫面比例</label><select className="sel" value={aspect} onChange={(e) => setAspect(e.target.value)}>{ASPECTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {source === 'ai' && <>
                <div className="fld"><label>畫圖風格</label><select className="sel" value={imageStyle} onChange={(e) => setImageStyle(e.target.value)}>{IMAGE_STYLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="fld"><label>畫質</label><select className="sel" value={quality} onChange={(e) => setQuality(e.target.value)}>{QUALITIES.map(([k, v]) => <option key={k} value={k}>{v}：{fmtPoints(prices?.image?.[k] ?? 0)} 點</option>)}</select></div>
                <div className="fld"><label>每支幾張圖</label><select className="sel" value={sceneCount} onChange={(e) => setSceneCount(Number(e.target.value))}><option value={0}>自動（約每 5 秒一張）</option>{[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} 張</option>)}</select></div>
              </>}
            </div>
            {source === 'ai' ? (
              <div className="row">
                <label className="btn sm">🧑 {face ? `主角頭照：${face.name}` : '固定主角：上傳頭照（可以跳過）'}<input type="file" accept="image/*" hidden onChange={(e) => { setFace(e.target.files[0] || null); e.target.value = ''; }} /></label>
                {face && <button className="btn sm" onClick={() => setFace(null)}>不用頭照</button>}
              </div>
            ) : (
              <div className="row">
                <label className="btn">📷 選照片、短影片（可以一次選很多個）<input type="file" multiple accept="image/*,video/mp4,video/quicktime,.mov,.mp4,.m4v" hidden onChange={(e) => { setPool([...pool, ...e.target.files]); e.target.value = ''; }} /></label>
                <span className="mute">已選 {pool.length} 個（照片 {pool.filter((f) => !isVideo(f)).length}、影片 {pool.filter(isVideo).length}）</span>
                {pool.length > 0 && <button className="btn sm" onClick={() => setPool([])}>清空</button>}
                {pool.length > 0 && valid.length > 0 && <span className="mute">→ 每支大約分到 {Math.max(1, Math.floor(pool.length / valid.length))} 個</span>}
              </div>
            )}
          </div>

          <div className="panel" style={cell}>
            <h2 style={{ margin: 0 }}>③ 聲音、標題、樣式</h2>
            <div className="chips">
              <button className={`chip${voice.mode === 'ai' ? ' on' : ''}`} onClick={() => setVoice({ ...voice, mode: 'ai' })}>🤖 AI 配音</button>
              <button className={`chip${voice.mode === 'none' ? ' on' : ''}`} onClick={() => setVoice({ ...voice, mode: 'none' })}>🔇 不要人聲</button>
            </div>
            {voice.mode === 'ai' && (
              <div className="grid2">
                <div className="fld"><label>聲音</label><select className="sel" value={voice.voice} onChange={(e) => setVoice({ ...voice, voice: e.target.value })}>{VOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="fld"><label>語氣</label><select className="sel" value={voice.tone} onChange={(e) => setVoice({ ...voice, tone: e.target.value })}>{TONES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
            )}
            <div className="row">
              <label className="btn sm">🎵 {bgm ? `背景音樂：${bgm.name}` : '背景音樂（可以不放）'}<input type="file" accept=".mp3,.m4a,.wav,audio/*" hidden onChange={(e) => { setBgm(e.target.files[0] || null); e.target.value = ''; }} /></label>
              {bgm && <button className="btn sm" onClick={() => setBgm(null)}>不要音樂</button>}
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={wantTitle} onChange={(e) => setWantTitle(e.target.checked)} /> 🔥 每支讓 AI 想標題（放在上方和片頭）</label>
            </div>
            <div className="fld" style={{ maxWidth: 420 }}>
              <label>字幕、片頭片尾的樣子</label>
              <select className="sel" value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">用預設樣式</option>
                <option value="__mine">用我的固定樣式（含 Logo、音樂）</option>
                {projects.map((x) => <option key={x.id} value={x.id}>跟「{x.name}」一樣</option>)}
              </select>
            </div>
          </div>

          <div className="panel" style={cell}>
            <h2 style={{ margin: 0 }}>④ 開始</h2>
            <div className="summary">
              <div><span>影片</span><b>{valid.length} 支</b></div>
              <div><span>文稿</span><b>{lineCounts.reduce((a, n) => a + n, 0)} 句</b></div>
              <div><span>大約要用</span><b>{fmtPoints(estimate)} 點</b></div>
              <div><span>你剩</span><b>{me ? fmtPoints(me.points) : '…'} 點</b></div>
            </div>
            <div className="row">
              <button className="btn pri lg" disabled={!!busy || !valid.length} onClick={start}>{busy === 'run' ? '做影片中…' : `🎬 開始做 ${valid.length} 支影片`}</button>
              {busy === 'run' && <button className="btn" onClick={() => { stopRef.current = true; }}>⏹ 做完這支就停</button>}
            </div>
            <p className="mute" style={{ margin: 0, fontSize: 13 }}>一支一支依序做；做的時候不要關掉這個網頁和加速器。每支都會存成專案，做完可以到「做影片」打開來修改。</p>
            {jobs.length > 0 && (
              <div className="vlines" style={{ maxHeight: 'none' }}>
                {jobs.map((j, i) => (
                  <div key={i} className="vline" style={{ gridTemplateColumns: '28px minmax(0,1fr) minmax(0,1.4fr) auto' }}>
                    <span>{{ wait: '⏳', run: '🔄', done: '✅', error: '❌', stop: '⏹' }[j.status]}</span>
                    <b className="vtext">{j.name}</b>
                    <span className="mute vtext" style={{ fontSize: 13 }} title={j.log}>{j.log}</span>
                    <span className="row" style={{ gap: 4 }}>
                      {j.status !== 'wait' && <a className="btn sm" href={`/studio?p=${j.pid}`} target="_blank" rel="noreferrer">打開專案</a>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {jobs.some((j) => j.status === 'done') && !busy && <div><button className="btn pri" onClick={() => openOutputFolder().catch(() => {})}>📂 打開成片資料夾</button></div>}
          </div>
        </>
      )}
    </StudioLayout>
  );
}
