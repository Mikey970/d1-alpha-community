import { VenusStrikeDigSite, DigSiteEffect } from './venus-strike-dig-site';
import { DigSiteOwnerReceipts } from './dig-site-owner-receipts';
/** Scoped host adapter: real route + all private binding receipts; no travel/reset or kill credit. */
export class VenusStrikeDigSiteRuntime {
  private readonly mission: VenusStrikeDigSite;
  private readonly receipts: DigSiteOwnerReceipts;
  private activity = '';
  private occupied: number | undefined;
  private stopped = false;
  private diagnosticCount=0;
  private earnedCheckpoint=false;
  constructor(private readonly lifetime: string, private readonly emit: (effect: DigSiteEffect) => void,
      private readonly log: (message: string) => void) {
    if (!lifetime.trim()) throw Error('Missing Dig Site activity lifetime');
    this.mission = new VenusStrikeDigSite(effect => {
      if (this.stopped) return;
      if (effect.kind === 'place' && effect.wildcardHypothesis)
        this.log(`D1A_STRIKE_DIG_SITE_WILDCARD_HYPOTHESIS squad=${effect.squad} privateObjective0 task6; authored wildcard selection unverified`);
      this.emit(effect);
    });
    this.receipts = new DigSiteOwnerReceipts(token => {
      this.log(`D1A_STRIKE_DIG_SITE_BINDINGS_RECEIVED lifetime=${token} privateSquads=12 privateObjective=0; scene/combat acceptance pending`);
      this.mission.ownerReady({activityName:this.activity,occupied:this.occupied ?? -1,
        nativeOccupiedRefresh:true,ownerBindingsReady:true,bindingLifetime:token});
    });
  }
  arm(activity:string,engineeringComplete:boolean,checkpoint=false):void {
    if (this.stopped) return;
    this.earnedCheckpoint=checkpoint;
    this.mission.armAfterEngineeringComplete(activity,engineeringComplete);
    if(checkpoint&&engineeringComplete&&activity==='venus_portal_1'){
      this.mission.reserveEarnedCheckpoint(activity);this.receipts.reserveEarnedCheckpoint();
    }
  }
  request(activity:string,occupied:number|undefined,destination:number|undefined):void {
    if (this.stopped) return;
    this.receipts.request(activity,occupied,destination);
    this.mission.reserveFromNativeRequest(activity,occupied ?? -1,destination);
  }
  cancel():void {if(!this.earnedCheckpoint){this.receipts.cancel();this.mission.cancelNativeRequest();}}
  /** Called with parsed hint, while previous occupied value still belongs to old area. */
  occupiedRefresh(activity:string,previous:number|undefined,hinted:number|undefined):void {
    if (this.stopped) return;
    if (activity!=='venus_portal_1' || (previous===7 && hinted!==undefined && hinted!==7 && hinted!==5)) {this.stop();return;}
    this.activity=activity;
    if (hinted!==undefined) this.occupied=hinted;
    if (previous===5 && hinted!==undefined && hinted!==5) {this.stop();return;}
    this.receipts.occupiedRefresh(activity,previous,hinted,`${this.lifetime}/owner5`);
  }
  registrySent(activity:string,occupied:number|undefined):void {
    if (this.stopped) return;
    this.activity=activity;this.occupied=occupied;
    this.receipts.registrySent(activity,occupied,this.receipts.lifetime);
  }
  observe(payload:Buffer,activity:string,occupied:number|undefined):void {
    if (this.stopped) return;
    this.activity=activity;this.occupied=occupied;
    this.receipts.observe(payload,activity,occupied,this.receipts.lifetime);
    if(occupied===5&&!this.receipts.complete&&this.diagnosticCount++<6)
      this.log(`D1A_STRIKE_DIG_SITE_BINDING_WAIT lifetime=${this.receipts.lifetime} missing=${this.receipts.missing.join(',')} bytes=${payload.length} payload=${payload.subarray(0,4096).toString('hex')}`);
  }
  incident(payload:Buffer,activity:string,occupied:number|undefined):void {
    if (!this.stopped && this.receipts.lifetime)
      this.mission.incident(payload,activity,occupied ?? -1,this.receipts.lifetime);
  }
  /** For the generic owner registry merge; never emits placement or invents a receipt. */
  refreshState(occupied:number) {
    if (this.stopped) return undefined;
    const state=this.mission.refreshState(this.receipts.lifetime ?? '',occupied);
    return {objectiveActive:this.mission.objectiveActive,occupied,
      owner5Ready:this.receipts.complete && !!state,allocatedSquads:state?.allocatedSquads ?? []};
  }
  stop():void {this.stopped=true;this.receipts.stop();this.mission.stop();}
}
