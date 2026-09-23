import React from 'react';
import { NODE_TYPES, NODE_TYPE_ICON, NODE_TYPE_LABEL } from '../topology.js';

export default function Inventory({ topo, sel, onSelect, onAdd }) {
  return (
    <aside className="inventory">
      <div className="section-title"><span>设备库</span><small>{topo.nodes.length} 个节点</small></div>
      <div className="device-types">
        {NODE_TYPES.map(t => (
          <button onClick={() => onAdd(t)} key={t}>
            <i className={t}>{NODE_TYPE_ICON[t]}</i>{NODE_TYPE_LABEL[t]}<span>＋</span>
          </button>
        ))}
      </div>
      <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
      <div className="node-list">
        {topo.nodes.map(n => (
          <button className={sel.kind === 'node' && sel.id === n.id ? 'sel' : ''} onClick={() => onSelect(n.id)} key={n.id}>
            <i className={n.type}>{NODE_TYPE_ICON[n.type]}</i>
            <span><strong>{n.name}</strong><small>{n.ip}</small></span>
            <b>›</b>
          </button>
        ))}
      </div>
    </aside>
  );
}
