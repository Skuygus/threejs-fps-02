// Foundry Yard: an original 48 x 36 m industrial yard. Three lanes (west, mid, east),
// two spike sites — A Furnace (north-west) and B Depot (north-east) — containers,
// crates and a central foundry block with one mid door. Every box is a collider for
// movement and a surface a bullet stops on. Waypoints below are the bot nav graph.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SITES = {
  A: { x: -16, z: -12, color: 'accent', name: 'Furnace' },
  B: { x: 16, z: -12, color: 'cyan', name: 'Depot' },
};

// Waypoint graph: id -> [x, z, ...neighbour ids]. Bots BFS through it.
const WAYPOINTS = {
  spawn: [0, 15.5, 'wSouth', 'midSouth', 'eSouth'],
  wSouth: [-19, 10, 'spawn', 'wMid', 'midSouth'],
  midSouth: [0, 8, 'spawn', 'wSouth', 'eSouth', 'midDoor'],
  eSouth: [19, 10, 'spawn', 'midSouth', 'eMid'],
  wMid: [-19, 0, 'wSouth', 'wNorth', 'midDoor'],
  midDoor: [0, 0, 'midSouth', 'wMid', 'eMid', 'midNorth'],
  eMid: [19, 0, 'eSouth', 'eNorth', 'midDoor'],
  wNorth: [-19, -10, 'wMid', 'aApproach'],
  midNorth: [0, -8, 'midDoor', 'aApproach', 'bApproach'],
  eNorth: [19, -10, 'eMid', 'bApproach'],
  aApproach: [-16, -7, 'wNorth', 'midNorth', 'aSite'],
  bApproach: [16, -7, 'eNorth', 'midNorth', 'bSite'],
  aSite: [-16, -12, 'aApproach'],
  bSite: [16, -12, 'bApproach'],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'cyan' || name === 'ink' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }
  const glowA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6 });
  const glowB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyan), emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 1.6 });
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: dark asphalt with a faint painted grid, drawn once at runtime.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#171b20';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(233,230,223,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  for (let i = 0; i < 500; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const groundTex = new THREE.CanvasTexture(canvas);
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(12, 9);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(48.4, 0.4, 36.4),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  colliders.push(new THREE.Box3().setFromObject(ground));
  shootables.push(ground);

  // Perimeter walls.
  box(0.4, 4.6, 36.4, -24.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 36.4, 24.2, 2.3, 0, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, -18.2, 'surface');
  box(48.4, 4.6, 0.4, 0, 2.3, 18.2, 'surface');

  // Central foundry block, split by one mid door (2.4 m wide).
  box(4.8, 3.4, 8, -3.6, 1.7, 0, 'surface');
  box(4.8, 3.4, 8, 3.6, 1.7, 0, 'surface');
  box(12, 0.8, 8.4, 0, 3.8, 0, 'hairline'); // lintel over the door

  // Rust containers: the long sightlines down each lane.
  box(6, 2.4, 2.4, -12, 1.2, -8, 'rust');
  box(6, 2.4, 2.4, 12, 1.2, -8, 'rust');
  box(2.4, 2.4, 6, -12, 1.2, 6, 'rust');
  box(2.4, 2.4, 6, 12, 1.2, 6, 'rust');
  // Crouch crates and low walls.
  box(1.2, 1.1, 1.2, -19, 0.55, 4, 'hairline');
  box(1.2, 1.1, 1.2, 19, 0.55, 4, 'hairline');
  box(1.2, 1.1, 1.2, -7, 0.55, -13, 'hairline');
  box(1.2, 1.1, 1.2, 7, 0.55, -13, 'hairline');
  box(3.6, 1.05, 0.6, -16, 0.52, -6, 'hairline');
  box(3.6, 1.05, 0.6, 16, 0.52, -6, 'hairline');
  box(1.2, 1.1, 3.6, -6, 0.55, 12, 'hairline');
  box(1.2, 1.1, 3.6, 6, 0.55, 12, 'hairline');
  // Silos (cylinders, box colliders).
  for (const x of [-21, 21]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5, 18), materials.surface);
    silo.position.set(x, 2.5, -14.5);
    silo.castShadow = true;
    silo.receiveShadow = true;
    group.add(silo);
    colliders.push(new THREE.Box3().setFromObject(silo));
    shootables.push(silo);
  }

  // Site markers: a glowing floor ring and a letter panel on the back wall.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE[site.color]), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const letter = document.createElement('canvas');
    letter.width = 128;
    letter.height = 128;
    const lctx = letter.getContext('2d');
    lctx.fillStyle = PALETTE[site.color];
    lctx.font = '900 96px system-ui, sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(key, 64, 70);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(letter), transparent: true, side: THREE.DoubleSide }),
    );
    panel.position.set(site.x, 3.1, -17.9);
    group.add(panel);
    const light = new THREE.PointLight(new THREE.Color(PALETTE[site.color]), 14, 12);
    light.position.set(site.x, 3.4, site.z);
    scene.add(light);
  }

  // Light: warm sodium key, cool fill, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.2);
  key.position.set(14, 20, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -28;
  key.shadow.camera.right = 28;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-12, 12, 14);
  scene.add(fill);

  function nearestNode(x, z) {
    let best = 'spawn';
    let bestD = Infinity;
    for (const [id, node] of Object.entries(WAYPOINTS)) {
      const d = (node[0] - x) ** 2 + (node[1] - z) ** 2;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  // BFS route through the waypoint graph; returns world points (no allocation of
  // new arrays per call beyond the returned list, which callers cache).
  function findRoute(fromX, fromZ, toX, toZ) {
    const start = nearestNode(fromX, fromZ);
    const goal = nearestNode(toX, toZ);
    const prev = { [start]: null };
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      if (id === goal) break;
      for (const next of WAYPOINTS[id].slice(2)) {
        if (!(next in prev)) { prev[next] = id; queue.push(next); }
      }
    }
    const path = [];
    let id = goal;
    while (id) { path.unshift(id); id = prev[id]; }
    const points = path.map((nodeId) => new THREE.Vector3(WAYPOINTS[nodeId][0], 0, WAYPOINTS[nodeId][1]));
    points.push(new THREE.Vector3(toX, 0, toZ));
    return points;
  }

  return {
    colliders,
    shootables,
    group,
    sites: SITES,
    attackerSpawn: new THREE.Vector3(0, 0, 15.5),
    defenderSpawns: [
      new THREE.Vector3(-16, 0, -12),
      new THREE.Vector3(-13, 0, -14),
      new THREE.Vector3(16, 0, -12),
      new THREE.Vector3(13, 0, -14),
      new THREE.Vector3(0, 0, -13),
    ],
    findRoute,
    glowA,
    glowB,
  };
}
