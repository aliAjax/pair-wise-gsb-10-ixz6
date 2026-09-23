// 状态与持久化层：复核流水线的状态机（基线/待复核/排队/编辑中/版本链）+ localStorage 持久化。
// 所有迁移函数都是纯函数：接收旧状态，返回 { state, error? }，不触碰界面。
import { seedTopology, cloneTopology, normalizeTopology, uid } from './topology.js';
import { diffTopology, diffIsEmpty } from './diff.js';

const STORAGE_KEY = 'topology-review-console:v1';

// 变更单：{ id, editor, reason, baseVersion, topology, createdAt, submittedAt? }
// 状态：{ versions: [...], pending: 变更单|null, queue: [变更单], working: 变更单|null, rejected: [...] }

export function initialState(now = new Date().toISOString()) {
  return {
    versions: [
      {
        version: 1,
        topology: cloneTopology(seedTopology),
        editor: '系统',
        reason: '初始拓扑导入',
        reviewer: '系统',
        baseVersion: null,
        diff: diffTopology(seedTopology, seedTopology),
        createdAt: now,
        submittedAt: now,
        approvedAt: now,
      },
    ],
    pending: null,
    queue: [],
    working: null,
    rejected: [],
  };
}

export const headVersion = (s) => s.versions[s.versions.length - 1];

export const baseTopologyOf = (s, version) =>
  s.versions.find((v) => v.version === version)?.topology ?? headVersion(s).topology;

// 画布上呈现的拓扑：编辑稿 > 队尾 > 待复核 > 基线头。
export const canvasTopology = (s) =>
  s.working?.topology ??
  (s.queue.length ? s.queue[s.queue.length - 1].topology : null) ??
  s.pending?.topology ??
  headVersion(s).topology;

// 每次编辑前必须先登记：选基线快照、填变更人和原因，生成编辑稿。
export function beginEdit(s, { editor, reason, baseVersion, now = new Date().toISOString() }) {
  if (s.working) return { state: s, error: '已有进行中的变更，请先提交或放弃' };
  if (!editor?.trim()) return { state: s, error: '请填写变更人' };
  if (!reason?.trim()) return { state: s, error: '请填写变更原因' };
  const base = s.versions.find((v) => v.version === baseVersion) ?? headVersion(s);
  const working = {
    id: uid('chg'),
    editor: editor.trim(),
    reason: reason.trim(),
    baseVersion: base.version,
    topology: cloneTopology(canvasTopology(s)),
    createdAt: now,
  };
  return { state: { ...s, working } };
}

// 编辑只作用于编辑稿，绝不直接写基线。
export function mutateWorking(s, fn) {
  if (!s.working) return { state: s, changed: false };
  const next = fn(s.working.topology);
  if (!next || next === s.working.topology) return { state: s, changed: false };
  return { state: { ...s, working: { ...s.working, topology: next } }, changed: true };
}

export function cancelWorking(s) {
  return { ...s, working: null };
}

// 提交：无待复核快照时成为待复核；否则只能进入排队，不能覆盖基线。
export function submitWorking(s, now = new Date().toISOString()) {
  if (!s.working) return { state: s, error: '没有进行中的变更' };
  const diff = diffTopology(baseTopologyOf(s, s.working.baseVersion), s.working.topology);
  if (diffIsEmpty(diff)) return { state: s, error: '与基线相比没有实际变更，无需提交' };
  const item = { ...s.working, submittedAt: now };
  if (!s.pending) return { state: { ...s, pending: item, working: null }, queued: false };
  return { state: { ...s, queue: [...s.queue, item], working: null }, queued: true };
}

// 复核通过：冻结差异，生成连续版本，基线前进，队首自动升为待复核。
export function approve(s, reviewer, now = new Date().toISOString()) {
  if (!s.pending) return { state: s, error: '当前没有待复核的快照' };
  const prev = headVersion(s);
  const version = {
    version: prev.version + 1,
    topology: s.pending.topology,
    editor: s.pending.editor,
    reason: s.pending.reason,
    baseVersion: s.pending.baseVersion,
    reviewer: reviewer?.trim() || '未署名',
    diff: diffTopology(prev.topology, s.pending.topology), // 冻结的差异
    createdAt: s.pending.createdAt,
    submittedAt: s.pending.submittedAt ?? now,
    approvedAt: now,
  };
  const [next, ...rest] = s.queue;
  return {
    state: { ...s, versions: [...s.versions, version], pending: next ?? null, queue: rest },
    version: version.version,
  };
}

// 驳回：只撤销本次编辑（待复核快照），排队项与编辑稿原样保留。
export function reject(s, reviewer, now = new Date().toISOString()) {
  if (!s.pending) return { state: s, error: '当前没有待复核的快照' };
  const entry = { ...s.pending, reviewer: reviewer?.trim() || '未署名', rejectedAt: now };
  const [next, ...rest] = s.queue;
  return {
    state: { ...s, rejected: [entry, ...s.rejected], pending: next ?? null, queue: rest },
  };
}

// ---- 持久化 ----

const validTopology = (t) => t && Array.isArray(t.nodes) && Array.isArray(t.edges);
const validItem = (i) => i && typeof i.id === 'string' && typeof i.baseVersion === 'number' && validTopology(i.topology);

function normalizeItem(i) {
  return i ? { ...i, topology: normalizeTopology(i.topology) } : null;
}

// 重开时整体校验并规整，保证快照、差异、排队项和版本链一致；损坏则回退初始状态。
export function validateState(s) {
  return (
    s &&
    Array.isArray(s.versions) &&
    s.versions.length > 0 &&
    s.versions.every((v) => v && typeof v.version === 'number' && validTopology(v.topology)) &&
    (s.pending === null || validItem(s.pending)) &&
    Array.isArray(s.queue) && s.queue.every(validItem) &&
    (s.working === null || validItem(s.working)) &&
    Array.isArray(s.rejected)
  );
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!validateState(parsed)) return null;
    return {
      ...parsed,
      versions: parsed.versions.map((v) => ({ ...v, topology: normalizeTopology(v.topology) })),
      pending: normalizeItem(parsed.pending),
      queue: parsed.queue.map(normalizeItem),
      working: normalizeItem(parsed.working),
    };
  } catch {
    return null;
  }
}

export function saveState(s, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 存储不可用时静默失败，不影响编辑 */
  }
}
