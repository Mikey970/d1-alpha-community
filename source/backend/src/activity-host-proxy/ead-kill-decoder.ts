import {createHash} from 'node:crypto';

const ANY_KILL = 0x324e9a20;
const EMPTY = 0x811c9dc5;
type Vector = [number, number, number];

export interface EadParticipant {
  flags: [boolean, boolean, boolean];
  /** Native participant+4. Actor-definition semantics and uniqueness unverified. */
  baseHash: number | null;
  baseEnum: number;
  hash1: number | null;
  hash2: number | null;
  platformIdentity: string | null;
  characterId: string | null;
  /** EAD strips the local dynamic actor reference; these hashes are not handles. */
  nativeActorReference: null;
}

export interface EadKill {
  schema: '80804EAD';
  /** SHA256 of exact packet, for duplicate receipts, not a native kill serial. */
  eventId: string;
  aliases: number[];
  context: {hash: number; kind: number; identity: string};
  /** First vector is native victim transform; second is a victim-associated anchor.
   * Producer82B5C214..22C ->836E4BB8 ->event+260 ->82BD80D8. */
  nativePositions: [Vector, Vector];
  commonOptionalEnums: [number | null, number | null, number | null];
  commonHash: number;
  combat: {value16: number; value3: number; words1: number[];
    bytes: [number, number]; flag: boolean; words2: number[]};
  attacker: EadParticipant;
  victim: EadParticipant;
  assists: {kind: number; participant: EadParticipant}[];
  victimSquadIdentifier: null;
  servitorCredit: false;
}

class Bits {
  at = 0;
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  read(width: number): number {
    if (!Number.isInteger(width) || width < 0 || width > 32 || this.at + width > this.bytes.length*8)
      throw new Error('Truncated or invalid bit field');
    let value = 0;
    for (let i=0; i<width; i++, this.at++)
      value = value*2 + ((this.bytes[this.at>>>3]! >>> (7-(this.at&7))) & 1);
    return value;
  }
  bool(): boolean { return this.read(1) !== 0; }
  hex64(): string {
    return this.read(32).toString(16).padStart(8,'0') + this.read(32).toString(16).padStart(8,'0');
  }
  optional<T>(read: () => T): T | null { return this.bool() ? read() : null; }
  vector(): Vector {
    const buffer = new ArrayBuffer(4), view = new DataView(buffer);
    const values: number[] = [];
    for (let i=0; i<3; i++) {
      view.setUint32(0,this.read(32),false);
      const value = view.getFloat32(0,false);
      if (!Number.isFinite(value)) throw new Error('Nonfinite native position');
      values.push(value);
    }
    return values as Vector;
  }
  finish(): void {
    const remaining = this.bytes.length*8-this.at;
    if (remaining > 7 || this.read(remaining) !== 0) throw new Error('Trailing data or nonzero padding');
  }
}

// Native80804EAA ->80804A02. No heuristic byte offsets or reference-codec guesses.
function participant(bits: Bits): EadParticipant {
  const flags: EadParticipant['flags'] = [bits.bool(),bits.bool(),bits.bool()];
  const baseHash = bits.optional(()=>bits.read(32));
  const baseEnum = bits.read(6)-3;
  const hash1 = bits.optional(()=>bits.read(32));
  const hash2 = bits.optional(()=>bits.read(32));
  const platformIdentity = bits.optional(()=>bits.hex64());
  const characterId = bits.optional(()=>bits.hex64());
  return {flags,baseHash,baseEnum,hash1,hash2,platformIdentity,characterId,nativeActorReference:null};
}

/** Caller must supply the evidenced connection kind: native83698EA0 maps0 toEAD.
 * Throws on wrong kind, unrelated aliases, truncation, bounds or trailing data.
 * One alias envelope produces one event. Never emits objective progress.
 */
export function decodeEadKill(raw: Uint8Array, connectionKind: number): EadKill {
  if (connectionKind !== 0) throw new Error('Connection kind does not select EAD');
  if (!raw.length || raw.length > 4096) throw new Error('Packet outside capture bound');
  const outer = new Bits(raw), aliasCount = outer.read(4);
  const aliases = Array.from({length:aliasCount},()=>outer.read(32));
  if (!aliases.includes(ANY_KILL)) throw new Error('Not an any_kill envelope');
  const length = outer.read(9);
  if (length > 500) throw new Error('Inner array exceeds native500-byte bound');
  const inner = Uint8Array.from({length},()=>outer.read(8));
  outer.finish();
  const bits = new Bits(inner);
  //80804A03 ->808004C9 ->808044A3
  const context = {hash:bits.read(32),kind:bits.read(3)-1,identity:bits.hex64()};
  const enum1 = bits.optional(()=>bits.read(8)-0x80);
  const enum2 = bits.optional(()=>bits.read(8)-0x80);
  const nativePositions: EadKill['nativePositions'] = [bits.vector(),bits.vector()];
  const enum3 = bits.optional(()=>bits.read(8)-0x80);
  const commonHash = bits.read(32);
  //80804EA3 derived combat fields in native schema order.
  const value16 = bits.read(16)-0x8000, value3 = bits.read(3)-1;
  const words1 = Array.from({length:6},()=>bits.read(32));
  const bytes: [number,number] = [bits.read(8),bits.read(8)];
  const flag = bits.bool();
  const words2 = Array.from({length:6},()=>bits.read(32));
  const attacker = participant(bits), victim = participant(bits);
  //80804EAC count3, up to7 records80804EAB.
  const count = bits.read(3), assists: EadKill['assists'] = [];
  for (let i=0;i<count;i++) assists.push({kind:bits.read(2)-1,participant:participant(bits)});
  bits.finish();
  return {schema:'80804EAD',eventId:createHash('sha256').update(raw).digest('hex'),aliases,
    context,nativePositions,commonOptionalEnums:[enum1,enum2,enum3],commonHash,
    combat:{value16,value3,words1,bytes,flag,words2},attacker,victim,assists,
    victimSquadIdentifier:null,servitorCredit:false};
}

export type EadPlayerIdentity = Readonly<{platformIdentity: string; characterId: string}>;

/** Historical field names are retained for capture compatibility. The captured
 * participant pair is the PlayerAuth character key followed by the AH identity,
 * not the BAP account id. Bind it to this join, never to the original save. */
export function eadPlayerIdentity(character: bigint | undefined, activityHost: bigint): EadPlayerIdentity | null {
  const max = 0xffffffffffffffffn;
  if (character === undefined || character <= 0n || character > max || activityHost <= 0n || activityHost > max) return null;
  return {platformIdentity: character.toString(16).padStart(16, '0'),
    characterId: activityHost.toString(16).padStart(16, '0')};
}

export function isPlayerToAiKill(event: EadKill, expected: EadPlayerIdentity): boolean {
  const a = event.attacker, v = event.victim;
  return a.platformIdentity === expected.platformIdentity.toLowerCase()
    && a.characterId === expected.characterId.toLowerCase()
    && a.flags.every(flag=>!flag) && v.flags[0]
    && (v.characterId === null || v.characterId === '0000000000000000')
    && (v.platformIdentity === null || v.platformIdentity === '0000000000000000')
    && v.baseHash !== null && v.baseHash !== EMPTY;
}
