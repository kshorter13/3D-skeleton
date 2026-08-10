import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ======================================================================
   LANDMARK DEFINITIONS
   Must match the id/group/name/abbr/desc used by the editor tool that
   produced landmarks.json — only the `id` needs to line up exactly.
====================================================================== */
const REGIONS = {
  pelvis: { label: 'Pelvis', color: 0x3b8ff2 },
  thorax: { label: 'Thorax', color: 0xf2a63b },
  arm:    { label: 'Racquet arm (R)', color: 0xe0435c },
};

const LANDMARKS = [
  { id: 'lasis', abbr: 'LASIS', name: 'Left ASIS', group: 'pelvis',
    desc: 'Left anterior superior iliac spine — the bony point at the front of the left iliac crest.' },
  { id: 'rasis', abbr: 'RASIS', name: 'Right ASIS', group: 'pelvis',
    desc: 'Right anterior superior iliac spine — the bony point at the front of the right iliac crest.' },
  { id: 'lpsis', abbr: 'LPSIS', name: 'Left PSIS', group: 'pelvis',
    desc: 'Left posterior superior iliac spine — palpated as a dimple at the back of the left iliac crest.' },
  { id: 'rpsis', abbr: 'RPSIS', name: 'Right PSIS', group: 'pelvis',
    desc: 'Right posterior superior iliac spine — palpated as a dimple at the back of the right iliac crest.' },

  { id: 'c7', abbr: 'C7', name: 'C7 spinous process', group: 'thorax',
    desc: 'Spinous process of the 7th cervical vertebra — the prominent bony point at the base of the neck.' },
  { id: 't8', abbr: 'T8', name: 'T8 spinous process', group: 'thorax',
    desc: 'Spinous process of the 8th thoracic vertebra, roughly level with the inferior angle of the scapulae.' },
  { id: 'sn', abbr: 'SN', name: 'Sternal notch', group: 'thorax',
    desc: 'Jugular (suprasternal) notch — the palpable dip at the top of the sternum, between the clavicles.' },
  { id: 'xp', abbr: 'XP', name: 'Xiphoid process', group: 'thorax',
    desc: 'The small cartilaginous tip at the inferior end of the sternum.' },
  { id: 'l_acr', abbr: 'L ACR', name: 'Left acromion', group: 'thorax',
    desc: 'Left acromion — the lateral bony point of the scapula forming the tip of the shoulder.' },
  { id: 'r_acr', abbr: 'R ACR', name: 'Right acromion', group: 'thorax',
    desc: 'Right acromion — the lateral bony point of the scapula forming the tip of the shoulder.' },

  { id: 'mid_hum', abbr: 'MID-HUM', name: 'Mid-humerus', group: 'arm',
    desc: 'Midpoint of the humeral shaft, between the acromion and lateral epicondyle — right (racquet) arm.' },
  { id: 'lat_epi', abbr: 'LAT-EPI', name: 'Lateral epicondyle (humerus)', group: 'arm',
    desc: 'Lateral epicondyle of the humerus — the bony prominence on the outside of the elbow.' },
  { id: 'med_epi', abbr: 'MED-EPI', name: 'Medial epicondyle (humerus)', group: 'arm',
    desc: 'Medial epicondyle of the humerus — the bony prominence on the inside of the elbow.' },
  { id: 'mid_fa', abbr: 'MID-FA', name: 'Mid-forearm', group: 'arm',
    desc: 'Midpoint of the forearm, between the elbow and wrist — right (racquet) arm.' },
  { id: 'sty_rad', abbr: 'STY-RAD', name: 'Radial styloid process', group: 'arm',
    desc: 'Styloid process of the radius — the bony point on the thumb side of the wrist.' },
  { id: 'sty_uln', abbr: 'STY-ULN', name: 'Ulnar styloid process', group: 'arm',
    desc: 'Styloid process of the ulna — the bony point on the little-finger side of the wrist.' },
  { id: 'met3', abbr: 'MET3', name: '3rd metacarpal head', group: 'arm',
    desc: 'Head of the 3rd metacarpal — the knuckle at the base of the middle finger.' },
];

const MARKER_RADIUS_CM = 0.7; // ~14mm diameter, matching a real retro-reflective mocap marker

const state = { labelsOn: true, regionOn: { pelvis: true, thorax: true, arm: true } };
const markerObjects = {};

/* ======================================================================
   THREE SETUP
====================================================================== */
const canvasHost = document.getElementById('canvas-host');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12161d);
scene.fog = new THREE.Fog(0x12161d, 260, 620);

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
// Note: no pointer-events:none here — see the matching comment in the
// editor's app.js for why.
canvasHost.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 95, 0);
camera.position.set(60, 120, 230);
controls.update();

scene.add(new THREE.HemisphereLight(0xf5f2ea, 0x1a1d24, 0.9));
const key = new THREE.DirectionalLight(0xfff6e8, 1.4);
key.position.set(120, 220, 150);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9db4ff, 0.5);
fill.position.set(-150, 60, -100);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.35);
rim.position.set(0, 80, -220);
scene.add(rim);

const skeletonRoot = new THREE.Group();
scene.add(skeletonRoot);
const markersGroup = new THREE.Group();
scene.add(markersGroup);

function resize() {
  const w = canvasHost.clientWidth;
  const h = canvasHost.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

let flyTarget = null;
let flyPos = null;
function tickCameraFly() {
  if (flyTarget) {
    controls.target.lerp(flyTarget, 0.12);
    camera.position.lerp(flyPos, 0.12);
    if (controls.target.distanceTo(flyTarget) < 0.05) { flyTarget = null; flyPos = null; }
  }
}

function animate() {
  requestAnimationFrame(animate);
  tickCameraFly();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

/* ======================================================================
   MODEL LOADING
====================================================================== */
const BONE_TINT = 0xe4dcc8;

const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const loadErrorEl = document.getElementById('load-error');

let loadWatchdogA = null;
let loadWatchdogB = null;
function armWatchdogs() {
  loadWatchdogA = setTimeout(() => {
    loadingStatus.textContent = 'Still downloading\u2026 this can take a while on a slower connection (~50MB total).';
  }, 7000);
  loadWatchdogB = setTimeout(() => {
    loadingStatus.innerHTML = `Taking longer than expected. Open your browser's dev tools
      (F12) &rarr; Network tab and reload &mdash; look for any request to
      <code>complete_human_skeleton.obj</code> or the texture files showing 404 or a stalled
      transfer.`;
  }, 25000);
}
function clearWatchdogs() { clearTimeout(loadWatchdogA); clearTimeout(loadWatchdogB); }

function updateLoadingProgress(xhr, stage) {
  if (xhr && xhr.total) {
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loadingStatus.textContent = `Loading ${stage}\u2026 ${pct}%`;
  } else {
    loadingStatus.textContent = `Loading ${stage}\u2026`;
  }
}

function hideLoading() { loadingOverlay.classList.add('hidden'); }

function showLoadError(file, err) {
  loadingOverlay.classList.add('hidden');
  loadErrorEl.classList.add('visible');
  const detail = document.getElementById('load-error-detail');
  if (detail) {
    const status = err && err.target && err.target.status;
    detail.textContent = status
      ? `Failed to load ${file} (HTTP ${status}). Check that this file exists in the repo, in the right folder.`
      : `Failed to load ${file}. Check the browser console (F12) for the exact error.`;
  }
}

function loadModel() {
  armWatchdogs();
  const mtlLoader = new MTLLoader();
  mtlLoader.setPath('./');
  mtlLoader.load(
    'complete_human_skeleton.mtl',
    (materials) => {
      materials.preload();
      Object.keys(materials.materials).forEach((key) => {
        const mat = materials.materials[key];
        if (!mat.map) mat.color = new THREE.Color(BONE_TINT);
        // See matching comment in the editor's app.js: the source .mtl has a
        // malformed "Ke 0.0" emissive line that can parse into NaN and
        // render as solid colour on some GPUs. Force it back to neutral.
        mat.emissive = new THREE.Color(0x000000);
        mat.shininess = 18;
      });

      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.setPath('./');
      objLoader.load(
        'complete_human_skeleton.obj',
        (obj) => {
          clearWatchdogs();
          skeletonRoot.add(obj);
          frameModel(obj);
          hideLoading();
          loadLandmarks();
        },
        (xhr) => updateLoadingProgress(xhr, 'model'),
        (err) => { clearWatchdogs(); showLoadError('complete_human_skeleton.obj', err); }
      );
    },
    (xhr) => updateLoadingProgress(xhr, 'materials'),
    (err) => { clearWatchdogs(); showLoadError('complete_human_skeleton.mtl', err); }
  );
}

function frameModel(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fitDist = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.35;

  controls.target.copy(center);
  camera.position.set(center.x + fitDist * 0.55, center.y + size.y * 0.15, center.z + fitDist * 0.85);
  controls.minDistance = maxDim * 0.15;
  controls.maxDistance = maxDim * 3.2;
  controls.update();
}

/* ======================================================================
   SIDEBAR — read-only marker sheet
====================================================================== */
const sheetEl = document.getElementById('marker-sheet');

function buildSheet() {
  sheetEl.innerHTML = '';
  Object.keys(REGIONS).forEach((groupKey) => {
    const region = REGIONS[groupKey];
    const items = LANDMARKS.filter((l) => l.group === groupKey);

    const header = document.createElement('div');
    header.className = 'region-header';
    header.innerHTML = `
      <span class="region-swatch" style="background:#${region.color.toString(16).padStart(6, '0')}"></span>
      <span>${region.label}</span>
    `;
    sheetEl.appendChild(header);

    items.forEach((lm) => {
      const row = document.createElement('div');
      row.className = 'marker-row';
      row.tabIndex = 0;
      row.dataset.id = lm.id;
      row.innerHTML = `
        <span class="marker-dot" data-dot="${lm.id}" style="background:#${region.color.toString(16).padStart(6, '0')}"></span>
        <span class="marker-text">
          <div class="marker-name">${lm.name}</div>
          <div class="marker-abbr">${lm.abbr}</div>
        </span>
      `;
      row.addEventListener('click', () => onRowClick(lm.id));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(lm.id); }
      });
      sheetEl.appendChild(row);
    });
  });
}

function onRowClick(id) {
  if (!markerObjects[id]) return;
  focusOnMarker(id);
  showInfoCard(id);
}

/* ======================================================================
   MARKERS
====================================================================== */
function placeMarker(id, point) {
  const lm = LANDMARKS.find((l) => l.id === id);
  if (!lm) return;
  const color = REGIONS[lm.group].color;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_RADIUS_CM, 20, 16),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.25, metalness: 0.05 })
  );
  sphere.position.copy(point);
  sphere.userData.landmarkId = id;
  markersGroup.add(sphere);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'marker-label';
  labelDiv.textContent = lm.abbr;
  const labelObj = new CSS2DObject(labelDiv);
  labelObj.position.set(0, MARKER_RADIUS_CM * 2.4, 0);
  sphere.add(labelObj);
  labelObj.visible = state.labelsOn;

  markerObjects[id] = { sphere, labelObj };
  applyRegionVisibility();
}

async function loadLandmarks() {
  try {
    const res = await fetch('./landmarks.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('landmarks.json not found');
    const data = await res.json();
    (data.landmarks || []).forEach((entry) => {
      if (entry.position) placeMarker(entry.id, new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z));
    });
  } catch (err) {
    console.warn('No landmarks.json found next to index.html — showing the skeleton with no markers.', err);
  }
}

/* ======================================================================
   RAYCAST — click a marker on the model to focus + show info
====================================================================== */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let downPos = null;
let downTime = 0;

labelRenderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
  downTime = performance.now();
});

labelRenderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const dx = e.clientX - downPos.x;
  const dy = e.clientY - downPos.y;
  const moved = Math.sqrt(dx * dx + dy * dy);
  const elapsed = performance.now() - downTime;
  downPos = null;
  if (moved > 6 || elapsed > 500) return;

  const rect = canvasHost.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  const hits = raycaster.intersectObjects(markersGroup.children, false);
  if (hits.length) {
    const id = hits[0].object.userData.landmarkId;
    focusOnMarker(id);
    showInfoCard(id);
  }
});

/* ======================================================================
   CAMERA FOCUS + INFO CARD
====================================================================== */
function focusOnMarker(id) {
  const obj = markerObjects[id];
  if (!obj) return;
  const worldPos = new THREE.Vector3();
  obj.sphere.getWorldPosition(worldPos);
  flyTarget = worldPos.clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyPos = worldPos.clone().add(dir.multiplyScalar(28));
}

const infoCard = document.getElementById('info-card');
function showInfoCard(id) {
  const lm = LANDMARKS.find((l) => l.id === id);
  const region = REGIONS[lm.group];
  document.getElementById('info-region').textContent = region.label;
  document.getElementById('info-region').style.color = `#${region.color.toString(16).padStart(6, '0')}`;
  document.getElementById('info-name').textContent = `${lm.name} (${lm.abbr})`;
  document.getElementById('info-desc').textContent = lm.desc;
  infoCard.classList.add('visible');
}
document.getElementById('info-close').addEventListener('click', () => infoCard.classList.remove('visible'));

/* ======================================================================
   LABELS TOGGLE + REGION FILTERS
====================================================================== */
document.getElementById('labels-toggle').addEventListener('change', (e) => {
  state.labelsOn = e.target.checked;
  Object.values(markerObjects).forEach((m) => { m.labelObj.visible = state.labelsOn; });
});

const regionFiltersEl = document.getElementById('region-filters');
function buildRegionFilters() {
  regionFiltersEl.innerHTML = '';
  Object.keys(REGIONS).forEach((key) => {
    const region = REGIONS[key];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span class="region-swatch" style="background:#${region.color.toString(16).padStart(6, '0')}"></span>${region.label}`;
    chip.addEventListener('click', () => {
      state.regionOn[key] = !state.regionOn[key];
      chip.classList.toggle('off', !state.regionOn[key]);
      applyRegionVisibility();
    });
    regionFiltersEl.appendChild(chip);
  });
}

function applyRegionVisibility() {
  LANDMARKS.forEach((lm) => {
    const obj = markerObjects[lm.id];
    if (obj) obj.sphere.visible = state.regionOn[lm.group];
  });
}

/* ======================================================================
   MOBILE SIDEBAR TOGGLE
====================================================================== */
const sidebar = document.getElementById('sidebar');
document.getElementById('sidebar-toggle-mobile').addEventListener('click', () => sidebar.classList.toggle('open'));

/* ======================================================================
   BOOT
====================================================================== */
buildSheet();
buildRegionFilters();
loadModel();
