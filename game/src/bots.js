// The Sentinels: five bots that hold the sites, patrol the lanes and react to what
// they see and hear. One job: decide where each bot goes and when it shoots.
// Vision is a staggered line-of-sight raycast; hearing is a radius around a shot.
// Bots follow the waypoint graph, hold positions, strafe while engaging, and when
// the spike is planted they converge on the site to defuse it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_COUNT = 5;
const HEALTH = 100;
const WALK_SPEED = 3.1;
const RUSH_SPEED = 4.3;
const SEE_DISTANCE = 34;
const SEE_HALF_FOV = 0.96;
const HEAR_RADIUS = 30;
const REACTION = 0.38;
const FALL_SECONDS = 0.4;

const NAMES = ['Ash', 'Bram', 'Dune', 'Falk', 'Grit'];
const ASSIGN = ['A', 'A', 'B', 'B', 'mid'];

function buildBotMesh(scene, index) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.8 });
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color('#274b54'), roughness: 0.65, metalness: 0.1 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyan), emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 1.6 });
  const group = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), dark);
  legL.position.set(-0.11, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), visor);
  stripe.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), dark);
  head.position.y = 1.6;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), visor);
  band.position.set(0, 1.62, 0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
  gun.position.set(0.2, 1.15, -0.25);
  group.add(legL, legR, torso, stripe, head, band, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  scene.add(group);
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, fx, onDamagePlayer) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const hitMeshes = [];
  const eye = new THREE.Vector3();
  const toPlayer = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const probe = new THREE.Box3();
  let checkIndex = 0;
  let checkTimer = 0;

  for (let i = 0; i < BOT_COUNT; i += 1) {
    const parts = buildBotMesh(scene, i);
    const bot = {
      index: i,
      name: NAMES[i],
      assign: ASSIGN[i],
      parts,
      health: HEALTH,
      alive: true,
      mode: 'hold',
      yaw: 0,
      holdPoint: new THREE.Vector3(),
      holdYaw: 0,
      route: [],
      routeIndex: 0,
      target: null,
      lastSeen: -100,
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      strafeDir: 1,
      strafeAt: 0,
      walkPhase: Math.random() * 6,
      fall: 0,
      defuse: 0,
      stuckAt: 0,
      stuckPos: new THREE.Vector3(),
    };
    parts.torso.userData.bot = bot;
    parts.torso.userData.part = 'torso';
    parts.head.userData.bot = bot;
    parts.head.userData.part = 'head';
    parts.legL.userData.bot = bot;
    parts.legL.userData.part = 'leg';
    parts.legR.userData.bot = bot;
    parts.legR.userData.part = 'leg';
    hitMeshes.push(parts.torso, parts.head, parts.legL, parts.legR);
    bots.push(bot);
  }

  function overlaps(x, z) {
    probe.min.set(x - 0.34, 0.05, z - 0.34);
    probe.max.set(x + 0.34, 1.7, z + 0.34);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function moveBot(bot, dt, speed) {
    if (!bot.route.length || bot.routeIndex >= bot.route.length) return;
    const goal = bot.route[bot.routeIndex];
    const dx = goal.x - bot.parts.group.position.x;
    const dz = goal.z - bot.parts.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) { bot.routeIndex += 1; return; }
    const step = Math.min(dist, speed * dt);
    const nx = bot.parts.group.position.x + (dx / dist) * step;
    const nz = bot.parts.group.position.z + (dz / dist) * step;
    if (!overlaps(nx, bot.parts.group.position.z)) bot.parts.group.position.x = nx;
    else if (!overlaps(bot.parts.group.position.x, nz)) bot.parts.group.position.z = nz;
    else if (!overlaps(nx, nz)) { bot.parts.group.position.x = nx; bot.parts.group.position.z = nz; }
    bot.yaw = Math.atan2(-dx, -dz);
    bot.parts.group.rotation.y = bot.yaw;
    bot.walkPhase += dt * speed * 1.6;
    const swing = Math.sin(bot.walkPhase) * 0.09;
    bot.parts.legL.position.z = swing;
    bot.parts.legR.position.z = -swing;
    if (bot.parts.group.position.distanceToSquared(bot.stuckPos) > 0.09) {
      bot.stuckPos.copy(bot.parts.group.position);
      bot.stuckAt = 0;
    } else {
      bot.stuckAt += dt;
      if (bot.stuckAt > 1.6) { bot.routeIndex += 1; bot.stuckAt = 0; }
    }
  }

  function canSee(bot, playerPos, playerAlive) {
    if (!playerAlive) return false;
    const p = bot.parts.group.position;
    toPlayer.set(playerPos.x - p.x, 0, playerPos.z - p.z);
    const dist = toPlayer.length();
    if (dist > SEE_DISTANCE) return false;
    toPlayer.normalize();
    const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (facing.dot(toPlayer) < Math.cos(SEE_HALF_FOV)) return false;
    eye.set(p.x, 1.55, p.z);
    dir.set(playerPos.x - p.x, 1.25 - 1.55, playerPos.z - p.z).normalize();
    raycaster.set(eye, dir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    const playerDist = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
    return !hit || hit.distance > playerDist;
  }

  function routeTo(bot, x, z) {
    bot.route = world.findRoute(bot.parts.group.position.x, bot.parts.group.position.z, x, z);
    bot.routeIndex = 0;
  }

  function holdSpot(bot) {
    const site = world.sites[bot.assign === 'mid' ? 'A' : bot.assign];
    const jitter = (bot.index * 37) % 5 - 2;
    return { x: site.x + jitter, z: site.z + 2 + ((bot.index * 13) % 3) };
  }

  function reset() {
    for (const bot of bots) {
      const spawn = world.defenderSpawns[bot.index];
      bot.parts.group.position.copy(spawn);
      bot.parts.group.rotation.set(0, 0, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.mode = bot.assign === 'mid' ? 'patrol' : 'hold';
      bot.fall = 0;
      bot.defuse = 0;
      bot.target = null;
      bot.route = [];
      bot.routeIndex = 0;
      const spot = holdSpot(bot);
      bot.holdPoint.set(spot.x, 0, spot.z);
      bot.holdYaw = Math.atan2(-(spot.x - spawn.x), -(spot.z - spawn.z));
      bot.yaw = bot.holdYaw;
      bot.parts.group.rotation.y = bot.yaw;
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.mode = 'dead';
    bot.fall = 0;
    return true;
  }

  function hearShot(pos, radius = HEAR_RADIUS) {
    for (const bot of bots) {
      if (!bot.alive || bot.mode === 'engage' || bot.mode === 'defuse') continue;
      if (bot.parts.group.position.distanceTo(pos) < radius) {
        bot.mode = 'investigate';
        routeTo(bot, pos.x, pos.z);
      }
    }
  }

  function onPlant(siteKey) {
    const site = world.sites[siteKey];
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.mode = 'defuse';
      routeTo(bot, site.x, site.z);
      bot.defuse = 0;
    }
  }

  function step(dt, time, playerPos, playerAlive, spike) {
    checkTimer -= dt;
    if (checkTimer <= 0) {
      checkTimer = 0.15;
      const bot = bots[checkIndex];
      checkIndex = (checkIndex + 1) % bots.length;
      if (bot.alive && bot.mode !== 'defuse' && canSee(bot, playerPos, playerAlive)) {
        if (bot.mode !== 'engage') {
          bot.mode = 'engage';
          bot.reactionAt = time + REACTION + Math.random() * 0.2;
          bot.burstLeft = 0;
          bot.nextShotAt = 0;
        }
        bot.target = playerPos.clone();
        bot.lastSeen = time;
      } else if (bot.mode === 'engage' && time - bot.lastSeen > 1.2) {
        bot.mode = 'investigate';
        if (bot.target) routeTo(bot, bot.target.x, bot.target.z);
      }
    }

    for (const bot of bots) {
      const p = bot.parts.group.position;
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
          bot.parts.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      if (bot.mode === 'hold') {
        bot.yaw = bot.holdYaw + Math.sin(time * 0.5 + bot.index * 1.3) * 0.9;
        bot.parts.group.rotation.y = bot.yaw;
      } else if (bot.mode === 'patrol') {
        if (!bot.route.length || bot.routeIndex >= bot.route.length) {
          const a = Math.random() < 0.5 ? 'aApproach' : 'bApproach';
          const wp = world.findRoute(p.x, p.z, a === 'aApproach' ? -16 : 16, -7);
          bot.route = wp;
          bot.routeIndex = 0;
        }
        moveBot(bot, dt, WALK_SPEED);
      } else if (bot.mode === 'investigate') {
        moveBot(bot, dt, RUSH_SPEED);
        if (bot.routeIndex >= bot.route.length) {
          bot.mode = 'hold';
          bot.holdPoint.copy(p);
          bot.holdYaw = bot.yaw;
        }
      } else if (bot.mode === 'engage' && bot.target) {
        const dx = bot.target.x - p.x;
        const dz = bot.target.z - p.z;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.parts.group.rotation.y = bot.yaw;
        if (time > bot.strafeAt) {
          bot.strafeDir *= -1;
          bot.strafeAt = time + 0.7 + Math.random() * 0.7;
        }
        const sideX = Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = -Math.sin(bot.yaw) * bot.strafeDir;
        const nx = p.x + sideX * 1.6 * dt;
        const nz = p.z + sideZ * 1.6 * dt;
        if (!overlaps(nx, p.z)) p.x = nx;
        if (!overlaps(p.x, nz)) p.z = nz;
        if (time >= bot.reactionAt && playerAlive) {
          if (bot.burstLeft <= 0 && time >= bot.nextShotAt) {
            bot.burstLeft = 3 + Math.floor(Math.random() * 3);
            bot.nextShotAt = time + 0.12;
          }
          if (bot.burstLeft > 0 && time >= bot.nextShotAt) {
            bot.burstLeft -= 1;
            bot.nextShotAt = time + 0.12;
            if (bot.burstLeft === 0) bot.nextShotAt = time + 0.5 + Math.random() * 0.5;
            const dist = Math.hypot(bot.target.x - p.x, bot.target.z - p.z);
            const spread = 0.028 + dist * 0.0009;
            eye.set(p.x, 1.45, p.z);
            dir.set(bot.target.x - p.x, 1.3 - 1.45, bot.target.z - p.z).normalize();
            dir.x += (Math.random() * 2 - 1) * spread;
            dir.y += (Math.random() * 2 - 1) * spread * 0.6;
            dir.z += (Math.random() * 2 - 1) * spread;
            dir.normalize();
            raycaster.set(eye, dir);
            const wall = raycaster.intersectObjects(world.shootables, false)[0];
            const end = wall ? wall.point : eye.clone().addScaledVector(dir, 60);
            fx.tracer(eye, end);
            const chestDist = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
            if ((!wall || wall.distance > chestDist) && Math.random() < Math.max(0.12, 0.42 - dist * 0.008)) {
              onDamagePlayer(9 + Math.random() * 6, p, false);
            }
          }
        }
      } else if (bot.mode === 'defuse' && spike.state === 'planted') {
        const site = world.sites[spike.site];
        const d = Math.hypot(site.x - p.x, site.z - p.z);
        if (d > 2.2) {
          moveBot(bot, dt, RUSH_SPEED);
        } else {
          bot.defuse += dt;
          bot.yaw += dt * 0.5;
          bot.parts.group.rotation.y = bot.yaw;
          if (bot.defuse >= 4) {
            spike.state = 'defused';
            spike.defuser = bot;
          }
        }
      }
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    damage,
    hearShot,
    onPlant,
    step,
    aliveCount() {
      return bots.filter((b) => b.alive).length;
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      const p = bot.parts.group.position;
      return new THREE.Vector3(p.x, 1.25, p.z);
    },
  };
}
