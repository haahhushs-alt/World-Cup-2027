/* World Cup 2027 · match-day character rig. Forward is +Z, dimensions in metres. */
(() => {
  'use strict';
  const WC = window.WC = window.WC || {};
  const T = window.THREE;
  if (!T) throw new Error('Load Three.js before the player models');
  const TAU = Math.PI * 2;
  const white = '#ffffff';
  const skins = ['#714937','#ba826a','#bb8266','#c18b75'];
  const faces=new Image();
  faces.src=WC.faceAtlas;
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
      this.positions = []; this.colors = []; this.indices = [];this.distant=[];
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
    distantGrid(start,rows,columns,wrap,rowStep,columnStep){
      const width=wrap?columns:columns+1;
      for(let row=0;row<rows-1;row+=rowStep)for(let col=0;col<columns;col+=columnStep){
        const low=start+row*width,high=start+Math.min(rows-1,row+rowStep)*width;
        const end=Math.min(col+columnStep,columns),next=wrap?end%columns:end;
        this.distant.push(low+col,low+next,high+next,low+col,high+next,high+col);
      }
    }
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
      this.distantGrid(start,rows.length,segments,true,rows.length<5?1:2,2);
      for(const row of [0,rows.length-1]){
        const [y,rx,rz,x=0,z=0,tint=shade]=rows[row],cap=this.positions.length/3;
        this.vertex(bone,x,y,z,tint);
        for(let s=0;s<segments;s++){
          const a=s*TAU/segments;
          this.vertex(bone,x+Math.sin(a)*rx,y,z+Math.cos(a)*rz,tint);
        }
        for(let s=0;s<segments;s++){
          const a=cap+1+s,b=cap+1+(s+1)%segments;
          this.indices.push(cap,row?a:b,row?b:a);
          if(s%2===0){
            const next=cap+1+(Math.min(s+2,segments)%segments);
            this.distant.push(cap,row?a:next,row?next:a);
          }
        }
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
      this.distant.push(i,i+1,i+2,i,i+2,i+3);
    }
    blendJoint(parent,child,radius){
      const y=this.offsets[child][1];
      for(let i=0;i<this.positions.length/3;i++){
        const j=i*4,original=this.joints[j];
        if(original!==parent&&original!==child)continue;
        const offset=this.positions[i*3+1]-y;
        if(Math.abs(offset)>=radius)continue;
        const t=clamp(.5-offset/(2*radius),0,1),weight=t*t*(3-2*t);
        this.joints[j]=parent;this.joints[j+1]=child;
        this.weights[j]=1-weight;this.weights[j+1]=weight;
      }
    }
    geometry() {
      const g=new T.BufferGeometry();
      for (const [name,data,size] of [['position',this.positions,3],['color',this.colors,3],['uv',this.uvs,2],['skinWeight',this.weights,4]]) {
        g.setAttribute(name,new T.Float32BufferAttribute(data,size));
      }
      g.setAttribute('skinIndex',new T.Uint16BufferAttribute(this.joints,4));
      g.setIndex(this.indices);g.computeVertexNormals();
      g.setIndex(this.indices.concat(this.distant));
      g.userData.closeCount=this.indices.length;g.userData.farCount=this.distant.length;
      g.setDrawRange(0,this.indices.length);
      g.computeBoundingSphere();
      return g;
    }
  }

  // One canvas holds the shirt's front and back graphics. Neck trim and sleeve piping
  // are geometric so that the silhouette and trim are still readable under stadium lights.
  function makeKit(number, name, kit, trim, team, keeper, face, skin, hair, seed) {
    const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=512;
    const ctx=canvas.getContext('2d');ctx.save();ctx.fillStyle='white';ctx.fillRect(0,0,512,256);
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
      const textile=ctx.createLinearGradient(x,0,x+w,0);
      textile.addColorStop(0,'rgba(8,18,25,.19)');textile.addColorStop(.20,'rgba(8,18,25,.025)');
      textile.addColorStop(.55,'rgba(255,255,250,.035)');textile.addColorStop(1,'rgba(8,18,25,.16)');
      ctx.fillStyle=textile;ctx.fillRect(x,y,w,h);
      ctx.strokeStyle=mix(kit,trim,.31);ctx.lineWidth=1.7;
      for(const edge of [-1,1]){
        const start=x+w/2+edge*32;
        ctx.beginPath();ctx.moveTo(start,y+2);ctx.quadraticCurveTo(start+edge*15,y+19,start+edge*74,y+29);ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.save();ctx.translate(512,0);ctx.fillStyle=hair;ctx.fillRect(0,0,512,256);
    let bits=seed;
    const random=()=>((bits=(Math.imul(bits,1664525)+1013904223)>>>0)/4294967296);
    for(let i=0;i<2300;i++){
      const x=random()*554-20,y=random()*282-12,length=5+random()*35;
      const sweep=Math.sin(x*.016+y*.007+seed%7)*length*.46;
      ctx.strokeStyle=random()<.56?'rgba(9,7,6,.29)':'rgba(230,201,162,.18)';
      ctx.lineWidth=.45+random()*1.05;ctx.beginPath();ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+sweep*.2,y+length*.48,x+sweep,y+length);ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle=skin;ctx.fillRect(0,256,1024,256);
    const tex = new T.CanvasTexture(canvas);
    const paintFace=()=>{
      ctx.drawImage(faces,face%2*1024,Math.floor(face/2)*256,1024,256,0,256,1024,256);
      tex.needsUpdate=true;
    };
    if(faces.complete&&faces.naturalWidth)paintFace();
    else faces.addEventListener('load',paintFace,{once:true});
    tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;
    return tex;
  }
  function sculptShirt(g,bone){
    const rows=[[-.018,.162,.104,-.001],[.003,.167,.106,-.001],[.035,.169,.108,0],
      [.083,.164,.105,.001],[.133,.170,.109,.002],[.205,.183,.115,.004],
      [.270,.195,.120,.008],[.330,.203,.120,.007],[.370,.198,.113,.006],
      [.396,.180,.099,.002],[.421,.148,.083,.001],[.444,.080,.069,0]];
    const count=28;
    for(let side=0;side<2;side++){
      const first=g.positions.length/3;
      for(const [y,rx,rz,cz] of rows)for(let i=0;i<=count;i++){
        const f=i/count,a=(side+f-.5)*Math.PI;
        const fold=Math.sin(5*a+y*24)*.005*Math.max(0,1-y/.24);
        const hem=Math.cos(2*a)*.010*Math.max(0,1-Math.abs(y)/.065);
        const v=(y+.018)/.462;
        g.vertex(bone,Math.sin(a)*(rx+fold),y+hem,Math.cos(a)*(rz+fold)+cz,white,
          [((side?252:12)+1+f*226)/1024,1-(247-v*237)/512]);
      }
      for(let row=1;row<rows.length;row++)for(let i=0;i<count;i++){
        const n=first+(row-1)*(count+1)+i;
        g.indices.push(n,n+1,n+count+2,n,n+count+2,n+count+1);
      }
      g.distantGrid(first,rows.length,count,false,2,2);
    }
  }
  // The front surface carries the nose bridge, orbital hollows, cheeks and chin.
  // Longitude matches our cylindrical face atlas. The UV seam sits at the nape.
  function sculptHead(g,bone,width,seed){
    const profile=[[0,.35,.040,.035],[.018,.65,.064,.023],[.054,.86,.083,.013],
      [.090,.97,.096,.003],[.135,1,.103,0],[.165,1,.106,-.001],
      [.200,.94,.099,-.003],[.232,.70,.078,-.003],[.258,.12,.025,-.004]];
    const rows=40,cols=64,first=g.positions.length/3,nose=.021+(seed%9)*.001;
    const ridge=(x,y,cx,cy,w,h)=>Math.exp(-(((x-cx)/w)**2+((y-cy)/h)**2));
    let level=0;
    for(let r=0;r<=rows;r++){
      const y=.258*r/rows;
      while(level<profile.length-2&&y>profile[level+1][0])level++;
      const a=profile[level],b=profile[level+1],t=(y-a[0])/(b[0]-a[0]);
      const interp=i=>a[i]+(b[i]-a[i])*t;
      for(let s=0;s<=cols;s++){
        const angle=(s/cols*2-1)*Math.PI,c=Math.cos(angle),x=Math.sin(angle)*width*interp(1),ax=Math.abs(x);
        const detail=nose*ridge(x,y,0,.101,.015,.026)+.017*ridge(x,y,0,.126,.011,.038)
          +.009*ridge(ax,y,.014,.092,.008,.008)-.009*ridge(ax,y,.033,.134,.018,.010)
          +.009*ridge(ax,y,.045,.108,.026,.020)+.006*ridge(ax,y,.031,.151,.022,.008)
          +.011*ridge(x,y,0,.052,.030,.012)+.011*ridge(x,y,0,.018,.031,.012);
        g.vertex(bone,x,y,interp(3)+c*interp(2)+detail*Math.max(0,c)**3,white,[(1+s/cols*1022)/1024,(1+r/rows*254)/512]);
      }
    }
    for(let r=0;r<rows;r++)for(let s=0;s<cols;s++){
      const i=first+r*(cols+1)+s;
      g.indices.push(i,i+1,i+cols+2,i,i+cols+2,i+cols+1);
    }
    g.distantGrid(first,rows+1,cols,false,4,4);
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
      const face=(seed>>>9)%skins.length,skin=options.skin??skins[face],hair=choose(hairs,seed>>>4);
      const boot=choose(bootColors,seed>>>7);
      const shorts=options.shortsColor ?? (ncolor(kit).getHSL({}).l>.55?'#1f403e':mix(kit,'#101d2c',.74));
      const skinShadow=mix(skin,'#452c35',.2);
      this.root=new T.Group(); this.root.name='Footballer '+this.name;
      this.body=new T.Group(); this.root.add(this.body);this.keeper=!!keeper;
      const g=new Sculpt();
      const hips=g.bone('pelvis',-1,0,.874,0);
      const chest=g.bone('spine',hips,0,.09,0);
      const head=g.bone('head',chest,0,.514,.003);
      this.hips=g.bones[hips];this.chest=g.bones[chest];this.head=g.bones[head];
      g.loft(hips,[[-.066,.131,.073,0,-.008],[-.034,.166,.104],[.054,.164,.108],[.104,.153,.099]],shorts,16);
      sculptShirt(g,chest);
      g.loft(chest,[[.435,.083,.072],[.446,.080,.070],[.451,.077,.070]],trim,16);
      g.loft(chest,[[.441,.064,.061],[.479,.058,.055],[.543,.063,.055]],skin,14);
      const faceWidth=.089+(seed%6)*.0015;
      sculptHead(g,head,faceWidth,seed);
      for(const s of [-1,1]) {
        g.oval(head,s*faceWidth,.112,-.005,.016,.029,.018,skin);
        g.oval(head,s*(faceWidth+.012),.114,-.004,.004,.017,.009,skinShadow);
        g.oval(head,s*(faceWidth+.011),.096,.001,.005,.009,.008,skin);
      }
      // Hair has a shorter hairline at the forehead, longer at the ears and nape.
      const cut=seed%6;
      const hairColor=cut===5?mix(hair,'#c49e63',.35):hair;
      const hairRows=12,segments=64,start=g.positions.length/3;
      for(let r=0;r<hairRows;r++) for(let s=0;s<=segments;s++){
        const a=s*TAU/segments, front=Math.cos(a);
        const base=.144+Math.max(front,0)*.042 + Math.min(front,0)*.062 + Math.sin(a*3+.8)*.007+Math.sin(a*21)*.002;
        const f=r/(hairRows-1), angle=f*Math.PI/2;
        const volume=cut===1?.038:cut===2?.027:cut===3?.012:.009;
        const y=base+Math.sin(angle)*(.249+volume-base)+(cut===1?Math.sin(a)*.018*(1-f):0);
        const ridge=Math.cos(18*a+f*(cut===1?3.5:1.8))*(cut===5?.001:.0027);
        const scale=Math.max(.018, Math.cos(angle));
        g.vertex(head,Math.sin(a)*(faceWidth+.010+ridge)*scale+Math.sin(angle)*(cut===1?.023:0),y+ridge*f,Math.cos(a)*(.119+ridge)*scale-.004,white,
          [(513+510*s/segments)/1024,1-(254-f*252)/512]);
      }
      for(let r=1;r<hairRows;r++)for(let s=0;s<segments;s++){
        const a=start+(r-1)*(segments+1)+s,b=a+1;
        g.indices.push(a,b,b+segments+1,a,b+segments+1,a+segments+1);
      }
      g.distantGrid(start,hairRows,segments,false,2,4);
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
        if(!keeper)for(let f=0;f<4;f++){
          g.oval(fore,(f-1.5)*.013,-.278+Math.abs(f-1)*.004,.010,.007,.027,.009,skin,7,4);
        }
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
        for(let l=0;l<4;l++){
          const z=.040+l*.017,y=.029-l*.004;
          for(const s of [-1,1])g.quad(foot,[[s*.025,y-.002,z],[s*.025,y-.002,z+.004],[-s*.021,y+.003,z+.017],[-s*.021,y+.003,z+.013]],'#e8e5d9');
        }
        for(const s of [-1,1])for(const z of [-.028,.071,.125])
          g.loft(foot,[[-.068,.007,.009,s*.035,z],[-.055,.010,.012,s*.035,z]],'#c6b99b',6);
        g.loft(foot,[[-.013,.043,.030,0,-.025],[.018,.039,.026,0,-.024],[.034,.033,.020,0,-.02]],mix(boot,trim,.47),12);
        if(keeper)for(let digit=0;digit<4;digit++){
          g.oval(fore,(digit-1.5)*.016,-.28+Math.abs(digit-1.4)*.006,.012,.009,.030,.013,trim,7,4);
        }
        g.blendJoint(arm,fore,.055);g.blendJoint(thigh,shin,.077);
      }
      const tex=makeKit(number,this.name,kit,trim,team,keeper,face,skin,hairColor,seed);
      const material=new T.MeshStandardMaterial({map:tex,vertexColors:true,roughness:.7,metalness:.015});
      const mesh=new T.SkinnedMesh(g.geometry(),material);this.mesh=mesh;
      mesh.add(this.hips);mesh.bind(new T.Skeleton(g.bones));
      mesh.boundingSphere=new T.Sphere(new T.Vector3(0,.95,0),1.55);
      mesh.castShadow=true;mesh.receiveShadow=true;this.body.add(mesh);
      const height=.98+(seed%13)*.004, build=.98+((seed>>>4)%13)*.009;
      this.body.scale.set(build,height,build);
      this.ring=buildRing();this.nameTag=labelFor(this.name);
      this.root.add(this.ring,this.nameTag);this.ring.visible=false;this.nameTag.visible=false;
      this.lastTime=null;this.cycle=(seed%101)/101*TAU;this.heading=0;
      this.turnWasSet=false;
    }
    update(state={}) {
      const t=state.time ?? 0, rawDelta=t-(this.lastTime??t), dt=clamp(rawDelta,0,.06);
      this.lastTime=t;
      const sp=Math.max(0,state.speed??0), run=clamp((sp-.1)/6.2,0,1), sprint=clamp((sp-4)/5,0,1);
      const action=state.anim||'', selected=!!state.selected;
      this.root.visible=state.active!==false;
      if (!this.root.visible) return;
      const geometry=this.mesh.geometry,{closeCount,farCount}=geometry.userData;
      geometry.setDrawRange(state.distant?closeCount:0,state.distant?farCount:closeCount);
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
      const k=kickFlag?clamp(1-(state.animTime??.36)/.36,0,1):1;
      const drive=['power','shoot','curve'].includes(state.kickStyle),chip=state.kickStyle==='chip';
      const kick=k>=1?0:-(.55+(drive?.79:chip?.46:.29)*Math.sin(Math.PI*Math.min(1,k*2.4)))*(1-k);
      const idle=Math.sin(t*2+(this.seed%17));
      this.body.position.y=celebrate?Math.max(0,Math.sin(t*4.8))*.12:0;
      if(rawDelta<0 || rawDelta>.3)this.cycle=t*(5+sp*.95)+(this.seed%17);
      if(Number.isFinite(state.stride))this.cycle=state.stride;
      else this.cycle+=dt*(4.8+Math.min(sp,10)*1.09);
      const stride=Math.sin(this.cycle), bounce=(1-Math.abs(stride))*.034*run;
      const diveAmount=dive?Math.sin(clamp((state.animTime??.3)/.8,0,1)*Math.PI):0;
      this.hips.position.y=.859+bounce-.047*run+idle*.003*(1-run)-(tackle?.19:0);
      this.hips.rotation.set(.05*run, stride*.074*run,diveAmount*1.28);
      this.chest.rotation.set(.035+run*.13-(celebrate?.15:0),-stride*.13*run+(skill?.34*Math.sin(10*t):0),-stride*.036*run+(state.lean||0));
      this.head.rotation.set(-this.chest.rotation.x*.7,-this.chest.rotation.y*.85+Math.sin(t*1.7)*.055,0);
      for (const limb of this.limbs) {
        const {sign,arm,fore,thigh,shin,foot}=limb;
        const wave=sign*stride,swing=Math.max(0,sign*Math.cos(this.cycle));
        const ankleY=.064+run*swing*swing*(.115+.11*sprint);
        const down=this.hips.position.y-.035-ankleY,forward=wave*run*(.165+.11*sprint);
        const knee=Math.acos(clamp((down*down+forward*forward-.375**2-.392**2)/(2*.375*.392),-.98,.998));
        const hip=-Math.atan2(forward,down)-Math.atan2(.392*Math.sin(knee),.375+.392*Math.cos(knee));
        thigh.rotation.set(hip,0,sign*.022);
        shin.rotation.x=knee;foot.rotation.x=-hip-knee+run*swing*.27;
        arm.rotation.set(wave*(.37+.22*sprint)*run+.035,0,sign*(.16+run*.10));
        fore.rotation.set(-.16-.89*run,0,-sign*.11);
        if(k<1){
          if(sign===1){thigh.rotation.x+=kick;shin.rotation.x*=.28+.72*k;foot.rotation.x+=chip?-.26:drive?.19:-.08;thigh.rotation.y+=state.kickStyle==='curve'?(1-k)*.4:0;}
          arm.rotation.z+=sign*(1-k)*(drive?.58:.29);
        }
        if(tackle) {thigh.rotation.x=sign===1?-1.16:-.42;shin.rotation.x=sign===1?.11:1.22;arm.rotation.z=sign*.55;}
        if(skill) {thigh.rotation.z+=sign*.16*Math.sin(12*t);thigh.rotation.x-=Math.max(0,wave)*.33;}
        if(dive) {arm.rotation.z=sign*(1.2+diveAmount*.8);fore.rotation.x=-.23;thigh.rotation.x=sign*.4;}
        if(throwing){arm.rotation.x=-2.62;arm.rotation.z=sign*.15;fore.rotation.x=-.86;}
        if(celebrate) {
          const strong=sign===(this.number%2?1:-1),pump=.5+.5*Math.sin(t*5.4);
          arm.rotation.z=sign*(strong?1.78+.28*pump:.54+.13*pump);
          arm.rotation.x=strong?-.66:-.36;
          fore.rotation.x=strong?-1.35+.34*pump:-.81;
          this.head.rotation.x=-.07;this.chest.rotation.z=Math.sin(t*3.3)*.045;
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
