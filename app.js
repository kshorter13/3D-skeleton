import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* ======================================================================
   DEFAULT LANDMARK SET (SPH20011 starter set)
   This is only the *starting point* — everything here is fully editable
   from the "Manage landmark set" panel in Instructor edit mode. Colours
   are stored as CSS hex strings throughout.
====================================================================== */
const DEFAULT_REGIONS = {
  pelvis: { label: 'Pelvis', color: '#3b8ff2' },
  thorax: { label: 'Thorax', color: '#f2a63b' },
  arm:    { label: 'Racquet arm (R)', color: '#e0435c' },
};

const DEFAULT_LANDMARKS = [
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
const DRAFT_KEY = 'sph20011LandmarkEditorDraft.v1';

// Mutable — edited live by the "Manage landmark set" panel. Kept as the
// same object/array references throughout (mutated in place) so every
// function that closes over REGIONS/LANDMARKS keeps working without needing
// to be re-wired on every change.
const REGIONS = {};
const LANDMARKS = [];
seedDefaults();

function seedDefaults() {
  Object.keys(REGIONS).forEach((k) => delete REGIONS[k]);
  Object.assign(REGIONS, JSON.parse(JSON.stringify(DEFAULT_REGIONS)));
  LANDMARKS.length = 0;
  LANDMARKS.push(...JSON.parse(JSON.stringify(DEFAULT_LANDMARKS)));
}

function slugify(str) {
  const base = String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base || 'item';
}

function uniqueId(base, existingIds) {
  let id = base;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

function autoAbbr(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 6).toUpperCase();
}

/* ======================================================================
   STATE
====================================================================== */
const state = {
  mode: 'view',           // 'view' | 'edit'
  armedId: null,
  labelsOn: true,
  regionOn: {},            // populated from REGIONS keys
  placed: {},              // id -> {x,y,z}
};

const markerObjects = {}; // id -> { sphere, labelObj }

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
labelRenderer.domElement.style.touchAction = 'none';
labelRenderer.domElement.tabIndex = 0;
labelRenderer.domElement.style.outline = 'none';
['pointerdown', 'wheel', 'mouseenter'].forEach((evt) => {
  labelRenderer.domElement.addEventListener(evt, () => {
    labelRenderer.domElement.focus({ preventScroll: true });
  }, { passive: true });
});
canvasHost.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// Note: zoomSpeed left at the Three.js default (1). A lower value here
// previously made zoom feel painfully slow on Mac trackpads in Safari —
// Safari delivers many more, finer-grained wheel events per gesture than
// Chrome does, so a reduced per-event step compounds into very sluggish
// zooming there specifically.
controls.minDistance = 30;
controls.maxDistance = 500;
controls.target.set(0, 95, 0);
camera.position.set(60, 120, 230);
// Note: deliberately no forced render-on-wheel here. An earlier version
// force-rendered on every wheel event as a workaround for Chrome throttling
// requestAnimationFrame in unfocused cross-origin iframes — but that means
// doubling the render workload during active scrolling (once from this
// listener, once from the normal rAF loop), which is heavy enough to
// visibly stutter on Safari's WebGL pipeline. The tabIndex/focus() grab
// below is the real, lighter-weight fix for the iframe-throttling case.
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
    if (controls.target.distanceTo(flyTarget) < 0.05) {
      flyTarget = null;
      flyPos = null;
    }
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
      transfer. That usually means a file didn't upload correctly.`;
  }, 25000);
}

function clearWatchdogs() {
  clearTimeout(loadWatchdogA);
  clearTimeout(loadWatchdogB);
}

function loadModel() {
  armWatchdogs();
  const mtlLoader = new MTLLoader();
  mtlLoader.setPath('./');
  mtlLoader.load(
    'complete_human_skeleton.mtl',
    (materials) => {
      materials.preload();
      Object.keys(materials.materials).forEach((k) => {
        const mat = materials.materials[k];
        if (!mat.map) mat.color = new THREE.Color(BONE_TINT);
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
          bootLandmarkData();
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
   LOADING / ERROR UI
====================================================================== */
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStatus = document.getElementById('loading-status');
const loadErrorEl = document.getElementById('load-error');

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

/* ======================================================================
   SIDEBAR — marker sheet
====================================================================== */
const sheetEl = document.getElementById('marker-sheet');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

function ensureRegionOnDefaults() {
  Object.keys(REGIONS).forEach((k) => {
    if (!(k in state.regionOn)) state.regionOn[k] = true;
  });
  Object.keys(state.regionOn).forEach((k) => {
    if (!(k in REGIONS)) delete state.regionOn[k];
  });
}

function buildSheet() {
  ensureRegionOnDefaults();
  sheetEl.innerHTML = '';
  Object.keys(REGIONS).forEach((groupKey) => {
    const region = REGIONS[groupKey];
    const items = LANDMARKS.filter((l) => l.group === groupKey);
    if (!items.length) return;

    const header = document.createElement('div');
    header.className = 'region-header';
    header.innerHTML = `
      <span class="region-swatch" style="background:${region.color}"></span>
      <span>${region.label}</span>
      <span class="region-count" data-region-count="${groupKey}">0/${items.length}</span>
    `;
    sheetEl.appendChild(header);

    items.forEach((lm) => {
      const row = document.createElement('div');
      row.className = 'marker-row';
      row.tabIndex = 0;
      row.dataset.id = lm.id;
      row.innerHTML = `
        <span class="marker-dot" data-dot="${lm.id}"></span>
        <span class="marker-text">
          <div class="marker-name">${lm.name}</div>
          <div class="marker-abbr">${lm.abbr}</div>
        </span>
        <button class="marker-clear" data-clear="${lm.id}" title="Clear marker" aria-label="Clear ${lm.name}">\u2715</button>
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.marker-clear')) return;
        onRowClick(lm.id);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(lm.id); }
      });
      sheetEl.appendChild(row);
    });
  });

  sheetEl.querySelectorAll('.marker-clear').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearMarker(btn.dataset.clear);
    });
  });

  updateProgress();
}

function onRowClick(id) {
  if (state.mode === 'edit') {
    armLandmark(id);
  } else if (state.placed[id]) {
    focusOnMarker(id);
    showInfoCard(id);
  }
}

function updateProgress() {
  const total = LANDMARKS.length;
  const done = Object.keys(state.placed).filter((id) => LANDMARKS.some((l) => l.id === id)).length;
  progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';
  progressText.textContent = `${done} / ${total} placed`;

  Object.keys(REGIONS).forEach((groupKey) => {
    const items = LANDMARKS.filter((l) => l.group === groupKey);
    const doneInGroup = items.filter((l) => state.placed[l.id]).length;
    const el = sheetEl.querySelector(`[data-region-count="${groupKey}"]`);
    if (el) el.textContent = `${doneInGroup}/${items.length}`;
  });
}

function refreshRowVisual(id) {
  const dot = sheetEl.querySelector(`[data-dot="${id}"]`);
  const row = sheetEl.querySelector(`.marker-row[data-id="${id}"]`);
  if (!dot || !row) return;
  const lm = LANDMARKS.find((l) => l.id === id);
  const isPlaced = !!state.placed[id];
  dot.classList.toggle('placed', isPlaced);
  dot.style.background = isPlaced && lm ? REGIONS[lm.group].color : 'transparent';
  row.classList.toggle('armed', state.armedId === id);
}

/* ======================================================================
   ARM / PLACE / CLEAR
====================================================================== */
const armedBanner = document.getElementById('armed-banner');
const armedBannerText = document.getElementById('armed-banner-text');

function armLandmark(id) {
  state.armedId = id;
  const lm = LANDMARKS.find((l) => l.id === id);
  if (!lm) return;
  armedBannerText.innerHTML = `Click the model to place <b>${lm.abbr}</b> \u2014 ${lm.name}`;
  armedBanner.classList.add('visible');
  LANDMARKS.forEach((l) => refreshRowVisual(l.id));
}

function disarm() {
  state.armedId = null;
  armedBanner.classList.remove('visible');
  LANDMARKS.forEach((l) => refreshRowVisual(l.id));
}
document.getElementById('armed-cancel').addEventListener('click', disarm);

function placeMarker(id, point) {
  const lm = LANDMARKS.find((l) => l.id === id);
  if (!lm) return;
  const color = REGIONS[lm.group] ? REGIONS[lm.group].color : '#ffffff';

  removeMarkerObject(id);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(MARKER_RADIUS_CM, 20, 16),
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      metalness: 0.05,
    })
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
  state.placed[id] = { x: point.x, y: point.y, z: point.z };

  applyRegionVisibility();
  refreshRowVisual(id);
  updateProgress();
  saveDraft();
}

function removeMarkerObject(id) {
  const existing = markerObjects[id];
  if (existing) {
    markersGroup.remove(existing.sphere);
    existing.sphere.geometry.dispose();
    existing.sphere.material.dispose();
    delete markerObjects[id];
  }
}

function clearMarker(id) {
  removeMarkerObject(id);
  delete state.placed[id];
  refreshRowVisual(id);
  updateProgress();
  hideInfoCard();
  saveDraft();
}

document.getElementById('reset-btn').addEventListener('click', () => {
  if (!confirm('Clear all placed markers (keeps your landmark names/regions)? This cannot be undone.')) return;
  LANDMARKS.forEach((l) => clearMarker(l.id));
});

/* Update a placed marker's colour/label without moving it — used when the
   landmark manager changes a region's colour or a landmark's abbreviation. */
function refreshMarkerAppearance(id) {
  const obj = markerObjects[id];
  const lm = LANDMARKS.find((l) => l.id === id);
  if (!obj || !lm) return;
  const color = REGIONS[lm.group] ? REGIONS[lm.group].color : '#ffffff';
  obj.sphere.material.color = new THREE.Color(color);
  obj.labelObj.element.textContent = lm.abbr;
}

/* ======================================================================
   POINTER / RAYCASTING
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
  handleClick(e);
});

function handleClick(e) {
  const rect = canvasHost.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  if (state.mode === 'edit' && state.armedId) {
    const hits = raycaster.intersectObjects(skeletonRoot.children, true);
    if (hits.length) {
      placeMarker(state.armedId, hits[0].point);
      advanceToNextUnplaced();
    }
    return;
  }

  const markerHits = raycaster.intersectObjects(markersGroup.children, false);
  if (markerHits.length) {
    const id = markerHits[0].object.userData.landmarkId;
    if (state.mode === 'edit') {
      armLandmark(id);
    } else {
      focusOnMarker(id);
      showInfoCard(id);
    }
  }
}

function advanceToNextUnplaced() {
  const next = LANDMARKS.find((l) => !state.placed[l.id]);
  if (next) armLandmark(next.id);
  else disarm();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { disarm(); closeManageModal(); }
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
  if (!lm) return;
  const region = REGIONS[lm.group] || { label: '', color: '#ffffff' };
  const p = state.placed[id];
  document.getElementById('info-region').textContent = region.label;
  document.getElementById('info-region').style.color = region.color;
  document.getElementById('info-name').textContent = `${lm.name} (${lm.abbr})`;
  document.getElementById('info-desc').textContent = lm.desc || '';
  document.getElementById('info-coords').textContent = p
    ? `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)} cm`
    : '';
  infoCard.classList.add('visible');
}
function hideInfoCard() { infoCard.classList.remove('visible'); }
document.getElementById('info-close').addEventListener('click', hideInfoCard);

/* ======================================================================
   MODE SWITCH
====================================================================== */
const btnView = document.getElementById('mode-view');
const btnEdit = document.getElementById('mode-edit');
const editOnlyEls = document.querySelectorAll('[data-edit-only]');

function setMode(mode) {
  state.mode = mode;
  btnView.classList.toggle('active', mode === 'view');
  btnEdit.classList.toggle('active', mode === 'edit');
  editOnlyEls.forEach((el) => { el.style.display = mode === 'edit' ? '' : 'none'; });
  disarm();
  hideInfoCard();
}
// Deterrent only, not real security: this all runs client-side, so anyone
// reading the page source can see or bypass this passcode. It exists to stop
// students from casually wandering into edit mode, not to protect anything —
// nothing they do here writes back to GitHub or changes what other students see.
const ADMIN_PASSCODE = 'sph20011'; // change this to whatever you like
let editUnlocked = false;

btnView.addEventListener('click', () => setMode('view'));
btnEdit.addEventListener('click', () => {
  if (!editUnlocked) {
    const attempt = window.prompt('Enter the instructor passcode to enable edit mode:');
    if (attempt === null) return;
    if (attempt !== ADMIN_PASSCODE) { alert('Incorrect passcode.'); return; }
    editUnlocked = true;
  }
  setMode('edit');
});

/* ======================================================================
   LABELS TOGGLE + REGION FILTERS
====================================================================== */
const labelsToggle = document.getElementById('labels-toggle');
labelsToggle.addEventListener('change', () => {
  state.labelsOn = labelsToggle.checked;
  Object.values(markerObjects).forEach((m) => { m.labelObj.visible = state.labelsOn; });
});

const regionFiltersEl = document.getElementById('region-filters');
function buildRegionFilters() {
  ensureRegionOnDefaults();
  regionFiltersEl.innerHTML = '';
  Object.keys(REGIONS).forEach((k) => {
    const region = REGIONS[k];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.region = k;
    if (!state.regionOn[k]) chip.classList.add('off');
    chip.innerHTML = `<span class="region-swatch" style="background:${region.color}"></span>${region.label}`;
    chip.addEventListener('click', () => {
      state.regionOn[k] = !state.regionOn[k];
      chip.classList.toggle('off', !state.regionOn[k]);
      applyRegionVisibility();
    });
    regionFiltersEl.appendChild(chip);
  });
}

function applyRegionVisibility() {
  LANDMARKS.forEach((lm) => {
    const obj = markerObjects[lm.id];
    if (obj) obj.sphere.visible = !!state.regionOn[lm.group];
  });
}

/* ======================================================================
   MANAGE LANDMARK SET (regions + landmarks editor)
====================================================================== */
const manageModal = document.getElementById('manage-modal');
const regionsListEl = document.getElementById('regions-list');
const landmarksListEl = document.getElementById('landmarks-list');
const newLandmarkRegionSelect = document.getElementById('new-landmark-region');

document.getElementById('manage-btn').addEventListener('click', openManageModal);
document.getElementById('manage-close').addEventListener('click', closeManageModal);
document.getElementById('manage-done').addEventListener('click', closeManageModal);
manageModal.addEventListener('click', (e) => { if (e.target === manageModal) closeManageModal(); });

function openManageModal() {
  renderRegionsManager();
  renderLandmarksManager();
  manageModal.classList.add('visible');
}
function closeManageModal() {
  manageModal.classList.remove('visible');
  buildSheet();
  buildRegionFilters();
  applyRegionVisibility();
  saveDraft();
}

function regionInUse(key) {
  return LANDMARKS.some((l) => l.group === key);
}

function renderRegionsManager() {
  regionsListEl.innerHTML = '';
  Object.keys(REGIONS).forEach((key) => {
    const region = REGIONS[key];
    const row = document.createElement('div');
    row.className = 'manager-row';
    row.innerHTML = `
      <input type="color" class="color-input" value="${region.color}" data-region-color="${key}" aria-label="Colour for ${region.label}">
      <input type="text" class="text-input" value="${region.label}" data-region-label="${key}" placeholder="Region name">
      <button class="row-delete" data-region-delete="${key}" title="Delete region" aria-label="Delete ${region.label}">\u2715</button>
    `;
    regionsListEl.appendChild(row);
  });

  regionsListEl.querySelectorAll('[data-region-color]').forEach((input) => {
    input.addEventListener('input', () => {
      const k = input.dataset.regionColor;
      REGIONS[k].color = input.value;
      LANDMARKS.filter((l) => l.group === k).forEach((l) => refreshMarkerAppearance(l.id));
      refreshRegionSelectOptions();
    });
  });
  regionsListEl.querySelectorAll('[data-region-label]').forEach((input) => {
    input.addEventListener('input', () => {
      REGIONS[input.dataset.regionLabel].label = input.value || 'Untitled region';
      refreshRegionSelectOptions();
    });
  });
  regionsListEl.querySelectorAll('[data-region-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.regionDelete;
      if (Object.keys(REGIONS).length <= 1) { alert('You need at least one region.'); return; }
      if (regionInUse(k)) { alert('Move or delete the landmarks using this region first.'); return; }
      delete REGIONS[k];
      renderRegionsManager();
      refreshRegionSelectOptions();
    });
  });

  refreshRegionSelectOptions();
}

function refreshRegionSelectOptions() {
  const keys = Object.keys(REGIONS);
  newLandmarkRegionSelect.innerHTML = keys.map((k) => `<option value="${k}">${REGIONS[k].label}</option>`).join('');
  landmarksListEl.querySelectorAll('select[data-landmark-group]').forEach((sel) => {
    const currentId = sel.dataset.landmarkGroup;
    const lm = LANDMARKS.find((l) => l.id === currentId);
    sel.innerHTML = keys.map((k) => `<option value="${k}" ${lm && lm.group === k ? 'selected' : ''}>${REGIONS[k].label}</option>`).join('');
  });
}

document.getElementById('add-region-btn').addEventListener('click', () => {
  const labelInput = document.getElementById('new-region-label');
  const colorInput = document.getElementById('new-region-color');
  const label = labelInput.value.trim();
  if (!label) { labelInput.focus(); return; }
  const key = uniqueId(slugify(label), Object.keys(REGIONS));
  REGIONS[key] = { label, color: colorInput.value };
  labelInput.value = '';
  colorInput.value = '#7c9dfa';
  renderRegionsManager();
});

function renderLandmarksManager() {
  landmarksListEl.innerHTML = '';
  LANDMARKS.forEach((lm) => {
    const row = document.createElement('div');
    row.className = 'manager-row manager-row-landmark';
    row.innerHTML = `
      <input type="text" class="text-input" value="${lm.name}" data-landmark-name="${lm.id}" placeholder="Name">
      <input type="text" class="text-input abbr" value="${lm.abbr}" data-landmark-abbr="${lm.id}" placeholder="Abbr">
      <select class="text-input" data-landmark-group="${lm.id}"></select>
      <input type="text" class="text-input desc" value="${lm.desc || ''}" data-landmark-desc="${lm.id}" placeholder="Description (optional)">
      <button class="row-delete" data-landmark-delete="${lm.id}" title="Delete landmark" aria-label="Delete ${lm.name}">\u2715</button>
    `;
    landmarksListEl.appendChild(row);
  });

  landmarksListEl.querySelectorAll('[data-landmark-name]').forEach((input) => {
    input.addEventListener('input', () => {
      const lm = LANDMARKS.find((l) => l.id === input.dataset.landmarkName);
      if (lm) lm.name = input.value;
    });
  });
  landmarksListEl.querySelectorAll('[data-landmark-abbr]').forEach((input) => {
    input.addEventListener('input', () => {
      const lm = LANDMARKS.find((l) => l.id === input.dataset.landmarkAbbr);
      if (lm) { lm.abbr = input.value; refreshMarkerAppearance(lm.id); }
    });
  });
  landmarksListEl.querySelectorAll('[data-landmark-desc]').forEach((input) => {
    input.addEventListener('input', () => {
      const lm = LANDMARKS.find((l) => l.id === input.dataset.landmarkDesc);
      if (lm) lm.desc = input.value;
    });
  });
  landmarksListEl.querySelectorAll('[data-landmark-group]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const lm = LANDMARKS.find((l) => l.id === sel.dataset.landmarkGroup);
      if (lm) { lm.group = sel.value; refreshMarkerAppearance(lm.id); }
    });
  });
  landmarksListEl.querySelectorAll('[data-landmark-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.landmarkDelete;
      clearMarker(id);
      const idx = LANDMARKS.findIndex((l) => l.id === id);
      if (idx !== -1) LANDMARKS.splice(idx, 1);
      renderLandmarksManager();
    });
  });

  refreshRegionSelectOptions();
}

document.getElementById('add-landmark-btn').addEventListener('click', () => {
  const nameInput = document.getElementById('new-landmark-name');
  const abbrInput = document.getElementById('new-landmark-abbr');
  const descInput = document.getElementById('new-landmark-desc');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  if (!Object.keys(REGIONS).length) { alert('Add a region first.'); return; }
  const id = uniqueId(slugify(name), LANDMARKS.map((l) => l.id));
  const abbr = abbrInput.value.trim() || autoAbbr(name);
  LANDMARKS.push({
    id,
    name,
    abbr,
    group: newLandmarkRegionSelect.value,
    desc: descInput.value.trim(),
  });
  nameInput.value = '';
  abbrInput.value = '';
  descInput.value = '';
  renderLandmarksManager();
  nameInput.focus();
});

document.getElementById('reset-defaults-btn').addEventListener('click', () => {
  if (!confirm('Replace the entire landmark set with the SPH20011 starter set (17 points)? This clears all placed markers and any custom landmarks/regions.')) return;
  LANDMARKS.forEach((l) => removeMarkerObject(l.id));
  state.placed = {};
  seedDefaults();
  state.regionOn = {};
  renderRegionsManager();
  renderLandmarksManager();
});

/* ======================================================================
   EXPORT / IMPORT
====================================================================== */
document.getElementById('export-btn').addEventListener('click', () => {
  const payload = buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'landmarks.json';
  a.click();
  URL.revokeObjectURL(url);
});

function buildExportPayload() {
  return {
    generatedAt: new Date().toISOString(),
    units: 'cm',
    regions: REGIONS,
    landmarks: LANDMARKS.map((lm) => ({
      id: lm.id,
      name: lm.name,
      abbr: lm.abbr,
      group: lm.group,
      desc: lm.desc || '',
      position: state.placed[lm.id] || null,
    })),
  };
}

const fileInput = document.getElementById('file-input');
document.getElementById('import-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyLandmarkData(JSON.parse(reader.result), { replaceDefinitions: true });
    } catch (err) {
      alert('Could not read that file — is it a landmarks.json exported from this tool?');
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
});

/* Applies a landmarks.json payload. If it carries `regions`/full landmark
   definitions (the current export format) and replaceDefinitions is true,
   the whole set is rebuilt from the file. Older position-only exports are
   still supported: positions get applied to whatever the current set is. */
function applyLandmarkData(data, { replaceDefinitions = false } = {}) {
  if (!data || !Array.isArray(data.landmarks)) return;

  if (replaceDefinitions && data.regions && Object.keys(data.regions).length) {
    LANDMARKS.forEach((l) => removeMarkerObject(l.id));
    state.placed = {};
    Object.keys(REGIONS).forEach((k) => delete REGIONS[k]);
    Object.assign(REGIONS, JSON.parse(JSON.stringify(data.regions)));
    LANDMARKS.length = 0;
    LANDMARKS.push(...data.landmarks.map((l) => ({
      id: l.id, name: l.name, abbr: l.abbr, group: l.group, desc: l.desc || '',
    })));
    state.regionOn = {};
  }

  data.landmarks.forEach((entry) => {
    if (entry.position) {
      const known = LANDMARKS.find((l) => l.id === entry.id);
      if (known) placeMarker(entry.id, new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z));
    }
  });

  buildSheet();
  buildRegionFilters();
  applyRegionVisibility();
  saveDraft();
}

async function fetchSavedLandmarks() {
  try {
    const res = await fetch('./landmarks.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    applyLandmarkData(data, { replaceDefinitions: true });
    return true;
  } catch (err) {
    return false;
  }
}

/* ======================================================================
   DRAFT PERSISTENCE (localStorage) — so in-progress edits survive a reload
====================================================================== */
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(buildExportPayload()));
  } catch (err) {
    // Storage full/unavailable (e.g. private browsing) — not fatal, just skip.
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    applyLandmarkData(JSON.parse(raw), { replaceDefinitions: true });
    return true;
  } catch (err) {
    return false;
  }
}

async function bootLandmarkData() {
  const hadDraft = loadDraft();
  if (!hadDraft) {
    await fetchSavedLandmarks();
  }
  buildSheet();
  buildRegionFilters();
  applyRegionVisibility();
}

document.getElementById('clear-draft-btn').addEventListener('click', () => {
  if (!confirm('Discard your locally-saved draft and reload the last published landmarks.json (or the starter set if none)?')) return;
  try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
  LANDMARKS.forEach((l) => removeMarkerObject(l.id));
  state.placed = {};
  seedDefaults();
  state.regionOn = {};
  bootLandmarkData();
});

/* ======================================================================
   MOBILE SIDEBAR TOGGLE
====================================================================== */
const sidebar = document.getElementById('sidebar');
document.getElementById('sidebar-toggle-mobile').addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

/* ======================================================================
   BOOT
====================================================================== */
buildSheet();
buildRegionFilters();
setMode('view');
loadModel();
