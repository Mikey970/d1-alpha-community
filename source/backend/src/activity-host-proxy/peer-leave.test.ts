import {BitWriter} from '@blamnetwork/rsat';
import {expect,it} from 'vitest';
import {parsePeerLeaveRequest} from './peer-leave';

it('decodes the descriptor widths without interpreting them as a leave acknowledgement',()=>{
  // Synthetic descriptor vector, not represented as a captured native request.
  const writer=new BitWriter(112);
  writer.write(0x12345678,32);writer.write(0xfedcba98,32);
  for(const byte of [1,2,3,4,5,6])writer.write(byte,8);
  const parsed=parsePeerLeaveRequest(writer.finish())!;
  expect(parsed.unknown0).toBe(0x12345678);
  expect(parsed.unknown1>>>0).toBe(0xfedcba98);
  expect([...parsed.peer]).toEqual([1,2,3,4,5,6]);
});
it('rejects truncation and padded in-memory structures instead of accepting a different wire form',()=>{
  for(const size of [0,13,15,16])expect(parsePeerLeaveRequest(Buffer.alloc(size))).toBeUndefined();
});
