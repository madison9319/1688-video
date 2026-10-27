// 跟會員電腦上的「本機加速器」溝通（只在瀏覽器端用）
// 加速器在會員自己的電腦上開一個只有本機連得到的小服務：http://127.0.0.1:17888

export const ACCEL_URL = 'http://127.0.0.1:17888';

async function call(path, method = 'GET', body, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(ACCEL_URL + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `加速器回應錯誤（${r.status}）`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

// 回傳 { online, version, ffmpeg, outputDir } ；沒開或沒裝 → { online:false }
export async function checkAccelerator() {
  try {
    const j = await call('/health', 'GET', null, 2500);
    return { online: true, ...j };
  } catch (e) {
    return { online: false };
  }
}

export const testRender = () => call('/test-render', 'POST', {}, 60000);

// ── 專案與素材（都存在會員自己的電腦）──
export const listProjects = () => call('/projects').then((j) => j.projects);
export const loadProject = (id) => call(`/projects/${id}`).then((j) => j.project);
export const saveProject = (id, project) => call(`/projects/${id}`, 'POST', { project }, 15000);
export const deleteProject = (id) => call(`/projects/${id}/delete`, 'POST', {});
export const saveFile = (id, name, b64) => call(`/projects/${id}/files`, 'POST', { name, b64 }, 60000);
export const deleteFile = (id, name) => call(`/projects/${id}/files/delete`, 'POST', { name }).catch(() => {});
export const fileUrl = (id, name) => `${ACCEL_URL}/projects/${id}/files/${encodeURIComponent(name)}`;
export const outputUrl = (fileName) => `${ACCEL_URL}/output/${encodeURIComponent(fileName)}`;
export const startRender = (id, spec) => call(`/projects/${id}/render`, 'POST', { spec }, 15000);
export const renderStatus = (jobId) => call(`/render/${jobId}`);
export const openFile = (file) => call('/open-file', 'POST', { file });

// 大檔案（影片、錄音）直接傳檔案本身
export async function uploadRaw(id, name, file) {
  const r = await fetch(`${ACCEL_URL}/projects/${id}/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `上傳失敗（${r.status}）`);
  return j;
}
export const probeFile = (id, name) => call(`/projects/${id}/probe`, 'POST', { name }, 60000);
export const prepareStt = (id, name) => call(`/projects/${id}/prepare-stt`, 'POST', { name }, 5 * 60000);
export const fetchUrl = (id, url, name) => call(`/projects/${id}/fetch-url`, 'POST', { url, name }, 10 * 60000);
export const cutAudio =(id, source, keep, out) => call(`/projects/${id}/cut-audio`, 'POST', { source, keep, out }, 5 * 60000);

// 從加速器讀回檔案 → base64（送給 AI 用）
export async function fileB64(id, name) {
  const r = await fetch(fileUrl(id, name));
  if (!r.ok) throw new Error('讀不到檔案');
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
export const openOutputFolder = () => call('/open-folder', 'POST', {});
export const chooseOutputFolder = () => call('/choose-folder', 'POST', {}, 5 * 60000);

// 版本比較：a < b → true
export function isOlder(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}

// 我的固定樣式（存在這台電腦）
export const getStyle = () => call('/style').then((j) => j.style);
export const saveStyle = (id, style, files) => call('/style/save', 'POST', { id, style, files });
export const applyStyle = (id) => call('/style/apply', 'POST', { id }).then((j) => j.style);
