import React, { useState } from 'react';
import {
  baselineOf, pendingOf, approvedOf,
  startSession, cancelSession, submitSession, approvePending, rejectPending, removeQueued,
} from '../review.js';
import { diffTopology, diffStats } from '../diff.js';
import { FIELD_LABEL, NODE_TYPE_LABEL } from '../topology.js';

const fmtTime = iso => { try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch { return iso; } };
const fmtVal = (f, v) => {
  if (v === '' || v == null) return '（空）';
  if (f === 'type') return NODE_TYPE_LABEL[v] || v;
  return String(v);
};
const statText = d => {
  const s = diffStats(d);
  return `+${s.added} −${s.removed} ~${s.changed}`;
};

// 差异视图：只列新增 / 移除 / 属性变化，未变化内容不出现。
function DiffView({ diff, base, next }) {
  const nameOf = (topo, id) => topo?.nodes.find(n => n.id === id)?.name || id;
  const edgeName = (topo, e) => `${nameOf(topo, e.a)} ↔ ${nameOf(topo, e.b)}`;
  if (!diff || diff.empty) return <p className="diff-empty">与基线一致，无差异。</p>;
  return (
    <div className="diff">
      {diff.nodes.added.length > 0 && (
        <div className="diff-group"><h5>新增节点<small>{diff.nodes.added.length}</small></h5>
          {diff.nodes.added.map(n => <div className="diff-item add" key={n.id}><strong>{n.name}</strong><small>{NODE_TYPE_LABEL[n.type]} · {n.ip}</small></div>)}
        </div>
      )}
      {diff.nodes.removed.length > 0 && (
        <div className="diff-group"><h5>移除节点<small>{diff.nodes.removed.length}</small></h5>
          {diff.nodes.removed.map(n => <div className="diff-item del" key={n.id}><strong>{n.name}</strong><small>{NODE_TYPE_LABEL[n.type]} · {n.ip}</small></div>)}
        </div>
      )}
      {diff.nodes.changed.length > 0 && (
        <div className="diff-group"><h5>变更节点<small>{diff.nodes.changed.length}</small></h5>
          {diff.nodes.changed.map(c => (
            <div className="diff-item chg" key={c.id}>
              <strong>{c.item.name}</strong>
              {c.fields.map(f => (
                <span className="chg-line" key={f.field}><em>{FIELD_LABEL[f.field] || f.field}</em>{fmtVal(f.field, f.before)} → {fmtVal(f.field, f.after)}</span>
              ))}
            </div>
          ))}
        </div>
      )}
      {diff.edges.added.length > 0 && (
        <div className="diff-group"><h5>新增连线<small>{diff.edges.added.length}</small></h5>
          {diff.edges.added.map(e => <div className="diff-item add" key={e.id}><strong>{edgeName(next, e)}</strong><small>{e.label || '无标签'}</small></div>)}
        </div>
      )}
      {diff.edges.removed.length > 0 && (
        <div className="diff-group"><h5>移除连线<small>{diff.edges.removed.length}</small></h5>
          {diff.edges.removed.map(e => <div className="diff-item del" key={e.id}><strong>{edgeName(base, e)}</strong><small>{e.label || '无标签'}</small></div>)}
        </div>
      )}
      {diff.edges.changed.length > 0 && (
        <div className="diff-group"><h5>变更连线<small>{diff.edges.changed.length}</small></h5>
          {diff.edges.changed.map(c => (
            <div className="diff-item chg" key={c.id}>
              <strong>{edgeName(next, c.item)}</strong>
              {c.fields.map(f => (
                <span className="chg-line" key={f.field}><em>{FIELD_LABEL[f.field] || f.field}</em>{fmtVal(f.field, f.before)} → {fmtVal(f.field, f.after)}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewPanel({ state, act }) {
  const baseline = baselineOf(state);
  const pending = pendingOf(state);
  const approved = approvedOf(state);
  const rejected = state.snapshots.filter(x => x.status === 'rejected').sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));

  const [editor, setEditor] = useState('');
  const [reason, setReason] = useState('');
  const [baseId, setBaseId] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(null);

  const baseSel = approved.some(a => a.id === baseId) ? baseId : baseline.id;
  const sess = state.session;
  const sessBase = sess ? state.snapshots.find(x => x.id === sess.baseSnapshotId) : null;
  const liveDiff = sess ? diffTopology(sessBase.topo, state.draft) : null;
  const pendingBase = pending ? state.snapshots.find(x => x.id === pending.baseSnapshotId) : null;

  return (
    <div className="review">
      <div className="rv-status">
        <div><small>当前基线</small><strong>v{baseline.version}</strong></div>
        <div><small>待复核</small><strong>{pending ? pending.id : '无'}</strong></div>
        <div><small>排队</small><strong>{state.queue.length} 项</strong></div>
      </div>

      {sess ? (
        <div className="rv-card session-card">
          <h4>变更进行中<small>{sess.queued ? '提交后排队' : '提交后复核'}</small></h4>
          <p className="meta">{sess.editor} · {sess.reason}</p>
          <p className="meta">基线：v{sessBase?.version} · {sessBase?.editor}</p>
          <DiffView diff={liveDiff} base={sessBase?.topo} next={state.draft} />
          <div className="rv-actions">
            <button className="primary" onClick={() => { if (act(submitSession)) setReason(''); }}>{sess.queued ? '加入排队' : '提交复核'}</button>
            <button onClick={() => act(cancelSession)}>放弃变更</button>
          </div>
        </div>
      ) : (
        <div className="rv-card">
          <h4>登记变更</h4>
          {pending && <p className="warn">存在未复核快照，新变更只能排队，基线锁定为 v{baseline.version}，不可覆盖。</p>}
          <label>变更人<input value={editor} onChange={e => setEditor(e.target.value)} placeholder="姓名 / 工号" /></label>
          <label>变更原因<input value={reason} onChange={e => setReason(e.target.value)} placeholder="本次修改的目的" /></label>
          <label>基线快照
            <select value={baseSel} disabled={!!pending} onChange={e => setBaseId(e.target.value)}>
              {approved.map(a => <option value={a.id} key={a.id}>v{a.version} · {a.editor} · {a.reason}</option>)}
            </select>
          </label>
          <div className="rv-actions">
            <button className="primary" onClick={() => act(startSession, { editor, reason, baseSnapshotId: baseSel })}>
              {pending ? '开始变更（排队）' : '开始变更'}
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="rv-card pending-card">
          <h4>待复核快照<small>{pending.id}</small></h4>
          <p className="meta">{pending.editor} · {pending.reason}</p>
          <p className="meta">提交于 {fmtTime(pending.createdAt)} · 基于 v{pendingBase?.version}</p>
          <DiffView diff={pending.diff} base={pendingBase?.topo} next={pending.topo} />
          <label>复核人<input value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="复核人姓名" /></label>
          <label>复核意见<input value={note} onChange={e => setNote(e.target.value)} placeholder="可选" /></label>
          <div className="rv-actions">
            <button className="primary" onClick={() => act(approvePending, { reviewer, note })}>通过 · 冻结为新版本</button>
            <button className="danger" onClick={() => act(rejectPending, { reviewer, note })}>驳回本次编辑</button>
          </div>
        </div>
      )}

      {state.queue.length > 0 && (
        <div className="rv-card">
          <h4>排队中的变更<small>{state.queue.length}</small></h4>
          {state.queue.map((q, i) => (
            <div className="queue-item" key={q.id}>
              <span className="qpos">{i + 1}</span>
              <span className="qmeta">
                <strong>{q.editor}</strong>
                <small>{q.reason} · {fmtTime(q.createdAt)}</small>
              </span>
              <button onClick={() => act(removeQueued, q.id)}>撤销</button>
            </div>
          ))}
          <p className="hint-line">复核完成后，队首变更将自动与最新基线比对并进入待复核；已被基线覆盖的排队项自动消化。</p>
        </div>
      )}

      <div className="rv-card">
        <h4>版本链<small>{approved.length} 个连续版本</small></h4>
        {[...approved].reverse().map(a => {
          const open = expanded === a.id;
          const baseSnap = a.baseSnapshotId ? state.snapshots.find(x => x.id === a.baseSnapshotId) : null;
          return (
            <div className={'version-item' + (a.id === baseline.id ? ' current' : '')} key={a.id}>
              <button className="vrow" onClick={() => a.diff && setExpanded(open ? null : a.id)}>
                <span className="vtag">v{a.version}</span>
                <span className="vmeta">
                  <strong>{a.editor} · {a.reason}</strong>
                  <small>{a.reviewedBy} 复核于 {fmtTime(a.reviewedAt)}{a.diff ? ` · ${statText(a.diff)}` : ' · 初始基线'}</small>
                </span>
                {a.id === baseline.id ? <em>当前基线</em> : a.diff ? <em className="more">{open ? '收起' : '差异'}</em> : null}
              </button>
              {open && a.diff && <DiffView diff={a.diff} base={baseSnap?.topo} next={a.topo} />}
            </div>
          );
        })}
        {rejected.length > 0 && (
          <>
            <h5 className="rej-head">已驳回（未进入版本链）</h5>
            {rejected.map(r => (
              <div className="version-item rejected" key={r.id}>
                <span className="vrow static">
                  <span className="vtag rej">驳回</span>
                  <span className="vmeta">
                    <strong>{r.editor} · {r.reason}</strong>
                    <small>{r.reviewedBy} 驳回 · {fmtTime(r.reviewedAt)}{r.reviewNote ? ` · ${r.reviewNote}` : ''}</small>
                  </span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
