// saserver：石器时代 H5 重制版的游戏服务端。
//
//	运行 bin/saserver，设定在 config.yaml（见 config.go）；--version 显示发行版本。
//
// 同一个端口提供：/ws（游戏连接）、/（客户端页面）、/assets/（导出的美术与音频）。
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"sa/server/internal/data"
	"sa/server/internal/server"
	"sa/server/internal/store"
	"sa/server/internal/world"
	"sa/server/webclient"
)

// version is stamped by scripts/build-linux.sh.
var version = "v0.2.13-LYNX-dev"

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(version)
		return
	}
	level := new(slog.LevelVar)
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	cfg, cfgPath, err := loadConfig()
	if err != nil {
		log.Error("读取设定失败", "file", cfgPath, "err", err)
		os.Exit(1)
	}
	for _, w := range cfg.Warnings {
		log.Warn("设定", "msg", w)
	}
	if err := level.UnmarshalText([]byte(cfg.Log)); err != nil {
		log.Error("log 要是 debug / info / warn / error", "log", cfg.Log)
		os.Exit(1)
	}
	rules, _ := cfg.Rules.world() // loadConfig 检查过了
	log.Info("设定", "file", cfgPath, "addr", cfg.Addr, "gms", cfg.GMs, "maxChars", cfg.MaxChars, "rules", fmt.Sprintf("%+v", cfg.Rules))
	start := time.Now()
	game, err := data.Load(cfg.Data)
	if err != nil {
		log.Error("读取原版数据失败", "err", err)
		os.Exit(1)
	}
	log.Info("原版数据已加载", "floors", len(game.Floors), "tileAttrs", len(game.Tiles), "warnings", len(game.Warnings), "took", time.Since(start))

	db, err := store.OpenSQLite(cfg.DB)
	if err != nil {
		log.Error("打开数据库失败", "err", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := world.MigrateExp(context.Background(), db, game, log); err != nil {
		log.Error("换算经验存档失败", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// 每条线路一个独立的世界（原版每条线路是一台 gmsv），共用账号与角色存档
	var lines []*server.Line
	var wg sync.WaitGroup
	var families *world.Families // 家族是所有线路共用的（原版放在帐号服务器 AC）
	gms := map[string]bool{}
	for _, a := range cfg.GMs {
		gms[strings.ToLower(strings.TrimSpace(a))] = true
	}
	for _, group := range cfg.Groups {
		gname := group.Name
		for _, n := range group.Lines {
			id := len(lines) + 1
			w := world.New(game, db, log.With("line", gname+n), int64(id), families)
			w.GMs = gms
			w.Rules = rules
			w.Name = gname + n

			if families == nil {
				families = w.Families()
			}
			w.ShareFamilies(families)
			lines = append(lines, &server.Line{ID: id, Group: gname, Name: n, World: w})
			wg.Add(1)
			go func() { w.Run(ctx); wg.Done() }()
		}
	}
	log.Info("线路已启动", "count", len(lines))
	worldDone := make(chan struct{})
	go func() { wg.Wait(); close(worldDone) }()

	mux := http.NewServeMux()
	// GM 账号：还没注册的名字提醒一下（注册时会保留给管理员，别人注册不走）；对外监听时再提醒一次
	for name := range gms {
		if ok, err := db.AccountExists(ctx, name); err == nil && !ok {
			log.Warn("GM 账号还没注册（别人注册不了这个名字，请尽快自己注册）", "account", name)
		}
	}
	if host, _, _ := net.SplitHostPort(cfg.Addr); host != "127.0.0.1" && host != "localhost" && host != "::1" {
		if cfg.TLSCert == "" {
			log.Warn("对外监听而且没有 TLS：账号密码会明文传输", "addr", cfg.Addr)
		}
		if len(gms) > 0 {
			log.Warn("对外监听时请确认 GM 账号用的是强密码", "gms", cfg.GMs)
		}
	}
	mux.Handle("/ws", &server.Server{Lines: lines, Store: db, Log: log, Origins: cfg.Origins, MaxChars: cfg.MaxChars, GMs: gms, MinimapReveal: cfg.MinimapReveal == 1})

	mux.Handle("/assets/", gzipped(http.StripPrefix("/assets/", http.FileServer(noListing{http.Dir(cfg.Assets)}))))
	// Empty Client selects the embedded release; an explicit external path is
	// supported with the same published-file boundary (index.html + dist JS).
	mux.Handle("/", gzipped(webclient.Handler(cfg.Client)))

	srv := &http.Server{Addr: cfg.Addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 2 * time.Minute}
	httpDone := make(chan struct{})
	go func() {
		defer close(httpDone)
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(sctx); err != nil {
			log.Warn("HTTP停服等待超时，关闭剩余连接", "err", err)
			srv.Close()
		}
	}()
	scheme := "http"
	if cfg.TLSCert != "" {
		scheme = "https"
	}
	log.Info("服务端已启动", "version", version, "url", scheme+"://"+cfg.Addr+"/")
	if cfg.TLSCert != "" {
		err = srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey)
	} else {
		err = srv.ListenAndServe()
	}
	if err != nil && !errors.Is(err, http.ErrServerClosed) {

		log.Error("监听失败", "err", err)
		os.Exit(1)
	}
	<-worldDone
	// Family/KV persistence has a separate worker shared by every line. World
	// completion only drains character queues; join the shared worker before DB.
	if families != nil {
		families.Close()
	}
	// Shutdown closes listeners before in-flight HTTP handlers finish. Join it
	// before closing their shared database handle in the main defer.
	<-httpDone
	// Queue completion is not a disk-success guarantee: each job logs its own
	// context/I/O failure. Keep the shutdown message factual under those errors.
	log.Info("已退出，在线角色存档队列已排空")
}

// noListing 是不列目录的 http.FileSystem：打开到目录时只给 index.html，没有就 404（不把源码目录列给人看）。
type noListing struct{ fs http.FileSystem }

func (n noListing) Open(name string) (http.File, error) {
	f, err := n.fs.Open(name)
	if err != nil {
		return nil, err
	}
	if st, err := f.Stat(); err == nil && st.IsDir() {
		idx := strings.TrimSuffix(name, "/") + "/index.html"
		index, err := n.fs.Open(idx)
		if err != nil {
			f.Close()
			return nil, os.ErrNotExist
		}
		// This is only an existence probe. FileServer opens the index itself;
		// retaining this handle leaks one descriptor per directory request.
		index.Close()
	}
	return f, nil
}
