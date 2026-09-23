import React from 'react';
import { NODE_TYPES, NODE_TYPE_ICON, NODE_TYPE_LABEL } from '../topology.js';

export default function Inspector({ topo, sel, editing, onUpdateNode, onUpdateEdge, onRemoveNode, onRemoveEdge, onConnect, onSelectEdge }) {
  if (sel.kind === 'edge') {
    const edge = topo.edges.find(e => e.id === sel.id);
    if (!edge) return <p className="hint">选择一条连线</p>;
    const a = topo.nodes.find(n => n.id === edge.a);
    const b = topo.nodes.find(n => n.id === edge.b);
    return (
      <>
        <div className="section-title"><span>连线属性</span><small>{edge.id}</small></div>
        <div className="edge-endpoints">
          <span><i className={a?.type}>{NODE_TYPE_ICON[a?.type]}</i>{a?.name || edge.a}</span>
          <em>↔</em>
          <span><i className={b?.type}>{NODE_TYPE_ICON[b?.type]}</i>{b?.name || edge.b}</span>
        </div>
        <label>链路标签
          <input value={edge.label} disabled={!editing} onChange={e => onUpdateEdge('label', e.target.value)} placeholder="如：10G 光纤" />
        </label>
        <div className="inspector-actions">
          <button className="danger" onClick={onRemoveEdge} disabled={!editing}>删除连线</button>
        </div>
      </>
    );
  }
  const node = topo.nodes.find(n => n.id === sel.id);
  if (!node) return <p className="hint">选择一个设备</p>;
  const edges = topo.edges.filter(e => e.a === node.id || e.b === node.id);
  return (
    <>
      <div className="section-title"><span>属性</span><small>{node.type}</small></div>
      <label>设备名称<input value={node.name} disabled={!editing} onChange={e => onUpdateNode('name', e.target.value)} /></label>
      <label>IP 地址<input value={node.ip} disabled={!editing} onChange={e => onUpdateNode('ip', e.target.value)} /></label>
      <label>设备类型
        <select value={node.type} disabled={!editing} onChange={e => onUpdateNode('type', e.target.value)}>
          {NODE_TYPES.map(t => <option value={t} key={t}>{NODE_TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      <div className="inspector-actions">
        <button onClick={onConnect} disabled={!editing}>⌁ 添加连接</button>
        <button className="danger" onClick={onRemoveNode} disabled={!editing}>删除设备</button>
      </div>
      <div className="connections">
        <div className="section-title"><span>连接</span><small>{edges.length} 条</small></div>
        {edges.map(e => {
          const other = topo.nodes.find(n => n.id === (e.a === node.id ? e.b : e.a));
          return (
            <button className="connection" onClick={() => onSelectEdge(e.id)} key={e.id}>
              <span className={'mini ' + other?.type}></span>
              <strong>{other?.name}</strong>
              <small>{e.label || '在线'}</small>
            </button>
          );
        })}
      </div>
    </>
  );
}
