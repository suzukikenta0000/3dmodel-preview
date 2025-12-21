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
// camera.lookAt(0, 0, 0);

// // ライトの追加
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

loader.load(
  'shimadasama/3dmodel/shimada-EXbold-test.glb', 
    
  (gltf) => {
  model = gltf.scene;
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);
  scene.add(model);
  },

  (event) => {
    console.log('読み込み中...', event.loaded / event.total * 100 + '%');
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

controls.addEventListener('start', () => {
  autoRotate = false;

  if (resumeTimerId !== null) {
    clearTimeout(resumeTimerId);
    resumeTimerId = null;
  }
});

controls.addEventListener('end', () => {

  if (resumeTimerId !== null) clearTimeout(resumeTimerId);

  resumeTimerId = setTimeout(() => {
    autoRotate = true;
    resumeTimerId = null;
  }, RESUME_DELAY);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);

  // モデルの回転
  if (autoRotate && model) {
    model.rotation.x += 0.01;
    model.rotation.y += 0.02;
    model.rotation.z += 0.02;
  }
}

animate();

// interpolation
const interpolationSelect = document.querySelector('#Interpolation');

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
  }

  interpolationSelect.addEventListener('camera-change', (e) => {
    if (e.detail?.source === 'user-interaction') stopAuto();
  });

  startAuto();
