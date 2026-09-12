"use client";

import {
  AI_COMPANIES,
  AI_SOURCES,
  aiCompany,
  industryEvent,
  AiCompanyId,
  AiService,
} from "./agiIndustry";
import {
  AiState,
  actAi,
  aiBlocked,
  aiCost,
  aiEffectiveProduct,
  aiValuation,
  aiTeacherBlock,
  decideAiEvent,
  setAiOperating,
  AI_ACTIONS,
} from "./agiEngine";
import { money } from "./core";
import styles from "./agiIndustry.module.css";

function Sources({ ids }: { ids: string[] }) {
  return (
    <details className={styles.sources}>
      <summary>素材出处与改编说明</summary>
      <p>
        虚构公司与游戏数值借鉴公开路线和社区梗，不是对真实厂商的能力排名。官方声明中的指控仅代表声明方；未证实的轶事按虚构桥段处理。
      </p>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={AI_SOURCES[id].url} target="_blank" rel="noreferrer">
              {AI_SOURCES[id].title} ↗
            </a>
            <small>{AI_SOURCES[id].basis}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
export function AgiCompanyPicker({
  game,
  choose,
}: {
  game: AiState;
  choose: (id: AiCompanyId) => void;
}) {
  const company = aiCompany(game.industry.company);
  return (
    <div className={styles.picker}>
      <p className={styles.caption}>11 种经营路线 · 虚构厂商，现实灵感</p>
      <div className={styles.companyGrid}>
        {AI_COMPANIES.map((c) => (
          <button
            key={c.id}
            data-company={c.id}
            aria-pressed={c.id === company.id}
            onClick={() => choose(c.id)}
          >
            <span style={{ background: c.color }} className={styles.mark}>
              {c.mark}
            </span>
            <span>
              <strong>{c.name}</strong>
              <small>{c.prototype}</small>
            </span>
          </button>
        ))}
      </div>
      <div className={styles.profile} style={{ borderColor: company.color }}>
        <span>{company.models}</span>
        <h3>{company.slogan}</h3>
        <p>{company.trait}</p>
        <p>
          <b>专长：{company.specialty}</b>
          <br />
          {company.specialHint}
        </p>
      </div>
      <Sources ids={company.sourceIds} />
    </div>
  );
}
export function AgiIndustryScene({
  game,
  change,
}: {
  game: AiState;
  change: (s: AiState) => void;
}) {
  const company = aiCompany(game.industry.company);
  const event = industryEvent(game.industry.eventId);
  return (
    <section className={styles.industry} aria-label="厂商与行业事件">
      <div className={styles.companyTitle}>
        <span style={{ background: company.color }} className={styles.mark}>
          {company.mark}
        </span>
        <div>
          <h2>
            {company.name}
            <small>{company.prototype} 灵感</small>
          </h2>
          <p>{game.industry.statement}</p>
        </div>
      </div>
      <div className={styles.stats}>
        {[
          ["可靠性", game.industry.reliability],
          ["视频能力", game.industry.video],
          ["开源生态", game.industry.ecosystem],
          ["市场预期", game.industry.hype],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {value}
              <small> / 100</small>
            </strong>
            <meter min={0} max={100} value={value} aria-label={String(label)} />
          </div>
        ))}
      </div>
      <p className={styles.caption}>
        AGI 需要自研能力 100、算力 5、可靠性 70。模拟估值 {money(aiValuation(game))}；宣传提高融资额，交付跟不上会退订。
      </p>
      <article className={styles.event} key={`${game.turn}-${event.id}`}>
        <div className={styles.eventLabel}>
          <span>本季行业事件</span>
          <small>{event.basis}</small>
        </div>
        <h3>{event.title}</h3>
        <p>{event.text}</p>
        {game.industry.eventResolved ? (
          <div className={styles.resolved} role="status">
            ✓ {game.industry.eventChoice}
          </div>
        ) : (
          <div className={styles.eventChoices}>
            {event.choices.map((c) => {
              const poor = game.cash + (c.deltas.cash || 0) < 0;
              return (
                <button
                  key={c.id}
                  data-event-choice={c.id}
                  disabled={poor || !!game.ending}
                  onClick={() => change(decideAiEvent(game, c.id))}
                >
                  <strong>{c.title}</strong>
                  <span>{poor ? "资金不足" : c.detail}</span>
                </button>
              );
            })}
            <button data-event-choice="defer" disabled={!!game.ending} onClick={() => change(decideAiEvent(game, 'defer'))}>暂缓回应 · 本季不额外投入</button>
          </div>
        )}
        <Sources ids={event.sourceIds} />
      </article>
      <details className={styles.league}>
        <summary>观察同行动态 · {game.rivals.length} 家</summary>
        {game.rivals.map((r) => (
          <div className={styles.rival} key={r.company}>
            <strong>
              {r.name}
              <small>{r.focus}</small>
            </strong>
            <p>{r.latest}</p>
            <span>
              自研 {r.capability} · 发布 {r.product} · 视频 {r.video} · 生态{" "}
              {r.ecosystem} · 防线 {r.defense}
            </span>
          </div>
        ))}
      </details>
    </section>
  );
}
export function AgiIndustryControls({
  game,
  change,
}: {
  game: AiState;
  change: (s: AiState) => void;
}) {
  const company = aiCompany(game.industry.company);
  const i = game.industry;
  const specialBlock = aiBlocked(game, "special");
  const explanation: Record<AiService, string> = {
    research: "训练 +2，产品收入 ×0.8；网页仍开，每季服务成本 2 M。",
    balanced: "研发与服务兼顾；每季服务成本 3 M。",
    consumer: "训练 −2，产品收入 ×1.2；每季服务成本 6 M。",
  };
  return (
    <section className={styles.operations} aria-label="厂商经营路线">
      <fieldset className={styles.service}>
        <legend>算力分配</legend>
        {(
          [
            { id: "research", label: "研究优先" },
            { id: "balanced", label: "兼顾服务" },
            { id: "consumer", label: "To C 扩张" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            aria-pressed={i.service === mode.id}
            disabled={game.used.length > 0}
            onClick={() => change(setAiOperating(game, { service: mode.id }))}
          >
            {mode.label}
          </button>
        ))}
      </fieldset>
      <p className={styles.caption}>{explanation[i.service]} 首个行动后，本季分配锁定。</p>
      <button
        className={styles.special}
        data-action="special"
        disabled={!!specialBlock}
        onClick={() => change(actAi(game, "special"))}
      >
        <strong>{company.specialty}</strong>
        <span>{specialBlock || company.specialHint}</span>
      </button>
      <details open className={styles.routeActions}>
        <summary>后训练与多模态</summary>
        {AI_ACTIONS.filter((a) => ["posttrain", "video", "openvideo", "learn"].includes(a.id),).map((a) => {
          const block = aiBlocked(game, a.id);
          return (
            <button
              key={a.id}
              data-action={a.id}
              disabled={!!block}
              onClick={() => change(actAi(game, a.id))}
            >
              <span>
                <strong>{a.name}</strong>
                <small>{a.hint}</small>
              </span>
              <span>{block || money(aiCost(game, a.id))}</span>
            </button>
          );
        })}
      </details>
      <details className={styles.routing}>
        <summary>
          模型合作与路由{" "}
          <small>
            {i.route ? "已启用" : "未启用"} · 样本 {i.samples}
          </small>
        </summary>
        <label htmlFor="agi-teacher">
          合作上游
          <select
            id="agi-teacher"
            value={i.teacher}
            onChange={(e) => change(
                setAiOperating(game, {
                  teacher: e.target.value as AiCompanyId,
                }),
              )}
          >
            {game.rivals.map((r) => (
              <option key={r.company} value={r.company}>
                {r.name} · 发布 {r.product} · 防线 {r.defense}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!!aiTeacherBlock(game) && !i.route}
          aria-pressed={i.route}
          onClick={() => change(setAiOperating(game, { route: !i.route }))}
        >
          {i.route ? "停止合作调用" : "启用合作调用"}
        </button>
        <p>
          {aiTeacherBlock(game) ||
            `每季调用成本 ${i.company === "router" ? 4 : 8} M。对外服务能力 ${aiEffectiveProduct(game)}；自研能力仍是 ${game.capability}。`}
        </p>
        <label className={styles.consent} htmlFor="agi-sample-license">
          <input
            type="checkbox"
            id="agi-sample-license"
            checked={i.licensedData}
            disabled={!i.route || !!aiTeacherBlock(game, true)}
            onChange={(e) => change(setAiOperating(game, { licensedData: e.target.checked }))}
          />
          购买训练许可与授权任务样本
        </label>
        <p>
          {aiTeacherBlock(game, true) ||
            "每季另付 4 M，结算获得 8 份样本。消耗样本执行「学习授权样本」，才会提升自己的模型。"}
        </p>
        <Sources ids={["router", "privacy", "distill"]} />
      </details>
    </section>
  );
}
