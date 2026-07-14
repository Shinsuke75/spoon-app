// スプーン形状生成エンジン
//
// 方針(docs/redesign-plan.md):
// プリミティブの合成ではなく、位置 x ごとに定義した断面を
// 背骨(側面プロファイル)に沿ってなめらかにモーフィングさせながら
// ロフトし、1本の連続曲面としてスプーンを作る。
//
// 座標系: x = 匙面の先端(0)から柄の端(L)への長手方向
//         y = 上方向 / z = 幅方向(左右対称)

import * as THREE from 'three';
import type { SpoonParams } from './params';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// C1連続の滑らかな補間(smoothstep)
function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
// 滑らかな max(2曲線の輪郭を折れ目なく合成する p-ノルム)
function softMax(a: number, b: number, p = 8): number {
  return Math.pow(Math.pow(Math.max(a, 0), p) + Math.pow(Math.max(b, 0), p), 1 / p);
}

// ある x での断面を決めるスカラー一式
interface Section {
  w: number;    // 半幅
  yEdge: number; // 側縁(シルエット)の高さ
  topOff: number; // 断面中央の上面オフセット(負=皿状に凹む)
  botOff: number; // 断面中央の下面オフセット(負)
  pTop: number;  // 上面カーブの張り(指数)
  pBot: number;  // 下面カーブの張り(指数)
}

function sectionAt(x: number, p: SpoonParams): Section {
  const L = p.totalLength;
  const Lb = Math.min(p.bowlLength, L * 0.6);
  const neckX = Math.max(Lb * 1.05, Math.min(p.neckPos * L, L * 0.7));

  // ---- 上面視の半幅: 匙面ローブと柄バンドの滑らかな合成 ----
  // 匙面ローブ: 前後で丸みの違う卵形(2つの半楕円をC1接続)
  let wBowl = 0;
  const cx = Lb * 0.55; // 最大幅の位置(やや首寄り)
  if (x >= 0 && x <= Lb) {
    const r = x < cx ? cx : Lb - cx;
    const u = (x - cx) / r;
    wBowl = (p.bowlWidth / 2) * Math.sqrt(Math.max(0, 1 - u * u));
  }

  // 柄バンド: 首の太さ→柄の幅へ滑らかに遷移し、端で丸める
  const rampEnd = neckX + (L - neckX) * 0.45;
  let wHand = lerp(p.neckWidth / 2, p.handleWidth / 2, smooth(neckX, rampEnd, x));
  // 匙面の内側では細く消しておく(合成時に匙面ローブの下に隠す)
  wHand *= smooth(Lb * 0.45, Lb * 0.85, x);

  // 柄端の形
  const endR = p.handleWidth * (p.handleEnd === 'paddle' ? 0.9 : 0.55);
  if (p.handleEnd === 'round') {
    if (x > L - endR) {
      const u = (x - (L - endR)) / endR;
      wHand *= Math.sqrt(Math.max(0, 1 - u * u));
    }
  } else if (p.handleEnd === 'square') {
    const cut = 1.5; // 端をわずかに面取り
    if (x > L - cut) wHand *= Math.sqrt(Math.max(0, 1 - ((x - (L - cut)) / cut) ** 2 * 0.3));
  } else {
    // しゃもじ型: 端に向かって広がってから丸く納める
    const spread = 1 + 0.75 * smooth(L - endR * 2.2, L - endR * 0.6, x);
    wHand *= spread;
    if (x > L - endR) {
      const u = (x - (L - endR)) / endR;
      wHand *= Math.sqrt(Math.max(0, 1 - u * u));
    }
  }

  const w = softMax(wBowl, wHand);

  // ---- 側面プロファイル ----
  // 匙面→柄への遷移係数
  const sH = smooth(Lb * 0.92, neckX + (L - neckX) * 0.12, x);

  // 皿の深さ: 匙面中央で最大、先端と首で0
  let dish = 0;
  if (x >= 0 && x <= Lb) {
    const v = x / Lb;
    dish = p.bowlDepth * Math.pow(Math.max(0, 4 * v * (1 - v)), 0.85);
  }

  // 側縁の高さ: 匙面ではほぼ水平、首からクランク角で立ち上がる
  const crank = Math.tan((p.crankAngle * Math.PI) / 180);
  const rise = smooth(neckX - Lb * 0.25, neckX + (L - neckX) * 0.35, x);
  const yEdge = crank * Math.max(0, x - neckX * 0.9) * rise;

  // 断面中央の上下オフセット(匙面: 凹んだ皿 / 柄: 丸みのある山)
  const th = p.handleThickness;
  const topOff = lerp(-dish, th * 0.5, sH);
  const botOff = lerp(-(dish + p.rimThickness), -th * 0.5, sH);

  // カーブの張り: 匙面上面はふちの立った皿、柄はなめらかな超楕円
  const pTop = lerp(1.15, 0.42, sH);
  const pBot = lerp(0.6, 0.42, sH);

  return { w, yEdge, topOff, botOff, pTop, pBot };
}

// 断面リングの生成: 上面(-w→+w)と下面(+w→-w)をつないだ閉曲線
function ringPoints(x: number, s: Section, half: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  // 縁付近に点を集めるためのcos分布
  for (let j = 0; j <= half; j++) {
    const z = -s.w * Math.cos((Math.PI * j) / half);
    const f = Math.pow(Math.max(0, 1 - (z / s.w) ** 2), s.pTop);
    pts.push(new THREE.Vector3(x, s.yEdge + s.topOff * f, z));
  }
  for (let j = half - 1; j >= 1; j--) {
    const z = -s.w * Math.cos((Math.PI * j) / half);
    const f = Math.pow(Math.max(0, 1 - (z / s.w) ** 2), s.pBot);
    pts.push(new THREE.Vector3(x, s.yEdge + s.botOff * f, z));
  }
  return pts;
}

export function buildSpoonGeometry(p: SpoonParams, nx = 200, half = 24): THREE.BufferGeometry {
  const L = p.totalLength;
  const eps = 0.35; // 先端の縮退を避けるマージン
  const ringSize = 2 * half; // 1リングの頂点数

  const positions: number[] = [];
  const indices: number[] = [];

  // 各断面リングを生成
  const rings: THREE.Vector3[][] = [];
  const xs: number[] = [];
  for (let i = 0; i <= nx; i++) {
    // 両端に断面を集める(先端の丸みを滑らかに)
    const t = i / nx;
    const te = 0.5 - 0.5 * Math.cos(Math.PI * t);
    const x = eps + (L - 2 * eps) * te;
    const s = sectionAt(x, p);
    s.w = Math.max(s.w, 0.05);
    rings.push(ringPoints(x, s, half));
    xs.push(x);
  }

  for (const ring of rings) for (const v of ring) positions.push(v.x, v.y, v.z);

  // リング間をつなぐ
  for (let i = 0; i < rings.length - 1; i++) {
    const a0 = i * ringSize;
    const b0 = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j++) {
      const j1 = (j + 1) % ringSize;
      indices.push(a0 + j, b0 + j, b0 + j1);
      indices.push(a0 + j, b0 + j1, a0 + j1);
    }
  }

  // 両端を先端点で閉じる
  function addCap(ringIndex: number, xTip: number, flip: boolean) {
    const ring = rings[ringIndex];
    let cy = 0;
    for (const v of ring) cy += v.y;
    cy /= ring.length;
    const tipIdx = positions.length / 3;
    positions.push(xTip, cy, 0);
    const base = ringIndex * ringSize;
    for (let j = 0; j < ringSize; j++) {
      const j1 = (j + 1) % ringSize;
      if (flip) indices.push(tipIdx, base + j1, base + j);
      else indices.push(tipIdx, base + j, base + j1);
    }
  }
  addCap(0, 0, false);
  addCap(rings.length - 1, L, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// 表示用ガイド曲線(背骨=上面中心線 / 平面輪郭=側縁)
export interface SpoonCurves {
  spine: THREE.Vector3[];
  left: THREE.Vector3[];
  right: THREE.Vector3[];
}

export function buildSpoonCurves(p: SpoonParams, n = 120): SpoonCurves {
  const spine: THREE.Vector3[] = [];
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (p.totalLength * i) / n;
    const s = sectionAt(x, p);
    // 面のわずかに外側に浮かせてZファイティングを避ける
    spine.push(new THREE.Vector3(x, s.yEdge + s.topOff + 0.5, 0));
    left.push(new THREE.Vector3(x, s.yEdge + 0.2, -s.w - 0.15));
    right.push(new THREE.Vector3(x, s.yEdge + 0.2, s.w + 0.15));
  }
  return { spine, left, right };
}
