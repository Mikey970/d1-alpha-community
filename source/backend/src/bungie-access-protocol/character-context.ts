import { AsyncLocalStorage } from 'node:async_hooks';
import type {AppearanceEcValue, AppearanceF0Value} from './queuez/shared';

/** One saved character, shared by its connections but never by another save. */
export interface CharacterContext {
  readonly environment: Readonly<Partial<Record<CharacterSetting, string | undefined>>>;
  readonly appearance?: () => {identity?: AppearanceEcValue; appearance?: AppearanceF0Value};
}

export type CharacterSetting = 'D1A_EQUIPMENT_PROFILE' | 'D1A_TALENT_STATE_PATH' |
  'D1A_VENDOR_ECONOMY_PROFILE' | 'D1A_DIRECTOR_CHARACTER' | 'D1A_E3_ABILITY_PRESET' |
  'D1A_HUNTER_ARC';

const storage = new AsyncLocalStorage<CharacterContext>();
const launcherContext: CharacterContext = { environment: {} };

export function currentCharacterContext(): CharacterContext {
  return storage.getStore() ?? launcherContext;
}

export function characterSetting(key: CharacterSetting): string | undefined {
  const overrides = currentCharacterContext().environment;
  // An explicit undefined clears an inherited E3 preset for a standard character.
  return Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : process.env[key];
}

export function withCharacter<T>(context: CharacterContext, work: () => T): T {
  return storage.run(context, work);
}

/** Lazy, per-character state. Async descendants keep the originating save. */
export function characterLocal<T>(create: () => T): () => T {
  const values = new WeakMap<CharacterContext, T>();
  return () => {
    const context = currentCharacterContext();
    if (!values.has(context)) values.set(context, create());
    return values.get(context)!;
  };
}
