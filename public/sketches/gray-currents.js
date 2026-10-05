let particles = [];
const numParticles = 1000;

// We'll continue to animate noiseScale, but let's also allow for easing if desired:
let noiseScale = 0.1;

let lastChangeTime = 0;
let changeInterval;

let shadesOfBlack = [];
let colorStart;
let colorEnd;
let transitionStartTime = 0;
let transitionEndTime = 0;

let marginFactor = 0.2;
let spawnMinX, spawnMaxX, spawnMinY, spawnMaxY;
let resetMargin = 100;

// Additional animation parameters
let minStrokeWeight = 0.5;
let maxStrokeWeight = 2;
let minEllipseSize = 5;
let maxEllipseSize = 15;

function setup() {
  createCanvas(windowWidth, windowHeight);

  spawnMinX = -width * marginFactor;
  spawnMaxX = width + width * marginFactor;
  spawnMinY = -height * marginFactor;
  spawnMaxY = height + height * marginFactor;

  initializeParticles();
  initializeShadesOfBlack();
  changeInterval = getRandomInterval();

  // Start with a random gray shade
  colorEnd = randomShadeOfBlack();
  colorStart = { r: colorEnd.r, g: colorEnd.g, b: colorEnd.b };

  transitionStartTime = millis();
  transitionEndTime = transitionStartTime + changeInterval;

  noiseSeed(millis() / 5);
}

function draw() {
  noCursor();
  // Black background with slight alpha for trailing
  background(0, 5);

  push();
  applyCameraTransform();

  // -- 1. Eased color transition --

  // Calculate normalized time for the transition
  let t = (millis() - transitionStartTime) / (transitionEndTime - transitionStartTime);
  t = constrain(t, 0, 1);

  // Use our custom easing function
  let easedT = easeInOutQuad(t);

  let r = lerp(colorStart.r, colorEnd.r, easedT);
  let g = lerp(colorStart.g, colorEnd.g, easedT);
  let b = lerp(colorStart.b, colorEnd.b, easedT);

  // -- 2. Eased stroke weight + ellipse size --

  // We’re still using sin() for variety, but we’ll apply easing to that 0–1 range.
  let ratio = (sin(frameCount * 0.01) + 1) / 2;      // converts -1..1 to 0..1
  let easedRatio = easeInOutQuad(ratio);            // apply easing

  let animatedStrokeWeight = lerp(minStrokeWeight, maxStrokeWeight, easedRatio);
  let animatedEllipseSize  = lerp(minEllipseSize, maxEllipseSize, easedRatio);

  // Animate noiseScale if you like, or keep it purely sinusoidal:
  noiseScale = map(sin(frameCount * 0.001), -1, 1, 0.0005, 0.002);

  stroke(r, g, b, 200);
  strokeWeight(animatedStrokeWeight);

  updateAndDisplayParticles(animatedEllipseSize);

  pop();

  // Transition logic
  checkAndChangeNoiseAndColor();
}

// -- 3. Eased camera transform (zoom) --
function applyCameraTransform() {
  let elapsed = millis() * 0.0002;

  let minZoom = 1.0;
  let maxZoom = 1.2;

  // Previously we used a simple (sin(elapsed)+1)/2; let's keep that wave
  // but then run *that* through our easing function for a smoother in/out.
  let wave = (sin(elapsed) + 1) / 2;
  let easedZoom = easeInOutQuad(wave);
  let zoom = lerp(minZoom, maxZoom, easedZoom);

  let panAmpX = 60;
  let panAmpY = 60;
  let offsetX = panAmpX * cos(elapsed * 0.7);
  let offsetY = panAmpY * sin(elapsed * 1.2);

  translate(width / 2, height / 2);
  scale(zoom);
  translate(-width / 2 + offsetX, -height / 2 + offsetY);
}

function initializeParticles() {
  for (let i = 0; i < numParticles; i++) {
    let x = random(spawnMinX, spawnMaxX);
    let y = random(spawnMinY, spawnMaxY);
    particles.push(createVector(x, y));
  }
}

function updateAndDisplayParticles(ellipseSize) {
  for (let i = 0; i < particles.length; i++) {
    let oldPos = particles[i].copy();
    updateParticlePosition(particles[i]);

    line(oldPos.x, oldPos.y, particles[i].x, particles[i].y);

    // Subtle ellipse
    push();
    noFill();
    strokeWeight(1);
    stroke(200, 200, 200, 50); // Light gray for a bit of contrast
    ellipse(particles[i].x, particles[i].y, ellipseSize, ellipseSize);
    pop();

    resetParticleIfTooFarOffScreen(particles[i]);
  }
}

function updateParticlePosition(particle) {
  let noiseValue = noise(particle.x * noiseScale, particle.y * noiseScale);
  let angle = TAU * noiseValue;
  let speed = 1.0;
  particle.x += sin(angle) * speed;
  particle.y += cos(angle) * speed;
}

function resetParticleIfTooFarOffScreen(particle) {
  if (
    particle.x < -resetMargin ||
    particle.x > width + resetMargin ||
    particle.y < -resetMargin ||
    particle.y > height + resetMargin
  ) {
    particle.x = random(spawnMinX, spawnMaxX);
    particle.y = random(spawnMinY, spawnMaxY);
  }
}

// Easing-enabled color and noise transitions
function checkAndChangeNoiseAndColor() {
  let currentTime = millis();
  if (currentTime - lastChangeTime > changeInterval) {
    changeNoiseSeed();
    changeStrokeColor();

    lastChangeTime = currentTime;
    changeInterval = getRandomInterval();

    transitionStartTime = currentTime;
    transitionEndTime = currentTime + changeInterval;
  }
}

function changeNoiseSeed() {
  noiseSeed(millis() / 5);
}

function changeStrokeColor() {
  colorStart = { r: colorEnd.r, g: colorEnd.g, b: colorEnd.b };
  colorEnd = randomShadeOfBlack();
}

function getRandomInterval() {
  return random(4000, 5000);
}

function initializeShadesOfBlack() {
  shadesOfBlack = [
    { r: 0,   g: 0,   b: 0   },
    { r: 50,  g: 50,  b: 50  },
    { r: 100, g: 100, b: 100 },
    { r: 150, g: 150, b: 150 },
    { r: 200, g: 200, b: 200 }
  ];
}

function randomShadeOfBlack() {
  let idx = floor(random(shadesOfBlack.length));
  return shadesOfBlack[idx];
}

// ----------------------------------
// EASING FUNCTION
// ----------------------------------
function easeInOutQuad(t) {
  // t expected in [0..1]
  // This creates a smooth acceleration and deceleration.
  return t < 0.5
    ? 2 * t * t
    : 1 - pow(-2 * t + 2, 2) / 2;
}
