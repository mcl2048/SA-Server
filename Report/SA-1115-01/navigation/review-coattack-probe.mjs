// Read-only production-class probe: enemy coattack bypasses onTurn's camera
// decorator. This creates no browser/game/server mutation and sends no command.
import {BattleScreen} from '../../../client/src/battle.ts';
import {fillDefaults} from '../../../client/src/proto.gen.ts';
const host={root:'',quick:()=>true,auto:()=>false,serverAuto:()=>true,pets:()=>({pets:[]}),aiMemory:()=>({observe(){},save(){}}),assets:{anim:()=>null},ui:{texts:[],image(){},box(){},text(){},pic(){}},finish(){},send(){},sendPet(){},chat(){}};
const start=fillDefaults({t:'BattleStart',mySlot:0,resume:true,speed:100,fighters:[0,10,15].map(slot=>({slot,hp:100,maxHp:100,mp:20,maxMp:20,sprite:100001,name:`f${slot}`}))});
const screen=new BattleScreen(host,start);
screen.onTurn(fillDefaults({t:'BattleTurn',events:[10,15].map(actor=>({actor,target:0,kind:'attack',result:'damage',hp:80,damage:10,actorHp:100,coattack:1,guardian:-1}))}));
screen.queue[0](100);
console.log(JSON.stringify({cameraSlot:screen.cameraSlot,firstCoattackActor:10,focus:screen.mobileFocus('follow',390,844),expectedFollowActor:'an active member of the attacking group'},null,2));
