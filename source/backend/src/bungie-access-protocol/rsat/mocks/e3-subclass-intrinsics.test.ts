import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});

it('retains native capacity intrinsics without leaking a saved Warlock step perk into E3',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'e3-perks-'));
  try {
    const file=join(dir,'talent.json');
    const original=JSON.stringify({schema:2,itemSoid:'300000200',definition:442,grid:251,
      purchased:[1,21,15,11,22],version:4,provenance:'client-801-with-explicit-test-progression',testXp:49000});
    writeFileSync(file,original);
    vi.stubEnv('D1A_TALENT_PROBE','1');vi.stubEnv('D1A_TALENT_STATE_PATH',file);
    vi.stubEnv('D1A_EQUIPMENT_PROFILE','');vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');
    vi.stubEnv('D1A_ARMOR_TALENT_PROBE','');
    vi.stubEnv('D1A_E3_ABILITY_PRESET','18');
    const {stubGearCf}=await import('./values');
    const {talentIntrinsicPerks}=await import('./talent-state');
    expect(talentIntrinsicPerks()).toEqual([51,96,97,98,95]);
    expect(stubGearCf().unknown5.unknown0.filter(p=>p>=0)).toEqual([96,97,98,95]);
    expect(readFileSync(file,'utf8')).toBe(original);
    const {equipInventoryProbe}=await import('./loadout');
    expect(equipInventoryProbe(0x300000200n)).toBe(true);
    // Normal subclass effects follow an actual equip, rather than changing
    // a process-wide preset flag while the E3 item remains selected.
    expect(stubGearCf().unknown5.unknown0.filter(p=>p>=0)).toEqual([51,96,97,98,95]);
    vi.stubEnv('D1A_E3_ABILITY_PRESET','');
    expect(stubGearCf().unknown5.unknown0.filter(p=>p>=0)).toEqual([51,96,97,98,95]);
  } finally {rmSync(dir,{recursive:true});}
});
