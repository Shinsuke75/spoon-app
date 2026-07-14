import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { buildSpoonGeometry } from './spoon';
import {
  DEFAULT_PARAMS, PRESETS, SLIDERS, paramsFromQuery, paramsToQuery,
  type SpoonParams,
} from './params';
import './style.css';

// ---- 状態 ----
const params: SpoonParams = paramsFromQuery(location.search) ?? { ...DEFAULT_PARAMS };

// ---- 3Dシーン ----
const viewport = document.getElementById('viewport')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f1ea);

const camera = new THREE.PerspectiveCamera(40, 1, 1, 2000);
camera.position.set(140, 120, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 10, 0);

scene.add(new THREE.HemisphereLight(0xfff6e8, 0xcbbba4, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(120, 220, 140);
scene.add(dir);
const dir2 = new THREE.DirectionalLight(0xfff0dd, 0.5);
dir2.position.set(-160, 60, -120);
scene.add(dir2);

const material = new THREE.MeshStandardMaterial({
  color: 0xc59a62, roughness: 0.55, metalness: 0.0,
});
const mesh = new THREE.Mesh(buildSpoonGeometry(params), material);
scene.add(mesh);

function rebuild() {
  mesh.geometry.dispose();
  mesh.geometry = buildSpoonGeometry(params);
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(viewport);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// 外部(テスト等)からカメラ位置を指定するためのフック
window.addEventListener('setcam', ((e: CustomEvent<number[]>) => {
  const [x, y, z] = e.detail;
  camera.position.set(x, y, z);
  controls.update();
}) as EventListener);

// ---- UI ----
const slidersEl = document.getElementById('sliders')!;
const valueEls = new Map<string, HTMLElement>();
const inputEls = new Map<string, HTMLInputElement>();

function fmt(key: keyof SpoonParams, v: number): string {
  if (key === 'neckPos') return `${Math.round(v * 100)}%`;
  if (key === 'crankAngle') return `${v}°`;
  return `${v}mm`;
}

for (const def of SLIDERS) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  const head = document.createElement('div');
  head.className = 'head';
  const label = document.createElement('span');
  label.textContent = def.label;
  const val = document.createElement('span');
  val.className = 'val';
  val.textContent = fmt(def.key, params[def.key] as number);
  head.append(label, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  input.value = String(params[def.key]);
  input.addEventListener('input', () => {
    (params as any)[def.key] = Number(input.value);
    val.textContent = fmt(def.key, Number(input.value));
    presetEl.value = '';
    rebuild();
  });

  row.append(head, input);
  slidersEl.appendChild(row);
  valueEls.set(def.key, val);
  inputEls.set(def.key, input);
}

const handleEndEl = document.getElementById('handleEnd') as HTMLSelectElement;
handleEndEl.value = params.handleEnd;
handleEndEl.addEventListener('change', () => {
  params.handleEnd = handleEndEl.value as SpoonParams['handleEnd'];
  presetEl.value = '';
  rebuild();
});

// プリセット
const presetEl = document.getElementById('preset') as HTMLSelectElement;
{
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '(カスタム)';
  presetEl.appendChild(blank);
  for (const name of Object.keys(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    presetEl.appendChild(opt);
  }
  presetEl.value = 'デザートスプーン';
}
presetEl.addEventListener('change', () => {
  const preset = PRESETS[presetEl.value];
  if (!preset) return;
  Object.assign(params, preset);
  for (const def of SLIDERS) {
    inputEls.get(def.key)!.value = String(params[def.key]);
    valueEls.get(def.key)!.textContent = fmt(def.key, params[def.key] as number);
  }
  handleEndEl.value = params.handleEnd;
  rebuild();
});

// STL書き出し
document.getElementById('exportStl')!.addEventListener('click', () => {
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true }) as DataView<ArrayBuffer>;
  const blob = new Blob([data.buffer], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spoon.stl';
  a.click();
  URL.revokeObjectURL(a.href);
});

// 共有リンク
document.getElementById('share')!.addEventListener('click', async (e) => {
  const url = `${location.origin}${location.pathname}?${paramsToQuery(params)}`;
  history.replaceState(null, '', url);
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'コピーしました!';
  } catch {
    btn.textContent = 'URLを更新しました';
  }
  setTimeout(() => (btn.textContent = '共有リンクをコピー'), 1500);
});
