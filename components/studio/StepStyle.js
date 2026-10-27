import { useState } from 'react';
import { uid, photoToB64, pickStyle, styleFiles } from '../../lib/studioState';
import { saveFile, deleteFile, fileUrl, uploadRaw, probeFile, saveStyle } from '../../lib/accelerator';

const COLORS = ['#ffffff', '#ffd84d', '#ff8a00', '#ff4d6d', '#4dd0ff', '#7dff8a', '#000000'];

function ColorPick({ value, onChange }) {
  return (
    <div className="colors">
      {COLORS.map((c) => (
        <button key={c} className={`cdot${value === c ? ' on' : ''}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title="自己選顏色" />
    </div>
  );
}

// 第 4 步：標題、字幕、片頭片尾
export default function StepStyle({ p, pid, update, ai, busy, setBusy }) {
  const [titles, setTitles] = useState([]);
  const [err, setErr] = useState('');
  const setPart = (part, k, v) => update((prev) => ({ ...prev, [part]: { ...prev[part], [k]: v } }));

  const aiTitles = async () => {
    setErr(''); setBusy('titles');
    try {
      const j = await ai('titles', { lines: p.lines.map((l) => l.text) });
      setTitles(j.titles);
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const [styleMsg, setStyleMsg] = useState('');
  const saveMyStyle = async () => {
    setErr(''); setBusy('style');
    try {
      await saveStyle(pid, pickStyle(p), styleFiles(p));
      setStyleMsg('✓ 已存好，下一支新影片會自動套用');
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const uploadInsert = async (file) => {
    if (!file) return;
    setErr(''); setBusy('upload');
    try {
      const isVid = /^video\//.test(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);
      let next;
      if (isVid) {
        const name = `insert_${uid(6)}.${(file.name.match(/\.(mp4|mov|m4v)$/i)?.[1] || 'mp4').toLowerCase()}`;
        await uploadRaw(pid, name, file);
        const info = await probeFile(pid, name);
        if (!info.hasVideo) throw new Error('讀不到這個影片的畫面');
        next = { file: name, kind: 'video', thumb: info.thumb, videoDuration: info.duration, duration: Math.min(15, Math.max(1, Math.round(info.duration * 2) / 2)) };
      } else {
        const name = `insert_${uid(6)}.jpg`;
        await saveFile(pid, name, await photoToB64(file));
        next = { file: name, kind: 'image', duration: 5 };
      }
      if (p.insert?.file) deleteFile(pid, p.insert.file);
      update((prev) => ({ ...prev, insert: { at: 'middle', keepAudio: true, ...next } }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setErr(''); setBusy('upload');
    try {
      // PNG 保留透明，直接存原檔
      const ext = /\.png$/i.test(file.name) || file.type === 'image/png' ? 'png' : 'jpg';
      const name = `logo_${uid(6)}.${ext}`;
      if (ext === 'png') await uploadRaw(pid, name, file);
      else await saveFile(pid, name, await photoToB64(file, 800));
      if (p.logo?.file) deleteFile(pid, p.logo.file);
      update((prev) => ({ ...prev, logo: { position: 'tr', size: 0.16, opacity: 0.8, ...(prev.logo || {}), file: name } }));
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const uploadImg = async (part, file) => {
    if (!file) return;
    setErr(''); setBusy('upload');
    try {
      const name = `${part}_${uid(6)}.jpg`;
      await saveFile(pid, name, await photoToB64(file));
      if (p[part].imageFile) deleteFile(pid, p[part].imageFile);
      setPart(part, 'imageFile', name);
    } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const endCard = (part, label, hint) => {
    const c = p[part];
    return (
      <div className="panel sub">
        <h3>{label}</h3>
        <p className="mute" style={{ marginTop: -6, fontSize: 13 }}>{hint}</p>
        <div className="chips">
          {[['text', '📝 文字'], ['image', '🖼️ 一張圖'], ['none', '不要']].map(([k, l]) => (
            <button key={k} className={`chip${c.type === k ? ' on' : ''}`} onClick={() => setPart(part, 'type', k)}>{l}</button>
          ))}
        </div>
        {c.type === 'text' && (
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="fld"><label>大字</label><input className="inp" value={c.text} maxLength={20} onChange={(e) => setPart(part, 'text', e.target.value)} placeholder={part === 'intro' ? '例如：早晨好習慣' : '例如：謝謝收看'} /></div>
            <div className="fld"><label>下面小字</label><input className="inp" value={c.sub} maxLength={30} onChange={(e) => setPart(part, 'sub', e.target.value)} placeholder={part === 'intro' ? '例如：每天 1 分鐘' : '例如：追蹤看更多'} /></div>
            {part === 'intro' && (
              <div className="fld">
                <label>背景</label>
                <select className="sel" value={c.bg} onChange={(e) => setPart(part, 'bg', e.target.value)}>
                  <option value="first">第一張圖（變暗、模糊）</option>
                  <option value="color">純色</option>
                </select>
              </div>
            )}
            {(part === 'outro' || c.bg === 'color') && (
              <div className="fld"><label>背景顏色</label><ColorPick value={c.color} onChange={(v) => setPart(part, 'color', v)} /></div>
            )}
          </div>
        )}
        {c.type === 'image' && (
          <div className="row" style={{ marginTop: 10 }}>
            {c.imageFile && <img src={fileUrl(pid, c.imageFile)} alt="" style={{ height: 90, borderRadius: 8 }} />}
            <label className="btn">{c.imageFile ? '換一張圖' : '🖼️ 上傳圖片'}<input type="file" accept="image/*" hidden onChange={(e) => { uploadImg(part, e.target.files[0]); e.target.value = ''; }} /></label>
          </div>
        )}
        {c.type !== 'none' && (
          <div className="fld" style={{ marginTop: 10, maxWidth: 260 }}>
            <label>長度：{c.duration} 秒</label>
            <input type="range" min="2" max={part === 'intro' ? 6 : 8} step="0.5" value={c.duration} onChange={(e) => setPart(part, 'duration', Number(e.target.value))} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="step">
      <h2>💬 標題、字幕、片頭片尾</h2>
      {err && <div className="err">{err}</div>}

      <div className="panel sub">
        <h3>🏷️ 影片標題（放在畫面上方，整支影片都看得到）</h3>
        <div className="row">
          <input className="inp" style={{ flex: 1, minWidth: 200 }} value={p.title.text} maxLength={24} onChange={(e) => setPart('title', 'text', e.target.value)} placeholder="例如：早上第一件事做這個（不放就留空）" />
          <button className="btn" disabled={!!busy || !p.lines.length} onClick={aiTitles}>{busy === 'titles' ? '想標題中…' : '🔥 AI 想 3 個標題'}</button>
        </div>
        {titles.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {titles.map((t) => <button key={t} className="chip" onClick={() => setPart('title', 'text', t)}>{t}</button>)}
          </div>
        )}
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="fld"><label>字的大小：{p.title.size}</label><input type="range" min="50" max="120" value={p.title.size} onChange={(e) => setPart('title', 'size', Number(e.target.value))} /></div>
          <div className="fld"><label>標題顏色</label><ColorPick value={p.title.color} onChange={(v) => setPart('title', 'color', v)} /></div>
        </div>
      </div>

      <div className="panel sub">
        <h3>🅰 字幕</h3>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={p.subtitle.enabled} onChange={(e) => setPart('subtitle', 'enabled', e.target.checked)} /> 影片加上字幕
        </label>
        {p.subtitle.enabled && (
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="fld"><label>字的大小：{p.subtitle.size}</label><input type="range" min="44" max="110" value={p.subtitle.size} onChange={(e) => setPart('subtitle', 'size', Number(e.target.value))} /></div>
            <div className="fld"><label>一次最多幾個字：{p.subtitle.maxChars}</label><input type="range" min="6" max="20" value={p.subtitle.maxChars} onChange={(e) => setPart('subtitle', 'maxChars', Number(e.target.value))} /></div>
            <div className="fld"><label>字的顏色</label><ColorPick value={p.subtitle.color} onChange={(v) => setPart('subtitle', 'color', v)} /></div>
            <div className="fld"><label>外框顏色</label><ColorPick value={p.subtitle.outlineColor} onChange={(v) => setPart('subtitle', 'outlineColor', v)} /></div>
            <div className="fld">
              <label>放在哪裡</label>
              <select className="sel" value={p.subtitle.position} onChange={(e) => setPart('subtitle', 'position', e.target.value)}>
                <option value="bottom">下方（推薦）</option>
                <option value="high">中間偏下</option>
                <option value="middle">正中間</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {endCard('intro', '🎬 開頭（片頭）', '影片一開始先出現 2～6 秒的標題')}
      {endCard('outro', '🌙 結尾（片尾）', '影片最後放謝謝收看、帳號或網址')}

      <div className="panel sub">
        <h3>☕ 中場休息（插播圖片或影片，可以跳過）</h3>
        <p className="mute" style={{ marginTop: -6, fontSize: 13 }}>影片播到中間先暫停，插播你上傳的圖片或影片（活動、商品、廣告），播完再接回原本的內容。說話和字幕會一起暫停，不會被切掉。</p>
        {p.insert ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row">
              <img src={fileUrl(pid, p.insert.kind === 'video' ? p.insert.thumb || p.insert.file : p.insert.file)} alt="" style={{ height: 90, borderRadius: 8 }} />
              <span className="tag">{p.insert.kind === 'video' ? '🎬 影片' : '🖼️ 圖片'}</span>
              <label className="btn sm">換一個<input type="file" accept="image/*,video/mp4,video/quicktime,.mov,.mp4" hidden onChange={(e) => { uploadInsert(e.target.files[0]); e.target.value = ''; }} /></label>
              <button className="btn sm danger" onClick={() => { deleteFile(pid, p.insert.file); update((prev) => ({ ...prev, insert: null })); }}>不要插播</button>
            </div>
            <div className="grid2">
              <div className="fld"><label>插播多久：{p.insert.duration} 秒</label><input type="range" min="1" max={p.insert.kind === 'video' ? Math.max(3, Math.min(60, Math.round(p.insert.videoDuration || 15))) : 15} step="0.5" value={p.insert.duration} onChange={(e) => setPart('insert', 'duration', Number(e.target.value))} /></div>
              <div className="fld">
                <label>插在哪裡</label>
                <select className="sel" value={p.insert.at === 'middle' ? 'middle' : 'time'} onChange={(e) => setPart('insert', 'at', e.target.value === 'middle' ? 'middle' : 10)}>
                  <option value="middle">影片中間（推薦）</option>
                  <option value="time">自己選時間</option>
                </select>
              </div>
              {p.insert.at !== 'middle' && (
                <div className="fld"><label>大約從第幾秒（會自動對到兩句話之間）</label><input className="inp" type="number" min="1" value={p.insert.at} onChange={(e) => setPart('insert', 'at', Math.max(1, Number(e.target.value) || 1))} /></div>
              )}
            </div>
            {p.insert.kind === 'video' && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={p.insert.keepAudio !== false} onChange={(e) => setPart('insert', 'keepAudio', e.target.checked)} /> 保留插播影片原本的聲音</label>}
          </div>
        ) : (
          <label className="btn">☕ 上傳中場要播的圖片或影片<input type="file" accept="image/*,video/mp4,video/quicktime,.mov,.mp4" hidden onChange={(e) => { uploadInsert(e.target.files[0]); e.target.value = ''; }} /></label>
        )}
      </div>

      <div className="panel sub">
        <h3>🏷️ 角落放 Logo（可以跳過）</h3>
        <p className="mute" style={{ marginTop: -6, fontSize: 13 }}>放在角落、半透明，片頭片尾不會出現。建議用去背的 PNG。</p>
        {p.logo ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row">
              <span className="logo-prev"><img src={fileUrl(pid, p.logo.file)} alt="" /></span>
              <label className="btn sm">換一個<input type="file" accept="image/png,image/*" hidden onChange={(e) => { uploadLogo(e.target.files[0]); e.target.value = ''; }} /></label>
              <button className="btn sm danger" onClick={() => { deleteFile(pid, p.logo.file); update((prev) => ({ ...prev, logo: null })); }}>不要 Logo</button>
            </div>
            <div className="grid2">
              <div className="fld">
                <label>位置</label>
                <select className="sel" value={p.logo.position} onChange={(e) => setPart('logo', 'position', e.target.value)}>
                  <option value="tr">右上角</option><option value="tl">左上角</option><option value="br">右下角</option><option value="bl">左下角</option>
                </select>
              </div>
              <div className="fld"><label>大小：畫面寬度的 {Math.round(p.logo.size * 100)}%</label><input type="range" min="0.06" max="0.35" step="0.01" value={p.logo.size} onChange={(e) => setPart('logo', 'size', Number(e.target.value))} /></div>
              <div className="fld"><label>透明度：{Math.round(p.logo.opacity * 100)}%</label><input type="range" min="0.2" max="1" step="0.05" value={p.logo.opacity} onChange={(e) => setPart('logo', 'opacity', Number(e.target.value))} /></div>
            </div>
          </div>
        ) : (
          <label className="btn">🏷️ 上傳 Logo<input type="file" accept="image/png,image/*" hidden onChange={(e) => { uploadLogo(e.target.files[0]); e.target.value = ''; }} /></label>
        )}
      </div>

      <div className="panel sub" style={{ background: 'var(--pri-l)', borderColor: '#d6c8ff' }}>
        <h3>💾 喜歡現在的樣子嗎？存起來，下一支新影片就自動用這一套</h3>
        <p className="mute" style={{ marginTop: -6, fontSize: 13 }}>會存：畫面比例、畫圖風格、聲音、字幕、標題的大小顏色、片頭片尾、Logo、背景音樂（不會存文稿和標題文字）。存在這台電腦。</p>
        <div className="row">
          <button className="btn pri" disabled={!!busy} onClick={saveMyStyle}>{busy === 'style' ? '儲存中…' : '💾 存成我的固定樣式'}</button>
          {styleMsg && <span className="tag green">{styleMsg}</span>}
        </div>
      </div>

      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={p.motion} onChange={(e) => update((prev) => ({ ...prev, motion: e.target.checked }))} /> 圖片慢慢放大縮小（比較有動感）
      </label>
    </div>
  );
}
