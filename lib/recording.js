// 自己的錄音：語音辨識的字 → 剪掉贅字、太長的停頓 → 分成一句一句（含時間）

const ALWAYS = /^(嗯+|呃+|額|欸|唉|恩)$/; // 一律剪
const HESITATE = /^(啊|阿|那個|這個|就是|然後)$/; // 後面停頓才算猶豫，才剪
const PUNCT = /[，,。.！!？?、；;：:…\s]+/g;

const bare = (w) => w.replace(PUNCT, '');

// 標出哪些字是贅字
export function markFillers(words) {
  return words.map((w, i) => {
    const t = bare(w.w);
    const next = words[i + 1];
    const gapAfter = next ? next.s - w.e : 1;
    const prev = words[i - 1];
    const gapBefore = prev ? w.s - prev.e : 1;
    const filler = ALWAYS.test(t) || (HESITATE.test(t) && gapAfter > 0.4 && (gapBefore > 0.25 || /[，,。！？]$/.test(prev?.w || '')));
    return { ...w, filler };
  });
}

// 算出要留下的時間段 keep，和每個字在剪完後的新時間
// opts: { cutFillers, cutPauses, maxPause }
export function planCuts(words, duration, opts) {
  const maxPause = opts.maxPause || 0.6;
  const marked = markFillers(words);
  const cuts = [];
  marked.forEach((w, i) => {
    if (opts.cutFillers && w.filler) {
      const next = marked[i + 1];
      const prev = marked[i - 1];
      cuts.push([Math.max(prev ? prev.e + 0.05 : 0, w.s - 0.05), next ? Math.max(w.e, next.s - 0.08) : duration]);
    }
  });
  if (opts.cutPauses) {
    const kept = marked.filter((w) => !(opts.cutFillers && w.filler));
    for (let i = 1; i < kept.length; i++) {
      const gap = kept[i].s - kept[i - 1].e;
      if (gap > maxPause) cuts.push([kept[i - 1].e + 0.3, kept[i].s - 0.12]);
    }
    if (kept.length && kept[0].s > 0.8) cuts.push([0, kept[0].s - 0.3]);
    if (kept.length && duration - kept[kept.length - 1].e > 0.8) cuts.push([kept[kept.length - 1].e + 0.4, duration]);
  }
  // 合併重疊的剪掉段
  const merged = [];
  for (const c of cuts.filter(([a, b]) => b - a > 0.05).sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else merged.push([...c]);
  }
  const keep = [];
  let t = 0;
  for (const [a, b] of merged) {
    if (a > t) keep.push([t, a]);
    t = Math.max(t, b);
  }
  if (t < duration) keep.push([t, duration]);
  const removedBefore = (x) => merged.reduce((acc, [a, b]) => acc + (x > a ? Math.min(x, b) - a : 0), 0);
  const remap = (x) => x - removedBefore(x);
  const newWords = marked
    .filter((w) => !(opts.cutFillers && w.filler))
    .map((w) => ({ ...w, s: remap(w.s), e: remap(w.e) }));
  const newDuration = keep.reduce((a, [s, e]) => a + (e - s), 0);
  return { keep, words: newWords, duration: newDuration, removed: duration - newDuration, fillers: marked.filter((w) => w.filler).length };
}

// 字 → 一句一句：遇到句號問號、或逗號且夠長、或停頓、或太長就換行
export function wordsToLines(words, max = 18) {
  const lines = [];
  let cur = null;
  words.forEach((w, i) => {
    if (!cur) cur = { text: '', start: w.s, end: w.e };
    cur.text += w.w.trim();
    cur.end = w.e;
    const next = words[i + 1];
    const len = bare(cur.text).length;
    const gap = next ? next.s - w.e : 9;
    if (!next || /[。.！!？?]$/.test(w.w) || (/[，,、；;]$/.test(w.w) && len >= 8) || gap > 0.55 || len >= max) {
      cur.text = cur.text.replace(/[，,、；;：:]+$/, '');
      if (bare(cur.text)) lines.push(cur);
      cur = null;
    }
  });
  return lines.map((l) => ({ ...l, start: Math.round(l.start * 100) / 100, end: Math.round(l.end * 100) / 100 }));
}
