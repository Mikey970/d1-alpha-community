import { BitReader } from '@blamnetwork/rsat';

// Host78, identifier definition8080128D at3304: identifier3318, count331C.
export const VENUS_FLUID_REQUIREMENT = 10;
export const VENUS_FLUID_IDENTIFIER = 0x8c52c41d;

/** Only the single-event form actually captured during r386 pickups.
 * Native83850920 dispatches schema80804A00 under event7A0FD954.
 * A kill, visible drop, unrelated pickup or retransmission grants no credit.
 */
export function decodeVenusFluidPickup(payload: Buffer): string | undefined {
  if (payload.length !== 73) return;
  const reader = new BitReader(payload);
  if (reader.readNumber(4) !== 1 ||
      (reader.readNumber(32) >>> 0) !== 0x7a0fd954) return;
  while (reader.bitPos < 434) reader.readBit();
  if ((reader.readNumber(32) >>> 0) !== VENUS_FLUID_IDENTIFIER) return;
  // Native pickup position: reject malformed non-finite vectors.
  const word = Buffer.alloc(4);
  for (let i = 0; i < 3; i++) {
    word.writeUInt32BE(reader.readNumber(32) >>> 0);
    if (!Number.isFinite(word.readFloatBE())) return;
  }
  reader.readNumber(16); // Native trailing scalar; semantics not yet established.
  if (reader.readNumber(6) !== 0) return;
  return payload.toString('hex');
}

export class VenusFluidProgress {
  private readonly credited = new Set<string>();
  get count(): number { return this.credited.size; }
  get complete(): boolean { return this.count === VENUS_FLUID_REQUIREMENT; }

  accept(payload: Buffer): boolean {
    const key = decodeVenusFluidPickup(payload);
    if (!key || this.complete || this.credited.has(key)) return false;
    this.credited.add(key);
    return true;
  }
}
