// スプーンのパラメータ定義とプリセット
// 単位: mm / 度

export type HandleEnd = 'round' | 'square' | 'paddle';

export interface SpoonParams {
  totalLength: number;    // 全長
  bowlLength: number;     // 匙面の長さ
  bowlWidth: number;      // 匙面の幅
  bowlDepth: number;      // 匙面の深さ(掘り込み)
  rimThickness: number;   // 縁の厚み(壁厚)
  neckPos: number;        // 首の位置(全長に対する割合 0-1)
  neckWidth: number;      // 首の太さ(幅)
  handleWidth: number;    // 柄の幅
  handleThickness: number;// 柄の厚み
  crankAngle: number;     // クランク角(柄の反り, 度)
  handleEnd: HandleEnd;   // 柄端の形
}

export const PRESETS: Record<string, SpoonParams> = {
  デザートスプーン: {
    totalLength: 180,
    bowlLength: 55,
    bowlWidth: 40,
    bowlDepth: 8,
    rimThickness: 3,
    neckPos: 0.35,
    neckWidth: 10,
    handleWidth: 14,
    handleThickness: 8,
    crankAngle: 12,
    handleEnd: 'round',
  },
  ティースプーン: {
    totalLength: 140,
    bowlLength: 42,
    bowlWidth: 30,
    bowlDepth: 6,
    rimThickness: 2.5,
    neckPos: 0.34,
    neckWidth: 8,
    handleWidth: 11,
    handleThickness: 6.5,
    crankAngle: 10,
    handleEnd: 'round',
  },
  サーバースプーン: {
    totalLength: 250,
    bowlLength: 85,
    bowlWidth: 62,
    bowlDepth: 14,
    rimThickness: 3.5,
    neckPos: 0.38,
    neckWidth: 14,
    handleWidth: 20,
    handleThickness: 11,
    crankAngle: 14,
    handleEnd: 'round',
  },
  杓子: {
    totalLength: 260,
    bowlLength: 95,
    bowlWidth: 80,
    bowlDepth: 22,
    rimThickness: 4,
    neckPos: 0.42,
    neckWidth: 16,
    handleWidth: 22,
    handleThickness: 12,
    crankAngle: 22,
    handleEnd: 'paddle',
  },
};

export const DEFAULT_PARAMS: SpoonParams = { ...PRESETS['デザートスプーン'] };

// スライダー定義(ラベル・範囲・刻み)
export interface SliderDef {
  key: keyof SpoonParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
}

export interface SliderGroup {
  title: string;
  summary: string;
  sliders: SliderDef[];
}

export const SLIDER_GROUPS: SliderGroup[] = [
  {
    title: '全体',
    summary: '長さと首の位置',
    sliders: [
      { key: 'totalLength', label: '全長', min: 100, max: 320, step: 1, unit: 'mm' },
      { key: 'neckPos', label: '首の位置', min: 0.22, max: 0.55, step: 0.01, unit: '%', hint: '匙先から全長に対する割合' },
      { key: 'neckWidth', label: '首の太さ', min: 6, max: 24, step: 0.5, unit: 'mm' },
    ],
  },
  {
    title: '匙面',
    summary: 'すくう部分の大きさと深さ',
    sliders: [
      { key: 'bowlLength', label: '匙面の長さ', min: 30, max: 120, step: 1, unit: 'mm' },
      { key: 'bowlWidth', label: '匙面の幅', min: 20, max: 90, step: 1, unit: 'mm' },
      { key: 'bowlDepth', label: '匙面の深さ', min: 2, max: 30, step: 0.5, unit: 'mm' },
      { key: 'rimThickness', label: '縁の厚み', min: 1.5, max: 6, step: 0.25, unit: 'mm' },
    ],
  },
  {
    title: '柄',
    summary: '握りやすさと反り',
    sliders: [
      { key: 'handleWidth', label: '柄の幅', min: 8, max: 30, step: 0.5, unit: 'mm' },
      { key: 'handleThickness', label: '柄の厚み', min: 4, max: 18, step: 0.5, unit: 'mm' },
      { key: 'crankAngle', label: 'クランク角(柄の反り)', min: -5, max: 30, step: 0.5, unit: '°' },
    ],
  },
];

// パラメータ <-> URLクエリ(共有用)
const NUM_KEYS: (keyof SpoonParams)[] = [
  'totalLength', 'bowlLength', 'bowlWidth', 'bowlDepth', 'rimThickness',
  'neckPos', 'neckWidth', 'handleWidth', 'handleThickness', 'crankAngle',
];

export function paramsToQuery(p: SpoonParams): string {
  const q = new URLSearchParams();
  for (const k of NUM_KEYS) q.set(k, String(p[k]));
  q.set('handleEnd', p.handleEnd);
  return q.toString();
}

export function paramsFromQuery(search: string): SpoonParams | null {
  const q = new URLSearchParams(search);
  if (!q.has('totalLength')) return null;
  const p: SpoonParams = { ...DEFAULT_PARAMS };
  for (const k of NUM_KEYS) {
    const v = q.get(k);
    if (v !== null && Number.isFinite(Number(v))) (p as any)[k] = Number(v);
  }
  const he = q.get('handleEnd');
  if (he === 'round' || he === 'square' || he === 'paddle') p.handleEnd = he;
  return p;
}
