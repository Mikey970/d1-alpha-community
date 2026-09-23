import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {EventEmitter} from 'node:events';
import {characterSetting, type CharacterContext} from './character-context';
import {SIGNED_IN_CHARACTER_SOID} from './rsat/constants';
import {parseCharacterCreation, parseCharacterCustomization} from './rsat/schemas/character-session';
import type {AppearanceF0Value} from './queuez/shared';
import {WARLOCK_STARTER_ARMOR} from './rsat/mocks/warlock-starter-armor';

type Entry = {soid: string; creation?: string; customization?: string; deletedAt?: string};
type SavedCharacters = {schema: 1; version: number; nextSerial: number; entries: Entry[]};
const key = (id: bigint) => id.toString(16).padStart(16, '0');
const legacyKey = key(SIGNED_IN_CHARACTER_SOID);

/** Local account roster. Existing launcher saves stay in place. Removed cards
 * retain their entry and files; a new card always receives a new identity. */
export class CharacterStore extends EventEmitter {
  private saved: SavedCharacters;
  private readonly contexts = new Map<string, CharacterContext>();
  private readonly appearanceOverrides = new Map<string, AppearanceF0Value>();
  readonly file: string;
  // The native roster chooses the character at startup. Keep a context for
  // account publication, but do not silently log into the legacy character.
  selectedSoid = 0n;
  private lastSelectedSoid = SIGNED_IN_CHARACTER_SOID;

  constructor(private readonly legacy: CharacterContext, readonly root: string) {
    super();
    this.file = join(root, 'characters.json');
    this.saved = existsSync(this.file) ? this.read() : {
      schema: 1, version: 1, nextSerial: 3, entries: [{soid: legacyKey}],
    };
    for (const entry of this.saved.entries) if (entry.customization) {
      this.appearanceOverrides.set(entry.soid, parseCharacterCustomization(Buffer.from(entry.customization, 'hex'))!);
    }
  }

  get version() { return this.saved.version; }
  get activeContext() { return this.context(this.lastSelectedSoid); }
  select(id: bigint): boolean {
    if (id !== 0n && !this.has(id)) return false;
    if (id === this.selectedSoid) return true;
    this.selectedSoid = id;
    if (id !== 0n) this.lastSelectedSoid = id;
    this.emit('selected');
    return true;
  }
  ids(): bigint[] { return this.saved.entries.filter(e => !e.deletedAt).map(e => BigInt(`0x${e.soid}`)); }
  has(id: bigint): boolean { return this.ids().includes(id); }
  creation(id: bigint) {
    const entry = this.saved.entries.find(e => e.soid === key(id));
    return entry?.creation ? parseCharacterCreation(Buffer.from(entry.creation, 'hex'))! : undefined;
  }

  context(id: bigint): CharacterContext {
    const identity = key(id);
    if (!this.saved.entries.some(e => e.soid === identity)) throw Error('Unknown saved character');
    if (!this.contexts.has(identity)) {
      if (identity === legacyKey) this.contexts.set(identity, {...this.legacy, appearance: () => {
        const prior = this.legacy.appearance?.();
        return {...prior, appearance: this.appearanceOverrides.get(identity) ?? prior?.appearance};
      }});
      else {
        const created = this.creation(id)!;
        const selection = ['titan-arc', 'hunter-arc', 'warlock-nova'][created.identity.classIndex!]!;
        const dir = join(this.root, 'characters', identity);
        this.contexts.set(identity, {environment: {
          D1A_EQUIPMENT_PROFILE: join(dir, 'equipment.json'),
          D1A_TALENT_STATE_PATH: join(dir, 'talent.json'),
          D1A_VENDOR_ECONOMY_PROFILE: join(dir, 'equipment.json.vendor.json'),
          D1A_DIRECTOR_CHARACTER: selection, D1A_E3_ABILITY_PRESET: undefined,
          D1A_HUNTER_ARC: selection === 'hunter-arc' ? '1' : undefined,
        }, appearance: () => ({identity: created.identity, appearance: this.appearanceOverrides.get(identity) ?? created.appearance})});
      }
    }
    return this.contexts.get(identity)!;
  }

  create(body: Buffer): bigint | null {
    const request = parseCharacterCreation(body);
    if (!request || this.ids().length >= 3) return null;
    let serial = this.saved.nextSerial;
    let id = 0x200000000n + BigInt(serial);
    // An interrupted earlier commit can leave a directory. Never reuse it.
    while (existsSync(join(this.root, 'characters', key(id)))) id = 0x200000000n + BigInt(++serial);
    if (serial >= 0xffffffff) throw Error('Character identity space exhausted');
    const dir = join(this.root, 'characters', key(id));
    mkdirSync(dir, {recursive: true});
    // Same explicit community kit as prepare-director-profile.ps1. Creation
    // does not clone the original character's earned rewards or currency.
    const slots: Record<string, string> = {};
    for (let slot = 1; slot <= 9; slot++) slots[slot] = key(0x300000001n + BigInt(slot));
    slots[1] = key([0x300000203n, 0x300000202n, 0x300000200n][request.identity.classIndex!]!);
    slots[7] = key(0x300000107n); slots[8] = key(0x300000403n); slots[9] = key(0x300000402n);
    if (request.identity.classIndex === 0) {
      for (let slot = 2; slot <= 6; slot++) slots[slot] = key(0x300000420n + BigInt(slot - 2));
    }
    if (request.identity.classIndex === 2) {
      for (const item of WARLOCK_STARTER_ARMOR) slots[item.slot] = key(item.soid);
    }
    writeFileSync(join(dir, 'equipment.json'), JSON.stringify({schema: 2, version: 1, slots}) + '\n', {flag: 'wx'});
    const next: SavedCharacters = {...this.saved, version: this.saved.version + 1, nextSerial: serial + 1,
      entries: [...this.saved.entries, {soid: key(id), creation: body.toString('hex')}]};
    this.commit(next);
    return id;
  }

  customize(id: bigint, body: Buffer): boolean {
    const appearance = parseCharacterCustomization(body);
    if (!appearance || id === 0n || id !== this.selectedSoid || !this.has(id)) return false;
    const identity = key(id), customization = body.toString('hex');
    if (this.saved.entries.find(e => e.soid === identity)!.customization === customization) return true;
    this.commit({...this.saved, version: this.saved.version + 1,
      entries: this.saved.entries.map(e => e.soid === identity ? {...e, customization} : e)});
    this.appearanceOverrides.set(identity, appearance);
    this.emit('appearanceChanged', id);
    return true;
  }

  private read(): SavedCharacters {
    const value = JSON.parse(readFileSync(this.file, 'utf8')) as SavedCharacters;
    if (value.schema !== 1 || !Number.isSafeInteger(value.version) || value.version < 1 ||
        !Number.isInteger(value.nextSerial) || value.nextSerial < 3 || value.nextSerial > 0xffffffff ||
        !Array.isArray(value.entries) || value.entries.length > 1000) throw Error('Invalid character roster');
    const ids = new Set<string>();
    for (const entry of value.entries) {
      if (!entry || !/^00000002[0-9a-f]{8}$/.test(entry.soid) || ids.has(entry.soid) ||
          Number(BigInt(`0x${entry.soid}`) & 0xffffffffn) >= value.nextSerial ||
          (entry.deletedAt !== undefined && !Number.isFinite(Date.parse(entry.deletedAt))) ||
          (entry.customization !== undefined && (!/^(?:[0-9a-f]{2}){3,128}$/.test(entry.customization) ||
            !parseCharacterCustomization(Buffer.from(entry.customization, 'hex')))) ||
          (entry.soid !== legacyKey && (!entry.creation || !/^(?:[0-9a-f]{2}){3,128}$/.test(entry.creation) ||
            !parseCharacterCreation(Buffer.from(entry.creation, 'hex'))))) throw Error('Invalid saved character');
      ids.add(entry.soid);
    }
    if (!ids.has(legacyKey) || value.entries.filter(e => !e.deletedAt).length > 3) throw Error('Invalid character roster capacity');
    return value;
  }

  private commit(next: SavedCharacters): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2) + '\n');
    renameSync(`${this.file}.tmp`, this.file);
    this.saved = next;
  }
}

let store: CharacterStore | undefined;
/** Explicit opt-in for the community runtime. Legacy hosts retain their single
 * character behavior and return typed failure for unsupported creation. */
export function configuredCharacterStore(): CharacterStore | undefined {
  if (process.env.D1A_NATIVE_CHARACTERS !== '1') return undefined;
  if (!store) {
    const equipment = characterSetting('D1A_EQUIPMENT_PROFILE');
    if (!equipment) throw Error('Native characters require a saved launcher profile');
    const environment = Object.fromEntries((['D1A_EQUIPMENT_PROFILE', 'D1A_TALENT_STATE_PATH',
      'D1A_VENDOR_ECONOMY_PROFILE', 'D1A_DIRECTOR_CHARACTER', 'D1A_E3_ABILITY_PRESET', 'D1A_HUNTER_ARC'] as const)
      .map(name => [name, characterSetting(name)]));
    store = new CharacterStore({environment}, dirname(equipment));
  }
  return store;
}
