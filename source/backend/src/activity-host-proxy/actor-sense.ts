import { BitReader } from '@blamnetwork/rsat';

export interface ActorScriptSense {
  pc?: number;
  cookie?: number;
  revision?: number;
  paused: boolean;
}

/** Native808006AE followed by its independent outer sensor sequence.
 * Optional fields are deltas: absence must not overwrite retained state.
 * The scalar field remains unsupported, as in the captured Northern decoder.
 */
export function readActorSense(br: BitReader) {
  const read = (width: number) => {
    if (br.bitPos + width > br.bitLength) throw new Error('Truncated actor sense');
    return br.readNumber(width);
  };
  const optional = (width: number) => read(1) ? read(width) : undefined;
  const generation = optional(31);
  if (read(1)) throw new Error('Unsupported actor scalar sense');
  const revision = optional(31);
  let script: ActorScriptSense | undefined;
  if (read(1)) {
    // Component+100 PC, +104 cookie, +108 revision, +10C pause flag.
    // Cookie copy:835B27A8. Native PC advance:83768728.
    script = { pc: optional(6), cookie: optional(31), revision: optional(31), paused: !!read(1) };
  }
  const dropSequence = optional(31);
  const dropping = read(2) - 1;
  const dropRevision = optional(31);
  const terminal = !!read(1);
  const bound = !!read(1);
  const sequence = read(32);
  if (dropping !== 0 && dropping !== 1) throw new Error('Unsupported actor drop state');
  return { generation, revision, script, dropSequence, dropping, dropRevision, terminal, bound, sequence };
}
