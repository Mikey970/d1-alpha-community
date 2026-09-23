/** Analysis-only r429 integration helper. A receipt is binding evidence, not alive/terrain proof. */
import {decodeStrikeSense} from './strike-squad-sense';
const PRIVATE=0x5de7d8e2;
export class DigSiteOwnerReceipts {
  private requested=false;
  private earnedCheckpoint=false;
  reserveEarnedCheckpoint(){if(!this.stopped){this.earnedCheckpoint=true;this.requested=true;}}
  private token:string|undefined;
  private applied=false;
  private ready=false;
  private stopped=false;
  private seen=new Set<string>();
  constructor(private readonly onReady:(token:string)=>void) {}
  get lifetime():string|undefined{return this.token;}
  get complete():boolean{return this.ready;}
  get missing():string[]{return ['3/0',...Array.from({length:12},(_,i)=>`1/${i+1}`)].filter(k=>!this.seen.has(k));}
  /** Only pass the strict requestedStrikeBubble result, before currentSlice changes. */
  request(activity:string,occupied:number|undefined,destination:number|undefined):void {
    if(!this.stopped&&activity==='venus_portal_1'&&occupied===7&&destination===5)this.requested=true;
  }
  cancel():void{if(!this.token)this.requested=false;}
  /** Caller invokes after actual parsed occupied-refresh5. token is local lifetime scope, not a wire generation. */
  occupiedRefresh(activity:string,previous:number|undefined,hinted:number|undefined,token:string):void {
    if(this.stopped)return;
    if(this.token&&hinted!==undefined&&hinted!==5){this.stop();return;}
    if(this.token)return; // Same-slice refresh must not erase receipts or create another lifetime.
    if(activity!=='venus_portal_1'||(previous!==7&&!this.earnedCheckpoint)||hinted!==5||!this.requested||!token.trim())return;
    this.token=token;
  }
  /** Invoke only after pushSensorAuthApply has actually sent this owner5 registry. */
  registrySent(activity:string,occupied:number|undefined,token:string|undefined):void {
    if(!this.stopped&&activity==='venus_portal_1'&&occupied===5&&token&&token===this.token)this.applied=true;
  }
  observe(payload:Buffer,activity:string,occupied:number|undefined,token:string|undefined):void {
    if(this.stopped||this.ready||!this.applied||activity!=='venus_portal_1'||occupied!==5||!token||token!==this.token)return;
    const packet=decodeStrikeSense(payload);if(!packet)return;
    for(const row of packet.rows){
      if(row.bundle!==PRIVATE||!Number.isSafeInteger(row.sequence)||row.sequence<1)continue;
      if((row.type===3&&row.index===0)||(row.type===1&&row.index>=1&&row.index<=12))this.seen.add(`${row.type}/${row.index}`);
    }
    if(!this.missing.length){this.ready=true;this.onReady(token);}
  }
  stop():void{this.stopped=true;this.requested=false;this.token=undefined;this.applied=false;this.seen.clear();}
}
