import { useRef, useState } from 'react';
import { ASPECTS, IMAGE_STYLES, QUALITIES } from '../../lib/studioOptions';
import { uid, normalizeScenes, spreadScenes, sceneRange, suggestSceneCount, aspectInfo, photoToB64, runPool } from '../../lib/studioState';
import { saveFile, deleteFile, fileUrl, fileB64, uploadRaw, probeFile } from '../../lib/accelerator';
import { fmtPoints } from '../../lib/format';

// 第 2 步：畫面（AI 畫圖或自己的照片）
export default function StepScenes({ p, pid, update, ai, prices, busy, setBusy, onPick }) {
  const [count, setCount] = useState(() => suggestSceneCount(p));
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [working, setWorking] = useState({}); // sceneId → true
  const fileInput = useRef(null);
  const n = p.lines.length;
  const imgPrice = (prices?.image?.[p.quality] ?? 0) + (p.face ? prices?.face ?? 0 : 0);
  const missing = p.scenes.filter((s) => !s.file && s.prompt);

  const set = (k, v) => update((prev) => ({ ...prev, [k]: v }));
  const setScene = (id, patch) => update((prev) => ({ ...prev, scenes: prev.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const plan = async () => {
    if (p.scenes.some((s) => s.file) && !confirm('重新規劃會清掉現在的畫面（已經畫好的圖也會移除），確定嗎？')) return;
    setErr(''); setBusy('plan');
    try {
      const j = await ai('storyboard', { lines: p.lines.map((l) => l.text), count, hasFace: !!p.face });
      p.scenes.forEach((s) => s.file && deleteFile(pid, s.file));
      update((prev) => ({
        ...prev,
        character: j.character,
        scenes: normalizeScenes(j.scenes.map((s) => ({ id: uid(), from: s.from, prompt: s.prompt, file: null, source: 'ai' })), prev.lines.length),
      }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  // 有主角頭照時，每張圖都把頭照一起送給 AI 當參考
  const faceCache = useRef({ file: null, b64: null });
  const getFace = async () => {
    if (!p.face?.file) return null;
    if (faceCache.current.file !== p.face.file) faceCache.current = { file: p.face.file, b64: await fileB64(pid, p.face.file) };
    return faceCache.current.b64;
  };

  const draw = async (scene) => {
    setWorking((w) => ({ ...w, [scene.id]: true }));
    try {
      const faceB64 = await getFace();
      const j = await ai('image', { prompt: scene.prompt, character: p.character, style: p.imageStyle, quality: p.quality, aspect: p.aspect, ...(faceB64 && { faceB64 }) });
      const name = `img_${scene.id}_${uid(4)}.jpg`;
      await saveFile(pid, name, j.b64);
      if (scene.file) deleteFile(pid, scene.file);
      setScene(scene.id, { file: name, source: 'ai' });
    } catch (e) {
      setErr(e.message);
      throw e;
    } finally {
      setWorking((w) => { const x = { ...w }; delete x[scene.id]; return x; });
    }
  };

  const drawAll = async () => {
    setErr(''); setBusy('draw');
    let stop = false;
    await runPool(missing, 2, async (s) => {
      if (stop) return;
      try { await draw(s); } catch (e) { if (/點數不夠/.test(e.message)) stop = true; }
    });
    setBusy('');
  };

  const addPhotos = async (files, replaceId) => {
    setErr('');
    const list = [...files];
    if (!list.length) return;
    setBusy('upload');
    try {
      const added = [];
      for (const [k, f] of list.entries()) {
        const id = replaceId || uid();
        if (/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
          // 影片：原檔直接放到加速器，做一張縮圖
          setMsg(`上傳影片 ${k + 1} / ${list.length}：${f.name}`);
          const ext = (f.name.match(/\.(mp4|mov|m4v|webm)$/i)?.[1] || 'mp4').toLowerCase();
          const name = `clip_${id}_${uid(4)}.${ext}`;
          await uploadRaw(pid, name, f);
          const info = await probeFile(pid, name);
          if (!info.hasVideo) { deleteFile(pid, name); throw new Error(`「${f.name}」讀不到畫面`); }
          added.push({ id, name, thumb: info.thumb, kind: 'video', duration: info.duration });
        } else {
          setMsg(`處理照片 ${k + 1} / ${list.length}`);
          const name = `photo_${id}_${uid(4)}.jpg`;
          await saveFile(pid, name, await photoToB64(f));
          added.push({ id, name, kind: 'image' });
        }
      }
      setMsg('');
      if (replaceId) {
        const old = p.scenes.find((s) => s.id === replaceId);
        if (old?.file) deleteFile(pid, old.file);
        setScene(replaceId, { file: added[0].name, thumb: added[0].thumb || null, kind: added[0].kind, source: 'upload' });
      } else {
        update((prev) => {
          const scenes = [...prev.scenes, ...added.map((a) => ({ id: a.id, from: 0, prompt: '', file: a.name, thumb: a.thumb || null, kind: a.kind, source: 'upload' }))];
          return { ...prev, scenes: spreadScenes(scenes, prev.lines.length) };
        });
      }
    } catch (e) { setErr(e.message); setMsg(''); }
    setBusy('');
  };

  const setFace = async (file) => {
    if (!file) return;
    setErr(''); setBusy('upload');
    try {
      const name = `face_${uid(6)}.jpg`;
      await saveFile(pid, name, await photoToB64(file, 1024));
      if (p.face?.file) deleteFile(pid, p.face.file);
      update((prev) => ({ ...prev, face: { file: name } }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const remove = (s) => {
    if (s.file) deleteFile(pid, s.file);
    update((prev) => ({ ...prev, scenes: normalizeScenes(prev.scenes.filter((x) => x.id !== s.id), prev.lines.length) }));
  };
  const move = (i, dir) => update((prev) => {
    const sc = [...prev.scenes];
    const j = i + dir;
    if (j < 0 || j >= sc.length) return prev;
    // 只交換圖片和描述，句子分配不動
    const a = sc[i], b = sc[j];
    sc[i] = { ...b, from: a.from };
    sc[j] = { ...a, from: b.from };
    return { ...prev, scenes: sc };
  });
  const setFrom = (id, from) => update((prev) => ({ ...prev, scenes: normalizeScenes(prev.scenes.map((s) => (s.id === id ? { ...s, from } : s)), prev.lines.length) }));
  const addBlank = () => update((prev) => ({ ...prev, scenes: spreadScenes([...prev.scenes, { id: uid(), from: 0, prompt: '', file: null, source: 'ai' }], prev.lines.length) }));

  if (!n) return <div className="step"><h2>🖼️ 畫面</h2><p className="mute">請先在第 1 步寫好文稿。</p></div>;

  return (
    <div className="step">
      <h2>🖼️ 影片的畫面</h2>
      <div className="grid2">
        <div className="fld">
          <label>影片要放哪裡（畫面比例）</label>
          <select className="sel" value={p.aspect} onChange={(e) => set('aspect', e.target.value)}>
            {ASPECTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fld">
          <label>AI 畫圖的風格</label>
          <select className="sel" value={p.imageStyle} onChange={(e) => set('imageStyle', e.target.value)}>
            {IMAGE_STYLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fld">
          <label>圖片畫質（每張點數）</label>
          <select className="sel" value={p.quality} onChange={(e) => set('quality', e.target.value)}>
            {QUALITIES.map(([k, v]) => <option key={k} value={k}>{v}：{fmtPoints(prices?.image?.[k] ?? 0)} 點</option>)}
          </select>
        </div>
        <div className="fld">
          <label>要幾個畫面（建議 {suggestSceneCount(p)} 個，約每 5 秒換一張）</label>
          <input className="inp" type="number" min="1" max={Math.min(40, n)} value={count} onChange={(e) => setCount(Math.min(Math.min(40, n), Math.max(1, Number(e.target.value) || 1)))} />
        </div>
      </div>

      <div className="panel sub" style={{ marginTop: 10 }}>
        <h3>🧑 讓 AI 畫的主角固定是同一個人（可以跳過）</h3>
        <div className="face-row">
          <div className="face-pic">{p.face?.file ? <img src={fileUrl(pid, p.face.file)} alt="" /> : <span>🙂</span>}</div>
          <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 220 }}>
            <div className="row" style={{ gap: 6 }}>
              <label className="btn sm">📷 {p.face ? '換一張頭照' : '上傳清楚的正面頭照'}<input type="file" accept="image/*" hidden onChange={(e) => { setFace(e.target.files[0]); e.target.value = ''; }} /></label>
              {p.face && <button className="btn sm" onClick={() => { deleteFile(pid, p.face.file); update((prev) => ({ ...prev, face: null })); }}>不用頭照</button>}
              {p.face && <span className="tag green">✓ 每張圖都會用這張臉（每張多 {fmtPoints(prices?.face ?? 0)} 點）</span>}
            </div>
            {!p.face && (
              <textarea className="ta" rows={2} value={p.character} onChange={(e) => set('character', e.target.value)} placeholder="沒有頭照也可以只寫長相，例如：30 歲台灣女生、黑色短髮、白色上衣（中英文都可以；AI 規劃畫面時也會自動寫）" />
            )}
            <div className="mute" style={{ fontSize: 12 }}>🔒 頭照只用來讓 AI 畫出同一個人，存在你的電腦，畫圖時才傳給 AI。請用自己或已經同意的人的照片。</div>
          </div>
        </div>
      </div>

      <div className="row" style={{ margin: '6px 0 14px' }}>
        <button className="btn pri" disabled={!!busy} onClick={plan}>{busy === 'plan' ? 'AI 規劃中…' : `① AI 規劃 ${count} 個畫面（約 0.1 點）`}</button>
        {missing.length > 0 && (
          <button className="btn acc" disabled={!!busy} onClick={drawAll}>
            {busy === 'draw' ? `AI 畫圖中…（還剩 ${missing.length} 張）` : `② 一鍵畫出 ${missing.length} 張圖（${fmtPoints(missing.length * imgPrice)} 點）`}
          </button>
        )}
        <button className="btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>📷 放自己的照片、短影片</button>
        <input ref={fileInput} type="file" accept="image/*,video/mp4,video/quicktime,.mov,.mp4,.m4v" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
      </div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}

      {!p.scenes.length ? (
        <div className="empty">還沒有畫面。按「① AI 規劃」讓 AI 想每個畫面要畫什麼，或「📷 放自己的照片」。</div>
      ) : (
        <>
          <p className="mute" style={{ fontSize: 13 }}>💬 綠色字＝這張圖出現時正在講的話。可以改「從第幾句開始」、改描述後按「重畫」。</p>
          <div className="scenes">
            {p.scenes.map((s, i) => {
              const [from, to] = sceneRange(p.scenes, i, n);
              return (
                <div key={s.id} className="scene" onMouseEnter={() => onPick(s.id)}>
                  <div className="scene-img" style={{ aspectRatio: `${aspectInfo(p.aspect).width} / ${aspectInfo(p.aspect).height}` }}>
                    {s.file ? <img src={fileUrl(pid, s.kind === 'video' ? s.thumb || s.file : s.file)} alt="" /> : <span>{working[s.id] ? '🎨 畫圖中…' : '還沒有圖'}</span>}
                    <b className="scene-no">{i + 1}{s.kind === 'video' ? ' 🎬 影片' : ''}</b>
                  </div>
                  <div className="scene-body">
                    <div className="scene-lines">{p.lines.slice(from, to + 1).map((l) => l.text).join('　')}</div>
                    <div className="row" style={{ gap: 6 }}>
                      <label className="mute" style={{ fontSize: 13 }}>從第</label>
                      <select className="sel" style={{ width: 'auto', padding: '3px 6px' }} value={s.from} disabled={i === 0} onChange={(e) => setFrom(s.id, Number(e.target.value))}>
                        {p.lines.map((_, k) => <option key={k} value={k}>{k + 1}</option>)}
                      </select>
                      <span className="mute" style={{ fontSize: 13 }}>句開始</span>
                    </div>
                    <textarea className="ta" rows={2} value={s.prompt} onChange={(e) => setScene(s.id, { prompt: e.target.value })} placeholder="要畫什麼（中文英文都可以）" />
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn sm" disabled={!!working[s.id] || !s.prompt.trim() || busy === 'draw'} onClick={() => draw(s).catch(() => {})}>{s.file ? '🔄 重畫' : '🎨 畫這張'}（{fmtPoints(imgPrice)} 點）</button>
                      <label className="btn sm">📷 換照片／影片<input type="file" accept="image/*,video/mp4,video/quicktime,.mov,.mp4,.m4v" hidden onChange={(e) => { addPhotos(e.target.files, s.id); e.target.value = ''; }} /></label>
                      <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} title="往前">◀</button>
                      <button className="btn sm" onClick={() => move(i, 1)} disabled={i === p.scenes.length - 1} title="往後">▶</button>
                      <button className="btn sm danger" onClick={() => remove(s)} title="刪掉">🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={addBlank}>＋ 加一個畫面</button>
            <button className="btn sm" onClick={() => update((prev) => ({ ...prev, scenes: spreadScenes(prev.scenes, prev.lines.length) }))}>⚖️ 句子平均分給每張圖</button>
          </div>
        </>
      )}
    </div>
  );
}
