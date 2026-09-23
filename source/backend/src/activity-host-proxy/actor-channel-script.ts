import { BitWriter } from '@blamnetwork/rsat';
import type { FinishedBits } from './rsat/mocks/sensor-auth';

/** ActorAuth command script, native decoder836A8C30 / executor837679B0.
 * Type7 uses schema8080068F (channel hash + four raw float lanes).
 * Mode0 uses the empty schema80800686. Both discriminants have bias1.
 * Preserve actor generation and other channels; do not claim completion here.
 */
export function encodeActorChannelScript(
  cookie: number,
  channel: number,
  lanes: readonly [number, number, number, number],
): FinishedBits {
  if (!Number.isInteger(cookie) || cookie < 1 || cookie > 0x7fffffff ||
      !Number.isInteger(channel) || channel < 0 || channel > 0xffffffff ||
      lanes.length !== 4 || lanes.some(value => !Number.isFinite(Math.fround(value)))) {
    throw new Error('Invalid actor channel command');
  }
  const bw = new BitWriter(32);
  bw.writeBit(0); // preserve generation
  bw.write(1, 2); bw.write(1, 3); bw.writeBit(1); // mode0, policy0, enabled
  bw.writeBit(0); bw.writeBit(0); // channels and other bindings unchanged
  bw.writeBit(1); // script808006A1 present
  bw.write(cookie, 31);
  bw.write(0, 6); // initial program counter
  bw.write(1, 6); // one atom in count-governed80800E51
  bw.writeBit(1); // atom present
  bw.write(8, 4); // type7 + bias1
  bw.write(1, 2); // mode0 + bias1
  bw.write(channel, 32);
  const raw = Buffer.alloc(4);
  for (const value of lanes) {
    raw.writeFloatBE(value);
    bw.write(raw.readUInt32BE(), 32);
  }
  // No mode0 payload; preserve drop list and its sequence.
  bw.writeBit(0);
  return { bitCount: bw.bitCount, bytes: bw.finish() };
}
