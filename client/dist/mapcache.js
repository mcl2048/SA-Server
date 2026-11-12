// 地图资料存在浏览器（IndexedDB）：MapData 占流量的大半，同一层楼下次再来、或重新整理页面后，版本（服务端 floorVer）
// 没变就直接用存着的，不再向服务端要。一层楼存一笔：{ ver, w, h, tiles, objs, walk }，walk 为 0 的格子是还没拿到资料的。
// 浏览器不给用 IndexedDB（私密浏览、被关掉）时就当作没有快取，照常向服务端要。

                                                                                                                         

const DB = "sa-map", STORE = "floors";
let dbp                                     = null;

function db()                              {
  dbp ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

/** 读一层楼存着的资料；ver 给了就只认同一版本的（不同就当作没有） */
export async function loadFloor(floor        , ver         )                            {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(floor);
      req.onsuccess = () => {
        const r = req.result                         ;
        resolve(r && (!ver || r.ver === ver) ? r : null);
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

const timers = new Map                                       ();
/** 存一层楼的资料（同一层 1.5 秒内的多次存只写最后一次；get 在写的时候才取，拿到的是最新的） */
export function saveFloor(floor        , get                        ) {
  if (timers.has(floor)) return;
  timers.set(floor, setTimeout(async () => {
    timers.delete(floor);
    const r = get();
    const d = await db();
    if (!r || !r.ver || !d) return;
    try { d.transaction(STORE, "readwrite").objectStore(STORE).put({ ...r, tiles: r.tiles.slice(), objs: r.objs.slice(), walk: r.walk.slice() }, floor); } catch { /* 存不了就算了 */ }
  }, 1500));
}
