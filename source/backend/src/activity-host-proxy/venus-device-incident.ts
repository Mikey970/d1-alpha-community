import { BitReader } from '@blamnetwork/rsat';

/** Native r399 controller capture; the source is Encounter77, ch2m3_interactable. */
export function isVenusDeviceInteractionIncident(payload: Buffer): boolean {
  if (payload.length !== 44) return false;
  try {
    const reader = new BitReader(payload);
    if (reader.readNumber(4) !== 1 ||
        (reader.readNumber(32) >>> 0) !== 0xe882d22f) return false;
    // Opaque native player context; do not bind this to one run's timestamp.
    while (reader.bitPos < 310) reader.readBit();
    return (reader.readNumber(32) >>> 0) === 0x4d675047 && reader.readNumber(10) === 0;
  } catch { return false; }
}
