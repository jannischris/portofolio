import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const MODEL_URL = "./assets/office.glb";

// Elements
const canvas = document.getElementById("heroCanvas");
const loadingEl = document.getElementById("heroLoading");
const fallbackEl = document.getElementById("heroFallback");
const subEl = document.getElementById("heroLoadSub");
const errEl = document.getElementById("heroLoadErr");
const hotspotResearch = document.getElementById("hotspotResearch");
const hotspotAbout = document.getElementById("hotspotAbout");

const setSub = (t) => { if (subEl) subEl.textContent = t || ""; };
const setErr = (t) => { if (errEl) errEl.textContent = t || ""; };

function currentSection() {
  const raw = location.hash.replace("#", "");
  const params = new URLSearchParams(raw);
  return params.get("s") || "home";
}
function isHomeRoute() {
  return currentSection() === "home";
}

if (!canvas) {
  console.warn("heroCanvas not found — hero.js will not run.");
} else {
  // Respect reduced motion (nice for performance & accessibility)
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  // Renderer / Scene / Camera
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 5000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(6, 10, 6);
  scene.add(key);

  // State
  let modelRoot = null;
  let modelSize = null;

  let deskLocal = new THREE.Vector3(0, 0, 0);
  let aboutLocal = new THREE.Vector3(0, 0, 0);

  let homeCamPos = null;
  let homeCamQuat = null;

  let running = false;
  let rafId = null;

  // Zoom animation
  let isZooming = false;
  let zoomT0 = 0;
  const zoomDuration = 900;

  const zoomFromPos = new THREE.Vector3();
  const zoomToPos = new THREE.Vector3();
  const zoomFromLook = new THREE.Vector3();
  const zoomToLook = new THREE.Vector3();
  const tmpLookDir = new THREE.Vector3();

  // Mouse tilt
  let targetRX = 0, targetRY = 0;
  if (!reduceMotion) {
    window.addEventListener(
      "mousemove",
      (e) => {
        if (!isHomeRoute()) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        targetRY = x * 0.14;
        targetRX = -y * 0.10;
      },
      { passive: true }
    );
  }

  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.floor(r.width));
    const h = Math.max(2, Math.floor(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fitCameraToObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    modelSize = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    obj.position.sub(center);

    const box2 = new THREE.Box3().setFromObject(obj);
    modelSize = box2.getSize(new THREE.Vector3());

    const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
    const fov = camera.fov * (Math.PI / 180);
    const camZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 0.95;

    camera.position.set(0, maxDim * 0.12, camZ);
    camera.near = Math.max(0.01, maxDim / 200);
    camera.far = Math.max(50, maxDim * 120);
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);

    deskLocal = new THREE.Vector3(0, modelSize.y * 0.40, -modelSize.z * 0.18);
    aboutLocal = new THREE.Vector3(-modelSize.x * 0.34, modelSize.y * 0.33, -modelSize.z * 0.10);

    homeCamPos = camera.position.clone();
    homeCamQuat = camera.quaternion.clone();
  }

  function resetHomeCamera() {
    if (!homeCamPos || !homeCamQuat) return;
    isZooming = false;
    camera.position.copy(homeCamPos);
    camera.quaternion.copy(homeCamQuat);
    camera.updateProjectionMatrix();
    targetRX = 0;
    targetRY = 0;
  }

  function worldPointFromLocal(localPoint) {
    if (!modelRoot) return new THREE.Vector3();
    const p = localPoint.clone();
    modelRoot.localToWorld(p);
    return p;
  }

  function placeHotspot(btn, localPoint, disableWhenZooming = false) {
    if (!btn || !modelRoot) return;

    if (!isHomeRoute()) {
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
      return;
    }

    if (disableWhenZooming && isZooming) {
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
      return;
    }

    const pWorld = worldPointFromLocal(localPoint);
    const ndc = pWorld.clone().project(camera);

    if (ndc.z < -1 || ndc.z > 1) {
      btn.style.opacity = "0";
      btn.style.pointerEvents = "none";
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = (ndc.x * 0.5 + 0.5) * rect.width;
    const y = (-ndc.y * 0.5 + 0.5) * rect.height;

    btn.style.left = rect.left + "px";
    btn.style.top = rect.top + "px";
    btn.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

    btn.style.opacity = "1";
    btn.style.pointerEvents = "auto";
  }

  function startZoomToTarget(localPoint, section) {
    if (!modelRoot || isZooming) return;

    const pWorld = worldPointFromLocal(localPoint);
    zoomFromPos.copy(camera.position);

    const dir = camera.position.clone().sub(pWorld);
    const curDist = dir.length();
    const desiredDist = Math.max(0.5, curDist * 0.38);
    dir.normalize().multiplyScalar(desiredDist);
    zoomToPos.copy(pWorld.clone().add(dir));

    camera.getWorldDirection(tmpLookDir);
    zoomFromLook.copy(camera.position.clone().add(tmpLookDir.multiplyScalar(2)));
    zoomToLook.copy(pWorld);

    isZooming = true;
    zoomT0 = performance.now();

    setTimeout(() => {
      // Keep routing responsibility in app.js, but hash is still ok
      location.hash = `#s=${section}`;
      setTimeout(() => {
        const el = document.getElementById(section);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }, zoomDuration + 50);
  }

  hotspotResearch?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startZoomToTarget(deskLocal, "research");
  });

  hotspotAbout?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startZoomToTarget(aboutLocal, "about");
  });

  function stopLoop() {
    running = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function startLoop() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(animate);
  }

  function onRouteChange() {
    if (isHomeRoute()) {
      resize();
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      resetHomeCamera();
      // Only render loop on Home (or while zooming)
      startLoop();
    } else {
      // Stop continuous rendering when not on Home
      stopLoop();
      // Still hide hotspots
      placeHotspot(hotspotResearch, deskLocal, true);
      placeHotspot(hotspotAbout, aboutLocal, true);
    }
  }

  window.addEventListener("hashchange", onRouteChange);
  window.addEventListener("resize", () => {
    // cheap resize, will apply on next frame
    if (isHomeRoute()) startLoop();
  }, { passive: true });

  // Load model
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  loader.setDRACOLoader(draco);

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath("https://unpkg.com/three@0.161.0/examples/jsm/libs/basis/");
  ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  // Start UI state
  setSub("Loading model…");
  setErr("");

  // Keep fallback visible behind canvas until model is ready
  if (loadingEl) loadingEl.classList.remove("hidden");

  loader.load(
    MODEL_URL,
    (gltf) => {
      modelRoot = gltf.scene;
      scene.add(modelRoot);

      modelRoot.rotation.y = -0.25;

      fitCameraToObject(modelRoot);

      // Hide loading overlay + fade out fallback
      if (loadingEl) loadingEl.classList.add("hidden");
      if (fallbackEl) fallbackEl.classList.add("hidden");

      // Start/stop loop depending on route
      onRouteChange();
    },
    (xhr) => {
      if (xhr?.total) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        setSub(`Downloading… ${pct}%`);
      } else {
        setSub("Downloading…");
      }
    },
    (err) => {
      console.error("GLB load error:", err);
      setSub("Failed");
      setErr(String(err?.message || err || "Unknown error"));
      // Keep fallback visible if 3D fails
      stopLoop();
    }
  );

  function animate() {
    rafId = null;

    resize();

    if (isHomeRoute()) {
      if (isZooming) {
        const t = (performance.now() - zoomT0) / zoomDuration;
        const k = easeInOut(Math.max(0, Math.min(1, t)));

        camera.position.copy(zoomFromPos.clone().lerp(zoomToPos, k));
        const look = zoomFromLook.clone().lerp(zoomToLook, k);
        camera.lookAt(look);

        if (t >= 1) isZooming = false;
      } else if (!reduceMotion) {
        camera.rotation.x += (targetRX - camera.rotation.x) * 0.06;
        camera.rotation.y += (targetRY - camera.rotation.y) * 0.06;

        if (modelRoot) modelRoot.rotation.y += 0.00045;
      }

      placeHotspot(hotspotResearch, deskLocal, true);
      placeHotspot(hotspotAbout, aboutLocal, true);

      renderer.render(scene, camera);

      // Continue only while on Home
      if (running) rafId = requestAnimationFrame(animate);
    } else {
      stopLoop();
    }
  }

  // Initial route sync
  onRouteChange();
}