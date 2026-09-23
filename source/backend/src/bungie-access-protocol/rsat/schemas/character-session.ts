import { rsat, decodeServerMessage, encodeServerMessage } from "@blamnetwork/rsat";
import { Unknown80801A2B } from "./messages";
import {AppearanceEc, AppearanceF0} from '../../queuez/shared';

// Guest823C0154: seventeen mandatory biased i16 fields. Retain these native
// choices, but do not mistake their unknown semantics for equipment ownership.
const CreationOptions = rsat.schema(0x80801bff, Object.fromEntries(
  Array.from({length: 17}, (_, i) => [`field${i}`, rsat.i16({bias: 0x8000})])));
export const CreateCharacterRequest = rsat.schema(0x80801aa9, {
  identity: rsat.nested(AppearanceEc), appearance: rsat.nested(AppearanceF0),
  options: rsat.nested(CreationOptions),
});
export const DeleteCharacterRequest = rsat.schema(0x80801aad, {characterSoid: rsat.u64()});
export const CustomizeCharacterRequest = rsat.schema(0x80801aaa, {appearance: rsat.nested(AppearanceF0)});

/** Canonical native frame only; customization cannot carry class or identity changes. */
export function parseCharacterCustomization(body: Buffer) {
  try {
    if (body.length < 3 || body.length > 128 || body.readUInt16BE(0) !== 506) return null;
    const value = decodeServerMessage(body, CustomizeCharacterRequest).value;
    return encodeServerMessage(506, CustomizeCharacterRequest, value).equals(body) ? value.appearance : null;
  } catch { return null; }
}

export function parseCharacterCreation(body: Buffer) {
  try {
    if (body.length < 2 || body.length > 128 || body.readUInt16BE(0) !== 501) return null;
    const value = decodeServerMessage(body, CreateCharacterRequest).value;
    if (!encodeServerMessage(501, CreateCharacterRequest, value).equals(body)) return null;
    if (![0,1,2].includes(value.identity.race!) || ![0,1].includes(value.identity.gender!) ||
        ![0,1,2].includes(value.identity.classIndex!)) return null;
    return value;
  } catch { return null; }
}

// SharedDef 808E206C rows +5D0/+5F4 and guest descriptors:
// 823B5374, 82270FF4, 823C9474, 82398634. See character-protocol.json.
export const LoginCharacterRequest = rsat.schema(0x80801ab1, { characterSoid: rsat.u64() });
export const LoginCharacterResponse = rsat.schema(0x80801ab2, { status: rsat.nested(Unknown80801A2B) });
export const SignoutCharacterRequest = rsat.schema(0x80801ab3, {});
export const SignoutCharacterResponse = rsat.schema(0x80801ab4, { status: rsat.nested(Unknown80801A2B) });

// SharedDef rows +564/+588/+618, guest descriptors 824F1AC4,
// 8253FAD4 and 8241A794. Creation must include its u64 result even on failure.
export const CreateCharacterResponse = rsat.schema(0x80801aac, {
  status: rsat.nested(Unknown80801A2B), characterSoid: rsat.u64(),
});
export const DeleteCharacterResponse = rsat.schema(0x80801aae, { status: rsat.nested(Unknown80801A2B) });
export const CustomizeCharacterResponse = rsat.schema(0x80801aab, { status: rsat.nested(Unknown80801A2B) });

/** Fail explicitly until each operation can commit a real saved-character change. */
export function unsupportedCharacterMutationResponse(networkId: number): Buffer | null {
  const status = { unknown0: -1, unknown1: 0 };
  if (networkId === 501) return encodeServerMessage(501, CreateCharacterResponse, { status, characterSoid: 0n });
  if (networkId === 502) return encodeServerMessage(502, DeleteCharacterResponse, { status });
  if (networkId === 506) return encodeServerMessage(506, CustomizeCharacterResponse, { status });
  return null;
}

/** These requests have no optional data. Validate the entire frame before changing selection. */
export function parseCharacterSessionRequest(body: Buffer): bigint | null {
  const id = body.length >= 2 ? body.readUInt16BE(0) : -1;
  if (id === 504 && body.length === 11 && body[10] === 0) {
    return decodeServerMessage(body, LoginCharacterRequest).value.characterSoid;
  }
  if (id === 505 && body.length === 3 && body[2] === 0) return 0n;
  return null;
}
