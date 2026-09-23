import {expect,it} from 'vitest';
import {BitWriter} from '@blamnetwork/rsat';
import {SensorClientRef} from './rsat/schemas/sensor';
import {readVenusNorthernSense} from './venus-northern-progress';
it('decodes the native device receipt layout and keeps its outer sequence separate',()=>{
 const w=new BitWriter(512);w.write(0,2);w.writeBit(1);
 SensorClientRef.encode(w,{bundle:0x517641f1,typeId:4,typeIndex:77});w.writeBit(1);
 w.write(0x80000001,32);w.writeBit(1);w.write(0x80000000,32);w.write(0,32);w.write(0,32);
 w.write(1,4);w.writeBit(1);w.write(0x80802d89,32);
 for(const value of [0x80000000,0,0x80000000,0,0x80000001,0x3f800000])w.write(value,32);
 w.write(9,32);w.writeBit(0);
 expect(readVenusNorthernSense(w.finish())?.devices).toEqual([{index:77,position:1,revision:1,sequence:9}]);
});
