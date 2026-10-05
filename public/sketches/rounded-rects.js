function setup() {
  createCanvas(windowWidth, windowHeight);
  angleMode(DEGREES);
  rectMode(CENTER);
}

function draw() {
  background(0, 5);
  noFill();
  strokeWeight(0.01);
  
  translate(width/2, height/2);
  rotate(sin(frameCount * 0.1)  * 250);
  
  stroke(0, 150, map(sin(frameCount * 0.01), -1, 1, 100, 160));
  
  for (var i = 0; i < 200; i++){
    push();
    rotate(cos(frameCount + i) * 250);
    scale(sin(frameCount * 0.1) * 5);
    rect(0, 0, 650 - i * 3, 500 - i * 3, i + 100);
    pop();
  }
}
