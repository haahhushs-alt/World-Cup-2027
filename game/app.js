(()=>{
const WC=window.WC;let sim=null,pitch=null,paused=false,camera='broadcast',options,last=0,elapsed=0;
const controls=WC.controls=new WC.Controls({action:(a,power)=>sim?.action(a,power),pause:()=>WC.pause(),camera:()=>{camera=camera==='first'?'broadcast':'first';},tactic:t=>sim?.setTactic(t),disconnect:()=>WC.pause()});
WC.pause=()=>{if(!sim||paused)return;paused=true;WC.sound.modeTo('pause');WC.matchUI.show(false);controls.show(false);WC.Menu.showPause(sim);};
WC.resume=()=>{if(!sim)return;if(sim.phase==='halftime')sim.action('skip');paused=false;WC.sound.modeTo('match');WC.matchUI.show(true);last=performance.now();controls.show(true);WC.Menu.hide();};
WC.leave=()=>{WC.matchUI.show(false);WC.sound.modeTo('menu');paused=false;sim=null;WC.sim=null;controls.show(false);pitch?.dispose();pitch=null;document.querySelector('#pitch').replaceChildren();WC.Menu.open();};
WC.start=o=>{options=o;const slot=document.querySelector('#pitch');if(pitch)pitch.dispose();const canvas=document.createElement('canvas');slot.replaceChildren(canvas);
 WC.sound.modeTo('match');WC.sound.unlock().catch(()=>{});
 sim=WC.sim=new WC.Sim(o);pitch=new WC.Pitch(canvas,o);paused=false;camera='broadcast';elapsed=0;last=performance.now();WC.Menu.hide();controls.show(true);WC.matchUI.begin(o.homeTeam,o.awayTeam);};
function draw(now){
 requestAnimationFrame(draw);const dt=Math.min(.12,Math.max(0,(now-last)/1000));last=now;const v=controls.poll();
 if(!sim||paused)return;const move=pitch.inputVector(v.x,v.y);const steps=Math.max(1,Math.ceil(dt*60));
 for(let i=0;i<steps;i++)sim.update(dt/steps,{...move,sprint:v.sprint});
 for(const e of sim.drainEvents()){
   WC.sound.event(e,sim);
   if(e.type==='goal')controls.refs.toast.classList.remove('wc-on');
   if(e.type==='restart')controls.notify(e.label+(sim.restart?.team===0?' · '+(sim.restart.type==='penalty'||sim.restart.type==='free'?'按射门主罚':'按传球发出'):''),2300);
   if(['save','card','practice','added','post','advantage','sub'].includes(e.type))controls.notify(e.label);
 }
 if(sim.phase==='halftime'||sim.phase==='fulltime'){paused=true;WC.sound.modeTo('pause');WC.matchUI.show(false);controls.show(false);(sim.phase==='halftime'?WC.Menu.showHalf:WC.Menu.showResult)(sim);return;}
 WC.sound.update(sim,dt);WC.matchUI.update(sim,dt);
 const view=['goal','replay'].includes(sim.phase)?sim.phase:camera;
 pitch.render(sim.frame,dt,{camera:view,direction:sim.attackDir(0),stageTime:sim.stageTime,scorer:sim.scorer?.id});elapsed+=dt;
 if(elapsed>.065){controls.update(sim,{home:options.homeTeam.abbr,away:options.awayTeam.abbr,camera});elapsed=0;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)WC.pause();});requestAnimationFrame(draw);
})();
