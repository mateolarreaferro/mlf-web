var t;


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
  
  let sizeVal = sin(frameCount * 0.005) * 100;
  
  //stroke(255, 233, 0);
  stroke(255, 255, 247);
  
  
  for (var i = 0; i < 800; i+= 20) {
    var ang = map(i, 0, 800, 0, TWO_PI);
    var rad = 800 * noise(i * 0.01, t * 0.005);
    var x = rad * sin(ang);
    var y = rad * cos(ang);
    
    strokeWeight(0.03);
    ellipse(x, y, sizeVal, sizeVal);
  }
  endShape(CLOSE);

  t += 1;

}
