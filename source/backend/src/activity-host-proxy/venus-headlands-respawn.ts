import { BitReader } from '@blamnetwork/rsat';
import { SensorClientRef } from './rsat/schemas/sensor';

const populations = new Map([[24, 4], [26, 4], [28, 2], [30, 1]]);
// Recovery scheduling policy; the authored script declares a respawn timer,
// but its exact timing and player-monitor conditions remain unrecovered. The
// original 60s left the fluid encounter dead for long stretches once a squad
// was wiped, so this is a pacing choice, not a recovered value: override with
// D1A_HEADLANDS_RESPAWN_MS to retune without a rebuild.
const DEFAULT_RECOVERY_RESPAWN_DELAY_MS = 20_000;
function configuredRecoveryDelay(): number {
  const raw = Number(process.env.D1A_HEADLANDS_RESPAWN_MS);
  return Number.isFinite(raw) && raw >= 1000 && raw <= 300_000
    ? Math.floor(raw) : DEFAULT_RECOVERY_RESPAWN_DELAY_MS;
}
export const RECOVERY_RESPAWN_DELAY_MS = configuredRecoveryDelay();

export function readHeadlandsSquad(payload: Buffer) {
  if (payload.length < 12 || payload.length > 2048) return undefined;
  try {
    const br = new BitReader(payload);
    const read = (width: number) => {
      if (br.bitPos + width > br.bitLength) throw new Error('Truncated squad sense');
      return br.readNumber(width);
    };
    if (read(3) !== 1) return undefined;
    const ref = SensorClientRef.decode(br);
    if ((ref.bundle >>> 0) !== 0xb9d50318 || ref.typeId !== 1 ||
        !populations.has(ref.typeIndex) || read(1) !== 1) return undefined;
    const optional = (width: number) => read(1) ? read(width) : undefined;
    optional(31); optional(31); optional(31);
    const members = optional(6);
    optional(6); read(3);
    const valid = read(1) === 1;
    optional(7); // Native 8242F340, not the legacy f32 decoder.
    const roster = read(1)
      ? Array.from({ length: read(4) }, () => (read(32) - 0x80000000) | 0)
      : undefined;
    if (read(1)) return undefined;
    const sequence = read(32);
    const remaining = br.bitLength - br.bitPos;
    const single = remaining <= 7 && (remaining === 0 || read(remaining) === 0);
    return { squad: ref.typeIndex, members, roster, sequence, valid, single };
  } catch { return undefined; }
}

export class VenusHeadlandsRespawn {
  readonly allocations = new Map(populations);
  private states = new Map<number, { sequence: number; live: boolean; readyAt?: number }>();

  resetObservations() { this.states.clear(); }

  observe(payload: Buffer, now: number) {
    const sense = readHeadlandsSquad(payload);
    if (!sense?.valid) return;
    const state = this.states.get(sense.squad) ?? { sequence: -1, live: false };
    if (sense.sequence <= state.sequence) return;
    state.sequence = sense.sequence;
    if (sense.members !== undefined && sense.members > 0) {
      state.live = true;
      state.readyAt = undefined;
    }
    // r390 confirms 4/4/2/1 live actors became zero with cumulative death
    // rosters [4]/[4]/[2]/[1]. Never use proximity, unload, or time as a kill.
    if (state.live && sense.single && sense.members === 0 &&
        sense.roster?.length === 1 &&
        sense.roster[0] === this.allocations.get(sense.squad) && state.readyAt === undefined) {
      state.readyAt = now + RECOVERY_RESPAWN_DELAY_MS;
    }
    this.states.set(sense.squad, state);
  }

  takeReady(now: number): Array<{ squad: number; allocation: number }> {
    const ready: Array<{ squad: number; allocation: number }> = [];
    for (const [squad, state] of this.states) {
      if (state.readyAt === undefined || now < state.readyAt) continue;
      const allocation = this.allocations.get(squad)! + populations.get(squad)!;
      // Native 835AD308..328: max(allocation - unavailable - tracked, 0).
      // Increase only the host allocation. Do not reset native death/sense data.
      this.allocations.set(squad, allocation);
      state.readyAt = undefined;
      state.live = false;
      ready.push({ squad, allocation });
    }
    return ready;
  }
}
