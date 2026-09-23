import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  NODE_TYPES, NODE_ICONS,
  addNode, updateNode, moveNode, removeNode,
  addEdge, updateEdge, removeEdge, hasEdge, findIsolated,
} from './topology.js';
import { diffTopology, diffCounts, diffIsEmpty, formatValue } from './diff.js';
import * as store from './store.js';

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }) : '—');

// 差异视图：只渲染新增/移除/变更，未变化内容不出现。
function DiffView({ diff, base, next }) {
  const nameOf = (id) =>
    next.nodes.find((n) => n.id === id)?.name ?? base.nodes.find((n) => n.id === id)?.name ?? id;
  const edgeName = (e) => e.label || `${nameOf(e.from)} ↔ ${nameOf(e.to)}`;
  const Section = ({ title, kind, items, render }) =>
    items.length ? (
      <div className={`diff-section ${kind}`}>
        <div className="diff-head">{title}<small>{items.length}</small></div>
        {items.map(render)}
      </div>
    ) : null;
  const nodeItem = (kind) => (n) => (
    <div className="diff-item" key={n.id}>
      <i className={n.type}>{NODE_ICONS[n.type]}</i>
      <span><strong>{n.name}</strong><small>{n.ip} · {NODE_TYPES[n.type]}</small></span>
      <b className={`tag ${kind}`}>{kind === 'added' ? '新增' : '移除'}</b>
    </div>
  );
  const edgeItem = (kind) => (e) => (
    <div className="diff-item" key={e.id}>
      <i className="edge-ic">⌁</i>
      <span><strong>{edgeName(e)}</strong><small>{nameOf(e.from)} ↔ {nameOf(e.to)}</small></span>
      <b className={`tag ${kind}`}>{kind === 'added' ? '新增' : '移除'}</b>
    </div>
  );
  const changedItem = (nameOfChange) => (c) => (
    <div className="diff-item changed" key={c.id}>
      <div className="changed-title"><strong>{nameOfChange(c)}</strong><b className="tag changed">变更</b></div>
      {c.fields.map((f) => (
        <div className="field-row" key={f.field}>
          <span>{f.label}</span>
          <em>{formatValue(f.field, f.before)} → {formatValue(f.field, f.after)}</em>
        </div>
      ))}
    </div>
  );
  return (
    <div className="diff-view">
      <Section title="新增节点" kind="added" items={diff.nodes.added} render={nodeItem('added')} />
      <Section title="移除节点" kind="removed" items={diff.nodes.removed} render={nodeItem('removed')} />
      <Section title="变更节点" kind="changed" items={diff.nodes.changed} render={changedItem((c) => c.after.name)} />
      <Section title="新增连线" kind="added" items={diff.edges.added} render={edgeItem('added')} />
      <Section title="移除连线" kind="removed" items={diff.edges.removed} render={edgeItem('removed')} />
      <Section title="变更连线" kind="changed" items={diff.edges.changed} render={changedItem((c) => edgeName(c.after))} />
    </div>
  );
}

function DiffBadge({ diff }) {
  const c = diffCounts(diff);
  return <span className="diff-badge"><i className="a">+{c.added}</i><i className="r">−{c.removed}</i><i className="c">~{c.changed}</i></span>;
}

// 变更登记弹窗：选基线快照、登记变更人和原因。
function RegisterModal({ versions, onCancel, onConfirm }) {
  const head = versions[versions.length - 1].version;
  const [baseVersion, setBaseVersion] = useState(head);
  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const confirm = () => {
    if (!editor.trim()) return setErr('请填写变更人');
    if (!reason.trim()) return setErr('请填写变更原因');
    onConfirm({ editor, reason, baseVersion: Number(baseVersion) });
  };
  return (
    <div className="modal-mask" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">变更登记<small>每次编辑前必须先登记</small></div>
        <label>基线快照
          <select value={baseVersion} onChange={(e) => setBaseVersion(e.target.value)}>
            {[...versions].reverse().map((v) => (
              <option key={v.version} value={v.version}>v{v.version} · {v.reason}（{v.editor}）</option>
            ))}
          </select>
        </label>
        <label>变更人<input value={editor} onChange={(e) => setEditor(e.target.value)} placeholder="姓名 / 工号" /></label>
        <label>变更原因<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="本次修改的目的" rows={3} /></label>
        {err && <div className="modal-err">{err}</div>}
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={confirm}>开始编辑</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState(() => store.loadState() ?? store.initialState());
  const [sel, setSel] = useState({ kind: 'node', id: 'gw' });
  const [tool, setTool] = useState('select');
  const [connectFrom, setConnectFrom] = useState(null);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(false);
  const [tab, setTab] = useState('diff');
  const [reviewer, setReviewer] = useState('');
  const [drag, setDrag] = useState(null);
  const board = useRef();

  useEffect(() => store.saveState(state), [state]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const topo = store.canvasTopology(state);
  const head = store.headVersion(state);
  const editing = !!state.working;
  // 当前活动差异：编辑稿优先，其次待复核快照；都没有则无差异。
  const activeItem = state.working ?? state.pending;
  const activeDiff = useMemo(
    () => (activeItem ? diffTopology(store.baseTopologyOf(state, activeItem.baseVersion), activeItem.topology) : null),
    [state, activeItem],
  );
  const diffNodeClass = (id) => {
    if (!activeDiff) return '';
    if (activeDiff.nodes.added.some((n) => n.id === id)) return ' diff-added';
    if (activeDiff.nodes.changed.some((c) => c.id === id)) return ' diff-changed';
    return '';
  };
  const diffEdgeClass = (id) => {
    if (!activeDiff) return '';
    if (activeDiff.edges.added.some((e) => e.id === id)) return ' diff-added';
    if (activeDiff.edges.changed.some((c) => c.id === id)) return ' diff-changed';
    return '';
  };

  // 所有拓扑修改都必须先登记（存在编辑稿），否则弹出登记窗。
  const requireEditing = () => {
    if (editing) return true;
    setModal(true);
    setNotice('请先登记变更人和原因');
    return false;
  };
  const mutate = (fn) => {
    if (!requireEditing()) return false;
    setState((s) => store.mutateWorking(s, fn).state);
    return true;
  };

  const beginEdit = ({ editor, reason, baseVersion }) => {
    const r = store.beginEdit(state, { editor, reason, baseVersion });
    if (r.error) return setNotice(r.error);
    setState(r.state);
    setModal(false);
    setNotice(`已登记变更（基线 v${baseVersion}），开始编辑`);
  };
  const submit = () => {
    const r = store.submitWorking(state);
    if (r.error) return setNotice(r.error);
    setState(r.state);
    setTab('review');
    setNotice(r.queued ? '存在未复核快照，本次编辑已排队' : '已提交复核，差异等待复核');
  };
  const cancelEdit = () => {
    setState((s) => store.cancelWorking(s));
    setNotice('已放弃本次编辑');
  };
  const approve = () => {
    const r = store.approve(state, reviewer);
    if (r.error) return setNotice(r.error);
    setState(r.state);
    setNotice(`复核通过，差异已冻结为 v${r.version}`);
  };
  const reject = () => {
    const r = store.reject(state, reviewer);
    if (r.error) return setNotice(r.error);
    setState(r.state);
    setNotice('已驳回，仅撤销本次编辑');
  };

  const onNodeClick = (id) => {
    if (tool === 'connect') {
      if (!requireEditing()) return;
      if (!connectFrom) return setConnectFrom(id);
      if (connectFrom === id) return setConnectFrom(null);
      if (hasEdge(topo, connectFrom, id)) setNotice('两个节点之间已存在连接');
      else if (mutate((t) => addEdge(t, connectFrom, id))) setNotice('连接已创建');
      setConnectFrom(null);
      setTool('select');
      return;
    }
    setSel({ kind: 'node', id });
  };
  const onEdgeClick = (id) => {
    if (tool === 'connect') return;
    setSel({ kind: 'edge', id });
  };

  const move = (e) => {
    if (!drag) return;
    const r = board.current.getBoundingClientRect();
    setState((s) => store.mutateWorking(s, (t) => moveNode(t, drag, e.clientX - r.left, e.clientY - r.top)).state);
  };

  const validate = () => {
    const isolated = findIsolated(topo);
    setNotice(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(topo, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    setNotice('JSON 已导出');
  };

  const selNode = sel.kind === 'node' ? topo.nodes.find((n) => n.id === sel.id) : null;
  const selEdge = sel.kind === 'edge' ? topo.edges.find((e) => e.id === sel.id) : null;
  const status = state.pending ? '待复核' : editing ? '编辑中' : '已冻结';

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>拓扑快照差异复核台</small></div></div>
        <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>基线版本 v{head.version} · {fmtTime(head.approvedAt)}</small></div></div>
        <div className="top-actions">
          <span className={`status-chip ${state.pending ? 'warn' : editing ? 'busy' : 'ok'}`}>{status}</span>
          <button onClick={validate}>✓ 检查</button>
          <button onClick={exportJson}>↓ 导出</button>
          {editing
            ? <button className="save" onClick={submit}>{state.pending ? '加入排队' : '提交复核'}</button>
            : <button className="save" onClick={() => setModal(true)}>✎ 登记变更</button>}
        </div>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <span>工具</span>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => { setTool('select'); setConnectFrom(null); }}>↖ 选择</button>
          <button className={tool === 'connect' ? 'on' : ''} onClick={() => { if (requireEditing()) { setTool('connect'); setConnectFrom(null); } }}>⌁ 连接</button>
          <button onClick={() => { if (mutate((t) => addNode(t, 'device'))) setNotice('已添加设备'); }}>＋ 设备</button>
        </div>
        <div className="tool-group session">
          {editing ? (
            <>
              <span className="session-info">变更中 · {state.working.editor} · 基线 v{state.working.baseVersion}</span>
              <button onClick={cancelEdit}>放弃变更</button>
            </>
          ) : (
            <span className="session-info dim">{state.pending ? '存在未复核快照，新编辑将进入排队' : '无进行中的变更'}</span>
          )}
          {state.queue.length > 0 && <span className="queue-badge">排队 {state.queue.length}</span>}
        </div>
      </div>

      <div className="workspace">
        <aside className="inventory">
          <div className="section-title"><span>设备库</span><small>{topo.nodes.length} 个节点</small></div>
          <div className="device-types">
            {Object.entries(NODE_TYPES).map(([t, label]) => (
              <button key={t} onClick={() => { if (mutate((tp) => addNode(tp, t))) setNotice(`已添加${label}`); }}>
                <i className={t}>{NODE_ICONS[t]}</i>{label}<span>＋</span>
              </button>
            ))}
          </div>
          <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
          <div className="node-list">
            {topo.nodes.map((n) => (
              <button className={selNode?.id === n.id ? 'sel' : ''} onClick={() => setSel({ kind: 'node', id: n.id })} key={n.id}>
                <i className={n.type}>{NODE_ICONS[n.type]}</i>
                <span><strong>{n.name}</strong><small>{n.ip}</small></span>
                {activeDiff && (activeDiff.nodes.added.some((x) => x.id === n.id)
                  ? <b className="tag added">新</b>
                  : activeDiff.nodes.changed.some((x) => x.id === n.id) ? <b className="tag changed">改</b> : <b>›</b>)}
              </button>
            ))}
          </div>
        </aside>

        <section className="canvas-wrap">
          <div className="canvas" ref={board} onMouseMove={move} onMouseUp={() => setDrag(null)}>
            {topo.edges.map((e) => {
              const n1 = topo.nodes.find((n) => n.id === e.from);
              const n2 = topo.nodes.find((n) => n.id === e.to);
              if (!n1 || !n2) return null;
              const dx = n2.x - n1.x, dy = n2.y - n1.y;
              const len = Math.hypot(dx, dy), ang = (Math.atan2(dy, dx) * 180) / Math.PI;
              return (
                <div
                  className={'edge' + (selEdge?.id === e.id ? ' picked' : '') + diffEdgeClass(e.id)}
                  key={e.id}
                  style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onClick={() => onEdgeClick(e.id)}
                  title={e.label}
                >
                  <span className="line"></span><span className="arrow"></span>
                </div>
              );
            })}
            {topo.nodes.map((n) => (
              <button
                className={'node ' + n.type + (selNode?.id === n.id ? ' picked' : '') + (connectFrom === n.id ? ' connect-from' : '') + diffNodeClass(n.id)}
                style={{ left: n.x - 42, top: n.y - 31 }}
                onMouseDown={(e) => { e.stopPropagation(); if (tool === 'select' && editing) setDrag(n.id); }}
                onClick={() => onNodeClick(n.id)}
                key={n.id}
              >
                <i>{NODE_ICONS[n.type]}</i><strong>{n.name}</strong><small>{n.ip}</small>
              </button>
            ))}
            <div className="legend">
              <span><i className="router"></i>路由器</span>
              <span><i className="switch"></i>交换机</span>
              <span><i className="server"></i>服务器</span>
              {activeDiff && !diffIsEmpty(activeDiff) && (<><span><i className="lg-added"></i>新增</span><span><i className="lg-changed"></i>变更</span></>)}
            </div>
          </div>
          <div className="canvas-footer">
            <span>{tool === 'connect' ? (connectFrom ? '点击目标节点完成连接' : '点击第一个节点开始连接') : '拖动节点调整位置'} · {topo.edges.length} 条连接</span>
            <span>{activeDiff && !diffIsEmpty(activeDiff) ? <>差异：<DiffBadge diff={activeDiff} /></> : '与基线一致'}</span>
          </div>
        </section>

        <aside className="inspector">
          <div className="tabs">
            <button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>属性</button>
            <button className={tab === 'diff' ? 'on' : ''} onClick={() => setTab('diff')}>差异{activeDiff && !diffIsEmpty(activeDiff) ? ' ●' : ''}</button>
            <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>复核{state.pending ? ' ●' : ''}</button>
          </div>

          {tab === 'props' && (
            selEdge ? (
              <>
                <div className="section-title"><span>连线属性</span><small>{selEdge.id}</small></div>
                <label>链路名称<input value={selEdge.label} disabled={!editing}
                  onChange={(e) => mutate((t) => updateEdge(t, selEdge.id, { label: e.target.value }))} /></label>
                <label>端点<input value={`${topo.nodes.find((n) => n.id === selEdge.from)?.name ?? selEdge.from} ↔ ${topo.nodes.find((n) => n.id === selEdge.to)?.name ?? selEdge.to}`} disabled /></label>
                <div className="inspector-actions">
                  <button className="danger" onClick={() => { if (mutate((t) => removeEdge(t, selEdge.id))) { setSel({ kind: 'node', id: selEdge.from }); setNotice('连线已删除'); } }}>删除连线</button>
                </div>
              </>
            ) : selNode ? (
              <>
                <div className="section-title"><span>属性</span><small>{selNode.type}</small></div>
                <label>设备名称<input value={selNode.name} disabled={!editing} onChange={(e) => mutate((t) => updateNode(t, selNode.id, { name: e.target.value }))} /></label>
                <label>IP 地址<input value={selNode.ip} disabled={!editing} onChange={(e) => mutate((t) => updateNode(t, selNode.id, { ip: e.target.value }))} /></label>
                <label>设备类型<select value={selNode.type} disabled={!editing} onChange={(e) => mutate((t) => updateNode(t, selNode.id, { type: e.target.value }))}>
                  {Object.entries(NODE_TYPES).map(([v, l]) => <option value={v} key={v}>{l}</option>)}
                </select></label>
                <div className="inspector-actions">
                  <button onClick={() => { if (requireEditing()) { setTool('connect'); setConnectFrom(selNode.id); } }}>⌁ 添加连接</button>
                  <button className="danger" onClick={() => { if (mutate((t) => removeNode(t, selNode.id))) { setSel({ kind: 'node', id: topo.nodes.find((n) => n.id !== selNode.id)?.id }); setNotice('设备已删除'); } }}>删除设备</button>
                </div>
                <div className="connections">
                  <div className="section-title"><span>连接</span><small>{topo.edges.filter((e) => e.from === selNode.id || e.to === selNode.id).length} 条</small></div>
                  {topo.edges.filter((e) => e.from === selNode.id || e.to === selNode.id).map((e) => {
                    const other = topo.nodes.find((n) => n.id === (e.from === selNode.id ? e.to : e.from));
                    return (
                      <div className="connection link" key={e.id} onClick={() => setSel({ kind: 'edge', id: e.id })}>
                        <span className={'mini ' + other?.type}></span><strong>{other?.name}</strong><small>{e.label || '链路'}</small>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : <p className="empty-hint">选择一个设备或连线</p>
          )}

          {tab === 'diff' && (
            activeDiff && !diffIsEmpty(activeDiff) ? (
              <>
                <div className="section-title">
                  <span>{state.working ? '编辑稿差异' : '待复核差异'}</span>
                    <small>基线 v{activeItem.baseVersion} · {activeItem.editor}</small>
                </div>
                <DiffView diff={activeDiff} base={store.baseTopologyOf(state, activeItem.baseVersion)} next={activeItem.topology} />
              </>
            ) : <p className="empty-hint">当前无差异：画布内容与基线 v{head.version} 一致</p>
          )}

          {tab === 'review' && (
            <div className="review-panel">
              <div className="section-title"><span>待复核快照</span><small>{state.pending ? '1 项' : '无'}</small></div>
              {state.pending ? (
                <div className="pending-card">
                  <div className="kv"><span>变更人</span><strong>{state.pending.editor}</strong></div>
                  <div className="kv"><span>原因</span><strong>{state.pending.reason}</strong></div>
                  <div className="kv"><span>基线</span><strong>v{state.pending.baseVersion}</strong></div>
                  <div className="kv"><span>提交时间</span><strong>{fmtTime(state.pending.submittedAt)}</strong></div>
                  <div className="kv"><span>差异</span><DiffBadge diff={diffTopology(store.baseTopologyOf(state, state.pending.baseVersion), state.pending.topology)} /></div>
                  <label>复核人<input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="复核人姓名" /></label>
                  <div className="review-actions">
                    <button className="approve" onClick={approve}>✓ 通过并冻结</button>
                    <button className="reject" onClick={reject}>✕ 驳回</button>
                  </div>
                </div>
              ) : <p className="empty-hint">没有待复核的快照</p>}

              <div className="section-title queue-title"><span>排队队列</span><small>{state.queue.length} 项</small></div>
              {state.queue.map((q, i) => {
                const prevTopo = i === 0 ? state.pending.topology : state.queue[i - 1].topology;
                return (
                  <div className="queue-item" key={q.id}>
                    <div className="queue-head"><strong>#{i + 1} {q.editor}</strong><DiffBadge diff={diffTopology(prevTopo, q.topology)} /></div>
                    <small>{q.reason} · 登记于 {fmtTime(q.createdAt)}</small>
                  </div>
                );
              })}

              <div className="section-title queue-title"><span>版本链</span><small>{state.versions.length} 个版本</small></div>
              {[...state.versions].reverse().map((v, i, arr) => {
                const prev = state.versions[state.versions.indexOf(v) - 1];
                return (
                  <details className="version-item" key={v.version}>
                    <summary>
                      <strong>v{v.version}</strong>
                      <span>{v.reason}</span>
                      <DiffBadge diff={v.diff} />
                    </summary>
                    <div className="version-detail">
                      <div className="kv"><span>变更人</span><strong>{v.editor}</strong></div>
                      <div className="kv"><span>复核人</span><strong>{v.reviewer}</strong></div>
                      <div className="kv"><span>冻结时间</span><strong>{fmtTime(v.approvedAt)}</strong></div>
                      {prev && !diffIsEmpty(v.diff) && <DiffView diff={v.diff} base={prev.topology} next={v.topology} />}
                      {(!prev || diffIsEmpty(v.diff)) && <small className="dim">无差异内容</small>}
                    </div>
                  </details>
                );
              })}

              {state.rejected.length > 0 && (
                <>
                  <div className="section-title queue-title"><span>驳回记录</span><small>{state.rejected.length} 条</small></div>
                  {state.rejected.map((r) => (
                    <div className="queue-item rejected" key={r.id}>
                      <div className="queue-head"><strong>{r.editor}</strong><b className="tag removed">已驳回</b></div>
                      <small>{r.reason} · {r.reviewer} 驳回于 {fmtTime(r.rejectedAt)}</small>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {modal && <RegisterModal versions={state.versions} onCancel={() => setModal(false)} onConfirm={beginEdit} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
