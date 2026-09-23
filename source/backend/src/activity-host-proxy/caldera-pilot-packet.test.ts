import { expect, it } from 'vitest';
import { decodeStrikeSense } from './ruins-sense';

// Independently packed native808006AE/808006A2 with a preceding SquadSense.
// This is a protocol fixture, not a captured runtime success.
const packet = Buffer.from(
  '36c75fb46140574000000000176c75fb461c057e0000000cc180000009090000001100', 'hex');

it('retains pilot script acknowledgement after a coalesced squad receipt', () => {
  expect(decodeStrikeSense(packet)?.rows).toMatchObject([
    {bundle:0xb63afda3,type:1,index:174,sequence:5},
    {bundle:0xb63afda3,type:2,index:175,generation:3,bound:true,terminal:false,sequence:17,
      script:{pc:1,cookie:9,paused:false}},
  ]);
  expect(decodeStrikeSense(packet.subarray(0,packet.length-2))).toBeUndefined();
});
