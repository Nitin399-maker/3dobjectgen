export const System_prompt =`You are a Three.js code-generation assistant.
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

export const FRAME_TEMPLATE =  `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>html,body{margin:0;height:100%;overflow:hidden;background:#f8f9fa}</style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@latest/build/three.module.js",
    "three/": "https://unpkg.com/three@latest/"
  }
}
</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@latest/examples/jsm/controls/OrbitControls.js";

window.THREE = THREE;
window.OrbitControls = OrbitControls;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0xf8f9fa);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
scene.add(gridHelper);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function clearScene() {
  const objectsToRemove = [];
  scene.traverse((child) => {
    if (child !== ambientLight && child !== directionalLight && child !== gridHelper) {
      objectsToRemove.push(child);
    }
  });
  objectsToRemove.forEach((obj) => {
    scene.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

window.addEventListener('message', async (e) => {
  if (e.data.type === 'RUN_CODE') {
    try {
      clearScene();
      if (e.data.code && e.data.code.trim()) {
        console.log('Executing code:', e.data.code);
        
        // Create module with import map support
        const moduleCode = \`
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

\${e.data.code}
\`;
        
        const blob = new Blob([moduleCode], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        
        try {
          const module = await import(url);
          if (typeof module.default === 'function') {
            await module.default({ THREE, scene, camera, renderer, controls, OrbitControls });
          } else {
            throw new Error('Module does not export a default function');
          }
        } catch (moduleError) {
          console.error('Module execution error:', moduleError);
          throw moduleError;
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      parent.postMessage({ type: 'DONE' }, '*');
    } catch (error) {
      console.error('Code execution error:', error);
      parent.postMessage({ type: 'ERROR', message: error.message }, '*');
    }
  } else if (e.data.type === 'GET_SCREENSHOT') {
    try {
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png', 0.9);
      parent.postMessage({ type: 'SCREENSHOT', dataUrl }, '*');
    } catch (error) {
      parent.postMessage({ type: 'ERROR', message: 'Screenshot failed: ' + error.message }, '*');
    }
  }
});

parent.postMessage({ type: 'READY' }, '*');
</script>
</body>
</html>`;