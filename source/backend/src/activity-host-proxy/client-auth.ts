import { BitReader, rsat } from "@blamnetwork/rsat";
import { JoinRequestAuth } from "./join";
import { PahAdvertised, Unknown808044CC } from "./rsat/schemas/membership";

// Packaged Xbox descriptors; field order includes optional presence bits.
const ClientSession = rsat.schema(0x808044b9, {
  token: rsat.u8(),
  state: rsat.i8({ size: 2, bias: 1 }),
  advertised: rsat.nested(PahAdvertised),
  activityHost: rsat.u64(),
});
const ClientRegion = rsat.schema(0x808044bb, {
  destination: rsat.i32(),
  secondaryDestination: rsat.i32(),
  state: rsat.i8({ size: 2, bias: 1 }),
  token: rsat.u8(),
  session: rsat.nested(ClientSession),
});
const ClientTransition = rsat.schema(0x808044bd, {
  current: rsat.optional(rsat.nested(ClientRegion)),
  requested: rsat.optional(rsat.nested(ClientRegion)),
  insertionHash: rsat.optional(rsat.u32()),
  kind: rsat.optional(rsat.u8()),
  cookie: rsat.optional(rsat.u8()),
  state: rsat.optional(rsat.i8({ size: 3, bias: 1 })),
});
const ClientHardwipe = rsat.schema(0x808044c8, {
  state: rsat.i8({ size: 3, bias: 1 }),
  cookie: rsat.u8(),
  startTime: rsat.i32(),
  lastCookie: rsat.u8(),
});
const ClientTeleport = rsat.schema(0x808044cf, {
  state: rsat.i8({ size: 3, bias: 1 }),
  request: rsat.nested(Unknown808044CC),
  startTime: rsat.i32(),
});
const ClientAuth = rsat.schema(0x808044da, {
  join: rsat.optional(rsat.nested(JoinRequestAuth)),
  transition: rsat.optional(rsat.nested(ClientTransition)),
  hardwipe: rsat.optional(rsat.nested(ClientHardwipe)),
  teleport: rsat.optional(rsat.nested(ClientTeleport)),
});

export function parseClientAuth(payload: Buffer) {
  const reader = new BitReader(payload);
  const result = reader.readBit() ? ClientAuth.decode(reader) : undefined;
  const padding = reader.bitLength - reader.bitPos;
  if (padding < 0 || padding > 7 || (padding && reader.readNumber(padding))) {
    throw new Error("Invalid native client-auth framing/padding");
  }
  // The bitstream library returns 32-bit unsigned values as signed JS ints.
  return result && {
    ...result,
    teleport: result.teleport && {
      ...result.teleport,
      request: {...result.teleport.request, c: result.teleport.request.c >>> 0},
    },
  };
}
