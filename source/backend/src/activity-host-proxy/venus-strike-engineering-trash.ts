import {decodeStrikeSense} from './strike-squad-sense';
export type EngineeringTrashSquad = 1|2|3|4;
export const ENGINEERING_TRASH_TASKS = {1:0,2:1,3:2,4:2} as const;
/** Native script26 total8: task0 exact; task1/2 split is an explicit elevation hypothesis. */
export class VenusStrikeEngineeringTrash {
  private loaded=false;
  private registryApplied=false;
  private armed=false;
  private issued=false;
  private stopped=false;
  private readonly receipts=new Set<string>();
  constructor(readonly lifetime:string, private readonly emit:(squad:EngineeringTrashSquad)=>void,
      private readonly log:(message:string)=>void) {
    if(!lifetime.trim())throw Error('Missing Engineering trash lifetime');
  }
  get allocatedSquads():readonly number[]{return this.issued&&!this.stopped ? [1,2,3,4] : [];}
  /** The caller supplies only the actual parseStateRefreshSlice result. */
  occupiedRefresh(activity:string,hinted:number|undefined):void {
    if(this.stopped)return;
    if(activity!=='venus_portal_1'||(this.loaded&&hinted!==undefined&&hinted!==7)){this.stop();return;}
    if(hinted===7)this.loaded=true;
  }
  registrySent(activity:string,occupied:number|undefined):void {
    if(!this.stopped&&this.loaded&&activity==='venus_portal_1'&&occupied===7)this.registryApplied=true;
  }
  /** Called only by authored startEngineeringTrash after verified four-Servitor credit. */
  arm(activity:string,occupied:number|undefined,verifiedServitorKills:number):void {
    if(this.stopped||activity!=='venus_portal_1'||occupied!==7||verifiedServitorKills!==4)return;
    this.armed=true;this.maybeIssue();
  }
  observe(payload:Buffer,activity:string,occupied:number|undefined):void {
    if(this.stopped||this.issued||!this.registryApplied||activity!=='venus_portal_1'||occupied!==7)return;
    const packet=decodeStrikeSense(payload);if(!packet)return;
    for(const row of packet.rows){
      if(row.bundle!==0x97438d09||row.sequence<1)continue;
      if((row.type===3&&row.index===0)||(row.type===1&&row.index>=1&&row.index<=4))
        this.receipts.add(`${row.type}/${row.index}`);
    }
    this.maybeIssue();
  }
  private maybeIssue():void {
    if(this.stopped||this.issued||!this.loaded||!this.registryApplied||!this.armed||this.receipts.size!==5)return;
    this.issued=true; // Reentrant refresh/duplicate receipts cannot issue a second population.
    this.log(`D1A_STRIKE_ENGINEERING_TRASH_SPATIAL_HYPOTHESIS lifetime=${this.lifetime} tasks=0,1,2,2 population=3,3,1,1; lowerFA61 and upperFA62; runtime acceptance pending`);
    for(const squad of [1,2,3,4] as const)this.emit(squad);
  }
  stop():void{this.stopped=true;this.loaded=false;this.registryApplied=false;this.receipts.clear();}
}
