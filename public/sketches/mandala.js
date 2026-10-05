function setup() {
  createCanvas(windowWidth, windowHeight);
  // Use angleMode(DEGREES) for easier rotational calculations
  angleMode(DEGREES);
  noStroke(); 
}

function draw() {
  background(0, 6); // A dark background helps bright colors stand out
  
  // Move the origin to the center of the canvas
  translate(width / 2, height / 2);
  scale(map(sin(frameCount * 0.1), -1, 1, 0.5, 1.5))

  // Number of segments in the radial symmetry
  let segments = 12;
  
  // How many layers of nested patterns
  let layers = 24; 

  // Loop through multiple layers
  for (let layer = 1; layer <= layers; layer++) {
    
    // Draw symmetrical shapes for each segment
    for (let i = 0; i < segments; i++) {
      push();
      
      // Rotation for each segment, plus slow rotation over time
      rotate(i * (360 / segments) + frameCount * 0.01 * layer);
      
      // Distance from the center for this layer
      let radius = 50 * layer;
      
      // We’ll map a color based on sin of the frameCount
      let colorFactor = sin(frameCount * 0.02 + layer) * 0.5 + 0.5;
      
      // Interpolate between two colors for a psychedelic vibe
      fill(lerpColor(color('#FF00FF'), color('#00FFFF'), colorFactor));
      
      // Draw the shape
      let sizeMod = map(cos(frameCount * 0.1), -1, 1, 10, 40);
      ellipse(radius, 0, sizeMod, sizeMod);
      
      pop();
    }
  }
}
