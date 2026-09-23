// 差异判定层：仅依赖拓扑数据模型，输出新增/移除/属性变化，未变化内容不进入结果。
import { NODE_FIELDS, EDGE_FIELDS } from './topology.js';

function diffItems(baseItems, nextItems, fields) {
  const baseMap = new Map(baseItems.map(i => [i.id, i]));
  const nextMap = new Map(nextItems.map(i => [i.id, i]));
  const added = [], removed = [], changed = [];
  for (const item of nextItems) {
    const before = baseMap.get(item.id);
    if (!before) { added.push(item); continue; }
    const fieldDiffs = [];
    for (const f of fields) {
      if (before[f] !== item[f]) fieldDiffs.push({ field: f, before: before[f], after: item[f] });
    }
    if (fieldDiffs.length) changed.push({ id: item.id, item, fields: fieldDiffs });
  }
  for (const item of baseItems) {
    if (!nextMap.has(item.id)) removed.push(item);
  }
  return { added, removed, changed };
}

export function diffTopology(base, next) {
  const nodes = diffItems(base.nodes, next.nodes, NODE_FIELDS);
  const edges = diffItems(base.edges, next.edges, EDGE_FIELDS);
  const empty =
    !nodes.added.length && !nodes.removed.length && !nodes.changed.length &&
    !edges.added.length && !edges.removed.length && !edges.changed.length;
  return { nodes, edges, empty };
}

export function diffStats(diff) {
  if (!diff) return { added: 0, removed: 0, changed: 0 };
  return {
    added: diff.nodes.added.length + diff.edges.added.length,
    removed: diff.nodes.removed.length + diff.edges.removed.length,
    changed: diff.nodes.changed.length + diff.edges.changed.length,
  };
}
