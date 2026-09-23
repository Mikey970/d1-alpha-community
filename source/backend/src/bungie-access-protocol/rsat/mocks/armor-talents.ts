import {characterSetting} from '../../character-context';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import native from './armor-upgrades-native.json';
import legacy from './armor-talents-native.json';
type Step={step:number;offset:number;pointCost:number;swapPointCost:number;requiredLevel:number;conditionCount:number;directCostCount:number;statModifiers:{index:number;value:number}[];modifierHash:string;modifierAbility:number;perkIndex:number;supportedPurchase:boolean};
type Node={node:number;autoGrant:boolean;randomized:boolean;group:string;prerequisites:number[];steps:Step[]};
type Grid={grid:number;category:number;initialPoints:number;nodeCount:number;nodes:Node[]};
type Item={soid:bigint;defIndex:number};type State={definition:number;grid:number;points:number;ranks:number[]};
type Save={schema:1;policy:'local-six-point-armor-v1';version:number;items:Record<string,State>};
const definitions:Record<number,{grid:number;intrinsics:number[]}>=native.items;
const grids:Record<number,Grid>=native.grids;
const key=(id:bigint)=>id.toString(16).padStart(16,'0');
const path=()=>characterSetting('D1A_EQUIPMENT_PROFILE')?`${characterSetting('D1A_EQUIPMENT_PROFILE')}.armor-talents.json`:undefined;
const hasGroup=(g:string)=>g!=='811C9DC5'&&g!=='00000000';
export const armorTalentEnabled=()=>process.env.D1A_ARMOR_TALENT_PROBE==='1';
export const armorTalentDefinition=(def:number)=>(legacy as Record<number,typeof legacy['104']>)[def];
function initial(item:Item):State|undefined{
 const def=definitions[item.defIndex];if(!def)return;const grid=grids[def.grid]!;const ranks=Array<number>(50).fill(0);
 for(const n of grid.nodes)if(n.autoGrant){
  // Stable server-selected authored roll. Random nodes encode option+1, never
  // the sum of every option. The SOID gives each rewarded item its own roll.
  ranks[n.node]=n.randomized?1+createHash('sha256').update(`${key(item.soid)}:${grid.grid}:${n.node}`).digest().readUInt32BE(0)%n.steps.length:n.steps.length;
 }
 return {definition:item.defIndex,grid:grid.grid,points:6,ranks};
}
function read():Save{
 const p=path();if(!p||!existsSync(p))return {schema:1,policy:'local-six-point-armor-v1',version:1,items:{}};
 const saved=JSON.parse(readFileSync(p,'utf8')) as Save;
 if(saved.schema!==1||saved.policy!=='local-six-point-armor-v1'||!Number.isSafeInteger(saved.version)||saved.version<1||!saved.items||Array.isArray(saved.items))throw Error('Invalid armor talent save');
 for(const [id,s] of Object.entries(saved.items)){
  const def=definitions[s.definition],grid=def&&grids[def.grid];
  if(!/^00000003[0-9a-f]{8}$/.test(id)||!grid||s.grid!==grid.grid||!Number.isInteger(s.points)||s.points<0||s.points>6||!Array.isArray(s.ranks)||s.ranks.length!==50)throw Error('Invalid armor talent identity');
  const groups=new Set<string>();
  for(let i=0;i<50;i++){
   const n=grid.nodes[i],rank=s.ranks[i]!;
   if(!Number.isInteger(rank)||rank<0||rank>(n?.steps.length??0)||(n?.autoGrant&&rank===0))throw Error('Invalid armor talent rank');
   if(rank&&n&&!n.autoGrant&&n.steps.slice(0,rank).some(step=>!step.supportedPurchase))throw Error('Unsupported armor talent rank');
   if(rank&&n&&hasGroup(n.group)){if(groups.has(n.group))throw Error('Conflicting armor talents');groups.add(n.group);}
  }
 }
 return saved;
}
function state(item:Item,save=read()):State|undefined{
 const current=save.items[key(item.soid)]??initial(item);if(current&&current.definition!==item.defIndex)throw Error('Armor talent identity mismatch');return current;
}
function active(item:Item):Step[]{
 const s=state(item);if(!s)return [];const grid=grids[s.grid]!;
 return grid.nodes.flatMap(n=>{const rank=s.ranks[n.node]!;return rank===0?[]:n.randomized?[n.steps[rank-1]!]:n.steps.slice(0,rank);});
}
export function armorTalentVersion(){return armorTalentEnabled()?read().version:0;}
export function armorTalentValue(soid:bigint,defIndex:number){
 if(!armorTalentEnabled())return;const s=state({soid,defIndex});if(!s)return;const grid=grids[s.grid]!;
 return {unknown0:s.grid,unknown1:{unknown0:grid.category,unknown1:0,unknown2:0,unknown3:0},unknown2:s.points,unknown3:0,
 unknown4:{unknown0:s.ranks},unknown5:{unknown0:Array.from({length:5},()=>({unknown0:-1,unknown1:-1}))}};
}
/** IDs are authored native perk references; unresolved asset effects are not
 * purchasable. Initial rolls remain represented faithfully in item state. */
export function armorPerks(items:readonly Item[]):number[]{
 if(!armorTalentEnabled())return [];
 return items.flatMap(item=>[...active(item).map(s=>s.perkIndex),...(definitions[item.defIndex]?.intrinsics??[])]).filter(p=>p>=0&&p<215);
}
/** Native83728FD0 supplies GearCF+0xB8 to837279A8; wildcard (-1)
 * selected-step modifiers go into its separate32-entry global hash array. */
export function armorGlobalModifiers(items:readonly Item[]):number[]{
 if(!armorTalentEnabled())return [];
 const hashes=items.flatMap(item=>active(item).filter(step=>step.modifierAbility===-1&&step.modifierHash!=='811C9DC5').map(step=>parseInt(step.modifierHash,16)));
 if(hashes.length>32)throw Error('Armor modifier projection exceeds native capacity');
 return hashes;
}
export function armorStats(items:readonly Item[],base:readonly (readonly [number,number])[]):readonly (readonly [number,number])[]{
 if(!armorTalentEnabled())return base;const values=new Map<number,number>();
 for(const [index,value] of base)values.set(index,(values.get(index)??0)+value);
 for(const item of items)for(const step of active(item))for(const mod of step.statModifiers)values.set(mod.index,(values.get(mod.index)??0)+mod.value);
 if(values.size>16)throw Error('Armor stat projection exceeds native capacity');
 return [...values.entries()].sort(([a],[b])=>a-b);
}
export function mutateArmorTalent(item:Item|undefined,nodeIndex:number,swap=false):{accepted:boolean;changed:boolean;reason:string}|undefined {
 if(!item||!definitions[item.defIndex])return;
 const reject=(reason:string)=>({accepted:false,changed:false,reason});
 if(!armorTalentEnabled())return reject('armor-probe-disabled');
 if(!Number.isInteger(nodeIndex))return reject('invalid-armor-node');
 try{
  const saved=read(),s=state(item,saved)!,grid=grids[s.grid]!,node=grid.nodes[nodeIndex];
  if(!node)return reject('unknown-armor-node');if(node.autoGrant)return reject('armor-authored-grant-is-not-purchasable');
  const rank=s.ranks[nodeIndex]!;if(rank>=node.steps.length)return {accepted:true,changed:false,reason:'armor-node-already-active'};
  const step=node.steps[rank]!;if(!step.supportedPurchase)return reject('armor-native-effect-not-yet-recovered');
  const alternative=hasGroup(node.group)?grid.nodes.find(n=>n.node!==nodeIndex&&n.group===node.group&&s.ranks[n.node]):undefined;
  if(swap&&!alternative)return reject('armor-swap-needs-active-group');if(!swap&&alternative)return reject('armor-group-use-swap');
  for(const id of node.prerequisites){const required=grid.nodes[id]!;if(!s.ranks[id]&&!(hasGroup(required.group)&&grid.nodes.some(n=>n.group===required.group&&s.ranks[n.node])))return reject('armor-prerequisite');}
  const cost=swap?step.swapPointCost:step.pointCost;if(s.points<cost)return reject('armor-upgrade-points');
  const next={...s,points:s.points-cost,ranks:[...s.ranks]};if(alternative)next.ranks[alternative.node]=0;next.ranks[nodeIndex]=rank+1;
  const p=path();if(!p)return reject('armor-profile-path-missing');saved.items[key(item.soid)]=next;saved.version++;
  writeFileSync(`${p}.tmp`,JSON.stringify(saved,null,2)+'\n');renameSync(`${p}.tmp`,p);
  return {accepted:true,changed:true,reason:`armor-grid${s.grid}-node${nodeIndex}-${swap?'swap':'purchase'}`};
 }catch(error){return reject(`armor-state-write-failed:${String(error)}`);}
}
