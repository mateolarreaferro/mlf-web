

// Color Pallete

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  noFill();
  t = 0;
}

function draw() {
  translate(width/2, height/2);
  beginShape();
  
  rotate(sin(frameCount * 0.001) * 10);
  scale(sin(frameCount * 0.001) * 1);
  
  let sizeVal = sin(frameCount * 0.005) * 70;
  
  
  stroke(255, 255, 220);
  
  
  for (var i = 0; i < 300; i+= 20) {
    var ang = map(i, 0, 300, 0, TWO_PI);
    var rad = 300 * noise(i * 0.01, t * 0.05);
    var x = rad * sin(ang);
    var y = rad * cos(ang);
    
    strokeWeight(0.01 + sin(frameCount * 0.01) * 0.00005);
    //vertex(x, y);
    
    triangle(x, width/2, y, height/2, x + x, y + y);
  }
  endShape(CLOSE);

  t += 1;

}
