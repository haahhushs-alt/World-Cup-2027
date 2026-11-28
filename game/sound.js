/* Offline original match audio, with separate buses and bounded voice counts. */
(()=>{
 'use strict';const WC=window.WC;
 class MatchAudio{
  constructor(){
   this.settings={master:.8,crowd:.55,effects:.8,music:.36};
   try{const s=JSON.parse(localStorage.getItem('wc2027.audio.v2'));for(const k of Object.keys(this.settings))if(Number.isFinite(s?.[k]))this.settings[k]=Math.min(1,Math.max(0,s[k]));}catch{}
   this.pending=[];this.buffers=new Map();this.voices=new Set();this.loops=new Map();this.mode='menu';this.ready=false;this.footTime=0;this.chantAt=15;this.roarUntil=0;
   const unlock=()=>{this.unlock().catch(()=>{});};document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
  }
  async unlock(){
   if(!this.ctx){
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=this.settings.master;
    const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=9;limiter.ratio.value=5;limiter.attack.value=.006;limiter.release.value=.15;
    this.master.connect(limiter).connect(this.ctx.destination);this.bus={};
    for(const k of ['crowd','effects','music']){this.bus[k]=this.ctx.createGain();this.bus[k].gain.value=this.settings[k];this.bus[k].connect(this.master);}
    this.loading=Promise.all(Object.entries(WC.audioData).map(async([name,base64])=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));this.buffers.set(name,await this.ctx.decodeAudioData(bytes.buffer));})).then(()=>{this.ready=true;this.applyMode();for(const [e,sim] of this.pending.splice(0))this.event(e,sim);});
   }
   await this.ctx.resume();await this.loading;
  }
  setVolume(key,value){if(!(key in this.settings))return;this.settings[key]=Math.min(1,Math.max(0,Number(value)||0));
   try{localStorage.setItem('wc2027.audio.v2',JSON.stringify(this.settings));}catch{}
   const gain=key==='master'?this.master:this.bus?.[key];gain?.gain.setTargetAtTime(this.settings[key],this.ctx.currentTime,.04);
  }
  play(name,{volume=1,pan=0,rate=1,bus='effects'}={}){
   if(!this.ready||this.ctx.state!=='running'||this.voices.size>=24||!this.buffers.has(name))return;
   const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();src.buffer=this.buffers.get(name);src.playbackRate.value=rate;gain.gain.value=volume;
   src.connect(gain);if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));gain.connect(p).connect(this.bus[bus]);}else gain.connect(this.bus[bus]);
   this.voices.add(src);src.onended=()=>{this.voices.delete(src);src.disconnect();gain.disconnect();};src.start();
  }
  loop(name,bus,level){if(this.loops.has(name)||!this.buffers.has(name))return;
   const src=this.ctx.createBufferSource(),gain=this.ctx.createGain();src.buffer=this.buffers.get(name);src.loop=true;gain.gain.value=level;src.connect(gain).connect(this.bus[bus]);src.start();this.loops.set(name,{src,gain});
  }
  modeTo(mode){this.mode=mode;this.applyMode();}
  applyMode(){if(!this.ready)return;this.loop('crowd','crowd',0);this.loop('music','music',0);
   const now=this.ctx.currentTime;for(const [name,{gain}]of this.loops){const level=name==='music'?(this.mode==='menu'?.7:this.mode==='pause'?.18:0):(this.mode==='match'?.32:this.mode==='pause'?.05:0);gain.gain.setTargetAtTime(level,now,.45);}
  }
  event(e,sim){if(!this.ready){if(this.pending.length<8)this.pending.push([e,{ball:{x:sim?.ball?.x||0}}]);return;}const pan=(sim?.ball?.x||0)/65;
   if(e.type==='kick'){const shot=['shoot','power','chip','curve'].includes(e.action);this.play(e.action==='power'?'power':shot?'shot':'pass',{pan,rate:.94+Math.random()*.12});if(shot){this.roarUntil=this.ctx?.currentTime+2;}}
   else if(e.type==='goal'){this.play('cheer',{bus:'crowd'});this.play('chant',{bus:'crowd',volume:.6});this.roarUntil=(this.ctx?.currentTime||0)+7;}
   else if(e.type==='restart'){this.play('whistle',{volume:e.restart==='kickoff'?.52:.34});}
   else if(e.type==='half'||e.type==='end')this.play('fulltime',{volume:.75});
   else if(e.type==='save'){this.play('save',{pan});this.play('cheer',{bus:'crowd',volume:.2,rate:1.12});}
   else if(e.type==='post'){this.play('post',{pan});this.play('cheer',{bus:'crowd',volume:.35,rate:.9});}
   else if(e.type==='card')this.play('whistle',{volume:.65});
   else if(e.type==='receive')this.play('pass',{pan,volume:.27,rate:1.14});
   else if(e.type==='tackle')this.play('tackle',{pan,volume:.55});
   else if(e.type==='bounce')this.play('bounce',{pan,volume:Math.min(.5,e.impact/12)});
  }
  update(sim,dt){if(!this.ready||this.mode!=='match')return;
   const now=this.ctx.currentTime,b=sim.ball;
   const intensity=.28+Math.max(0,(Math.abs(b.x)-22)/55)+(now<this.roarUntil?.25:0);
   this.loops.get('crowd')?.gain.gain.setTargetAtTime(Math.min(.78,intensity),now,.6);
   if(sim.phase!=='live')return;const p=sim.selected,speed=Math.hypot(p.vx,p.vz);this.footTime-=dt;
   if(speed>1.2&&this.footTime<=0){this.play('step',{volume:.17+speed*.018,rate:.9+Math.random()*.2,pan:p.x/80});this.footTime=Math.max(.14,.31-speed*.014);}
   this.chantAt-=dt;if(this.chantAt<=0){this.play('chant',{bus:'crowd',volume:.3});this.chantAt=24+Math.random()*16;}
  }
 }
 WC.sound=new MatchAudio();
 document.addEventListener('visibilitychange',()=>{if(!WC.sound.ctx)return;if(document.hidden)WC.sound.ctx.suspend().catch(()=>{});else WC.sound.unlock().catch(()=>{});});
 document.addEventListener('click',e=>{if(e.target.closest('button'))WC.sound.play('ui',{volume:.55});});
})();
