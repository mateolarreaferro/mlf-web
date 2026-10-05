// Variables
let particles = []; // Array of vectors for particles
const numParticles = 9000;
const noiseScale = 0.01;

// We'll keep the random color-change timing
let lastChangeTime = 0;
let changeInterval;

// Pastel color array
let pastelColors = [];

// For color transitions
let colorStart;             // { r, g, b }
let colorEnd;               // { r, g, b }
let transitionStartTime = 0;
let transitionEndTime   = 0;

// --- NEW: margins for "virtual" canvas bigger than the actual window
let marginFactor = 0.2; // 20% bigger on each side
let spawnMinX, spawnMaxX, spawnMinY, spawnMaxY;
let resetMargin = 100;  // how far off-screen before resetting?

function setup() {
  createCanvas(windowWidth, windowHeight);
  
  // Calculate the bigger bounding box for spawning and keeping particles
  spawnMinX = -width * marginFactor;
  spawnMaxX = width  + width  * marginFactor;
  spawnMinY = -height * marginFactor;
  spawnMaxY = height + height * marginFactor;

  initializeParticles();
  changeInterval = getRandomInterval();
  initializePastelColors();

  // Set our initial colors to something from the palette
  colorEnd = randomPastelColor();
  // Start and end both match initially
  colorStart = { r: colorEnd.r, g: colorEnd.g, b: colorEnd.b };

  // Initialize the transition times
  transitionStartTime = millis();
  transitionEndTime   = transitionStartTime + changeInterval;
}

function draw() {
  noCursor();
  // Very light alpha so that old lines remain as trails
  background(0, 5);

  // Simulated camera transforms
  push();
  applyCameraTransform();

  // --- COLOR INTERPOLATION ---
  let t = (millis() - transitionStartTime) / (transitionEndTime - transitionStartTime);
  t = constrain(t, 0, 1);

  let r = lerp(colorStart.r, colorEnd.r, t);
  let g = lerp(colorStart.g, colorEnd.g, t);
  let b = lerp(colorStart.b, colorEnd.b, t);
  stroke(r, g, b, 200);

  // --- UPDATE PARTICLES ---
  updateAndDisplayParticles();

  pop();

  // --- CHECK FOR NEW COLOR / NOISE SEED ---
  checkAndChangeNoiseAndColor();
}

/**
 * Apply a 2D "camera" transform that never zooms out below 100% (scale=1),
 * and pans slightly, but avoids revealing edges too much.
 */
function applyCameraTransform() {
  let elapsed = millis() * 0.0002;

  // Zoom will oscillate between minZoom and maxZoom
  let minZoom = 1.0;
  let maxZoom = 1.2;
  // Convert sin() range [-1..1] => [0..1]
  let normalizedSin = (sin(elapsed) + 1) / 2;
  // Interpolate between minZoom and maxZoom
  let zoom = lerp(minZoom, maxZoom, normalizedSin);

  // Keep pan small so we don't see edges
  let panAmpX = 60;
  let panAmpY = 60;
  let offsetX = panAmpX * cos(elapsed * 0.7);
  let offsetY = panAmpY * sin(elapsed * 1.2);

  // Center the transform, apply scale, then shift
  translate(width / 2, height / 2);
  scale(zoom);
  translate(-width / 2 + offsetX, -height / 2 + offsetY);
}

/**
 * Spawn particles within a *larger* region than just [0..width, 0..height].
 * This helps ensure there are particles beyond the edges.
 */
function initializeParticles() {
  for (let i = 0; i < numParticles; i++) {
    let x = random(spawnMinX, spawnMaxX);
    let y = random(spawnMinY, spawnMaxY);
    particles.push(createVector(x, y));
  }
}

function updateAndDisplayParticles() {
  for (let i = 0; i < numParticles; i++) {
    let oldPos = particles[i].copy();
    updateParticlePosition(particles[i]);

    // Draw continuous lines
    strokeWeight(1);
    line(oldPos.x, oldPos.y, particles[i].x, particles[i].y);

    resetParticleIfTooFarOffScreen(particles[i]);
  }
}

function updateParticlePosition(particle) {
  let noiseValue = noise(particle.x * noiseScale, particle.y * noiseScale);
  let angle = TAU * noiseValue;
  // Move according to the noise angle
  particle.x += sin(angle);
  particle.y += cos(angle);
}

/**
 * Instead of resetting as soon as a particle is off the screen,
 * we allow some margin (resetMargin). 
 * So only if it goes *well* beyond the visible area do we reset it.
 */
function resetParticleIfTooFarOffScreen(particle) {
  if (
    particle.x < -resetMargin ||
    particle.x > width + resetMargin ||
    particle.y < -resetMargin ||
    particle.y > height + resetMargin
  ) {
    // Respawn it somewhere in the larger bounding box.
    particle.x = random(spawnMinX, spawnMaxX);
    particle.y = random(spawnMinY, spawnMaxY);
  }
}

// The rest remains the same ...

function checkAndChangeNoiseAndColor() {
  let currentTime = millis();
  if (currentTime - lastChangeTime > changeInterval) {
    changeNoiseSeed();
    changeStrokeColor();
    lastChangeTime = currentTime;
    changeInterval = getRandomInterval();

    // Update the transition times
    transitionStartTime = currentTime;
    transitionEndTime   = currentTime + changeInterval;
  }
}

function changeNoiseSeed() {
  noiseSeed(millis() / 2);
}

function changeStrokeColor() {
  // Current end becomes our new start
  colorStart = { r: colorEnd.r, g: colorEnd.g, b: colorEnd.b };
  // Pick a new random color
  colorEnd   = randomPastelColor();
}

// Utility: pick a random color from the palette
function randomPastelColor() {
  let idx = floor(random(pastelColors.length));
  return pastelColors[idx];
}

// Random time interval for color/noise changes
function getRandomInterval() {
  return random(2000, 5000);
}

function initializePastelColors() {
  pastelColors = [
    { r: 239, g: 222, b: 205 }, // Tuscan Sun (light yellow)
    { r: 229, g: 214, b: 169 }, // Sand (light beige)
    { r: 221, g: 190, b: 169 }, // Peach (muted pink)
    { r: 202, g: 164, b: 114 }, // Terracotta (muted orange)
    { r: 174, g: 208, b: 192 }, // Sage (soft green)
    { r: 152, g: 193, b: 190 } // Aqua (muted teal)
  ];
}
