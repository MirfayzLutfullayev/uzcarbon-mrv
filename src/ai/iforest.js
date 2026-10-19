/*
 * Isolation Forest (Liu, Ting, Zhou, 2008) — AI-3 uchun nazoratsiz anomaliya modeli.
 * Natija takrorlanuvchan bo'lishi uchun urug'li tasodifiy sonlar generatori ishlatiladi.
 */
"use strict";

function mulberry32(seed) {
  return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const H = i => Math.log(i) + 0.5772156649;
const cFactor = n => (n > 2 ? 2 * H(n - 1) - (2 * (n - 1)) / n : n === 2 ? 1 : 0);

function buildTree(X, depth, maxDepth, rnd) {
  if (depth >= maxDepth || X.length <= 1) return { size: X.length };
  const dims = X[0].length;
  const q = Math.floor(rnd() * dims);
  let min = Infinity, max = -Infinity;
  for (const x of X) { if (x[q] < min) min = x[q]; if (x[q] > max) max = x[q]; }
  if (min === max) return { size: X.length };
  const p = min + rnd() * (max - min);
  const L = [], R = [];
  for (const x of X) (x[q] < p ? L : R).push(x);
  return { q, p, left: buildTree(L, depth + 1, maxDepth, rnd), right: buildTree(R, depth + 1, maxDepth, rnd) };
}
function pathLength(x, node, depth = 0) {
  if (node.size != null) return depth + cFactor(node.size);
  return pathLength(x, x[node.q] < node.p ? node.left : node.right, depth + 1);
}

/** Har bir ustunni medianaga va MAD ga nisbatan me'yorlash (miqyosdan mustaqil). */
function robustScale(X) {
  const d = X[0].length;
  const med = [], mad = [];
  for (let j = 0; j < d; j++) {
    const col = X.map(x => x[j]).sort((a, b) => a - b);
    const m = col[Math.floor(col.length / 2)];
    const dev = col.map(v => Math.abs(v - m)).sort((a, b) => a - b);
    med.push(m); mad.push(dev[Math.floor(dev.length / 2)] || Math.abs(m) * 0.05 || 1);
  }
  return X.map(x => x.map((v, j) => (v - med[j]) / mad[j]));
}

/**
 * @param {number[][]} X kuzatuvlar (har biri bir xil uzunlikdagi vektor)
 * @returns {number[]} anomaliya balli 0..1 (≈0,5 — oddiy; > 0,6 — shubhali)
 */
function isolationForest(X, { trees = 100, sampleSize = 64, seed = 42 } = {}) {
  if (X.length < 4) return X.map(() => 0.5);
  const Z = robustScale(X);
  const rnd = mulberry32(seed);
  const psi = Math.min(sampleSize, Z.length);
  const maxDepth = Math.ceil(Math.log2(psi));
  const forest = [];
  for (let t = 0; t < trees; t++) {
    const sample = [];
    for (let i = 0; i < psi; i++) sample.push(Z[Math.floor(rnd() * Z.length)]);
    forest.push(buildTree(sample, 0, maxDepth, rnd));
  }
  const c = cFactor(psi);
  return Z.map(x => Math.pow(2, -(forest.reduce((a, tr) => a + pathLength(x, tr), 0) / trees) / c));
}

module.exports = { isolationForest, robustScale, mulberry32 };
