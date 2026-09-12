'use client';

import { useEffect, useRef, useState } from 'react';
import { AiAction, AiState, AI_ACTIONS, actAi, aiBlocked, aiCost, aiDistillGain, aiDistillTarget, aiEffectiveProduct, aiIncome, aiTeacherBlock, aiTrainGain, aiUpkeep, decideAiEvent, endAiTurn, setAiDistillTarget, setAiOperating } from './agiEngine';
import { aiCompany, AiCompanyId, AiService, industryEvent } from './agiIndustry';
import { money } from './core';
import { Sources } from './AgiIndustryPanel';
import styles from './agiIndustry.module.css';

type Tab = 'research' | 'business' | 'ecosystem';
const TABS: { id: Tab; label: string; actions: AiAction[] }[] = [
  { id: 'research', label: '研发', actions: ['train', 'posttrain', 'optimize', 'compute', 'self', 'safety'] },
  { id: 'business', label: '经营', actions: ['release', 'market', 'fund', 'special'] },
  { id: 'ecosystem', label: '生态', actions: ['video', 'openvideo', 'learn'] },
];

export default function AgiTurnPanel({ game, change }: { game: AiState; change: (s: AiState) => void }) {
  const [tab, setTab] = useState<Tab>('research');
  const panel = useRef<HTMLDivElement>(null);
  const company = aiCompany(game.industry.company);
  const event = industryEvent(game.industry.eventId);
  const ready = game.industry.eventResolved;
  useEffect(() => {
    const slot = panel.current?.closest('aside');
    const focusDecision = () => {
      slot?.scrollTo({ top: 0 });
      if (slot && window.matchMedia('(max-width: 760px), (max-height: 600px)').matches) {
        const resources = document.querySelector('[aria-label="公司资源"]')?.getBoundingClientRect().height || 0;
        const anchor = slot.closest('[data-controls-slot]') || slot;
        window.scrollTo({ top: window.scrollY + anchor.getBoundingClientRect().top - resources - 12, behavior: 'instant' });
      }
    };
    focusDecision(); window.addEventListener('resize', focusDecision);
    return () => window.removeEventListener('resize', focusDecision);
  }, [game.turn, ready]);
  const switchTab = (id: Tab) => { setTab(id); panel.current?.closest('aside')?.scrollTo({ top: 0 }); };
  const distillTarget = aiDistillTarget(game);
  const distillReason = aiBlocked(game, 'distill');
  const agiReason = aiBlocked(game, 'agi');
  const actionButton = (id: AiAction) => {
    const item = AI_ACTIONS.find(a => a.id === id)!;
    const reason = aiBlocked(game, id);
    const name = id === 'special' ? company.specialty : item.name;
    const hint = id === 'train' ? `能力 +${aiTrainGain(game)}，安全 −7` : id === 'special' ? company.specialHint : item.hint;
    return (
<button className={styles.decisionAction} key={id} data-action={id} disabled={!!reason} title={reason || hint} onClick={() => change(actAi(game, id))}>
      <span><strong>{name}</strong><small>{hint}</small></span><span>{reason || money(aiCost(game, id))}</span>
    </button>
);
  };
  return (
<div ref={panel} className={styles.turnPanel} data-decision-stage={ready ? 'actions' : 'event'}>
    <div className={styles.turnHeading}><div><span>第 {game.turn} 季</span><h2>{ready ? '安排本季行动' : '先处理本季事件'}</h2></div><strong>{game.actions}<small> / 3 行动</small></strong></div>
    {!ready ? (
<article className={styles.decisionEvent}>
      <span className={styles.caption}>{event.basis} · 不消耗行动</span>
      <h3>{event.title}</h3><p>{event.text}</p>
      <div className={styles.eventChoices}>{event.choices.map(choice => {
        const poor = game.cash + (choice.deltas.cash || 0) < 0;
        return <button key={choice.id} data-event-choice={choice.id} disabled={poor} onClick={() => change(decideAiEvent(game, choice.id))}><strong>{choice.title}</strong><span>{poor ? '资金不足' : choice.detail}</span></button>;
      })}<button data-event-choice="defer" onClick={() => change(decideAiEvent(game, 'defer'))}>暂缓回应 · 本季不额外投入</button></div>
      <p className={styles.caption}>处理后，在这里继续研发或经营。</p><Sources ids={event.sourceIds} />
    </article>
) : (
<>
      <details className={styles.eventRecap}><summary>✓ {game.industry.eventChoice} · 查看本季事件</summary><p>{event.title}：{event.text}</p><Sources ids={event.sourceIds} /></details>
      <details className={styles.quarterSettings}><summary>本季方针：{({ research: '研究优先', balanced: '兼顾服务', consumer: 'To C 扩张' })[game.industry.service]} · {game.openness ? '开放权重' : '闭源商业'} <small>调整</small></summary>
        <fieldset className={styles.service}><legend>算力分配（首个行动后锁定）</legend>{([{ id: 'research', label: '研究优先' }, { id: 'balanced', label: '兼顾服务' }, { id: 'consumer', label: 'To C 扩张' }] as const).map(mode => <button key={mode.id} disabled={game.used.length > 0} aria-pressed={game.industry.service === mode.id} onClick={() => change(setAiOperating(game, { service: mode.id as AiService }))}>{mode.label}</button>)}</fieldset>
        <p className={styles.caption}>{game.industry.service === 'research' ? '训练 +2、产品收入 ×0.8，仍保留网页服务。' : game.industry.service === 'consumer' ? '训练 −2、产品收入 ×1.2，服务成本更高。' : '研发与服务兼顾。'} 预计运营 {money(aiUpkeep(game))} / 季。</p>
        <fieldset className={styles.service}><legend>发布政策（发布当季锁定）</legend>{[{ value: true, label: '开源共享' }, { value: false, label: '闭源商业' }].map(policy => <button key={policy.label} aria-pressed={game.openness === policy.value} disabled={game.used.includes('release')} onClick={() => change({ ...game, openness: policy.value })}>{policy.label}</button>)}</fieldset>
      </details>
      <div role="tablist" aria-label="行动分类" className={styles.decisionTabs}>{TABS.map(t => <button role="tab" id={`agi-tab-${t.id}`} aria-controls="agi-action-panel" key={t.id} data-decision-tab={t.id} aria-selected={tab === t.id} onClick={() => switchTab(t.id)}>{t.label}</button>)}</div>
      <div id="agi-action-panel" role="tabpanel" aria-labelledby={`agi-tab-${tab}`} className={styles.actionPanel}>
        {TABS.find(t => t.id === tab)!.actions.map(actionButton)}
        {tab === 'research' && (
<details className={styles.distillSection}>
          <summary>向同行蒸馏模型 <small>按差距追赶</small></summary>
          <label htmlFor="agi-distill-target">选择老师模型<select id="agi-distill-target" value={game.industry.distillTeacher} onChange={e => change(setAiDistillTarget(game, e.target.value as AiCompanyId))}>{game.rivals.map(r => <option key={r.company} value={r.company}>{aiCompany(r.company).name} · 发布能力 {r.product}{r.product ? r.product > game.capability ? ' · 领先' : ' · 未领先' : ' · 未发布'}</option>)}</select></label>
          <p>本体能力 <strong>{game.capability}</strong> → 老师已发布能力 <strong>{distillTarget?.product || 0}</strong></p>
          <p className={styles.caption}>学习能力差距的 60%，预计 +{aiDistillGain(game)}，不会超过老师。{distillTarget && aiCompany(distillTarget.company).open ? '开放模型训练成本较低。' : '闭源老师需要训练授权，防线可能阻止学习。'}</p>
          <button className={styles.distillButton} data-action="distill" disabled={!!distillReason} onClick={() => change(actAi(game, 'distill'))}>模型蒸馏 · {distillReason || `${money(aiCost(game, 'distill'))} / 能力 +${aiDistillGain(game)}`}</button>
        </details>
)}
        {tab === 'ecosystem' && (
<details className={styles.routing}>
          <summary>模型合作与路由 <small>样本 {game.industry.samples}</small></summary>
          <label htmlFor="agi-teacher">合作上游<select id="agi-teacher" value={game.industry.teacher} onChange={e => change(setAiOperating(game, { teacher: e.target.value as AiCompanyId }))}>{game.rivals.map(r => <option key={r.company} value={r.company}>{aiCompany(r.company).name} · 发布 {r.product} · 防线 {r.defense}</option>)}</select></label>
          <button disabled={!!aiTeacherBlock(game) && !game.industry.route} aria-pressed={game.industry.route} onClick={() => change(setAiOperating(game, { route: !game.industry.route }))}>{game.industry.route ? '停止合作调用' : '启用合作调用'}</button>
          <p>{aiTeacherBlock(game) || `每季调用费 ${game.industry.company === 'router' ? 4 : 8} M。对外服务能力 ${aiEffectiveProduct(game)}，不会直接提升本体。`}</p>
          <label className={styles.consent} htmlFor="agi-sample-license"><input id="agi-sample-license" type="checkbox" checked={game.industry.licensedData} disabled={!game.industry.route || !!aiTeacherBlock(game, true)} onChange={e => change(setAiOperating(game, { licensedData: e.target.checked }))} />购买训练许可与授权任务样本</label>
          <p>{aiTeacherBlock(game, true) || '每季另付 4 M 获得 8 份样本，再执行学习行动提升自研能力。'}</p><Sources ids={['router', 'privacy', 'distill']} />
        </details>
)}
      </div>
    </>
)}
    <div className={styles.turnFooter}>
      <div><span>剩余 {game.actions} 次行动</span><small>预计收入 {money(aiIncome(game))} · 运营 {money(aiUpkeep(game))}</small></div>
      <div><button data-action="agi" disabled={!ready || !!agiReason} title={!ready ? '先处理行业事件' : agiReason || '启动 AGI'} onClick={() => change(actAi(game, 'agi'))}>启动 AGI</button><button className={styles.endTurn} disabled={!ready} onClick={() => change(endAiTurn(game))}>结束季度 →</button></div>
      {!ready ? <small>选择上面的事件回应，随后安排本季行动。</small> : <small>{game.actions ? '可继续行动，也可以直接结算。' : '行动已用完，准备进入下一季。'} {agiReason && `AGI：${agiReason}`}</small>}
    </div>
  </div>
);
}
