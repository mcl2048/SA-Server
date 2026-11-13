package main

import (
	"gopkg.in/yaml.v3"
	"math"
	"testing"
)

func TestGameplayConfigDefaultsAndOverrides(t *testing.T) {
	cfg := defaultConfig()
	r, err := cfg.Rules.world()
	if err != nil {
		t.Fatal(err)
	}
	if r.CharMaxLevel != 140 || r.PetMaxLevel != 140 || r.CharMaxTrans != 6 || r.PetMaxTrans != 2 || r.BattleGoldRate != 0 {
		t.Fatalf("legacy defaults %+v", r)
	}
	if err := yaml.Unmarshal([]byte("rules:\n  charMaxLevel: 300\n  petMaxLevel: 250\n  charMaxTrans: 12\n  petMaxTrans: 8\n  battleGoldRate: 1.5\n"), &cfg); err != nil {
		t.Fatal(err)
	}
	r, err = cfg.Rules.world()
	if err != nil {
		t.Fatal(err)
	}
	if r.CharMaxLevel != 300 || r.PetMaxLevel != 250 || r.CharMaxTrans != 12 || r.PetMaxTrans != 8 || r.BattleGoldRate != 1.5 || r.ExpRate != 1 {
		t.Fatalf("override %+v", r)
	}
	if err := yaml.Unmarshal([]byte("rules:\n  charMaxTrans: 0\n  petMaxTrans: 0\n  battleGoldRate: 0\n"), &cfg); err != nil {
		t.Fatal(err)
	}
	r, err = cfg.Rules.world()
	if err != nil || r.CharMaxTrans != 0 || r.PetMaxTrans != 0 || r.BattleGoldRate != 0 || r.CharMaxLevel != 300 {
		t.Fatalf("zero override %+v %v", r, err)
	}
}

func TestGameplayConfigRejectsInvalidLimitsAndRates(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*RulesConfig)
	}{
		{"charzero", func(c *RulesConfig) { c.CharMaxLevel = 0 }}, {"charlarge", func(c *RulesConfig) { c.CharMaxLevel = 1001 }},
		{"petnegative", func(c *RulesConfig) { c.PetMaxLevel = -1 }}, {"petlarge", func(c *RulesConfig) { c.PetMaxLevel = 1001 }},
		{"chartransnegative", func(c *RulesConfig) { c.CharMaxTrans = -1 }}, {"pettranslarge", func(c *RulesConfig) { c.PetMaxTrans = 101 }},
		{"goldnegative", func(c *RulesConfig) { c.BattleGoldRate = -.1 }}, {"goldnan", func(c *RulesConfig) { c.BattleGoldRate = math.NaN() }},
		{"goldinf", func(c *RulesConfig) { c.BattleGoldRate = math.Inf(1) }}, {"goldlarge", func(c *RulesConfig) { c.BattleGoldRate = 1001 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := defaultConfig().Rules
			tc.change(&c)
			if _, err := c.world(); err == nil {
				t.Fatal("invalid rules accepted")
			}
		})
	}
}
