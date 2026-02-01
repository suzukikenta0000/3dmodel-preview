import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';

// Variables: 変数
const canvas = document.getElementById('three-canvas2');
const canvasWidth = 500;
const canvasheight = 500;
const clock = new THREE.Clock();

// renderer: レンダラー
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true});
renderer.setSize(canvasWidth, canvasheight);
renderer.setPixelRatio(window.devicePixelRatio);

// scene: シーン
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

// camera: カメラ
const camera = new THREE.PerspectiveCamera(30, canvasWidth / canvasheight, 0.1, 1000);
const cameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.set(0, 0, 10); 

// rigth: ライト
const light = new THREE.DirectionalLight(0xffffff, 40);
light.position.set(0, 3, 0);
scene.add(light);

const light2 = new THREE.SpotLight(0xffffff, 30);
light2.position.set(3, 0, 3);
scene.add(light2);

// model: モデル
const loader = new GLTFLoader();
let model = null;
let loadTime = null;
let t = 0;
let mode = null; // 状態ステータス

// ズーム状態
// ズーム1: 左から右へ表面をなぞるようなズーム
// ズーム2: モデルの刻印へズーム
const zoomStatu = {
  // 通常時
  ZOOM_IDLE : "zoom_idle",
  // ズーム1ステータス
  ZOOM_SWEEP_IN : "zoom_sweep_in",
  ZOOM_SWEEP_ACTIVE : "zoom_sweep_active",
  // ズーム2ステータス
  ZOOM_SPOT_IN : "zoom_spot_in",
  ZOOM_SPOT_HOLD : "zoom_spot_hold",
  // ズームアウト（通常時へ）
  ZOOM_RETURN_DEFAULT: "zoom_return_defualt"
};

// ターンスピード
const turnSpeed = {
  // 通常時
    BASE: 0.02,
    ROTA_NORMAL_Y: 0.02, 
    ROTA_NORMAL_Z: 0.02,
    // ズーム時
    ROTA_SLOW_Y: 0,
    ROTA_SLOW_Z: 0
  };

  // デフォルト状態の保存
const defaultView = {
  inited: false,
  fov: 0,
  target: new THREE.Vector3(),
};

const MODEL_INITIAL_ROT_X = -Math.PI / 2; // 初期向き(-90度上向き)
let modelBaseCamera;

loader.load( 
  'shimadasama/3dmodel/shimada-bold-test.glb', // url

  (gltf) => { // onload
    model = gltf.scene;
    model.position.set(0, 0, 0);
    model.rotation.x = MODEL_INITIAL_ROT_X;
    scene.add(model);

    loadTime = performance.now(); // ページ表示からこの処理が動いた時間
    modelBaseCamera = setupModelBase(model, camera); // ポジション、カメラ位置のデフォルトセット
  },
  
  undefined, // onProgress

  (error) => { // onError
    console.error('error内容', error.message);
    console.error('error発生', error);
  }
)

// モデル・カメラ基準取得
function setupModelBase(model, camera) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model); // バウンディングボックス作成
  const center = box.getCenter(new THREE.Vector3()); // ボックスの中心を取得
  const size = box.getSize(new THREE.Vector3()); // ボックスのサイズを取得
  const radius = size.length() * 0.5;
  const defaultPos = center.clone().add(new THREE.Vector3(0, 0, radius * 5.2)); // カメラのポジション指定
  camera.position.copy(defaultPos); // ポジションにセット
  camera.lookAt(center);

  return { center, radius, defaultPos };
} 

const ZoomType = {
  SWEEP: "SWEEP",
  SPOT: "SPOT",
};

let nextZoomType = ZoomType.SWEEP;

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);

  const delta = clock.getDelta(); // 前回のこの処理からの時間を取得
  const elapsed = (performance.now() - loadTime) * 0.001;

  if (model) {
    if (elapsed < 1) {
      // 1秒正面で停止
    } else {
      // model.rotation.x += 0.02;
      model.rotation.y += turnSpeed.BASE;
      model.rotation.z += turnSpeed.BASE;

      if (t < 1) {
        t += delta / 2;
        t = Math.min(t, 1);
  
        model.rotation.x = MODEL_INITIAL_ROT_X * (1 - t); // 正面(0度)に戻す
      } else {
        if (!defaultView.inited) {
          captureDefaultView(camera);
        }
        console.log(mode); // debag
        switch (mode) {
          case zoomStatu.ZOOM_SWEEP_IN:
            targetWorld = new THREE.Vector3(-1, 0, 0);
            zoomIn(delta, camera, targetWorld);
            break;
          case zoomStatu.ZOOM_SWEEP_ACTIVE:
            zoomSweepActive(delta, camera, baseTargetWorld);
            nextZoomType = ZoomType.SPOT;
            break;
          case zoomStatu.ZOOM_SPOT_IN:
            targetWorld = new THREE.Vector3(1.5, 0, -1);
            zoomIn(delta, camera, targetWorld);
            break;
          case zoomStatu.ZOOM_SPOT_HOLD:
            zoomSpotHold(delta)
            nextZoomType = ZoomType.SWEEP;
            break;
          case zoomStatu.ZOOM_RETURN_DEFAULT:
            zoomReturnToDefault(delta, camera)
            break;
          default:
            mode = (nextZoomType === ZoomType.SPOT)
              ? zoomStatu.ZOOM_SPOT_IN
              : zoomStatu.ZOOM_SWEEP_IN;
        }
      }
    }
  }
}

animate();

// 変更前後のステータス
const zoomCtx = {
  inited: false,
  // ズーム進行度（0:開始, 1:終了）
  t: 0,

  // ズーム率
  fovFrom: 0, // 前
  fovTo: 0, // 後

  // ズーム箇所の指定
  targetFrom: new THREE.Vector3(), // 前
  targetTo: new THREE.Vector3(), // 後

  // zoomCtx に追加
  holdInited: false,
  holdT: 0,

  holdFrom: new THREE.Vector3(),
  holdTo: new THREE.Vector3(),

  // 舐める幅（モデルに合わせて調整）
  holdDuration: 1.6
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// 直線だとカクつきやすいので、よく使うイージング
function easeInOutCubic(t) {
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
}

// デフォルト保存
function captureDefaultView(camera) {
  defaultView.inited = true;
  defaultView.fov = camera.fov;
  defaultView.target.copy(cameraTarget); // lookAtしている注視点
}

// ズーム時に見るところ
let targetWorld = new THREE.Vector3();
let baseTargetWorld = new THREE.Vector3(1, 0, 0);

// ズームイン
function zoomIn(delta, camera, targetWorld, fovTo = 10, duration = zoomCtx.holdDuration) {
  if (!zoomCtx.inited) { // 初回のみ設定
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    // ズーム前（From）
    zoomCtx.fovFrom = camera.fov;
    zoomCtx.targetFrom.copy(cameraTarget);

    // ズーム後（To）
    zoomCtx.fovTo = fovTo;
    zoomCtx.targetTo.copy(targetWorld);
  }

  // 1) 進行度を進める（0→1）
  zoomCtx.t = clamp01(zoomCtx.t + delta / duration);
  const tt = easeInOutCubic(zoomCtx.t);

  // 2) FOV を補間してズーム（レンズズーム）
  camera.fov = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(zoomCtx.fovFrom, zoomCtx.fovTo, tt),
    10, 75
  );
  camera.updateProjectionMatrix(); // ★必須

  // 3) 注視点を補間して「特定位置を中央に持っていく」
  cameraTarget.lerpVectors(zoomCtx.targetFrom, zoomCtx.targetTo, tt);
  camera.lookAt(cameraTarget);

  // 4) 完了判定（trueなら「ズーム完了」）
  if (zoomCtx.t >= 1){
    zoomCtx.inited = false;
    switch (mode) {
      case zoomStatu.ZOOM_SWEEP_IN:
        mode = zoomStatu.ZOOM_SWEEP_ACTIVE;
        break;
      case zoomStatu.ZOOM_SPOT_IN:
        mode = zoomStatu.ZOOM_SPOT_HOLD;
        break;
    }
  }
  return mode;
}

// 表面を流れるように移動
function zoomSweepActive(delta, camera, baseTargetWorld, rangeX = 0.12, duration = 2.5) {
  if (!zoomCtx.holdInited) { // 初回のみ設定
    zoomCtx.holdInited = true;
    zoomCtx.holdT = 0;

    // 移動前
    zoomCtx.holdFrom.copy(targetWorld);
    zoomCtx.holdFrom.x -= rangeX;

    // 移動後
    zoomCtx.holdTo.copy(baseTargetWorld);
    zoomCtx.holdTo.x += rangeX;
  }

  // 1) 進行度を進める（0→1）
  zoomCtx.holdT = clamp01(zoomCtx.holdT + delta / duration);
  const tt = easeInOutCubic(zoomCtx.holdT);

  // 2) 注視点を左→右へ補間
  cameraTarget.lerpVectors(zoomCtx.holdFrom, zoomCtx.holdTo, tt);

  // 3) 見る
  camera.lookAt(cameraTarget);

  // 4) 完了したら次へ
  if (zoomCtx.holdT >= 1) {
    zoomCtx.holdInited = false;
    mode = zoomStatu.ZOOM_RETURN_DEFAULT;
  }
  // console.log("mode");
  return mode;
}

// ズームアウト（デフォルトに戻す）
function zoomReturnToDefault(delta, camera, duration = zoomCtx.holdDuration) {
  // 安全装置
  duration = Math.max(duration, 0.001);

  if (!zoomCtx.inited) {
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    zoomCtx.fovFrom = camera.fov;
    zoomCtx.targetFrom.copy(cameraTarget);
  }

  zoomCtx.t = clamp01(zoomCtx.t + delta / duration);
  const tt = easeInOutCubic(zoomCtx.t);

  // FOVをデフォへ
  camera.fov = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(zoomCtx.fovFrom, defaultView.fov, tt),
    10, 75
  );
  camera.updateProjectionMatrix();

  // 注視点をデフォへ
  cameraTarget.lerpVectors(zoomCtx.targetFrom, defaultView.target, tt);
  camera.lookAt(cameraTarget);

  // 完了したら「本当の通常状態」に入る
  if (zoomCtx.t >= 1) {
    zoomCtx.inited = false;
    mode = zoomStatu.ZOOM_IDLE;
  }
  return mode;
}

const spotHoldCtx = {
  inited: false,
  elapsed: 0,
};

function zoomSpotHold(delta, holdSeconds = 2.0) {
  // 安全装置：0以下なら即終了
  holdSeconds = Math.max(holdSeconds, 0.001);

  // 初回だけ初期化
  if (!spotHoldCtx.inited) {
    spotHoldCtx.inited = true;
    spotHoldCtx.elapsed = 0;
  }

  // 経過時間を加算
  spotHoldCtx.elapsed += delta;

  // 2秒経ったら次の状態へ
  if (spotHoldCtx.elapsed >= holdSeconds) {
    spotHoldCtx.inited = false; // 次回用にリセット
    mode = zoomStatu.ZOOM_RETURN_DEFAULT;
  }
  return mode;
}

