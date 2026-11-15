// The arsenal: five hitscan weapons and one frag grenade. The module owns the
// numbers, the view models and the reload; main.js owns the ray and the damage.
// Spread grows with movement and shrinks when still or scoped, so stopping to
// aim pays — the same rule the bots live by.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P250 Sidearm', kind: 'pistol', price: 0, mag: 12, reserve: 48, gap: 0.18, reload: 1.3, damage: 34, headMult: 3, pellets: 1, spreadStill: 0.004, spreadMove: 0.03, auto: false, zoom: 0 },
  smg: { name: 'Reaper SMG', kind: 'smg', price: 600, mag: 28, reserve: 112, gap: 0.085, reload: 1.7, damage: 26, headMult: 3, pellets: 1, spreadStill: 0.006, spreadMove: 0.035, auto: true, zoom: 0 },
  rifle: { name: 'Longshot Rifle', kind: 'rifle', price: 1200, mag: 30, reserve: 90, gap: 0.105, reload: 1.9, damage: 34, headMult: 3, pellets: 1, spreadStill: 0.002, spreadMove: 0.028, auto: true, zoom: 0 },
  shotgun: { name: 'Mastiff Shotgun', kind: 'shotgun', price: 800, mag: 6, reserve: 24, gap: 0.9, reload: 2.6, damage: 12, headMult: 2, pellets: 8, spreadStill: 0.05, spreadMove: 0.06, auto: false, zoom: 0 },
  sniper: { name: 'Needle Sniper', kind: 'sniper', price: 2000, mag: 5, reserve: 15, gap: 1.2, reload: 2.4, damage: 88, headMult: 3, pellets: 1, spreadStill: 0.0006, spreadMove: 0.02, auto: false, zoom: 1 },
};
export const GRENADE_PRICE = 200;
export const ARMOR_PRICE = 400;

const MUZZLE_TIME = 0.06;

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.dark), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, mat = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (def.kind === 'pistol') {
    add(0.06, 0.08, 0.26, 0, 0, -0.1);
    add(0.05, 0.12, 0.07, 0, -0.08, 0.03, grip);
    add(0.02, 0.03, 0.02, 0, 0.055, -0.22, accent);
  } else if (def.kind === 'smg') {
    add(0.08, 0.09, 0.4, 0, 0, -0.12);
    add(0.05, 0.05, 0.3, 0, 0.02, -0.4, grip);
    add(0.05, 0.16, 0.06, 0, -0.1, -0.05, grip);
    add(0.06, 0.05, 0.06, 0, 0.07, -0.2, accent);
  } else if (def.kind === 'rifle') {
    add(0.09, 0.1, 0.44, 0, 0, -0.14);
    add(0.045, 0.045, 0.42, 0, 0.025, -0.5, grip);
    add(0.075, 0.08, 0.24, 0, -0.02, 0.28, grip);
    add(0.05, 0.06, 0.12, 0, 0.08, -0.18, accent);
  } else if (def.kind === 'shotgun') {
    add(0.1, 0.11, 0.46, 0, 0, -0.14);
    add(0.07, 0.07, 0.4, 0, 0.03, -0.42, grip);
    add(0.06, 0.06, 0.2, 0, -0.06, -0.3, grip);
    add(0.08, 0.05, 0.1, 0, 0.09, -0.1, accent);
  } else {
    add(0.07, 0.08, 0.6, 0, 0, -0.2);
    add(0.04, 0.04, 0.5, 0, 0.02, -0.62, grip);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), accent);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.2);
    group.add(scope);
    add(0.06, 0.07, 0.2, 0, -0.02, 0.3, grip);
  }
  group.position.set(0.26, -0.22, -0.5);
  group.scale.setScalar(0.72);
  return group;
}

export function createWeapons(camera, fx, onExplode) {
  const models = {};
  for (const [id, def] of Object.entries(WEAPONS)) {
    models[id] = buildModel(def);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  const state = {
    current: 'pistol',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
    armor: 0,
  };
  models.pistol.visible = true;

  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.4 });
  const grenades = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.visible = false;
    mesh.castShadow = true;
    camera.parent.add(mesh);
    grenades.push({ mesh, vel: new THREE.Vector3(), fuse: 0, live: false });
  }

  function def() { return WEAPONS[state.current]; }
  function ammo() { return owned[state.current]; }

  function step(dt, colliders) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const need = d.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    for (const g of grenades) {
      if (!g.live) continue;
      g.fuse -= dt;
      g.vel.y -= 16 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        if (Math.abs(g.vel.y) > 1.5) g.vel.y *= -0.35;
        else g.vel.y = 0;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      for (const c of colliders) {
        if (c.containsPoint(g.mesh.position)) {
          g.mesh.position.addScaledVector(g.vel, -dt);
          g.vel.multiplyScalar(-0.35);
          break;
        }
      }
      if (g.fuse <= 0) {
        g.live = false;
        g.mesh.visible = false;
        onExplode(g.mesh.position.clone());
      }
    }
  }

  return {
    state,
    owned,
    def,
    ammo,
    step,
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    reload() {
      const d = def();
      const a = ammo();
      if (state.reloadLeft > 0 || a.mag === d.mag || a.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const base = aiming && d.zoom ? d.spreadStill * 0.4 : d.spreadStill;
      return base + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    equip(id) {
      if (!owned[id] || id === state.current) return false;
      models[state.current].visible = false;
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = 0;
      models[id].visible = true;
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || owned[id] || money < d.price) return 0;
      owned[id] = { mag: d.mag, reserve: d.reserve };
      return d.price;
    },
    refillReserves() {
      for (const [id, a] of Object.entries(owned)) a.reserve = WEAPONS[id].reserve;
    },
    throwGrenade(origin, dir) {
      if (state.grenades <= 0) return false;
      const g = grenades.find((x) => !x.live);
      if (!g) return false;
      state.grenades -= 1;
      g.live = true;
      g.fuse = 1.6;
      g.mesh.visible = true;
      g.mesh.position.copy(origin);
      g.vel.copy(dir).multiplyScalar(13);
      g.vel.y += 4.5;
      return true;
    },
  };
}
