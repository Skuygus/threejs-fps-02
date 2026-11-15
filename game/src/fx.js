// Pooled effects: tracers, impact sparks, one explosion. Everything is allocated
// once in createFx; the hot loop only writes into existing buffers and transforms,
// so no object is created per frame while shooting.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 28;
const SPARK_LIFE = 0.55;

export function createFx(scene, camera) {
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  const sparkGeo = new THREE.TetrahedronGeometry(0.045);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, vel: new THREE.Vector3(), life: 0 });
  }
  let sparkNext = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 30);
  scene.add(blastLight);
  let blastLife = 0;

  let trauma = 0;
  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.85;
      t.life = 0.09;
    },
    burst(point, count = 7) {
      for (let n = 0; n < count; n += 1) {
        const s = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % SPARK_COUNT;
        s.mesh.visible = true;
        s.mesh.position.copy(point);
        s.vel.set((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
        s.life = SPARK_LIFE * (0.6 + Math.random() * 0.4);
        s.mesh.scale.setScalar(1);
      }
    },
    explosion(point) {
      blast.visible = true;
      blast.position.copy(point);
      blast.scale.setScalar(0.5);
      blastLife = 0.55;
      blastLight.position.copy(point);
      blastLight.position.y += 1;
      blastLight.intensity = 120;
      trauma = Math.min(1, trauma + 0.9);
    },
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.mesh.position.y < 0.02) { s.mesh.position.y = 0.02; s.vel.y *= -0.3; }
        s.mesh.scale.setScalar(Math.max(0.01, s.life / SPARK_LIFE));
        if (s.life <= 0) s.mesh.visible = false;
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const k = 1 - blastLife / 0.55;
        blast.scale.setScalar(0.5 + k * 9);
        blast.material.opacity = Math.max(0, 0.75 * (1 - k));
        blastLight.intensity = Math.max(0, 120 * (1 - k));
        if (blastLife <= 0) { blast.visible = false; blastLight.intensity = 0; }
      }
      if (trauma > 0) {
        trauma = Math.max(0, trauma - dt * 1.6);
        const sh = trauma * trauma * 0.03;
        camera.rotation.x += (Math.random() - 0.5) * sh;
        camera.rotation.y += (Math.random() - 0.5) * sh;
      }
    },
    get impactPoint() {
      return tmp;
    },
  };
}
