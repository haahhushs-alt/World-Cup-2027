(() => {
  'use strict';
  const WC = window.WC = window.WC || {};
  const storeKey = 'wc2027.controller.v1';
  const names = {
    shoot:'射门', chip:'挑射', curve:'弧线球', fake:'假射', power:'暴力射门',
    pass:'短传', highPass:'高传', halfPass:'半高球', oneTwo:'传球后跑位',
    through:'直塞', powerThrough:'大力直塞', loftThrough:'高球直塞',
    sprint:'冲刺', tackle:'断球', switch:'切换球员', skill:'花式',
    skillLeft:'向左变向', skillRight:'向右变向', stepover:'踩单车', pullback:'回拉',
    camera:'切换视角', tactic:'切换战术', pause:'暂停'
  };
  const tactics = { defend:'防守', balanced:'平衡', attack:'进攻' };
  const labels = ['A','B','X','Y','LB','RB','LT','RT','View','Menu','L3','R3','↑','↓','←','→','Xbox'];
  const defaults = {
    attack:{pass:'0',shoot:'1',highPass:'2',through:'3',switch:'4',skill:'5',sprint:'7',chip:'6+1',curve:'6+2',oneTwo:'6+0',loftThrough:'6+3',power:'6+7',fake:'10',halfPass:'12',powerThrough:'13',camera:'8',tactic:'15',pause:'9'},
    defend:{tackle:'1',switch:'0',sprint:'7',camera:'8',tactic:'15',pause:'9'}
  };
  const settingsDefault = () => ({attack:{...defaults.attack},defend:{...defaults.defend},deadzone:.14,sensitivity:1});
  const gestures = {
    shoot:{up:'chip',down:'curve',left:'fake',right:'power'},
    pass:{up:'highPass',down:'oneTwo',left:'power',right:'halfPass'},
    through:{up:'loftThrough',left:'powerThrough'},
    skill:{up:'stepover',down:'pullback',left:'skillLeft',right:'skillRight'}
  };
  const arrows = {up:'↑',down:'↓',left:'←',right:'→'};
  const keyMap = {KeyJ:'pass',KeyK:'shoot',KeyI:'through',KeyL:'skill',KeyU:'switch',KeyO:'highPass',KeyT:'tactic',KeyV:'camera',Escape:'pause',Space:'tackle'};
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const boundLabel = key => (key || '').split('+').filter(Boolean).map(k => k.startsWith('extra:') ? k.slice(6) : labels[Number(k)] ?? '键 '+k).join(' + ') || '未绑定';
  const button = (text, type, title='') => '<button type="button" data-cmd="'+type+'" aria-label="'+(title||text)+'">'+text+'</button>';
  let native = window._wcNativePad || null;
  const nativeListeners = new Set();
  function receiveNative(data) {
    if (!data) return;
    native = data;
    for (const listener of nativeListeners) listener(data);
  }
  WC.nativePad = receiveNative;
  window.addEventListener('wc-native-gamepad', e => receiveNative(e.detail));
  function readSettings() {
    const s=settingsDefault();
    try {
      const saved=JSON.parse(localStorage.getItem(storeKey));
      if (saved) {
        for(const k of ['attack','defend']) if(saved[k] && typeof saved[k]==='object') {
          for(const action of Object.keys(s[k])) if(typeof saved[k][action]==='string') s[k][action]=saved[k][action];
        }
        s.deadzone=clamp(Number(saved.deadzone)||0,0,.45);
        s.sensitivity=clamp(Number(saved.sensitivity)||1,.5,1.5);
      }
    } catch {}
    return s;
  }
  function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
  function valueMap(pad) {
    const values={};
    Array.from(pad.buttons||[]).forEach((b,i)=>{values[String(i)]=typeof b==='number'?b:b?.value||0;});
    for(const [key,val] of Object.entries(pad.extras||{})) values['extra:'+key]=Number(val)||0;
    return values;
  }
  function sameLayerNavigation(layer, dx, dy) {
    const items = Array.from(layer.querySelectorAll('button:not(:disabled), input[type=range]:not(:disabled), [tabindex="0"]')).filter(el=>el.offsetWidth && el.offsetHeight && getComputedStyle(el).visibility==='visible' && !el.closest('[hidden]'));
    if (!items.length) return;
    const active=document.activeElement;
    if (!items.includes(active)) { items[0].focus();return; }
    if (active.matches('input[type=range]') && dx) {
      active.value=clamp(Number(active.value)+Number(active.step)*dx,Number(active.min),Number(active.max));active.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    const r=active.getBoundingClientRect(), cx=r.x+r.width/2,cy=r.y+r.height/2;
    let best=null,bestDistance=Infinity;
    for(const el of items) {
      if(el===active) continue;
      const q=el.getBoundingClientRect(), x=q.x+q.width/2-cx,y=q.y+q.height/2-cy;
      const along=x*dx+y*dy, across=Math.abs(x*dy-y*dx);
      if(along<=3 || across>along*2.2) continue;
      const distance=along+across*2.3;
      if(distance<bestDistance){best=el;bestDistance=distance;}
    }
    (best||active).focus();
  }
  class Controls {
    constructor(callbacks={}) {
      this.cb=callbacks; this.visible=false; this.method='touch'; this.settings=readSettings();
      this.settingsTab='attack'; this.keys=new Set(); this.stick={x:0,y:0};
      this.fingers=new Map(); this.previous={}; this.nextArrow=0; this.arrowWas=''; this.heldSprint=false;
      this.abort=new AbortController();this.signal=this.abort.signal;
      this.root=document.createElement('div');this.root.className='wc-overlay';this.root.hidden=true;
      this.root.innerHTML=`
        <div class="wc-score-wrap"><div class="wc-score" aria-label="比分">
          <span class="wc-team wc-home"></span><strong class="wc-result">0 : 0</strong><span class="wc-team wc-away"></span>
        </div><div class="wc-time"><span class="wc-clock">00′00″</span><span class="wc-period"></span></div></div>
        <div class="wc-top-actions">
          ${button('平衡','tactic','切换战术')}${button('转播','camera','切换视角')}
          ${button('<i></i><i></i>','pause','暂停比赛')}
        </div>
        <div class="wc-beat" role="status"><small></small><strong></strong><span></span></div>
        <button type="button" class="wc-skip" data-cmd="skip" hidden>跳过 ›</button>
        <div class="wc-player-tag"><b></b><span></span></div>
        <div class="wc-stick"><i></i><b></b></div>
        <div class="wc-action-set">
          ${['shoot','pass','through','sprint','skill','switch'].map(type=>'<button type="button" data-touch="'+type+'" class="wc-act wc-act-'+type+'"><small></small><b>'+({sprint:'冲刺',pass:'传球',switch:'切人'}[type]||names[type])+'</b></button>').join('')}
        </div>
        <div class="wc-swipe-preview"></div><div class="wc-pad-help"></div><div class="wc-toast"></div>`;
      document.body.append(this.root);
      this.$=q=>this.root.querySelector(q);
      this.refs={};
      for(const cls of ['home','away','result','clock','period','beat','player-tag','pad-help','toast','stick','swipe-preview','skip']) this.refs[cls]=this.$('.wc-'+cls);
      this.root.addEventListener('click',e=>{const c=e.target.closest('[data-cmd]');if(c) this.dispatch(c.dataset.cmd);},{signal:this.signal});
      this.installTouch();
      document.addEventListener('pointerdown',e=>{if(this.visible&&e.pointerType==='touch')this.pressMethod('touch');},{capture:true,signal:this.signal});
      this.onNative=p=>this.readPad(p,true);nativeListeners.add(this.onNative);
      window.addEventListener('keydown',e=>this.keyEvent(e,true),{signal:this.signal});
      window.addEventListener('keyup',e=>this.keyEvent(e,false),{signal:this.signal});
      window.addEventListener('blur',()=>this.clearInput(),{signal:this.signal});
      window.addEventListener('gamepaddisconnected',e=>{if(!native?.connected && (!this.padId || this.padId===e.gamepad.id)) this.readPad(null,false);},{signal:this.signal});
      this.root.addEventListener('contextmenu',e=>e.preventDefault(),{signal:this.signal});
      WC.openBindings=()=>this.openSettings();
    }
    pressMethod(s) {
      if(this.method===s) return;
      this.method=s;this.root.dataset.method=s;
      if(s!=='touch') this.resetTouches();
    }
    installTouch() {
      const zone=this.refs.stick,tip=this.refs['swipe-preview'];
      const pointer=(type,fn)=>this.root.addEventListener(type,fn,{signal:this.signal});
      pointer('pointerdown',e=>{
        if(this.dialog||!this.visible)return;
        this.pressMethod('touch');
        const el=e.target.closest('[data-touch],.wc-stick');
        if(!el)return;
        const action=el.dataset.touch || 'stick';
        if(action==='sprint' && this.playerOwnsBall())this.dispatch('sprint');
        if(action==='stick' && [...this.fingers.values()].some(f=>f.action==='stick'))return;
        e.preventDefault(); el.setPointerCapture?.(e.pointerId);
        const f={el,action,started:performance.now(),x:e.clientX,y:e.clientY,dir:'',radius:el.offsetWidth,def:action==='sprint'&&!this.playerOwnsBall()};
        this.fingers.set(e.pointerId,f);
        el.classList.add('wc-pressed');
        if(action==='stick') this.moveStick(e,zone);
        if(action==='sprint' && f.def) this.dispatch('tackle');
      });
      pointer('pointermove',e=>{
        const f=this.fingers.get(e.pointerId);if(!f)return;
        e.preventDefault();
        if(f.action==='stick') {this.moveStick(e,zone);return;}
        const x=e.clientX-f.x,y=e.clientY-f.y;
        f.dir=Math.hypot(x,y)>clamp(f.radius*.28,14,28) ? (Math.abs(x)>Math.abs(y)?(x>0?'right':'left'):(y>0?'down':'up')):'';
        const move=gestures[f.action]?.[f.dir];
        tip.textContent=move ? arrows[f.dir]+'  '+names[move] : '';
        tip.classList.toggle('wc-on',!!move);
      });
      const release=(e,cancelled)=>{
        const f=this.fingers.get(e.pointerId);if(!f)return;
        if(!cancelled && f.action!=='stick') {
          const dx=e.clientX-f.x,dy=e.clientY-f.y;
          f.dir=Math.hypot(dx,dy)>clamp(f.radius*.28,14,28)?(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up')):'';
        }
        this.fingers.delete(e.pointerId);
        if(![...this.fingers.values()].some(v=>v.el===f.el))f.el.classList.remove('wc-pressed');
        tip.classList.remove('wc-on');
        if(f.action==='stick'){this.resetStick();return;}
        if(cancelled || f.action==='sprint') return;
        const act=f.dir ? gestures[f.action]?.[f.dir] : f.action;
        if(act){this.dispatch(act,f.action==='shoot'?Math.min(1,.48+(performance.now()-f.started)/1400):.65);if(f.dir)this.notify(names[act],800);}
      };
      pointer('pointerup',e=>release(e,false));
      pointer('pointercancel',e=>release(e,true));
      pointer('lostpointercapture',e=>release(e,true));
    }
    moveStick(e,el) {
      const r=el.getBoundingClientRect(),radius=r.width*.39;
      let x=(e.clientX-r.x-r.width/2)/radius,y=(e.clientY-r.y-r.height/2)/radius;
      const n=Math.max(1,Math.hypot(x,y));this.stick={x:x/n,y:y/n};
      el.style.setProperty('--sx',this.stick.x*radius+'px');el.style.setProperty('--sy',this.stick.y*radius+'px');
    }
    resetStick(){this.stick={x:0,y:0};this.refs.stick.style.setProperty('--sx','0px');this.refs.stick.style.setProperty('--sy','0px');}
    resetTouches(){
      this.fingers.forEach(f=>f.el.classList.remove('wc-pressed'));this.fingers.clear();
      this.resetStick();this.refs['swipe-preview'].classList.remove('wc-on');
    }
    clearInput(){this.resetTouches();this.keys.clear();this.heldSprint=false;}
    keyEvent(e,down) {
      if(this.dialog){
        if(down && e.code==='Escape'){e.preventDefault();if(this.listening){this.listening='';this.paintSettings();}else this.closeSettings();}
        return;
      }
      if(!this.visible || e.target.matches('input, textarea'))return;
      const action=keyMap[e.code],move=['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight'].includes(e.code);
      if (!action&&!move) return;
      e.preventDefault();
      if(down){this.keys.add(e.code);this.pressMethod('keyboard');if(!e.repeat&&action)this.dispatch(action);}
      else this.keys.delete(e.code);
    }
    dispatch(action,power=.65) {
      if(!this.visible || this.dialog || !action) return;
      if(this.sim?.players[this.sim.ball.owner]?.team===1){if(action==='shoot')action='tackle';else if(action==='pass')action='switch';}
      if(action==='pause') this.cb.pause?.();
      else if(action==='camera') this.cb.camera?.();
      else if(action==='tactic'){
        const keys=['defend','balanced','attack'];
        const next=keys[(keys.indexOf(this.sim?.tactic||'balanced')+1)%3];this.cb.tactic?.(next);this.notify('战术 · '+tactics[next]);
      } else this.cb.action?.(action,power);
    }
    playerOwnsBall(){return this.sim?.ball?.owner===this.sim?.controlled;}
    profile() {
      const p=this.sim?.players?.[this.sim?.ball?.owner];
      if(this.sim?.phase==='restart')return this.sim.restart?.team===1?'defend':'attack';
      return p ? (p.team===1?'defend':'attack') : this.lastProfile||'attack';
    }
    poll() {
      if(native?.connected) this.readPad(native,true);
      else {
        let pad;try{pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);}catch{}
        this.readPad(pad||null,false);
      }
      if(!this.visible || this.dialog) return {x:0,y:0,sprint:false};
      let {x,y}=this.stick;
      if(this.method==='pad' && this.pad) {
        const a=this.pad.axes||[],px=Number(a[0])||0,py=Number(a[1])||0,m=Math.hypot(px,py),d=this.settings.deadzone;
        if(m>d){const t=clamp((m-d)/(1-d)*this.settings.sensitivity,0,1)/m;x=px*t;y=py*t;}
      } else if(this.method==='keyboard'){
        const has=(...keys)=>Number(keys.some(k=>this.keys.has(k)));
        x=has('KeyD','ArrowRight')-has('KeyA','ArrowLeft');y=has('KeyS','ArrowDown')-has('KeyW','ArrowUp');
        const n=Math.max(1,Math.hypot(x,y));x/=n;y/=n;
      }
      const sprint=[...this.fingers.values()].some(f=>f.action==='sprint')||(this.method==='pad' && this.heldSprint)||this.keys.has('ShiftLeft')||this.keys.has('ShiftRight');
      return {x,y,sprint};
    }
    readPad(pad,isNative) {
      if(!pad || pad.connected===false){
        if(this.padId){this.padId='';this.pad=null;this.previous={};this.heldSprint=false;this.stickFlick=false;this.pressMethod('touch');if(this.visible){this.notify('手柄已断开');this.cb.disconnect?.();}if(this.dialog)this.paintSettings();}
        return;
      }
      const fresh=!this.padId || this.padId!==pad.id;
      this.pad=pad;this.padId=pad.id||'Gamepad';
      const values=valueMap(pad),edges=Object.keys(values).filter(k=>values[k]>.5 && !(this.previous[k]>.5));
      const releasedLT=this.previous['6']>.5 && !(values['6']>.5);
      this.previous=values;
      const axes=pad.axes||[],lx=axes[0]||0,ly=axes[1]||0;
      if(fresh || edges.length || Math.hypot(lx,ly)>.28 || Math.hypot(axes[2]||0,axes[3]||0)>.55) this.pressMethod('pad');
      if(fresh && this.dialog)this.paintSettings();
      const now=performance.now();
      if(this.dialog && this.listening){
        if(now<this.listenAfter)return;
        const key=edges.find(k=>k!=='6');
        if(key)this.bindKey(values['6']>.5?'6+'+key:key);
        else if(releasedLT)this.bindKey('6');
        return;
      }
      if(this.dialog || !this.visible){
        const layer=this.dialog||document.querySelector('#menu');
        if(!layer || layer.hidden || !layer.getClientRects().length)return;
        const horizontal=(values['15']>.5?1:0)-(values['14']>.5?1:0) || (Math.abs(lx)>.55?Math.sign(lx):0);
        const vertical=(values['13']>.5?1:0)-(values['12']>.5?1:0) || (Math.abs(ly)>.55?Math.sign(ly):0);
        const dx=(horizontal && (!vertical || Math.abs(lx)>Math.abs(ly)))?horizontal:0,dy=dx?0:vertical,dir=dx+','+dy;
        if((dx||dy) && (dir!==this.arrowWas || now>=this.nextArrow)){sameLayerNavigation(layer,dx,dy);this.nextArrow=now+(dir!==this.arrowWas?350:175);}
        this.arrowWas=dir;
        if(edges.includes('0')) {
          if(!layer.contains(document.activeElement))sameLayerNavigation(layer,0,1);
          const focused=document.activeElement;if(layer.contains(focused)&&focused?.matches('button'))focused.click();
        }else if(edges.includes('1') || edges.includes('9')) {
          if(this.dialog)this.closeSettings();
          else if(WC.Menu?.back) WC.Menu.back();
          else layer.querySelector('[data-pad-back]')?.click();
        }
        return;
      }
      const profile=this.profile(),mapping=this.settings[profile];
      const chord=values['6']>.5;
      this.heldSprint=this.bindingHeld(mapping.sprint,values,mapping,chord);
      for(const key of edges){
        if(key==='6' && Object.values(mapping).some(b=>b.startsWith('6+')))continue;
        let act=Object.keys(mapping).find(a=>chord && mapping[a]==='6+'+key);
        if(!act) act=Object.keys(mapping).find(a=>mapping[a]===key);
        if(!act)continue;
        if(act==='sprint'){if(!this.playerOwnsBall())this.dispatch('tackle');}
        else if((this.sim?.phase==='goal'||this.sim?.phase==='replay') && key==='0')this.dispatch('skip');
        else this.dispatch(act);
      }
      if(releasedLT && !this.usedChord) {
        const act=Object.keys(mapping).find(a=>mapping[a]==='6');
        if(act && act!=='sprint')this.dispatch(act);
      }
      if(chord && edges.some(k=>k!=='6'))this.usedChord=true;
      if(!chord)this.usedChord=false;
      const rx=axes[2]||0,ry=axes[3]||0,r=Math.hypot(rx,ry);
      if(r>.78 && !this.stickFlick) {
        this.stickFlick=true;
        this.dispatch(Math.abs(rx)>Math.abs(ry)?(rx<0?'skillLeft':'skillRight'):(ry<0?'stepover':'pullback'));
      }else if(r<.38)this.stickFlick=false;
    }
    bindingHeld(binding,values,map,lt) {
      if (!binding) return false;
      if(!binding.includes('+') && lt && Object.values(map).includes('6+'+binding))return false;
      return binding.split('+').every(k=>values[k]>.5);
    }
    show(flag){
      this.visible=!!flag;this.root.hidden=!this.visible;this.clearInput();
      this.refs.beat.hidden=true;this.refs.skip.hidden=true;this.bannerKey='';
      if(!flag)this.refs.toast.classList.remove('wc-on');
    }
    update(sim,info={}) {
      if(!sim)return;
      this.sim=sim;this.lastProfile=this.profile();
      if(!this.visible)return;
      const r=this.refs;
      const set=(el,t)=>{if(el.textContent!==t)el.textContent=t;};
      const team=(t,def)=>typeof t==='object'?(t.short||t.name||def):(t||def);
      set(r.home,team(info.home,'主队'));set(r.away,team(info.away,'客队'));
      set(r.result,sim.score[0]+' : '+sim.score[1]);
      const s=Math.max(0,Math.floor(sim.clock||0));
      set(r.clock,String(Math.floor(s/60)).padStart(2,'0')+'′'+String(s%60).padStart(2,'0')+'″');
      set(r.period,sim.mode!=='match'?(sim.mode==='penalty'?'点球':'任意球')+' · '+sim.practice.goals+'/'+sim.practice.attempts:sim.half===2?'下半场':'上半场');
      set(this.$('[data-cmd="tactic"]'),tactics[sim.tactic]||'平衡');
      set(this.$('[data-cmd="camera"]'),info.camera==='first'?'第一人称':'转播');
      const p=sim.players[sim.controlled],tag=r['player-tag'];
      if(p){set(tag.firstElementChild,String(p.number||''));set(tag.lastElementChild,p.name||'');}
      set(this.$('[data-touch="sprint"] b'),this.playerOwnsBall()?'冲刺':'冲刺 / 断球');
      const owner=sim.players[sim.ball.owner],defending=owner?.team===1;
      set(this.$('[data-touch="shoot"] b'),defending?'抢断':'射门');
      set(this.$('[data-touch="pass"] b'),defending?'切换':'传球');
      const phase=sim.phase;
      const label=phase==='goal'?['GOAL','进球！']:phase==='replay'?['REPLAY','进球回放']:null;
      const key=label?phase:'';
      if(key!==this.bannerKey){this.bannerKey=key;r.beat.hidden=!label;r.skip.hidden=!label;if(label){set(r.beat.children[0],label[0]);set(r.beat.children[1],label[1]);set(r.beat.children[2],r.result.textContent);}}
      if(this.method==='pad') {
        const map=this.settings[this.lastProfile],actions=this.lastProfile==='attack'?['pass','shoot','through','sprint']:['switch','tackle','sprint'];
        set(r['pad-help'],actions.map(a=>boundLabel(map[a])+' '+names[a]).join('    '));
      } else if(this.method==='keyboard')set(r['pad-help'],'WASD 移动    J 短传    K 射门    I 直塞    Shift 冲刺    Esc 暂停');
    }
    notify(text,ms=1700){
      if(!text)return;const el=this.refs.toast;el.textContent=text;el.classList.add('wc-on');
      clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('wc-on'),ms);
    }
    openSettings(onClose) {
      if(this.dialog)return;
      this.closeCallback=typeof onClose==='function'?onClose:null;this.previousFocus=document.activeElement;
      this.clearInput();this.dialog=document.createElement('div');this.dialog.className='wc-bindings';this.dialog.setAttribute('role','dialog');this.dialog.setAttribute('aria-modal','true');this.dialog.setAttribute('aria-label','手柄键位');document.body.append(this.dialog);
      this.dialog.addEventListener('click',e=>{
        const b=e.target.closest('button');if(!b)return;
        if(b.dataset.tab){this.settingsTab=b.dataset.tab;this.listening='';this.paintSettings();}
        else if(b.dataset.bind){this.listening=b.dataset.bind;this.listenAfter=performance.now()+220;this.paintSettings();}
        else if(b.dataset.close){this.closeSettings();}
        else if(b.dataset.cancel){this.listening='';this.paintSettings();}
        else if(b.dataset.reset){
          this.settings=settingsDefault();this.saveSettings();this.listening='';this.paintSettings();
        }
      });
      this.dialog.addEventListener('input',e=>{
        const key=e.target.dataset.range;if(!key)return;
        this.settings[key]=Number(e.target.value);
        this.dialog.querySelector('output[data-val="'+key+'"]').textContent=this.rangeText(key);this.saveSettings();
      });
      this.paintSettings();
    }
    rangeText(key){return key==='deadzone'?Math.round(this.settings[key]*100)+'%':this.settings[key].toFixed(2)+'×';}
    paintSettings(){
      const dlg=this.dialog;if(!dlg)return;
      const tab=this.settingsTab, map=this.settings[tab];
      const previous=dlg.querySelector('.wc-bind-list')?.scrollTop||0;
      const active=document.activeElement?.dataset?.bind||'';
      dlg.innerHTML=`
        <div class="wc-bind-panel"><header><div><small>CONTROLLER</small><h2>手柄键位</h2></div>
        <button type="button" data-close="1" aria-label="关闭键位设置">完成</button></header>
        <div class="wc-device"><i class="${this.padId?'connected':''}"></i>${escapeHTML(this.padId||'等待连接手柄')}</div>
        <div class="wc-bind-body"><div class="wc-bind-main"><nav>
        ${['attack','defend'].map(k=>'<button type="button" data-tab="'+k+'" aria-pressed="'+(k===tab)+'">'+(k==='attack'?'进攻':'防守')+'</button>').join('')}
        </nav><div class="wc-bind-list">${Object.entries(map).map(([a,k])=>'<button type="button" class="wc-bind-row" data-bind="'+a+'"><span>'+names[a]+'</span><kbd>'+escapeHTML(boundLabel(k))+'</kbd></button>').join('')}</div></div>
        <aside><h3>摇杆</h3><label>死区 <output data-val="deadzone">${this.rangeText('deadzone')}</output><input type="range" data-range="deadzone" min="0" max=".45" step=".01" value="${this.settings.deadzone}"></label>
        <label>灵敏度 <output data-val="sensitivity">${this.rangeText('sensitivity')}</output><input type="range" data-range="sensitivity" min=".5" max="1.5" step=".05" value="${this.settings.sensitivity}"></label>
        <p>选中动作，再按手柄上的键。按住 LT 可组合绑定。</p><button type="button" data-reset="1">恢复默认键位</button></aside></div>
        ${this.listening?'<div class="wc-listening"><small>按键识别中</small><strong>'+names[this.listening]+'</strong><p>请按下要绑定的手柄按键</p><button type="button" data-cancel="1">取消</button></div>':''}</div>`;
      dlg.querySelector('.wc-bind-list').scrollTop=previous;
      const focus=dlg.querySelector(this.listening?'[data-cancel]':active?'[data-bind="'+active+'"]':'[data-tab="'+tab+'"]');focus?.focus({preventScroll:true});
    }
    bindKey(key){
      const action=this.listening,map=this.settings[this.settingsTab],old=map[action]||'';
      const other=Object.keys(map).find(a=>a!==action && map[a]===key);
      if(other)map[other]=old;
      map[action]=key;this.listening='';this.saveSettings();this.paintSettings();
      this.dialog?.querySelector('[data-bind="'+action+'"]')?.focus({preventScroll:true});
    }
    saveSettings(){try{localStorage.setItem(storeKey,JSON.stringify(this.settings));}catch{}}
    closeSettings(){
      if(!this.dialog)return;
      this.dialog.remove();this.dialog=null;this.listening='';this.previousFocus?.focus?.({preventScroll:true});this.closeCallback?.();this.closeCallback=null;
    }
    destroy(){
      this.closeSettings();clearTimeout(this.toastTimer);this.abort.abort();nativeListeners.delete(this.onNative);this.root.remove();
    }
  }
  WC.Controls=Controls;
})();
