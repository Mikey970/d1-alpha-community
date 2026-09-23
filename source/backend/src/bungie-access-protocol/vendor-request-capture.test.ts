import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeServerMessage } from '@blamnetwork/rsat';
import { afterEach, expect, it, vi } from 'vitest';
import { VendorBuyRequest, VendorRequestCapture } from './vendor-request-capture';

afterEach(() => vi.unstubAllEnvs());
it('retains bounded buy/sell evidence independently of inventory traffic and captures decode failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd1a-vendor-capture-'));
  const path = join(dir,'requests.jsonl');
  vi.stubEnv('D1A_VENDOR_CAPTURE_PATH',path);
  const capture = new VendorRequestCapture();
  const logger = {log:vi.fn(),warn:vi.fn(),debug:vi.fn(),error:vi.fn()};
  const observe = (body:Buffer) => capture.observe({body,sequence:7,msgType:10},logger);
  try {
    for (let i=0;i<40;i++) observe(Buffer.from('019300','hex')); // inventory403
    observe(encodeServerMessage(901,VendorBuyRequest,{vendorIndex:24,purchaseIndex:0}));
    observe(Buffer.from('0385','hex')); // truncated buy
    for (let i=0;i<40;i++) observe(Buffer.from('038700','hex')); // sell903
    const rows = readFileSync(path,'utf8').trim().split('\n').map(s=>JSON.parse(s));
    expect(rows).toHaveLength(32);
    expect(rows[0].selection).toEqual({vendorIndex:24,purchaseIndex:0});
    expect(rows[1].decodeError).toBeTypeOf('string');
    expect(rows.every(row=>[901,903].includes(row.networkId))).toBe(true);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
