import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {afterEach, expect, it, vi} from 'vitest';
import {decodeServerMessage, encodeServerMessage} from '@blamnetwork/rsat';
import {CharacterStore, configuredCharacterStore} from './character-store';
import {parseCharacterCreation, parseCharacterCustomization, CreateCharacterResponse, CustomizeCharacterRequest, CustomizeCharacterResponse} from './rsat/schemas/character-session';
import {withCharacter} from './character-context';
import {equippedItemSoid, ownedInventoryItem} from './rsat/mocks/loadout';
import {WARLOCK_STARTER_ARMOR} from './rsat/mocks/warlock-starter-armor';
import {stubAppearanceEc, stubAppearanceF0} from './rsat/mocks/values';
import {BungieAccessProtocolSession} from './session';
import {BapMessageType} from './constants';

// Native Titan Done, captured 2026-09-22, not a synthesized success packet.
const create = Buffer.from('01f5c06030102d90101010853085f07a5086b0865084dec32de86c038c0003fffbfffbfffbfffbfffbfffbfffbfff81d14000400040004000400040000', 'hex');
// Native male Exo Warlock Done from the same day's visible creator check.
const createWarlock = Buffer.from('01f5c16030502bb010101080b081707a50823081d0805ec32de86c038c0003fffbfffbfffbfffbfffbfffbfffbfff81d14000400040004000400040000', 'hex');
afterEach(() => vi.unstubAllEnvs());

it('validates the complete native creation frame before allocating a character', () => {
  const value = parseCharacterCreation(create)!;
  expect(value.identity).toEqual({race: 0, gender: 0, classIndex: 0});
  expect(value.appearance).toMatchObject({faceIndex: 364, skinColor: 1065, hairColor: 1077});
  for (const bad of [create.subarray(0, 60), Buffer.concat([create, Buffer.from([0])]), Buffer.from('01f5', 'hex')]) {
    expect(parseCharacterCreation(bad)).toBeNull();
  }
});

it('commits independent native cards, preserves the original save and refuses a fourth card', () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  const root = mkdtempSync(join(tmpdir(), 'd1a-native-roster-'));
  const legacyFile = join(root, 'equipment.json');
  const legacyBytes = '{"schema":2,"version":9,"slots":{"7":"0000000300000101"}}\n';
  writeFileSync(legacyFile, legacyBytes);
  const legacy = {environment: {D1A_EQUIPMENT_PROFILE: legacyFile, D1A_DIRECTOR_CHARACTER: 'hunter-arc'}};
  const store = new CharacterStore(legacy, root);
  expect(store.selectedSoid).toBe(0n);
  const id = store.create(create)!;
  expect(id).toBe(0x200000003n);
  withCharacter(store.context(id), () => {
    expect(stubAppearanceEc()).toEqual({race: 0, gender: 0, classIndex: 0});
    expect(stubAppearanceF0()).toEqual(parseCharacterCreation(create)!.appearance);
    expect(equippedItemSoid(1)).toBe(0x300000203n);
    expect(equippedItemSoid(2)).toBe(0x300000420n);
  });
  expect(readFileSync(legacyFile, 'utf8')).toBe(legacyBytes);
  const reloaded = new CharacterStore(legacy, root);
  expect(reloaded.ids()).toEqual([0x200000002n, id]);
  expect(reloaded.creation(id)).toEqual(parseCharacterCreation(create));
  expect(reloaded.create(createWarlock)).toBe(0x200000004n);
  withCharacter(reloaded.context(0x200000004n), () => {
    expect(stubAppearanceEc()).toEqual({race: 2, gender: 0, classIndex: 2});
    expect(stubAppearanceF0().faceIndex).toBe(349);
    expect(equippedItemSoid(1)).toBe(0x300000200n);
    for (const item of WARLOCK_STARTER_ARMOR) {
      expect(equippedItemSoid(item.slot)).toBe(item.soid);
      expect(ownedInventoryItem(item.soid)).toMatchObject({defIndex:item.defIndex, artArrangement:item.artArrangement});
    }
  });
  const before = readFileSync(store.file);
  expect(reloaded.create(create)).toBeNull();
  expect(readFileSync(store.file)).toEqual(before);
  expect(readFileSync(legacyFile, 'utf8')).toBe(legacyBytes);
});

it('does not publish a character when the roster commit fails or reuse its orphaned save', () => {
  const root = mkdtempSync(join(tmpdir(), 'd1a-native-failure-'));
  const store = new CharacterStore({environment: {}}, root);
  mkdirSync(`${store.file}.tmp`);
  expect(() => store.create(create)).toThrow();
  expect(store.ids()).toEqual([0x200000002n]);
  // The failed allocation is retained; another attempt must allocate elsewhere.
  expect(() => store.create(create)).toThrow();
  expect(readFileSync(join(root, 'characters/0000000200000003/equipment.json'))).toEqual(
    readFileSync(join(root, 'characters/0000000200000004/equipment.json')));
});

it('persists customization only for the selected character, preserving identity, saves and cached contexts', () => {
  const root = mkdtempSync(join(tmpdir(), 'd1a-appearance-'));
  const legacyFile = join(root, 'equipment.json');
  writeFileSync(legacyFile, '{"schema":2,"version":7,"slots":{}}\n');
  const legacy = {environment: {D1A_EQUIPMENT_PROFILE: legacyFile, D1A_DIRECTOR_CHARACTER: 'hunter-arc'}};
  const store = new CharacterStore(legacy, root), id = store.create(create)!;
  const context = store.context(id), prior = parseCharacterCreation(create)!;
  const appearance = {...prior.appearance, helmetPreference: 1};
  const body = encodeServerMessage(506, CustomizeCharacterRequest, {appearance});
  const equipment = join(root, 'characters', id.toString(16).padStart(16,'0'), 'equipment.json');
  const bytes = readFileSync(equipment), original = readFileSync(legacyFile);
  expect(store.customize(id, body)).toBe(false); // Signed out.
  expect(parseCharacterCustomization(Buffer.concat([body, Buffer.from([0])]))).toBeNull();
  store.select(id);
  expect(store.customize(0x200000002n, body)).toBe(false);
  expect(store.customize(id, body)).toBe(true);
  expect(store.context(id)).toBe(context);
  withCharacter(context, () => {
    expect(stubAppearanceF0()).toEqual(appearance);
    expect(stubAppearanceEc()).toEqual(prior.identity);
  });
  const version = store.version;
  expect(store.customize(id, body)).toBe(true);
  expect(store.version).toBe(version); // Exact duplicate is a no-op.
  const reloaded = new CharacterStore(legacy, root);
  withCharacter(reloaded.context(id), () => expect(stubAppearanceF0()).toEqual(appearance));
  expect(reloaded.creation(id)).toEqual(prior);
  expect(readFileSync(equipment)).toEqual(bytes);
  expect(readFileSync(legacyFile)).toEqual(original);
  // A failed durable write must not change live appearance or roster version.
  mkdirSync(`${store.file}.tmp`);
  const changed = encodeServerMessage(506, CustomizeCharacterRequest, {appearance: {...appearance, helmetPreference: 0}});
  expect(() => store.customize(id, changed)).toThrow();
  expect(store.version).toBe(version);
  withCharacter(context, () => expect(stubAppearanceF0()).toEqual(appearance));
});

it('synchronizes native creation across BAP channels and acknowledges a duplicate without creating again', () => {
  const root = mkdtempSync(join(tmpdir(), 'd1a-native-channels-'));
  vi.stubEnv('D1A_NATIVE_CHARACTERS', '1');
  vi.stubEnv('D1A_EQUIPMENT_PROFILE', join(root, 'equipment.json'));
  const store = configuredCharacterStore()!;
  const sockets = [new EventEmitter(), new EventEmitter()];
  const sent: any[][] = [[], []];
  const sessions = sockets.map((socket, i) => {
    const session = new BungieAccessProtocolSession(socket as any, {log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()}) as any;
    session.send = (message: any) => sent[i].push(message);
    return session;
  });
  const request = (sequence: number, body: Buffer) => sessions[0].handleMessage({sequence, body, msgType: BapMessageType.ClientToWorldServerRequest});
  try {
    request(1, Buffer.from('01f900', 'hex'));
    expect(sessions[1].selectedCharacterSoid).toBe(0n);
    request(2, create);
    const reply = sent[0].at(-1).body;
    const result = decodeServerMessage(reply, CreateCharacterResponse).value;
    expect(result.status.unknown0).toBe(0);
    expect(result.characterSoid).toBe(0x200000003n);
    expect(sessions[1].selectedCharacterSoid).toBe(result.characterSoid);
    expect(sessions[0].characterContext).toBe(sessions[1].characterContext);
    request(2, create);
    expect(sent[0].at(-1).body).toEqual(reply);
    expect(store.ids()).toHaveLength(2);
    const appearance = {...parseCharacterCreation(create)!.appearance, helmetPreference: 1};
    const customization = encodeServerMessage(506, CustomizeCharacterRequest, {appearance});
    const revisions = sessions.map(s => s.characterRevision);
    request(10, customization);
    expect(decodeServerMessage(sent[0].at(-1).body, CustomizeCharacterResponse).value.status.unknown0).toBe(0);
    sessions.forEach((s, i) => expect(s.characterRevision).toBe(revisions[i] + 1));
    request(3, Buffer.from('01f900', 'hex'));
    request(4, Buffer.from('01f8000000020000000200', 'hex'));
    expect(sessions[1].selectedCharacterSoid).toBe(0x200000002n);
    expect(sessions[1].characterContext).toBe(store.context(0x200000002n));
    const legacyAppearance = withCharacter(store.context(0x200000002n), stubAppearanceF0);
    const saved = readFileSync(store.file);
    request(10, customization); // A replay after switching cannot customize the new selection.
    expect(readFileSync(store.file)).toEqual(saved);
    withCharacter(store.context(0x200000002n), () => expect(stubAppearanceF0()).toEqual(legacyAppearance));
  } finally { sockets.forEach(socket => socket.emit('close')); }
  expect(store.listenerCount('appearanceChanged')).toBe(0);
});
