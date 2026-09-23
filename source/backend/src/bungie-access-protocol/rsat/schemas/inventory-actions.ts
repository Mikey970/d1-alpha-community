import {rsat, encodeServerMessage} from '@blamnetwork/rsat';
import {Unknown80801A2B} from './messages';

// Native SharedDef808E206C, entry108 package0071: rows+4DC/+500.
// Xbox descriptors82343334/8240AB44/82318084 establish402 field order.
export const InventoryAction = rsat.schema(0x80804bd1, {
  flag:rsat.bool(), itemSoid:rsat.u64(), actionIndex:rsat.i16({size:16,bias:0x8000}),
});
export const InventoryActionRequest=rsat.schema(0x80801aa5,{action:rsat.nested(InventoryAction)});
export const InventoryActionResponse=rsat.schema(0x80801aa6,{status:rsat.nested(Unknown80801A2B)});
export const InventoryDestroyRequest=rsat.schema(0x80801aa1,{itemSoid:rsat.u64()});
export const InventoryDestroyResponse=rsat.schema(0x80801aa2,{status:rsat.nested(Unknown80801A2B)});

// Unsupported operations must still have an RSAT payload. An empty type11
// reaches native8356231C's positive-size assertion before status handling.
export function unsupportedInventoryActionResponse(networkId:401|402):Buffer {
  return encodeServerMessage(networkId,networkId===402?InventoryActionResponse:InventoryDestroyResponse,
    {status:{unknown0:-1,unknown1:0}});
}
