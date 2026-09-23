// 差异判定层：比较两个拓扑快照，只输出新增、移除和属性变化的内容，未变化的不进入差异。
import { NODE_TYPES } from './topology.js';

// 参与属性变化判定的字段（含展示名）。
export const NODE_FIELDS = [
  ['name', '名称'],
  ['ip', 'IP 地址'],
  ['type', '类型'],
  ['x', 'X 坐标'],
  ['y', 'Y 坐标'],
];
export const EDGE_FIELDS = [
  ['label', '链路名称'],
  ['from', '起点'],
  ['to', '终点'],
];

const norm = (field, value) =>
  field === 'x' || field === 'y' ? Math.round(Number(value) || 0) : String(value ?? '');

// 展示用取值格式化：类型翻成中文，坐标取整。
export const formatValue = (field, value) => {
  if (field === 'type') return NODE_TYPES[value] || String(value ?? '');
  if (field === 'x' || field === 'y') return String(Math.round(Number(value) || 0));
  return String(value ?? '');
};

function diffCollection(baseList, nextList, fields) {
  const baseMap = new Map(baseList.map((item) => [item.id, item]));
  const nextMap = new Map(nextList.map((item) => [item.id, item]));
  const added = nextList.filter((item) => !baseMap.has(item.id)).map((item) => ({ ...item }));
  const removed = baseList.filter((item) => !nextMap.has(item.id)).map((item) => ({ ...item }));
  const changed = [];
  for (const next of nextList) {
    const base = baseMap.get(next.id);
    if (!base) continue;
    const changedFields = fields
      .filter(([field]) => norm(field, base[field]) !== norm(field, next[field]))
      .map(([field, label]) => ({ field, label, before: base[field], after: next[field] }));
    if (changedFields.length) {
      changed.push({ id: next.id, before: { ...base }, after: { ...next }, fields: changedFields });
    }
  }
  return { added, removed, changed };
}

// diff = { nodes: {added, removed, changed}, edges: {added, removed, changed} }
export function diffTopology(base, next) {
  return {
    nodes: diffCollection(base.nodes, next.nodes, NODE_FIELDS),
    edges: diffCollection(base.edges, next.edges, EDGE_FIELDS),
  };
}

export function diffCounts(diff) {
  const added = diff.nodes.added.length + diff.edges.added.length;
  const removed = diff.nodes.removed.length + diff.edges.removed.length;
  const changed = diff.nodes.changed.length + diff.edges.changed.length;
  return { added, removed, changed };
}

export const diffIsEmpty = (diff) => {
  const { added, removed, changed } = diffCounts(diff);
  return added + removed + changed === 0;
};
