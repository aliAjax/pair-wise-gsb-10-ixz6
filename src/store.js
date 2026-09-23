// 持久化层：localStorage 读写与历史数据迁移，不含业务规则。
import { normalizeTopo, seedTopo } from './topology.js';
import { createInitialState } from './review.js';

const KEY = 'topology-review-console:v1';
const LEGACY_KEY = 'topology'; // 旧版编辑器的数据

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.snapshots) && s.snapshots.length &&
          s.snapshots.some(x => x.id === s.baselineSnapshotId)) {
        return revive(s);
      }
    }
  } catch { /* 数据损坏时回退到初始状态 */ }
  // 迁移旧版拓扑为 v1 基线
  let topo = seedTopo;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (legacy) topo = normalizeTopo(legacy);
  } catch { /* 忽略损坏的旧数据 */ }
  return createInitialState(topo);
}

// 重开时恢复：快照（含冻结差异）、排队项、进行中的会话与版本链计数器原样还原
function revive(s) {
  return {
    ...s,
    snapshots: s.snapshots.map(sn => ({ ...sn, topo: normalizeTopo(sn.topo) })),
    queue: (s.queue || []).map(q => ({ ...q, topo: normalizeTopo(q.topo) })),
    session: s.session || null,
    draft: s.draft ? normalizeTopo(s.draft) : null,
  };
}

export function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* 存储满或不可用时静默失败 */ }
}
