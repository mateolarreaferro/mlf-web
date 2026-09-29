// Regression: panel fades and a failed transient voice must not stop the soundscape.
import { chromium } from 'playwright-core';
if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-angle=swiftshader','--enable-webgl']});
try{
const page=await browser.newPage({viewport:{width:1440,height:960}}); page.setDefaultTimeout(30000); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
await page.goto(process.env.AGENTS_URL || 'http://localhost:3001/agents');
await page.getByRole('button',{name:'join as guest'}).click();
await page.getByRole('button',{name:'enter with sound',exact:false}).click();
await page.waitForFunction(()=>agentsWorld.sound.state==='on',null,{timeout:90000});
await page.evaluate(()=>{
 window.trimFaultInjected=false; const original=AudioNode.prototype.disconnect;
 AudioNode.prototype.disconnect=function(...args){if(!window.trimFaultInjected && args[0] instanceof GainNode){window.trimFaultInjected=true;throw new DOMException('Simulated expiring voice connection','InvalidAccessError');}return original.apply(this,args);};
});
for(let i=0;i<24;i++){
 await page.getByRole('tab',{name:i%2?'notes':'larry',exact:true}).click();
 if(i%2===0)await page.locator('#thread-input').fill(i%4?'permission':'');
 await page.evaluate(i=>{const s=agentsWorld.sound;s.setControl('audio.ambience',i%3?.3:1);s.setControl('audio.drone',i%3?.3:1);s.event('ui.press');s.event('page.open');s.event('page.close');},i);
 await page.waitForTimeout(500);
 const d=await page.evaluate(()=>agentsWorld.sound.diagnostics());
 if(d.state!=='on'){console.log(JSON.stringify({i,...d}));throw Error('Audio stopped');}
}
const result=await page.evaluate(()=>({injected:window.trimFaultInjected,skipped:agentsWorld.sound.diagnostics().log.filter(e=>e.event==='trim.skipped'),state:agentsWorld.sound.state}));if(!result.injected||!result.skipped.length)throw Error('Fault case not exercised');console.log(JSON.stringify({passed:true,result,errors}));
}finally{await browser.close();}
