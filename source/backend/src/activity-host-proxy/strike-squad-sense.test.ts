import {eadPlayerIdentity} from './ead-kill-decoder';
import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import {decodeStrikeSense,StrikeSquadObservations,ENGINEERING,type StrikeSenseScope} from './strike-squad-sense';
// Unmodified native r421 packets, keyed by server.stdout.log line.
const captured:Record<number,string>={
  "503": "214604852140014210ffca0000000200000000000000030a302429120007000810000000000000000000000080",
  "510": "2146048521400142308000000020",
  "534": "21460485214001c208c3ca0000000200000000000000030a3024290a000a018300000000c0",
  "539": "21460485214001c2188000000020",
  "546": "21460485214001c2308000000030",
  "1588": "21460485214001c410800000024851812148500051082000000028",
  "1590": "21460485214001c46080000002585181214850005114200000002c",
  "1688": "2146048521400144008000000100",
  "1802": "21460485214001c40680000002e0",
  "1984": "32e871a1224000612000000000000000000000002428c090a428003880d000000076",
  "2119": "21460485214001c40680000003e85181214890003a00000000000000000000000022",
  "2823": "21460485214001c458bb0728000000080000001000000230"
};
const actual=(n:number)=>Buffer.from(captured[n],'hex');
type TestRow = { bundle?: number; squad?: number; activationCount?: number; currentCohortCount?: number; valid?: boolean; retirementRoster?: number[]; extras?: boolean; sequence: number };
function packet(rows: TestRow[]): Buffer {
  const parts=['00']; const w=(n: number,v: number)=>parts.push(BigInt(v).toString(2).padStart(n,'0'));
  const opt=(n: number,v: number | undefined)=>{w(1,v!==undefined?1:0);if(v!==undefined)w(n,v);};
  for (const r of rows) {
    w(1,1);w(32,r.bundle??ENGINEERING);w(6,2);w(16,(r.squad??2)+0x8000);w(1,1);
    opt(31,undefined);opt(31,undefined);opt(31,undefined);
    opt(6,r.activationCount);opt(6,r.currentCohortCount);w(3,0);w(1,r.valid===false?0:1);opt(7,127);
    w(1,r.retirementRoster?1:0);if(r.retirementRoster){w(4,r.retirementRoster.length);for(const n of r.retirementRoster)w(32,n+0x80000000);}
    w(1,r.extras?1:0);w(32,r.sequence);
  }
  w(1,0);let bits=parts.join('');bits=bits.padEnd(Math.ceil(bits.length/8)*8,'0');
  return Buffer.from(bits.match(/.{8}/g)!.map(b=>parseInt(b,2)));
}
const scope=(now=1,patch: Partial<StrikeSenseScope>={}): StrikeSenseScope=>({epoch:'runA/slice7/lifetime1',tokens:{2:'spawn1',3:'spawn2'},loaded:true,bound:true,now,...patch});
function tracker(){const t=new StrikeSquadObservations();t.reset(scope().epoch);t.bind(2,'spawn1',[3,3],0);t.bind(3,'spawn2',[3,3],0);return t;}

function full(t=tracker()) {
  t.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:2},
    {squad:3,currentCohortCount:6,retirementRoster:[0,0],sequence:2}]),scope());return t;
}
test('actual r421: complete creation, two deaths without false clear, rocket kill to5',()=>{
  const t=tracker();t.observe(actual(503),scope(503));assert.equal(t.count(2),undefined);
  t.observe(actual(510),scope(510));assert.equal(t.count(2),6);
  t.observe(actual(534),scope(534));assert.equal(t.count(3),undefined);
  t.observe(actual(539),scope(539));assert.equal(t.count(3),undefined);
  t.observe(actual(546),scope(546));assert.equal(t.count(3),6);
  for(const n of[1588,1590,1688,1802,1984,2119]) {
    assert.ok(decodeStrikeSense(actual(n)));t.observe(actual(n),scope(n));
    assert.equal(t.count(2,n),6);assert.equal(t.count(3,n),6);
  }
  const r=t.observe(actual(2823),scope(2823));assert.equal(r.length,1);
  assert.equal(r[0].currentCohortCount,5);assert.deepEqual(r[0].retirementRoster,[0,1]);
  assert.equal(r[0].populationCleared,false);assert.equal(t.count(3,10000000),5);
});
test('complementary cached deltas and whole-packet evaluation, no timeout expiry',()=>{
  const t=full();assert.deepEqual(t.observe(packet([{retirementRoster:[0,1],sequence:3}]),scope(2)),[]);
  assert.equal(t.count(2),undefined);
  assert.equal(t.observe(packet([{currentCohortCount:5,sequence:4}]),scope(3))[0].currentCohortCount,5);
  t.observe(packet([{currentCohortCount:0,sequence:5}]),scope(4));assert.equal(t.count(2),undefined);
  assert.equal(t.observe(packet([{retirementRoster:[3,3],sequence:6}]),scope(5))[0].populationCleared,true);
  t.observe(packet([{currentCohortCount:6,sequence:4}]),scope(6));assert.equal(t.count(2),0);
  const u=full();assert.deepEqual(u.observe(packet([{currentCohortCount:0,retirementRoster:[3,3],sequence:3},
    {currentCohortCount:5,sequence:4}]),scope(2)),[]); // No premature prefix terminal event.
});
test('initial zero or partial creation cannot pass floor threshold; omitted roster later works',()=>{
  const t=tracker();t.observe(packet([{currentCohortCount:0,retirementRoster:[3,3],sequence:2}]),scope());assert.equal(t.count(2),undefined);
  const u=tracker();u.observe(packet([{currentCohortCount:5,retirementRoster:[0,1],sequence:2}]),scope());assert.equal(u.count(2),undefined);
  const v=tracker();v.observe(packet([{currentCohortCount:6,sequence:2}]),scope());assert.equal(v.count(2),undefined);
  v.observe(packet([{retirementRoster:[0,0],sequence:3}]),scope(2));assert.equal(v.count(2),6);
});
test('cumulative refill preserves sequence/deaths and requires new complete remaining population',()=>{
  const t=full();t.observe(packet([{currentCohortCount:5,retirementRoster:[0,1],sequence:3}]),scope(2));
  t.updateAllocation(2,'spawn1',[3,6]);assert.equal(t.count(2),undefined);
  t.observe(packet([{currentCohortCount:7,sequence:4}]),scope(3));assert.equal(t.count(2),undefined);
  t.observe(packet([{currentCohortCount:8,sequence:5}]),scope(4));assert.equal(t.count(2),8);
  t.observe(packet([{currentCohortCount:7,retirementRoster:[0,2],sequence:6}]),scope(5));assert.equal(t.count(2),7);
  assert.throws(()=>t.updateAllocation(2,'spawn1',[3,3]));
});
test('unload, reset, changed token, invalid receipt, impossible count, retired regression invalidate',()=>{
  const dead=packet([{currentCohortCount:0,retirementRoster:[3,3],sequence:3}]);
  const t=full();t.observe(dead,scope(2,{loaded:false}));assert.equal(t.count(2),undefined);assert.deepEqual(t.observe(dead,scope(3)),[]);
  const u=full();u.observe(dead,scope(2,{tokens:{2:'other'}}));assert.equal(u.count(2),undefined);
  const v=full();v.reset('new');assert.deepEqual(v.observe(dead,scope(2)),[]);assert.equal(v.count(2),undefined);
  const w=full();w.observe(packet([{valid:false,sequence:3}]),scope(2));assert.equal(w.count(2),undefined);
  const x=full();x.observe(packet([{currentCohortCount:5,retirementRoster:[0,1],sequence:3}]),scope(2));
  x.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:4}]),scope(3));assert.equal(x.count(2),undefined);
  const y=full();y.observe(packet([{currentCohortCount:7,sequence:3}]),scope(2));assert.equal(y.count(2),undefined);
});
test('bad framing or unsupported trailing row rejects whole packet without updating earlier rows',()=>{
  const p=actual(503);for(let n=0;n<p.length;n++)assert.equal(decodeStrikeSense(p.subarray(0,n)),undefined);
  const bad=Buffer.from(p);bad[bad.length-1]|=1;assert.equal(decodeStrikeSense(bad),undefined);
  assert.equal(decodeStrikeSense(packet([{retirementRoster:[1],sequence:3}])),undefined);
  const t=full(),mixed=packet([{currentCohortCount:0,retirementRoster:[3,3],sequence:3},
    {squad:3,currentCohortCount:0,extras:true,sequence:3}]);
  assert.equal(decodeStrikeSense(mixed),undefined);assert.deepEqual(t.observe(mixed,scope(2)),[]);assert.equal(t.count(2),6);
});


const mixed422:Record<number,string>={
  "499": "b2e871a1214002403fe00000000e5d0e342428003807fc00000001cba1c68485000500ff80000000397438d090a000601ff000000006146048521400a403fe00000000c28c090a428013807fc000000018518121485002500ff8000000030a3024290a004601ff0000000061460485214008403fe00000000c28c090a42800f807fc000000018518121485001d00ff8000000030a3024290a003601ff0000000061460485214006403fe00000000d1e1b0380d8014c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b0027800000071811c9dc51ffae14843b390060000000034786c0e036004b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c008e0000001c6047277147feb85210ece401800000000d1e1b0380d8010c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b001f800000071811c9dc51ffae14843b390060000000034786c0e036003b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c006e0000001c6047277147feb85210ece401800000000d1e1b0380d800cc00000038c08e4ee28ffd70a421d9c803000000001a3c360701b0017800000071811c9dc51ffae14843b390060000000034786c0e036002b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c004e0000001c6047277147feb85210ece401800000000d1e1b0380d8008c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b000f800000071811c9dc51ffae14843b390060000000034786c0e036001b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c002e0000001c6047277147feb85210ece401800000000c28c090a42800b807fc000000018518121485001500ff8000000030a3024290a002601ff0000000061460485214004403fe00000000c28c090a428007807fc000000018518121485000d00ff8000000030a3024290a001601ff0000000061460485214002403fe00000000c28c090a428003807fc00000001851812148500050823ff2800000008000000000000000c28c090a448001c00204000000000000000000000020",
  "504": "2146048521400142208000000020",
  "508": "2146048521400142308000000030"
};
test('r422 initial mixed PlayerSense packet40 entries retains Squad2 retirement before cohort6',()=>{
  const initial=Buffer.from(mixed422[499],'hex'), decoded=decodeStrikeSense(initial)!;
  assert.equal(decoded.rows.length,40);assert.equal(decoded.rows.filter(r=>r.type===12).length,16);
  const squad=decoded.squads.find(r=>r.index===2)!;
  assert.equal(squad.currentCohortCount,1);assert.deepEqual(squad.retirementRoster,[0,0]);
  assert.equal(squad.sequence,1);assert.equal(squad.startBit,5925);assert.equal(squad.endBit,6105);
  const t=tracker();t.observe(initial,scope(499));assert.equal(t.count(2),undefined);
  t.observe(Buffer.from(mixed422[504],'hex'),scope(504));assert.equal(t.count(2),undefined);
  t.observe(Buffer.from(mixed422[508],'hex'),scope(508));assert.equal(t.count(2),6);
  const unsupported=Buffer.from(initial);unsupported[0]|=0x40;
  assert.equal(decodeStrikeSense(unsupported),undefined);
  const invalidCount=Buffer.from(initial);
  // First Player body startsbit1449; its nested count begins after32bits.
  for(let p=1481;p<1485;p++) invalidCount[p>>3]|=1<<(7-(p&7));
  assert.equal(decodeStrikeSense(invalidCount),undefined);
});


// Exact r423 scalar-only receipt seq1 followed by first population alsoseq1.
const receipts423:Record<number,string>={
  "1247": "b2e871a1214002403fe00000000e5d0e342428003807fc00000001cba1c68485000500ff80000000397438d090a000601ff000000006146048521400a403fe00000000c28c090a428013807fc000000018518121485002500ff8000000030a3024290a004601ff0000000061460485214008403fe00000000c28c090a42800f807fc000000018518121485001d00ff8000000030a3024290a003601ff0000000061460485214006403fe00000000d1e1b0380d8014c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b0027800000071811c9dc51ffae14843b390060000000034786c0e036004b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c008e0000001c6047277147feb85210ece401800000000d1e1b0380d8010c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b001f800000071811c9dc51ffae14843b390060000000034786c0e036003b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c006e0000001c6047277147feb85210ece401800000000d1e1b0380d800cc00000038c08e4ee28ffd70a421d9c803000000001a3c360701b0017800000071811c9dc51ffae14843b390060000000034786c0e036002b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c004e0000001c6047277147feb85210ece401800000000d1e1b0380d8008c00000038c08e4ee28ffd70a421d9c803000000001a3c360701b000f800000071811c9dc51ffae14843b390060000000034786c0e036001b0000000e302393b8a3ff5c2908767200c0000000068f0d81c06c002e0000001c6047277147feb85210ece401800000000c28c090a42800b807fc000000018518121485001500ff8000000030a3024290a002601ff0000000061460485214004403fe00000000c28c090a428007807fc000000018518121485000d00ff8000000030a3024290a001601ff0000000061460485214002403fe00000000c28c090a428003807fc000000018518121485000500ff800000002",
  "1252": "214604852140014210ffca0000000200000000000000030a302429120007000810000000000000000000000080",
  "1256": "2146048521400142308000000020"
};
test('r423 initial scalar receipt cannot suppress populated state sharing sequence1',()=>{
  const t=tracker(),initial=Buffer.from(receipts423[1247],'hex');
  const meta=decodeStrikeSense(initial)!.squads.find(r=>r.index===2)!;
  assert.equal(meta.sequence,1);assert.equal(meta.currentCohortCount,undefined);
  assert.equal(meta.retirementRoster,undefined);t.observe(initial,scope(1247));
  const first=Buffer.from(receipts423[1252],'hex');
  assert.equal(decodeStrikeSense(first)!.squads[0].sequence,1);
  t.observe(first,scope(1252));assert.equal(t.count(2),undefined);
  const ready=t.observe(Buffer.from(receipts423[1256],'hex'),scope(1256));
  assert.equal(ready[0].currentCohortCount,6);assert.equal(ready[0].sequence,2);
  assert.deepEqual(ready[0].retirementRoster,[0,0]);
  assert.deepEqual(t.observe(first,scope(1257)),[]);assert.equal(t.count(2),6);
  // Old populated/retirement state cannot overwrite the newer actual state.
  assert.deepEqual(t.observe(packet([{currentCohortCount:0,retirementRoster:[3,3],sequence:1}]),scope(1258)),[]);
  assert.equal(t.count(2),6);
});

import { VenusStrikeEngineeringRuntime, type VenusStrikeEngineeringRuntimeEffect } from './venus-strike-engineering-runtime';
test('validated retirement is unavailable before full native cohort, detached, and invalidated by stale binding',()=>{
  const t=tracker();assert.equal(t.validatedPopulation(2,'spawn1'),undefined);
  t.observe(packet([{currentCohortCount:3,retirementRoster:[0,0],sequence:2}]),scope());
  assert.equal(t.validatedPopulation(2,'spawn1'),undefined);
  const u=full();u.observe(packet([{currentCohortCount:3,retirementRoster:[2,1],sequence:3}]),scope(2));
  const v=u.validatedPopulation(2,'spawn1',2)!;assert.deepEqual(v.retirementRoster,[2,1]);
  v.retirementRoster[0]=99;v.allocation[0]=99;
  assert.deepEqual(u.validatedPopulation(2,'spawn1')!.retirementRoster,[2,1]);
  assert.equal(u.validatedPopulation(2,'other'),undefined);assert.equal(u.validatedPopulation(2,'spawn1',1),undefined);
  u.updateAllocation(2,'spawn1',[5,4]);assert.equal(u.validatedPopulation(2,'spawn1'),undefined);
  u.observe(packet([{currentCohortCount:6,sequence:4}]),scope(3));assert.equal(u.count(2),6);
  u.updateAllocation(2,'spawn1',[5,4]);assert.equal(u.count(2),6); // No changed allocation, no lost readiness.
  u.invalidate(2);assert.equal(u.validatedPopulation(2,'spawn1'),undefined);
});

test('authored request refills three missing members, retains native token and dedupes retransmission',()=>{
  const emitted:VenusStrikeEngineeringRuntimeEffect[]=[];
  const r=new VenusStrikeEngineeringRuntime('refill-test',e=>emitted.push(e),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
  try {
    r.start();const x=r as any;
    const binding=x.tokens[2];assert.ok(binding);
    r.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}]));
    r.observe(packet([{currentCohortCount:3,retirementRoster:[2,1],sequence:2}]));
    assert.equal(emitted.filter(e=>e.kind==='respawn').length,1); // Counts alone never refill.
    const requested={kind:'respawn',squad:2,population:[3,3],token:999} as const;
    x.apply(requested); // Exact authored effect interface, not a fabricated Sense/kill.
    const refill=emitted.at(-1)!;assert.equal(refill.kind,'respawn');
    if(refill.kind!=='respawn') throw Error('missing refill');
    assert.deepEqual(refill.cumulativePopulation,[5,4]);
    const nativeExisting=[1,2],nativeRetired=[2,1];
    const created=refill.cumulativePopulation!.map((n,i)=>Math.max(0,n-nativeExisting[i]-nativeRetired[i]));
    assert.deepEqual(created,[2,1]);assert.equal(created.reduce((a,b)=>a+b,0),3); // Not an extra six.
    assert.equal(x.tokens[2],binding);assert.equal(x.observations.count(2),undefined);
    const sent=emitted.length;x.apply(requested);assert.equal(emitted.length,sent);
    r.observe(packet([{currentCohortCount:6,sequence:3}]));
    assert.equal(x.observations.count(2),6);
    x.apply({...requested,token:1000}); // Full squad: unchanged Auth, zero new actors.
    assert.equal(x.observations.count(2),6);assert.equal(x.tokens[2],binding);
    const last=emitted.at(-1)!;if(last.kind!=='respawn') throw Error('missing no-op auth');
    assert.deepEqual(last.cumulativePopulation,[5,4]);
  } finally {r.stop();}
});

test('refill without validated native retirement emits nothing',()=>{
  const emitted:VenusStrikeEngineeringRuntimeEffect[]=[];
  const r=new VenusStrikeEngineeringRuntime('unseen',e=>emitted.push(e),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);
  try {r.start();const count=emitted.length;(r as any).apply({kind:'respawn',squad:2,population:[3,3],token:999});
    assert.equal(emitted.length,count);
  } finally {r.stop();}
});


function pendingRefill(x:any, token=999) {
  // Fixture for the actual FSM-issued request boundary; native receipts still go through decoder/tracker.
  for(const timer of x.timers) clearTimeout(timer);x.timers.clear();
  x.state={...x.state,program:[{kind:'spawn',squad:2}],pc:0,pending:{kind:'spawn',token},
    squads:{...x.state.squads,2:{token,requested:false,sequence:-1,observed:false,observedAt:Date.now()}}};
  x.apply({kind:'respawn',squad:2,population:[3,3],token});
}
test('deferred refill retries once only after complementary native delta settles, then awaits materialization',()=>{
  const emitted:VenusStrikeEngineeringRuntimeEffect[]=[];
  const r=new VenusStrikeEngineeringRuntime('retry',e=>emitted.push(e),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);const x=r as any;
  try {
    r.start();const binding=x.tokens[2];
    r.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}]));
    r.observe(packet([{retirementRoster:[2,1],sequence:2}])); // Live count6 vs retired3: unsettled.
    pendingRefill(x);assert.equal(x.deferredRefills.size,1);
    const before=emitted.length;
    r.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}])); // Stale.
    r.observe(packet([{squad:3,currentCohortCount:3,retirementRoster:[2,1],sequence:3}])); // Unbound.
    assert.equal(emitted.length,before);assert.equal(x.state.squads[2].requested,false);
    r.observe(packet([{currentCohortCount:3,sequence:3}])); // Actual settlement authorizes retry.
    assert.equal(emitted.length,before+1);const refill=emitted.at(-1)!;
    if(refill.kind!=='respawn') throw Error('missing refill');
    assert.deepEqual(refill.cumulativePopulation,[5,4]);assert.equal(x.tokens[2],binding);
    assert.equal(x.state.squads[2].requested,true);assert.equal(x.state.squads[2].observed,false);
    assert.equal(x.observations.count(2),undefined);assert.equal(x.deferredRefills.size,0);
    r.observe(packet([{currentCohortCount:3,sequence:3}]));assert.equal(emitted.length,before+1);
    r.observe(packet([{currentCohortCount:6,sequence:4}]));
    assert.equal(x.state.squads[2].alive,6);assert.equal(x.state.squads[2].observed,true);
    assert.equal(emitted.length,before+1);
  } finally {r.stop();}
});
test('obsolete authored token or changed native binding cannot retry deferred allocation',()=>{
  for(const changedBinding of [false,true]) {
    const emitted:VenusStrikeEngineeringRuntimeEffect[]=[];
    const r=new VenusStrikeEngineeringRuntime('stale-retry',e=>emitted.push(e),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);const x=r as any;
    try {
      r.start();r.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}]));
      r.observe(packet([{retirementRoster:[2,1],sequence:2}]));pendingRefill(x);
      if(changedBinding) {x.tokens[2]='replacement';x.observations.bind(2,'replacement',[3,3]);}
      else {x.state.pending.token=1000;x.state.squads[2].token=1000;}
      const before=emitted.length;
      r.observe(packet([{currentCohortCount:changedBinding?6:3,retirementRoster:changedBinding?[0,0]:[2,1],sequence:3}]));
      assert.equal(emitted.length,before);assert.equal(x.deferredRefills.size,0);
    } finally {r.stop();}
  }
});
test('stop discards deferred requests and future genuine observations cannot send them',()=>{
  const emitted:VenusStrikeEngineeringRuntimeEffect[]=[];
  const r=new VenusStrikeEngineeringRuntime('stop-retry',e=>emitted.push(e),()=>{},eadPlayerIdentity(0x200000002n,0xd1a0000000000001n)!);const x=r as any;
  r.start();pendingRefill(x);assert.equal(x.deferredRefills.size,1);
  r.stop();assert.equal(x.deferredRefills.size,0);const before=emitted.length;
  r.observe(packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}]));assert.equal(emitted.length,before);
});

test('native-layout Object0 empty/device receipt can coalesce with a squad; unknown tags reject the whole packet',()=>{
  // Synthetic codec framing contract from808005F0 and device80802D89.
  // It is not presented as a captured door animation or gameplay receipt.
  const squad=packet([{currentCohortCount:6,retirementRoster:[0,0],sequence:1}]);
  const end=decodeStrikeSense(squad)!.rows[0].endBit;
  function coalesced(device:boolean,tag=0x80802d89,index=0) {
    const parts=[...squad].map(b=>b.toString(2).padStart(8,'0')).join('').slice(0,end);
    const fields:string[]=[parts];const w=(n:number,v:number)=>fields.push(BigInt(v).toString(2).padStart(n,'0'));
    w(1,1);w(32,ENGINEERING);w(6,5);w(16,index+0x8000);w(1,1);
    w(32,0x80000001);w(1,1);w(32,0x80000000);w(32,0);w(32,0);w(4,device?1:0);
    if(device){w(1,1);w(32,tag);for(const word of[0x80000000,0,0x80000000,0,0x80000001,0x3f800000])w(32,word);}
    w(32,1);w(1,0);let bits=fields.join('');bits=bits.padEnd(Math.ceil(bits.length/8)*8,'0');
    return Buffer.from(bits.match(/.{8}/g)!.map(s=>parseInt(s,2)));
  }
  for(const device of [false,true]){
    const t=tracker();const p=coalesced(device);
    assert.equal(decodeStrikeSense(p)!.rows.length,2);
    assert.equal(t.observe(p,scope())[0].currentCohortCount,6);
  }
  assert.equal(decodeStrikeSense(coalesced(true,0x80802d88)),undefined);
  assert.equal(decodeStrikeSense(coalesced(false,0x80802d89,5)),undefined);
  const t=tracker();assert.deepEqual(t.observe(coalesced(true,0x80802d88),scope()),[]);
  assert.equal(t.count(2),undefined);
});

test('repeated native retirement can exceed63 cumulatively while each refilled cohort remains6',()=>{
  const t=full();let sequence=3,now=2;
  for(let wave=1;wave<=12;wave++){
    const retired=3*wave;
    t.observe(packet([{currentCohortCount:0,retirementRoster:[retired,retired],sequence:sequence++}]),scope(now++));
    assert.equal(t.count(2),0);
    t.updateAllocation(2,'spawn1',[retired+3,retired+3]);
    assert.equal(t.count(2),undefined);
    t.observe(packet([{currentCohortCount:6,sequence:sequence++}]),scope(now++));
    assert.equal(t.count(2),6);
  }
  assert.deepEqual(t.validatedPopulation(2,'spawn1')!.allocation,[39,39]);
  assert.throws(()=>t.updateAllocation(2,'spawn1',[100,100]));
  assert.throws(()=>tracker().bind(2,'too-many-initial',[39,39]));
});
