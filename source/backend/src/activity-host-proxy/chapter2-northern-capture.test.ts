import {expect,it} from 'vitest';
import packets from './r547-northern-capture.fixture.json';
import {VenusNorthernProgress} from './venus-northern-progress';
// Exact r547 2026-09-12 Northern arrival through the two user-shot gate deaths.
it('retains live gates through the coalesced 33+ entry ambient roster and credits both real deaths once',()=>{
 const p=new VenusNorthernProgress();let changes=0;
 for(const hex of packets)if(p.observe(Buffer.from(hex,'hex')))changes++;
 expect(p.defeatedGates).toEqual([129,131]);expect(changes).toBe(2);expect(p.bossDefeated).toBe(false);
 for(const hex of packets)expect(p.observe(Buffer.from(hex,'hex'))).toBe(false);
});
