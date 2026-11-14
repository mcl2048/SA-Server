import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAi } from '../src/ai.ts';
import { smartChoose, AiMemory, type SmartContext, type SmartFighter } from '../src/aismart.ts';
import type { InvItem, PetSkill } from '../src/proto.gen.ts';

const fighter = (slot: number, hp = 500): SmartFighter => ({ slot, hp, maxHp: 500, mp: 80, name: `f${slot}`, level: 1, status: 0, gone: false });
const skill = (slot: number, id: number, func: string, target = 1): PetSkill => ({ slot, id, func, target, name: func, memo: '', field: 0, option: '' });
function context(): SmartContext {
  return { me: 0, first: true, fighters: new Map([fighter(0), fighter(5), fighter(15, 80)].map(f => [f.slot, f])),
    inv: [], myAtk: 100, pet: { name: 'pet', atk: 100, skills: [skill(0, 1, 'PETSKILL_NormalAttack'), skill(1, 2, 'PETSKILL_NormalGuard', 0)] },
    capturePlace: false, noEscape: true, mem: new AiMemory('legality-test') };
}
function spell(mp: number): InvItem {
  return { slot: 0, id: 1, name: '装备', image: 0, memo: '', level: 1, pile: 1, type: 0, field: 0, target: 0, usable: false, equip: 0,
    params: '', damage: '', magic: '攻击精灵', magicMemo: '', magicMp: mp, magicField: 0, magicTarget: 9, magicDead: false,
    magicFunc: 'MAGIC_AttMagic', magicOption: '', flags: 0, alch: '', merged: false, jigsaw: '' };
}

test('AI uses the server-reported spell cost without applying another discount', () => {
  const c = context(), s = defaultAi();
  c.inv = [spell(100)];
  s.magic = false;
  s.first = { kind: 'magic', name: '攻击精灵', target: 'enemy' };
  assert.equal(smartChoose(s, c).kind, 'attack', '80 MP cannot cast a spell whose reported cost is 100 MP');
  c.inv = [spell(80)];
  const affordable = smartChoose(s, c);
  assert.equal(affordable.kind, 'magic');
  assert.equal(affordable.item, 0);
  assert.equal(affordable.target, 15);
});

test('capture protects its target even when the pet has a fixed attack plan', () => {
  const c = context(), s = defaultAi();
  c.capturePlace = true;
  s.capture = true;
  s.petFirst = { kind: 'attack', name: '', target: 'enemy' };
  let cmd = smartChoose(s, c);
  assert.equal(cmd.kind, 'capture');
  assert.deepEqual(cmd.pet, [1, 5], 'without mercy the pet guards rather than killing the capture target');
  c.pet!.skills.push(skill(4, 999, 'PETSKILL_ShowMercy'));
  cmd = smartChoose(s, c);
  assert.equal(cmd.kind, 'capture');
  assert.deepEqual(cmd.pet, [4, 15], 'mercy may safely help the capture');
});

test('AI does not submit map-only recovery items in battle', () => {
  const c = context(), s = defaultAi();
  c.fighters.get(0)!.hp = 1;
  c.inv = [{ ...spell(0), slot: 9, name: '地图补血', memo: '回复耐久力100', magic: '', field: 2, usable: true }];
  s.escape = false;
  assert.equal(smartChoose(s, c).kind, 'attack');
});

test('group resurrection sends the side target accepted by the command boundary', () => {
  const c = context(), s = defaultAi();
  c.fighters.set(1, fighter(1, 0));
  c.inv = [{ ...spell(10), magic: '复活精灵', magicFunc: 'MAGIC_Ressurect', magicTarget: 2, magicDead: true }];
  const cmd = smartChoose(s, c);
  assert.equal(cmd.kind, 'magic');
  assert.equal(cmd.target, 20, 'whole own-side magic cannot send a single dead slot');
});

test('MP recovery supports both native healing spell functions before emergency fallback attacks', () => {
  for (const magicFunc of ['MAGIC_Recovery', 'MAGIC_OtherRecovery']) {
    const c = context(), s = defaultAi(); c.fighters.get(0)!.hp = 50; c.fighters.get(0)!.mp = 5;
    c.inv = [{...spell(10), magic: '滋润的精灵', magicFunc, magicTarget: 1, magicOption: '100'},
      {...spell(0), slot: 9, magic: '', usable: true, memo: '回复气力100', name: '气力恢复药'}];
    const cmd = smartChoose(s, c);
    assert.equal(cmd.kind, 'item', `${magicFunc} must trigger recovery when its authoritative MP cost is unaffordable`);
    assert.equal(cmd.item, 9); assert.equal(cmd.target, 0);
  }
});

test('resurrection items cannot masquerade as MP recovery by mentioning 气绝回复', () => {
  const c = context(), s = defaultAi(); c.fighters.get(0)!.mp = 5;
  c.inv = [{...spell(10), magic: '滋润的精灵', magicFunc: 'MAGIC_Recovery', magicTarget: 1, magicOption: '100'},
    {...spell(0), slot: 9, magic: '', usable: true, memo: '气绝回复，恢复耐力', name: '复活药'}];
  assert.equal(smartChoose(s, c).kind, 'attack', 'a living caster must not consume revival medicine as MP');
});

test('AI has no offensive intent when every enemy is knocked out or absent', () => {
  const c = context(), s = defaultAi(); c.fighters.get(15)!.hp = 0;
  const absent = fighter(16); absent.gone = true; c.fighters.set(16, absent);
  const cmd = smartChoose(s, c);
  assert.equal(cmd.kind, 'guard'); assert.equal(cmd.target, -1); assert.deepEqual(cmd.pet, [-1, -1]);
});
