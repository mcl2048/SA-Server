#!/usr/bin/env python3
"""Audit the actual Go-loaded data; temp Go tool stays inside internal boundary."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[3]
source = r'''package main
import (
 "encoding/json"
 "fmt"
 "os"
 "sort"
 "sa/server/internal/data"
)
type Link struct { Area, Floor int; Name string; X1, Y1, X2, Y2 int }
type EnemyRecord struct { ID, Temp, Min, Max int; Name string; Automatic bool; Explicit int; Links []Link; MinReward, MaxReward int }
func main() {
 g, err := data.Load(os.Args[1]); if err != nil { panic(err) }; d := g.Battle
 ids := make([]int,0,len(d.Enemies)); for id := range d.Enemies { ids=append(ids,id) }; sort.Ints(ids)
 var affected []EnemyRecord
 automatic, zero, fixed, checked, bad, after200, maxAuto := 0,0,0,0,0,0,0
 floors, areas := map[int]bool{}, map[int]bool{}
 for _, id := range ids {
  e := d.Enemies[id]
  if e.Exp != -1 { if e.Exp==0 { zero++ } else { fixed++ }; continue }; automatic++
  if e.LvMax>maxAuto { maxAuto=e.LvMax }
  for lv:=max(1,e.LvMin);lv<=e.LvMax;lv++ { checked++; if data.EnemyExp(e,d.Temps[e.TempNo],lv)<=0 { bad++ } }
  if e.LvMax<=100 { continue }; if e.LvMax>200 {after200++}
  rec:=EnemyRecord{ID:id,Temp:e.TempNo,Min:e.LvMin,Max:e.LvMax,Name:e.Name,Automatic:true,Explicit:e.Exp,MinReward:data.EnemyExp(e,d.Temps[e.TempNo],e.LvMin),MaxReward:data.EnemyExp(e,d.Temps[e.TempNo],e.LvMax)}
  for _, a := range d.Areas {
   if a.ZOrder<=0 || g.Floors[a.Floor]==nil { continue }
   found:=false
   for _, gid := range a.Groups { if gr:=d.Groups[gid];gr!=nil { for _, eid:=range gr.Enemies { if eid==id { found=true } } } }
   if found { rec.Links=append(rec.Links,Link{a.Index,a.Floor,g.Floors[a.Floor].Name,a.X1,a.Y1,a.X2,a.Y2});areas[a.Index]=true;floors[a.Floor]=true }
  }; affected=append(affected,rec)
 }
 cases:=map[string]int{}
 for _, c:=range []struct{id,level int}{{1969,130},{1971,140},{2165,130},{2168,140},{2239,80}} { e:=d.Enemies[c.id];cases[fmt.Sprintf("%d@%d",c.id,c.level)]=data.EnemyExp(e,d.Temps[e.TempNo],c.level) }
 result:=map[string]any{"source":"data.Load(gamedata)","loaded_enemies":len(d.Enemies),"automatic_enemies":automatic,"explicit_zero_enemies":zero,"explicit_other_enemies":fixed,"automatic_level_points_checked":checked,"automatic_level_points_without_reward":bad,"automatic_max_level":maxAuto,"affected_automatic_enemies_crossing_100":len(affected),"affected_automatic_enemies_crossing_200":after200,"referencing_active_areas_on_existing_maps":len(areas),"referencing_existing_maps":len(floors),"reference_scope":"membership references; does not assert every item condition, walking route, or NPC trigger is reachable","representative_rewards":cases,"affected_enemies":affected}
 b,err:=json.MarshalIndent(result,"","  ");if err!=nil{panic(err)};fmt.Println(string(b))
}'''
with tempfile.TemporaryDirectory(prefix="experience-audit-", dir=root / "server/tools") as tmp:
    Path(tmp, "main.go").write_text(source)
    go_bin = os.environ.get("GO_BIN", "/home/coder/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.3.linux-amd64/bin/go")
    proc = subprocess.run([go_bin, "run", str(Path(tmp)), str(root / "gamedata")], cwd=root / "server", check=True, capture_output=True, text=True)
result = json.loads(proc.stdout)
Path(__file__).with_name("data-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "affected_enemies"}, ensure_ascii=False, indent=2))
