import { BitReader } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';

/** Read the complete Captain record, including packets prefixed by authored
 * minion squad records. Trailing records cannot invalidate an already complete
 * record; never search raw bits for a reference inside an unknown body. */
export function readCaptainSquad(payload: Buffer) {
  if (payload.length < 12 || payload.length > 2048) return undefined;
  try {
    const br = new BitReader(payload);
    const read = (width: number) => {
      if (br.bitPos + width > br.bitLength) throw new Error('Truncated squad sense');
      return br.readNumber(width);
    };
    if (read(2) !== 0) return undefined;
    for (let entries=0;entries<32 && read(1)===1;entries++) {
    const ref = SensorClientRef.decode(br);
    if (ref.bundle !== 0x44fb7aa2 || ref.typeId !== 1 ||
        ![1,3,4,5,6,7,8].includes(ref.typeIndex) || read(1) !== 1) return undefined;
    const optional = (width: number) => read(1) ? read(width) : undefined;
    optional(31); optional(31); optional(31);
    const memberCount = optional(6);
    optional(6);
    const flags = [read(1), read(1), read(1)];
    const valid = read(1) === 1;
    // Native descriptor 8242F340: kind11, range 0..2040, SEVEN wire bits.
    // The generic legacy SquadSense f32 decoder consumes 25 extra bits here.
    optional(7);
    let roster: number[] | undefined;
    if (read(1)) {
      const count = read(4);
      roster = Array.from({ length: count }, () => (read(32) - 0x80000000) | 0);
    }
    if (read(1)) return undefined; // Unrecovered optional extras: fail closed.
    const sequence = read(32);
    if(ref.typeIndex===1) {
      const remaining = br.bitLength - br.bitPos;
      const singleEntry = entries===0 && remaining <= 7 && (remaining === 0 || read(remaining) === 0);
      return { memberCount, roster, sequence, valid, flags, singleEntry };
    }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Evidence gate for the single authored Captain; never advance on readiness or time. */
export class VenusCaptainProgress {
  private sequence = -1;
  private observedMember = false;
  private completed = false;
  get complete() { return this.completed; }

  resetEncounter() {
    this.sequence = -1;
    this.observedMember = false;
  }

  observe(payload: Buffer): boolean {
    const sense = readCaptainSquad(payload);
    if (!sense || !sense.valid || sense.sequence <= this.sequence || this.completed) return false;
    this.sequence = sense.sequence;
    if (sense.memberCount === 1) this.observedMember = true;
    // r367: seq5 memberCount1; user killed yellow-bar Captain; seq13 count0,
    // roster[1]. Native 835ACB2C..74 counts unavailable actor handles per slot.
    // Require the complete terminal entry and prior live encounter observation.
    if (!this.observedMember || sense.memberCount !== 0 ||
        sense.roster?.length !== 1 || sense.roster[0] !== 1) return false;
    this.completed = true;
    return true;
  }
}
