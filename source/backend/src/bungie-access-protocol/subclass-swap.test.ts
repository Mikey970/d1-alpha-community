import {EventEmitter} from 'node:events';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it, vi} from 'vitest';

const dirs: string[] = [];
const sockets: EventEmitter[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.emit('close');
  vi.unstubAllEnvs(); vi.resetModules();
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

async function setup(balance = 1000, character = 'warlock-nova') {
  const dir = mkdtempSync(join(tmpdir(), 'd1a-warlock-swap-')); dirs.push(dir);
  const wallet = join(dir, 'equipment.json.vendor.json'), talent = join(dir, 'talent.json');
  writeFileSync(wallet, JSON.stringify({schema:1, version:1, nextSerial:1, balances:{456:balance}, purchases:[]}));
  for (const [name, value] of Object.entries({D1A_DIRECTOR_CHARACTER:character,
    D1A_INVENTORY_PROBE_ITEM:'1', D1A_TALENT_PROBE:'1', D1A_VENDOR_ECONOMY:'1',
    D1A_VENDOR_TEST_ALLOWANCE:'0', D1A_EQUIPMENT_PROFILE:join(dir, 'equipment.json'),
    D1A_TALENT_STATE_PATH:talent, D1A_VENDOR_ECONOMY_PROFILE:wallet})) vi.stubEnv(name, value);
  vi.resetModules();
  const {BungieAccessProtocolSession} = await import('./session');
  const {BapMessageType} = await import('./constants');
  const {encodeServerMessage, decodeServerMessage, decode} = await import('@blamnetwork/rsat');
  const {SelfInventory} = await import('./queuez');
  const schemas = await import('./rsat/schemas/talent-requests');
  const nova = await import('./rsat/mocks/talent-state');
  const radiance = await import('./rsat/mocks/radiance-state');
  const {vendorEconomy} = await import('./vendor-economy');
  const socket = new EventEmitter(); sockets.push(socket);
  const session: any = new BungieAccessProtocolSession(socket as any, {log:vi.fn(), debug:vi.fn(), warn:vi.fn(), error:vi.fn()});
  const sent: any[] = []; session.send = (message: any) => sent.push(message);
  session.inventorySubscriptions.set(4, 0x100000001n);
  const request = (id: number, itemSoid: bigint, nodeIndex: number) => {
    sent.length = 0;
    session.handleWorldServerRequest({msgType:BapMessageType.ClientToWorldServerRequest, sequence:9,
      body:encodeServerMessage(id, id === 801 ? schemas.TalentActivateRequest : schemas.TalentSwapRequest, {itemSoid, nodeIndex})});
    const reply = sent.find(message => message.msgType === BapMessageType.ClientToWorldServerResponse);
    return decodeServerMessage(reply.body, id === 801 ? schemas.TalentActivateResponse : schemas.TalentSwapResponse).value.status.unknown0;
  };
  const publishedBag = () => {
    const body = sent.find(message => message.msgType === BapMessageType.QueuezToClientUpdateNotification).body as Buffer;
    let cursor = 25;
    for (let i = 0; i < body.readUInt32BE(21); i++) {
      const length = body.readUInt32BE(cursor + 12);
      if (body.readBigUInt64BE(cursor + 4) === 0x200000002n) {
        return decode(SelfInventory, body.subarray(cursor + 16, cursor + 16 + length)).unknown0.unknown3.unknown1.unknown0;
      }
      cursor += 16 + length;
    }
    throw Error('No published character inventory');
  };
  return {wallet, talent, nova, radiance, vendorEconomy, request, sent, publishedBag, BapMessageType};
}

it('swaps owned Nova and Radiance alternatives, charges once and restores both selections after restart', async () => {
  const s = await setup();
  expect(s.request(801, s.nova.TALENT_ITEM_SOID, 1)).toBe(0);
  expect(s.publishedBag()[0]).toMatchObject({defIndex:456, unknown2:1000});
  expect(s.request(801, s.radiance.TALENT_ITEM_SOID, 0)).toBe(0);
  const legacy = [readFileSync(s.talent, 'utf8'), readFileSync(`${s.talent}.radiance.json`, 'utf8')];
  expect(s.request(802, s.nova.TALENT_ITEM_SOID, 16)).toBe(0);
  expect(s.publishedBag()[0]).toMatchObject({defIndex:456, unknown2:900});
  expect(s.sent.some(m => m.msgType === s.BapMessageType.QueuezToClientUpdateNotification)).toBe(true);
  expect(s.nova.talentAbilityRecords()[0].unknown0).toBe(26);
  expect(s.nova.talentValue().unknown4!.unknown0[1]).toBe(0);
  const committed = readFileSync(s.wallet, 'utf8');
  expect(s.request(802, s.nova.TALENT_ITEM_SOID, 16)).toBe(0);
  expect(readFileSync(s.wallet, 'utf8')).toBe(committed);
  expect(s.request(802, s.radiance.TALENT_ITEM_SOID, 18)).toBe(0);
  // A later first purchase must extend the authoritative selection rather
  // than write a legacy file which would be shadowed after reload.
  expect(s.request(801, s.nova.TALENT_ITEM_SOID, 21)).toBe(0);
  const saved = JSON.parse(readFileSync(s.wallet, 'utf8'));
  expect(saved.balances['456']).toBe(800);
  expect(saved.talentSelections['300000200'].purchased).toEqual([16,21]);
  expect(saved.talentSelections['300000201'].purchased).toEqual([18]);
  expect(readFileSync(s.talent, 'utf8')).toBe(legacy[0]);
  expect(readFileSync(`${s.talent}.radiance.json`, 'utf8')).toBe(legacy[1]);
  vi.resetModules();
  const nova = await import('./rsat/mocks/talent-state'), radiance = await import('./rsat/mocks/radiance-state');
  expect(nova.talentAbilityRecords().map(row => row.unknown0)).toEqual([26,12,22,-1,20]);
  expect(radiance.talentValue().unknown5!.unknown0[3].unknown0).toBe(18);
});

it('rejects insufficient currency and failed durable commits without changing wallet or talents', async () => {
  const s = await setup(99);
  expect(s.request(801, s.nova.TALENT_ITEM_SOID, 1)).toBe(0);
  const wallet = readFileSync(s.wallet, 'utf8'), talent = readFileSync(s.talent, 'utf8');
  const before = s.nova.talentValue();
  expect(s.request(802, s.nova.TALENT_ITEM_SOID, 16)).toBe(-1);
  expect(s.nova.talentValue()).toEqual(before);
  expect(readFileSync(s.wallet, 'utf8')).toBe(wallet);
  expect(readFileSync(s.talent, 'utf8')).toBe(talent);
  const funded = await setup();
  expect(funded.request(801, funded.nova.TALENT_ITEM_SOID, 1)).toBe(0);
  const state = funded.nova.talentValue(), money = readFileSync(funded.wallet, 'utf8');
  mkdirSync(`${funded.wallet}.tmp`);
  expect(funded.request(802, funded.nova.TALENT_ITEM_SOID, 16)).toBe(-1);
  expect(funded.nova.talentValue()).toEqual(state);
  expect(readFileSync(funded.wallet, 'utf8')).toBe(money);
  expect(funded.vendorEconomy().inventoryItems().find(item => item.defIndex === 456)?.quantity).toBe(1000);
});

it('rejects a known subclass identity absent from the selected character inventory', async () => {
  const s = await setup(1000, 'hunter-arc');
  expect(s.request(801, s.nova.TALENT_ITEM_SOID, 1)).toBe(-1);
  expect(s.nova.talentValue().unknown4!.unknown0[1]).toBe(0);
  expect(() => readFileSync(s.talent)).toThrow();
});

it('requires an active alternative and does not turn swap into a free first purchase', async () => {
  const s = await setup();
  const before = readFileSync(s.wallet, 'utf8');
  for (const node of [0,21,49]) expect(s.request(802, s.nova.TALENT_ITEM_SOID, node)).toBe(-1);
  expect(readFileSync(s.wallet, 'utf8')).toBe(before);
});

it.each(['hunter-arc','hunter-ghost','titan-arc'])('charges and persists the same authored swap for %s', async character => {
  const s = await setup(100, character);
  const module = character === 'hunter-arc' ? await import('./rsat/mocks/hunter-arc-state') :
    character === 'hunter-ghost' ? await import('./rsat/mocks/hunter-ghost-state') : await import('./rsat/mocks/titan-arc-state');
  expect(s.request(801, module.TALENT_ITEM_SOID, 0)).toBe(0);
  expect(s.request(802, module.TALENT_ITEM_SOID, 18)).toBe(0);
  expect(s.publishedBag()[0]).toMatchObject({defIndex:-1, unknown2:0});
  expect(module.talentValue().unknown4!.unknown0[0]).toBe(0);
  expect(module.talentValue().unknown4!.unknown0[18]).toBe(1);
  expect(JSON.parse(readFileSync(s.wallet, 'utf8')).balances['456']).toBe(0);
  expect(s.request(802, module.TALENT_ITEM_SOID, 19)).toBe(-1);
  expect(module.talentValue().unknown4!.unknown0[18]).toBe(1);
});
