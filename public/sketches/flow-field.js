var points = []; //starting points
var mult = -0.01;


function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  angleMode(DEGREES);
  
  var density = 45;
  var space = width / density;
  
  
  for (var x = 0; x < width; x += space){
    for ( var y = 0; y < height; y += space){
         var p = createVector(x + random(-10, 10), y + random(-10, 10));
    
      points.push(p);
    
    }
  }
}

function draw() {
  
  rotate(sin(frameCount * 0.06) * -90);
  noStroke();
  background(255, 0.5);
  noCursor();
  
  
  for (var i = 0; i < points.length; i++) {
    //A
    var r = map(points[i].y, 0, width, 100, 255);
    var b = map(cos(frameCount), 0, 1, 10, 205);
    var g = map(points[i].y, 0, width, 50, 255);
    
//     // B
//     var r = map(points[i].y, 0, width, 100, 255);
//     var b = map(cos(frameCount), 0, 1, 10, 205);
//     var g = map(sin(frameCount), 0, 1, 10, 100);
    

    
  
    

    
    var angle = map(noise(points[i].x * mult, points[i].y * mult, points[i].y * mult), 0, 1, 0, 360);
    
    fill(g, b, r);
    
    points[i].add(createVector((-1) * -sin(angle) * noise(0.01, 0.9), sin(angle)))
    
    
    
    
    ellipse(points[i].x, points[i].y, -cos(frameCount) * 0.7);

  
    
    
  }
}
