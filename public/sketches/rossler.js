let a = 0.4;
let b = 0.2;
let c = 5.7;

let a2 = 0.18;
let b2 = 0.12;
let c2 = 9.2;

let dt = 0.015;

let x, y, z;
let x2, y2, z2;

let points = [];
let points2 = [];
let maxPoints = 600;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  colorMode(HSB, 360, 100, 100, 100);

  perspective(PI / 3, width / height, 0.1, 10000);

  x = random(-5, 5) || 0.01;
  y = random(-5, 5) || 0.01;
  z = random(0, 5) || 0.01;

  x2 = random(8, 14);
  y2 = random(-8, -3);
  z2 = random(1, 8);
}

function draw() {
  background(0, 0, 0);

  orbitControl();

  updateRossler(points, "first");
  updateRossler(points2, "second");

  push();
  scale(16);
  rotateX(PI / 2.4);
  rotateZ(frameCount * 0.0015);

  drawAttractor(points, true);

  push();
  rotateY(PI / 3);
  rotateZ(-PI / 8);
  scale(0.75);
  drawAttractor(points2, false);
  pop();

  pop();
}

function updateRossler(points, type) {
  let dx, dy, dz;

  if (type === "first") {
    dx = -y - z;
    dy = x + a * y;
    dz = b + z * (x - c);

    x += dx * dt;
    y += dy * dt;
    z += dz * dt;

    if (isFinite(x) && isFinite(y) && isFinite(z)) {
      points.push(createVector(x, y, z));
    }
  } else if (type === "second") {
    dx = -y2 - z2;
    dy = x2 + a2 * y2;
    dz = b2 + z2 * (x2 - c2);

    x2 += dx * dt;
    y2 += dy * dt;
    z2 += dz * dt;

    if (isFinite(x2) && isFinite(y2) && isFinite(z2)) {
      points.push(createVector(x2, y2, z2));
    }
  }

  if (points.length > maxPoints) {
    points.shift();
  }
}

function drawAttractor(points, useColor) {
  for (let i = 0; i < points.length; i++) {
    let p = points[i];
    if (!p) continue;

    let t = i / max(1, points.length - 1);

    if (useColor) {
      let hue = map(t, 0, 1, 25, 80);
      stroke(hue, 95, 100, map(t, 0, 1, 10, 100));
    } else {
      let hue = map(t, 0, 1, 190, 240);
      stroke(hue, 90, 100, map(t, 0, 1, 8, 85));
    }

    let dynamicWeight = map(
      sin(frameCount * 0.015 + i * 0.02),
      -1,
      1,
      2,
      10
    );

    strokeWeight(dynamicWeight);
    point(p.x, p.y, p.z);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  perspective(PI / 3, width / height, 0.1, 10000);
}
