import rows from './e3-subclass-items.native.json';
import {e3AppearancePreset} from './e3-appearance';
import {e3SubclassIntrinsics} from './e3-subclass-intrinsics';

export function e3SubclassItem() {
  const preset=e3AppearancePreset();
  const row=preset && rows.find(r=>r.preset===preset.index);
  return row ? {soid:0x300002000n+BigInt(row.preset),defIndex:row.definition,
    bucket:7,slot:1,artArrangement:-1,sandboxPattern:-1,stats:[] as [number,number][]} : undefined;
}
function selected(soid:bigint,definition?:number) {
  const item=e3SubclassItem();
  return item && item.soid===soid && (definition===undefined || definition===item.defIndex)
    ? rows.find(r=>r.definition===item.defIndex) : undefined;
}
export function e3EquippedAbilities(soid:bigint) {
  const row=selected(soid);
  return row ? Array.from({length:5},(_,slot)=>{
    const node=row.nodes.find(n=>n.slot===slot)!;
    const mods=row.nodes.filter(n=>n.modifierAbility===node.ability).map(n=>n.modifierHash);
    return {unknown0:node.ability,unknown1:{unknown0:Array.from({length:8},(_,i)=>mods[i]??0x811c9dc5)}};
  }) : undefined;
}
export function e3EquippedIntrinsics(soid:bigint) {
  return selected(soid) ? e3SubclassIntrinsics() : undefined;
}
/** Reconstructed fixed E3 kit. All published nodes are native auto-grants;
 * this does not invent an original E3 purchase or progression system. */
export function e3SubclassValue(soid:bigint,definition:number) {
  const row=selected(soid,definition);
  return row ? {
    unknown0:row.grid,
    unknown1:{unknown0:12,unknown1:0,unknown2:0,unknown3:0},
    unknown2:0,unknown3:0,
    unknown4:{unknown0:Array.from({length:50},(_,i)=>i<row.nodes.length?1:0)},
    unknown5:{unknown0:Array.from({length:5},(_,slot)=>({
      unknown0:row.nodes.find(n=>n.slot===slot)!.node,unknown1:0}))},
  } : undefined;
}
