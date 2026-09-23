import {decodeStrikeSense} from './strike-squad-sense';
/** Restores the earned exit only after this visit's actual owner7 bindings/arrival.
 * Caller supplies evidence-backed earned status; no current-run kill credit. */
export class StrikeEarnedBacktrack {
  private registered=false;
  private arrived=false;
  private seen=new Set<string>();
  restored=false;
  registrySent(){this.registered=true;}
  nativeArrival(){this.arrived=true;}
  observe(payload:Buffer){
    if(!this.registered||this.restored)return;
    const packet=decodeStrikeSense(payload);if(!packet)return;
    for(const r of packet.rows)if(r.sequence>=1){
      if(r.bundle===0x97438d09&&((r.type===3&&r.index===0)||(r.type===1&&r.index>=1&&r.index<=4)))
        this.seen.add(`private/${r.type}/${r.index}`);
      if(r.bundle===0x0a302429&&((r.type===3&&r.index===1)||(r.type===4&&r.index===0)))
        this.seen.add(`global/${r.type}/${r.index}`);
    }
  }
  consume(){
    if(this.restored||!this.registered||!this.arrived||
      !['private/3/0','private/1/1','private/1/2','private/1/3','private/1/4','global/3/1','global/4/0'].every(k=>this.seen.has(k)))return false;
    this.restored=true;return true;
  }
}
