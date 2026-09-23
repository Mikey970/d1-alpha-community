import {afterEach,expect,it,vi} from 'vitest';
import native from './reward-catalog-native.json';
import presets from './e3-appearance.native.json';

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});

it('uses the authored E3 class for appearance and every possible ordinary/boss loot choice',async()=>{
  vi.stubEnv('D1A_HUNTER_ARC','1'); // The existing launcher sets this for every preset.
  vi.stubEnv('D1A_EQUIPMENT_PROFILE','');
  vi.stubEnv('D1A_TALENT_STATE_PATH','');
  for(const preset of presets){
    vi.stubEnv('D1A_E3_ABILITY_PRESET',String(preset.index));vi.resetModules();
    const {STUB_CHARACTER_CLASS}=await import('./loadout');
    const {REWARD_POOL}=await import('./repeat-strike-rewards');
    const {chooseLoot}=await import('./loot-balance');
    expect(STUB_CHARACTER_CLASS).toBe(preset.class);
    const eligible=native.filter(item=>item.characterClass===0||item.characterClass===preset.class);
    expect(REWARD_POOL.map(item=>item.defIndex)).toEqual(eligible.map(item=>item.defIndex));
    for(const mode of ['ordinary','boss'] as const){
      const rolls=mode==='ordinary'?[0.1,0.8,0.99]:[0.05,0.5,0.99];
      for(let tier=1;tier<=3;tier++){
        const pool=eligible.filter(item=>item.tier===tier);
        const selected=pool.map((_,i)=>chooseLoot(mode,rolls[tier-1]!, (i+0.5)/pool.length));
        expect(selected.map(item=>item.defIndex)).toEqual(pool.map(item=>item.defIndex));
      }
    }
  }
});

it('retains the normal Titan/Hunter fallback when no preset is selected',async()=>{
  vi.stubEnv('D1A_E3_ABILITY_PRESET','');
  const {configuredCharacterClass}=await import('./configured-character-class');
  vi.stubEnv('D1A_HUNTER_ARC','');expect(configuredCharacterClass()).toBe(1);
  vi.stubEnv('D1A_HUNTER_ARC','1');expect(configuredCharacterClass()).toBe(2);
});
