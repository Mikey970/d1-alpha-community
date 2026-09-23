import {characterSetting} from '../../character-context';
import {e3AppearancePreset} from './e3-appearance';

/** Shared by appearance and loot; E3 class takes precedence over the legacy flag. */
export function configuredCharacterClass():number {
  const selected = characterSetting('D1A_DIRECTOR_CHARACTER');
  const standard = selected?.startsWith('warlock-') ? 3 :
    selected?.startsWith('hunter-') ? 2 : selected === 'titan-arc' ? 1 : undefined;
  return e3AppearancePreset()?.class ?? standard ?? (characterSetting('D1A_HUNTER_ARC')==='1' ? 2 : 1);
}
