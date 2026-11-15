// DUSTLINE — Foundry Yard. The orchestrator: renderer, fixed-step loop, pointer
// lock, shooting, grenades, damage and the round machine. Modules own their
// jobs (world, player, weapons, bots, rounds, hud, fx, audio); this file only
// wires them together and owns the player health and the camera.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState } from './state.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { audio, unlockAudio } from './audio.js';

const STEP = 1 / 60;
const BASE_FOV = 74;
const ZOOM_FOV = 30;

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const shotSeed = Number(params.get('seed') || '1');

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 95);

const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 220);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const fx = createFx(scene, camera);
const hud = createHud();
const player = createPlayer(world.colliders);

let playerHealth = 100;
let playerAlive = true;
let buyOpen = false;

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const eyePos = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const muzzle = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function onExplode(pos) {
  fx.explosion(pos);
  audio.explode();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.parts.group.position.distanceTo(pos);
    if (d < 5) {
      const dmg = Math.max(15, 95 - d * 14);
      if (bots.damage(bot.parts.torso, dmg)) {
        rounds.onKill();
        hud.killfeed(`Frag ▸ ${bot.name}`);
        audio.hit(true);
      }
    }
  }
  const d = player.state.position.distanceTo(pos);
  if (playerAlive && d < 5) damagePlayer(Math.max(8, 95 - d * 14) * 0.5, pos);
  bots.hearShot(pos, 45);
}

const weapons = createWeapons(camera, fx, onExplode);

function damagePlayer(amount, fromPos) {
  if (!playerAlive) return;
  let remaining = amount;
  if (weapons.state.armor > 0) {
    const absorbed = Math.min(weapons.state.armor, amount * 0.5);
    weapons.state.armor -= absorbed;
    remaining = amount - absorbed;
  }
  playerHealth -= remaining;
  audio.hurt();
  const dx = fromPos.x - player.state.position.x;
  const dz = fromPos.z - player.state.position.z;
  const relDeg = (player.state.yaw - Math.atan2(-dx, -dz)) * 180 / Math.PI;
  hud.damageFrom(relDeg);
  if (playerHealth <= 0) {
    playerHealth = 0;
    playerAlive = false;
  }
}

const bots = createBots(scene, world, fx, (amount, fromPos) => damagePlayer(amount, fromPos));
const shootTargets = [...world.shootables, ...bots.hitMeshes];
const rounds = createRounds({ state, world, weapons, bots, hud, audio, fx });

function respawnPlayer() {
  player.state.position.copy(world.attackerSpawn);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  playerHealth = 100;
  playerAlive = true;
}

function toggleBuy() {
  if (buyOpen) {
    hud.hideBuy();
    buyOpen = false;
    input.requestLock();
  } else {
    hud.showBuy(rounds.buyItems());
    buyOpen = true;
    document.exitPointerLock();
  }
}

function cycleWeapon() {
  const ids = Object.keys(weapons.owned);
  const current = ids.indexOf(weapons.state.current);
  const next = ids[(current + 1) % ids.length];
  if (weapons.equip(next)) audio.buy();
}

function fireWeapon() {
  const def = weapons.def();
  if (!weapons.ready()) {
    if (weapons.ammo().mag === 0 && weapons.ammo().reserve > 0) {
      if (weapons.reload()) audio.reload();
    } else if (weapons.ammo().mag === 0) {
      audio.dryFire();
    }
    return;
  }
  weapons.takeRound();
  weapons.pullTrigger();
  audio.shot(def.kind);
  bots.hearShot(eyePos);
  player.recoil(def.kind === 'sniper' ? 0.045 : 0.014, (Math.random() - 0.5) * 0.004);
  fx.shake(def.kind === 'sniper' ? 0.12 : 0.05);
  const spread = weapons.spread(player.groundSpeed(), input.state.aiming && def.zoom);
  for (let p = 0; p < def.pellets; p += 1) {
    camera.getWorldDirection(tmpDir);
    tmpDir.x += (Math.random() * 2 - 1) * spread;
    tmpDir.y += (Math.random() * 2 - 1) * spread;
    tmpDir.z += (Math.random() * 2 - 1) * spread;
    tmpDir.normalize();
    raycaster.set(eyePos, tmpDir);
    const hit = raycaster.intersectObjects(shootTargets, false)[0];
    camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    muzzle.copy(eyePos).addScaledVector(forward, 0.6).addScaledVector(right, 0.22).addScaledVector(up, -0.16);
    if (hit) {
      fx.tracer(muzzle, hit.point);
      const bot = hit.object.userData.bot;
      if (bot && bot.alive) {
        const part = hit.object.userData.part;
        const mult = part === 'head' ? def.headMult : part === 'leg' ? 0.75 : 1;
        const killed = bots.damage(hit.object, def.damage * mult);
        if (killed) {
          rounds.onKill();
          hud.killfeed(`You ▸ ${bot.name}${part === 'head' ? ' — HEADSHOT' : ''}`);
          hud.hitMarker(true, 140);
          audio.hit(true);
        } else {
          hud.hitMarker(false);
          audio.hit(false);
        }
      } else {
        fx.burst(hit.point, 6);
      }
    } else {
      fx.tracer(muzzle, tmpVec.copy(eyePos).addScaledVector(tmpDir, 60));
    }
  }
  if (weapons.ammo().mag === 0 && weapons.ammo().reserve > 0) {
    if (weapons.reload()) audio.reload();
  }
}

function throwGrenade() {
  camera.getWorldDirection(forward);
  tmpVec.copy(eyePos).addScaledVector(forward, 0.5);
  if (weapons.throwGrenade(tmpVec, forward)) audio.bounce();
}

let shotPose = null;

function applyCamera() {
  if (shotPose) {
    camera.position.copy(shotPose.pos);
    camera.lookAt(shotPose.look);
    eyePos.copy(camera.position);
    return;
  }
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    const t = state.time * 0.06;
    camera.position.set(Math.sin(t) * 19, 9.5, Math.cos(t) * 19);
    camera.lookAt(0, 1, -5);
    eyePos.copy(camera.position);
    return;
  }
  if (state.spectate && state.phase === 'live') {
    const site = world.sites[state.spike.site];
    tmpVec.set(site.x, 15, site.z + 8);
    camera.position.lerp(tmpVec, 0.06);
    camera.lookAt(site.x, 0.5, site.z);
    eyePos.copy(camera.position);
    return;
  }
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  eyePos.copy(camera.position);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if ((state.phase === 'live' || state.phase === 'buy') && !buyOpen) {
    hud.showOverlay('paused');
  }
}

const input = createInput(renderer.domElement, onLockChange);

hud.onPlay(() => {
  unlockAudio();
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    rounds.startMatch();
    respawnPlayer();
    buyOpen = true;
  }
  input.requestLock();
});
hud.onBuy((id) => { rounds.buy(id); });

let prevFiring = false;
let stepAccum = 0;

function step(dt) {
  state.time += dt;
  const pressed = input.takePressed();

  if (pressed.has('KeyB') && state.phase === 'buy') toggleBuy();
  if (state.phase === 'buy') {
    const items = rounds.buyItems();
    for (let i = 0; i < 7; i += 1) {
      if (pressed.has(`Digit${i + 1}`) && items[i]) rounds.buy(items[i].id);
    }
  }
  if (pressed.has('KeyQ') && (state.phase === 'buy' || state.phase === 'live')) cycleWeapon();
  if (pressed.has('KeyR') && (state.phase === 'buy' || state.phase === 'live')) {
    if (weapons.reload()) audio.reload();
  }
  if (pressed.has('KeyG') && state.phase === 'live' && playerAlive) throwGrenade();

  const aiming = input.state.aiming && weapons.def().zoom && state.phase === 'live';
  const look = input.takeLook();
  if (input.state.locked && playerAlive && (state.phase === 'buy' || state.phase === 'live')) {
    player.look(look.x, look.y, aiming ? 0.0009 : 0.0022);
  }

  if ((state.phase === 'buy' || state.phase === 'live') && playerAlive) {
    player.step(dt, input.state.keys);
    stepAccum += player.groundSpeed() * dt;
    if (stepAccum > 2.4 && player.state.onGround) {
      stepAccum = 0;
      audio.step();
    }
  }

  weapons.step(dt, world.colliders);

  const events = rounds.update(dt, {
    playerPos: player.state.position,
    playerAlive,
    plantKey: input.state.keys.has('KeyE'),
  });
  for (const event of events) {
    if (event === 'roundStart') {
      respawnPlayer();
      buyOpen = true;
    }
    if (event === 'matchWon' || event === 'matchLost') {
      document.exitPointerLock();
      hud.showOverlay(event, `${state.wins.us}–${state.wins.them}`);
    }
  }

  if (state.phase === 'live') {
    bots.step(dt, state.time, player.state.position, playerAlive, state.spike);
  }

  if (state.phase === 'live' && playerAlive && input.state.firing) {
    const def = weapons.def();
    if (def.auto || !prevFiring) fireWeapon();
  }
  prevFiring = input.state.firing;

  const targetFov = aiming ? ZOOM_FOV : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }

  applyCamera();
  fx.step(dt);
}

function render() {
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  hud.setWeapon(weapons.def().name.toUpperCase());
  hud.setHealth(playerHealth, weapons.state.armor);
  hud.setMoney(state.money);
  hud.setAlive(bots.aliveCount());
  const aiming = input.state.aiming && weapons.def().zoom;
  hud.setSpread(4 + weapons.spread(player.groundSpeed(), aiming) * 260);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Deterministic screenshot poses: the menu orbit, the live view and the round
// end are fixed here so ?shot= captures frame the same scene every time.
function applyShot() {
  hud.hideOverlay();
  hud.hideBuy();
  if (shot === 'start') {
    state.phase = 'menu';
    shotPose = { pos: new THREE.Vector3(14, 9, 16), look: new THREE.Vector3(0, 1, -6) };
  } else if (shot === 'play') {
    rounds.startMatch();
    respawnPlayer();
    state.phase = 'live';
    state.buyTimer = 0;
    hud.hideBuy();
    weapons.owned.rifle = { mag: 30, reserve: 90 };
    weapons.equip('rifle');
    player.state.position.set(-15, 0, -2);
    player.state.yaw = 0.1;
    player.state.pitch = -0.01;
  } else if (shot === 'end') {
    rounds.startMatch();
    respawnPlayer();
    rounds.holdRoundEnd(60);
    hud.hideBuy();
    state.phase = 'roundEnd';
    state.wins.us = 5;
    state.wins.them = 2;
    hud.setBanner('ROUND WON', 'All Sentinels eliminated', 'win');
    hud.setScore(5, 2, 9);
    const dead = bots.bots.slice(0, 2);
    for (const bot of dead) {
      bots.damage(bot.parts.torso, 999);
      bot.parts.group.rotation.x = -1.45;
    }
    camera.position.set(-10, 7, -2);
    camera.lookAt(-16, 1, -12);
    shotPose = { pos: new THREE.Vector3(-10, 7, -2), look: new THREE.Vector3(-16, 1, -12) };
  }
  state.time = shotSeed;
}

if (shot) applyShot();

let last = performance.now();
let acc = 0;
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) {
    step(STEP);
    acc -= STEP;
    n += 1;
  }
  if (n === 5) acc = 0;
  render();
  frames += 1;
  if (shot && frames === 2) window.__shotReady = true;
}
requestAnimationFrame(frame);
