// 自動做完一支影片（批次用）：規劃畫面 → 畫圖 → 配音 → 標題 → 存檔 → 做影片
import { uid, normalizeScenes, spreadScenes, suggestSceneCount, audioKey, buildSpec, runPool } from './studioState';
import { saveFile, saveProject, startRender, renderStatus, fileB64 } from './accelerator';

// ai(kind, body)：呼叫伺服器 AI（會扣點）；log(text)：顯示進度
export async function autoMake({ pid, project, ai, log, photos, faceFile, wantTitle }) {
  let p = { ...project };
  const save = () => saveProject(pid, p);

  // ① 畫面：有分到照片／影片就用；沒有就 AI 規劃＋畫圖
  if (photos?.length) {
    p.scenes = spreadScenes(photos.map((f) => ({ id: uid(), from: 0, prompt: '', file: f.file, thumb: f.thumb || null, kind: f.kind, source: 'upload' })), p.lines.length);
  } else {
    const count = Math.min(p.lines.length, p.sceneCount || suggestSceneCount(p));
    log(`AI 規劃 ${count} 個畫面`);
    const sb = await ai('storyboard', { lines: p.lines.map((l) => l.text), count, hasFace: !!faceFile });
    p.character = sb.character;
    p.scenes = normalizeScenes(sb.scenes.map((s) => ({ id: uid(), from: s.from, prompt: s.prompt, file: null, source: 'ai' })), p.lines.length);
    const faceB64 = faceFile ? await fileB64(pid, faceFile) : null;
    let done = 0;
    await runPool(p.scenes, 2, async (s) => {
      const j = await ai('image', { prompt: s.prompt, character: p.character, style: p.imageStyle, quality: p.quality, aspect: p.aspect, ...(faceB64 && { faceB64 }) });
      const name = `img_${s.id}_${uid(4)}.jpg`;
      await saveFile(pid, name, j.b64);
      s.file = name;
      log(`AI 畫圖 ${++done} / ${p.scenes.length}`);
    });
  }
  await save();

  // ② 配音
  if (p.voice.mode === 'ai') {
    let done = 0;
    await runPool(p.lines, 3, async (l) => {
      const j = await ai('tts', { text: l.text, voice: p.voice.voice, tone: p.voice.tone, speed: p.voice.speed });
      const name = `tts_${l.id}_${uid(4)}.mp3`;
      await saveFile(pid, name, j.b64);
      l.audio = name;
      l.audioKey = audioKey(l, p.voice);
      log(`AI 配音 ${++done} / ${p.lines.length}`);
    });
    await save();
  }

  // ③ 標題
  if (wantTitle) {
    log('AI 想標題');
    const j = await ai('titles', { lines: p.lines.map((l) => l.text) });
    p.title = { ...p.title, text: j.titles[0] };
    if (!p.name) p.name = j.titles[0];
  }
  await save();

  // ④ 做影片（用這台電腦）
  log('開始剪影片');
  const { jobId } = await startRender(pid, buildSpec(p, { preview: false }));
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await renderStatus(jobId);
    if (s.status === 'running') { log(`剪影片 ${s.progress}%`); continue; }
    if (s.status === 'error') throw new Error(`做影片失敗：${s.error}`);
    p.lastVideo = { file: s.file, fileName: s.fileName, at: Date.now() };
    await save();
    return p;
  }
}
