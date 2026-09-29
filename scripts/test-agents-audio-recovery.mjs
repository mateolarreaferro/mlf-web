// Regression: browser suspension must not become a user mute or restart existing voices.
import { chromium } from 'playwright-core';
if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a Chromium executable.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-webgl']});
try{
const page=await browser.newPage({viewport:{width:1440,height:960}}); page.setDefaultTimeout(30000); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
await page.goto(process.env.AGENTS_URL || 'http://localhost:3001/agents');
await page.getByRole('button',{name:'join as guest'}).click();
await page.getByRole('button',{name:'enter with sound',exact:false}).click();
await page.waitForFunction(()=>agentsWorld.sound.state==='on',null,{timeout:90000});
await page.evaluate(()=>{window.savedSource=[...agentsWorld.sound.scene.engine.tracks.values()].find(t=>t.statement.sourceId==='mateo_drone').sourceNode;});
for(let i=0;i<3;i++){
 await page.evaluate(()=>agentsWorld.sound.scene.engine.audioContext.suspend());
 await page.waitForFunction(()=>agentsWorld.sound.state==='on',null,{timeout:5000});
}
await page.evaluate(async()=>{await agentsWorld.sound.scene.engine.audioContext.suspend();document.querySelector('#nav-sound').click();});
await page.waitForFunction(()=>agentsWorld.sound.state==='on',null,{timeout:5000});
const preserved=await page.evaluate(()=>savedSource===[...agentsWorld.sound.scene.engine.tracks.values()].find(t=>t.statement.sourceId==='mateo_drone').sourceNode);
if(!preserved)throw Error('Recovery restarted voices');
await page.locator('#nav-sound').click();await page.waitForTimeout(1500);
if(await page.evaluate(()=>agentsWorld.sound.state)!=='off')throw Error('Mute did not stick');
await page.locator('#nav-sound').click();await page.waitForFunction(()=>agentsWorld.sound.state==='on');
for(let i=0;i<20;i++){await page.waitForTimeout(1000);if(await page.evaluate(()=>agentsWorld.sound.state)!=='on')throw Error('Playback stopped');}
console.log(JSON.stringify({interruptionsRecovered:3,resumeClick:true,preservedVoices:preserved,explicitMute:true,continuousSeconds:20,errors}));
}finally{await browser.close();}
