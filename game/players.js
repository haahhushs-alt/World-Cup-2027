/* World Cup 2027 · match-day character rig. Forward is +Z, dimensions in metres. */
(() => {
  'use strict';
  const WC = window.WC = window.WC || {};
  const T = window.THREE;
  if (!T) throw new Error('Load Three.js before the player models');
  const TAU = Math.PI * 2;
  const white = '#ffffff';
  const skins = ['#6c4032', '#d89d7d', '#a66548', '#edb299', '#83503e', '#bd876a', '#53352e', '#e3ae88'];
  const hairs = ['#25201e', '#382722', '#15191c', '#674633', '#262025', '#3d3029', '#35251f'];
  const bootColors = ['#fc6948', '#cfeb59', '#eee9de', '#4bc8d0', '#242b3c', '#e993c8'];
  const colorCache = new Map();
  const ncolor = v => {
    const key = v && v.isColor ? '#' + v.getHexString() : v;
    if (!colorCache.has(key)) colorCache.set(key, new T.Color(key));
    return colorCache.get(key);
  };
  const mix = (a, b, t) => '#' + ncolor(a).clone().lerp(ncolor(b), t).getHexString();
  const css = v => '#' + ncolor(v).getHexString();
  const clamp = (v, a, b) => Math.max(a, Math.min(v, b));
  const choose = (list, v) => list[((v % list.length) + list.length) % list.length];
  function seedFor(value) {
    let n = 0x811c9dc5;
    for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }

  // Body pieces share one skinned draw call. Each ring includes a slightly different
  // radius, centre and colour to shape the jaw, muscles, tailoring and footwear.
  class Sculpt {
    constructor() {
      this.positions = []; this.colors = []; this.indices = [];
      this.weights = []; this.joints = []; this.uvs = [];
      this.bones = []; this.offsets = [];
    }
    bone(name, parent, x, y, z) {
      const index = this.bones.length, bone = new T.Bone();
      bone.name = name; bone.position.set(x,y,z);
      if (parent >= 0) this.bones[parent].add(bone);
      this.bones.push(bone);
      const origin = parent >= 0 ? this.offsets[parent] : [0,0,0];
      this.offsets.push([origin[0]+x, origin[1]+y, origin[2]+z]);
      return index;
    }
    vertex(bone, x, y, z, shade, uv) {
      const origin = this.offsets[bone], color = ncolor(shade);
      const i = this.positions.length / 3;
      this.positions.push(x+origin[0], y+origin[1], z+origin[2]);
      this.colors.push(color.r, color.g, color.b);
      this.weights.push(1,0,0,0); this.joints.push(bone,0,0,0);
      this.uvs.push(...(uv || [0.005,0.995]));
      return i;
    }
    // Rows are [y, radiusX, radiusZ, centreX, centreZ, optional colour].
    loft(bone, rows, shade, segments = 14) {
      const start = this.positions.length / 3;
      for (const [y, rx, rz, x=0, z=0, tint=shade] of rows) {
        for (let s=0; s<segments; s++) {
          const a=s*TAU/segments;
          this.vertex(bone, x+Math.sin(a)*rx, y, z+Math.cos(a)*rz, tint);
        }
      }
      for (let r=1; r<rows.length; r++) for (let s=0; s<segments; s++) {
        const a=start+(r-1)*segments+s, b=start+(r-1)*segments+(s+1)%segments;
        this.indices.push(a,b,b+segments,a,b+segments,a+segments);
      }
      for (let i=1; i<segments-1; i++) {
        const last=start+(rows.length-1)*segments;
        this.indices.push(start,start+i+1,start+i,last,last+i,last+i+1);
      }
      return this;
    }
    oval(bone,x,y,z,rx,ry,rz,shade,segments=10,layers=6) {
      const rows=[];
      for(let k=0;k<=layers;k++) {
        const a = -Math.PI/2+k*Math.PI/layers;
        rows.push([y+ry*Math.sin(a),rx*Math.max(.018,Math.cos(a)),rz*Math.max(.018,Math.cos(a)),x,z]);
      }
      this.loft(bone,rows,shade,segments);
    }
    quad(bone,points,shade,uv=null) {
      const i=this.positions.length/3;
      for(let n=0;n<4;n++) this.vertex(bone,...points[n],shade,uv?.[n]);
      this.indices.push(i,i+1,i+2,i,i+2,i+3);
    }
    geometry() {
      const g=new T.BufferGeometry();
      for (const [name,data,size] of [['position',this.positions,3],['color',this.colors,3],['uv',this.uvs,2],['skinWeight',this.weights,4]]) {
        g.setAttribute(name,new T.Float32BufferAttribute(data,size));
      }
      g.setAttribute('skinIndex',new T.Uint16BufferAttribute(this.joints,4)); g.setIndex(this.indices);
      g.computeVertexNormals(); g.computeBoundingSphere();
      return g;
    }
  }

  // One canvas holds the shirt's front and back graphics. Neck trim and sleeve piping
  // are geometric so that the silhouette and trim are still readable under stadium lights.
  function makeKit(number, name, kit, trim, team, keeper) {
    const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=256;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='white'; ctx.fillRect(0,0,512,256);
    const ink = ncolor(kit).getHSL({h:0,s:0,l:0}).l > .52 ? '#15232a' : '#fff8db';
    for (let side=0; side<2; side++) {
      const x=side*240+12, y=8, w=228, h=240;
      ctx.save(); ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
      ctx.fillStyle=css(kit); ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=mix(kit,white,.035);ctx.lineWidth=1;
      for(let k=-260;k<250;k+=6) {ctx.beginPath();ctx.moveTo(x+k,y);ctx.lineTo(x+k+170,y+h);ctx.stroke();}
      if (!side) {
        if(team===0 && !keeper) {
          ctx.fillStyle=mix(kit,trim,.12);
          for(let k=0;k<5;k++) ctx.fillRect(x+18+k*43,y,11,h);
        } else {
          ctx.fillStyle=mix(kit, trim, keeper?.20:.13);
          ctx.beginPath();ctx.moveTo(x-100,y+40);ctx.lineTo(x-40,y+24);ctx.lineTo(x+w+80,y+195);ctx.lineTo(x+w+20,y+213);ctx.fill();
        }
        // An original shield, split into enamel and a pair of stitched stars.
        const bx=x+165, by=y+56;
        ctx.fillStyle=css(trim);ctx.beginPath();ctx.moveTo(bx-13,by-11);ctx.lineTo(bx+13,by-11);ctx.lineTo(bx+11,by+6);ctx.lineTo(bx,by+17);ctx.lineTo(bx-11,by+6);ctx.fill();
        ctx.fillStyle=css(kit);ctx.fillRect(bx-3,by-6,6,14);ctx.fillRect(bx-8,by-2,16,4);
        ctx.fillStyle=ink;ctx.textAlign='center';ctx.font='bold 26px sans-serif';ctx.fillText(String(number),x+w/2,y+109);
        for(let j=0;j<3;j++) {ctx.beginPath();const px=x+49+j*5;ctx.moveTo(px,by+5);ctx.lineTo(px+7,by-3);ctx.lineTo(px+4,by+5);ctx.fill();}
      } else {
        ctx.textAlign='center';ctx.fillStyle=ink;
        ctx.font='bold 20px sans-serif';ctx.fillText(name.toLocaleUpperCase(),x+w/2,y+49,w*.86);
        ctx.font='900 127px sans-serif';ctx.fillText(String(number),x+w/2,y+178,w*.75);
        ctx.fillStyle=css(trim);ctx.fillRect(x+w/2-12,y+8,24,4);
      }
      ctx.restore();
    }
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;
    return tex;
  }
  function shirtPatch(g, bone, side) {
    const levels=[[.027,.164,.093,-.001],[.095,.171,.101,-.001],[.211,.184,.115,.001],[.30,.197,.118,.008],[.37,.195,.113,.006]];
    const angles=10;
    for(let row=0;row<levels.length-1;row++) for(let s=0;s<angles;s++) {
      const make=(r,c)=>{
        const [y,rx,rz,cz]=levels[r], f=c/angles;
        const a=(side?Math.PI:0)+(f-.5)*2.27;
        const x=side?252:12;
        return {p:[Math.sin(a)*(rx+.002),y,Math.cos(a)*(rz+.002)+cz],uv:[(x+1+f*226)/512,1-(247-(y-.027)/.343*237)/256]};
      };
      const corners=[make(row,s),make(row,s+1),make(row+1,s+1),make(row+1,s)];
      g.quad(bone,corners.map(v=>v.p),white,corners.map(v=>v.uv));
    }
  }
  function labelFor(name) {
    const canvas=document.createElement('canvas'); canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.font='700 47px -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';
    const width=Math.min(482,Math.ceil(ctx.measureText(name).width)+55);
    const x=(512-width)/2;
    const shape = (left,top,w,h,r) => {
      ctx.beginPath(); ctx.moveTo(left+r,top);ctx.arcTo(left+w,top,left+w,top+h,r);ctx.arcTo(left+w,top+h,left,top+h,r);ctx.arcTo(left,top+h,left,top,r);ctx.arcTo(left,top,left+w,top,r);ctx.closePath();
    };
    shape(x,11,width,72,14);ctx.fillStyle='rgba(9,20,28,.90)';ctx.fill();
    ctx.fillStyle='#8cfbd4';ctx.fillRect(x+8,34,4,24);
    ctx.fillStyle='#fafffc';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,258,49,width-37);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
    sprite.scale.set(2.6,.49,1);sprite.position.set(0,2.33,0);sprite.renderOrder=12;
    return sprite;
  }
  const ringMat=new T.MeshBasicMaterial({color:0x63f0be,side:T.DoubleSide,transparent:true,opacity:.96,depthWrite:false,toneMapped:false});
  const ringInner=new T.MeshBasicMaterial({color:0x163e3d,side:T.DoubleSide,transparent:true,opacity:.63,depthWrite:false,toneMapped:false});
  const ringGeometry=new T.RingGeometry(.586,.636,48);
  const innerGeometry=new T.RingGeometry(.522,.58,48);
  function buildRing() {
    const ring=new T.Group();
    for (const [geo,mat] of [[ringGeometry,ringMat],[innerGeometry,ringInner]]) {
      const mesh=new T.Mesh(geo,mat);mesh.rotation.x=-Math.PI/2;mesh.renderOrder=4;ring.add(mesh);
    }
    ring.position.y=.018; return ring;
  }

  class PlayerModel {
    constructor(options={}) {
      const {name='Player',number=9,team=0,keeper=false}=options;
      this.name=String(name);this.number=number;
      this.seed=seedFor(String(options.seed ?? '')+this.name+number);
      const seed=this.seed;
      const kit=options.kitColor ?? (keeper?'#d79939':team?'#c9473c':'#286a7a');
      const trim=options.trimColor ?? (team?'#fff0d6':'#8ce1d7');
      const skin=options.skin ?? choose(skins,seed), hair=choose(hairs,seed>>>4);
      const boot=choose(bootColors,seed>>>7);
      const shorts=options.shortsColor ?? mix(kit,'#101d2c',.55);
      const skinShadow=mix(skin,'#452c35',.2);
      this.root=new T.Group(); this.root.name='Footballer '+this.name;
      this.body=new T.Group(); this.root.add(this.body);this.keeper=!!keeper;
      const g=new Sculpt();
      const hips=g.bone('pelvis',-1,0,.874,0);
      const chest=g.bone('spine',hips,0,.09,0);
      const head=g.bone('head',chest,0,.514,.003);
      this.hips=g.bones[hips];this.chest=g.bones[chest];this.head=g.bones[head];
      g.loft(hips,[[-.087,.117,.08,0,-.008],[-.045,.17,.106],[.054,.164,.108],[.104,.153,.099]],shorts,16);
      g.loft(chest,[[.002,.154,.096],[.027,.164,.093,0,-.001],[.095,.171,.101,0,-.001],[.211,.184,.115,0,.001],[.30,.197,.118,0,.008],[.37,.195,.113,0,.006],[.397,.185,.101],[.421,.153,.084],[.442,.08,.069]],kit,20);
      shirtPatch(g,chest,0);shirtPatch(g,chest,1);
      g.loft(chest,[[.435,.083,.072],[.446,.080,.070],[.451,.077,.070]],trim,16);
      g.loft(chest,[[.441,.064,.061],[.479,.058,.055],[.543,.063,.055]],skin,14);
      g.loft(chest,[[.005,.157,.098],[.015,.16,.097]],mix(kit,trim,.27),18);
      const faceWidth=.089+(seed%6)*.0015;
      g.loft(head,[[.001,.036,.044,0,.029],[.019,faceWidth*.66,.074,0,.026],[.067,faceWidth*.91,.094,0,.005],[.112,faceWidth,.102,0,.001],[.168,faceWidth*.99,.105],[.207,faceWidth*.92,.097],[.237,faceWidth*.61,.073],[.25,.024,.033]],skin,20);
      g.oval(head,0,.084,.101,.018,.028,.023,skin,10);
      g.oval(head,0,.046,.100,.025,.005,.006,mix(skin,'#663c40',.27));
      for(const s of [-1,1]) {
        g.oval(head,s*faceWidth,.098,-.001,.014,.028,.015,skinShadow);
        g.oval(head,s*.038,.114,.094,.019,.007,.006,'#e5d5c4');
        g.oval(head,s*.036,.114,.101,.008,.006,.003,'#302921');
        g.oval(head,s*.039,.131,.092,.021,.005,.006,hair);
      }
      // Hair has a shorter hairline at the forehead, longer at the ears and nape.
      const cut=seed%6;
      const hairColor=cut===5?mix(hair,'#c49e63',.35):hair;
      const hairRows=5,segments=20,start=g.positions.length/3;
      for(let r=0;r<hairRows;r++) for(let s=0;s<segments;s++){
        const a=s*TAU/segments, front=Math.cos(a);
        const base=.119+Math.max(front,0)*.051 + Math.min(front,0)*.042 + Math.sin(a*3+.8)*.007;
        const f=r/(hairRows-1), angle=f*Math.PI/2;
        const volume=cut===1?.038:cut===2?.027:cut===3?.012:.009;
        const y=base+Math.sin(angle)*(.249+volume-base)+(cut===1?Math.sin(a)*.018*(1-f):0);
        const scale=Math.max(.018, Math.cos(angle));
        g.vertex(head,Math.sin(a)*(faceWidth+.006)*scale+Math.sin(angle)*(cut===1?.023:0),y,Math.cos(a)*.113*scale-.004,hairColor);
      }
      for(let r=1;r<hairRows;r++)for(let s=0;s<segments;s++){
        const a=start+(r-1)*segments+s,b=start+(r-1)*segments+(s+1)%segments;
        g.indices.push(a,b,b+segments,a,b+segments,a+segments);
      }
      if (cut===2 || cut===4) for(let d=0;d<13;d++){
        const a=d*2.39996, rad=Math.sqrt((d+.5)/13)*.075;
        g.oval(head,Math.sin(a)*rad,.241+(.075-rad)*.33,Math.cos(a)*rad-.005,.032,.025,.035,hairColor,7,4);
      }
      if(cut===3) g.oval(head,0,.201,-.095,.051,.05,.05,hair,12);
      this.limbs=[];
      for(const sign of [-1,1]) {
        const arm=g.bone('upperArm'+sign,chest,sign*.180,.366,.001);
        const fore=g.bone('forearm'+sign,arm,sign*.019,-.241,-.006);
        const thigh=g.bone('thigh'+sign,hips,sign*.091,-.035,.003);
        const shin=g.bone('shin'+sign,thigh,sign*.009,-.375,.005);
        const foot=g.bone('foot'+sign,shin,0,-.392,-.003);
        this.limbs.push({sign,arm:g.bones[arm],fore:g.bones[fore],thigh:g.bones[thigh],shin:g.bones[shin],foot:g.bones[foot]});
        g.loft(arm,[[-.249,.044,.043,sign*.019],[-.193,.053,.055,sign*.018],[-.124,.063,.064,sign*.015],[-.048,.063,.060,sign*.012],[.014,.059,.056]],skin);
        g.loft(arm,[[-.151,.061,.063,sign*.015],[-.137,.064,.066,sign*.014],[-.055,.079,.076,sign*.012],[.003,.075,.07],[.029,.054,.056],[.040,.036,.046]],kit);
        g.loft(arm,[[-.153,.062,.063,sign*.015],[-.142,.065,.066,sign*.014]],trim);
        if(number===10 && sign===-1) g.loft(arm,[[-.124,.067,.067,sign*.015],[-.083,.074,.073,sign*.013]],'#edd37c');
        g.loft(fore,[[-.214,.024,.024],[-.162,.033,.035],[-.08,.046,.047],[-.027,.046,.042],[.018,.041,.038]],skin);
        if(keeper || (seed>>>8)%3===1) g.loft(fore,[[-.214,.033,.031],[-.188,.032,.033]],keeper?trim:'#f2eee6',10);
        g.oval(fore,0,-.239,.005,keeper?.047:.032,.057,keeper?.036:.027,keeper?trim:skin);
        g.oval(fore,-sign*.021,-.23,.023,.014,.025,.012,keeper?trim:skin);
        g.loft(thigh,[[-.39,.053,.05,sign*.008,.009],[-.314,.069,.069,sign*.008,.008],[-.22,.082,.087,sign*.006],[-.098,.087,.096],[0,.081,.083]],skin,14);
        g.loft(thigh,[[-.203,.083,.088,sign*.005,.001],[-.175,.091,.098,sign*.005,.001],[-.066,.096,.102],[-.009,.092,.102],[.035,.081,.086]],shorts,14);
        g.loft(thigh,[[-.204,.084,.089,sign*.005,.001],[-.193,.086,.094,sign*.005,.001]],mix(shorts,trim,.47));
        g.loft(shin,[[-.385,.033,.037,0,-.003],[-.32,.04,.048,0,-.013],[-.188,.053,.064,0,-.018],[-.112,.061,.07,0,-.015],[-.037,.052,.054,0,.003],[.019,.05,.053,0,.004]],skin,14);
        const sock=keeper?kit:team?mix(kit,white,.68):kit;
        g.loft(shin,[[-.397,.034,.04],[-.307,.041,.052,0,-.011],[-.175,.058,.069,0,-.017],[-.118,.063,.073,0,-.014],[-.085,.059,.064,0,-.01]],sock,14);
        g.loft(shin,[[-.116,.064,.073,0,-.014],[-.109,.064,.073,0,-.014]],trim);
        g.loft(shin,[[-.097,.061,.068,0,-.011],[-.086,.061,.065,0,-.01]],trim);
        g.loft(foot,[[-.053,.054,.108,0,.052],[-.042,.061,.122,0,.049],[-.024,.06,.121,0,.047],[.003,.052,.103,0,.035],[.038,.041,.059,0,.001]],boot,16);
        g.loft(foot,[[-.057,.056,.111,0,.050],[-.048,.061,.121,0,.049]],'#242b32');
        for(let l=0;l<3;l++)g.oval(foot,0,.019-l*.006,.055+l*.017,.026,.003,.004,'#e0e6da',8,3);
      }
      const tex=makeKit(number,this.name,kit,trim,team,keeper);
      const material=new T.MeshStandardMaterial({map:tex,vertexColors:true,roughness:.7,metalness:.015});
      const mesh=new T.SkinnedMesh(g.geometry(),material);this.mesh=mesh;
      mesh.add(this.hips);mesh.bind(new T.Skeleton(g.bones));mesh.frustumCulled=false;
      mesh.castShadow=true;mesh.receiveShadow=true;this.body.add(mesh);
      const height=.98+(seed%13)*.004, build=.98+((seed>>>4)%13)*.009;
      this.body.scale.set(build,height,build);
      this.ring=buildRing();this.nameTag=labelFor(this.name);
      this.root.add(this.ring,this.nameTag);this.ring.visible=false;this.nameTag.visible=false;
      this.lastTime=null;this.cycle=(seed%101)/101*TAU;this.heading=0;this.lastKick=false;this.kickStarted=-5;
      this.turnWasSet=false;this.wasSelected=false;
    }
    update(state={}) {
      const t=state.time ?? 0, rawDelta=t-(this.lastTime??t), dt=clamp(rawDelta,0,.06);
      this.lastTime=t;
      const sp=Math.max(0,state.speed??0), run=clamp((sp-.1)/6.2,0,1), sprint=clamp((sp-4)/5,0,1);
      const action=state.anim||'', selected=!!state.selected;
      this.root.visible=state.active!==false;
      if (!this.root.visible) return;
      this.root.position.set(state.x??0,0,state.z??0);
      const angle=state.heading??this.heading;
      const turn=Math.atan2(Math.sin(angle-this.heading),Math.cos(angle-this.heading));
      this.heading+=!this.turnWasSet||rawDelta>.3||rawDelta<0?turn:turn*(1-Math.exp(-dt*18));
      this.turnWasSet=true;this.body.rotation.y=this.heading;
      const hidden=selected&&!!state.firstPerson;
      this.body.visible=!hidden;
      this.ring.visible=this.nameTag.visible=selected&&!hidden;
      if(this.ring.visible) {
        const pulse=1+Math.sin(t*4)*.022;this.ring.scale.setScalar(pulse);
      }
      if(hidden)return;
      const celebrate=!!state.celebrate||action==='celebrate', dive=action==='dive', tackle=action==='tackle';
      const throwing=action==='throw', skill=action==='skill', kickFlag=!!state.kick||action==='kick';
      if(kickFlag&&!this.lastKick)this.kickStarted=t;
      this.lastKick=kickFlag;
      const k=clamp((t-this.kickStarted)/.44,0,1);
      const kick=k<.33?Math.sin(k/.33*Math.PI/2)*.68:Math.cos((k-.33)/.67*Math.PI/2)*.68-Math.sin((k-.33)/.67*Math.PI)*1.35;
      const idle=Math.sin(t*2+(this.seed%17));
      this.body.position.y=celebrate?Math.max(0,Math.sin(t*4.8))*.12:0;
      if(rawDelta<0 || rawDelta>.3)this.cycle=t*(5+sp*.95)+(this.seed%17);
      this.cycle+=dt*(4.8+Math.min(sp,10)*1.09);
      const stride=Math.sin(this.cycle), bounce=(1-Math.abs(Math.cos(this.cycle)))*.034*run;
      const diveAmount=dive?Math.sin(clamp((state.animTime??.3)/.8,0,1)*Math.PI):0;
      this.hips.position.y=.874+bounce+idle*.003*(1-run)-(tackle?.19:0);
      this.hips.rotation.set(.05*run, stride*.074*run,diveAmount*1.28);
      this.chest.rotation.set(.035+run*.13-(celebrate?.15:0),-stride*.13*run+(skill?.34*Math.sin(10*t):0),-stride*.036*run);
      this.head.rotation.set(-this.chest.rotation.x*.7,-this.chest.rotation.y*.85+Math.sin(t*1.7)*.055,0);
      for (const limb of this.limbs) {
        const {sign,arm,fore,thigh,shin,foot}=limb;
        const wave=sign*stride, recover=Math.max(0,-sign*Math.cos(this.cycle));
        thigh.rotation.set(-wave*(.55+.33*sprint)*run-.07,0,sign*.025);
        shin.rotation.x=(.11+.75*recover*run+.32*recover*sprint);
        foot.rotation.x=-shin.rotation.x*.52-.02;
        arm.rotation.set(wave*(.37+.22*sprint)*run+.035,0,sign*(.16+run*.10));
        fore.rotation.set(-.16-.89*run,0,-sign*.11);
        if(sign===1 && k<1) {thigh.rotation.x+=kick*1.19;shin.rotation.x+=Math.max(0,kick)*1.5;}
        if(tackle) {thigh.rotation.x=sign===1?-1.16:-.42;shin.rotation.x=sign===1?.11:1.22;arm.rotation.z=sign*.55;}
        if(skill) {thigh.rotation.z+=sign*.16*Math.sin(12*t);thigh.rotation.x-=Math.max(0,wave)*.33;}
        if(dive) {arm.rotation.z=sign*(1.2+diveAmount*.8);fore.rotation.x=-.23;thigh.rotation.x=sign*.4;}
        if(throwing){arm.rotation.x=-2.62;arm.rotation.z=sign*.15;fore.rotation.x=-.86;}
        if(celebrate) {
          arm.rotation.z=sign*(this.number%2?1.15+.28*Math.sin(t*4.8+sign):2.1+.16*Math.sin(t*4.8));arm.rotation.x=-.36;
          fore.rotation.x=-.37;this.head.rotation.x=-.19;this.chest.rotation.z=Math.sin(t*3.3)*.045;
        }
      }
    }
    destroy() {
      this.root.removeFromParent();this.mesh.skeleton.dispose();this.mesh.geometry.dispose();
      this.mesh.material.map.dispose();this.mesh.material.dispose();this.nameTag.material.map.dispose();this.nameTag.material.dispose();
    }
  }
  WC.PlayerModel=PlayerModel;
})();
