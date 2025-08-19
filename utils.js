export const System_prompt = `You are a Three.js code-generation assistant.
OUTPUT RULES:
- Output ONLY JavaScript code. No backticks, no markdown, no commentary.
- Export a default function:
  export default function renderScene({ THREE, scene, camera, renderer, controls, OrbitControls }) { ... }
- THREE, scene, camera, renderer, controls, and OrbitControls are already available as parameters.
- OrbitControls is passed as a separate parameter, not as THREE.OrbitControls.
- Clear previous objects at the start (dispose geometries/materials where relevant).
- Add basic lighting and frame the subject for visibility.
- Use primitives or programmatic geometry; no network fetches.
- If you need OrbitControls, use: new OrbitControls(camera, renderer.domElement)
- Keep it concise and readable; add minimal comments.
- Keep triangle count modest unless asked otherwise.
- Do not create duplicate lights if they already exist in the scene.`;

export const FRAME_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>html,body{margin:0;height:100%;overflow:hidden;background:#f8f9fa}</style>
</head>
<body>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@latest/build/three.module.js","three/":"https://unpkg.com/three@latest/"}}</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@latest/examples/jsm/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.setClearColor(0xf8f9fa);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
camera.position.set(8, 8, 8);
controls.target.set(0, 0, 0);
controls.saveState();

const light = new THREE.DirectionalLight(0xffffff, 0.8);
light.position.set(10, 10, 5);
light.castShadow = true;
light.shadow.mapSize.setScalar(2048);
scene.add(new THREE.AmbientLight(0x404040, 0.4), light, new THREE.GridHelper(20, 20, 0x888888, 0xcccccc));

let autoRotate = false, wireframe = false;
const [ambient, directional, grid] = scene.children;

(function animate() {
  requestAnimationFrame(animate);
  if (autoRotate) scene.rotation.y += 0.01;
  controls.update();
  renderer.render(scene, camera);
})();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clearScene = () => {
  const toRemove = [];
  scene.traverse(child => ![ambient, directional, grid].includes(child) && toRemove.push(child));
  toRemove.forEach(obj => {
    scene.remove(obj);
    obj.geometry?.dispose();
    [obj.material].flat().filter(Boolean).forEach(m => m.dispose());
  });
};

addEventListener('message', async e => {
  const { type, code, value } = e.data;
  if (type === 'RUN_CODE') {
    try {
      clearScene();
      if (code?.trim()) {
        const url = URL.createObjectURL(new Blob([\`import * as THREE from "three";import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";\${code}\`], { type: 'text/javascript' }));
        try {
          const module = await import(url);
          if (typeof module.default !== 'function') throw new Error('Module does not export a default function');
          await module.default({ THREE, scene, camera, renderer, controls, OrbitControls });
          controls.reset();
        } finally { URL.revokeObjectURL(url); }
      }
      parent.postMessage({ type: 'DONE' }, '*');
    } catch (error) { parent.postMessage({ type: 'ERROR', message: error.message }, '*'); }
  } else if (type === 'GET_SCREENSHOT') {
    try {
      renderer.render(scene, camera);
      parent.postMessage({ type: 'SCREENSHOT', dataUrl: renderer.domElement.toDataURL('image/png', 0.9) }, '*');
    } catch (error) { parent.postMessage({ type: 'ERROR', message: 'Screenshot failed: ' + error.message }, '*'); }
  } else if (type === 'RESET_CAMERA') controls.reset();
  else if (type === 'TOGGLE_AUTO_ROTATE') autoRotate = value;
  else if (type === 'TOGGLE_WIREFRAME') {
    wireframe = value;
    scene.traverse(child => child.material && child !== grid && [child.material].flat().forEach(m => m.wireframe = wireframe));
  }
});

parent.postMessage({ type: 'READY' }, '*');
</script>
</body>
</html>`;