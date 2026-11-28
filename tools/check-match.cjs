const assert = require('node:assert/strict');
global.window = global;
require('../game/sim.js');
const still = {x:0,z:0,sprint:false};

function drill(distance, action, frameRate = 60) {
  const sim = new WC.Sim({random:()=>.5});
  sim.phase = 'live';
  sim.restart = null;
  for (const player of sim.players) player.active = [8,9].includes(player.id);
  const passer = sim.players[9], receiver = sim.players[8];
  sim.put(passer,-22,-5);
  sim.put(receiver,-22+distance,-5);
  sim.takeBall(passer);
  sim.action(action,.65,{x:1,z:0});
  for (let i = 0; i < 3*frameRate && sim.ball.owner === null; i++) {
    sim.update(1/frameRate,{x:0,z:1,sprint:false});
  }
  assert.equal(sim.ball.owner,receiver.id,action+' '+distance+'m @ '+frameRate+'Hz');
  return sim;
}
for (const fps of [30,60,120]) {
  for (const distance of [8,24,36]) {
    for (const type of ['pass','halfPass','highPass','oneTwo','through','powerThrough','loftThrough']) {
      drill(distance,type,fps);
    }
  }
}
const normal = drill(24,'pass'), split = drill(24,'through');
assert.ok(split.selected.x > normal.selected.x+3,'through balls should run into space');

// A queued shot must keep the intended corner even if the next stick sample changes.
const sim = drill(8,'pass');
const attacker = sim.selected;
sim.kickData = {target:attacker.id,team:0};
sim.ball.owner = null;
sim.action('shoot',.9,{x:1,z:-.85});
sim.input = {x:1,z:.8};
sim.takeBall(attacker,true);
assert.equal(sim.kickData.kind,'shoot');
assert.ok((sim.ball.z+sim.ball.vz/sim.ball.vx*(53.5-sim.ball.x))<0);
assert.equal(sim.queuedKick,null);

const spot = new WC.Sim({mode:'penalty',random:()=>.99});
spot.action('power',1,{x:1,z:.72});
const events = [];
for(let i=0;i<1200;i++){
  spot.update(1/60,still);
  events.push(...spot.drainEvents());
  if(spot.phase==='restart')break;
}
assert.equal(spot.practice.goals,1);
assert.equal(spot.phase,'restart');
assert.equal(events.filter(e=>e.type==='net').length,1);

// A defender between the passer and receiver must still be able to intercept.
const block = new WC.Sim({random:()=>.5});
for(const p of block.players)p.active=[8,9,14].includes(p.id);
block.phase='live';block.restart=null;
block.put(block.players[9],-22,0);block.put(block.players[8],0,0);block.put(block.players[14],-11,0);
block.takeBall(block.players[9]);block.action('pass',.65,{x:1,z:0});
for(let i=0;i<120 && block.ball.owner===null;i++)block.update(1/60,still);
assert.equal(block.ball.owner,14);
console.log('63 pass scenarios, one-touch aim, interception and penalty replay cycle passed.');
