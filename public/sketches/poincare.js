let r = 450;
let k = 3; // number of sides per tile
let angleOffset = 0;

// For zoom automation with easing:
let currentZoom = 5;

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Switch to HSB mode for richer color modulation:
  colorMode(HSB, 360, 100, 100, 255);
}

function draw() {
  // A dark (black) background with a slight alpha to leave trails:
  background(0, map(sin(frameCount * 0.01), -1, 1, 5, 20));
  translate(width / 2, height / 2);

  // Global rotation for extra flow:
  rotate(sin(frameCount * 0.005) * 0.3);

  // Compute a more dynamic zoom factor that combines two oscillations:
  let targetZoom = 1 + 0.1 * sin(frameCount * 0.02) + 0.05 * cos(frameCount * 0.015);
  // Smooth easing toward the target zoom:
  currentZoom = lerp(currentZoom, targetZoom, 0.05);
  scale(currentZoom);

  drawPoincareDisk();
  hyperbolicTessellation(0, 0, r, 0);

  // Slowly update the rotation offset for the tiles:
  angleOffset += 0.005;
}

function drawPoincareDisk() {
  // A soft stroke for the disk’s boundary (a light blue-ish tone):
  stroke(240, 50, 100, 150);
  noFill();
  ellipse(0, 0, 2 * r);
}

function hyperbolicTessellation(x, y, radius, depth) {
  // Stop recursing when the tile is too small or after a set recursion depth:
  if (radius < 5 || depth > 5) return;

  let angle = TWO_PI / k;
  let newRadius = radius * 0.5;

  push();

  // Get a dynamically modulated color based on the current depth and time:
  let c = getColorAtDepth(depth);
  stroke(c);
  // Use a slightly more transparent version for the fill to enhance overlapping trails:
  let f = color(hue(c), saturation(c), brightness(c), alpha(c) * 0.66);
  fill(f);
  strokeWeight(1);

  // Draw the polygon tile:
  beginShape();
  for (let i = 0; i < k; i++) {
    let vx = x + radius * cos(angle * i + angleOffset);
    let vy = y + radius * sin(angle * i + angleOffset);
    vertex(vx, vy);
  }
  endShape(CLOSE);

  // Recurse at each vertex (offset by half the radius and shifted angle):
  for (let i = 0; i < k; i++) {
    let nx = x + newRadius * cos(angle * i + angle / 2 + angleOffset);
    let ny = y + newRadius * sin(angle * i + angle / 2 + angleOffset);
    hyperbolicTessellation(nx, ny, newRadius, depth + 1);
  }
  pop();
}

// This function returns a color whose hue, saturation, brightness, and alpha
// all oscillate over time (and differ with each recursion depth)
function getColorAtDepth(depth) {
  // Base hue drifts over time and shifts per depth:
  let baseHue = (frameCount * 0.5 + depth * 40) % 360;
  // Saturation oscillates (values roughly between 50 and 100):
  let sat = 75 + 25 * sin(frameCount * 0.02 + depth);
  // Brightness oscillates (values roughly between 60 and 100):
  let bri = 80 + 20 * cos(frameCount * 0.015 + depth);
  // Alpha modulation for dynamic transparency (values roughly between 45 and 255):
  let a = 150 + 105 * sin(frameCount * 0.03 + depth);
  return color(baseHue, sat, bri, a);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
