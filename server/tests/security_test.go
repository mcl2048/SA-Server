package tests

import (
	"strings"
	"testing"

	"sa/server/internal/proto"
	"sa/server/internal/server"
)

// GM 名单里的名字别人注册不走；密码太短不行；连错 5 次密码会锁住。
func TestReservedGMAndLockout(t *testing.T) {
	url := startServerWith(t, func(s *server.Server) { s.GMs = map[string]bool{"boss": true} })
	c := dial(t, url)
	c.send(&proto.Register{Account: "Boss", Password: testPw, Secret: testSecret})
	if r := c.expect("AuthResult"); r["ok"] != false || !strings.Contains(r["message"].(string), "管理员") {
		t.Fatalf("GM 名应保留：%v", r)
	}
	c.send(&proto.Register{Account: "boss2", Password: "short"}) // 不是 32 位十六进制（客户端没算 MD5）
	if r := c.expect("AuthResult"); r["ok"] != false {
		t.Fatalf("不是 MD5 的密码不应注册成功：%v", r)
	}
	c.send(&proto.Register{Account: "victim", Password: testPw, Secret: testSecret})
	c.expect("AuthResult")
	c.expect("ServerList")
	g := dial(t, url) // 猜密码的人
	for i := 0; i < server.AuthFailLimit; i++ {
		g.send(&proto.Login{Account: "victim", Password: "00000000000000000000000000000000"})
		g.expect("AuthResult")
	}
	g.send(&proto.Login{Account: "victim", Password: testPw})
	if r := g.expect("AuthResult"); r["ok"] != false || !strings.Contains(r["message"].(string), "错误次数太多") {
		t.Fatalf("连错 %d 次后连对的密码也要先锁住：%v", server.AuthFailLimit, r)
	}
}

// 接管后角色仍在世界，原始 CharDelete 也不能绕过阶段限制删除在线角色。
func TestCannotDeleteOnlineChar(t *testing.T) {
	url := startServer(t)
	a := dial(t, url)
	a.send(&proto.Register{Account: "twice", Password: testPw, Secret: testSecret})
	a.expect("AuthResult")
	a.expect("ServerList")
	a.send(&proto.SelectLine{ID: 1})
	a.expect("LineSelected")
	a.send(validCreate("在线的"))
	r := a.expect("CharCreateResult")
	id := int(r["id"].(float64))
	a.send(&proto.CharEnter{ID: id})
	a.expect("EnterFloor")

	b := dial(t, url)
	b.send(&proto.Login{Account: "twice", Password: testPw})
	if auth := b.expect("AuthResult"); auth["ok"] != true {
		t.Fatalf("takeover login failed: %v", auth)
	}
	if marker := b.expect("Session"); marker["inWorld"] == true {
		t.Fatalf("password login took over character: %v", marker)
	}
	b.expect("ServerList")
	b.send(&proto.SelectLine{ID: 2})
	b.expect("LineSelected")
	b.send(&proto.CharDelete{ID: id})
	if e := b.expect("Error"); e["code"] != "in_use" {
		t.Fatalf("lobby deleted online actor: %v", e)
	}
	a.send(&proto.QuestReq{})
	a.expect("QuestLog")
	b.send(&proto.CharEnter{ID: id})
	if self := b.expect("Self"); num(self, "id") != id {
		t.Fatalf("takeover changed identity: %v", self)
	}
	b.expect("EnterFloor")
	if !a.closed() {
		t.Fatal("new account controller did not replace old connection")
	}
	b.send(&proto.CharDelete{ID: id})
	if e := b.expect("Error"); e["code"] != "in_world" {
		t.Fatalf("在线的角色不应能删：%v", e)
	}
	b.send(&proto.QuestReq{})
	b.expect("QuestLog") // The rejected deletion left the live character usable.
	b.send(&proto.Logout{})
	b.expect("Session")
	b.send(&proto.Login{Account: "twice", Password: testPw})
	if auth := b.expect("AuthResult"); auth["ok"] != true {
		t.Fatalf("relogin failed: %v", auth)
	}
	b.expect("Session")
	b.expect("ServerList")
	b.send(&proto.SelectLine{ID: 2})
	b.expect("LineSelected")
	b.send(&proto.CharList{})
	list := b.expect("CharListResult")
	chars, ok := list["chars"].([]any)
	if !ok || len(chars) != 1 {
		t.Fatalf("online deletion removed persisted character: %v", list)
	}
	character := chars[0].(map[string]any)
	if num(character, "id") != id || character["name"] != "在线的" {
		t.Fatalf("online deletion changed persisted identity: %v", character)
	}
	// 名字里不能有 # 或零宽字符
	for _, name := range []string{"名#1", "名\u200b1"} {
		b.send(validCreate(name))
		if r := b.expect("CharCreateResult"); r["ok"] != false {
			t.Fatalf("包含 # 或零宽字符的名字不应建成 %q: %v", name, r)
		}
	}
}

// 别的账号送 CharEnter 带着不属于自己的角色编号：不能把那个角色的连线踢下线。
func TestCharEnterOtherAccountCannotKick(t *testing.T) {
	url := startServer(t)
	a := dial(t, url)
	a.send(&proto.Register{Account: "owner1", Password: testPw, Secret: testSecret})
	a.expect("AuthResult")
	a.expect("ServerList")
	a.send(&proto.SelectLine{ID: 1})
	a.expect("LineSelected")
	a.send(validCreate("主人"))
	id := int(a.expect("CharCreateResult")["id"].(float64))
	a.send(&proto.CharEnter{ID: id})
	a.expect("EnterFloor")

	b := dial(t, url)
	b.send(&proto.Register{Account: "intruder", Password: testPw, Secret: testSecret})
	b.expect("AuthResult")
	b.expect("ServerList")
	b.send(&proto.SelectLine{ID: 1})
	b.expect("LineSelected")
	b.send(&proto.CharEnter{ID: id})
	if e := b.expect("Error"); e["code"] != "not_found" {
		t.Fatalf("别人的角色应回 not_found：%v", e)
	}
	// 主人还在线：要任务日志还收得到
	a.send(&proto.QuestReq{})
	a.expect("QuestLog")
}
