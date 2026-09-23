/** Analysis-only adapter. Source integration and rendered Dig Site proof pending. */
export const DIG_SITE_BUNDLE=0x5de7d8e2;
export const DIG_SITE_INITIAL=[1,2,3,4,5,6,7,8,10,12] as const;
export type DigSiteEffect={kind:'objective';index:30;active:boolean}
  | {kind:'trigger';bundle:number;index:41|42|75;active:boolean}
  | {kind:'place';squad:number;wildcardHypothesis:boolean}
  | {kind:'arrivalComplete'};
export class VenusStrikeDigSite {
  private armed=false; private requested=false; private stopped=false;
  private lifetime:string|undefined; private arrived=false;
  private hydra=false; private suicide=false;
  private readonly allocated=new Set<number>();
  constructor(private readonly emit:(effect:DigSiteEffect)=>void) {}
  get allocatedSquads():number[] {return [...this.allocated];}
  get objectiveActive():boolean {return this.armed&&!this.arrived;}
  get boundLifetime():string|undefined {return this.lifetime;}
  /** Caller reaches this only through the verified Engineering completion callback. */
  armAfterEngineeringComplete(activityName:string,engineeringComplete:boolean):void {
    if(this.stopped||this.armed||activityName!=='venus_portal_1'||!engineeringComplete)return;
    this.armed=true;this.emit({kind:'objective',index:30,active:true});
  }
  /** Pass the output of existing requestedStrikeBubble, never a constructed teleport. */
  reserveFromNativeRequest(activityName:string,occupied:number,destination:number|undefined):void {
    if(!this.stopped&&this.armed&&activityName==='venus_portal_1'&&occupied===7&&destination===5)this.requested=true;
  }
  reserveEarnedCheckpoint(activity:string):void {
    if(!this.stopped&&this.armed&&activity==='venus_portal_1')this.requested=true;
  }
  cancelNativeRequest():void {if(this.lifetime===undefined)this.requested=false;}
  /** Called after actual occupied refresh5 AND native owner5 bindings are ready. */
  ownerReady(scope:{activityName:string;occupied:number;nativeOccupiedRefresh:boolean;
    ownerBindingsReady:boolean;bindingLifetime:string}):void {
    if(this.stopped||!this.armed||!this.requested||this.lifetime!==undefined||
      scope.activityName!=='venus_portal_1'||scope.occupied!==5||!scope.nativeOccupiedRefresh||
      !scope.ownerBindingsReady||!scope.bindingLifetime.trim())return;
    this.lifetime=scope.bindingLifetime;
    this.emit({kind:'objective',index:30,active:true});
    for(const index of [41,42] as const)this.emit({kind:'trigger',bundle:DIG_SITE_BUNDLE,index,active:true});
    this.emit({kind:'trigger',bundle:0x0a302429,index:75,active:true});
    for(const squad of DIG_SITE_INITIAL)this.place(squad);
  }
  /** Exact50-byte native DD6D986F form; no count, timer, or rendered-only completion. */
  incident(payload:Buffer,activityName:string,occupied:number,bindingLifetime:string):void {
    if(this.stopped||this.lifetime===undefined||this.lifetime!==bindingLifetime||
      activityName!=='venus_portal_1'||occupied!==5)return;
    const trigger=decodeDigSiteTrigger(payload);if(!trigger)return;
    if(trigger.bundle===0x0a302429&&trigger.index===75) {
      if(!this.arrived){this.arrived=true;this.emit({kind:'objective',index:30,active:false});this.emit({kind:'arrivalComplete'});}
      return;
    }
    if(trigger.index===42)this.hydra=true;
    if(trigger.index===41)this.suicide=true;
    // is_triggered is latched: an earlier real41 is consumed only after42.
    if(this.hydra)this.place(11);
    if(this.hydra&&this.suicide)this.place(9);
  }
  private place(squad:number):void {
    if(this.allocated.has(squad))return;
    this.allocated.add(squad);this.emit({kind:'place',squad,wildcardHypothesis:[1,2,3].includes(squad)});
  }
  /** Strip default initialization for allocated squads; retain trigger enable/HUD state. */
  refreshState(bindingLifetime:string,occupied:number) {
    if(this.stopped||occupied!==5||this.lifetime!==bindingLifetime)return undefined;
    return {allocatedSquads:this.allocatedSquads,objectiveActive:this.objectiveActive,
      triggers:[{bundle:DIG_SITE_BUNDLE,index:41},{bundle:DIG_SITE_BUNDLE,index:42},{bundle:0x0a302429,index:75}]};
  }
  stop():void {this.stopped=true;this.requested=false;this.lifetime=undefined;}
}
export function decodeDigSiteTrigger(payload:Buffer):{bundle:number;index:41|42|75}|undefined {
  if(!Buffer.isBuffer(payload)||payload.length!==50)return;
  let p=0;const read=(n:number)=>{let v=0;for(let i=0;i<n;i++,p++)v=v*2+((payload[p>>3]>>(7-(p&7)))&1);return v;};
  if(read(4)!==1||read(32)!==0xdd6d986f)return;
  p=310;const bundle=read(32),type=read(6)-1,index=read(16)-0x8000;
  if(type!==29||read(32)!==0x811c9dc5||read(4)!==0)return;
  if(bundle===DIG_SITE_BUNDLE&&(index===41||index===42))return {bundle,index};
  if(bundle===0x0a302429&&index===75)return {bundle,index};
}
