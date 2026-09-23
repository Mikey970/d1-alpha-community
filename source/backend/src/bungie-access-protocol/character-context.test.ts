import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it, vi} from 'vitest';
import {characterSetting, currentCharacterContext, withCharacter, type CharacterContext} from './character-context';
import {equippedItemSoid, equipInventoryProbe, inventoryWeapons, characterItemDefinitions} from './rsat/mocks/loadout';
import {activateTalentStep, talentValue, TALENT_ITEM_SOID} from './rsat/mocks/hunter-arc-state';
import {vendorEconomy} from './vendor-economy';
import {stubAppearanceEc} from './rsat/mocks/values';
import {awardNexusVictory, strikeRewardOwned, rewardEvents} from './rsat/mocks/strike-rewards';
import {EventEmitter} from 'node:events';
import {BungieAccessProtocolSession} from './session';
import {BapMessageType} from './constants';
import {encodeServerMessage} from '@blamnetwork/rsat';
import {InventoryEquipRequest} from './rsat/schemas/messages';

afterEach(() => vi.unstubAllEnvs());

function profile(root: string, name: string, selection = 'hunter-arc'): CharacterContext {
  const dir = join(root, name);
  mkdirSync(dir, {recursive: true});
  return {environment: {
    D1A_EQUIPMENT_PROFILE: join(dir, 'equipment.json'),
    D1A_TALENT_STATE_PATH: join(dir, 'talent.json'),
    D1A_VENDOR_ECONOMY_PROFILE: join(dir, 'wallet.json'),
    D1A_DIRECTOR_CHARACTER: selection,
    D1A_E3_ABILITY_PRESET: undefined,
    D1A_HUNTER_ARC: selection.startsWith('hunter-') ? '1' : undefined,
  }};
}

it('isolates equipment, subclass selections and paid transactions, including a fresh reload', () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_TALENT_PROBE', '1');
  vi.stubEnv('D1A_VENDOR_ECONOMY', '1');
  vi.stubEnv('D1A_VENDOR_TEST_ALLOWANCE', '0');
  const root = mkdtempSync(join(tmpdir(), 'd1a-characters-'));
  const a = profile(root, 'a'), b = profile(root, 'b');
  const wallet = (balance: number) => JSON.stringify({schema: 1, version: 1, nextSerial: 1, balances: {456: balance}, purchases: []});
  writeFileSync(a.environment.D1A_VENDOR_ECONOMY_PROFILE!, wallet(1000));
  writeFileSync(b.environment.D1A_VENDOR_ECONOMY_PROFILE!, wallet(500));
  const bBefore = readFileSync(b.environment.D1A_VENDOR_ECONOMY_PROFILE!);
  withCharacter(a, () => {
    expect(equipInventoryProbe(0x300000101n)).toBe(true);
    expect(activateTalentStep(TALENT_ITEM_SOID, 25).accepted).toBe(true);
    expect(vendorEconomy().purchase(22, 0, {}).accepted).toBe(true);
    expect(vendorEconomy().inventoryItems().find(i => i.defIndex === 456)?.quantity).toBe(750);
  });
  withCharacter(b, () => {
    expect(equippedItemSoid(7)).toBe(0x300000008n);
    expect(talentValue().unknown4!.unknown0[25]).toBe(0);
    expect(vendorEconomy().inventoryItems().find(i => i.defIndex === 456)?.quantity).toBe(500);
    expect(vendorEconomy().inventoryItems().some(i => i.defIndex === 974)).toBe(false);
  });
  expect(readFileSync(b.environment.D1A_VENDOR_ECONOMY_PROFILE!)).toEqual(bBefore);
  // New context discards all caches, as a backend restart would.
  withCharacter(profile(root, 'a'), () => {
    expect(equippedItemSoid(7)).toBe(0x300000101n);
    expect(talentValue().unknown4!.unknown0[25]).toBe(1);
    expect(vendorEconomy().inventoryItems().find(i => i.defIndex === 456)?.quantity).toBe(750);
    expect(vendorEconomy().inventoryItems().some(i => i.defIndex === 974)).toBe(true);
  });
});

it('keeps delayed activity rewards on their originating save while another character is active', async () => {
  const root = mkdtempSync(join(tmpdir(), 'd1a-character-reward-'));
  const a = profile(root, 'a'), b = profile(root, 'b');
  let finish!: () => void;
  const ready = new Promise<void>(resolve => {finish = resolve;});
  const observed: CharacterContext[] = [];
  const listener = () => observed.push(currentCharacterContext());
  rewardEvents.on('awarded', listener);
  try {
    const pending = withCharacter(a, async () => {
      await ready;
      expect(awardNexusVictory({kind: 'qualifiedRuinsBossKill', actorKey: 'test-boss', packetId: 'a'.repeat(64),
        classHash: 0x04d9ce0e, lastPositiveHealth: 0.1, healthAt: 1, killAt: 2,
        provenance: 'actual_ead_kill_plus_unique_authored_boss_binding', wireVictimSquadIdentifier: null})).toBe(true);
    });
    await withCharacter(b, async () => {
      finish();
      await pending;
      expect(strikeRewardOwned()).toBe(false);
    });
    expect(withCharacter(a, strikeRewardOwned)).toBe(true);
    expect(observed).toEqual([a]);
  } finally { rewardEvents.off('awarded', listener); }
});

it('changes class, armor and inventory with the character and clears inherited E3 overrides', () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  vi.stubEnv('D1A_E3_ABILITY_PRESET', '18');
  const root = mkdtempSync(join(tmpdir(), 'd1a-character-class-'));
  const hunter = profile(root, 'hunter'), titan = profile(root, 'titan', 'titan-arc');
  const e3: CharacterContext = {environment: {...profile(root, 'e3').environment, D1A_E3_ABILITY_PRESET: '18'}};
  withCharacter(hunter, () => {
    expect(stubAppearanceEc().classIndex).toBe(1);
    expect(inventoryWeapons().filter(i => i.slot === 1).map(i => i.defIndex).sort()).toEqual([437,438]);
    expect(characterSetting('D1A_E3_ABILITY_PRESET')).toBeUndefined();
  });
  withCharacter(titan, () => {
    expect(stubAppearanceEc().classIndex).toBe(0);
    expect(inventoryWeapons().filter(i => i.slot === 1).map(i => i.defIndex)).toEqual([434]);
  });
  const baseArmor = withCharacter(hunter, () => characterItemDefinitions().find(i => i.slot === 2));
  withCharacter(e3, () => {
    expect(stubAppearanceEc().classIndex).toBe(2);
    expect(characterItemDefinitions().find(i => i.slot === 2)).not.toEqual(baseArmor);
  });
  expect(withCharacter(hunter, () => characterItemDefinitions().find(i => i.slot === 2))).toEqual(baseArmor);
});

it('restores the caller context after a failed operation', () => {
  const before = currentCharacterContext();
  const other = profile(mkdtempSync(join(tmpdir(), 'd1a-character-error-')), 'other');
  expect(() => withCharacter(other, () => {throw new Error('save failed');})).toThrow('save failed');
  expect(currentCharacterContext()).toBe(before);
});

it('routes native equipment requests and reward pushes only to the owning connection context', () => {
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM', '1');
  const root = mkdtempSync(join(tmpdir(), 'd1a-character-session-'));
  const a = profile(root, 'a'), b = profile(root, 'b');
  const logger = {log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()};
  const sockets = [new EventEmitter(), new EventEmitter()];
  const sessions = [a,b].map((context, i) => {
    const session = new BungieAccessProtocolSession(sockets[i] as any, logger, context) as any;
    session.send = vi.fn();
    return session;
  });
  try {
    // Dispatch while B is the ambient caller: the session must still mutate A.
    withCharacter(b, () => sessions[0].handleMessage({
      msgType: BapMessageType.ClientToWorldServerRequest, sequence: 9,
      body: encodeServerMessage(403, InventoryEquipRequest, {itemSoid: 0x300000101n}),
    }));
    expect(withCharacter(a, () => equippedItemSoid(7))).toBe(0x300000101n);
    expect(withCharacter(b, () => equippedItemSoid(7))).toBe(0x300000008n);
    const pushes = sessions.map(session => vi.spyOn(session, 'publishInventoryEquipment'));
    withCharacter(a, () => rewardEvents.emit('awarded'));
    expect(pushes[0]).toHaveBeenCalledOnce();
    expect(pushes[1]).not.toHaveBeenCalled();
  } finally { sockets.forEach(socket => socket.emit('close')); }
});
