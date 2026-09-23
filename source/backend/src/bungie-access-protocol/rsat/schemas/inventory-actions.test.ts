import {it,expect} from 'vitest';
import {decodeServerMessage,encodeServerMessage} from '@blamnetwork/rsat';
import {InventoryActionRequest,InventoryActionResponse,InventoryDestroyResponse,unsupportedInventoryActionResponse} from './inventory-actions';

it('encodes the native402 81-bit request payload, matching observed13-byte message',()=>{
  const value={action:{flag:false,itemSoid:0x30000040an,actionIndex:7}};
  const wire=encodeServerMessage(402,InventoryActionRequest,value);
  expect(wire.length).toBe(13);
  expect(decodeServerMessage(wire,InventoryActionRequest).value).toEqual(value);
});
it.each([401,402] as const)('returns decodable native status for unsupported operation %i instead of emptybody',id=>{
  const wire=unsupportedInventoryActionResponse(id);
  expect(wire.length).toBe(7);
  expect(wire.readUInt16BE(0)).toBe(id);
  const decoded=decodeServerMessage(wire,id===402?InventoryActionResponse:InventoryDestroyResponse);
  expect(decoded.value.status).toEqual({unknown0:-1,unknown1:0});
});
