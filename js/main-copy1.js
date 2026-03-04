import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/controls/OrbitControls.js';

// url取得
const viewer = document.getElementById("three-canvas2");
const modelUrl = viewer.dataset.modelUrl;
const itemType = viewer.dataset.modelType;

// function dataCheck() {
//   if (!viewer) return;
//   if (!modelUrl) {
//     console.error("URLが取得できてません")
//   }
//   if (!itemType) {
//     console.error("タグにアクセサリー種類が指定されていません")
//   }
//   console.log(itemType)
// }
function setType (itemType) {
  switch(itemType) {
    case type.RING:
      return type.RING;

    case type.BANGLE_BOLD:
      return type.BANGLE_BOLD;
        
    case type.BANGLE_EX_BOLD:
      return type.BANGLE_EX_BOLD;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".three-canvas-simple1")
    .forEach(canvas => {
      initSimpleViewer(
        canvas,
        canvas.dataset.modelUrl,
        canvas.dataset.modelType
      );
    });
});

// function setType (itemType) {
//   switch(itemType) {
//     case type.RING:
//       return type.RING;

//     case type.BANGLE_BOLD:
//       return type.BANGLE_BOLD;
        
//     case type.BANGLE_EX_BOLD:
//       return type.BANGLE_EX_BOLD;
      
//     default:
//       return type.BANGLE_LIGHT;
//   }
// }

function initSimpleViewer(canvas, modelUrl, modelType) {
// Variables: 変数
// const canvas = document.getElementById('three-canvas2');
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

// hdrファイルをプロジェクトに置く
const HDRI_URL = 'shimadasama/3dmodel/sunny_rose_garden_2k.hdr';

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

function loadHDRIEnvironment(url) {
  new RGBELoader()
    .setDataType(THREE.UnsignedByteType)
    .load(
      url,
      (hdrEquirect) => {
        const envMap = pmremGenerator.fromEquirectangular(hdrEquirect).texture;

        //背景は現状の黒を維持しつつ、環境光/反射だけHDRIを使う
        scene.environment = envMap;
        // scene.background は変えない（黒のまま）

        hdrEquirect.dispose();
        pmremGenerator.dispose();

        // すでに読み込み済みのモデルがあれば env の効きを調整
        if (model) applyEnvMapIntensity(model, 1.0);
      },
      undefined,
      (err) => console.error('HDRI load error', err)
    );
}

// envMapIntensity を一括調整（刻印を見せたいので 0.8〜2.0 で調整）
function applyEnvMapIntensity(root, intensity = 1.0) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mat = obj.material;
    if (!mat) return;

    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        if (m && 'envMapIntensity' in m) {
          m.envMapIntensity = intensity;
          m.needsUpdate = true;
        }
      });
      return;
    }

    if ('envMapIntensity' in mat) {
      mat.envMapIntensity = intensity;
      mat.needsUpdate = true;
    }
  });
}

loadHDRIEnvironment(HDRI_URL);

// camera: カメラ
const camera = new THREE.PerspectiveCamera(30, canvasWidth / canvasheight, 0.1, 1000);
const cameraTarget = new THREE.Vector3(0, 0, 0);

// rigth: ライト
// カメラ追従
const zoomLight = new THREE.PointLight(0xffffff, 15);
zoomLight.visible = false; // 通常時はOFF
scene.add(zoomLight);

const keyLight = new THREE.SpotLight(0xffffff, 15);
keyLight.position.set(3, 0, 3);
scene.add(keyLight);

const fillLight = new THREE.SpotLight(0xffffff, 7);
fillLight.position.set(-3, 0, 3);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 70);
backLight.position.set(-2, 0.5, -3);
scene.add(backLight);

const innerPointLight_1 = new THREE.PointLight(0xffffff, 30);
innerPointLight_1.position.set(1, 0, -0.2);
scene.add(innerPointLight_1);

const innerPointLight_2 = new THREE.PointLight(0xffffff, 30);
innerPointLight_2.position.set(0.2, -0.2, -0.5);
scene.add(innerPointLight_2);

// modelType
const type = {
  RING: "ring",
  BANGLE_EX_BOLD: "bangle_ex_bold",
  BANGLE_BOLD: "bangle_bold",
  BANGLE_LIGHT: "bangle_light",
}

// const modelType = setType(itemType);

// model: モデル
const loader = new GLTFLoader();
let model = null;
let loadTime = null;
let t = 0;
let mode = null; // 状態ステータス
let modelRoot = null;      // sceneに載せるルート（spinGroup）
let spinGroup = null;      // 回転専用
let correctionGroup = null;// 初期補正→0戻し専用
const MODEL_INITIAL_ROT_X = modelType == type.RING ? Math.PI / 2 : -Math.PI / 2; // 初期向き(-90度上向き)
const MODEL_INITIAL_ROT_Z = Math.PI; // 左右反転 180
const CAMERA_DISTANCE_MULTIPLIER = modelType == type.RING ? 15 : 5.2;

// モデル状態
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

const CyclePhase = {
  HOLD_LOAD: "HOLD_LOAD",
  UNWIND: "UNWIND",
  RUN: "RUN",
  RETURN_LOAD: "RETURN_LOAD",
  RETURN_SPIN: "RETURN_SPIN",
  RETURN_CORR: "RETURN_CORR",
};

// ===== 周回（サイクル）制御 =====
// 周回の大きな流れ：
// HOLD_LOAD(停止) → UNWIND(補正解除) → RUN(回転+ズーム一巡) → RETURN_LOAD(ロード時へ戻す) → HOLD_LOAD...

const HOLD_SECONDS   = 1.0; // ロード時姿勢で止める秒数
const UNWIND_SECONDS = 2.0; // ロード時姿勢 → 0姿勢（補正解除）にかける秒数
const RETURN_SECONDS = 2.8; // 0姿勢 → ロード時姿勢に戻す秒数

let cyclePhase = "HOLD_LOAD";     // "HOLD_LOAD" | "UNWIND" | "RUN" | "RETURN_LOAD"
let holdRemaining = HOLD_SECONDS; // 停止用カウントダウン（秒）
let cycleJustCompleted = false;   // 1セット（ズーム一巡）完了を示すフラグ

// RETURN_LOAD の補間進行度（0→1）
let returnT = 0;

// RETURN_LOAD 開始時に「補間の開始値/目標値」を固定するための変数
let spinFromY = 0, spinToY = 0;
let spinFromZ = 0, spinToZ = 0;
let corrFromX = 0, corrToX = 0;
let corrFromZ = 0, corrToZ = 0;

// ターンスピード
const turnSpeed = {
  // 通常時
  BASE: 0.02,
  // ズーム1の時
  ROTA_SWEEP_Y: 0.1,
  ROTA_SWEEP_Z: 0.1,
  // ズーム2の時
  ROTA_SPOT_Y: 0.05,
  ROTA_SPOT_Z: 0.05
};

  // デフォルト状態
const defaultView = {
  inited: false,
  fov: 0,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion()
};

// デフォルト状態の保存
function captureDefaultView(camera) {
  defaultView.inited = true;
  defaultView.fov = camera.fov;
  defaultView.target.copy(cameraTarget); // lookAtしている注視点
  defaultView.pos.copy(camera.position);
  defaultView.quat.setFromEuler(new THREE.Euler(0, 0, 0, "XYZ")).normalize();
}

loader.load( 
  modelUrl, // url

  (gltf) => { // onload
    model = gltf.scene;
    spinGroup = new THREE.Group();
    correctionGroup = new THREE.Group();

    // 初期補正は「correctionGroup」に入れる
    correctionGroup.rotation.x = MODEL_INITIAL_ROT_X; // 90度上向き
    correctionGroup.rotation.z = MODEL_INITIAL_ROT_Z; // 180度反転したいなら Math.PI

    correctionGroup.add(model);
    spinGroup.add(correctionGroup);

    modelRoot = spinGroup;
    scene.add(modelRoot);

    applyEnvMapIntensity(model, 1.2);

    setupModelBase(modelRoot, camera);
    captureDefaultView(camera);

    loadTime = performance.now();
  },
  
  undefined, // onProgress

  (error) => { // onError
    console.error('error内容', error.message);
    console.error('error発生', error);
  }
)

// モデル・カメラ基準セット
function setupModelBase(model, camera) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model); // バウンディングボックス作成
  const center = box.getCenter(new THREE.Vector3()); // ボックスの中心を取得
  const size = box.getSize(new THREE.Vector3()); // ボックスのサイズを取得
  const radius = size.length() * 0.5;
  const defaultPos = center.clone().add(new THREE.Vector3(0, 0, radius * CAMERA_DISTANCE_MULTIPLIER)); // カメラのポジション指定
  camera.position.copy(defaultPos); // ポジションにセット
  camera.lookAt(center);
  cameraTarget.copy(center);

  return { center, radius, defaultPos };
} 

const ZoomType = {
  SWEEP: "SWEEP",
  SPOT: "SPOT"
};

let nextZoomType;

// 回転スピード
const RotPreset = {
  NORMAL: {
    y: turnSpeed.BASE,
    z: turnSpeed.BASE
  },
  SWEEP_ZOOM: {
    y: turnSpeed.BASE * turnSpeed.ROTA_SWEEP_Y,
    z: turnSpeed.BASE * turnSpeed.ROTA_SWEEP_Z
  },
  SPOT_ZOOM: {
    y: turnSpeed.BASE * turnSpeed.ROTA_SPOT_Y,
    z: turnSpeed.BASE * turnSpeed.ROTA_SPOT_Z
  }
};

// 回転制御
function getRotationSpeedByMode(mode) {
  switch (mode) {
    case zoomStatu.ZOOM_SWEEP_IN:
    case zoomStatu.ZOOM_SWEEP_ACTIVE:
      return RotPreset.SWEEP_ZOOM;

    case zoomStatu.ZOOM_SPOT_IN:
    case zoomStatu.ZOOM_SPOT_HOLD:
      return RotPreset.SPOT_ZOOM;

    default:
      return RotPreset.NORMAL;
  }
}

function pickEndAngleWithDirection(start, end, preferredSign = 1) {
  const TWO_PI = Math.PI * 2;

  const shortestDelta =
    THREE.MathUtils.euclideanModulo((end - start) + Math.PI, TWO_PI) - Math.PI;

  if (Math.sign(shortestDelta) !== 0 &&
      Math.sign(shortestDelta) !== Math.sign(preferredSign)) {
    return end + TWO_PI * Math.sign(preferredSign);
  }

  return end;
}

const PREFERRED_UNWIND_SIGN_Z = Math.sign(RotPreset?.NORMAL?.z ?? turnSpeed.BASE) || 1;
const PREFERRED_UNWIND_SIGN_X = 1; // Xは見た目に影響しづらいので固定でOK（必要なら調整）

// 「0度」と同じ姿勢の別表現（2πなど）を使って、戻しの回転方向を揃える
const CORRECTION_END_X = pickEndAngleWithDirection(MODEL_INITIAL_ROT_X, 0, PREFERRED_UNWIND_SIGN_X);
const CORRECTION_END_Z = pickEndAngleWithDirection(MODEL_INITIAL_ROT_Z, 0, PREFERRED_UNWIND_SIGN_Z);

let zoomGateEnabled = false;
let runYawSinceStart = 0;
const RUN_GATE_YAW = THREE.MathUtils.degToRad(20);
// debag
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true; // 慣性を有効にする(操作を滑らかにするやつ)
// controls.dampingFactor = 0.08;// 慣性の減衰係数

// window.addEventListener("load", () => {
//   dataCheck();
// })

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
  // controls.update(); // debag

  const delta = clock.getDelta(); // 前回のこの処理からの時間を取得

  if (modelRoot) {
    switch (cyclePhase) {
      case CyclePhase.HOLD_LOAD: {
        cyclePhase = handleHoldLoad(delta);
        return;
      }
      
      case CyclePhase.UNWIND: {  // 初期状態から正面へ戻す
        t += delta / UNWIND_SECONDS;
        t = Math.min(t, 1);
  
        correctionGroup.rotation.x = THREE.MathUtils.lerp(MODEL_INITIAL_ROT_X, CORRECTION_END_X, t);
        correctionGroup.rotation.z = THREE.MathUtils.lerp(MODEL_INITIAL_ROT_Z, CORRECTION_END_Z, t);
  
        if (t >= 1) {
          cyclePhase = CyclePhase.RUN;
          zoomGateEnabled = false;
          runYawSinceStart = 0;
        }
        return;
      }

      case CyclePhase.RUN: {
        const rot = getRotationSpeedByMode(mode);
        spinGroup.rotation.y += rot.y;
        spinGroup.rotation.z += rot.z;

        if (!zoomGateEnabled) { // 初回だけズームを実施しない
          runYawSinceStart += Math.abs(rot.y);
          if (runYawSinceStart >= RUN_GATE_YAW) zoomGateEnabled = true;
        }
        // console.log(mode); // debag
        switch (mode) {
          case zoomStatu.ZOOM_SWEEP_IN:
            zoomCtx.lookAtCenterEnabled = true;
            zoomIn(delta, camera, presets.sweep.pos, camera.fov, zoomCtx.holdDuration);
            break;

          case zoomStatu.ZOOM_SWEEP_ACTIVE:
            zoomSweepActive(delta, camera, presets.active.pos);
            nextZoomType = ZoomType.SPOT;
            break;

          case zoomStatu.ZOOM_SPOT_IN:
            zoomIn(delta, camera, presets.spot.pos, camera.fov, zoomCtx.holdDuration);
            break;

          case zoomStatu.ZOOM_SPOT_HOLD:
            zoomSpotHold(delta);
            nextZoomType = ZoomType.SWEEP;
            break;

          case zoomStatu.ZOOM_RETURN_DEFAULT:
            zoomOut(delta, camera, zoomCtx.holdDuration);
            break;

          default:
            if (zoomGateEnabled) {
              if (shouldTriggerZoom(modelRoot, nextZoomType)) {
                mode = (nextZoomType === ZoomType.SPOT) // ズームの切り替え
                  ? zoomStatu.ZOOM_SPOT_IN
                  : zoomStatu.ZOOM_SWEEP_IN;
              }
            }
        }

        // --- 1セット完了を検知したら、戻しフェーズへ ---
        if (cycleJustCompleted && mode === zoomStatu.ZOOM_IDLE) {
          cycleJustCompleted = false;       // 多重発火防止
          returnT = 0;

          // まずは SPIN を戻す（親）
          spinFromY = spinGroup.rotation.y;
          spinFromZ = spinGroup.rotation.z;

          const signY = 1; // RotPreset.NORMAL.y が正なら固定でもOK
          const signZ = 1;

          spinToY = pickEquivalentAngleSameDirection(spinFromY, 0, signY);
          spinToZ = pickEquivalentAngleSameDirection(spinFromZ, 0, signZ);

          cyclePhase = CyclePhase.RETURN_SPIN;

          console.log("[phase] RUN -> RETURN_SPIN", {
            spinFromY, spinToY, spinFromZ, spinToZ, signY, signZ
          });
          return;
        }
        return;
      }

      case CyclePhase.RETURN_SPIN: {
        handleReturnSpin(delta);
        return;
      }

      case CyclePhase.RETURN_CORR: {
        handleReturnCorr(delta);
        return;
      }

      default:
        break;
    }
  }
}

const presets = getCameraPresetsByModelType(modelType);
animate();

function getCameraPresetsByModelType(modelType) {
  switch (modelType) {
    case type.RING:
      return {
        sweep:  { 
          fov: 35,
          target: new THREE.Vector3(0, 0.02, 0),
          pos: new THREE.Vector3(-1, -0.25, 1)
        },
        active: {
          fov: 28,
          target: new THREE.Vector3(0, 0.00, 0),
          pos: new THREE.Vector3(1.0, 0.3, 1)
        },
        spot: {
          fov: 18,
          target: new THREE.Vector3(0, 0.00, 0),
          pos: new THREE.Vector3(0.1, 0, -0.05)
        },
      };

    case type.BANGLE_EX_BOLD:
      return {
        sweep: {
          fov: 40,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(-2, -0.25, 3)
        },
        active: {
          fov: 32,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(2.0, 0.3, 2.5) 
        },
        spot: {
          fov: 22,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(0.7, 0, -0.5)
        },
      };
      
    case type.BANGLE_BOLD:
      return {
        sweep: {
          fov: 40,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(-2, -0.25, 3)
        },
        active: {
          fov: 32,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(2.0, 0.3, 2.5)
        },
        spot: {
          fov: 22,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(0.75, 0, -0.5)
        },
      };

    default:
      return {
        sweep: {
          fov: 40,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(-2, -0.25, 3)
        },
        active: {
          fov: 30,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(2.0, 0.3, 2.5)
        },
        spot: {
          fov: 20,
          target: new THREE.Vector3(0, 0, 0),
          pos: new THREE.Vector3(0.8, 0, -0.6)
        },
      };
  }
}

const zoomCtx = {
  inited: false, 
  t: 0, // ズーム進行度（0:開始, 1:終了）
  fovFrom: 0,
  fovTo: 0,
  targetFrom: new THREE.Vector3(),
  targetTo: new THREE.Vector3(),
  posFrom: new THREE.Vector3(),
  posTo: new THREE.Vector3(),
 
  hold: {
   elapsed: 0 // 経過時間
  },

  holdDuration: 1.6, // 舐める幅（モデルに合わせて調整）
  lookAtCenterEnabled: false
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// 直線だとカクつきやすいので、よく使うイージング
function easeInOutCubic(t) {
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
}

const frontGate = { armed: true };

// 正面に近づいたら動くようにトリガーをセット
function shouldTriggerZoom(model, zoomType) {
  if (!defaultView.inited) return false;

  const cur = model.quaternion.clone().normalize();
  const deg = THREE.MathUtils.radToDeg(cur.angleTo(defaultView.quat));

  let enter; // ここを下回ったら発火 数値が大きいほど正面の手前でズームする
  let exit; // ここを上回ったら再アーム exit > enter にする

  switch (zoomType) {
    case ZoomType.SPOT:
      enter = 8;
      exit = 20;
      break;
    
    default:
      enter = 20;
      exit = 38;
      break;
  }

  if (frontGate.armed && deg <= enter) {
    frontGate.armed = false;
    return true;
  }
  if (!frontGate.armed && deg >= exit) {
    frontGate.armed = true;
  }
  return false;
}

// ズームイン
function zoomIn(delta, camera, PosTo, fovTo, duration) {
  if (!zoomCtx.inited) { // 初回のみ設定
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    // ズーム前（From）
    zoomCtx.fovFrom = camera.fov;
    zoomCtx.posFrom.copy(camera.position);

    // ズーム後（To）
    zoomCtx.fovTo = fovTo;
    zoomCtx.posTo.copy(PosTo);
  }

  // 進行度を進める（0→1）
  zoomCtx.t = clamp01(zoomCtx.t + delta / duration);
  const tt = easeInOutCubic(zoomCtx.t);

  // カメラ位置を動かす
  camera.position.lerpVectors(zoomCtx.posFrom, zoomCtx.posTo, tt);

  // FOV を補間してズーム（レンズズーム）
  camera.fov = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(zoomCtx.fovFrom, zoomCtx.fovTo, tt),
    10, 75
  );
  camera.updateProjectionMatrix();

  // 注視点を補間して「特定位置を中央に持っていく
  if (zoomCtx.lookAtCenterEnabled) {
    camera.lookAt(cameraTarget);
  }

  // 完了判定
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
function zoomSweepActive(delta, camera, PosTo, duration = 4) {
  if (!zoomCtx.inited) { // 初回のみ設定
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    zoomCtx.posFrom.copy(camera.position);
    zoomCtx.posTo.copy(PosTo);
  }

  // 進行度を進める（0→1）
  zoomCtx.t = clamp01(zoomCtx.t + delta / duration);
  const tt = easeInOutCubic(zoomCtx.t);

  // カメラ位置を動かす
  camera.position.lerpVectors(zoomCtx.posFrom, zoomCtx.posTo, tt);
  camera.lookAt(cameraTarget);

  // 完了判定
  if (zoomCtx.t >= 1) {
    zoomCtx.inited = false;
    mode = zoomStatu.ZOOM_RETURN_DEFAULT;
  }
  return mode;
}

// ズームアウト（デフォルトに戻す）
function zoomOut(delta, camera, duration) {
  // 安全装置
  duration = Math.max(duration, 0.001);

  if (!zoomCtx.inited) {
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    // 現状を取得（ズーム状態
    zoomCtx.fovFrom = camera.fov;
    zoomCtx.targetFrom.copy(cameraTarget);
    zoomCtx.posFrom.copy(camera.position);
  }

  // 進行度を進める（0→1）
  zoomCtx.t = clamp01(zoomCtx.t + delta / duration);
  const tt = easeInOutCubic(zoomCtx.t);
  
  // カメラポジションをデフォへ
  camera.position.lerpVectors(zoomCtx.posFrom, defaultView.pos, tt);

  // FOVをデフォへ
  camera.fov = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(zoomCtx.fovFrom, defaultView.fov, tt),
    10, 75
  );
  camera.updateProjectionMatrix();

  // 注視点をデフォへ
  if (zoomCtx.lookAtCenterEnabled) {
    cameraTarget.lerpVectors(zoomCtx.targetFrom, defaultView.target, tt);
    camera.lookAt(cameraTarget);
  }

  // 完了判定
  if (zoomCtx.t >= 1) {
    zoomCtx.lookAtCenterEnabled = false;
    zoomCtx.inited = false;
    mode = zoomStatu.ZOOM_IDLE;
    
    if (nextZoomType === ZoomType.SWEEP) {
      cycleJustCompleted = true;
    }
  }
  return mode;
}

// 一時停止
function zoomSpotHold(delta, holdSeconds = 2.0) {
  // 安全装置：0以下なら即終了
  holdSeconds = Math.max(holdSeconds, 0.001);

  // 初回だけ初期化
  if (!zoomCtx.inited) {
    zoomCtx.inited = true;
    zoomCtx.hold.elapsed = 0;
  }

  // 経過時間を加算
  zoomCtx.hold.elapsed += delta;

  // 完了判定
  if (zoomCtx.hold.elapsed >= holdSeconds) {
    zoomCtx.inited = false;
    mode = zoomStatu.ZOOM_RETURN_DEFAULT;
  }
  return mode;
}

function handleHoldLoad(delta) {
  holdRemaining = Math.max(0, holdRemaining - delta); // holdRemaining(1秒) - delta(前回の処理からの時間)を計算して0になったら1秒経ったことになる。
  if (holdRemaining === 0) return CyclePhase.UNWIND;
  return CyclePhase.HOLD_LOAD;
}

function handleReturnSpin(delta) {
  returnT = Math.min(1, returnT + delta / RETURN_SECONDS);

  spinGroup.rotation.y = THREE.MathUtils.lerp(spinFromY, spinToY, returnT);
  spinGroup.rotation.z = THREE.MathUtils.lerp(spinFromZ, spinToZ, returnT);

  if (returnT >= 1) {
    returnT = 0;
    corrFromX = correctionGroup.rotation.x;
    corrFromZ = correctionGroup.rotation.z;

    corrToX = pickEquivalentAngleSameDirection(corrFromX, MODEL_INITIAL_ROT_X, -1);
    corrToZ = pickEquivalentAngleSameDirection(corrFromZ, MODEL_INITIAL_ROT_Z, 1);
    
    console.log("[phase] RETURN_SPIN -> RETURN_CORR", {
      corrFromX, corrToX, corrFromZ, corrToZ
    });
    cyclePhase = CyclePhase.RETURN_CORR;
  }
}

function handleReturnCorr(delta) {
  // 進行度 0→1
  returnT = Math.min(1, returnT + delta / UNWIND_SECONDS);

  // 子（correctionGroup）をロード時補正へ戻す
  correctionGroup.rotation.x = THREE.MathUtils.lerp(corrFromX, corrToX, returnT);
  correctionGroup.rotation.z = THREE.MathUtils.lerp(corrFromZ, corrToZ, returnT);

  // 完了したら後処理へ
  if (returnT >= 1) {
    returnT = 0;
    t = 0;

    // 「ロード時姿勢で1秒停止」に戻す
    cyclePhase = CyclePhase.HOLD_LOAD;
    holdRemaining = HOLD_SECONDS;

    // 次周回に向けてズーム関連を初期化
    mode = zoomStatu.ZOOM_IDLE;
    nextZoomType = ZoomType.SWEEP;

    // 既存がある前提（なければ削除OK）
    frontGate.armed = true;

    // ズーム内部状態（存在するなら）
    zoomCtx.inited = false;
    zoomCtx.lookAtCenterEnabled = false;

    // ゲート方式を使っているなら（使ってる場合だけ有効化）
    zoomGateEnabled = false;
    runYawSinceStart = 0;

    console.log("[phase] RETURN_CORR -> HOLD_LOAD");
  }
}

const TAU = Math.PI * 2;

// current(今の角)から見て、targetBase(0など)と同じ姿勢の角度を
// 回転方向 sign(+1/-1) に沿って “次に到達する値” として返す
function pickEquivalentAngleSameDirection(current, targetBase, sign) {
  let t = targetBase;

  // t を current の近く（同じ周回数帯）に寄せる
  const k = Math.floor((current - t) / TAU);
  t += k * TAU;

  // sign方向に「次」の同値角へ
  if (sign > 0 && t < current) t += TAU;
  if (sign < 0 && t > current) t -= TAU;

  return t;
}
}