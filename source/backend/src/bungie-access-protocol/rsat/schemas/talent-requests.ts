import { rsat } from "@blamnetwork/rsat";
import { Unknown80801A2B } from "./messages";

// SharedDef801/802 and native producers836767E8/83676840.
export const TalentActivateRequest = rsat.schema(0x80801ac7, {
  itemSoid: rsat.u64(),
  nodeIndex: rsat.i8({ bias: 128 }),
});
export const TalentActivateResponse = rsat.schema(0x80801ac8, {
  status: rsat.nested(Unknown80801A2B),
});
export const TalentSwapRequest = rsat.schema(0x80801ac9, {
  itemSoid: rsat.u64(),
  nodeIndex: rsat.i8({ bias: 128 }),
});
export const TalentSwapResponse = rsat.schema(0x80801aca, {
  status: rsat.nested(Unknown80801A2B),
});
