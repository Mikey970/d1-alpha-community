import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'vitest';
import {decodeEadKill} from './ead-kill-decoder';
import {ServitorTargetBatchDraft} from './servitor-target-batch';

const player = {platformIdentity:'0000000200000002',characterId:'d1a0000000000001'};
const fixture = (name: string) => Buffer.from(readFileSync(new URL(
  `./strike-fixtures/${name}`, import.meta.url), 'utf8').trim(), 'hex');
const raw = fixture('r421-rocket-kill-175.hex');
const dreg = decodeEadKill(raw, 0);
const proof = {classHash:0x6adf06ae,classEvidence:'SYNTHETIC test contract',
  closedCensusEvidence:'SYNTHETIC complete census',retirementSemanticsEvidence:'SYNTHETIC retirement contract'};
const make = (group: readonly (19|16|17|18)[] = [19]) => new ServitorTargetBatchDraft(
  {runId:'test',connectionLifetime:'test-ah'}, group, proof, player);
const event = (id = 'a') => ({...dreg,eventId:id.repeat(64),victim:{...dreg.victim,baseHash:proof.classHash}});
const cohort = (squad:19|16|17|18, sequence:number, alive=1) => ({squad,allocationToken:`allocation-${squad}`,
  sequence,currentCohortCount:alive,retirementRoster:[1-alive]});
function spawn(batch:ServitorTargetBatchDraft, squad:19|16|17|18, at=0) {
  batch.bind(squad,`allocation-${squad}`,at); batch.cohort(cohort(squad,1),at);
}

test('synthetic singleton accepts either receive order exactly once', () => {
  for (const reverse of [false,true]) {
    const b=make();spawn(b,19);
    const kill=()=>b.decoded(event(),1000), retired=()=>b.cohort(cohort(19,2,0),1000);
    assert.equal((reverse?retired:kill)(),null);
    const result=(reverse?kill:retired)();
    assert.equal(result?.targets[0]?.squad,19);
    assert.equal(result?.wireVictimSquadIdentifier,null);
    assert.equal(b.decoded(event(),1001),null);
  }
});
test('simultaneous corner targets require two complete lifecycles and two packets, with no invented pairing',()=>{
  const b=make([17,18]);spawn(b,17);spawn(b,18);
  b.decoded(event('a'),1000);b.decoded(event('b'),1000);
  assert.equal(b.cohort(cohort(17,2,0),1000),null);
  const result=b.cohort(cohort(18,2,0),1000);
  assert.deepEqual(result?.targets.map(t=>t.squad),[17,18]);
  assert.equal(result?.packetIds.length,2);
  assert.equal('victimLifetimeId' in result!,false);
});
test('17 may die before 18 is spawned; its qualified delta survives without timer-based completion',()=>{
  const b=make([17,18]);spawn(b,17);b.decoded(event('a'),1000);
  assert.equal(b.cohort(cohort(17,2,0),1000),null);
  spawn(b,18,60000);b.cohort(cohort(18,2,0),62000);
  assert.equal(b.decoded(event('b'),62001)?.targets.length,2);
});
test('actual Dreg kill and Guardian death fixtures never credit Servitors',()=>{
  for (const bytes of [raw,fixture('r421-guardian-death-175.hex')]) {
    const b=make();spawn(b,19);b.cohort(cohort(19,2,0),1000);
    assert.equal(b.incident(bytes,0,1000),null);
    assert.equal(b.incident(bytes,1,1000),null);
  }
});
test('initial zero, unload, extra class event and missing timely relation fail closed',()=>{
  const initial=make();initial.bind(19,'allocation-19',0);
  assert.equal(initial.cohort(cohort(19,1,0),0),null);assert.ok(initial.blockedReason);
  const unloaded=make();spawn(unloaded,19);unloaded.invalidate('actual physical unload');
  assert.equal(unloaded.decoded(event(),1000),null);
  const extra=make();spawn(extra,19);extra.decoded(event('a'),1000);extra.decoded(event('b'),1001);
  assert.ok(extra.blockedReason);assert.equal(extra.cohort(cohort(19,2,0),1002),null);
  const stale=make();spawn(stale,19);stale.decoded(event(),1000);
  assert.equal(stale.cohort(cohort(19,2,0),5000),null);
});
