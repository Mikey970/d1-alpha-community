import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { decodeServerMessage } from '@blamnetwork/rsat';
import { BungieAccessProtocolSession } from './session';
import { BapMessageType } from './constants';
import { TalentActivateResponse } from './rsat/schemas/talent-requests';
import { resetTalentStateForTests, talentValue } from './rsat/mocks/talent-state';

afterEach(()=>{vi.unstubAllEnvs();resetTalentStateForTests();});

it('accepts the complete native801 frame, publishes the selected talent, and returns typed success',()=>{
  vi.stubEnv('D1A_TALENT_PROBE','1');
  vi.stubEnv('D1A_INVENTORY_PROBE_ITEM','1');
  vi.stubEnv('D1A_DIRECTOR_CHARACTER','warlock-nova');
  vi.stubEnv('D1A_TALENT_STATE_PATH','');
  vi.stubEnv('D1A_INVENTORY_CAPTURE_PATH','');
  const socket=new EventEmitter();
  const logger={debug:vi.fn(),log:vi.fn(),warn:vi.fn(),error:vi.fn()};
  const session=new BungieAccessProtocolSession(socket as any,logger) as any;
  const sent:any[]=[];
  session.send=(message:any)=>sent.push(message);
  session.inventorySubscriptions.set(4,0x100000001n);
  try {
    // nid801, owned Warlock442 SOID, biased Nova node21, native terminal byte.
    session.handleWorldServerRequest({msgType:BapMessageType.ClientToWorldServerRequest,
      sequence:17,body:Buffer.from('032100000003000002009500','hex')});
    expect(talentValue().unknown4?.unknown0[21]).toBe(1);
    expect(sent.some(m=>m.msgType===BapMessageType.QueuezToClientUpdateNotification)).toBe(true);
    const response=sent.find(m=>m.msgType===BapMessageType.ClientToWorldServerResponse);
    expect(response.sequence).toBe(17);
    expect(decodeServerMessage(response.body,TalentActivateResponse).value.status.unknown0).toBe(0);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('accepted=true changed=true'));
  } finally {socket.emit('close');}
});
