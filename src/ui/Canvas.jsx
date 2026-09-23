import React from 'react';
import { NODE_TYPE_ICON } from '../topology.js';

export default function Canvas({ topo, sel, editing, boardRef, onSelectNode, onSelectEdge, onDragStart, onDragMove, onDragEnd }) {
  return (
    <section className="canvas-wrap">
      <div className="canvas" ref={boardRef} onMouseMove={onDragMove} onMouseUp={onDragEnd} onMouseLeave={onDragEnd}>
        {topo.edges.map(e => {
          const n1 = topo.nodes.find(n => n.id === e.a);
          const n2 = topo.nodes.find(n => n.id === e.b);
          if (!n1 || !n2) return null;
          const dx = n2.x - n1.x, dy = n2.y - n1.y;
          const len = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          const picked = sel.kind === 'edge' && sel.id === e.id;
          return (
            <div className={'edge' + (picked ? ' picked' : '')} key={e.id}
              style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}
              onMouseDown={ev => ev.stopPropagation()} onClick={() => onSelectEdge(e.id)}>
              <span className="edge-line"></span>
              {e.label ? <em>{e.label}</em> : null}
            </div>
          );
        })}
        {topo.nodes.map(n => (
          <button
            className={'node ' + n.type + (sel.kind === 'node' && sel.id === n.id ? ' picked' : '')}
            style={{ left: n.x - 42, top: n.y - 31 }}
            onMouseDown={e => { e.stopPropagation(); onSelectNode(n.id); onDragStart(n.id); }}
            onClick={() => onSelectNode(n.id)}
            key={n.id}>
            <i>{NODE_TYPE_ICON[n.type]}</i>
            <strong>{n.name}</strong>
            <small>{n.ip}</small>
          </button>
        ))}
        <div className="legend">
          <span><i className="router"></i>路由器</span>
          <span><i className="switch"></i>交换机</span>
          <span><i className="server"></i>服务器</span>
        </div>
      </div>
      <div className="canvas-footer">
        <span>{editing ? '拖动节点调整位置' : '只读视图 · 登记变更后可编辑'} · {topo.edges.length} 条连接</span>
        <span>坐标系：画布局部</span>
      </div>
    </section>
  );
}
