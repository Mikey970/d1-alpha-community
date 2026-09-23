import { BitReader } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';

/**
 * Narrow decoder for the single PlayerTrigger incident captured in r373.
 * Native835B85B0 emits DD6D986F (initialized at83922160), not ScriptEvent39.
 * This observed 400-bit form contains one event, opaque context, a native
 * SensorClientRef at bit310, fallback name hash and four zero padding bits.
 * Other incident layouts are deliberately left to their existing handler.
 */
export function isVenusHeadlandsEntryIncident(payload: Buffer): boolean {
  return isVenusEntryIncident(payload, 137);
}

/** r394 actual native Location329 arrival; never accepts Headlands137. */
export function isVenusSouthernEntryIncident(payload: Buffer): boolean {
  return isVenusEntryIncident(payload, 147);
}

function isVenusEntryIncident(payload: Buffer, index: number, bundle = 0x517641f1): boolean {
  if (payload.length !== 50) return false;
  try {
    const reader = new BitReader(payload);
    if (reader.readNumber(4) !== 1 ||
        (reader.readNumber(32) >>> 0) !== 0xdd6d986f) return false;
    while (reader.bitPos < 310) reader.readBit();
    const ref = SensorClientRef.decode(reader);
    return (ref.bundle >>> 0) === bundle && ref.typeId === 29 &&
      ref.typeIndex === index && (reader.readNumber(32) >>> 0) === 0x811c9dc5 &&
      reader.readNumber(4) === 0;
  } catch { return false; }
}

/** Packaged entrance pt_reinf, same native PlayerTrigger class/emitter as137. */
export function isVenusOpeningReinforcementIncident(payload: Buffer): boolean {
  return isVenusEntryIncident(payload, 35, 0x44fb7aa2);
}

/** Same native835B85B0 emitter; identity is packaged Northern spawn-boss trigger153. */
export function isVenusGatekeeperEntryIncident(payload: Buffer): boolean {
  return isVenusEntryIncident(payload, 153);
}
