import * as THREE from '../vendor/three.module.min.js';

// Larry uses the world's visual language: suspended points and fine filaments.
export function createCompanion({ scene, camera, onTalk, reducedMotion }) {
  const creature = new THREE.Group(); creature.name = 'larry-companion'; scene.add(creature);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x78afbf, transparent: true, opacity: .36, depthTest: false, depthWrite: false });
  const shell = new THREE.Group(); creature.add(shell);
  function filament(points, opacity = .36) {
    const material = lineMaterial.clone(); material.opacity = opacity;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material); line.renderOrder = 1010; shell.add(line); return line;
  }
  for (let rib = 0; rib < 12; rib++) {
    const angle = rib * Math.PI / 6;
    filament(Array.from({length: 40}, (_, j) => {
      const t = j / 39 * Math.PI * .78, radius = .31 * Math.sin(t) * (1 + .08 * Math.sin(t * 5));
      return new THREE.Vector3(Math.cos(angle) * radius, Math.cos(t) * .31, Math.sin(angle) * radius);
    }), rib % 3 ? .23 : .48);
  }
  for (let ring = 1; ring < 7; ring++) {
    const t = ring / 7 * Math.PI * .78, radius = .31 * Math.sin(t);
    filament(Array.from({length: 65}, (_, j) => new THREE.Vector3(Math.cos(j / 64 * Math.PI * 2) * radius, Math.cos(t) * .31, Math.sin(j / 64 * Math.PI * 2) * radius)), .1);
  }
  const points = new Float32Array(650 * 3);
  for (let i = 0; i < 650; i++) {
    const angle = i * 2.399963, t = Math.acos(1 - (i + .5) / 650 * 1.75), radius = .31 * Math.sin(t);
    points.set([Math.cos(angle) * radius, Math.cos(t) * .31, Math.sin(angle) * radius], i * 3);
  }
  const grainGeometry = new THREE.BufferGeometry(); grainGeometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  const grain = new THREE.Points(grainGeometry, new THREE.PointsMaterial({ color: 0x91c8d4, size: .009, transparent: true, opacity: .58, depthTest: false, depthWrite: false })); grain.renderOrder = 1011; shell.add(grain);
  const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.105, 1)), new THREE.LineBasicMaterial({ color: 0x80b9ce, transparent: true, opacity: .32, depthTest: false, depthWrite: false })); core.renderOrder = 1012; shell.add(core);
  const arms = Array.from({length: 9}, (_, i) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3));
    const material = lineMaterial.clone(); material.opacity = i % 3 ? .23 : .5;
    const line = new THREE.Line(geometry, material); line.renderOrder = 1009; creature.add(line); return {line, phase: i * Math.PI * 2 / 9, length: .8 + .23 * Math.sin(i * 2.4), nodes: Array.from({length: 16}, () => new THREE.Vector3()), previous: Array.from({length: 16}, () => new THREE.Vector3()), ready: false};
  });
  const hitArea = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); creature.add(hitArea);
  const label = document.createElement('button'); label.id = 'thread-companion-label'; label.className = 'pill'; label.textContent = 'larry'; label.setAttribute('aria-label', 'talk to larry'); label.onclick = onTalk; document.getElementById('environment').append(label);
  const target = new THREE.Vector3(), projection = new THREE.Vector3(), ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const anchor = new THREE.Vector3(), lastListener = new THREE.Vector3(), velocity = new THREE.Vector3(), steering = new THREE.Vector3();
  let recall = false; document.addEventListener("larry:recall", () => { recall = true; });
  let time = 0, elapsed = 0, retargeted = 0, placed = false, state = 'idle';
  document.addEventListener('thread:state', event => { state = event.detail; label.textContent = state === 'thinking' ? 'larry · thinking' : 'larry'; });
  const root = new THREE.Vector3(), delta = new THREE.Vector3(), prior = new THREE.Vector3(), local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  let physicsTime = 0, accumulator = 0;
  function update(dt) {
    dt = Math.min(Math.max(dt, 0), .1);
    const still = reducedMotion(); if (!still) time += dt;
    elapsed += dt;
    const narrow = innerWidth < 800;
    // Turning your head does not drag Larry around. Reconsider the destination
    // only after the listener has moved away, then swim there with inertia.
    if (!placed || recall || elapsed - retargeted > 1.5 && (camera.position.distanceTo(lastListener) > 1.8 || camera.position.distanceTo(creature.position) > 6)) {
      anchor.set(narrow ? -.7 : -2.5, narrow ? -1.65 : -.8, -3.6).applyQuaternion(camera.quaternion).add(camera.position);
      lastListener.copy(camera.position); retargeted = elapsed; recall = false;
      if (!placed) { creature.position.copy(anchor); placed = true; }
    }
    target.copy(anchor);
    if (!still) target.add(new THREE.Vector3(Math.sin(time * .31) * .35, Math.sin(time * .43) * .2, Math.cos(time * .27) * .22));
    steering.copy(target).sub(creature.position);
    // A short contraction supplies thrust; the long release lets water drag
    // slow the body. Slightly varying phase avoids a metronomic stroke.
    const cycle = time * 1.7 + .32 * Math.sin(time * .37);
    const stroke = still ? 0 : Math.pow(Math.max(0, Math.sin(cycle)), 4);
    steering.clampLength(0, 6);
    velocity.addScaledVector(steering, dt * (.35 + stroke * 1.6)).multiplyScalar(Math.exp(-dt * .85));
    velocity.clampLength(0, camera.position.distanceTo(creature.position) > 12 ? 6 : 2.2);
    creature.position.addScaledVector(velocity, dt);
    creature.scale.setScalar(narrow ? .7 : 1);
    creature.rotation.z += (-velocity.x * .14 - creature.rotation.z) * (1 - Math.exp(-dt * 1.5));
    creature.rotation.x += (velocity.z * .12 - creature.rotation.x) * (1 - Math.exp(-dt * 1.5));
    shell.rotation.y = still ? .2 : .2 + Math.sin(time * .23) * .18;
    const breath = still ? 1 : 1.04 - stroke * .19;
    shell.scale.set(breath, 1 + stroke * .2, breath);
    const thinking = state === 'thinking';
    core.rotation.y = still ? 0 : time * (thinking ? .7 : .12);
    core.material.opacity = thinking ? .65 : .32; grain.material.opacity = thinking ? .85 : .58;
    // Verlet chains live in world space: the bell pulls their roots while
    // inertia, drag and a gentle current carry the trailing ends independently.
    creature.updateMatrixWorld(true); inverse.copy(creature.matrixWorld).invert();
    accumulator = Math.min(accumulator + dt, .1);
    const step = 1 / 60;
    while (accumulator >= step) {
      accumulator -= step; if (!still) physicsTime += step;
      for (const arm of arms) {
        const { nodes, previous, phase, length } = arm;
        root.set(Math.cos(phase) * .22 * breath, -.23, Math.sin(phase) * .18 * breath).applyMatrix4(creature.matrixWorld);
        const spacing = length * creature.scale.x / (nodes.length - 1);
        if (!arm.ready || still) {
          for (let j = 0; j < nodes.length; j++) {
            nodes[j].copy(root); nodes[j].y -= j * spacing;
            nodes[j].x += Math.sin(phase) * j * spacing * .12;
            previous[j].copy(nodes[j]);
          }
          arm.ready = true;
        } else {
          for (let j = 1; j < nodes.length; j++) {
            const point = nodes[j]; prior.copy(point);
            delta.copy(point).sub(previous[j]).multiplyScalar(.976);
            point.add(delta);
            const t = j / (nodes.length - 1);
            point.x += (.12 * Math.sin(physicsTime * .65 + phase + t * 2) + .06 * Math.sin(physicsTime * .23)) * step * step;
            point.z += .14 * Math.cos(physicsTime * .49 + phase - t * 2) * step * step;
            point.y -= .38 * step * step;
            previous[j].copy(prior);
          }
          for (let pass = 0; pass < 8; pass++) {
            nodes[0].copy(root);
            for (let j = 1; j < nodes.length; j++) {
              delta.copy(nodes[j]).sub(nodes[j - 1]);
              const distance = delta.length();
              if (distance < 1e-8) continue;
              delta.multiplyScalar((distance - spacing) / distance);
              if (j === 1) nodes[j].sub(delta);
              else { nodes[j].addScaledVector(delta, -.5); nodes[j - 1].addScaledVector(delta, .5); }
            }
          }
        }
      }
    }
    for (const arm of arms) {
      if (!arm.ready) continue;
      const curve = new THREE.CatmullRomCurve3(arm.nodes);
      const positions = arm.line.geometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        curve.getPoint(j / (positions.count - 1), local).applyMatrix4(inverse);
        positions.setXYZ(j, local.x, local.y, local.z);
      }
      positions.needsUpdate = true; arm.line.geometry.computeBoundingSphere();
    }
    projection.copy(creature.position).project(camera);
    label.style.left = `${(projection.x + 1) * innerWidth / 2}px`; label.style.top = `${(1 - projection.y) * innerHeight / 2 + 68}px`;
    label.hidden = projection.z < -1 || projection.z > 1 || Math.abs(projection.x) > .95 || Math.abs(projection.y) > .85;
  }
  function hit(event) { pointer.set(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2); ray.setFromCamera(pointer, camera); return ray.intersectObject(hitArea, false).length > 0; }
  return { update, hit, talk: onTalk, get speed() { return velocity.length(); } };
}
