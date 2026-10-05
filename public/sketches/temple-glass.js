const speedFactor = 0.18;
const pulseFactor = 10;

const TEMPLE_GLASS = {
  azure: [70, 190, 255],
  lilac: [190, 150, 255],
  mint:  [150, 255, 220],
  peach: [255, 200, 160]
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

function draw() {
  background(0, 0, sin(frameRate() * 0.01) * 100, 5 * sin(frameRate() * 0.01));
  translate(width / 2, height / 2);

  scale(25 * sin(frameRate() * 0.001));
  const t = frameCount * speedFactor;
  const cutoff = TAU * 100;

  const baseSegment = TAU / 2;

  for (let i = 0; i <= cutoff; i++) {
    const baseRadius = (i + 1) * baseSegment * 0.8;
    const pulse      = cos(t + i) * baseSegment * pulseFactor;
    const radius     = baseRadius + pulse;
    const angle      = t * 0.1 * (i + 1);

    const x = sin(angle) * radius;
    const y = cos(angle) * radius;

    if (abs(x) > width / 2 || abs(y) > height / 2) {
      break;
    }

    const u = 0.5 + 0.5 * sin(angle * 0.7 + t * 0.9);
    const v = 0.5 + 0.5 * cos(t * 1.3 + i * 0.12);
    const w = 0.5 + 0.5 * sin(t * 0.8 + i * 0.05);

    const r =
      (1 - u) * TEMPLE_GLASS.azure[0] + u * TEMPLE_GLASS.lilac[0] +
      0.55 * v * (TEMPLE_GLASS.mint[0] - TEMPLE_GLASS.azure[0]) +
      0.45 * w * (TEMPLE_GLASS.peach[0] - TEMPLE_GLASS.lilac[0]);

    const g =
      (1 - u) * TEMPLE_GLASS.azure[1] + u * TEMPLE_GLASS.lilac[1] +
      0.55 * v * (TEMPLE_GLASS.mint[1] - TEMPLE_GLASS.azure[1]) +
      0.45 * w * (TEMPLE_GLASS.peach[1] - TEMPLE_GLASS.lilac[1]);

    const b =
      (1 - u) * TEMPLE_GLASS.azure[2] + u * TEMPLE_GLASS.lilac[2] +
      0.55 * v * (TEMPLE_GLASS.mint[2] - TEMPLE_GLASS.azure[2]) +
      0.45 * w * (TEMPLE_GLASS.peach[2] - TEMPLE_GLASS.lilac[2]);

    stroke(255);
    let mod = 0.1 * sin(frameRate() * 0.0001);
    strokeWeight(mod);
    fill(r, g, b, 5);

    const diameter = radius / baseSegment;
    ellipse(x, y, diameter, diameter);
  }
}
