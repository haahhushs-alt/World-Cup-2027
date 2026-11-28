(()=>{
 const WC=window.WC;
 class MatchUI{
  constructor(){
   this.root=document.createElement('div');this.root.className='wc-broadcast';this.root.hidden=true;
   this.root.innerHTML='<div class="wc-match-bug"><span>WORLD CUP</span><b>2027</b></div><canvas class="wc-radar" width="340" height="220" aria-label="球场雷达"></canvas><div class="wc-fixture"><small>友谊赛</small><strong></strong><span>11 对 11</span></div><div class="wc-power-meter" hidden><span>射门力度</span><div><i></i></div></div>';
   document.body.append(this.root);this.map=this.root.querySelector('canvas');this.ctx=this.map.getContext('2d');this.power=this.root.querySelector('.wc-power-meter');this.counter=0;
  }
  show(flag){this.root.hidden=!flag;if(!flag)this.power.hidden=true;}
  begin(home,away,mode){this.root.querySelector('.wc-fixture strong').textContent=home.name+'  —  '+away.name;this.intro=mode==='match'?2.1:0;this.show(true);}
  update(sim,dt){
   if(this.root.hidden)return;this.root.dataset.cinematic=['goal','replay'].includes(sim.phase)?'on':'off';
   this.intro=Math.max(0,this.intro-dt);this.root.querySelector('.wc-fixture').hidden=this.intro===0||this.root.dataset.cinematic==='on';
   const charge=WC.controls.charging();
   this.power.hidden=charge===null||WC.controls.profile()!=='attack'||!['live','restart'].includes(sim.phase);
   if(!this.power.hidden)this.power.querySelector('i').style.width=(charge*100)+'%';
   this.counter+=dt;if(this.counter<.075)return;this.counter=0;
   const c=this.ctx;c.clearRect(0,0,340,220);c.fillStyle='rgba(8,18,29,.5)';c.fillRect(0,0,340,220);
   const x=v=>20+(v+52.5)/105*300,z=v=>14+(v+34)/68*192;
   c.strokeStyle='#eef6ff60';c.lineWidth=2;c.strokeRect(20,14,300,192);c.beginPath();c.moveTo(170,14);c.lineTo(170,206);c.stroke();c.beginPath();c.ellipse(170,110,26,26,0,0,Math.PI*2);c.stroke();c.strokeRect(20,54,47,112);c.strokeRect(273,54,47,112);
   for(const p of sim.players){if(!p.active)continue;c.fillStyle=p.team?'#ff9c72':'#8bdaff';c.beginPath();c.arc(x(p.x),z(p.z),p.id===sim.controlled?5:3.2,0,Math.PI*2);c.fill();if(p.id===sim.controlled){c.strokeStyle='#ffffff';c.stroke();}}
   c.fillStyle='#fff';c.beginPath();c.arc(x(sim.ball.x),z(sim.ball.z),3,0,Math.PI*2);c.fill();
  }
 }
 WC.matchUI=new MatchUI();
})();
