// 拓扑数据层：数据模型与纯数据操作，不感知差异判定、持久化与界面。
export const NODE_TYPES = ['router', 'switch', 'server', 'device'];
export const NODE_TYPE_LABEL = { router: '路由器', switch: '交换机', server: '服务器', device: '终端设备' };
export const NODE_TYPE_ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };

// 参与差异判定的属性
export const NODE_FIELDS = ['name', 'type', 'ip', 'x', 'y'];
export const EDGE_FIELDS = ['label'];
export const FIELD_LABEL = { name: '名称', type: '类型', ip: 'IP 地址', x: '横坐标', y: '纵坐标', label: '链路标签' };

// 连线身份 = 无序端点对，天然去重
export const edgeIdOf = (a, b) => `e:${[a, b].sort().join('::')}`;
export const makeEdge = (a, b, label = '') => ({ id: edgeIdOf(a, b), a, b, label });
export const makeNode = (type, over = {}) => ({
  id: `node-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
  name: NODE_TYPE_LABEL[type] || '新设备',
  type,
  x: 500,
  y: 300,
  ip: '192.168.0.10',
  ...over,
});

// 归一化外部/历史数据：兼容旧版 [a,b] 连线，剔除悬空与重复连线
export function normalizeTopo(raw) {
  const nodes = (raw?.nodes || []).map(n => ({
    id: String(n.id),
    name: String(n.name ?? ''),
    type: NODE_TYPES.includes(n.type) ? n.type : 'device',
    x: Math.round(Number(n.x) || 0),
    y: Math.round(Number(n.y) || 0),
    ip: String(n.ip ?? ''),
  }));
  const ids = new Set(nodes.map(n => n.id));
  const seen = new Set();
  const edges = [];
  for (const e of raw?.edges || []) {
    const edge = Array.isArray(e)
      ? makeEdge(String(e[0]), String(e[1]))
      : { id: e.id ? String(e.id) : edgeIdOf(String(e.a), String(e.b)), a: String(e.a), b: String(e.b), label: String(e.label ?? '') };
    if (ids.has(edge.a) && ids.has(edge.b) && edge.a !== edge.b && !seen.has(edge.id)) {
      seen.add(edge.id);
      edges.push(edge);
    }
  }
  return { nodes, edges };
}

export const cloneTopo = t => JSON.parse(JSON.stringify(t));

export const seedTopo = normalizeTopo({
  nodes: [
    { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 220, ip: '10.0.0.1' },
    { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 370, ip: '10.0.1.1' },
    { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 370, ip: '10.0.2.1' },
    { id: 'web', name: 'Web Server', type: 'server', x: 100, y: 520, ip: '10.0.1.10' },
    { id: 'db', name: 'Database', type: 'server', x: 400, y: 550, ip: '10.0.1.20' },
    { id: 'user', name: '办公终端', type: 'device', x: 820, y: 530, ip: '10.0.2.22' },
  ],
  edges: [
    { a: 'gw', b: 'sw1', label: '10G 光纤' },
    { a: 'gw', b: 'sw2', label: '10G 光纤' },
    { a: 'sw1', b: 'web', label: '1G 电口' },
    { a: 'sw1', b: 'db', label: '1G 电口' },
    { a: 'sw2', b: 'user', label: '1G 电口' },
  ],
});
