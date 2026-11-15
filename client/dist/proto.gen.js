// 由 server/tools/protogen 根据 proto/messages.json 生成，请勿手改。





















































































































































// 栏位的预设值表（fillDefaults 用）：i 数字、s 字串、b 布林、a 阵列、T:型别、A:型别阵列
const SCHEMA                                     = {
  CharSummary: [["id","i"],["name","s"],["sprite","i"],["face","i"],["level","i"],["hp","i"],["atk","i"],["def","i"],["agi","i"],["charm","i"],["dp","i"],["attrs","a"],["logins","i"],["hometown","i"],["online","b"],["background","b"],["lineId","i"]],
  LineInfo: [["id","i"],["name","s"],["online","i"]],
  ServerGroup: [["name","s"],["lines","A:LineInfo"]],
  ObjInfo: [["id","i"],["kind","s"],["name","s"],["sprite","i"],["x","i"],["y","i"],["dir","i"],["level","i"],["leader","b"],["battle","i"],["help","b"],["action","i"],["family","s"],["trade","b"],["vendor","s"],["mind","i"]],
  NpcPos: [["name","s"],["x","i"],["y","i"]],
  VendorEntry: [["index","i"],["kind","i"],["slot","i"],["price","i"],["name","s"],["pile","i"],["image","i"],["level","i"],["sprite","i"]],
  BattleFighter: [["slot","i"],["name","s"],["sprite","i"],["level","i"],["hp","i"],["maxHp","i"],["mp","i"],["maxMp","i"],["rideName","s"],["rideLevel","i"],["rideHp","i"],["rideMaxHp","i"],["fallSprite","i"],["ownerSlot","i"],["bagSlot","i"],["status","i"],["defenseBoost","i"],["defenseTurns","i"]],
  InvItem: [["slot","i"],["id","i"],["name","s"],["image","i"],["memo","s"],["level","i"],["pile","i"],["type","i"],["field","i"],["target","i"],["usable","b"],["equip","i"],["params","s"],["damage","s"],["magic","s"],["magicMemo","s"],["magicMp","i"],["magicField","i"],["magicTarget","i"],["magicDead","b"],["magicFunc","s"],["magicOption","s"],["flags","i"],["alch","s"],["merged","b"],["jigsaw","s"]],
  BattleEvent: [["actor","i"],["kind","s"],["target","i"],["result","s"],["damage","i"],["hp","i"],["dead","b"],["ok","b"],["skill","s"],["status","i"],["guardian","i"],["combo","b"],["coattack","i"],["actorHp","i"],["mpDamage","i"],["guarded","b"],["petDamage","i"],["rideHp","i"],["fall","b"],["effect","i"],["actorMp","i"],["shoot","i"],["fly","i"],["name","s"],["sprite","i"],["level","i"],["maxHp","i"],["att","s"],["ownerSlot","i"],["bagSlot","i"],["stat","i"],["statVal","i"],["statTurns","i"]],
  ShopItem: [["name","s"],["level","i"],["price","i"],["image","i"],["info","s"],["sealed","b"],["slot","i"],["pile","i"],["fame","i"]],
  PetSkill: [["slot","i"],["id","i"],["name","s"],["memo","s"],["field","i"],["target","i"],["func","s"],["option","s"]],
  PetInfo: [["slot","i"],["name","s"],["freeName","s"],["sprite","i"],["level","i"],["exp","i"],["nextExp","i"],["hp","i"],["maxHp","i"],["atk","i"],["def","i"],["agi","i"],["loyalty","i"],["attrs","a"],["trans","i"],["maxSkill","i"],["skills","A:PetSkill"],["state","s"],["canRename","b"],["rideable","b"],["items","A:InvItem"],["guard","b"],["ext","T:PetExt"],["rideInfo","s"]],
  PetExt: [["rank","i"],["getLevel","i"],["enemyId","i"],["alloc","a"],["std","a"],["grow","a"],["real","a"],["init","a"],["resist","a"],["critical","i"],["counter","i"],["rare","i"],["vai","i"],["magic","a"]],
  GmItem: [["cmd","s"],["name","s"],["group","s"],["args","a"],["kinds","a"],["defaults","a"],["hint","s"]],
  GmEntry: [["id","i"],["name","s"],["info","s"],["image","i"]],
  QuestEntry: [["id","i"],["name","s"],["state","s"],["hint","s"]],
  AddressEntry: [["slot","i"],["used","b"],["name","s"],["level","i"],["dp","i"],["online","i"],["face","i"],["trans","i"]],
  PetResult: [["slot","i"],["name","s"],["exp","i"],["levelUp","i"],["level","i"]],
  Flags: [["flags","i"]],
  GmMenu: [["items","A:GmItem"]],
  GmList: [["kind","s"],["entries","A:GmEntry"]],
  QuestLog: [["quests","A:QuestEntry"],["available","A:QuestEntry"]],
  GmDetail: [["kind","s"],["id","i"],["image","i"],["lines","a"]],
  DuelResult: [["delta","i"],["dp","i"]],
  FamilyMsg: [["text","s"]],
  FamilyStatus: [["index","i"],["name","s"],["duty","i"],["channel","i"],["sprite","i"]],
  ObjFamily: [["id","i"],["family","s"]],
  AddressBook: [["entries","A:AddressEntry"]],
  AddressUpdate: [["entries","A:AddressEntry"]],
  MailRecv: [["index","i"],["date","s"],["text","s"],["petSprite","i"],["petLevel","i"],["petName","s"],["itemImage","i"]],
  ObjAction: [["id","i"],["action","i"]],
  ObjMind: [["id","i"],["icon","i"]],
  TradeOpen: [["id","i"],["name","s"]],
  TradeItem: [["slot","i"],["count","i"],["items","A:InvItem"]],
  TradeGold: [["amount","i"]],
  TradePet: [["pets","A:PetInfo"]],
  TradeState: [["state","s"]],
  TradeClose: [],
  PartyResult: [["request","i"],["ok","b"]],
  PartyMember: [["slot","i"],["used","b"],["id","i"],["level","i"],["maxHp","i"],["hp","i"],["mp","i"],["name","s"]],
  ObjMark: [["id","i"],["leader","b"],["battle","i"],["help","b"],["trade","b"],["vendor","s"]],
  VendorSetup: [["entries","A:VendorEntry"]],
  VendorList: [["seller","s"],["title","s"],["entries","A:VendorEntry"]],
  VendorClose: [],
  VendorDetail: [["index","i"],["kind","i"],["item","T:InvItem"],["pet","T:PetInfo"]],
  Sound: [["x","i"],["y","i"],["se","i"]],
  HelpFlag: [["on","b"]],
  BattleJoin: [["fighters","A:BattleFighter"],["resetPets","b"]],
  Hello: [["version","s"],["serverTime","i"],["minimapReveal","b"]],
  PetSkillResult: [["ok","b"],["pet","i"],["skill","i"]],
  Error: [["code","s"],["message","s"]],
  AuthResult: [["ok","b"],["message","s"]],
  WorldReady: [["resumed","b"]],
  LobbyReady: [],
  Session: [["token","s"],["resumed","b"],["inWorld","b"]],
  AutoPlayState: [["canEncounter","b"],["encounter","b"],["autoBattle","b"],["quick","b"],["paused","b"],["reason","s"]],
  AccountInfo: [["account","s"],["created","s"],["chars","i"],["hasSecret","b"]],
  AccountResult: [["ok","b"],["message","s"]],
  ServerList: [["groups","A:ServerGroup"]],
  LineSelected: [["id","i"],["name","s"]],
  CharListResult: [["chars","A:CharSummary"],["maxChars","i"]],
  CharCreateResult: [["ok","b"],["message","s"],["id","i"]],
  Self: [["id","i"],["name","s"],["sprite","i"]],
  Status: [["name","s"],["face","i"],["level","i"],["exp","i"],["nextExp","i"],["hp","i"],["maxHp","i"],["mp","i"],["maxMp","i"],["atk","i"],["def","i"],["agi","i"],["charm","i"],["dp","i"],["vital","i"],["str","i"],["tgh","i"],["dex","i"],["attrs","a"],["hometown","i"],["trans","i"],["points","i"],["detail","a"]],
  EnterFloor: [["floor","i"],["name","s"],["palette","i"],["width","i"],["height","i"],["x","i"],["y","i"],["dir","i"],["step","i"],["mapVer","s"]],
  MapData: [["floor","i"],["x1","i"],["y1","i"],["x2","i"],["y2","i"],["tiles","a"],["objs","a"],["walk","s"],["ver","s"]],
  NpcList: [["floor","i"],["npcs","A:NpcPos"]],
  PosCorrect: [["x","i"],["y","i"],["dir","i"]],
  ObjAppear: [["objs","A:ObjInfo"]],
  ObjDisappear: [["ids","a"]],
  ObjMove: [["id","i"],["x","i"],["y","i"],["dir","i"]],
  ObjTurn: [["id","i"],["dir","i"]],
  ObjSprite: [["id","i"],["sprite","i"]],
  NpcTalk: [["id","i"],["name","s"],["text","s"],["window","b"]],
  NpcWindow: [["id","i"],["kind","s"],["buttons","i"],["seq","i"],["text","s"]],
  ShopWindow: [["id","i"],["seq","i"],["mode","s"],["title","s"],["msg","s"],["main","s"],["what","s"],["level","s"],["realy","s"],["full","s"],["stone","s"],["sellOnly","b"],["maxGold","i"],["fame","i"],["rest","i"],["items","A:ShopItem"]],
  ChatMsg: [["channel","s"],["fromId","i"],["from","s"],["text","s"],["color","i"]],
  Pong: [["seq","i"],["serverTime","i"]],
  BattleStart: [["field","i"],["mySlot","i"],["turnTime","i"],["surprise","i"],["fighters","A:BattleFighter"],["pvp","b"],["event","b"],["watch","b"],["speed","i"],["resume","b"],["turn","i"],["submitted","b"],["petSubmitted","b"],["submittedPets","a"]],
  BattleTurn: [["turn","i"],["events","A:BattleEvent"]],
  BattleEnd: [["result","s"],["gold","i"],["exp","i"],["levelUp","i"],["level","i"],["items","a"],["pets","A:PetResult"]],
  Pets: [["battle","i"],["ride","i"],["pets","A:PetInfo"]],
  Inventory: [["gold","i"],["items","A:InvItem"]],
};

/** 把服务端省略的零值补回去（就地修改，回传同一个物件）：收到的消息每个栏位都在，和服务端没省略时一样 */
export function fillDefaults   (o   , type         )    {
  const s = SCHEMA[type ?? (o                 ).t];
  if (!s || !o || typeof o !== "object") return o;
  const r = o                           ;
  for (const [k, kind] of s) {
    const v = r[k];
    switch (kind) {
      case "i": if (v === undefined) r[k] = 0; break;
      case "s": if (v === undefined) r[k] = ""; break;
      case "b": if (v === undefined) r[k] = false; break;
      case "a": if (v === undefined || v === null) r[k] = []; break;
      default:
        if (kind.startsWith("A:")) { if (v === undefined || v === null) r[k] = []; else for (const x of v             ) fillDefaults(x, kind.slice(2)); }
        else if (kind.startsWith("T:") && v) fillDefaults(v, kind.slice(2));
    }
  }
  return o;
}
