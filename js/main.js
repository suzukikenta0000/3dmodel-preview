import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/RGBELoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/controls/OrbitControls.js';

// Variables: 変数
const canvas = document.getElementById('three-canvas2');
const canvasWidth = 500;
const canvasheight = 500;
const clock = new THREE.Clock();

// renderer: レンダラー
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true});
renderer.setSize(canvasWidth, canvasheight);
renderer.setPixelRatio(window.devicePixelRatio);
// renderer.outputEncoding = THREE.sRGBEncoding;
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
// renderer.toneMappingExposure = 1.5;

// scene: シーン
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

// --- HDRI Environment (backgroundは変えず、反射/間接光だけに使う) ---
// 使い方:
// 1) hdrファイルをプロジェクトに置く（例: /hdr/studio_small_08_1k.hdr）
// 2) 下のHDRI_URLをそのパスに合わせる
const HDRI_URL = 'shimadasama/3dmodel/sunny_rose_garden_2k.hdr'; // ←自分のhdrパスに変更

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
camera.position.set(0, 0, 10); // モデル中心から手前に10の位置

// rigth: ライト
// --- Lighting helpers (shadow lift + zoom follow light) ---
// 影を少し持ち上げる（ズーム時に内側が真っ黒になりにくい）
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x202020, 2);
scene.add(hemiLight);

// カメラ追従のフィルライト（ズーム時に刻印周りを最低限見えるようにする）
const zoomFillLight = new THREE.PointLight(0xffffff, 15);
zoomFillLight.visible = false; // 通常時はOFF
scene.add(zoomFillLight);

const light = new THREE.DirectionalLight(0xffffff, 10);
light.position.set(0, 3, 0);
scene.add(light);
const light11 = new THREE.DirectionalLight(0xffffff, 70);
light11.position.set(-2, 0.5, -3);
scene.add(light11);

const light2 = new THREE.SpotLight(0xffffff, 15);
light2.position.set(3, 0, 3);
scene.add(light2);

const light22 = new THREE.SpotLight(0xffffff, 15);
light22.position.set(-3, 0, 3);
scene.add(light22);

const pointlight3 = new THREE.PointLight(0xffffff, 30);
pointlight3.position.set(1, 0, -0.2);
scene.add(pointlight3);

const pointlight5 = new THREE.PointLight(0xffffff, 30);
pointlight5.position.set(0.2, -0.2, -0.5);
scene.add(pointlight5);

// const helper = new THREE.DirectionalLightHelper( light, 2 );
// scene.add( helper );
// const helper2 = new THREE.DirectionalLightHelper( light2, 2 );
// scene.add( helper2 );
// const helper3 = new THREE.DirectionalLightHelper( light11, 2 );
// scene.add( helper3 );
// const helper4 = new THREE.DirectionalLightHelper( light22, 2 );
// scene.add( helper4 );

// const pointhelp3 = new THREE.PointLightHelper( pointlight3, 0.5 );
// scene.add( pointhelp3 );
// const pointhelp5 = new THREE.PointLightHelper( pointlight5, 0.5 );
// scene.add( pointhelp5 );

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
    // ズーム時
    ROTA_SWEEP_Y: 0.1,
    ROTA_SWEEP_Z: 0.1,
    ROTA_SPOT_Y: 0.1,
    ROTA_SPOT_Z: 0.1
  };

  // デフォルト状態の保存
const defaultView = {
  inited: false,
  fov: 0,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion()
};

// デフォルト保存
function captureDefaultView(camera) {
  defaultView.inited = true;
  defaultView.fov = camera.fov;
  defaultView.target.copy(cameraTarget); // lookAtしている注視点
  defaultView.pos.copy(camera.position);
  defaultView.quat.setFromEuler(new THREE.Euler(0, 0, 0, "XYZ")).normalize();
}

const MODEL_INITIAL_ROT_X = -Math.PI / 2; // 初期向き(-90度上向き)
let modelBaseCamera;

loader.load( 
  'shimadasama/3dmodel/shimada-bold-test.glb', // url

  (gltf) => { // onload
    model = gltf.scene;
    model.position.set(0, 0, 0);
    model.rotation.x = MODEL_INITIAL_ROT_X;
    scene.add(model);

    // HDRI反射の効き（刻印が暗い場合は 1.2〜2.0 に上げる）
    applyEnvMapIntensity(model, 1.2);

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
  SPOT: "SPOT"
};

let nextZoomType = ZoomType.SWEEP;

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

// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true; // 慣性を有効にする(操作を滑らかにするやつ)
// controls.dampingFactor = 0.08;// 慣性の減衰係数

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
  // controls.update();

  const delta = clock.getDelta(); // 前回のこの処理からの時間を取得
  const elapsed = (performance.now() - loadTime) * 0.001;

  if (model) {
    if (elapsed < 1) {
      // 1秒正面で停止
    } else {
      const rot = getRotationSpeedByMode(mode);
      model.rotation.y += rot.y;
      model.rotation.z += rot.z;
      // console.log("mode", mode, "rot", rot);

      // ズーム中だけカメラ位置にフィルライトを置く（刻印が暗くなる対策）
      const isZooming = (
        mode === zoomStatu.ZOOM_SPOT_IN ||
        mode === zoomStatu.ZOOM_SPOT_HOLD
      );
      zoomFillLight.visible = isZooming;
      if (isZooming) {
        // カメラの少し前方に置く（内側を照らしやすくする）
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        zoomFillLight.position.copy(camera.position).add(forward.multiplyScalar(0.25));
      }


      if (t < 1) {
        t += delta / 2;
        t = Math.min(t, 1);
  
        model.rotation.x = MODEL_INITIAL_ROT_X * (1 - t); // 正面(0度)に戻す
      } else {
        if (!defaultView.inited) { // defualtを保存（一回だけ
          captureDefaultView(camera);
        }
        console.log(mode); // debag
        switch (mode) {
          case zoomStatu.ZOOM_SWEEP_IN:
            zoomCtx.zoom.target = new THREE.Vector3(0, 0, 0);
            zoomCtx.zoom.pos = new THREE.Vector3(-1, -0.25, 3); // ズーム位置
            zoomIn(delta, camera, zoomCtx.zoom.target, zoomCtx.zoom.pos, camera.fov, zoomCtx.holdDuration);
            break;

          case zoomStatu.ZOOM_SWEEP_ACTIVE:
            zoomCtx.active.pos = new THREE.Vector3(1.2, 0.3, 2.5);
            zoomSweepActive(delta, camera, zoomCtx.active.pos);
            nextZoomType = ZoomType.SPOT;
            break;

          case zoomStatu.ZOOM_SPOT_IN:
            zoomCtx.spot.pos = new THREE.Vector3(1, 0, -0.1); // ズーム位置
            zoomCtx.spot.target = new THREE.Vector3(0.23, 0, 0);
            zoomIn(delta, camera, zoomCtx.spot.target, zoomCtx.spot.pos, camera.fov, zoomCtx.holdDuration);
            break;

          case zoomStatu.ZOOM_SPOT_HOLD:
            zoomSpotHold(delta);
            nextZoomType = ZoomType.SWEEP;
            break;

          case zoomStatu.ZOOM_RETURN_DEFAULT:
            zoomOut(delta, camera, zoomCtx.holdDuration);
            break;

          default:
            if (shouldTriggerZoom(model)) {
              mode = (nextZoomType === ZoomType.SPOT) // ズームの切り替え
                ? zoomStatu.ZOOM_SPOT_IN
                : zoomStatu.ZOOM_SWEEP_IN;
            }
        }
      }
    }
  }
}

animate();

const zoomCtx = {
  inited: false, 
  t: 0, // ズーム進行度（0:開始, 1:終了）
  fovFrom: 0,
  fovTo: 0,
  targetFrom: new THREE.Vector3(),
  targetTo: new THREE.Vector3(),
  posFrom: new THREE.Vector3(),
  posTo: new THREE.Vector3(),

 zoom: {
  fov: 0,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
 },

 active: {
  fov: 0,
  target: new THREE.Vector3(),
  pos: new THREE.Vector3(),
 },

 spot: {
   fov: 0,
   target: new THREE.Vector3(),
   pos: new THREE.Vector3(),
  },
 
  hold: {
   elapsed: 0 // 経過時間
  },

  holdDuration: 1.6 // 舐める幅（モデルに合わせて調整）

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
function shouldTriggerZoom(model) {
  if (!defaultView.inited) return false;

  const cur = model.quaternion.clone().normalize();
  const deg = THREE.MathUtils.radToDeg(cur.angleTo(defaultView.quat));

  const enter = 20;  // ここを下回ったら発火 数値が大きいほど正面の手前でズームする
  const exit  = 38;  // ここを上回ったら再アーム exit > enter にする

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
function zoomIn(delta, camera, targetTo, PosTo, fovTo, duration) {
  if (!zoomCtx.inited) { // 初回のみ設定
    zoomCtx.inited = true;
    zoomCtx.t = 0;

    // ズーム前（From）
    zoomCtx.fovFrom = camera.fov;
    zoomCtx.targetFrom.copy(cameraTarget);
    zoomCtx.posFrom.copy(camera.position);

    // ズーム後（To）
    zoomCtx.fovTo = fovTo;
    zoomCtx.targetTo.copy(targetTo);
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

  // 注視点を補間して「特定位置を中央に持っていく」
  // cameraTarget.lerpVectors(zoomCtx.targetFrom, zoomCtx.targetTo, tt);
  // camera.lookAt(cameraTarget);

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
function zoomSweepActive(delta, camera, PosTo, duration = 2.5) {
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
    // zoomCtx.targetFrom.copy(cameraTarget);
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
  // cameraTarget.lerpVectors(zoomCtx.targetFrom, defaultView.target, tt);
  // camera.lookAt(cameraTarget);

  // 完了判定
  if (zoomCtx.t >= 1) {
    zoomCtx.inited = false;
    mode = zoomStatu.ZOOM_IDLE;
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

