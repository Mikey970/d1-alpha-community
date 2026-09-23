import rows from './e3-armor-items.native.json';
import {e3AppearancePreset} from './e3-appearance';

/** Original class-appropriate item identity; E3 appearance is published separately.
 * Native donor stats are not evidence of E3-specific armor statistics.
 * Slot6 is a class-appropriate default because E3 does not assign a class item. */
export function e3ArmorBaseDefinition(slot:number) {
  const preset=e3AppearancePreset();
  const row=preset && rows.find(item=>item.preset===preset.index && item.slot===slot);
  return row ? {defIndex:row.defIndex,bucket:row.bucket,
    artArrangement:row.artArrangement,sandboxPattern:row.sandboxPattern} : undefined;
}
