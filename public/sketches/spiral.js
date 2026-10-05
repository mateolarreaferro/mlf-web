const speedFactor = 0.0008;
const pulseFactor = 0.01;

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

function draw() {
  background(TAU, TAU);
  translate(width / 2, height / 2);

  const t = frameCount * speedFactor;
  const cutoff = TAU * 20;

  const baseSegment = TAU / 2;

  for (let i = 0; i <= cutoff; i++) {
    // Compute radius and angle
    const baseRadius = (i + 1) * baseSegment * 0.8;
    const pulse      = cos(t + i) * baseSegment * pulseFactor;
    const radius     = baseRadius + pulse;
    const angle      = t * 0.4 * (i + 1);

    const x = sin(angle) * radius;
    const y = cos(angle) * radius;

    if (abs(x) > width / 2 || abs(y) > height / 2) {
      break;
    }

    const r = map(sin(angle), -1, 1, 0, 255);
    const g = map(cos(angle), -1, 1, 0, 255);
    const b = map(sin(t),     -1, 1, 0, 255);

    fill(r, g, b, 220);

    const diameter = radius / baseSegment;
    ellipse(x, y, diameter, diameter);
  }
}
