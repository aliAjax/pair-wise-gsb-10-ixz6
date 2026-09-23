// 复核工作流：快照、差异、排队与版本链的状态迁移。全部为纯函数，不做持久化。
import { diffTopology } from './diff.js';
import { cloneTopo } from './topology.js';

export const now = () => new Date().toISOString();

// 首次运行：以给定拓扑建立 v1 基线
export function createInitialState(topo) {
  const t = now();
  const base = {
    id: 'snap-1', version: 1, status: 'approved', topo: cloneTopo(topo),
    editor: '系统', reason: '初始基线', createdAt: t,
    baseSnapshotId: null, diff: null,
    reviewedBy: '系统', reviewedAt: t, reviewNote: '',
  };
  return {
    snapCounter: 1, versionCounter: 1,
    baselineSnapshotId: base.id, pendingSnapshotId: null,
    snapshots: [base], queue: [],
    session: null, draft: null,
  };
}

export const baselineOf = s => s.snapshots.find(x => x.id === s.baselineSnapshotId) || s.snapshots[0];
export const pendingOf = s => s.snapshots.find(x => x.id === s.pendingSnapshotId) || null;
export const approvedOf = s => s.snapshots.filter(x => x.status === 'approved').sort((a, b) => a.version - b.version);
// 画布展示的拓扑：编辑中看草稿，否则看待复核快照，否则看已批准基线
export const viewTopoOf = s => (s.session ? s.draft : (pendingOf(s) || baselineOf(s)).topo);

const ok = state => ({ ok: true, state });
const err = error => ({ ok: false, error });

// 每次编辑必须先登记：选基线快照 + 变更人 + 原因。
// 存在未复核快照时基线锁定，新变更只能进入排队模式。
export function startSession(state, { editor, reason, baseSnapshotId }) {
  if (state.session) return err('已有进行中的变更，请先提交或放弃');
  editor = (editor || '').trim();
  reason = (reason || '').trim();
  if (!editor) return err('请登记变更人');
  if (!reason) return err('请登记变更原因');
  const queued = !!pendingOf(state);
  const base = queued
    ? baselineOf(state)
    : (approvedOf(state).find(x => x.id === baseSnapshotId) || baselineOf(state));
  return ok({
    ...state,
    session: { editor, reason, baseSnapshotId: base.id, queued, startedAt: now() },
    draft: cloneTopo(base.topo),
  });
}

export const cancelSession = state => ok({ ...state, session: null, draft: null });

// 提交：与基线比对生成差异。排队模式进队列，否则成为待复核快照。
export function submitSession(state) {
  const sess = state.session;
  if (!sess) return err('当前没有进行中的变更');
  const base = state.snapshots.find(x => x.id === sess.baseSnapshotId) || baselineOf(state);
  const diff = diffTopology(base.topo, state.draft);
  if (diff.empty) return err('与基线相比没有变化，无需提交');
  if (sess.queued) {
    const item = {
      id: `q-${state.snapCounter + 1}`,
      editor: sess.editor, reason: sess.reason,
      topo: cloneTopo(state.draft), createdAt: now(),
    };
    return ok({ ...state, snapCounter: state.snapCounter + 1, queue: [...state.queue, item], session: null, draft: null });
  }
  const snap = {
    id: `snap-${state.snapCounter + 1}`, version: null, status: 'pending',
    topo: cloneTopo(state.draft), editor: sess.editor, reason: sess.reason, createdAt: now(),
    baseSnapshotId: base.id, diff,
    reviewedBy: null, reviewedAt: null, reviewNote: '',
  };
  return ok({
    ...state, snapCounter: state.snapCounter + 1,
    snapshots: [...state.snapshots, snap], pendingSnapshotId: snap.id,
    session: null, draft: null,
  });
}

// 复核结束后提升队首：与最新基线重新比对，成为下一个待复核快照；
// 与基线已无差异的排队项视为被覆盖，直接消化。
function promoteQueue(state) {
  let queue = state.queue;
  let counter = state.snapCounter;
  const base = baselineOf(state);
  while (queue.length) {
    const [head, ...rest] = queue;
    queue = rest;
    const diff = diffTopology(base.topo, head.topo);
    if (diff.empty) continue;
    counter += 1;
    const snap = {
      id: `snap-${counter}`, version: null, status: 'pending',
      topo: cloneTopo(head.topo), editor: head.editor, reason: head.reason, createdAt: head.createdAt,
      baseSnapshotId: base.id, diff,
      reviewedBy: null, reviewedAt: null, reviewNote: '',
    };
    return { ...state, queue, snapCounter: counter, snapshots: [...state.snapshots, snap], pendingSnapshotId: snap.id };
  }
  return { ...state, queue, pendingSnapshotId: null };
}

// 复核通过：差异随快照冻结，生成连续版本号，成为新基线。
export function approvePending(state, { reviewer, note = '' }) {
  const p = pendingOf(state);
  if (!p) return err('当前没有待复核的快照');
  reviewer = (reviewer || '').trim();
  if (!reviewer) return err('请填写复核人');
  const version = state.versionCounter + 1;
  const frozen = { ...p, status: 'approved', version, reviewedBy: reviewer, reviewedAt: now(), reviewNote: note };
  return ok(promoteQueue({
    ...state, versionCounter: version, baselineSnapshotId: p.id, pendingSnapshotId: null,
    snapshots: state.snapshots.map(x => (x.id === p.id ? frozen : x)),
  }));
}

// 驳回：只撤销本次编辑。基线与版本链不变，画布回落基线，队列继续提升。
export function rejectPending(state, { reviewer, note = '' }) {
  const p = pendingOf(state);
  if (!p) return err('当前没有待复核的快照');
  reviewer = (reviewer || '').trim();
  if (!reviewer) return err('请填写复核人');
  const rejected = { ...p, status: 'rejected', reviewedBy: reviewer, reviewedAt: now(), reviewNote: note };
  return ok(promoteQueue({
    ...state, pendingSnapshotId: null,
    snapshots: state.snapshots.map(x => (x.id === p.id ? rejected : x)),
  }));
}

export const removeQueued = (state, qid) => ok({ ...state, queue: state.queue.filter(q => q.id !== qid) });
