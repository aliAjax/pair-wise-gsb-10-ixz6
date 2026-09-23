// 拓扑数据层：只描述拓扑数据结构与纯函数操作，不关心差异、持久化和界面。

export const NODE_TYPES = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };
export const NODE_ICONS = { router: '◉', switch: '▦', server: '▣', device: '▱' };

// 连线是一等公民：拥有稳定 id 与可编辑属性（label），端点变化视为删除+新增。
export const seedTopology = {
  nodes: [
    { id: 'gw',   name: '核心路由器', type: 'router', x: 470, y: 220, ip: '10.0.0.1' },
    { id: 'sw1',  name: '交换机 A',  type: 'switch', x: 250, y: 370, ip: '10.0.1.1' },
    { id: 'sw2',  name: '交换机 B',  type: 'switch', x: 690, y: 370, ip: '10.0.2.1' },
    { id: 'web',  name: 'Web Server', type: 'server', x: 100, y: 520, ip: '10.0.1.10' },
    { id: 'db',   name: 'Database',  type: 'server', x: 400, y: 550, ip: '10.0.1.20' },
    { id: 'user', name: '办公终端',  type: 'device', x: 820, y: 530, ip: '10.0.2.22' },
  ],
  edges: [
    { id: 'e-gw-sw1',   from: 'gw',  to: 'sw1',  label: '主干光纤' },
    { id: 'e-gw-sw2',   from: 'gw',  to: 'sw2',  label: '主干光纤' },
    { id: 'e-sw1-web',  from: 'sw1', to: 'web',  label: '接入链路' },
    { id: 'e-sw1-db',   from: 'sw1', to: 'db',   label: '接入链路' },
    { id: 'e-sw2-user', from: 'sw2', to: 'user', label: '接入链路' },
  ],
};

let seq = 0;
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const cloneTopology = (t) => ({
  nodes: t.nodes.map((n) => ({ ...n })),
  edges: t.edges.map((e) => ({ ...e })),
});

// 规整任意来源的拓扑数据：丢弃悬空/重复连线，坐标取整，类型兜底。
export function normalizeTopology(t) {
  const nodes = (Array.isArray(t?.nodes) ? t.nodes : [])
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      name: String(n.name ?? ''),
      type: NODE_TYPES[n.type] ? n.type : 'device',
      x: Math.round(Number(n.x) || 0),
      y: Math.round(Number(n.y) || 0),
      ip: String(n.ip ?? ''),
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set();
  const edges = (Array.isArray(t?.edges) ? t.edges : [])
    // 兼容旧版 [from, to] 二元组格式
    .map((e) => (Array.isArray(e) ? { id: uid('e'), from: e[0], to: e[1], label: '' } : e))
    .filter((e) => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    .map((e) => ({ id: String(e.id ?? uid('e')), from: e.from, to: e.to, label: String(e.label ?? '') }))
    .filter((e) => {
      const key = [e.from, e.to].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { nodes, edges };
}

export const nodeById = (t, id) => t.nodes.find((n) => n.id === id) || null;
export const edgeById = (t, id) => t.edges.find((e) => e.id === id) || null;

export function addNode(t, type) {
  const node = {
    id: uid('node'),
    name: NODE_TYPES[type] || '终端设备',
    type: NODE_TYPES[type] ? type : 'device',
    x: 500,
    y: 300,
    ip: '192.168.0.10',
  };
  return { ...t, nodes: [...t.nodes, node] };
}

export function updateNode(t, id, patch) {
  return { ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function moveNode(t, id, x, y) {
  return updateNode(t, id, { x: Math.max(35, Math.round(x)), y: Math.max(35, Math.round(y)) });
}

// 删除节点时级联删除其关联连线。
export function removeNode(t, id) {
  return {
    nodes: t.nodes.filter((n) => n.id !== id),
    edges: t.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function hasEdge(t, a, b) {
  return t.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

export function addEdge(t, from, to) {
  if (!from || !to || from === to || !nodeById(t, from) || !nodeById(t, to) || hasEdge(t, from, to)) return null;
  return { ...t, edges: [...t.edges, { id: uid('e'), from, to, label: '新链路' }] };
}

export function updateEdge(t, id, patch) {
  return { ...t, edges: t.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function removeEdge(t, id) {
  return { ...t, edges: t.edges.filter((e) => e.id !== id) };
}

export function findIsolated(t) {
  const linked = new Set(t.edges.flatMap((e) => [e.from, e.to]));
  return t.nodes.filter((n) => !linked.has(n.id));
}
