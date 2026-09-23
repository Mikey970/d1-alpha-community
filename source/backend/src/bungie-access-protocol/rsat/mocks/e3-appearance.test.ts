import {afterEach, expect, it, vi} from 'vitest';
import presets from './e3-appearance.native.json';
import catalog from './reward-catalog-native.json';
import {encode,decode} from '@blamnetwork/rsat';
import {PeerCharacter,SelfInventory} from '../../queuez';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('publishes every authored E3 armor/dye selection through GearCF and character appearance', async () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', '');
  vi.stubEnv('D1A_TALENT_STATE_PATH', '');
  for (const preset of presets) {
    vi.stubEnv('D1A_E3_ABILITY_PRESET', String(preset.index));
    vi.resetModules();
    const values = await import('./values');
    const loadout = await import('./loadout');
    const gear = values.stubGearCf().unknown3.unknown0;
    expect(loadout.STUB_CHARACTER_CLASS).toBe(preset.class);
    expect(values.stubAppearanceEc()).toMatchObject({gender:preset.gender,classIndex:preset.class-1});
    const peer=decode(PeerCharacter,encode(PeerCharacter,values.stubPeerCharacter(0x300000001n)));
    const self=decode(SelfInventory,encode(SelfInventory,{unknown0:values.stubSelfCharacter(0x300000001n)}));
    for(const slot of [2,3,4,5,6]) {
      const equipped=peer.unknown3!.unknown3!.unknown0[slot]!;
      const native=catalog.find(item=>item.defIndex===equipped.defIndex)!;
      expect(native).toBeDefined();
      expect(native.characterClass).toBe(preset.class);
      expect(native.slot).toBe(slot);
      const bag=self.unknown0!.unknown3!.unknown1!.unknown0.find(item=>item.soid===equipped.soid);
      expect(bag?.defIndex).toBe(equipped.defIndex);
    }
    for (const armor of preset.armor) {
      expect(gear[armor.slot]).toMatchObject({
        soid: loadout.itemSoidForSlot(armor.slot), unknown3: armor.art,
        unknown4: {unknown0: [
          ...armor.dyes.map(d => ({unknown0:d.channel,unknown1:d.index})),
          ...Array.from({length:3}, () => ({unknown0:-1,unknown1:-1})),
        ]},
      });
    }
  }
});

it('leaves the normal loadout appearance unchanged when no preset is selected', async () => {
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', '');
  vi.resetModules();
  const {e3ArmorAppearance} = await import('./e3-appearance');
  expect(e3ArmorAppearance(2)).toBeUndefined();
});
