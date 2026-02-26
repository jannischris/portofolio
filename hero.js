import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js";

/** ---------- On-screen debug badge (NO console needed) ---------- */
function ensureBadge() {
  let el = document.getElementById("heroBadge");
  if (!el) {
    el = document.createElement("div");
    el.id = "heroBadge";
    el.style.cssText =
      "position:fixed;left:12px;top:12px;z-index:99999;" +
      "padding:8px 10px;border-radius:12px;" +
      "background:rgba(20,24,34,.92);border:1px solid rgba(255,255,255,.18);" +
      "color:#e7eaf3;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial;" +
      "backdrop-filter:blur(8px)";
    el.textContent = "hero.js: loaded ✅";
    document.body.appendChild(el);
  }
  return el;
}
const badge = ensureBadge();
function setBadge(msg) {
  badge.textContent = msg;
}

const canvas = document.getElementById("heroCanvas");
const loading = document.getElementById("heroLoading");
const loadSub = document.getElementById("heroLoadSub");
const loadErr = document.getElementById("heroLoadErr");

function setSub(msg) {
  if (loadSub) loadSub.textContent = msg;
}
function setErr(msg) {
  if (loadErr) loadErr.textContent = msg;
}
function hideLoading() {
  if (loading) loading.classList.add("hidden");
}
function showLoading() {
  if (loading) loading.classList.remove("hidden");
}

window.addEventListener("error", (e) => {
  setBadge(`hero.js: window.error ❌`);
  setErr(`JS error: ${e.message || "unknown"}`);
});
window.addEventListener("unhandledrejection", (e) => {
  setBadge(`hero.js: promise ❌`);
  setErr(`Promise: ${String(e.reason || "unknown")}`);
});

showLoading();
setErr("");
setSub("hero.js running…");
setBadge("hero.js: DOM ok ✅");

// Must exist
if (!canvas) {
  setBadge("hero.js: NO #heroCanvas ❌");
  setErr("ERROR: #heroCanvas not found in index.html");
  throw new Error("Canvas not found");
}

// Fit to hero container (not whole page)
const heroWrap = canvas.closest(".hero-3d") || document.body;
function getSize() {
  const r = heroWrap.getBoundingClientRect();
  return { w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) };
}

setSub("Init THREE…");
setBadge("hero.js: init THREE…");

// Scene / camera / renderer
const scene = new THREE.Scene();
const { w, h } = getSize();
const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 250);
camera.position.set(0, 2, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(w, h, false);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1.05));
const dir = new THREE.DirectionalLight(0xffffff, 1.15);
dir.position.set(7, 10, 7);
scene.add(dir);

// Resize
function resize() {
  const s = getSize();
  camera.aspect = s.w / s.h;
  camera.updateProjectionMatrix();
  renderer.setSize(s.w, s.h, false);
}
window.addEventListener("resize", resize, { passive: true });

// Mouse tilt
let mx = 0,
  my = 0;
window.addEventListener(
  "mousemove",
  (e) => {
    const s = getSize();
    const x = (e.clientX / s.w) * 2 - 1;
    const y = -(e.clientY / s.h) * 2 + 1;
    mx = x;
    my = y;
  },
  { passive: true }
);

// Render loop (starts immediately, so we know renderer works)
function animate() {
  requestAnimationFrame(animate);

  const targetX = mx * 1.2;
  const targetY = 2 + my * 0.45;

  camera.position.x += (targetX - camera.position.x) * 0.05;
  camera.position.y += (targetY - camera.position.y) * 0.05;
  camera.lookAt(0, 1, 0);

  renderer.render(scene, camera);
}
animate();

// Check file exists (shows 404 on screen)
(async function checkModelFile() {
  try {
    setSub("Checking model file…");
    setBadge("hero.js: checking ./assets/office.glb…");
    const r = await fetch("./assets/office.glb", { method: "HEAD", cache: "no-store" });
    if (!r.ok) {
      setBadge(`hero.js: MODEL 404 (HTTP ${r.status}) ❌`);
      setErr(`Model not found: ./assets/office.glb (HTTP ${r.status})`);
      setSub("Fix the file path / location.");
    } else {
      setBadge("hero.js: model found ✅ loading…");
      setSub("Model file found ✅ Loading GLB…");
    }
  } catch (e) {
    setBadge("hero.js: fetch failed ❌");
    setErr(`Fetch failed: ${String(e?.message || e)}`);
  }
})();

// Load model
setSub("Loading GLB…");
setBadge("hero.js: GLTFLoader…");

const loader = new GLTFLoader();
loader.load(
  "./assets/office.glb",
  (gltf) => {
    const model = gltf.scene;
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    scene.add(model);

    setBadge("hero.js: MODEL LOADED ✅");
    setSub("Model loaded ✅");
    setErr("");
    hideLoading();
  },
  (xhr) => {
    if (xhr.total) {
      const p = Math.round((xhr.loaded / xhr.total) * 100);
      setSub(`Downloading GLB… ${p}%`);
    } else {
      setSub("Downloading GLB…");
    }
  },
  (error) => {
    setBadge("hero.js: GLB LOAD ERROR ❌");
    setErr(`GLTFLoader error: ${error?.message || String(error)}`);
    setSub("Failed to load model.");
  }
);