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

const MODEL_INITIAL_ROT_X = -Math.PI / 2; // 初期向き(-90度上向き)
let modelBase;

loader.load( 
  'shimadasama/3dmodel/shimada-bold-test.glb', // url

  (gltf) => { // onload
    model = gltf.scene;
    model.position.set(0, 0, 0);
    model.rotation.x = MODEL_INITIAL_ROT_X;
    scene.add(model);

    loadTime = performance.now(); // ページ表示からこの処理が動いた時間
    modelBase = setupModelBase(model, camera); // ポジション、カメラ位置のデフォルトセット
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

const env = {
   rotationY: 0.02, 
   rotationZ: 0.02 
  }; 

function animation() {
  renderer.render(scene, camera);
  requestAnimationFrame(animation);

  const delta = clock.getDelta(); // 前回のこの処理からの時間を取得
  const elapsed = (performance.now() - loadTime) * 0.001;

  if (model) {
    if (elapsed < 1) {
      // 1秒正面で停止
    } else {
      // model.rotation.x += 0.02;
      model.rotation.y += env.rotationY;
      model.rotation.z += env.rotationZ;

      if (t < 1) {
        t += delta / 2;
        t = Math.min(t, 1);
  
        model.rotation.x = MODEL_INITIAL_ROT_X * (1 - t); // 正面(0度)に戻す
      }
      
      
    }
  }
}

animation();
