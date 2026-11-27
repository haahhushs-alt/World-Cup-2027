(()=>{
const WC=window.WC;let sim=null,pitch=null,paused=false,camera='broadcast',options,last=0,elapsed=0;
let audio;function playSound(type){
 if(!audio||audio.state!=='running')return;
 const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
 const kick=type==='kick',goal=type==='goal';osc.type=kick?'sine':'triangle';osc.frequency.setValueAtTime(kick?116:goal?518:1750,now);osc.frequency.exponentialRampToValueAtTime(kick?49:goal?776:1510,now+(kick?.1:.25));gain.gain.setValueAtTime(kick?.12:.045,now);gain.gain.exponentialRampToValueAtTime(.0001,now+(kick?.14:.45));osc.connect(gain).connect(audio.destination);osc.start();osc.stop(now+.47);
}
const controls=WC.controls=new WC.Controls({action:a=>sim?.action(a),pause:()=>WC.pause(),camera:()=>{camera=camera==='first'?'broadcast':'first';},tactic:t=>sim?.setTactic(t),disconnect:()=>WC.pause()});
WC.pause=()=>{if(!sim||paused)return;paused=true;controls.show(false);WC.Menu.showPause(sim);};
WC.resume=()=>{if(!sim)return;if(sim.phase==='halftime')sim.action('skip');paused=false;last=performance.now();controls.show(true);WC.Menu.hide();};
WC.leave=()=>{paused=false;sim=null;WC.sim=null;controls.show(false);pitch?.dispose();pitch=null;document.querySelector('#pitch').replaceChildren();WC.Menu.open();};
WC.start=o=>{options=o;const slot=document.querySelector('#pitch');if(pitch)pitch.dispose();const canvas=document.createElement('canvas');slot.replaceChildren(canvas);
 try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}
 sim=WC.sim=new WC.Sim(o);pitch=new WC.Pitch(canvas,o);paused=false;camera='broadcast';elapsed=0;last=performance.now();WC.Menu.hide();controls.show(true);};
function draw(now){
 requestAnimationFrame(draw);const dt=Math.min(.12,Math.max(0,(now-last)/1000));last=now;const v=controls.poll();
 if(!sim||paused)return;const move=pitch.inputVector(v.x,v.y);const steps=Math.max(1,Math.ceil(dt*60));
 for(let i=0;i<steps;i++)sim.update(dt/steps,{...move,sprint:v.sprint});
 for(const e of sim.drainEvents()){
   if(['kick','goal','restart'].includes(e.type))playSound(e.type);
   if(e.type==='goal')controls.refs.toast.classList.remove('wc-on');
   if(e.type==='restart')controls.notify(e.label+(sim.restart?.team===0?' · '+(sim.restart.type==='penalty'||sim.restart.type==='free'?'按射门主罚':'按传球发出'):''),2300);
   if(['save','card','practice','added','post','advantage','sub'].includes(e.type))controls.notify(e.label);
 }
 if(sim.phase==='halftime'||sim.phase==='fulltime'){paused=true;controls.show(false);(sim.phase==='halftime'?WC.Menu.showHalf:WC.Menu.showResult)(sim);return;}
 const view=['goal','replay'].includes(sim.phase)?sim.phase:camera;
 pitch.render(sim.frame,dt,{camera:view,direction:sim.attackDir(0),stageTime:sim.stageTime,scorer:sim.scorer?.id});elapsed+=dt;
 if(elapsed>.065){controls.update(sim,{home:options.homeTeam.abbr,away:options.awayTeam.abbr,camera});elapsed=0;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)WC.pause();});requestAnimationFrame(draw);
})();
