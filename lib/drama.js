// 萬相分鏡短劇：資料結構與小工具（瀏覽器端）

export function newDrama() {
  return {
    kind: 'drama',
    mode: 'drama', // drama（分鏡短劇）／talk（照片開口說話）
    name: '',
    roleMode: 'two', // one（一個人）／two（兩個人）
    narrator: 'female', // 誰介紹產品
    female: { name: '', age: '30', photo: null },
    male: { name: '', age: '30', photo: null },
    relation: '',
    product: { name: '', desc: '', photos: [], use: [] }, // use＝打勾給 AI 參考的照片（最多 3 張）
    scenario: '',
    seconds: 30,
    speed: 'normal',
    script: null, // { title, shots: [{ visual, lines: [{ who, text }] }] }
    board: null, // 分鏡總圖檔名
    grid: 9, // 9 格或 6 格
    cells: [], // 每一格的檔名
    gen: { duration: 30, resolution: '720P', ratio: '9:16', audio: true },
    job: null, // { id, startedAt }
    wanVideo: null, // 萬相做好的影片檔名
    words: null, // 影片聲音的逐字時間（上字幕用）
    lines: [], // 字幕 [{ id, text, start, end }]
    title: { text: '', size: 80, color: '#ffd84d' },
    subtitle: { enabled: true, size: 72, color: '#ffffff', outlineColor: '#000000', position: 'bottom', maxChars: 13 },
    lastVideo: null,
  };
}

// 送給伺服器的短劇設定（不含照片）
export function dramaBody(d) {
  return {
    mode: d.mode,
    roleMode: d.mode === 'talk' ? 'one' : d.roleMode, narrator: d.narrator, relation: d.relation, scenario: d.scenario, seconds: d.seconds, speed: d.speed,
    female: { name: d.female.name, age: d.female.age },
    male: { name: d.male.name, age: d.male.age },
    product: { name: d.product.name, desc: d.product.desc },
    script: d.script,
  };
}

// 找白色（或很淺）格線：回傳每一格的 [起點, 終點]（找不到可信的格線就回傳 null）
function findBands(lightRatio, len, expect) {
  const isLine = lightRatio.map((v) => v > 0.9);
  const gaps = [];
  let i = 0;
  while (i < len) {
    if (!isLine[i]) { i++; continue; }
    let j = i;
    while (j < len && isLine[j]) j++;
    gaps.push([i, j]);
    i = j;
  }
  // 中間的格線（不算圖片最外圈的白邊）
  const inner = gaps.filter(([a, b]) => a > len * 0.08 && b < len * 0.92 && b - a >= 2);
  const edges = [0, ...inner.flatMap(([a, b]) => [a, b]), len];
  const panels = [];
  for (let k = 0; k < edges.length; k += 2) panels.push([edges[k], edges[k + 1]]);
  const sizes = panels.map(([a, b]) => b - a);
  const ok = panels.length >= 2 && panels.length <= 4 && Math.min(...sizes) > Math.max(...sizes) * 0.7;
  if (!ok) return null;
  if (expect && panels.length !== expect) return null;
  return panels;
}

// 把分鏡總圖切成一格一格（照片檔 → 每格 JPEG base64）
// 會自動找白色格線決定幾欄幾列；找不到就照 grid（9＝3×3，6＝3 欄 2 列）平均切
export async function cutSheet(url, grid) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('讀不到分鏡總圖'));
    i.src = url;
  });
  const W = img.width, H = img.height;
  const probe = document.createElement('canvas');
  probe.width = W; probe.height = H;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, 0);
  const px = pctx.getImageData(0, 0, W, H).data;
  const light = (x, y) => { const k = (y * W + x) * 4; return px[k] > 225 && px[k + 1] > 225 && px[k + 2] > 225; };
  const colRatio = Array.from({ length: W }, (_, x) => { let n = 0; for (let y = 0; y < H; y += 4) n += light(x, y); return n / Math.ceil(H / 4); });
  const rowRatio = Array.from({ length: H }, (_, y) => { let n = 0; for (let x = 0; x < W; x += 4) n += light(x, y); return n / Math.ceil(W / 4); });
  const [fc, fr] = grid === 6 ? [3, 2] : [3, 3];
  const even = (n, len) => Array.from({ length: n }, (_, k) => [Math.round((k * len) / n), Math.round(((k + 1) * len) / n)]);
  const cols = findBands(colRatio, W) || even(fc, W);
  const rows = findBands(rowRatio, H) || even(fr, H);

  const out = [];
  for (const [y0, y1] of rows) {
    for (const [x0, x1] of cols) {
      // 每格再往內縮一點，避免切到格線和格子編號
      const inset = Math.round(Math.min(x1 - x0, y1 - y0) * 0.02);
      const w = x1 - x0 - inset * 2;
      const h = y1 - y0 - inset * 2;
      const scale = Math.min(2, 720 / Math.max(w, h)); // 每格最長邊約 720px
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * scale);
      cv.height = Math.round(h * scale);
      cv.getContext('2d').drawImage(img, x0 + inset, y0 + inset, w, h, 0, 0, cv.width, cv.height);
      out.push(cv.toDataURL('image/jpeg', 0.9).split(',')[1]);
    }
  }
  return { cells: out, cols: cols.length, rows: rows.length };
}

export const AGES = [['20', '20 多歲'], ['30', '30 多歲'], ['40', '40 多歲'], ['50', '50 歲以上']];
