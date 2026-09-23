import {characterSetting} from '../../character-context';
import native from './e3-abilities.native.json';

// Explicit experimental projection. This does not replace saved subclass
// selections, inventory identity, appearance, or the unfinished weapon assembly.
export function e3AbilityRecords(characterClass: number) {
  const selection = characterSetting('D1A_E3_ABILITY_PRESET');
  if (!selection) return undefined;
  if (!/^(18|19|20|21|22|23|24|25)$/.test(selection)) {
    throw new Error('D1A_E3_ABILITY_PRESET must name an authored E3 preset (18-25)');
  }
  const preset = native.presets.find(p => p.index === Number(selection))!;
  if (preset.class !== characterClass) {
    throw new Error(`E3 preset ${preset.index} requires character class ${preset.class}; current class is ${characterClass}`);
  }
  return preset.abilities.map(ability => ({
    unknown0: ability.index,
    unknown1: { unknown0: Array.from({length: 8}, (_, i) => ability.modifiers[i] ?? 0x811c9dc5) },
  }));
}
