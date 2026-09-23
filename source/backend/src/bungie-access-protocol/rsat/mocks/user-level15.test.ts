import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dirs:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function fundSwap(){
 const dir=mkdtempSync(join(tmpdir(),'d1a-level15-swap-'));dirs.push(dir);
 const file=join(dir,'economy.json');
 writeFileSync(file,JSON.stringify({schema:1,version:1,nextSerial:1,balances:{456:100},purchases:[]}));
 vi.stubEnv('D1A_VENDOR_ECONOMY','1');vi.stubEnv('D1A_VENDOR_ECONOMY_PROFILE',file);
}
it('keeps character XP and subclass XP separate and swaps only the selected Titan upgrade group',async()=>{
 fundSwap();
 vi.stubEnv('D1A_CHARACTER_LEVEL15','1');vi.stubEnv('D1A_TALENT_PROBE','1');vi.stubEnv('D1A_TALENT_STATE_PATH','');vi.resetModules();
 const c=await import('./character-progression'),t=await import('./titan-arc-state');
 expect(c.strikeCharacterLevel()).toBe(15);expect(t.talentValue().unknown1.unknown1).toBe(129000);
 expect(t.activateTalentStep(t.TALENT_ITEM_SOID,4).accepted).toBe(true);
 expect(t.activateTalentStep(t.TALENT_ITEM_SOID,1).accepted).toBe(true);
 const router=await import('./talent-state');
 expect(router.swapTalentNode(t.TALENT_ITEM_SOID,20).accepted).toBe(true);
 const ranks=t.talentValue().unknown4.unknown0;
 expect(ranks[4]).toBe(1);expect(ranks[1]).toBe(0);expect(ranks[20]).toBe(1);
 expect(c.strikeCharacterProgression().unknown1).toBe(129000);
 expect(router.swapTalentNode(123n,20).accepted).toBe(false);
});
it('restores level15 Hunter upgrades and routes exclusive swaps independently of character level',async()=>{
 fundSwap();
 vi.stubEnv('D1A_CHARACTER_LEVEL15','1');vi.stubEnv('D1A_HUNTER_ARC','1');vi.stubEnv('D1A_TALENT_PROBE','1');vi.stubEnv('D1A_TALENT_STATE_PATH','');vi.resetModules();
 const t=await import('./hunter-arc-state'),router=await import('./talent-state'),native=await import('./hunter-arc-native.json');
 const n=native.nodes.find(n=>!n.grant&&n.level===15)!;
 expect(t.activateTalentStep(t.TALENT_ITEM_SOID,n.node).accepted).toBe(true);
 const alt=native.nodes.find(a=>!a.grant&&a.node!==n.node&&a.group===n.group)!;
 expect(alt).toBeDefined();expect(router.swapTalentNode(t.TALENT_ITEM_SOID,alt.node).accepted).toBe(true);
 const ranks=t.talentValue().unknown4.unknown0;expect(ranks[n.node]).toBe(0);expect(ranks[alt.node]).toBe(1);
 expect(t.talentValue().unknown1.unknown1).toBe(129000);
 const loadout=await import('./loadout');expect(loadout.STUB_CHARACTER_CLASS).toBe(loadout.CHAR_CLASS_HUNTER);
});
