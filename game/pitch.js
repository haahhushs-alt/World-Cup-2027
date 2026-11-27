// Offline stadium, match cameras and ball. Coordinates are metres: x along the pitch, z across it.
(function () {
  'use strict';
  const WC = window.WC = window.WC || {};
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothing = (speed, dt) => 1 - Math.exp(-speed * dt);
  function random(seed) {
    return function () {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function surface(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  function texture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function grassCanvas() {
    const w = 2304, h = 1536, sx = w / 118, sz = h / 82;
    const canvas = surface(w, h), ctx = canvas.getContext('2d');
    const rng = random(27711);
    const data = ctx.createImageData(w, h);
    // Mowing bands follow the halfway line. The fine grain breaks up at a distance through mipmaps.
    for (let row = 0, i = 0; row < h; row++) {
      const z = (row - h / 2) / sz;
      for (let col = 0; col < w; col++, i += 4) {
        const x = (col - w / 2) / sx;
        const band = Math.floor((x + 52.5) / 5.25) % 2 === 0 ? 1 : -1;
        const transverse = Math.cos(z * 0.527) * 1.8;
        const grain = (rng() - 0.5) * 12 + transverse + Math.cos(0.08 * (z + x)) * 1.5;
        const worn = (Math.exp(-0.065 * ((Math.abs(x) - 51) ** 2 + z * z)) + Math.exp(-0.12 * (x * x + z * z))) * 5;
        const border = (Math.abs(x) > 53.2 || Math.abs(z) > 34.7) ? -4 : 0;
        data.data[i] = 53 + band * 3 + grain + worn + border;
        data.data[i + 1] = 118 + band * 6 + grain + border;
        data.data[i + 2] = 74 + band * 3 + grain * 0.7 - worn;
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.scale(sx, sz);
    ctx.strokeStyle = 'rgba(244,246,221,.94)';
    ctx.fillStyle = 'rgba(250,249,225,.96)';
    ctx.lineWidth = 0.14;
    ctx.lineJoin = 'round';
    function arc(x, z, radius, a, b) {
      ctx.beginPath(); ctx.arc(x, z, radius, a, b); ctx.stroke();
    }
    function dot(x, z) {
      ctx.beginPath(); ctx.arc(x, z, 0.155, 0, TAU); ctx.fill();
    }
    ctx.strokeRect(-52.5, -34, 105, 68);
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, 34); ctx.stroke();
    arc(0, 0, 9.15, 0, TAU);
    dot(0, 0);
    for (const sign of [-1, 1]) {
      const goal = 52.5 * sign;
      ctx.strokeRect(sign > 0 ? 36 : -52.5, -20.16, 16.5, 40.32);
      ctx.strokeRect(sign > 0 ? 47 : -52.5, -9.16, 5.5, 18.32);
      dot(41.5 * sign, 0);
      const theta = Math.acos(5.5 / 9.15);
      arc(41.5 * sign, 0, 9.15, sign < 0 ? -theta : Math.PI - theta, sign < 0 ? theta : Math.PI + theta);
      for (const side of [-1, 1]) {
        const angle = Math.atan2(-side, -sign);
        arc(goal, 34 * side, 1, angle - Math.PI / 4, angle + Math.PI / 4);
      }
    }
    return canvas;
  }

  // A rounded rectangular bowl; distance runs continuously through straight stands and curved corners.
  const a = 53.5, b = 34.1, radius = 4.6, quarter = radius * Math.PI / 2;
  const path = [
    [2 * a, u => [-a + 2 * a * u, -b - radius, 0, -1]],
    [quarter, u => bend(a, -b, -Math.PI / 2 + u * Math.PI / 2)],
    [2 * b, u => [a + radius, -b + 2 * b * u, 1, 0]],
    [quarter, u => bend(a, b, u * Math.PI / 2)],
    [2 * a, u => [a - 2 * a * u, b + radius, 0, 1]],
    [quarter, u => bend(-a, b, Math.PI / 2 + u * Math.PI / 2)],
    [2 * b, u => [-a - radius, b - 2 * b * u, -1, 0]],
    [quarter, u => bend(-a, -b, Math.PI + u * Math.PI / 2)]
  ];
  function bend(cx, cz, angle) {
    const x = Math.cos(angle), z = Math.sin(angle);
    return [cx + radius * x, cz + radius * z, x, z];
  }
  const perimeter = path.reduce((s, p) => s + p[0], 0);
  function rim(d, out, y) {
    let distance = (d % perimeter + perimeter) % perimeter;
    for (const [len, segment] of path) {
      if (distance <= len) {
        const [x, z, nx, nz] = segment(distance / len);
        return [x + nx * out, y, z + nz * out, nx, nz];
      }
      distance -= len;
    }
    return [-a, y, -b - radius - out, 0, -1];
  }
  function makeGeometry(positions, indices, uvs, colors) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (indices) geom.setIndex(indices);
    if (uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geom;
  }
  function pushQuad(array, p, q, r, s) {
    array.push(...p.slice(0, 3), ...q.slice(0, 3), ...r.slice(0, 3), ...s.slice(0, 3));
  }
  function ring(scene, low, high, mat, tile = 1) {
    const vertices = [], idx = [], uv = [], sections = 240;
    for (let i = 0; i <= sections; ++i) {
      const d = i / sections * perimeter;
      vertices.push(...rim(d, low[0], low[1]).slice(0, 3), ...rim(d, high[0], high[1]).slice(0, 3));
      uv.push(i / sections * tile, 0, i / sections * tile, 1);
      if (i < sections) { const n = i * 2; idx.push(n, n + 2, n + 1, n + 2, n + 3, n + 1); }
    }
    const geom = makeGeometry(vertices, idx, uv);
    const mesh = new THREE.Mesh(geom, mat);
    scene.add(mesh);
    return mesh;
  }
  function basic(color) {
    return new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide});
  }
  function lines(scene, positions, color, opacity = 1) {
    const mesh = new THREE.LineSegments(makeGeometry(positions), new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity}));
    scene.add(mesh);
    return mesh;
  }
  function ribbonTexture() {
    const canvas = surface(2048, 112), c = canvas.getContext('2d');
    const items = [
      ['#17443e','#d7ff66','WORLD CUP 2027'],
      ['#a9e548','#173829','W C   /   2 7'],
      ['#eee9d1','#15443c','WORLD CUP 2027'],
      ['#082f33','#7bdbc1','W C   /   2 7']
    ];
    items.forEach(([bg, fg, txt], i) => {
      const x = i * 512;
      c.fillStyle = bg; c.fillRect(x, 0, 512, 112);
      c.fillStyle = fg;
      for (let j = 0; j < 3; j++) {
        c.beginPath(); c.moveTo(x + 15 + j * 16, 84); c.lineTo(x + 40 + j * 16, 28);
        c.lineTo(x + 52 + j * 16, 28); c.lineTo(x + 27 + j * 16, 84); c.fill();
      }
      c.font = 'italic bold 44px Arial, sans-serif'; c.textBaseline = 'middle';
      c.fillText(txt, x + 105, 57, 385);
      c.fillStyle = '#0003'; c.fillRect(x, 0, 3, 112);
    });
    const tex = texture(canvas); tex.wrapS = THREE.RepeatWrapping; return tex;
  }
  function fanAtlas() {
    const canvas = surface(1024, 100), c = canvas.getContext('2d'), rng = random(911);
    const shirts = ['#e5e8d8','#d8b68e','#d25d55','#327779','#2e4e4b','#a8ca81','#e0bf71','#809cac',
      '#182d33','#bcb9b4','#498f78','#e6e0d4','#29625f','#485364','#b47b70','#73a89a'];
    const skins = ['#dfb491','#bd896f','#8e6251','#e2c7a6','#a47e64'];
    for (let i = 0; i < shirts.length; i++) {
      const x = i * 64;
      c.fillStyle = skins[i % skins.length];
      c.beginPath(); c.ellipse(x + 32, 30, 10, 13, -0.12 + rng() * .24, 0, TAU); c.fill();
      c.fillStyle = ['#40382e','#342e2e','#705842','#4a4036'][i % 4];
      c.beginPath(); c.ellipse(x + 32, 24, 10.5, 7, 0, Math.PI, TAU); c.fill();
      c.fillStyle = shirts[i];
      c.beginPath(); c.moveTo(x + 23, 42); c.quadraticCurveTo(x + 10, 45, x + 9, 57);
      c.lineTo(x + 2, 79); c.lineTo(x + 12, 82); c.lineTo(x + 18, 67);
      c.lineTo(x + 16, 93); c.lineTo(x + 49, 93); c.lineTo(x + 47, 66);
      c.lineTo(x + 54, 80); c.lineTo(x + 62, 78); c.lineTo(x + 55, 53);
      c.quadraticCurveTo(x + 52, 43, x + 40, 42); c.closePath(); c.fill();
      c.fillStyle = 'rgba(23,33,43,.20)';
      c.beginPath(); c.moveTo(x + 38, 45); c.lineTo(x + 48, 62); c.lineTo(x + 47, 92);
      c.lineTo(x + 34, 92); c.closePath(); c.fill();
      c.fillStyle = '#1e3235'; c.fillRect(x + 17, 92, 32, 8);
    }
    return texture(canvas);
  }
  function bowl(scene) {
    const dark = basic('#233432'), stair = basic('#46544e'), rail = basic('#8f9487');
    ring(scene, [0, 0], [0, 1.28], dark);
    const banner = ribbonTexture(), media = new THREE.MeshBasicMaterial({map:banner, side:THREE.DoubleSide});
    ring(scene, [-.4,.12], [-.42,1.05], media, 10);
    const rows = [], thresholds = [[2, 1.2, 15, .72, .41], [15.0, 8.65, 13, .82, .55], [28.2, 17.7, 9, .82, .59]];
    for (const [offset, elev, count, step, rise] of thresholds) {
      ring(scene, [offset - 1, elev - .35], [offset + step * count, elev + rise * count], stair);
      for (let j=0; j<count; j++) rows.push({out:offset + j * step, height:elev + j * rise, j});
      ring(scene, [offset - 1, elev - 1.12], [offset - 1, elev - .32], dark);
      ring(scene, [offset - 1.1, elev - .32], [offset - 1.1, elev - .22], rail);
    }
    ring(scene,[13.8,7.42],[13.8,8.20],media,9);
    ring(scene,[27.0,15.86],[27.0,16.90],media,9);
    const vert = [], idx = [], uv = [], colors = [], rng = random(2227);
    const steps = 465;
    rows.forEach((row, rowIndex) => {
      const count = steps + Math.floor(row.out * 7.8);
      for (let i=0;i<count;i++) {
        const u = (i + (rowIndex % 2)*.48 + rng()*.17)/count;
        const aisle = (u*32) % 1;
        if (aisle < .062 || aisle > .959 || rng() < .055) continue;
        if (row.j < 3 && (u * 16) % 1 < .18) continue;
        const p = rim(u*perimeter, row.out, row.height);
        const X=p[0], Y=p[1], Z=p[2], nx=p[3], nz=p[4];
        const h=.77+rng()*.25, w=(.31+rng()*.08), tx=-nz*w, tz=nx*w;
        const first=vert.length/3;
        pushQuad(vert,[X-tx,Y,Z-tz],[X+tx,Y,Z+tz],[X+tx,Y+h,Z+tz],[X-tx,Y+h,Z-tz]);
        idx.push(first,first+1,first+2,first,first+2,first+3);
        const section = Math.floor(u*16) % 4;
        const t=(rng()<.35 ? [5,10,0,2][section] : Math.floor(rng()*16))/16;
        uv.push(t,.004,t+1/16,.004,t+1/16,.995,t,.995);
        const brightness = .53+rng()*.38+(rowIndex<12?.08:0);
        for(let k=0;k<4;k++) colors.push(brightness,brightness,brightness);
      }
    });
    const fans = new THREE.Mesh(makeGeometry(vert,idx,uv,colors),new THREE.MeshBasicMaterial({
      map:fanAtlas(), side:THREE.DoubleSide, alphaTest:.4, vertexColors:true
    }));
    scene.add(fans);
    // Floating canopy, exposed radial trusses, and the LED rim.
    ring(scene,[23.9,28.4],[36.8,27.4],basic('#9ca9a0'));
    ring(scene,[23.9,28.1],[23.9,28.5],basic('#d5dbc6'));
    ring(scene,[36.8,24.2],[36.8,27.45],basic('#344849'));
    const ribs=[], supports=[], lightStrips=[];
    for(let k=0;k<144;k++) {
      const d=k/144*perimeter, next=d+perimeter/144;
      const v=(dist,o,y)=>rim(dist,o,y).slice(0,3);
      ribs.push(...v(d,36.8,26.7),...v(d,23.9,28.03),...v(d,23.9,28.03),...v(next,36.8,26.7));
      if(k%3===0)supports.push(...v(d,36,22),...v(d,36.8,27));
      if(k%2===0) lightStrips.push(...v(d,24.5,27.92),...v(next,24.5,27.92));
    }
    lines(scene,ribs,'#6c817e'); lines(scene,supports,'#657b79'); lines(scene,lightStrips,'#fff4c9');
  }
  function goal(scene, sign) {
    const group=new THREE.Group();
    scene.add(group);
    group.position.x=sign*52.5;
    group.scale.x=sign;
    const frameMat=new THREE.MeshStandardMaterial({color:0xf9f9e8,roughness:.45});
    const frame=[];
    function beam(p,q,r) {
      const a=new THREE.Vector3(...p),b=new THREE.Vector3(...q),v=b.clone().sub(a);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),8),frameMat);
      mesh.position.copy(a).lerp(b,.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
      group.add(mesh); frame.push(mesh);
    }
    for(const z of [-3.66,3.66]) {
      beam([0,0,z],[0,2.44,z],.061); beam([0,2.44,z],[1.22,2.44,z],.034);
      beam([1.22,2.44,z],[2.02,.035,z],.03); beam([.01,.035,z],[2.02,.035,z],.032);
    }
    beam([0,2.44,-3.66],[0,2.44,3.66],.061);
    beam([2.02,.035,-3.66],[2.02,.035,3.66],.03);
    const wires=[];
    const segment=(p,q)=>wires.push(...p,...q);
    for(let i=0;i<=48;i++) {
      const z=-3.66+7.32*i/48;
      segment([0,2.435,z],[1.22,2.435,z]); segment([1.22,2.435,z],[2.02,.035,z]);
    }
    for(let i=0;i<=16;i++) {
      const t=i/16, y=mix(.035,2.435,t), depth=mix(2.02,1.22,t);
      segment([depth,y,-3.66],[depth,y,3.66]);
      for(const z of [-3.66,3.66]) segment([0,y,z],[depth,y,z]);
    }
    for(let i=1;i<=12;i++) {
      const dep=2.02*i/12, ht=dep<=1.22?2.435:mix(2.435,.035,(dep-1.22)/.8);
      for(const z of [-3.66,3.66]) segment([dep,.035,z],[dep,ht,z]);
      if(dep<=1.22)segment([dep,2.435,-3.66],[dep,2.435,3.66]);
    }
    const net=lines(group,wires,'#f2f3e9',.48);
    return net;
  }
  function flags(scene) {
    const poles=[], verts=[], inds=[];
    for(const x of [-52.5,52.5]) for(const z of [-34,34]) {
      poles.push(x,0,z,x,1.52,z);
      const n=verts.length/3;
      pushQuad(verts,[x,1.52,z],[x+.25,1.48,z+.09],[x+.56,1.39,z+.03],[x,1.19,z]);
      inds.push(n,n+1,n+2,n,n+2,n+3);
    }
    lines(scene,poles,'#f4efd5');
    scene.add(new THREE.Mesh(makeGeometry(verts,inds),basic('#efbe55')));
  }
  function matchBall() {
    const T=THREE, phi=(1+Math.sqrt(5))/2, verts=[];
    for(const a of [-1,1]) for(const b of [-phi,phi]) {
      verts.push(new T.Vector3(0,a,b),new T.Vector3(a,b,0),new T.Vector3(b,0,a));
    }
    const edge=(i,j)=>verts[i].distanceToSquared(verts[j])<4.01 && i!==j;
    const trunc=(i,j)=>verts[i].clone().multiplyScalar(2).add(verts[j]).normalize();
    const panels=[];
    for(let i=0;i<12;i++) {
      const corner=[];
      for(let j=0;j<12;j++) if(edge(i,j)) corner.push(trunc(i,j));
      panels.push([corner,true,i]);
      for(let j=i+1;j<12;j++)for(let k=j+1;k<12;k++) {
        if(edge(i,j)&&edge(j,k)&&edge(k,i))
          panels.push([[trunc(i,j),trunc(j,i),trunc(j,k),trunc(k,j),trunc(k,i),trunc(i,k)],false,i+j+k]);
      }
    }
    const pos=[], colors=[];
    for(const [corners,dark,id] of panels) {
      const center=new T.Vector3();
      corners.forEach(v=>center.add(v)); center.normalize();
      const axis=corners[0].clone().addScaledVector(center,-corners[0].dot(center)).normalize();
      const perp=center.clone().cross(axis);
      corners.sort((a,b)=>Math.atan2(a.dot(perp),a.dot(axis))-Math.atan2(b.dot(perp),b.dot(axis)));
      const color=new T.Color(dark ? id%5===0?'#745724':'#16252a' : id%3===0?'#f0ead4':'#faf9ed');
      function emit(a,b,c) {
        for(const v of [a,b,c]) {pos.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);}
      }
      for(let i=0;i<corners.length;i++) {
        const a=corners[i], b=corners[(i+1)%corners.length];
        const ab=a.clone().add(b).normalize(), aa=a.clone().add(center).normalize(),bb=b.clone().add(center).normalize();
        emit(center,aa,bb);emit(aa,a,ab);emit(bb,ab,b);emit(aa,ab,bb);
      }
    }
    const geometry=makeGeometry(pos,null,null,colors);
    geometry.setAttribute('normal',new T.Float32BufferAttribute(pos,3));
    const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.72,side:T.DoubleSide}));
    // Slightly enhanced scale keeps the ball trackable on a tablet in the wide camera.
    mesh.scale.setScalar(.154);return mesh;
  }
  function shadowStamp() {
    const canvas=surface(64,64), c=canvas.getContext('2d'), g=c.createRadialGradient(32,32,1,32,32,31);
    g.addColorStop(0,'rgba(6,22,16,.52)');g.addColorStop(.35,'rgba(6,22,16,.38)');g.addColorStop(1,'rgba(6,22,16,0)');
    c.fillStyle=g;c.fillRect(0,0,64,64); return texture(canvas);
  }
  function confetti(scene) {
    const n=96, rng=random(1115), pos=[],idx=[],color=[],spec=[];
    for(let i=0;i<n;i++) {
      pos.push(0,0,0, 0,0,0, 0,0,0, 0,0,0); const s=i*4;idx.push(s,s+1,s+2,s,s+2,s+3);
      const c=new THREE.Color(['#e9bd55','#fff0b5','#53a89a','#faf4d7'][i%4]);
      for(let j=0;j<4;j++)color.push(c.r,c.g,c.b);
      spec.push([rng(),rng(),rng(),rng(),rng()]);
    }
    const geo=makeGeometry(pos,idx,null,color), mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
    mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
    return function draw(t,x,z) {
      mesh.visible=t>=0&&t<5.4;
      if(!mesh.visible)return;
      const attrib=geo.attributes.position;
      spec.forEach(([a,b,c,d,e],i)=>{
        const age=t-a*.6, k=clamp(age,0,6), dir=(i%2)*2-1;
        const X=x+(b-.5)*12+c*k, Z=z+dir*(4+e*4)+(d-.5)*k;
        const Y=Math.max(.03,(6+b*4)*k-1.65*k*k), size=.04+.055*e;
        const dx=Math.cos(k*5+a*8)*size, dz=Math.sin(k*5+a*8)*size, dy=Math.cos(k*8+c*8)*size*.75;
        const q=i*4;
        attrib.setXYZ(q,X-dx,Y-dy,Z-dz);
        attrib.setXYZ(q+1,X+dx,Y-dy,Z+dz);
        attrib.setXYZ(q+2,X+dx,Y+dy+size,Z+dz);
        attrib.setXYZ(q+3,X-dx,Y+dy+size,Z-dz);
      });
      attrib.needsUpdate=true;
    };
  }
  class Pitch{
    constructor(canvas,options){
      this.options=options;this.canvas=canvas;this.scene=new THREE.Scene();
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
      const scene=this.scene;scene.background=new THREE.Color('#a2bdc5');scene.fog=new THREE.FogExp2('#acbec2',.0032);
      scene.add(new THREE.HemisphereLight(0xfff5df,0x93aa91,1.95));
      const sun=new THREE.DirectionalLight(0xffeed1,2.2);sun.position.set(-35,65,-20);scene.add(sun);
      const grass=texture(grassCanvas());grass.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(118,82),new THREE.MeshStandardMaterial({map:grass,roughness:1}));
      plane.rotation.x=-Math.PI/2;scene.add(plane);bowl(scene);goal(scene,1);goal(scene,-1);flags(scene);
      this.ball=matchBall();scene.add(this.ball);this.fx=confetti(scene);
      this.camera=new THREE.PerspectiveCamera(46,1,.08,240);this.look=new THREE.Vector3();this.models=[];
      this.shadow=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.35,1.04),new THREE.MeshBasicMaterial({map:shadowStamp(),transparent:true,depthWrite:false}),23);
      this.official=null;
      this.shadow.frustumCulled=false;scene.add(this.shadow);this.stamp=new THREE.Object3D();this.stamp.rotation.x=-Math.PI/2;this.time=0;
    }
    inputVector(x,y){const h=this.viewHeading??0;
      if(this.lastMode==='first')return {x:-Math.cos(h)*y-Math.sin(h)*x,z:-Math.sin(h)*y+Math.cos(h)*x};
      return {x,z:y};}
    render(state,dt,opts={}){
      const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;if(this.w!==w||this.h!==h){this.w=w;this.h=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
      const b=state.ball,p=state.players[state.controlled],star=state.players[opts.scorer]||p,mode=opts.camera||'broadcast';this.time+=dt;
      for(const q of state.players){
        if(this.models[q.id]&&this.models[q.id].name!==q.name){this.models[q.id].destroy();this.models[q.id]=null;}
        if(!this.models[q.id]){const team=q.team?this.options.awayTeam:this.options.homeTeam;
          const m=new WC.PlayerModel({...q,kitColor:q.keeper?(q.team?'#6bbade':'#f3b247'):team.color,trimColor:team.secondary});
          this.models[q.id]=m;this.scene.add(m.root);}
        
        this.models[q.id].update({...q,time:this.time,speed:Math.hypot(q.vx,q.vz),heading:Math.PI/2-q.heading,selected:q.id===state.controlled,firstPerson:mode==='first',celebrate:q.team===star.team&&mode==='goal'});
        this.stamp.position.set(q.x+.14,q.active?.021:-5,q.z+.1);this.stamp.scale.set(1,1,1);this.stamp.updateMatrix();this.shadow.setMatrixAt(q.id,this.stamp.matrix);}
      this.stamp.position.set(b.x,.024,b.z);this.stamp.scale.setScalar(.31);this.stamp.updateMatrix();this.shadow.setMatrixAt(22,this.stamp.matrix);this.shadow.instanceMatrix.needsUpdate=true;
      if(!this.official){this.official=new WC.PlayerModel({name:'Referee',number:0,kitColor:'#dbe83d',trimColor:'#202726',shortsColor:'#202726',seed:227});this.scene.add(this.official.root);this.refX=-8;this.refZ=6;}
      const refX=clamp(b.x-(opts.direction||1)*8,-45,45),refZ=clamp(b.z+(b.z>0?-6:6),-30,30),dx=refX-this.refX,dz=refZ-this.refZ,dist=Math.hypot(dx,dz),speed=Math.min(5.5,dist*1.2),step=Math.min(dist,dt*speed);
      if(dist>.01){this.refX+=dx/dist*step;this.refZ+=dz/dist*step;}
      this.official.update({x:this.refX,z:this.refZ,heading:Math.atan2(b.x-this.refX,b.z-this.refZ),speed,time:this.time,selected:false});
      this.ball.position.set(b.x,Math.max(.15,b.y),b.z);this.ball.rotation.z-=dt*b.vx;this.ball.rotation.x+=dt*b.vz;
      const eye=new THREE.Vector3(),aim=new THREE.Vector3();let fov=46;
      if(mode==='first'){
        const dir=opts.direction||1, heading=Math.atan2(-p.z*.75,dir*55-p.x);
        if(this.lastMode!=='first')this.viewHeading=heading;
        this.viewHeading+=Math.atan2(Math.sin(heading-this.viewHeading),Math.cos(heading-this.viewHeading))*smoothing(7,dt);
        const a=this.viewHeading;eye.set(p.x,1.65,p.z);aim.set(p.x+Math.cos(a)*8,1.04,p.z+Math.sin(a)*8);fov=78;
      }else if(mode==='goal'){const a=star.heading+.5+(opts.stageTime||0)*.33;eye.set(star.x+4.6*Math.cos(a),1.42,star.z+4.6*Math.sin(a));aim.set(star.x,1.03,star.z);fov=39;
      }else if(mode==='replay'){const s=b.x>=0?1:-1;eye.set(s*49,6.9,Math.sign(b.z||1)*18);aim.set(b.x,Math.max(.85,b.y),b.z);fov=49;
      }else{const x=clamp(.68*b.x+.32*p.x,-42,42),z=clamp(.64*b.z+.36*p.z,-29,29);
        eye.set(x*.92,21.8,z*.82+23.5);aim.set(x,.3,z-.6);}
      const smooth=mode!==this.lastMode?1:smoothing(mode==='first'?25:6.8,dt);this.lastMode=mode;
      this.camera.position.lerp(eye,smooth);this.look.lerp(aim,smooth);this.camera.lookAt(this.look);
      if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
      this.fx(mode==='goal'?opts.stageTime:-1,star.x,star.z);this.renderer.render(this.scene,this.camera);
    }
    dispose(){this.official?.destroy();for(const m of this.models)m?.destroy();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material)){m.map?.dispose();m.dispose();}}});this.renderer.dispose();this.renderer.forceContextLoss();}
  }
  WC.Pitch=Pitch;
})();
