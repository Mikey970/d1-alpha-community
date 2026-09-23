import {characterSetting} from '../../character-context';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import native from './weapon-talents-native.json';
type Node={autoGrant?:boolean;node:number;group:string;prerequisites:number[];pointCost:number;swapPointCost:number;requiredLevel:number;perkIndex:number;statModifiers:{index:number;value:number}[]};
type Weapon={baseStats:number[][];grid:number;category:number;intrinsics:number[];nodeCount:number;nodes:Node[]};
type Item={soid:bigint;defIndex:number};
type State={definition:number;grid:number;points:number;ranks:number[]};
type Save={schema:1;version:number;items:Record<string,State>};
type Result={accepted:boolean;changed:boolean;reason:string};
const weapons:Record<string,Weapon>=native.weapons;
const supported=new Set<number>(native.supportedPerkIndices);
const key=(soid:bigint)=>soid.toString(16).padStart(16,'0');
const path=()=>characterSetting('D1A_EQUIPMENT_PROFILE') ? `${characterSetting('D1A_EQUIPMENT_PROFILE')}.weapon-talents.json` : undefined;
const hasGroup=(group:string)=>group!=='811C9DC5'&&group!=='00000000';
function read():Save {
 const p=path();if(!p||!existsSync(p))return {schema:1,version:1,items:{}};
 const save=JSON.parse(readFileSync(p,'utf8')) as Save;
 if(save.schema!==1||!Number.isSafeInteger(save.version)||save.version<1||!save.items||Array.isArray(save.items))throw Error('Invalid weapon talent save');
 for(const [id,state] of Object.entries(save.items)){
  const w=weapons[state.definition];
  if(!/^00000003[0-9a-f]{8}$/.test(id)||!w||state.grid!==w.grid||!Number.isInteger(state.points)||state.points<0||state.points>255||
    !Array.isArray(state.ranks)||state.ranks.length!==50||state.ranks.some((v,i)=>!Number.isInteger(v)||v<0||v>1||(i>=w.nodeCount&&v!==0)))throw Error('Invalid weapon talent item');
  const groups=new Set<string>();
  for(const n of w.nodes)if(state.ranks[n.node]&&hasGroup(n.group)){
   if(groups.has(n.group))throw Error('Conflicting weapon talents');groups.add(n.group);
  }
 }
 return save;
}
function stateFor(item:Item,save=read()):State|undefined {
 const w=weapons[item.defIndex];if(!w)return;
 const state=save.items[key(item.soid)]??{definition:item.defIndex,grid:w.grid,points:6,ranks:Array.from({length:50},(_,i)=>w.nodes[i]?.autoGrant?1:0)};
 if(state.definition!==item.defIndex||state.grid!==w.grid)throw Error('Weapon talent identity mismatch');
 return state;
}
export function weaponTalentVersion(){return read().version;}
export function weaponTalentValue(soid:bigint,defIndex:number){
 const state=stateFor({soid,defIndex}),w=weapons[defIndex];if(!state||!w)return;
 return {unknown0:w.grid,unknown1:{unknown0:w.category,unknown1:0,unknown2:0,unknown3:0},
  unknown2:state.points,unknown3:0,unknown4:{unknown0:state.ranks},
  unknown5:{unknown0:Array.from({length:5},()=>({unknown0:-1,unknown1:-1}))}};
}
export function weaponPerks(item:Item|undefined):number[]|undefined {
 if(!item)return;const w=weapons[item.defIndex],state=stateFor(item);if(!w||!state)return;
 // Native order: active node steps, followed by item intrinsic perks.
 return [...w.nodes.filter(n=>state.ranks[n.node]).map(n=>n.perkIndex),...w.intrinsics].filter(p=>supported.has(p));
}
export function weaponStats<T extends readonly (readonly [number,number])[]>(item:Item|undefined,base:T):readonly (readonly [number,number])[]{
 if(!item)return base;const w=weapons[item.defIndex],state=stateFor(item);if(!w||!state||!state.ranks.some(Boolean))return base;
 const values=new Map<number,number>();
 // Preserve the working server's base values, including its unresolved zero
 // progression-curve value. Native purchased-step additions are independently proven.
 for(const [stat,value] of base)values.set(stat,(values.get(stat)??0)+value);
 for(const n of w.nodes)if(state.ranks[n.node])for(const m of n.statModifiers)values.set(m.index,(values.get(m.index)??0)+m.value);
 return [...values.entries()].filter(([,value])=>value>0).sort(([a],[b])=>a-b).slice(0,16);
}
export function mutateWeaponTalent(item:Item|undefined,nodeIndex:number,swap=false):Result|undefined {
 if(!item||!weapons[item.defIndex])return;
 const reject=(reason:string):Result=>({accepted:false,changed:false,reason});
 if(!Number.isInteger(nodeIndex))return reject('invalid-weapon-node');
 const w=weapons[item.defIndex],node=w.nodes.find(n=>n.node===nodeIndex);if(!node)return reject('unknown-weapon-node');
 const save=read(),state=stateFor(item,save)!;
 if(state.ranks[nodeIndex])return {accepted:true,changed:false,reason:'weapon-node-already-active'};
 const activeAlternative=hasGroup(node.group)?w.nodes.find(n=>n.node!==nodeIndex&&n.group===node.group&&state.ranks[n.node]):undefined;
 if(swap&&!activeAlternative)return reject('weapon-swap-needs-active-group');
 if(!swap&&activeAlternative)return reject('weapon-group-use-swap');
 for(const prerequisite of node.prerequisites){
  const required=w.nodes[prerequisite];
  if(!state.ranks[prerequisite]&&!(hasGroup(required.group)&&w.nodes.some(n=>n.group===required.group&&state.ranks[n.node])))return reject('weapon-prerequisite');
 }
 if(node.requiredLevel!==0)return reject('weapon-level-unavailable');
 const cost=swap?node.swapPointCost:node.pointCost;
 if(state.points<cost)return reject('weapon-upgrade-points');
 const next={...state,points:state.points-cost,ranks:[...state.ranks]};
 if(activeAlternative)next.ranks[activeAlternative.node]=0;
 next.ranks[nodeIndex]=1;
 const p=path();if(!p)return reject('weapon-profile-path-missing');
 save.items[key(item.soid)]=next;save.version++;
 try{writeFileSync(`${p}.tmp`,JSON.stringify(save,null,2)+'\n');renameSync(`${p}.tmp`,p);}catch(error){return reject(`weapon-save-failed:${String(error)}`);}
 return {accepted:true,changed:true,reason:`weapon-grid${w.grid}-node${nodeIndex}-${swap?'swap':'purchase'}`};
}

export function weaponBaseStats(definition:number):[number,number][]|undefined {return weapons[definition]?.baseStats.map(([index,value])=>[index,value]);}
