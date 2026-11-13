package main

import (
	"gopkg.in/yaml.v3"
	"testing"
)

func TestMinimapRevealConfig(t *testing.T) {
	if defaultConfig().MinimapReveal != 0 {
		t.Fatal("default must preserve exploration")
	}
	for _, value := range []string{"0", "1", "-1", "2", "true", "false", "1.0", "0.5", "\"1\"", "null", "[]"} {
		t.Run(value, func(t *testing.T) {
			cfg := defaultConfig()
			b := []byte("minimapReveal: " + value + "\n")
			err := yaml.Unmarshal(b, &cfg)
			if err == nil {
				err = checkKeys(b, "config.yaml", &cfg)
			}
			valid := value == "0" || value == "1"
			if (err == nil) != valid {
				t.Fatalf("value %s: err=%v", value, err)
			}
		})
	}
	cfg := defaultConfig()
	for _, text := range []string{"minimapReveal: 1\n", "log: debug\n", "minimapReveal: 0\n"} {
		if err := yaml.Unmarshal([]byte(text), &cfg); err != nil {
			t.Fatal(err)
		}
		if err := checkKeys([]byte(text), "config.local.yaml", &cfg); err != nil {
			t.Fatal(err)
		}
	}
	if cfg.MinimapReveal != 0 {
		t.Fatal("local zero override lost")
	}
}
