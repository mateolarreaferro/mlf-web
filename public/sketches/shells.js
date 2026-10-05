let easing = 0.005; // Easing factor for smooth transitions
let targetRotation = 0;
let currentRotation = 0;
let targetScaleFactor = 1;
let currentScaleFactor = 1;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  angleMode(DEGREES);
}

function draw() {
  background(0);
  
  let sinFrameCount = sin(frameCount);
  let cosFrameCount = cos(frameCount);
  let sinSlowFrameCount = sin(frameCount * 0.01);
  let cosSlowFrameCount = cos(frameCount * 0.01);
  
  let sineModulator = map(sinSlowFrameCount * 0.5, -1, 1, 0, 1);
  targetScaleFactor = sineModulator * 4; // Target scale with easing

  // Apply easing to the scale factor
  currentScaleFactor += (targetScaleFactor - currentScaleFactor) * easing;
  scale(currentScaleFactor);

  targetRotation = sin(frameCount * 0.001) * 100; // Target rotation with easing

  // Apply easing to the rotation factor
  currentRotation += (targetRotation - currentRotation) * easing;

  for (let i = 0; i < 60; i++) {
    drawShape(i, sinFrameCount, cosFrameCount, cosSlowFrameCount, sineModulator, currentRotation);
  }
}

function drawShape(index, sinFrameCount, cosFrameCount, cosSlowFrameCount, sineModulator, rotationFactor) {
  let gray = map(sinFrameCount, -1, 1, 50, 200);  // Shades of gray

  fill(gray, 10);  // Low alpha for transparency
  stroke(map(cosSlowFrameCount, -1, 1, 50, 255));  // Black-and-white stroke
  
  rotate(rotationFactor); // Use eased rotation

  beginShape();
  let loopVar = map(sin(frameCount * 0.001), -1, 1, 20, 60);
  createVertices(index, loopVar);
  endShape(CLOSE);
}

function createVertices(index, loopVar) {
  for (let j = 0; j < 360; j += loopVar) {
    let radio = index * 10;
    let x = radio * cos(j);
    let y = radio * sin(j);
    let z = sin(frameCount * 2 + index * 5) * 50;
    let noiseVal = noise(index * 0.06, frameCount * 0.0001);

    vertex(x * noiseVal, y * noiseVal, z);
  }
}
