import {decode, rsat} from '@blamnetwork/rsat';

/** Native 808044F2 at 8243D8B4: u32 + u32 + 80800E37 (six u8).
 * Sender 8360CE98 passes a 16-byte padded host structure to the serializer;
 * the descriptor encodes 14 bytes. Field meanings and receiver actions remain
 * unresolved. This decoder is diagnostic only; it sends no guessed reply. */
export const PeerLeaveRequest = rsat.schema(0x808044f2, {
  unknown0: rsat.u32(), unknown1: rsat.u32(), peer: rsat.bytes(6),
});

export function parsePeerLeaveRequest(payload: Buffer) {
  if (payload.length !== 14) return undefined;
  try { return decode(PeerLeaveRequest, payload); } catch { return undefined; }
}
