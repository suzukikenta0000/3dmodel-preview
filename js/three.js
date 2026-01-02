import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/controls/OrbitControls.js';

// サイズの指定
const width = 500;
const height = 500;

const canvas = document.getElementById('three-canvas'); // index.html 側で用意した <canvas> 要素を取得
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); // レンダラーを作成 
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;

// 背景色を黒に設定とシーン作成
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

// カメラ設定
const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000); // fov, aspect, near, far
camera.position.set(0, 0, 10);
	// fov：画角（視野角）。小さいほど「ズームしてるように」見える
	// aspect：縦横比（width/height）
	// near / far：描画する奥行き範囲（カメラからの距離）
	// near より近いものは描画されない
	// far より遠いものは描画されない

// ライトの追加
const light = new THREE.DirectionalLight(0xffffff, 40);
light.position.set(0, 10, 0);
scene.add(light);

const light2 = new THREE.SpotLight(0xffffff, 10);
light2.position.set(3, 0, 8);
scene.add(light2);

const light3 = new THREE.SpotLight(0xffffff, 100);
light3.position.set(0, 0, 0);
light3.target.position.set(8, 3, 0);
scene.add(light3);
scene.add(light3.target);

// ====== ズーム中だけ暗い箇所（zoomTarget）を照らす補助ライト ======
// 通常時は intensity=0 にしておき、ズーム中だけ点灯させます。
const zoomSpot = new THREE.SpotLight(0xffffff, 0, 40, Math.PI / 6, 0.45, 1); // color, intensity, distance, angle, penumbra, decay
	// intensity：明るさ（最初は 0 → 普段は消灯）
	// distance：届く距離（40 まで）
	// angle：開き角（Math.PI/6 = 約30°）
	// penumbra：縁のボケ具合（0〜1）
	// decay：距離減衰（距離で暗くなる度合い）
zoomSpot.castShadow = false;
scene.add(zoomSpot);
scene.add(zoomSpot.target);

// 必要なら全体の暗さを少し底上げ（不要なら 0 のままでOK）
const fillAmbient = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(fillAmbient);

// モデルの読み込み
const loader = new GLTFLoader();
let model = null;

// 「正面（デフォ）」として戻したい姿勢（ロード完了時に保存）
let defaultFrontQuat = null;

loader.load( //url, onLoad, onProgress, onError
  'shimadasama/3dmodel/shimada-bold-test.glb',
  (gltf) => {
    model = gltf.scene; // gltf.sceneはモデル一式の情報が入っているらしい console.log(gltf);で確認できる メッシュとか大きさとかマテリアルとか
    model.scale.set(1, 1, 1); // モデルの大きさ調整 0.5なら小さくなる（半分）
    model.position.set(0, 0, 0); // モデルの位置調整 (x,y,z) 0,0,0なら中心
    
    // デバッグ：端が思った方向じゃない時は、BBox を見て ZOOM_END_AXIS / ZOOM_END_SIDE を変える
    // const box = new THREE.Box3().setFromObject(model);
    // console.log('bbox min', box.min, 'bbox max', box.max);

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
  // event / error は省略可能 undefinedをつけると省略したことになる
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
// zoomTarget = ズーム時に「どこを見るか（注視点）」
const zoomTarget = new THREE.Vector3(0, 0, -1);

// ====== 端ズーム設定（ここを変えると狙う端が変わる） ======
// axis: 'x' | 'y' | 'z' | 'auto'（auto は一番長い軸の端）
// side: 'min' | 'max'（どっちの端を見るか）
const ZOOM_END_AXIS = 'x';
const ZOOM_END_SIDE = 'max';

// ====== ズーム位置の微調整（左右・上下・手前/奥） ======
// +x: 右へ / -x: 左へ
// +y: 上へ / -y: 下へ
// +z: カメラ側へ / -z: 奥へ（※cameraが(0,0,10)なので基本はこう）
const ZOOM_TWEAK = new THREE.Vector3(-0.7, 0.0, 0.0);

// 正面(+Z)から寄る距離（小さいほど近い）
const zoomOffset = new THREE.Vector3(0, 0, 0.5);
const tmpZoomPos = new THREE.Vector3();

function getLongestAxis(box) {
  const size = box.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) return 'x';
  if (size.y >= size.x && size.y >= size.z) return 'y';
  return 'z';
}

// モデルのBBox（外接箱）から「端の位置」を計算して zoomTarget に入れる
// 端だけを指定して、残り2軸は中心に合わせる（"端を正面から" を作りやすい）
function setZoomTargetToModelEnd(modelObj, outTarget, axis = 'x', side = 'max') {
  const box = new THREE.Box3().setFromObject(modelObj);
  const center = box.getCenter(new THREE.Vector3());
  const useAxis = axis === 'auto' ? getLongestAxis(box) : axis;

  if (useAxis === 'x') {
    outTarget.set(side === 'min' ? box.min.x : box.max.x, center.y, center.z);
  } else if (useAxis === 'y') {
    outTarget.set(center.x, side === 'min' ? box.min.y : box.max.y, center.z);
  } else {
    outTarget.set(center.x, center.y, side === 'min' ? box.min.z : box.max.z);
  }
}

// 毎回ズーム位置が微妙にズレる原因：
// いまは「回転中の姿勢」で Box3 を計算しているため、AABB(外接箱)が回転で変形し、端座標も毎回変わる。
// そこで、defaultFrontQuat（正面姿勢）に一時的に戻してから Box3 を計算して、常に同じ位置を得る。
function setZoomTargetToModelEndStable(modelObj, outTarget, axis = 'x', side = 'max') {
  if (!defaultFrontQuat) {
    // 念のため（ロード直後など）
    setZoomTargetToModelEnd(modelObj, outTarget, axis, side);
    outTarget.add(ZOOM_TWEAK);
    return;
  }

  const prevQuat = modelObj.quaternion.clone();

  // 一時的に「正面（デフォ）」へ
  modelObj.quaternion.copy(defaultFrontQuat);
  modelObj.updateMatrixWorld(true);

  // 正面姿勢で端座標を計算
  setZoomTargetToModelEnd(modelObj, outTarget, axis, side);

  // 微調整
  outTarget.add(ZOOM_TWEAK);

  // 元の姿勢へ戻す（ズームインの補間は今まで通り）
  modelObj.quaternion.copy(prevQuat);
  modelObj.updateMatrixWorld(true);
}

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

// ユーザー操作開始・終了イベント
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
      zoomSpot.intensity = 0;
      fillAmbient.intensity = 0.0;
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
        setZoomTargetToModelEndStable(model, zoomTarget, ZOOM_END_AXIS, ZOOM_END_SIDE);

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

    // ズーム中は zoomTarget（開口部など）をピンポイントで照らす
    zoomSpot.position.copy(camera.position);            // カメラ位置から照らす（見たい場所が明るくなる）
    zoomSpot.target.position.copy(zoomTarget);          // 照らす先
    zoomSpot.intensity = 30;                            // 明るさ（10〜80くらいで調整）
    fillAmbient.intensity = 0.15;                       // 全体の底上げ（不要なら 0 ）

    if (tRaw === 1) {
      mode = MODE_HOLD;
      modeStartTime = now;
    }
  }

  // ====== ズーム保持：2秒キープ ======
  else if (mode === MODE_HOLD) {
    // ターゲットは固定
    controls.target.copy(zoomTarget);

    zoomSpot.position.copy(camera.position);
    zoomSpot.target.position.copy(zoomTarget);
    zoomSpot.intensity = 30;
    fillAmbient.intensity = 0.15;

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

    // ズームアウト中は補助ライトを徐々にOFF
    zoomSpot.position.copy(camera.position);
    zoomSpot.target.position.copy(zoomTarget);
    zoomSpot.intensity = 30 * (1 - t);
    fillAmbient.intensity = 0.15 * (1 - t);

    if (tRaw === 1) {
      zoomSpot.intensity = 0;
      fillAmbient.intensity = 0.0;
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
