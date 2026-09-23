import { BitWriter } from '@blamnetwork/rsat';
import { ActorAuth } from './rsat/schemas/sensor';
import type { FinishedBits, SensorAuthSenseEntry } from './rsat/mocks/sensor-auth';
import { encodeActorChannelScript } from './actor-channel-script';
import { encodeCalderaFlightScript } from './caldera-flight-script';

// Verified original host179 and client2898/4730, physical owner9.
export const CALDERA_PILOT = { bundle: 0xb63afda3, typeId: 2, typeIndex: 175 } as const;
export const CALDERA_PILOT_SQUAD = 174;

function pilotEntry(body: FinishedBits): SensorAuthSenseEntry {
  return {
    clientRef: { ...CALDERA_PILOT }, authSchemaBound: true, senseSchemaBound: true,
    authBody: body.bytes, authBits: body.bitCount, nativeBodyFraming: true,
    isReceivedSenseState: false, isSenseUpdateRelative: true,
  };
}

/** Script45 places the named pilot actor, not a nonzero squad population.
 * Caller owns the encounter generation and must await real bound ActorSense.
 */
export function buildCalderaPilotPlacement(generation: number): SensorAuthSenseEntry {
  if (!Number.isInteger(generation) || generation < 1 || generation > 0x7fffffff) {
    throw new Error('Invalid Caldera pilot generation');
  }
  const bw = new BitWriter(32);
  ActorAuth.encode(bw, {
    unk0: generation, unk1: 0, unk2: 0, flag3: true,
    nest4: undefined, nest5: undefined, script: undefined, nest7: undefined,
  });
  return pilotEntry({ bitCount: bw.bitCount, bytes: bw.finish() });
}

export function buildCalderaPilotDoors(open: boolean, cookie: number): SensorAuthSenseEntry {
  const value = open ? 1 : 0;
  return pilotEntry(encodeActorChannelScript(cookie, 0x80296344, [value,value,value,value]));
}

export function buildCalderaPilotFlight(path: number, cookie: number): SensorAuthSenseEntry {
  return pilotEntry(encodeCalderaFlightScript(path, cookie));
}
