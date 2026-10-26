/** Real-browser regression for pause, reduced motion and the automatic cycle.
 * Run against the dev server: pnpm verify:motion [--out=outputs/motion-v15]. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const args=new Map(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')];}));
const out=args.get('out')||'outputs/motion-v15',base=args.get('base')||'http://127.0.0.1:5173';
const candidates=[process.env.PLAYWRIGHT_MODULE,'playwright'].filter(Boolean);
let chromium;
for(const candidate of candidates){try{const mod=await import(path.isAbsolute(candidate)?pathToFileURL(candidate).href:candidate);chromium=(mod.default??mod).chromium;if(chromium)break;}catch{}}
if(!chromium)throw new Error('Set PLAYWRIGHT_MODULE to a Playwright entry file.');
fs.mkdirSync(out,{recursive:true});
const result={renderer:'Chrome / SwiftShader, not hardware performance',checks:{},samples:{},errors:[],passed:false};
function check(name,ok,detail){result.checks[name]={pass:Boolean(ok),detail};console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)throw new Error(name);}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>result.errors.push(e.message));
  const read=()=>page.locator('canvas').evaluate(c=>({...c.dataset}));
  const cycle=()=>page.evaluate(()=>window.__galleryCycle.state());
  const frames=async()=>{
    const n=Number((await read()).renderFrames);
    await page.waitForFunction(n=>Number(document.querySelector('canvas')?.dataset.renderFrames)>n+2,n,{timeout:60000});
  };
  await page.goto(`${base}/?dwell=2`);
  await page.waitForFunction(()=>window.__galleryCycle&&Number(document.querySelector('canvas')?.dataset.waveReads)>2,null,{timeout:120000});
  await page.evaluate(()=>window.__galleryCycle.set(2));
  await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.beaconStrength)>.8,null,{timeout:60000});
  await page.getByRole('button',{name:/暂停动态/}).click();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.advancePlaying==='false');
  const paused=await read();result.samples.paused=paused;
  const errorCount=Number(paused.waveErrors);
  check('readback errors are a finite zero count',Number.isFinite(errorCount)&&errorCount===0,paused.waveErrors);
  await page.getByRole('button',{name:'恢复初始视角'}).click();await frames();
  result.samples.afterReset=await read();
  check('paused reset does not rotate the beam',paused.beaconAngle===result.samples.afterReset.beaconAngle,result.samples.afterReset.beaconAngle);
  await page.mouse.move(780,430);await page.mouse.down();await page.mouse.move(940,480,{steps:5});await page.mouse.up();await frames();
  const dragged=await read();result.samples.dragged=dragged;
  check('paused orbit keeps beam, boat and fish frozen',dragged.beaconAngle===paused.beaconAngle&&dragged.boatTime===paused.boatTime&&dragged.fishTailAngle===paused.fishTailAngle,dragged.beaconAngle);
  await page.evaluate(()=>window.__galleryCycle.set(3));
  await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.fogDensity)>.035,null,{timeout:120000});
  check('explicit weather redraw keeps the paused beam frozen',(await read()).beaconAngle===paused.beaconAngle);
  await page.evaluate(()=>window.__galleryCycle.resume());
  const held=await cycle();await page.waitForTimeout(2600);
  check('pause stops automatic moments',(await cycle()).step===held.step,held);
  check('pause stops the progress animation',await page.locator('.moment-fill').evaluate(el=>getComputedStyle(el).animationPlayState)==='paused');
  await page.getByRole('button',{name:/继续动态/}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.advancePlaying==='false');
  const reduced=await read(),reducedCycle=await cycle();result.samples.reduced=reduced;
  await page.getByRole('button',{name:'恢复初始视角'}).click();await frames();
  await page.waitForTimeout(2600);
  check('reduced motion disables the play control',await page.getByRole('button',{name:'静态模式'}).isDisabled());
  check('reduced motion freezes the sweep during redraws',(await read()).beaconAngle===reduced.beaconAngle);
  check('reduced motion stops automatic moments',(await cycle()).step===reducedCycle.step,reducedCycle);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>window.__galleryCycle.state().running===true);
  const resumed=await cycle(),angle=(await read()).beaconAngle;
  await page.waitForFunction(step=>window.__galleryCycle.state().step!==step,resumed.step,{timeout:10000});
  await page.waitForFunction(a=>Number(document.querySelector('canvas')?.dataset.beaconAngle)>Number(a)+.02,angle,{timeout:60000});
  check('resuming restores the cycle and sweep',true);
  await page.screenshot({path:path.join(out,'resumed.png')});
  await page.close();

  // Initial reduced-motion preference must stop timers before the first dwell.
  const initial=await browser.newPage({reducedMotion:'reduce'});
  initial.on('pageerror',e=>result.errors.push(e.message));
  await initial.goto(`${base}/?dwell=.5`);
  await initial.waitForFunction(()=>window.__galleryCycle&&document.querySelector('canvas')?.dataset.advancePlaying==='false',null,{timeout:120000});
  const initialCycle=await initial.evaluate(()=>window.__galleryCycle.state());
  await initial.waitForTimeout(1200);
  const initialLater=await initial.evaluate(()=>window.__galleryCycle.state());
  check('initial static mode never starts the automatic timer',initialCycle.step===0&&initialLater.step===0&&!initialLater.running,initialLater);
  check('no page errors',result.errors.length===0,result.errors);
  result.passed=true;
}catch(e){result.failure=String(e);process.exitCode=1;console.error(e);}
finally{await browser.close();fs.writeFileSync(path.join(out,'check.json'),JSON.stringify(result,null,2));}
