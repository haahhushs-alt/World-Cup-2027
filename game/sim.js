// World Cup 2027 — match simulation. Coordinates and velocities use metres and seconds.
(function (global) {
  'use strict';
  const WC = global.WC = global.WC || {};
  const LEN = 52.5, WID = 34, GOAL = 3.66, BAR = 2.44, R = 0.11, GRAVITY = 9.81;
  const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const len = (x, z) => Math.hypot(x, z);
  const distance = (a, b) => len(a.x-b.x, a.z-b.z);
  const pick = (a, b, t) => a + (b-a)*t;
  const unit = (x,z) => {const n = len(x,z) || 1; return [x/n,z/n];};
  const segmentDist = (p,a,b) => {
    const x=b.x-a.x,z=b.z-a.z,t=clip(((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z||1),0,1);
    return len(p.x-a.x-t*x,p.z-a.z-t*z);
  };
  const FORM = [[-49,0,'GK',1],[-30,-23,'RB',2],[-34,-8,'CB',4],[-34,8,'CB',5],
    [-30,23,'LB',3],[-14,0,'DM',6],[-7,-13,'CM',8],[-7,13,'CM',10],
    [8,-22,'RW',7],[13,0,'ST',9],[8,22,'LW',11]];
  const DEFAULT_NAMES = [
    ['Vega','Costa','Duarte','Ríos','Leal','Mora','Vidal','Reyes','Cruz','Soler','Paz'],
    ['Meyer','Brandt','Keller','Adler','Stahl','Falk','Lenz','Winter','Wolf','Bauer','Klein']
  ];
  const LABELS={kickoff:'开球',throw:'界外球',corner:'角球',goalKick:'球门球',free:'直接任意球',
    indirect:'间接任意球',offside:'越位 · 间接任意球',penalty:'点球',drop:'坠球'};
  const TACTIC = {defend:'defend',defensive:'defend',defense:'defend',balanced:'balanced',balance:'balanced',attack:'attack',attacking:'attack',offensive:'attack'};
  const KICKS = new Set(['shoot','chip','curve','power','pass','highPass','oneTwo','halfPass','through','powerThrough','loftThrough']);
  const SHOTS = new Set(['shoot','chip','curve','power']);
  const SKILLS = new Set(['skill','stepover','roulette','feint','roll','rainbow','dragBack','skillLeft','skillRight']);
  const SETTINGS = [
    {reaction:0.96,v:0.86,tackle:0.43,accuracy:0.62,save:0.53},
    {reaction:0.69,v:0.95,tackle:0.60,accuracy:0.76,save:0.65},
    {reaction:0.45,v:1.01,tackle:0.74,accuracy:0.86,save:0.76},
    {reaction:0.27,v:1.06,tackle:0.83,accuracy:0.94,save:0.85}
  ];
  class Sim {
    constructor(options={}) {
      this.mode=options.mode||'match';
      this.difficulty=clip(Math.round(Number(options.difficulty)||0),0,3);
      this.tactic=TACTIC[options.tactic]||'balanced';
      this.random=typeof options.random==='function'?options.random:Math.random;
      this.half=1; this.clock=0; this.elapsed=0; this.phase='restart';
      this.score=[0,0]; this.teams=[]; this.players=[]; this.events=[];
      this.teams=[options.homeNames || DEFAULT_NAMES[0],options.awayNames || DEFAULT_NAMES[1]];
      for(let t=0;t<2;t++) FORM.forEach(([fx,fz,role,number],i)=>{
        const entry=this.teams[t][i] || DEFAULT_NAMES[t][i], dir=this.attackDir(t);
        this.players.push({id:11*t+i,team:t,number:entry.number||number,name:typeof entry==='string'?entry:entry.name||DEFAULT_NAMES[t][i],
          role,keeper:i===0,active:true,stamina:1,cards:0,goals:0,x:fx*dir,z:fz*dir,vx:0,vz:0,heading:t?Math.PI:0,
          anim:'idle',animTime:0,think:0,runFor:0,duel:0,skillTime:0,baseX:fx,baseZ:fz});
      });
      this.ball={x:0,y:R,z:0,vx:0,vy:0,vz:0,spin:0,owner:null};
      this.controlled=9; this.input={x:0,z:0,sprint:false}; this.aim={x:1,z:0};
      this.lastTouch=null; this.possession=[0,0]; this.stats={shots:[0,0],fouls:[0,0],corners:[0,0],offsides:[0,0],saves:[0,0],passes:[0,0],yellow:[0,0],red:[0,0]};
      this.replayFrames=[]; this.replayView=null; this.recordIn=0; this.replayAt=0;
      this.stageTime=0; this.subTime=0; this.added=0; this.addedPosted=false; this.restart=null;
      this.lock=0; this.ownerTime=0; this.kickData=null; this.offside=new Set(); this.advantage=null;
      this.practice={attempts:0,goals:0}; this.practiceTime=0; this.sprintBurst=0;
      this.subs=[0,0];this.windows=[0,0];this.restartSerial=0;this.lastWindow=[-1,-1];this.pending=[[],[]];this.bench=(options.bench||[['','Vela','Toro','Luca','Santos','Melo','Pardo'],['','Graf','Lutz','Ernst','Roth','Haas','Maas']]).map(a=>a.map((n,i)=>({name:n||'Vale',number:12+i,used:false})));
      this.planIn=0; this.primary=[1,12]; this.secondary=[2,13];
      this.resetFormation();
      if(this.mode==='penalty'||this.mode==='freekick') this.practiceRestart();
      else this.setRestart('kickoff',0,0,0);
    }
    attackDir(t=0){return (t===0?1:-1)*(this.half===1?1:-1);}
    get frame(){return this.replayView || this;}
    get selected(){return this.players[this.controlled];}
    get difficultySettings(){return SETTINGS[this.difficulty];}
    emit(type,label,details={}){this.events.push(Object.assign({type,label},details)); if(this.events.length>200)this.events.shift();}
    drainEvents(){return this.events.splice(0);}
    setTactic(v){
      if(TACTIC[v]) {this.tactic=TACTIC[v];this.emit('tactic',{balanced:'平衡',defend:'防守',attack:'进攻'}[this.tactic]);}
    }
    setDifficulty(v){this.difficulty=clip(Math.round(Number(v)||0),0,3);}
    playerList(t){return this.players.filter(p=>p.team===t && p.active);}
    nearest(t,x,z,exclude=-1,allowKeeper=false){
      let best=null,n=Infinity;
      for(const p of this.players){
        if(!p.active||p.team!==t||p.id===exclude||(!allowKeeper&&p.keeper))continue;
        const d=len(p.x-x,p.z-z); if(d<n){n=d;best=p;}
      } return best;
    }
    chooseControl(p){
      if(!p||!p.active||p.team!==0)return;
      if(this.controlled!==p.id)this.aim={x:Math.cos(p.heading),z:Math.sin(p.heading)};
      this.controlled=p.id;
    }
    resetFormation(){
      for(const p of this.players){const d=this.attackDir(p.team);p.x=p.baseX*d;p.z=p.baseZ*d;
        p.vx=0;p.vz=0;p.heading=d>0?0:Math.PI;p.runFor=0;p.anim='idle';p.animTime=0;}
    }
    put(p,x,z){
      if(!p)return;p.x=clip(x,-LEN+0.24,LEN-0.24);p.z=clip(z,-WID+0.24,WID-0.24);p.vx=p.vz=0;
    }
    inBox(player,x,z){return (x*this.attackDir(player.team)<-LEN+16.5 && Math.abs(z)<20.16);}
    practiceRestart(){
      this.resetFormation();
      const pk=this.mode==='penalty',d=this.attackDir(0),z=pk?0:pick(-11,11,this.random());
      this.setRestart(pk?'penalty':'free',0,d*(LEN-(pk?11:22+this.random()*6)),z);
      this.practiceTime=0;
    }
    requestSub(team,player,slot){
      const p=this.players[player],sub=this.bench[team]?.[slot];
      if(this.mode!=='match'||this.subs[team]+this.pending[team].length>=5||!p?.active||p.team!==team||!sub||sub.used||this.pending[team].some(a=>a.player===player||a.slot===slot))return false;
      if(this.windows[team]>=3 && !['halftime','restart'].includes(this.phase))return false;
      this.pending[team].push({player,slot});if(['halftime','restart'].includes(this.phase))this.applySubs(team,this.phase==='halftime');return true;
    }
    applySubs(team,interval=false){
      if(!this.pending[team].length||(!interval&&this.windows[team]>=3&&this.lastWindow[team]!==this.restartSerial))return;
      for(const {player,slot} of this.pending[team]){const p=this.players[player],sub=this.bench[team][slot];if(!p.active||sub.used)continue;
        p.name=sub.name;p.number=sub.number;p.cards=0;p.goals=0;p.stamina=1;sub.used=true;this.subs[team]++;this.emit('sub','替补上场 · '+p.name);}
      if(!interval&&this.lastWindow[team]!==this.restartSerial){this.windows[team]++;this.lastWindow[team]=this.restartSerial;}this.pending[team]=[];
    }
    setRestart(type,team,x,z){
      if(this.mode!=='match' && this.phase==='live' && this.practiceTime>0){
        this.endPracticeAttempt('本轮结束');return;
      }
      this.applySubs(0);this.applySubs(1);this.phase='restart';this.stageTime=0;this.replayFrames=[];this.replayView=null;this.recordIn=0;this.advantage=null;this.kickData=null;this.offside.clear();
      const d=this.attackDir(team);
      x=clip(x,-LEN,LEN);z=clip(z,-WID,WID);
      if(type==='kickoff'){this.resetFormation();x=z=0;}
      if(type==='goalKick'){x=d*(-LEN+5.5);z=(z<0?-1:1)*8.7;}
      if(type==='corner'){x=d*(LEN-0.2);z=Math.sign(z||1)*(WID-0.25);this.stats.corners[team]++;}
      if(type==='penalty'){x=d*(LEN-11);z=0;}
      if((type==='indirect'||type==='offside')&&x*d>LEN-5.5&&Math.abs(z)<9.16)x=d*(LEN-5.5);
      let p=type==='kickoff'||type==='penalty'?this.players[11*team+9]:this.nearest(team,x,z);
      if(type==='goalKick'||type==='drop'&&x*d<-36&&Math.abs(z)<20)p=this.players[11*team];
      if(!p||!p.active)p=this.nearest(team,x,z,-1,true);
      if(!p){this.finishMatch();return;}
      this.restart={type,team,x,z,taker:p.id};
      const b=this.ball;Object.assign(b,{x,z,y:type==='throw'?2:R,vx:0,vy:0,vz:0,spin:0,owner:null});
      this.lastTouch=null;
      this.put(p,x-d*0.5,z);
      for(const q of this.players){
        if(!q.active||q.id===p.id)continue;
        const friendly=q.team===team;
        if(type==='kickoff'){
          if(q.x*this.attackDir(q.team)>-0.5)q.x=-this.attackDir(q.team)*(friendly?4:10);
          if(!friendly&&distance(q,b)<9.2)this.put(q,d*9.25,q.z||1);
        } else if(type==='corner'){
          if(!q.keeper && (q.id%11>=8 || (!friendly && q.id%11<=4))){
            const lane=(q.id%11>=8?q.id%11-9:q.id%11-2.5)*3.8;
            this.put(q,d*(LEN-(friendly?8:6)-(q.id%3)*1.4),lane);
          }
        } else if(type==='penalty'){
          if(q.keeper && !friendly){this.put(q,d*(LEN-0.12),0);continue;}
          if(!q.keeper){this.put(q,d*(LEN-18.4-2*(q.id%4)),((q.id%6)-2.5)*5+(friendly?1:-1));}
        } else if(type==='goalKick'&&!friendly && q.x*d<-LEN+16.5&&Math.abs(q.z)<20.16)q.x=d*(-LEN+17);
        else if((type==='free'||type==='indirect')&&x*d>20&&!friendly&&!q.keeper&&[2,3,5].includes(q.id%11)){
          const i=[2,3,5].indexOf(q.id%11)-1;
          const [ux,uz]=unit(d*LEN-x,-z);
          this.put(q,x+9.5*ux-i*.75*uz,z+9.5*uz+i*.75*ux);
        }
        if(q.team!==team){
          const radius=type==='throw'?2.05:type==='drop'?4.1:9.17;
          if(['free','indirect','offside','corner','throw','drop'].includes(type)&&distance(q,b)<radius){
            const [ux,uz]=unit(q.x-x||d,q.z-z);this.put(q,x+ux*radius,z+uz*radius);
          }
        }
      }
      p.heading=Math.atan2(type==='throw'?-Math.sign(z):0,type==='throw'?0:d);
      if(team===0)this.chooseControl(p);else this.chooseControl(this.nearest(0,x,z));
      this.aim={x:d,z:0};this.emit('restart',LABELS[type],{restart:type,team,player:p.id});
    }
    endPracticeAttempt(label){
      this.phase='attempt';this.stageTime=0;this.practiceTime=0;this.ball.owner=null;
      this.emit('practice',label,{attempts:this.practice.attempts,goals:this.practice.goals});
    }
    startRestart(kind){
      const rest=this.restart;if(!rest)return false;
      const p=this.players[rest.taker];
      if(rest.type==='throw'&&SHOTS.has(kind))kind='highPass';
      if(rest.type==='drop'){
        this.phase='live';this.restart=null;this.takeBall(p);return true;
      }
      if(!KICKS.has(kind))return false;
      this.capture();this.phase='live';this.stageTime=0;this.restart=null;this.takeBall(p);
      Object.assign(this.ball,{x:rest.x,z:rest.z,y:rest.type==='throw'?2:R});
      if(this.mode!=='match'){this.practice.attempts++;this.practiceTime=8;}
      this.kick(p,kind,rest.type);
      if(rest.type==='throw'){p.anim='throw';p.animTime=.5;}
      return true;
    }
    takeBall(p,settle=false){
      const b=this.ball;
      this.receiving=settle?{id:p.id,x:b.x,y:b.y,z:b.z}:null;this.lastTouch=p.id;b.owner=p.id;b.vx=b.vy=b.vz=b.spin=0;
      this.kickData=null;this.offside.clear();this.ownerTime=0;this.dribbleBeat=0;
      p.think=p.team===1?this.difficultySettings.reaction*(.55+this.random()*.6):.6;
      if(p.team===0)this.chooseControl(p);
      if(settle)this.emit('receive','接球',{player:p.id,team:p.team});
      this.syncBall(p);
    }
    syncBall(p){
      const b=this.ball,speed=len(p.vx,p.vz),stride=Math.sin(this.elapsed*(5+speed*.8));
      const reach=p.keeper&&this.inBox(p,p.x,p.z)?.25:.48+Math.min(speed*.037,.28)+Math.max(0,stride)*.14;
      b.x=p.x+Math.cos(p.heading)*reach-Math.sin(p.heading)*stride*.065;b.z=p.z+Math.sin(p.heading)*reach+Math.cos(p.heading)*stride*.065;b.y=R+Math.abs(stride)*Math.min(.07,speed*.008);
      b.vx=p.vx;b.vz=p.vz;
      const receive=this.receiving;
      if(receive?.id===p.id){
        const t=clip(this.ownerTime/.18,0,1),progress=1-(1-t)**2;
        b.x=pick(receive.x,b.x,progress);
        b.y=pick(receive.y,b.y,progress);
        b.z=pick(receive.z,b.z,progress);
        if(t>=1)this.receiving=null;
      }
    }
    action(kind,power=.65){this.shotPower=clip(power,.4,1);if(kind==='pullback')kind='dragBack';
      if(kind==='skip'){if(this.phase==='goal')this.startReplay();else if(this.phase==='replay')this.afterGoal();
        else if(this.phase==='halftime')this.newHalf();else if(this.phase==='attempt')this.practiceRestart();return true;}
      if(this.phase==='restart'){
        if(this.restart.team===0 && (KICKS.has(kind)||kind==='tackle'))return this.startRestart(kind==='tackle'?'pass':kind);
        return false;
      }
      if(this.phase!=='live')return false;
      const p=this.selected;
      if(kind==='switch'){this.manualSwitch=1.8;const options=this.playerList(0).filter(q=>q.id!==p.id&&!q.keeper).sort((a,c)=>distance(a,this.ball)-distance(c,this.ball));
        if(this.ball.owner===p.id)return false;this.chooseControl(options[0]);return true;}
      if(kind==='sprint'||kind==='tackle'){
        this.sprintBurst=.4;
        if(this.ball.owner!==p.id)this.tryTackle(p,true);return true;
      }
      if(this.ball.owner!==p.id)return false;
      if(kind==='fake'||SKILLS.has(kind)) {
        if(p.skillTime>0)return false;
        const sign=['skillLeft','dragBack'].includes(kind)?-1:1;
        const turn=({roulette:1.25,roll:.9,dragBack:2.7,fake:.51,stepover:.32,rainbow:.64}[kind]||.62)*sign;
        p.heading+=turn;p.skillTime=kind==='fake'?.56:.72;p.anim=kind==='fake'?'kick':'skill';p.animTime=.5;
        p.vx=4.6*Math.cos(p.heading);p.vz=4.6*Math.sin(p.heading);
        this.emit('skill',kind==='fake'?'假射':'花式过人',{player:p.id,action:kind});return true;
      }
      if(KICKS.has(kind)){this.kick(p,kind);return true;}return false;
    }
    receiver(p,kind,ax,az){
      const d=this.attackDir(p.team),through=kind.toLowerCase().includes('through');
      const long=kind==='highPass'||kind==='loftThrough'||kind==='powerThrough';
      const targetDist=long?27:through?20:14;
      let best=null,n=-Infinity;
      for(const q of this.playerList(p.team)){
        if(q.id===p.id)continue;
        const dx=q.x-p.x,dz=q.z-p.z,dist=len(dx,dz)||1;
        const lane=dx/dist*ax+dz/dist*az;
        let nearestEnemy=9;
        for(const e of this.players)if(e.active&&e.team!==p.team)nearestEnemy=Math.min(nearestEnemy,distance(e,q));
        const open=clip(nearestEnemy-3,-3,5);
        const value=lane*11-Math.abs(dist-targetDist)*.23+open*.65+(through?clip(dx*d,-20,24)*.16:0)-
          (q.keeper&&ax*d>-.4?15:0)+(q.runFor>0?2:0)-(dist<2?18:0);
        if(value>n){n=value;best=q;}
      }return best;
    }
    kick(p,kind,restartType=null){
      const b=this.ball,d=this.attackDir(p.team),shot=SHOTS.has(kind),human=p.team===0&&p.id===this.controlled;
      const dx=Math.cos(p.heading),dz=Math.sin(p.heading);
      const manual=human&&len(this.input.x,this.input.z)>.12;
      let [ax,az]=manual?unit(this.input.x,this.input.z):unit(dx,dz);
      let tx,tz,speed,lift,target=null;
      if(shot){
        this.stats.shots[p.team]++;
        const styleAccuracy=human?.94:this.difficultySettings.accuracy;
        const pressure=this.nearest(1-p.team,p.x,p.z,-1,true);
        const rushed=pressure?clip(1-distance(p,pressure)/4,0,1):0,range=clip((LEN-p.x*d-12)/22,0,1),angle=clip(Math.abs(p.z)/19,0,1);
        const scatter=(human?1.15:2.9)*(1.9-styleAccuracy)*(1+range*.65+rushed*.8+angle*.7);
        const error=(this.random()-.5)*scatter*(kind==='power'?1.45:1);
        tx=d*(LEN+1);
        const keeper=this.players[11*(1-p.team)];
        const side=manual?clip(az,-1,1):keeper.z>.4?-.74:keeper.z<-.4?.74:(this.random()<.5?-.72:.72);
        tz=clip(side*(GOAL+.33)+error,-GOAL-1.8,GOAL+1.8);
        speed={shoot:27.5,power:36,curve:25.6,chip:16.5}[kind]*(.96+.08*this.random())*(human?.86+(this.shotPower||.65)*.22:1);
        const time=len(tx-b.x,tz-b.z)/speed;
        const aimY=kind==='power'?.65:kind==='chip'?1.85:kind==='curve'?1.55:1.0;
        lift=clip((aimY+(human?.04:.35)*this.random()*(rushed+angle)-b.y)/Math.max(.18,time)+.5*GRAVITY*time,1.2,kind==='chip'?13:10);
        if(kind==='chip'&&time>.75)lift+=.35;
      }else{
        target=this.receiver(p,kind,ax,az);
        if(!target)return;
        const through=['through','powerThrough','loftThrough'].includes(kind);
        const lead=through?(kind==='powerThrough'?8:5):.5;
        tx=clip(target.x+target.vx*.36+lead*d,-LEN+1,LEN-1);
        tz=clip(target.z+target.vz*.36,-WID+1,WID-1);
        // A lone player taking a corner aims between the six-yard box and the penalty mark.
        if(restartType==='corner'&&!manual){tx=d*(LEN-9.5);tz=pick(-2.8,2.8,this.random());}
        const dist=len(tx-b.x,tz-b.z);
        const aerial=kind==='highPass'||kind==='loftThrough'||kind==='halfPass'||restartType==='throw'||restartType==='corner';
        speed=clip(dist*(through?.96:1.05),10,through?30:25);
        if(aerial){
          const flight=clip((kind==='halfPass'?.61:1.04)+dist*.018,.55,2.35);
          speed=dist/flight;lift=GRAVITY*flight*.5+(R-b.y)/flight;
        }else lift=.34;
        if(kind==='oneTwo')p.runFor=3.6;
        if(through)target.runFor=1.8;
        this.stats.passes[p.team]++;
      }
      let [ux,uz]=unit(tx-b.x,tz-b.z);
      const curve=kind==='curve'?(tz>=0?-1:1)*d*9.3:0;
      if(curve){const time=len(tx-b.x,tz-b.z)/speed;
        [ux,uz]=unit(ux+uz*curve*time/(2*speed),uz-ux*curve*time/(2*speed));}
      this.offside.clear();
      if(!['throw','goalKick','corner'].includes(restartType)){
        const opponents=this.playerList(1-p.team).map(q=>q.x*d).sort((a,c)=>c-a);
        const line=Math.max(0,b.x*d,opponents[1]??LEN);
        for(const q of this.playerList(p.team))if(q.id!==p.id&&q.x*d>line+.06)this.offside.add(q.id);
      }
      b.owner=null;b.vx=ux*speed;b.vz=uz*speed;b.vy=lift;b.spin=curve;
      p.heading=Math.atan2(uz,ux);p.anim='kick';p.animTime=.36;this.lock=.14;this.lastTouch=p.id;
      this.kickData={team:p.team,kicker:p.id,kind,target:target?.id??null,restartType,age:0,shot,saveTried:false,station:{x:b.x,z:b.z}};
      this.emit('kick',shot?'射门':'传球',{player:p.id,team:p.team,action:kind});
      if(target&&p.team===0)this.chooseControl(target);
    }
    tryTackle(p,forced){
      const other=this.players[this.ball.owner];if(!other||!p.active||other.team===p.team||p.duel>0||other.skillTime>0||distance(p,other)>1.65)return;
      p.duel=1.35;this.emit('tackle','抢断',{player:p.id});p.anim='tackle';p.animTime=.4;
      if(this.random()<(forced?.09:.046)){
        this.stats.fouls[p.team]++;const severe=this.random()<.05;
        if(severe||this.random()<.35){p.cards+=severe?2:1;const red=p.cards>=2;p.active=!red;
          this.stats[red?'red':'yellow'][p.team]++;this.emit('card',red?'红牌罚下':'黄牌警告',{player:p.id});}
        if(!severe && p.active && !this.inBox(p,other.x,other.z) && other.vx*this.attackDir(other.team)>2.8 && this.random()<.6){
          this.advantage={team:other.team,x:other.x,z:other.z,left:2.4};this.emit('advantage','进攻有利');
        }else this.setRestart(this.inBox(p,other.x,other.z)?'penalty':'free',other.team,other.x,other.z);
        if(this.playerList(p.team).length<7)this.finishMatch();
      }else if(this.random()<(p.team?this.difficultySettings.tackle:.72)) this.takeBall(p);
    }
    move(p,dx,dz,speed,dt){
      const n=len(dx,dz),factor=Math.min(1,dt*9),s=n>.05?speed/Math.max(1,n):0;
      p.vx=pick(p.vx,dx*s,factor);p.vz=pick(p.vz,dz*s,factor);
      p.x=clip(p.x+p.vx*dt,-LEN+.12,LEN-.12);p.z=clip(p.z+p.vz*dt,-WID+.12,WID-.12);
      if(len(p.vx,p.vz)>.15)p.heading=Math.atan2(p.vz,p.vx);
    }
    playPlayers(dt){
      const b=this.ball,owner=this.players[b.owner],diff=this.difficultySettings;
      const hunt=[0,1].map(t=>this.nearest(t,b.x+b.vx*.2,b.z+b.vz*.2)?.id);
      for(const p of this.players){
        if(!p.active)continue;
        p.animTime-=dt;if(p.animTime<=0)p.anim='idle';p.duel-=dt;p.skillTime-=dt;p.runFor-=dt;p.think-=dt;
        const d=this.attackDir(p.team),controlled=p.id===this.controlled;
        if(controlled){const boost=this.input.sprint||this.sprintBurst>0; p.stamina=clip(p.stamina+dt*(boost?-.007:.004),.47,1);
          if(p.skillTime>0)this.move(p,Math.cos(p.heading),Math.sin(p.heading),6,dt);
          else this.move(p,this.input.x,this.input.z,boost?8.25*(.72+.28*p.stamina):5.75,dt);
          continue;}
        if(p.keeper){const shot=this.kickData?.shot&&this.kickData.team!==p.team;if(shot&&this.kickData.restartType==='penalty'&&this.kickData.age<.07)continue;
          if(owner===p && this.ownerTime>8 && this.inBox(p,b.x,b.z)){this.setRestart('corner',1-p.team,p.x,Math.sign(p.z||1)*WID);return;}
          const tx=d*(-LEN+(shot?.65:clip((b.x*d+LEN)*.095,1,6)));
          this.move(p,tx-p.x,clip(shot?b.z+b.vz*clip(Math.abs(b.x-p.x)/(Math.abs(b.vx)||1),0,1)*.8:b.z*.64,-3.55,3.55)-p.z,shot?7.7:5,dt);
          if(owner===p&&this.ownerTime>.8)this.kick(p,'highPass');continue;}
        const tactic=p.team?0:({attack:7,defend:-7,balanced:0}[this.tactic]);
        let tx,tz,spd=5;
        if(p===owner){
          tx=d*(LEN-1);tz=p.z*.66;spd=5.9*diff.v;
          if(p.think<=0){p.think=diff.reaction+.18;
            const close=distance(p,this.nearest(1-p.team,p.x,p.z,-1,true));
            if((LEN-p.x*d<21&&Math.abs(p.z)<15)||(LEN-p.x*d<9))this.kick(p,'shoot');
            else if((close<4.3||Math.abs(p.z)>18||this.ownerTime>3)&&this.random()<.8)this.kick(p,this.random()<.34?'through':'pass');}
        }else if((p.id===hunt[p.team]&&owner?.team!==p.team)||this.kickData?.target===p.id){
          tx=b.x+clip(b.vx*.22,-3,3);tz=b.z+clip(b.vz*.22,-3,3);spd=7*(p.team?diff.v:1);
          if(owner&&p.team!==owner.team)this.tryTackle(p,false);
        }else{
          const has=owner?.team===p.team||this.kickData?.team===p.team;
          tx=d*clip(p.baseX+(has?14:-5)+b.x*d*.36+tactic+(p.runFor>0?17:0),-47,48);
          tz=clip(p.baseZ*.88+b.z*.25,-31,31);
        }
        if(this.phase!=='live')return;
        this.move(p,tx-p.x,tz-p.z,spd,dt);
      }
    }
    freeBall(dt){
      const b=this.ball,k=this.kickData;if(k)k.age+=dt;
      const speed=len(b.vx,b.vz)||1, prev={x:b.x,y:b.y,z:b.z};
      const ax=-b.vz/speed*b.spin,az=b.vx/speed*b.spin;
      b.vx+=ax*dt;b.vz+=az*dt;b.spin*=Math.exp(-dt*.35);
      b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.vy-=GRAVITY*dt;
      if(b.y<=R){if(b.vy< -1.1)this.emit('bounce','落地',{impact:-b.vy});b.y=R;b.vy=Math.abs(b.vy)>.9?-b.vy*.38:0;const drag=Math.exp(-dt*.72);b.vx*=drag;b.vz*=drag;}
      const last=this.players[this.lastTouch],team=last?.team??0;
      if(Math.abs(prev.x)<LEN && Math.abs(b.x)>=LEN){
        const crossAt=(Math.sign(b.x)*LEN-prev.x)/(b.x-prev.x),height=pick(prev.y,b.y,crossAt),lateral=Math.abs(pick(prev.z,b.z,crossAt));
        if((Math.abs(lateral-GOAL)<R+.06&&height<=BAR+R)||(Math.abs(height-BAR)<R+.06&&lateral<=GOAL+.06)){
          b.x=Math.sign(b.x)*(LEN-R-.07);b.vx*=-.65;b.vz*=.8;b.vy*=.8;this.emit('post','击中门框');return;}}
      if(Math.abs(b.x)>LEN+R){const sign=Math.sign(b.x),t=clip((sign*(LEN+R)-prev.x)/(b.x-prev.x||1),0,1);
        const z=pick(prev.z,b.z,t),y=pick(prev.y,b.y,t),scoring=this.attackDir(0)===sign?0:1;
        if(Math.abs(z)<GOAL-R && y<BAR-R && !['throw','indirect','offside'].includes(k?.restartType) && !(k?.restartType&&k.team!==scoring))this.goal(scoring);
        else this.setRestart(team===scoring?'goalKick':'corner',1-team,b.x,z);return;}
      if(Math.abs(b.z)>WID+R){this.setRestart('throw',1-team,b.x,Math.sign(b.z)*WID);return;}
      if(this.lock>0)return;
      const candidates=this.players.filter(p=>p.active&&(!k||p.id!==k.kicker||k.age>.52)).sort((a,c)=>distance(a,b)-distance(c,b));
      for(const p of candidates){const goalie=p.keeper&&this.inBox(p,b.x,b.z),reach=goalie&&k?.shot?2.12:1;
        if(distance(p,b)>reach||b.y>(goalie?2.35:1.55))continue;
        if(goalie&&k?.shot){if(k.saveTried)continue;k.saveTried=true;p.anim='dive';p.animTime=.75;
          if(this.random()>(p.team?this.difficultySettings.save:.75))continue;this.stats.saves[p.team]++;this.emit('save','门将扑救');}
        if(k?.restartType&&k.kicker===p.id){this.setRestart('indirect',1-p.team,p.x,p.z);return;}
        if(this.offside.has(p.id)){this.stats.offsides[p.team]++;this.setRestart('offside',1-p.team,p.x,p.z);return;}
        this.takeBall(p,!goalie);return;
      }
    }
    capture(){
      this.replayFrames.push({players:this.players.map(p=>({...p})),ball:{...this.ball},controlled:this.controlled});
      if(this.replayFrames.length>77)this.replayFrames.shift();
    }
    goal(team){this.score[team]++;this.scoring=team;const last=this.players[this.lastTouch];this.scorer=last?.team===team?last:this.nearest(team,this.ball.x,this.ball.z);if(this.scorer)this.scorer.goals++;
      if(this.mode!=='match'&&team===0)this.practice.goals++;
      this.capture();this.phase='goal';this.stageTime=0;this.emit('goal','进球',{team,player:this.scorer?.id});}
    startReplay(){this.phase='replay';this.stageTime=0;this.replayView=this.replayFrames[0];}
    sampleReplay(position){
      const i=Math.floor(position),a=this.replayFrames[i],b=this.replayFrames[i+1]||a,f=position-i;
      this.replayView={controlled:a.controlled,ball:{...a.ball},players:a.players.map(p=>({...p}))};
      const lerpPosition=(p,q)=>{p.x=pick(p.x,q.x,f);p.z=pick(p.z,q.z,f);};
      lerpPosition(this.replayView.ball,b.ball);this.replayView.ball.y=pick(a.ball.y,b.ball.y,f);
      for(const p of this.replayView.players){const q=b.players[p.id];lerpPosition(p,q);p.heading+=f*Math.atan2(Math.sin(q.heading-p.heading),Math.cos(q.heading-p.heading));}
    }
    newHalf(){this.half=2;this.clock=2700;this.added=0;this.addedPosted=false;this.resetFormation();this.setRestart('kickoff',1,0,0);}
    finishMatch(){this.phase='fulltime';this.emit('end','终场');}
    afterGoal(){this.replayView=null;this.replayFrames=[];if(this.mode!=='match')this.practiceRestart();else this.setRestart('kickoff',1-this.scoring,0,0);}

    update(dt,input={}){
      dt=clip(dt,0,.1);this.stageTime+=dt;this.elapsed+=dt;this.input={x:input.x||0,z:input.z||0,sprint:!!input.sprint};
      if((this.phase==='goal'||this.phase==='replay')&&this.mode==='match')this.clock+=dt*6;
      if(this.phase==='goal'){if(this.stageTime>2.6)this.startReplay();return;}
      if(this.phase==='replay'){const i=Math.floor(this.stageTime*11);if(i>=this.replayFrames.length)this.afterGoal();else this.sampleReplay(Math.min(this.stageTime*11,this.replayFrames.length-1));return;}
      if(this.phase==='attempt'){if(this.stageTime>1.2)this.practiceRestart();return;}
      if(this.phase==='halftime'||this.phase==='fulltime')return;
      if(this.mode==='match'){
        this.clock+=dt*6;
        if(!this.addedPosted && this.phase==='restart' && this.stageTime>1.5)this.added=Math.min(120,this.added+dt*1.5);
        if(this.clock>=this.half*2700 && !this.addedPosted){this.addedPosted=true;this.added=Math.ceil(this.added/60)*60;if(this.added)this.emit('added','补时 '+this.added/60+' 分钟');}
        if(this.clock>=this.half*2700+this.added && this.restart?.type!=='penalty' && this.kickData?.restartType!=='penalty'){
          if(this.half===1){this.phase='halftime';this.applySubs(0,true);this.applySubs(1,true);this.emit('half','中场休息');}else this.finishMatch();return;}}
      if(this.phase==='restart'){
        this.recordIn-=dt;if(this.recordIn<=0&&this.replayFrames.length<20){this.capture();this.recordIn=.1;}
        if(this.restart.team===1&&this.stageTime>1.35)this.startRestart(['free','penalty'].includes(this.restart.type)&&Math.abs(this.ball.x)>24?'shoot':this.restart.type==='corner'?'highPass':'pass');
        return;}
      this.recordIn-=dt;if(this.recordIn<=0){this.capture();this.recordIn=1/14;}
      this.lock-=dt;this.sprintBurst-=dt;this.ownerTime+=dt;
      if(this.advantage){this.advantage.left-=dt;const carrying=this.players[this.ball.owner];
        if(carrying&&carrying.team!==this.advantage.team){const a=this.advantage;this.setRestart('free',a.team,a.x,a.z);return;}
        if(this.advantage.left<=0)this.advantage=null;}
      this.manualSwitch=Math.max(0,(this.manualSwitch||0)-dt);
      const near=this.nearest(0,this.ball.x,this.ball.z);
      if(this.ball.owner!=null&&this.players[this.ball.owner].team===1&&this.manualSwitch===0&&near&&distance(this.selected,this.ball)>distance(near,this.ball)+5.5)this.chooseControl(near);
      this.playPlayers(dt);
      if(this.phase==='live')for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++){
        const a=this.players[i],b=this.players[j];if(!a.active||!b.active)continue;
        const dx=b.x-a.x,dz=b.z-a.z,d=len(dx,dz);if(d>0&&d<.64){const step=(.64-d)*Math.min(.4,dt*12)/d;
          if(a.id!==this.controlled){a.x=clip(a.x-dx*step,-LEN+.2,LEN-.2);a.z=clip(a.z-dz*step,-WID+.2,WID-.2);}
          if(b.id!==this.controlled){b.x=clip(b.x+dx*step,-LEN+.2,LEN-.2);b.z=clip(b.z+dz*step,-WID+.2,WID-.2);}}
      }
      if(this.phase!=='live')return;
      const owner=this.players[this.ball.owner];if(owner){this.syncBall(owner);this.possession[owner.team]+=dt;
        const b=this.ball;
        if(Math.abs(b.z)>WID+R)this.setRestart('throw',1-owner.team,b.x,Math.sign(b.z)*WID);
        else if(Math.abs(b.x)>LEN+R){const t=this.attackDir(0)===Math.sign(b.x)?0:1;
          if(Math.abs(b.z)<GOAL-R)this.goal(t);else this.setRestart(owner.team===t?'goalKick':'corner',1-owner.team,b.x,b.z);}
      }
      else this.freeBall(dt);
      if(this.mode!=='match'&&this.phase==='live'){this.practiceTime-=dt;if(this.practiceTime<=0||this.players[this.ball.owner]?.team===1)this.endPracticeAttempt('本轮结束');}
    }
  }
  WC.Sim=Sim;
})(window);
