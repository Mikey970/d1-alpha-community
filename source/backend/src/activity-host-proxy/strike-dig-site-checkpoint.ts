import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
/** Resume only the user-authorized, evidence-backed r437 checkpoint. */
export class StrikeDigSiteCheckpoint {
  readonly enabled:boolean;
  private issued=false; private completed=false; private arrived=false;
  constructor(path=process.env.D1A_STRIKE_RESUME_PATH) {
    this.enabled=false;
    if(!path)return;
    const proof=JSON.parse(readFileSync(path,'utf8'));
    const log=readFileSync(proof.sourceLog);
    if(proof.activity!==4||proof.character!=='d1a0000000000001'||proof.physicalBubble!==5||
       proof.insertionHash!==721721255||proof.userAuthorizedResume!==true||
       createHash('sha256').update(log).digest('hex')!==proof.sha256||
       !log.includes(Buffer.from('"current":4,"total":4'))||
       !log.includes(Buffer.from('D1A_STRIKE_BUBBLE_ARRIVED slice=5')))throw Error('Invalid earned Dig Site checkpoint');
    this.enabled=true;
  }
  begin(activity:string,occupied:number|undefined){
    if(!this.enabled||this.issued||activity!=='venus_portal_1'||occupied!==16)return false;
    this.issued=true;return true;
  }
  observeOccupied(occupied:number|undefined){if(this.issued&&occupied===5)this.arrived=true;}
  observeTeleport(t:{state:number;request:{a:number;b:number;c:number;d:number}}|undefined){
    if(!this.issued||!t||t.request.a!==2||t.request.b!==40||t.request.c!==721721255||t.request.d!==0)return false;
    if(t.state===3&&!this.completed){this.completed=true;return true;}return false;
  }
  get assignedBubble(){return this.issued&&!this.arrived?5:undefined;}
  membershipRequest(){return this.issued?{completed:this.completed,cookie:2,destination:40,insertionHash:721721255,deinstantiateMask:0}:undefined;}
}
