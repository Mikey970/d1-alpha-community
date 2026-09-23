/** Occupied region and registry must agree before calling observe. Native
 * transition completion can release delivery immediately. A later preload
 * must not keep postponing the already occupied area's initialization. */
export class Chapter2AreaReady {
  private area:number|undefined;
  private applied=false;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private stopped=false;
  constructor(private readonly apply:(slice:number)=>void){}
  observe(slice:number,transitionComplete=false):void {
    if(this.stopped)return;
    if(slice!==this.area){this.cancel();this.area=slice;this.applied=false;}
    if(this.applied)return;
    if(transitionComplete){this.cancel();this.applied=true;this.apply(slice);return;}
    if(this.timer)return;
    this.cancel();
    this.timer=setTimeout(()=>{this.timer=undefined;if(this.stopped||this.area!==slice)return;
      this.applied=true;this.apply(slice);},10000);
  }
  leave():void {this.cancel();this.area=undefined;this.applied=false;}
  stop():void {this.stopped=true;this.leave();}
  private cancel():void {if(this.timer)clearTimeout(this.timer);this.timer=undefined;}
}
