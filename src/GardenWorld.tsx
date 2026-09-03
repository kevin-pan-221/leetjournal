import {useEffect,useRef} from 'react'
import {Application,Assets,Container,Graphics,Sprite} from 'pixi.js'
import type {GardenVitality} from './api'

type Cloud={node:Container;x:number;y:number;speed:number;scale:number}
type Bird={node:Graphics;x:number;y:number;speed:number;phase:number}

export function GardenWorld({asset,vitality,animate}:{asset:string;vitality:GardenVitality;animate:boolean}){
 const host=useRef<HTMLDivElement>(null)
 const animateRef=useRef(animate)
 useEffect(()=>{animateRef.current=animate},[animate])
 useEffect(()=>{let disposed=false,observer:ResizeObserver|undefined,app:Application|undefined
  const start=async()=>{if(!host.current)return;const pixi=new Application();app=pixi
   await pixi.init({resizeTo:host.current,backgroundAlpha:0,antialias:true,autoDensity:true,resolution:Math.min(devicePixelRatio,2),preference:'webgl'})
   if(disposed){pixi.stop();return}host.current.appendChild(pixi.canvas)
   const texture=await Assets.load(asset);if(disposed){pixi.stop();return}
   const background=new Sprite(texture),world=new Container(),sky=new Container(),weather=new Container(),water=new Container(),foreground=new Container()
   pixi.stage.addChild(background,world);world.addChild(sky,weather,water,foreground)
   const clouds:Cloud[]=[[.06,.13,.0068,1.08],[.52,.23,.0044,.78],[.8,.08,.0031,.58]].map(([x,y,speed,scale])=>{const node=new Container();[[0,16,78,23],[42,0,70,43],[92,14,76,27]].forEach(([cx,cy,w,h])=>node.addChild(new Graphics().ellipse(cx,cy,w/2,h/2).fill({color:0xffffff,alpha:.58})));sky.addChild(node);return{node,x,y,speed,scale}})
   const waterMask=new Graphics().poly([.43,0,.57,0,.69,.4,.95,1,.08,1,.34,.39]).fill(0xffffff);water.addChild(waterMask);water.mask=waterMask
   const ripples=[.26,.43,.61,.78,.9].map((y,i)=>{const line=new Graphics().roundRect(-170,0,280,3.2,2).fill({color:0xe8fcff,alpha:.68-i*.035});water.addChild(line);return{line,y,phase:i*.21}})
   const breeze=[0,.47].map((phase,i)=>{const g=new Graphics().moveTo(0,0).bezierCurveTo(75,-20,155,22,260,-4).stroke({color:0xf6ffdc,width:1.6,alpha:.32});foreground.addChild(g);return{g,phase,y:.72+i*.1}})
   const birds:Bird[]=[0,.28,.54].map((phase,i)=>{const node=new Graphics().moveTo(0,6).quadraticCurveTo(7,-1,14,6).moveTo(14,6).quadraticCurveTo(21,-1,28,6).stroke({color:0x304229,width:1.7,alpha:.76});weather.addChild(node);return{node,x:-.15-i*.05,y:.17+i*.025,speed:.0032-i*.00025,phase}})
   const seeds=Array.from({length:10},(_,i)=>{const node=new Graphics().ellipse(0,0,2.1,4.4).fill({color:0xfff6c8,alpha:.86});foreground.addChild(node);return{node,x:.18+(i*.091)%.76,y:1+(i%3)*.12,phase:i*.73,speed:.00015+(i%3)*.00003}})
   const grass=Array.from({length:18},(_,i)=>{const blade=new Graphics().moveTo(0,18).quadraticCurveTo(2,-2,5,0).stroke({color:i%2?0x59733f:0x789252,width:2,alpha:.72});blade.pivot.set(0,18);foreground.addChild(blade);return{blade,x:.04+(i*.057)% .93,y:.83+(i%4)*.045,phase:i*.61}})
   const treeGlow=new Graphics().ellipse(0,0,68,50).fill({color:0xb4d36f,alpha:.13});weather.addChild(treeGlow)
   const butterflies=Array.from({length:4},(_,i)=>{const node=new Graphics().ellipse(-3,0,4,2.5).ellipse(3,0,4,2.5).fill({color:i%2?0xffe49a:0xf8f3d1,alpha:.9});weather.addChild(node);return{node,x:.31+i*.14,y:.52+(i%2)*.1,phase:i*1.7}})
   const rate=vitality==='thriving'?1:vitality==='calm'?.72:.4,showBirds=vitality!=='needsCare'
   const layout=()=>{const w=pixi.screen.width,h=pixi.screen.height,scale=Math.max(w/texture.width,h/texture.height);background.scale.set(scale);background.x=(w-texture.width*scale)/2;background.y=(h-texture.height*scale)/2;waterMask.scale.set(w,h);clouds.forEach(c=>{c.node.scale.set(c.scale*Math.max(.8,w/1400));c.node.x=c.x*w;c.node.y=c.y*h});ripples.forEach(r=>r.line.y=r.y*h);breeze.forEach(b=>b.g.y=b.y*h);birds.forEach(b=>{b.node.y=b.y*h;b.node.visible=showBirds});seeds.forEach(s=>s.node.position.set(s.x*w,s.y*h));grass.forEach(g=>g.blade.position.set(g.x*w,g.y*h));treeGlow.position.set(.34*w,.39*h);butterflies.forEach(b=>b.node.position.set(b.x*w,b.y*h))}
   observer=new ResizeObserver(layout);observer.observe(host.current!);layout();let elapsed=0
   pixi.ticker.add(ticker=>{if(!animateRef.current)return;const dt=Math.min(ticker.deltaMS,40);elapsed+=dt
    clouds.forEach(c=>{c.x+=c.speed*dt*.01*rate;if(c.x>1.16)c.x=-.24;c.node.x=c.x*pixi.screen.width;c.node.y=(c.y+Math.sin(elapsed*.00018+c.speed*900)*.006)*pixi.screen.height})
    ripples.forEach(r=>{const cycle=(elapsed*.000075*rate+r.phase)%1;r.line.x=(-.12+cycle*1.2)*pixi.screen.width;r.line.y=(r.y+cycle*.04)*pixi.screen.height;r.line.alpha=Math.sin(cycle*Math.PI)*.82*rate})
    breeze.forEach(b=>{const cycle=(elapsed*.00005*rate+b.phase)%1;b.g.x=(-.25+cycle*1.5)*pixi.screen.width;b.g.alpha=Math.sin(cycle*Math.PI)*.9})
    birds.forEach(b=>{b.x+=b.speed*dt*.01*rate;if(b.x>1.15)b.x=-.18;b.node.x=b.x*pixi.screen.width;b.node.y=(b.y+Math.sin(elapsed*.004+b.phase)*.008)*pixi.screen.height;b.node.rotation=Math.sin(elapsed*.006+b.phase)*.035})
    seeds.forEach(s=>{s.y-=s.speed*dt*rate;if(s.y<-.05){s.y=1.04;s.x=.18+((s.x+.37)%.76)}s.node.x=(s.x+Math.sin(elapsed*.0007+s.phase)*.018)*pixi.screen.width;s.node.y=s.y*pixi.screen.height;s.node.rotation=elapsed*.00025+s.phase})
    grass.forEach(g=>{g.blade.rotation=Math.sin(elapsed*.0022+g.phase)*.14*rate})
    treeGlow.scale.set(1+Math.sin(elapsed*.0015)*.055,1+Math.cos(elapsed*.0015)*.035);treeGlow.alpha=.1+Math.sin(elapsed*.0015)*.045
    butterflies.forEach(b=>{b.node.x=(b.x+Math.sin(elapsed*.00065+b.phase)*.055)*pixi.screen.width;b.node.y=(b.y+Math.cos(elapsed*.0011+b.phase)*.025)*pixi.screen.height;b.node.scale.x=.35+Math.abs(Math.sin(elapsed*.009+b.phase))})
   })
  }
  start().catch(()=>{if(!disposed)host.current?.classList.add('pixi-unavailable')})
  return()=>{disposed=true;observer?.disconnect();app?.stop();app=undefined}
 },[asset,vitality])
 return <div className="pixi-world" ref={host}/>
}
