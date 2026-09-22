import * as THREE from "../vendor/three.module.min.js";

// Persistent particle histories reveal circulation. One draw call, fixed-size
// buffers, no per-frame allocations. Unlike an oscillating sculpture, each
// head keeps its previous position and is transported through the water.
export function createFlowRibbons(scene, ecosystem, { density, surface, stones }) {
  const count = density < 1 ? 24 : 48, length = 72;
  const history = new Float32Array(count * length * 3);
  const positions = new Float32Array(count * (length - 1) * 6);
  const colors = new Float32Array(positions.length);
  const ages = new Float32Array(count);
  const field = new THREE.Vector3();
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.44, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.LineSegments(geometry, material); mesh.frustumCulled = false; scene.add(mesh);
  function velocity(x, y, z, time) {
    const e = ecosystem.state;
    const radius = Math.hypot(x, z) + 1;
    const phase = e.phase, curl = 0.28 + e.turbulence * 0.6;
    // Curl of a sinusoidal vector potential, with a rising central vortex.
    field.set(-z / radius * 0.65 + e.currentX + curl * (Math.cos(y * 0.34 + phase) - Math.sin(z * 0.4 + time * 0.06)),
      0.12 + 0.28 * Math.exp(-radius / 10) + curl * 0.45 * (Math.cos(z * 0.38 + phase) - Math.sin(x * 0.4)),
      x / radius * 0.65 + e.currentZ + curl * (Math.cos(x * 0.4 + time * 0.04) - Math.sin(y * 0.34 + phase)));
    for (const s of stones) {
      const dx = x - s.x, dy = y - s.y, dz = z - s.z;
      const d = Math.hypot(dx, dz) + 0.5;
      const influence = Math.exp(-(dx * dx + dz * dz + dy * dy * 2) / 12);
      field.x -= dz / d * influence; field.z += dx / d * influence;
    }
    return field;
  }
  function seed(i, time) {
    const angle = i * 2.39996 + Math.sin(time * 0.02) * 0.3;
    let x = Math.cos(angle) * (5 + (i % 9) * 1.6), z = Math.sin(angle) * (5 + (i % 9) * 1.6), y = 3 + (i % 8) / 8 * (surface - 7);
    for (let k = 0; k < length; k++) {
      const offset = (i * length + k) * 3;
      history[offset] = x; history[offset + 1] = y; history[offset + 2] = z;
      velocity(x, y, z, time); x -= field.x * 0.12; y -= field.y * 0.12; z -= field.z * 0.12;
    }
  }
  for (let i = 0; i < count; i++) { ages[i] = i / count * 60; seed(i, 0); }
  let elapsed = 0, remainder = 0;
  function update(dt, current = 1) {
    elapsed += dt; remainder += dt;
    // Fixed steps keep trails the same length at 30, 60 and 120fps.
    while (remainder >= 0.06) {
      remainder -= 0.06;
      for (let i = 0; i < count; i++) {
        const offset = i * length * 3;
        ages[i] += 0.06;
        history.copyWithin(offset + 3, offset, offset + (length - 1) * 3);
        velocity(history[offset], history[offset + 1], history[offset + 2], elapsed);
        history[offset] += field.x * 0.06 * current;
        history[offset + 1] += field.y * 0.06 * current;
        history[offset + 2] += field.z * 0.06 * current;
        if (ages[i] > 95) { ages[i] = 0; seed(i, elapsed); }
      }
    }
    for (let i = 0; i < count; i++) {
      const fade = Math.min(1, ages[i] / 4, (95 - ages[i]) / 5);
      for (let k = 0; k < length - 1; k++) {
        const offset = (i * (length - 1) + k) * 6;
        for (let end = 0; end < 2; end++) {
          const from = (i * length + k + end) * 3, to = offset + end * 3;
          positions[to] = history[from]; positions[to + 1] = history[from + 1]; positions[to + 2] = history[from + 2];
          const light = Math.pow(1 - (k + end) / length, 1.7) * fade;
          colors[to] = light * (i % 3 ? 0.13 : 0.35);
          colors[to + 1] = light * 0.66;
          colors[to + 2] = light * (i % 3 ? 0.72 : 0.95);
        }
      }
    }
    attribute.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
    material.opacity = 0.24 + ecosystem.state.bloom * 0.18;
  }
  update(0);
  return { update, mesh };
}
