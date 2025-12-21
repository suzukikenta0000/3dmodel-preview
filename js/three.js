import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/controls/OrbitControls.js';

const width = 500;
const height = 500;

const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);

// 背景色を黒に設定
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

// カメラ設定
const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);
camera.position.set(0, 0, 10);

// ライトの追加
const light = new THREE.DirectionalLight(0xffffff, 20);
light.position.set(0, 10, 0);
scene.add(light);

const light2 = new THREE.DirectionalLight(0xffffff, 10);
light2.position.set(3, 0, 8);
scene.add(light2);

const light3 = new THREE.DirectionalLight(0xffffff, 10);
light3.position.set(-3, 0, 9);
scene.add(light3);

// モデルの読み込み
const loader = new GLTFLoader();
let model = null;

// 「正面（デフォ）」として戻したい姿勢（ロード完了時に保存）
let defaultFrontQuat = null;

loader.load(
  'shimadasama/3dmodel/shimada-EXbold-test.glb',
  (gltf) => {
    model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.position.set(0, 0, 0);

    // ここで「正面（デフォ）」になるように必要なら補正してから保存
    // 例：model.rotation.y = Math.PI; など（モデル次第）
    defaultFrontQuat = model.quaternion.clone();

    scene.add(model);
  },
  (event) => {
    console.log('読み込み中...', (event.loaded / event.total) * 100 + '%');
  },
  (error) => {
    console.error('error発生', error);
  }
);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; // 慣性を有効にする(操作を滑らかにするやつ)
controls.dampingFactor = 0.08; // 慣性の減衰係数

let autoRotate = true;
const RESUME_DELAY = 2000; // 2秒
let resumeTimerId = null;

// ====== 演出（状態管理） ======
const MODE_ROTATE = 'ROTATE';
const MODE_ZOOM_IN = 'ZOOM_IN';
const MODE_HOLD = 'HOLD';
const MODE_ZOOM_OUT = 'ZOOM_OUT';

let mode = MODE_ROTATE;
let modeStartTime = performance.now();

// 通常回転→ズームのタイミング
const ROTATE_INTERVAL = 5000; // 5s
const ZOOM_IN_TIME = 1000;    // 1s
const ZOOM_HOLD_TIME = 2000;  // 2s
const ZOOM_OUT_TIME = 1000;   // 1s

// ズーム強さ（好みで）
const NORMAL_FOV = 30;
const ZOOM_FOV = 20;   // 小さいほどズームインっぽい

// 「特定部位」へズームしたい時にここを更新する
const zoomTarget = new THREE.Vector3(0, 0, 0);
const zoomOffset = new THREE.Vector3(0, 0, 4); // 正面(+Z)から寄る距離
const tmpZoomPos = new THREE.Vector3();

// 戻すためのスナップショット
let savedModelQuat = null;
let savedCamPos = null;
let savedCamFov = null;
let savedTarget = null;

// ズーム補間の「開始値」を固定するための変数
let zoomFromQuat = null;
let zoomFromPos = null;
let zoomFromFov = null;
let zoomFromTarget = null;
const tmpQuat = new THREE.Quaternion();

let userInteracting = false;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

controls.addEventListener('start', () => {
  userInteracting = true;
  autoRotate = false;

  // 演出中なら中断して、ズーム前状態へ即復帰（ユーザー操作と競合させない）
  if (mode !== MODE_ROTATE && model && savedModelQuat && savedCamPos && savedTarget) {
    model.quaternion.copy(savedModelQuat);
    camera.position.copy(savedCamPos);
    camera.fov = savedCamFov ?? NORMAL_FOV;
    camera.updateProjectionMatrix();

    controls.target.copy(savedTarget);
    controls.enabled = true;
    controls.update();

    mode = MODE_ROTATE;
    modeStartTime = performance.now();
  }

  if (resumeTimerId !== null) {
    clearTimeout(resumeTimerId);
    resumeTimerId = null;
  }
});

controls.addEventListener('end', () => {
  if (resumeTimerId !== null) clearTimeout(resumeTimerId);

  resumeTimerId = setTimeout(() => {
    userInteracting = false;
    autoRotate = true;

    // 自動回転が再開したタイミングから「5秒カウント」し直す
    mode = MODE_ROTATE;
    modeStartTime = performance.now();

    resumeTimerId = null;
  }, RESUME_DELAY);
});

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  // enableDamping を効かせるため、毎フレーム update は呼ぶ
  controls.update();

  // モデル読み込み前は通常描画のみ
  if (!model || !defaultFrontQuat) {
    renderer.render(scene, camera);
    return;
  }

  const elapsed = now - modeStartTime;

  // ====== 通常：モデル多方向回転（距離はカメラを動かさないので固定） ======
  if (mode === MODE_ROTATE) {
    if (autoRotate && !userInteracting) {
      model.rotation.x += 0.01;
      model.rotation.y += 0.02;
      model.rotation.z += 0.02;

      // 5秒経過したらズーム開始
      if (elapsed >= ROTATE_INTERVAL) {
        // 戻すために「ズーム前」の状態を保存
        savedModelQuat = model.quaternion.clone();
        savedCamPos = camera.position.clone();
        savedCamFov = camera.fov;
        savedTarget = controls.target.clone();

        // ズームターゲット（特定部位）
        // いまはモデル全体の中心にズームする（原点ズレ対策）
        new THREE.Box3().setFromObject(model).getCenter(zoomTarget);

        // ズーム補間の開始値を固定
        zoomFromQuat = model.quaternion.clone();
        zoomFromPos = camera.position.clone();
        zoomFromFov = camera.fov;
        zoomFromTarget = controls.target.clone();

        // 演出中はユーザー操作を無効化（誤操作防止）
        controls.enabled = false;

        autoRotate = false; // 回転停止
        mode = MODE_ZOOM_IN;
        modeStartTime = now;
      }
    }
  }

  // ====== ズームイン：回転停止 + 正面へ戻す + 特定部位へ寄る ======
  else if (mode === MODE_ZOOM_IN) {
    const tRaw = Math.min(elapsed / ZOOM_IN_TIME, 1);
    const t = easeInOut(tRaw);

    // モデル姿勢：正面（デフォ）へ
    tmpQuat.slerpQuaternions(zoomFromQuat, defaultFrontQuat, t);
    model.quaternion.copy(tmpQuat);

    // カメラ：正面(+Z)から zoomTarget を見る位置へ
    tmpZoomPos.copy(zoomTarget).add(zoomOffset);
    camera.position.lerpVectors(zoomFromPos, tmpZoomPos, t);

    // FOVでも少し寄せる（不要ならこの2行を消してOK）
    camera.fov = zoomFromFov + (ZOOM_FOV - zoomFromFov) * t;
    camera.updateProjectionMatrix();

    // 注視点：zoomTarget へ
    controls.target.lerpVectors(zoomFromTarget, zoomTarget, t);

    if (tRaw === 1) {
      mode = MODE_HOLD;
      modeStartTime = now;
    }
  }

  // ====== ズーム保持：2秒キープ ======
  else if (mode === MODE_HOLD) {
    // ターゲットは固定
    controls.target.copy(zoomTarget);

    if (elapsed >= ZOOM_HOLD_TIME) {
      // ズームアウト補間の開始値を固定
      zoomFromQuat = model.quaternion.clone();
      zoomFromPos = camera.position.clone();
      zoomFromFov = camera.fov;
      zoomFromTarget = controls.target.clone();

      mode = MODE_ZOOM_OUT;
      modeStartTime = now;
    }
  }

  // ====== ズームアウト：ズーム前の角度・距離・回転角に戻す ======
  else if (mode === MODE_ZOOM_OUT) {
    const tRaw = Math.min(elapsed / ZOOM_OUT_TIME, 1);
    const t = easeInOut(tRaw);

    // モデル姿勢：ズーム前の姿勢へ戻す
    tmpQuat.slerpQuaternions(zoomFromQuat, savedModelQuat, t);
    model.quaternion.copy(tmpQuat);

    // カメラ：ズーム前の位置へ
    camera.position.lerpVectors(zoomFromPos, savedCamPos, t);

    // FOV：元へ
    camera.fov = zoomFromFov + ((savedCamFov ?? NORMAL_FOV) - zoomFromFov) * t;
    camera.updateProjectionMatrix();

    // ターゲット：元へ
    controls.target.lerpVectors(zoomFromTarget, savedTarget, t);

    if (tRaw === 1) {
      // 演出終了：操作を戻して自動回転を再開
      controls.enabled = true;
      autoRotate = true;
      userInteracting = false;

      mode = MODE_ROTATE;
      modeStartTime = now; // ここからまた5秒カウント
    }
  }

  renderer.render(scene, camera);
}

animate();

// ====== model-viewer の interpolation（既存） ======
const interpolationSelect = document.querySelector('#Interpolation');

if (interpolationSelect) {
  const orbitCycle = [
    '45deg 75deg 1m',
    '135deg 110deg 3m',
    interpolationSelect.cameraOrbit
  ];

  let timer = null;
  let isAuto = true;

  const startAuto = () => {
    if (timer) return;
    timer = setInterval(() => {
      if (!isAuto) return;
      const i = orbitCycle.indexOf(interpolationSelect.cameraOrbit);
      interpolationSelect.cameraOrbit = orbitCycle[(i + 1 + orbitCycle.length) % orbitCycle.length];
    }, 3000);
  };

  const stopAuto = () => {
    isAuto = false;
  };

  interpolationSelect.addEventListener('camera-change', (e) => {
    if (e.detail?.source === 'user-interaction') stopAuto();
  });

  startAuto();
}
