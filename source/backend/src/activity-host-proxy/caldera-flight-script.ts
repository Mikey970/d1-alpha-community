import { BitWriter } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';
import type { FinishedBits } from './rsat/mocks/sensor-auth';
import authored from './caldera-flight-commands.json';

/** Original host179 ControlPoint command vectors, extracted by
 * extract-caldera-flight-commands.py. Encode their native schema fields,
 * never send packed host bytes as network data. Supports the twelve
 * authored point-specific paths; unrelated command types fail closed.
 */
export function encodeCalderaFlightScript(path: number, cookie: number): FinishedBits {
  const entry = authored.paths.find(p => p.reference.index === path);
  if (!entry || !Number.isInteger(cookie) || cookie < 1 || cookie > 0x7fffffff ||
      entry.commands.length < 1 || entry.commands.length > 32) {
    throw new Error('Invalid Caldera flight script');
  }
  const bw = new BitWriter(1024);
  bw.writeBit(0); // preserve pilot generation
  bw.write(1, 2); bw.write(1, 3); bw.writeBit(1);
  bw.writeBit(0); bw.writeBit(0); bw.writeBit(1);
  bw.write(cookie, 31); bw.write(0, 6); bw.write(entry.commands.length, 6);
  const reference = (raw: Buffer, offset: number) => {
    SensorClientRef.encode(bw, {
      bundle: raw.readUInt32BE(offset),
      typeId: raw.readInt8(offset + 4),
      typeIndex: raw.readInt16BE(offset + 6),
    });
  };
  for (const command of entry.commands) {
    if (command.mode !== 0 || command.modeSchema !== '80800686') {
      throw new Error('Unsupported Caldera command mode');
    }
    const raw = Buffer.from(command.payloadHex, 'hex');
    bw.writeBit(1);
    bw.write(command.type + 1, 4); bw.write(1, 2);
    if ((command.type === 0 && command.schema === '80800692' && raw.length === 12) ||
        (command.type === 3 && command.schema === '80800697' && raw.length === 16)) {
      reference(raw, 0);
      const point = raw.readUInt32BE(8);
      if (point > 255) throw new Error('Invalid native path point');
      bw.write(point, 8);
      if (command.type === 3) {
        if (raw[12] > 1) throw new Error('Invalid native path flag');
        bw.write(raw[12], 1);
      }
    } else if (command.type === 9 && command.schema === '8080069B' && raw.length === 20) {
      bw.write(raw.readUInt32BE(0), 32);
      bw.write(raw.readUInt32BE(4), 32);
      reference(raw, 8);
      const slot = raw.readInt8(16);
      if (slot < -1 || slot > 6) throw new Error('Invalid native ability slot');
      bw.write(slot + 1, 3);
      bw.write(raw.readInt8(17) + 128, 8);
    } else {
      throw new Error('Unsupported Caldera flight atom');
    }
  }
  bw.writeBit(0); // retain drop list
  return { bitCount: bw.bitCount, bytes: bw.finish() };
}
