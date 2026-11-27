// Each optional portrait is kept on this iPad; image files never leave the app.
(()=>{
const art=window.WC.cardArt={};const urls=new Map();let db;
const open=()=>db||(db=new Promise((resolve,reject)=>{const req=indexedDB.open('wc2027.portraits',1);req.onupgradeneeded=()=>req.result.createObjectStore('art');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}));
art.url=(team,slot)=>urls.get(team+'-'+slot)||'art/player-'+((slot+team*3)%12)+'.jpg';
open().then(d=>{const req=d.transaction('art').objectStore('art').openCursor();req.onsuccess=()=>{const c=req.result;if(c){urls.set(c.key,URL.createObjectURL(c.value));c.continue();}else window.dispatchEvent(new Event('wc-art-ready'));};}).catch(()=>{});
art.import=async function(team,slot){
 const file=await new Promise(resolve=>{const el=document.createElement('input');el.type='file';el.accept='image/*';el.onchange=()=>resolve(el.files[0]);el.oncancel=()=>resolve(null);el.click();});if(!file)return false;
 const src=URL.createObjectURL(file),img=new Image();
 try{img.src=src;await img.decode();const c=document.createElement('canvas');c.width=400;c.height=480;const scale=Math.max(c.width/img.width,c.height/img.height);
 c.getContext('2d').drawImage(img,(400-img.width*scale)/2,(480-img.height*scale)/2,img.width*scale,img.height*scale);
 const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.89)),d=await open(),key=team+'-'+slot;
 await new Promise((resolve,reject)=>{const tx=d.transaction('art','readwrite');tx.objectStore('art').put(blob,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 if(urls.has(key))URL.revokeObjectURL(urls.get(key));urls.set(key,URL.createObjectURL(blob));return true;
 }finally{URL.revokeObjectURL(src);}
};
})();
