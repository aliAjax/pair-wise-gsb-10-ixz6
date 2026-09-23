import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { loadState, saveState } from './store.js';
import { viewTopoOf, baselineOf, pendingOf } from './review.js';
import { makeEdge, makeNode } from './topology.js';
import ReviewPanel from './ui/ReviewPanel.jsx';
import Inspector from './ui/Inspector.jsx';
import Canvas from './ui/Canvas.jsx';
import Inventory from './ui/Inventory.jsx';

function App() {
  const [state, setState] = useState(loadState);
  const [sel, setSel] = useState({ kind: 'node', id: 'gw' });
  const [tab, setTab] = useState('review');
  const [notice, setNotice] = useState('');
  const [drag, setDrag] = useState(null);
  const board = useRef();
  const timer = useRef();

  useEffect(() => saveState(state), [state]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const notify = msg => {
    setNotice(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 2600);
  };

  const topo = viewTopoOf(state);
  const baseline = baselineOf(state);
  const pending = pendingOf(state);
  const editing = !!state.session;

  const act = (fn, ...args) => {
    const r = fn(state, ...args);
    if (!r.ok) { notify(r.error); return false; }
    setState(r.state);
    return true;
  };

  const requireSession = () => {
    if (editing) return true;
    notify('请先在复核台登记变更：选择基线快照并填写变更人、原因');
    setTab('review');
    return false;
  };

  // 所有拓扑修改只写入会话草稿，不触碰基线
  const mutate = fn => setState(s => (s.session ? { ...s, draft: fn(s.draft) } : s));
  const pickNode = id => { setSel({ kind: 'node', id }); if (editing) setTab('props'); };
  const pickEdge = id => { setSel({ kind: 'edge', id }); if (editing) setTab('props'); };

  const addNode = type => {
    if (!requireSession()) return;
    const n = makeNode(type);
    mutate(t => ({ ...t, nodes: [...t.nodes, n] }));
    setSel({ kind: 'node', id: n.id });
    setTab('props');
    notify('已添加设备');
  };
  const connect = () => {
    if (!requireSession() || sel.kind !== 'node' || !sel.id) {
      notify('请先选中一个节点');
      return;
    }
    const input = prompt('输入要连接的设备 ID（例如 sw1）');
    if (!input) return;
    const other = input.trim();
    if (other === sel.id) return notify('不能连接自身');
    if (!topo.nodes.some(n => n.id === other)) return notify('目标设备不存在');
    const edge = makeEdge(sel.id, other);
    if (topo.edges.some(e => e.id === edge.id)) return notify('连接已存在');
    mutate(t => ({ ...t, edges: [...t.edges, edge] }));
    notify('连接已创建');
  };
  const removeNode = () => {
    if (!requireSession() || sel.kind !== 'node') return;
    const id = sel.id;
    mutate(t => ({
      ...t,
      nodes: t.nodes.filter(n => n.id !== id),
      edges: t.edges.filter(e => e.a !== id && e.b !== id),
    }));
    setSel({ kind: 'node', id: topo.nodes.find(n => n.id !== id)?.id || null });
    notify('设备已删除');
  };
  const updateNode = (k, v) => mutate(t => ({ ...t, nodes: t.nodes.map(n => (n.id === sel.id ? { ...n, [k]: v } : n)) }));
  const updateEdge = (k, v) => mutate(t => ({ ...t, edges: t.edges.map(e => (e.id === sel.id ? { ...e, [k]: v } : e)) }));
  const removeEdge = () => {
    if (!requireSession() || sel.kind !== 'edge') return;
    mutate(t => ({ ...t, edges: t.edges.filter(e => e.id !== sel.id) }));
    setSel({ kind: 'node', id: topo.nodes[0]?.id || null });
    notify('连线已删除');
  };
  const move = e => {
    if (!drag || !board.current) return;
    const r = board.current.getBoundingClientRect();
    const x = Math.max(35, Math.round(e.clientX - r.left));
    const y = Math.max(35, Math.round(e.clientY - r.top));
    mutate(t => ({ ...t, nodes: t.nodes.map(n => (n.id === drag ? { ...n, x, y } : n)) }));
  };
  const validate = () => {
    const linked = new Set(topo.edges.flatMap(e => [e.a, e.b]));
    const isolated = topo.nodes.filter(n => !linked.has(n.id));
    notify(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(topo, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    notify('JSON 已导出');
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div><strong>NETSCAPE</strong><small>TOPOLOGY REVIEW CONSOLE</small></div>
        </div>
        <div className="file">
          <span className="dot"></span>
          <div><strong>office-network.json</strong><small>基线 v{baseline.version} · {baseline.editor} · 已自动持久化</small></div>
        </div>
        <div className="top-actions">
          {pending && <span className="badge pending">待复核 {pending.id}</span>}
          {state.queue.length > 0 && <span className="badge queue">排队 {state.queue.length}</span>}
          <button onClick={validate}>✓ 检查</button>
          <button onClick={exportJson}>↓ 导出</button>
          <button className="save" onClick={() => notify('工作区已自动持久化到本地存储')}>保存更改</button>
        </div>
      </header>
      <div className="toolbar">
        <div className="tool-group"><span>工具</span>
          <button className="on">↖ 选择</button>
          <button onClick={connect}>⌁ 连接</button>
          <button onClick={() => addNode('device')}>＋ 设备</button>
        </div>
        <div className="tool-group">
          <span className={'mode' + (editing ? ' editing' : '')}>
            {editing
              ? `● 变更进行中 · ${state.session.editor}${state.session.queued ? '（排队模式）' : ''}`
              : pending ? '◌ 待复核锁定 · 新变更将排队' : '○ 只读 · 请在复核台登记变更'}
          </span>
        </div>
      </div>
      <div className="workspace">
        <Inventory topo={topo} sel={sel} onSelect={pickNode} onAdd={addNode} />
        <Canvas
          topo={topo} sel={sel} editing={editing} boardRef={board}
          onSelectNode={pickNode} onSelectEdge={pickEdge}
          onDragStart={id => { if (editing) setDrag(id); }}
          onDragMove={move} onDragEnd={() => setDrag(null)}
        />
        <aside className="inspector">
          <div className="tabs">
            <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>复核台</button>
            <button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>属性</button>
          </div>
          {tab === 'review' ? (
            <ReviewPanel state={state} act={act} />
          ) : (
            <Inspector
              topo={topo} sel={sel} editing={editing}
              onUpdateNode={updateNode} onUpdateEdge={updateEdge}
              onRemoveNode={removeNode} onRemoveEdge={removeEdge}
              onConnect={connect} onSelectEdge={pickEdge}
            />
          )}
        </aside>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
