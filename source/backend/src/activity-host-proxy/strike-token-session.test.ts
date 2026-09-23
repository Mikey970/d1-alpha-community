import {expect,it,vi} from 'vitest';
import {ActivityHostProxySession} from './session';
import {StrikeEngineeringCheckpoint} from './strike-engineering-checkpoint';
import {StrikeDigSiteCheckpoint} from './strike-dig-site-checkpoint';
import captures from './strike-fixtures/r418-engineering-requests.json';
import {parseClientAuth} from './client-auth';

it('retains a validated destination across the actual Engineering token-only delta',()=>{
  const s:any=Object.create(ActivityHostProxySession.prototype);
  s.logger={log:vi.fn(),warn:vi.fn(),error:vi.fn()};s.kind='FAH';s.currentSlice=16;
  s.strikeRegionTokens={};s.strikeCheckpoint=new StrikeEngineeringCheckpoint(false);
  s.strikeResume=new StrikeDigSiteCheckpoint('');
  s.raidPreview={enabled:false,requestedBubble:()=>undefined,observeTeleport:()=>false};
  s.calderaInsertion={enabled:false,requestedBubble:()=>undefined,observeTeleport:()=>false};
  s.towerAuthOpts=()=>({scenario:{activityName:'venus_portal_1'}});
  s.pushMembership=vi.fn();
  s.handleClientAuth(1n,Buffer.from(captures[0].payload,'hex'));
  expect(s.strikeRequestedSlice).toBe(7);
  const delta=Buffer.from('b7fffffff7fffffff400010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000207010','hex');
  expect(parseClientAuth(delta)?.transition).toMatchObject({kind:3,cookie:1});
  s.strikeRegionTokens[7]=2;s.pushMembership.mockClear();
  s.handleClientAuth(1n,delta);
  expect(s.strikeRegionTokens[7]).toBe(3);expect(s.strikeRequestedSlice).toBe(7);
  expect(s.pushMembership).toHaveBeenCalledTimes(1);
  s.handleClientAuth(1n,delta);expect(s.pushMembership).toHaveBeenCalledTimes(1);
  s.strikeRequestedSlice=undefined;s.strikeRegionTokens[7]=2;
  s.handleClientAuth(1n,delta);expect(s.strikeRegionTokens[7]).toBe(2);
  expect(s.logger.warn).not.toHaveBeenCalled();expect(s.logger.error).not.toHaveBeenCalled();
});
