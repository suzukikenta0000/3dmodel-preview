import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.127.0/examples/jsm/loaders/GLTFLoader.js';

const width = 500;
const height = 500;

const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);

// 背景色を黒に設定
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// カメラ設定
const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 1000);
camera.position.set(0, 1, -1);
// camera.lookAt(0, 0, 0);

// // ライトの追加
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(1, 1, 1);
scene.add(light);

// モデルの読み込み
const loader = new GLTFLoader();
let model = null;

loader.load(
  'shimadasama/3dmodel/sample-model.glb', 
    
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

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);

  if (model) {
    model.rotation.y += 0.01;
  }
}

animate();

