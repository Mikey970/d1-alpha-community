import rows from './e3-subclass-intrinsics.native.json';
import {e3AppearancePreset} from './e3-appearance';

/** E3 modifiers come from compiled preset data, not an unrelated saved grid.
 * Retain the equipped subclass definition's exact native intrinsic perks. */
export function e3SubclassIntrinsics():number[]|undefined {
  const preset=e3AppearancePreset();
  return preset ? [...rows.find(row=>row.preset===preset.index)!.intrinsics] : undefined;
}
