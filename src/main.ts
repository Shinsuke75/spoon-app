import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSpoonGeometry, buildSpoonCurves } from './spoon';
import {
  DEFAULT_PARAMS, PRESETS, SLIDER_GROUPS, paramsFromQuery, paramsToQuery,
  type SpoonParams,
} from './params';
import './style.css';

// ---- 状態 ----
let params: SpoonParams = paramsFromQuery(location.search) ?? { ...DEFAULT_PARAMS };

// ---- レイアウト ----
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div><strong>木の匙</strong><span>スプーン設計</span></div>
      </div>
      <div class="phase-badge"><span></span> Phase 1 · 形状づくり</div>
    </header>
    <main class="workspace">
      <section class="viewer-card" aria-label="3Dプレビュー">
        <div id="viewer" class="viewer"></div>
        <div class="viewer-copy">
          <p class="eyebrow">一本の連続曲面</p>
          <h1>削る前に、<br>かたちを確かめる。</h1>
          <p>ドラッグで回転 · ピンチで拡大</p>
        </div>
        <div class="view-tools" role="group" aria-label="表示方向">
          <button type="button" data-view="top">上</button>
          <button type="button" data-view="side">横</button>
          <button type="button" class="is-active" data-view="iso">立体</button>
        </div>
        <div class="dimension-pill"><span id="dimension-length">180</span> mm</div>
        <div class="curve-key" aria-label="形状の構成">
          <span><i class="key-spine"></i>背骨</span>
          <span><i class="key-plan"></i>輪郭</span>
        </div>
      </section>
      <aside class="controls-panel">
        <div class="controls-heading">
          <div><p class="eyebrow">寸法を整える</p><h2>つくりたい匙</h2></div>
          <button id="reset" class="text-button" type="button">標準に戻す</button>
        </div>
        <div class="preset-row">
          <label for="preset">プリセット</label>
          <select id="preset"></select>
        </div>
        <div id="controls" class="control-groups"></div>
        <div class="export-row">
          <span class="export-label">3Dデータ書き出し</span>
          <div class="export-buttons">
            <button id="exportStl" type="button">STL</button>
            <button id="exportObj" type="button">OBJ</button>
            <button id="exportGlb" type="button">GLB</button>
          </div>
        </div>
        <div class="action-buttons">
          <button id="share" class="primary" type="button">共有リンクをコピー</button>
        </div>
        <div class="method-note">
          <span class="method-icon" aria-hidden="true">3</span>
          <div><strong>3つの曲線からロフト</strong><p>背骨・平面輪郭・変化する断面を滑らかにつなぎ、首で折れない一枚の面を作ります。作ったデザインは共有リンクで保存・共有できます。</p></div>
        </div>
      </aside>
    </main>
  </div>
`;

// ---- コントロールUI ----
const controlsRoot = document.querySelector<HTMLDivElement>('#controls')!;
const presetEl = document.querySelector<HTMLSelectElement>('#preset')!;
const inputs = new Map<string, HTMLInputElement>();
const outputs = new Map<string, HTMLOutputElement>();

function fmt(key: keyof SpoonParams, v: number): string {
  if (key === 'neckPos') return `${Math.round(v * 100)}`;
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

function renderControls() {
  controlsRoot.replaceChildren();
  inputs.clear();
  outputs.clear();
  SLIDER_GROUPS.forEach((group, groupIndex) => {
    const details = document.createElement('details');
    details.className = 'control-group';
    details.open = groupIndex < 2;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span><strong>${group.title}</strong><small>${group.summary}</small></span><i aria-hidden="true"></i>`;
    details.append(summary);
    const body = document.createElement('div');
    body.className = 'control-body';
    for (const def of group.sliders) {
      const row = document.createElement('label');
      row.className = 'slider-row';
      const header = document.createElement('span');
      header.className = 'slider-label';
      const output = document.createElement('output');
      output.innerHTML = `${fmt(def.key, params[def.key] as number)}<small>${def.unit}</small>`;
      header.innerHTML = `<span>${def.label}${def.hint ? `<small>${def.hint}</small>` : ''}</span>`;
      header.append(output);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(params[def.key]);
      input.setAttribute('aria-label', def.label);
      input.addEventListener('input', () => {
        (params as any)[def.key] = Number(input.value);
        output.innerHTML = `${fmt(def.key, Number(input.value))}<small>${def.unit}</small>`;
        presetEl.value = '';
        updateSpoon();
      });
      row.append(header, input);
      body.append(row);
      inputs.set(def.key, input);
      outputs.set(def.key, output);
    }
    details.append(body);
    controlsRoot.append(details);
  });

  // 柄端の形
  const endFieldset = document.createElement('fieldset');
  endFieldset.className = 'end-options';
  endFieldset.innerHTML = `
    <legend>柄端の形</legend>
    <div>
      <label><input type="radio" name="handle-end" value="round"><span>丸</span></label>
      <label><input type="radio" name="handle-end" value="square"><span>角</span></label>
      <label><input type="radio" name="handle-end" value="paddle"><span>しゃもじ型</span></label>
    </div>
  `;
  endFieldset.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.checked = input.value === params.handleEnd;
    input.addEventListener('change', () => {
      params.handleEnd = input.value as SpoonParams['handleEnd'];
      presetEl.value = '';
      updateSpoon();
    });
  });
  controlsRoot.append(endFieldset);
}

function syncControls() {
  for (const group of SLIDER_GROUPS) {
    for (const def of group.sliders) {
      inputs.get(def.key)!.value = String(params[def.key]);
      outputs.get(def.key)!.innerHTML =
        `${fmt(def.key, params[def.key] as number)}<small>${def.unit}</small>`;
    }
  }
  controlsRoot
    .querySelectorAll<HTMLInputElement>('input[name="handle-end"]')
    .forEach((input) => (input.checked = input.value === params.handleEnd));
}

// プリセット
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
  params = { ...preset };
  syncControls();
  updateSpoon();
  frameView(currentView);
});

// ---- 3Dシーン ----
const viewer = document.querySelector<HTMLDivElement>('#viewer')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#d7ddd5');
scene.fog = new THREE.Fog('#d7ddd5', 400, 900);

const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.minDistance = 80;
controls.maxDistance = 1200;

scene.add(new THREE.HemisphereLight('#fff9eb', '#738078', 1.3));
const keyLight = new THREE.DirectionalLight('#fff5d6', 2.4);
keyLight.position.set(-80, 160, 100);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#dcecff', 1.1);
rimLight.position.set(120, 60, -130);
scene.add(rimLight);

const woodMaterial = new THREE.MeshPhysicalMaterial({
  color: '#c48b52',
  roughness: 0.5,
  metalness: 0,
  clearcoat: 0.18,
  clearcoatRoughness: 0.72,
});

const spoonGroup = new THREE.Group();
scene.add(spoonGroup);
const mesh = new THREE.Mesh(buildSpoonGeometry(params), woodMaterial);
spoonGroup.add(mesh);

const ground = new THREE.GridHelper(500, 25, '#a8b2a8', '#c5cec5');
(ground.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.33;
(ground.material as THREE.Material & { transparent: boolean }).transparent = true;
scene.add(ground);

let guideGroup = new THREE.Group();
spoonGroup.add(guideGroup);
const currentBounds = new THREE.Box3();

function makeGuideLine(points: THREE.Vector3[], color: string, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
}

function updateSpoon() {
  mesh.geometry.dispose();
  mesh.geometry = buildSpoonGeometry(params);

  guideGroup.traverse((child) => {
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
  spoonGroup.remove(guideGroup);
  guideGroup = new THREE.Group();
  const curves = buildSpoonCurves(params);
  guideGroup.add(makeGuideLine(curves.spine, '#314f42', 0.62));
  guideGroup.add(makeGuideLine(curves.left, '#c66846', 0.38));
  guideGroup.add(makeGuideLine(curves.right, '#c66846', 0.38));
  spoonGroup.add(guideGroup);

  currentBounds.copy(mesh.geometry.boundingBox!);
  ground.position.y = currentBounds.min.y - 6;

  const lengthOutput = document.querySelector('#dimension-length');
  if (lengthOutput) lengthOutput.textContent = `${params.totalLength}`;
}

type ViewName = 'top' | 'side' | 'iso';
let currentView: ViewName = 'iso';
function frameView(view: ViewName) {
  currentView = view;
  const center = currentBounds.getCenter(new THREE.Vector3());
  const sphere = currentBounds.getBoundingSphere(new THREE.Sphere());
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
  const limitingHalfFov = Math.max(THREE.MathUtils.degToRad(4), Math.min(verticalHalfFov, horizontalHalfFov));
  const distance = THREE.MathUtils.clamp(sphere.radius / Math.sin(limitingHalfFov) * 1.08, 100, 1100);
  const directions: Record<ViewName, THREE.Vector3> = {
    top: new THREE.Vector3(0, 1, 0),
    side: new THREE.Vector3(0, 0, 1),
    iso: new THREE.Vector3(0.24, 0.62, 0.75).normalize(),
  };
  camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
  camera.position.copy(center).addScaledVector(directions[view], distance);
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
  // 被写体が霞まないよう、フォグはカメラ距離より奥に置く
  const fog = scene.fog as THREE.Fog;
  fog.near = distance * 1.8;
  fog.far = distance * 4;
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    frameView(button.dataset.view as ViewName);
  });
});

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', () => {
  params = { ...DEFAULT_PARAMS };
  presetEl.value = 'デザートスプーン';
  syncControls();
  updateSpoon();
  frameView('iso');
});

// 3Dデータ書き出し
function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.querySelector<HTMLButtonElement>('#exportStl')!.addEventListener('click', () => {
  const data = new STLExporter().parse(mesh, { binary: true }) as DataView<ArrayBuffer>;
  download(new Blob([data.buffer], { type: 'model/stl' }), 'spoon.stl');
});

document.querySelector<HTMLButtonElement>('#exportObj')!.addEventListener('click', () => {
  const text = new OBJExporter().parse(mesh);
  download(new Blob([text], { type: 'text/plain' }), 'spoon.obj');
});

document.querySelector<HTMLButtonElement>('#exportGlb')!.addEventListener('click', () => {
  new GLTFExporter().parse(
    mesh,
    (result) => {
      const buffer = result as ArrayBuffer;
      download(new Blob([buffer], { type: 'model/gltf-binary' }), 'spoon.glb');
    },
    (error) => console.error(error),
    { binary: true },
  );
});

// 共有リンク
document.querySelector<HTMLButtonElement>('#share')!.addEventListener('click', async (e) => {
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

// ---- 描画ループ・リサイズ ----
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(viewer);

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

renderControls();
updateSpoon();
resize();
frameView('iso');
