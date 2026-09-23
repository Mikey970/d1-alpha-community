import { appendFileSync } from 'node:fs';
import { decodeServerMessage, rsat } from '@blamnetwork/rsat';
import type ILogger from '../ILogger';
import type { RawBapMessage } from './codec';
import { Unknown80801A2B } from './rsat/schemas/messages';

// SharedDef 808E206C: network901 request80801ACB. Native field0 is
// signed8/bias128 and field1 signed16/bias32768. Observation only.
export const VendorBuyRequest = rsat.schema(0x80801acb, {
  vendorIndex: rsat.i8(),
  purchaseIndex: rsat.i16(),
});

// SharedDef 808E206C row901 maps 80801ACB -> 80801ACC. The response wraps
// the same 80801A2B status used by the neighboring inventory operations.
export const VendorBuyResponse = rsat.schema(0x80801acc, {
  status: rsat.nested(Unknown80801A2B),
});

/** Separate budget: weapon/loot traffic must not exhaust a vendor trace. */
export class VendorRequestCapture {
  private count = 0;

  observe(message: RawBapMessage, logger: ILogger): void {
    const path = process.env.D1A_VENDOR_CAPTURE_PATH;
    if (!path || this.count >= 32 || message.body.length < 2 || message.body.length > 4096) return;
    const networkId = message.body.readUInt16BE(0);
    if (![901,902,903,1401].includes(networkId)) return;
    this.count++;
    let selection: unknown;
    let decodeError: string | undefined;
    if (networkId === 901) {
      try { selection = decodeServerMessage(message.body, VendorBuyRequest).value; }
      catch (error) { decodeError = String(error); }
    }
    try {
      appendFileSync(path, JSON.stringify({timestamp:new Date().toISOString(),
        sequence:message.sequence >>> 0, networkId, bodyBytes:message.body.length,
        bodyHex:message.body.toString('hex'), selection, decodeError})+'\n', 'utf8');
      logger.log(`D1A_VENDOR_REQUEST_CAPTURE network=${networkId} seq=${message.sequence} selection=${JSON.stringify(selection)}`);
    } catch (error) {
      logger.warn(`D1A_VENDOR_REQUEST_CAPTURE_FAILED ${String(error)}`);
    }
  }
}
