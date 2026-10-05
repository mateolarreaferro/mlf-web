let shapeMultiplier = 50;
let numOfShapes = 20;
let frameCountMultiplier = 0.0005;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
}

function draw() {
  background(0);
  
  // VARIABLE UPDATE
  let fcInterpolation = sin(frameCount * frameCountMultiplier);
  let scaleVariability = fcInterpolation * shapeMultiplier;
  let clampedScale = map(scaleVariability, -shapeMultiplier, shapeMultiplier, 10, shapeMultiplier);
  
  noStroke();
  
  for (let i = 0; i < numOfShapes; i++) {
    let hueValue = map(sin(fcInterpolation + i * 0.1), -1, 1, 0, 200);
    let brightnessValue = map(i, 0, numOfShapes, 0, 100); 
    
    fill(hueValue, 100, brightnessValue, 10);
    ellipse(windowWidth / 2, windowHeight / 2, clampedScale * i, clampedScale * i);
  } 
}
