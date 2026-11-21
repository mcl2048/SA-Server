package proto

import (
	"bytes"
	"os"
	"testing"
)

// The client consumes this exact Go Encode/omitempty fixture through Connection,
// not an idealized object with explicit zero coordinates. Keep both ends honest.
func TestMapTransferWireFixture(t *testing.T) {
	wire, err := Encode(&NpcList{Floor: 817, Npcs: []NpcPos{{Name: "宝箱", X: 6}}, Transfers: []MapTransfer{{X: 2, ToX: 5, ToY: 1, Via: []MapTransferStep{
		{Floor: 817, X: 2, ToFloor: 900},
		{Floor: 900, X: 2, ToFloor: 817, ToX: 5, ToY: 1},
	}}}})
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := os.ReadFile("../../../client/test/testdata/maptransfer-wire.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(wire, bytes.TrimSpace(fixture)) {
		t.Fatalf("client fixture differs from actual Go wire:\n%s", wire)
	}
}
