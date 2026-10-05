let particles = [];
let numParticles = 500; // Total number of particles
let globalRotation = 0; // For overall scene rotation

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  angleMode(DEGREES);

  // Initialize particles
  for (let i = 0; i < numParticles; i++) {
    particles.push(new Particle());
  }
}

function draw() {
  // Black background, no grayscale
  background(0);

  // Global scene rotation for depth
  globalRotation += 0.05;
  rotateX(globalRotation * 0.5);
  rotateY(globalRotation);

  // Update and display each particle
  for (let p of particles) {
    p.update();
    p.display();
  }
}

class Particle {
  constructor() {
    // Start with a random angle, radius, and depth
    this.angle = random(360);
    this.radius = random(50, width * 0.4);
    this.z = random(-500, 500);

    // Noise offsets for swirling behaviors
    this.noiseAngle = random(1000);
    this.noiseRadius = random(1000);
    this.noiseZ = random(1000);

    // Fixed size for each particle
    this.size = random(2, 5);
  }

  update() {
    // Swirl the angle slightly
    this.angle += map(noise(this.noiseAngle), 0, 1, -1, 1);

    // Expand/contract the radius subtly
    this.radius += map(noise(this.noiseRadius), 0, 1, -0.5, 0.5);
    // Constrain radius so it doesn't get too big or negative
    this.radius = constrain(this.radius, 20, width * 0.4);

    // Move in Z using Perlin noise
    this.z += map(noise(this.noiseZ), 0, 1, -2, 2);
    if (this.z > 500) this.z = -500;
    if (this.z < -500) this.z = 500;

    // Convert from polar to Cartesian coordinates
    this.x = this.radius * cos(this.angle);
    this.y = this.radius * sin(this.angle);

    // Increment noise offsets for smooth swirling
    this.noiseAngle += 0.01;
    this.noiseRadius += 0.01;
    this.noiseZ += 0.01;
  }

  display() {
    // Pure white spheres on black background; no grayscale
    fill(255);
    noStroke();
    push();
    translate(this.x, this.y, this.z);
    sphere(this.size);
    pop();
  }
}
