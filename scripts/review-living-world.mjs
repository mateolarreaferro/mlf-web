import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.AGENTS_URL || 'http://127.0.0.1:3001/agents/';
const out = process.env.ECOSYSTEM_OUTPUT || '/private/tmp/agents-ecosystem';
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/Users/mateolarreaferro/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=document-user-activation-required']});
try {
 for(const mobile of [false,true]) {
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource:'))errors.push(m.text())});
  const audioRequests=[];page.on('request',r=>{if(r.url().includes('/satie/'))audioRequests.push(r.url())});
  await page.goto(base);
  assert.equal(await page.evaluate(()=>!!window.agentsWorld),false,'no world before entry choice');
  await page.click('#entrance-guest');
  await page.locator('#entrance-audio').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>!!window.agentsWorld),false,'role selection does not load world or audio');
  assert.deepEqual(audioRequests,[],'no audio assets before opting in');
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-entry.png`});
  await page.click(mobile?'#entrance-quiet':'#entrance-audio');
  if(!mobile)await page.locator('#entrance-progress').waitFor({state:'visible'});
  await page.locator('#entrance').waitFor({state:'hidden',timeout:120000});
  await page.waitForFunction(()=>window.agentsWorld?.world);
  assert.ok(await page.locator('#notes-button').isVisible(),'guests have notes in navigation');
  await page.click('#notes-button');
  await page.locator('#notes-close').waitFor({state:'visible'});
  assert.equal(await page.locator('#notes-add').isVisible(),false);
  await page.click('#notes-close');
  if(mobile){
   assert.equal(await page.evaluate(()=>agentsWorld.sound.scene),null,'quiet entry downloads no audio');
   await page.click('#nav-sound');
   await page.waitForFunction(()=>agentsWorld.sound.state==='on',null,{timeout:120000});
  }
  assert.equal(await page.evaluate(()=>agentsWorld.sound.scene.engine.isPlaying),true);
  const memory=await page.evaluate(()=>{const e=agentsWorld.sound.scene.engine;return {rate:e.audioContext.sampleRate,bytes:[...new Set(e.getAudioBuffers().values())].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0)}});
  assert.equal(memory.rate,24000);assert.ok(memory.bytes<320*1024*1024,'decoded audio fits the smaller memory budget');
  await page.waitForFunction(()=>agentsWorld.sound.diagnostics().outputRms>0.00001,null,{timeout:30000});
  const first=await page.evaluate(()=>({eco:agentsWorld.world.ecosystem.snapshot(),stone:agentsWorld.world.stones[0].points.rotation.y,time:agentsWorld.world.stones[0].points.material.uniforms.uTime.value}));
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-world.png`});
  await page.waitForFunction(before=>agentsWorld.world.stones[0].points.material.uniforms.uTime.value>before+2,first.time,{timeout:30000});
  const last=await page.evaluate(()=>({eco:agentsWorld.world.ecosystem.snapshot(),stone:agentsWorld.world.stones[0].points.rotation.y,audio:agentsWorld.sound.diagnostics()}));
  assert.ok(Math.abs(last.stone-first.stone)>0.1,'attractors visibly move');
  await page.screenshot({path:`${out}/${mobile?'mobile':'desktop'}-evolved.png`});
  await page.click('#nav-sound'); await page.waitForFunction(()=>agentsWorld.sound.state==='off');
  await page.mouse.click(200,400); assert.equal(await page.evaluate(()=>agentsWorld.sound.diagnostics().wanted),false,'navigation cannot undo explicit mute');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  writeFileSync(`${out}/${mobile?'mobile':'desktop'}-report.json`,JSON.stringify({first,last,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log(mobile?'Mobile: quiet entry, audio enable, guest notes, evolving world passed.':'Desktop: pre-load audio unlock, real audio output, guest notes, evolving world passed.');
  await page.close();
 }
 // Recover from a real loading error; the retry must construct a fresh engine.
 const page=await browser.newPage();let fail=true;
 await page.route('**/satie/scene.contract.json',route=>fail?route.fulfill({status:503,body:'offline'}):route.continue());
 await page.goto(base);await page.click('#entrance-guest');await page.click('#entrance-audio');
 await page.waitForFunction(()=>window.agentsWorld?.sound.state==='unavailable');
 assert.equal(await page.locator('#entrance-audio').isEnabled(),true);
 fail=false;await page.click('#entrance-audio');
 await page.locator('#entrance').waitFor({state:'hidden',timeout:120000});
 assert.equal(await page.evaluate(()=>agentsWorld.sound.scene.engine.isPlaying),true);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 assert.notEqual(await page.evaluate(()=>agentsWorld.sound.scene.engine.audioContext.state),'closed','back navigation preserves the context');
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.waitForFunction(()=>agentsWorld.sound.state==='on');
 console.log('Audio failure → retry → real playback, and back-navigation context preservation passed.');
 await page.close();
 const reduced=await browser.newPage({reducedMotion:'reduce'});
 await reduced.route('**/api/agents-weather',r=>r.fulfill({status:503,contentType:'application/json',body:'{\"source\":\"unavailable\"}'}));
 await reduced.goto(base);await reduced.click('#entrance-guest');await reduced.click('#entrance-quiet');
 await reduced.locator('#entrance').waitFor({state:'hidden'});
 await reduced.waitForFunction(()=>document.getElementById('ecosystem-weather').textContent.includes('simulated tide'));
 const freeze=await reduced.evaluate(async()=>{const w=agentsWorld.world;const before=w.stones[0].points.material.uniforms.uTime.value;const state=JSON.stringify(w.ecosystem.state);await new Promise(r=>setTimeout(r,700));return {time:before===w.stones[0].points.material.uniforms.uTime.value,state:state===JSON.stringify(w.ecosystem.state)}});
 assert.deepEqual(freeze,{time:true,state:true});
 assert.equal(await reduced.locator('#notes-button').isVisible(),true);
 await reduced.close();console.log('Offline weather fallback and reduced-motion world passed.');
}finally{await browser.close()}
