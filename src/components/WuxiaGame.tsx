"use client";

import {
  BookOutlined,
  CompassOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyOutlined,
  ShareAltOutlined,
  StarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import styles from "./WuxiaGame.module.css";
import { useWuxiaGame } from "./wuxia/game/useWuxiaGame";
import { manuscriptText } from "./wuxia/game/storyArchitecture";
import {
  AMBITION_OPTIONS,
  ORIGIN_OPTIONS,
  generateName,
  getPlayerAgendaOptions,
  type AmbitionId,
  type NovelSetup,
  type NovelState,
  type OriginId,
  type StatKey,
  previewWuxiaWorld,
} from "./wuxia/game/novelEngine";
import { intentLabel, type PlayerIntent } from "./wuxia/game/wuxiaCampaign";
import {
  actorAtLocation,
  knownRelations,
  relationLabel,
  type WorldActor,
  type WorldRelation,
} from "./wuxia/game/worldSimulation";
import type { WuxiaCombatResult } from "./wuxia/game/wuxiaCombat";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type Panel = "journal" | "map" | "cast" | "settings" | null;

const STAT_META: Array<{ key: StatKey; label: string; short: string; icon: string }> = [
  { key: "martial", label: "武艺", short: "武", icon: "刃" },
  { key: "insight", label: "洞察", short: "察", icon: "目" },
  { key: "chivalry", label: "侠义", short: "义", icon: "义" },
  { key: "fame", label: "名望", short: "名", icon: "印" },
  { key: "fortune", label: "机缘", short: "缘", icon: "星" },
];

const chapterProgress = (game: NovelState) => {
  const scenes = game.narrative.chapters.find((chapter) => chapter.number === game.chapter)?.scenes.length || 0;
  return Math.min(100, Math.round((scenes / game.campaign.chapterLength) * 100));
};

const getLocationTone = (type: string) => {
  if (type === "city" || type === "inn") return styles.locationCity;
  if (type === "wild") return styles.locationWild;
  return styles.locationSect;
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brandLockup} ${compact ? styles.brandCompact : ""}`}>
      <span className={styles.brandSeal}>JH</span>
      <span>
        <strong>江湖志</strong>
        {!compact && <small>众人同行 · EMERGENT NOVEL</small>}
      </span>
    </div>
  );
}

function StartScreen({
  hasSavedGame,
  onStart,
  onContinue,
}: {
  hasSavedGame: boolean;
  onStart: (setup: Partial<NovelSetup>) => void;
  onContinue: () => void;
}) {
  const [heroName, setHeroName] = useState("沈听澜");
  const [origin, setOrigin] = useState<OriginId>("sect_disciple");
  const [ambition, setAmbition] = useState<AmbitionId>("truth");
  const [seed, setSeed] = useState("moon-ink-27");
  const initializedRandomName = useRef(false);

  const selectedOrigin = ORIGIN_OPTIONS.find((item) => item.id === origin) || ORIGIN_OPTIONS[0];
  const selectedAmbition = AMBITION_OPTIONS.find((item) => item.id === ambition) || AMBITION_OPTIONS[0];
  const worldPreview = previewWuxiaWorld(seed);

  const randomizeName = useCallback(() => {
    const entropy = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setHeroName((current) => generateName(entropy, current));
  }, []);

  useEffect(() => {
    if (initializedRandomName.current) return;
    initializedRandomName.current = true;
    randomizeName();
  }, [randomizeName]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart({ heroName, origin, ambition, sectId: selectedOrigin.sectId, seed });
  };

  const randomizeSeed = () => {
    const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 999).toString().padStart(3, "0")}`;
    setSeed(stamp);
  };

  return (
    <main className={styles.startShell}>
      <div className={styles.startAtmosphere} aria-hidden="true">
        <span className={styles.mountainLineOne} />
        <span className={styles.mountainLineTwo} />
        <span className={styles.redMoon} />
      </div>
      <div className={styles.startGrid}>
        <section className={styles.introColumn}>
          <BrandLockup />
          <p className={styles.eyebrow}>AN EMERGENT WUXIA SANDBOX</p>
          <h1>把你的名字，<em>写进江湖。</em></h1>
          <p className={styles.introLead}>
            没有预设主案。人物按目标在真实地点间移动，旧识、恩怨、招式与偶遇会把每一局写成不同的小说。
          </p>
          <div className={styles.heroPortraitWrap}>
            <div className={styles.portraitHalo} />
            <Image src={selectedOrigin.portrait} alt={`${selectedOrigin.label}形象`} className={styles.heroPortrait} width={420} height={420} priority />
            <span className={styles.portraitCaption}>「风起于青萍之末」</span>
          </div>
          <div className={styles.startNotes}>
            <span><BookOutlined /> 随机活跃人物</span>
            <span><ThunderboltOutlined /> 逐招真实演武</span>
            <span><TeamOutlined /> 关系自由生长</span>
          </div>
        </section>

        <form className={styles.setupPanel} onSubmit={handleSubmit}>
          <div className={styles.panelKicker}>开卷设定 <span>01 / 01</span></div>
          <div className={styles.setupHeader}>
            <div>
              <h2>你要以谁的身份入局？</h2>
              <p>先定下自己；其余人物会依种子获得位置、目标与旧关系。</p>
            </div>
            <span className={styles.inkStamp}>起</span>
          </div>

          <span className={styles.fieldLabel}>姓名</span>
          <div className={styles.nameField}>
            <input id="wuxia-hero-name" value={heroName} onChange={(event) => setHeroName(event.target.value)} maxLength={8} />
            <button type="button" onClick={randomizeName} title="随机姓名，不改变命数" aria-label="随机一个名字"><ReloadOutlined /></button>
          </div>

          <fieldset className={styles.choiceFieldset}>
            <legend>出身</legend>
            <div className={styles.originGrid}>
              {ORIGIN_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.originOption} ${origin === item.id ? styles.optionSelected : ""}`}
                  onClick={() => setOrigin(item.id)}
                  aria-pressed={origin === item.id}
                >
                  <span className={styles.optionGlyph}>{item.id === "sect_disciple" ? "门" : item.id === "wanderer" ? "行" : "镖"}</span>
                  <span className={styles.optionCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.choiceFieldset}>
            <legend>此行所求</legend>
            <div className={styles.ambitionGrid}>
              {AMBITION_OPTIONS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.ambitionOption} ${ambition === item.id ? styles.optionSelected : ""}`}
                  onClick={() => setAmbition(item.id)}
                  aria-pressed={ambition === item.id}
                >
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                  <span className={styles.focusHint}>偏重 · {STAT_META.find((stat) => stat.key === item.stat)?.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className={styles.seedRow}>
            <span className={styles.fieldLabel}>命数种子</span>
            <button type="button" className={styles.iconButton} onClick={randomizeSeed} title="随机命数与活跃江湖人物" aria-label="随机命数与活跃江湖人物"><ReloadOutlined /></button>
          </div>
          <input id="wuxia-seed" className={styles.seedInput} value={seed} onChange={(event) => setSeed(event.target.value)} maxLength={32} />

          <div className={styles.setupSummary}>
            <span><strong>{selectedOrigin.label}</strong> · {selectedOrigin.epithet}</span>
            <span><strong>{selectedAmbition.label}</strong> · 偏重 {STAT_META.find((stat) => stat.key === selectedAmbition.stat)?.label}</span>
          </div>
          <div className={styles.worldPreview}>
            <span>此卷活跃人物</span>
            <strong>{worldPreview.cast.slice(0, 5).map((entry) => entry.name).join(" · ")}</strong>
            <small>{worldPreview.factions.join(" / ")} · 换种子会重抽人物、位置、目标与隐秘</small>
          </div>
          <button className={styles.startButton} type="submit"><span>落笔开卷</span><span className={styles.startArrow}>↗</span></button>
          {hasSavedGame && (
            <button type="button" className={styles.continueButton} onClick={onContinue}>继续上一卷 <span>→</span></button>
          )}
          <p className={styles.setupFootnote}>角色与招式取材自项目自走棋的主播原型和关系梗 · 同种子、同选择可完整重演</p>
        </form>
      </div>
    </main>
  );
}

function StatStrip({ game }: { game: NovelState }) {
  return (
    <div className={styles.statStrip}>
      <div className={styles.healthStat}>
        <div className={styles.statTopline}><span><HeartOutlined /> 气血</span><strong>{game.hero.health}<small>/{game.hero.maxHealth}</small></strong></div>
        <div className={styles.progressTrack}><span style={{ width: `${(game.hero.health / game.hero.maxHealth) * 100}%` }} /></div>
      </div>
      {STAT_META.map((stat) => (
        <div className={styles.miniStat} key={stat.key} title={stat.label}>
          <span className={styles.miniStatIcon}>{stat.icon}</span>
          <span>{stat.short}</span>
          <strong>{game.hero.stats[stat.key]}</strong>
        </div>
      ))}
    </div>
  );
}

function HeroRail({ game, onOpen }: { game: NovelState; onOpen: (panel: Panel) => void }) {
  const ambition = AMBITION_OPTIONS.find((item) => item.id === game.hero.ambition);
  const origin = ORIGIN_OPTIONS.find((item) => item.id === game.hero.origin);
  const signature = game.narrative.martial.techniques.find((technique) => technique.id === game.narrative.martial.signatureTechniqueId)
    || game.narrative.martial.techniques[2];
  return (
    <aside className={styles.leftRail}>
      <div className={styles.heroCard}>
        <div className={styles.heroCardTop}><span className={styles.rankMark}>壹</span><span className={styles.heroOrigin}>{game.hero.epithet}</span></div>
        <div className={styles.avatarFrame}><Image src={origin?.portrait || "/images/autochess/portraits/sui.png"} alt={`${game.hero.name}的角色形象`} width={180} height={180} /></div>
        <h2>{game.hero.name}</h2>
        <p className={styles.heroSubtitle}>{game.hero.sectName} · {game.hero.art}</p>
        <div className={styles.ambitionRibbon}><StarOutlined /> 初心 · {ambition?.label} · {ambition?.description}</div>
        <div className={styles.agendaRibbon}>
          <span>当前路线</span>
          <strong>{game.campaign.agenda?.title || "尚未定下"}</strong>
          <small>{game.campaign.agenda?.primaryVerb || "先选择这一章最想做的事"}</small>
          <div><i style={{ width: `${game.campaign.agenda?.progress || 0}%` }} /></div>
        </div>
        <div className={styles.martialRibbon}>
          <div><span>本命武学</span><strong>{game.narrative.martial.name}</strong></div>
          <small>绝式 · {signature.name}</small>
          <div className={styles.martialTrack}><span style={{ width: `${game.narrative.martial.mastery}%` }} /></div>
        </div>
        <div className={styles.heroResources}>
          <div><WalletOutlined /><span>银两</span><strong>{game.hero.silver}</strong></div>
          <div><CompassOutlined /><span>线索</span><strong>{game.hero.clues}<small>/6</small></strong></div>
          <div className={game.hero.heat > 55 ? styles.dangerResource : ""}><SafetyOutlined /><span>风声</span><strong>{game.hero.heat}</strong></div>
        </div>
      </div>
      <div className={styles.railActions}>
        <button type="button" aria-label="打开江湖志" onClick={() => onOpen("journal")}><BookOutlined /><span>本卷正文</span><small>{game.narrative.chapters.reduce((total, chapter) => total + chapter.scenes.length, 0)}</small></button>
        <button type="button" aria-label="打开行路图" onClick={() => onOpen("map")}><CompassOutlined /><span>行路图</span><small>{game.discoveredLocationIds.length}/{game.locations.length}</small></button>
        <button type="button" aria-label="打开同行者" onClick={() => onOpen("cast")}><TeamOutlined /><span>同行者</span><small>{game.companions.length}/2</small></button>
      </div>
    </aside>
  );
}

function RouteMap({ game }: { game: NovelState }) {
  const edges = game.locations.flatMap((location) => location.connections
    .filter((targetId) => location.id.localeCompare(targetId) < 0)
    .map((targetId) => {
      const target = game.locations.find((entry) => entry.id === targetId);
      return target ? { from: location, to: target } : null;
    }))
    .filter((edge): edge is { from: NovelState["locations"][number]; to: NovelState["locations"][number] } => Boolean(edge));
  const currentActors = actorAtLocation(game.world, game.currentLocationId);
  return (
    <section className={styles.mapPanel}>
      <div className={styles.sectionHeading}><span>江湖行路图</span><small>第 {game.world.day} 日 · {game.discoveredLocationIds.length} 处已至</small></div>
      <div className={styles.routeMap}>
        <svg className={styles.mapConnections} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {edges.map(({ from, to }) => {
            const traversed = game.discoveredLocationIds.includes(from.id) && game.discoveredLocationIds.includes(to.id);
            return <line className={traversed ? styles.mapConnectionKnown : ""} x1={from.x} y1={from.y} x2={to.x} y2={to.y} key={`${from.id}-${to.id}`} />;
          })}
        </svg>
        {game.locations.map((location) => {
          const active = location.id === game.currentLocationId;
          const discovered = game.discoveredLocationIds.includes(location.id);
          const actors = actorAtLocation(game.world, location.id);
          return (
            <div className={`${styles.mapNode} ${active ? styles.mapNodeActive : ""} ${discovered ? styles.mapNodeKnown : ""}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} key={location.id} title={`${location.name} · ${actors.map((actor) => actor.name).join("、") || "无人停留"}`}>
              <span>{active ? "◆" : discovered ? "·" : "?"}</span>
              <small>{location.name}</small>
              {actors.length > 0 && <b className={styles.mapPresence}>{actors.length}</b>}
            </div>
          );
        })}
      </div>
      <div className={styles.currentLocation}><EnvironmentOutlined /><span><small>此刻所在 · {currentActors.length} 人同地</small><strong>{game.locations.find((location) => location.id === game.currentLocationId)?.name}</strong><em>{currentActors.map((actor) => (actor.id === "hero" ? "你" : actor.title)).join("、")}</em></span></div>
    </section>
  );
}

const encounterFate = (chance: number) => {
  if (chance >= 72) return "缘势已成";
  if (chance >= 48) return "缘路渐近";
  if (chance >= 24) return "隐有牵连";
  return "原是缘浅";
};

function WorldPulse({ game }: { game: NovelState }) {
  const latestMovements = game.world.movements.slice(-4).reverse();
  const actorName = (actorId: string) => game.world.actors.find((actor) => actor.id === actorId)?.name || actorId;
  const locationName = (locationId: string) => game.locations.find((location) => location.id === locationId)?.name || locationId;
  const encounter = game.world.encounters[game.world.encounters.length - 1];
  return (
    <section className={styles.worldPulse} aria-label="江湖动态">
      <div className={styles.sectionHeading}><span>江湖此刻</span><small>人物每日自行赶路</small></div>
      {encounter && (
        <div className={styles.encounterPulse}>
          <span>相逢机缘</span>
          <strong>{encounterFate(encounter.baseChance)} → {encounterFate(encounter.dramaticChance)}</strong>
          <p>{encounter.reason}</p>
        </div>
      )}
      <div className={styles.movementFeed}>
        {latestMovements.map((movement) => (
          <p key={`${movement.day}-${movement.actorId}-${movement.toLocationId}`}>
            <span>第{movement.day}日</span>
            <strong>{actorName(movement.actorId)}</strong>
            <small>{locationName(movement.fromLocationId)} → {locationName(movement.toLocationId)}</small>
          </p>
        ))}
        {latestMovements.length === 0 && <p className={styles.worldQuiet}>众人尚未启程。</p>}
      </div>
    </section>
  );
}

function CompanionPanel({ game }: { game: NovelState }) {
  const visibleCast = game.narrative.cast.filter((character) => character.firstSeenTurn !== undefined);
  return (
    <section className={styles.castPanel}>
      <div className={styles.sectionHeading}><span>人物关系</span><small>{visibleCast.length ? "选择会留下关系" : "尚未谋面"}</small></div>
      {visibleCast.length === 0 ? (
        <div className={styles.emptyCast}><span>—</span><p>江湖还很大，先把自己的名字写稳。</p></div>
      ) : visibleCast.slice(-3).map((character) => {
        const actor = game.world.actors.find((entry) => entry.characterId === character.id);
        const location = game.locations.find((entry) => entry.id === actor?.locationId);
        return (
          <div className={styles.companionRow} key={character.id}>
            <Image src={character.portrait} alt="" width={76} height={76} />
            <div><strong>{character.name}</strong><small>{location?.name || "行踪不明"} · {actor?.activity || character.status}</small><div className={styles.affinityTrack}><span style={{ width: `${character.relationship.trust}%` }} /></div></div>
            <b>{character.relationship.label}</b>
          </div>
        );
      })}
    </section>
  );
}

const INTENT_OPTIONS: Array<{ id: PlayerIntent; label: string }> = [
  { id: "befriend", label: "结交" },
  { id: "romance", label: "倾心" },
  { id: "learn", label: "讨教" },
  { id: "revenge", label: "复仇" },
  { id: "observe", label: "留意" },
];

const activityIcon = (kind: NovelState["campaign"]["availableActivities"][number]["kind"]) => {
  if (kind === "train" || kind === "invent") return <ThunderboltOutlined />;
  if (kind === "bond" || kind === "pursue") return <HeartOutlined />;
  if (kind === "travel" || kind === "opportunity") return <CompassOutlined />;
  if (kind === "rest") return <SafetyOutlined />;
  if (kind === "found_sect") return <TeamOutlined />;
  return <BookOutlined />;
};

function AgendaChooser({ game, onSelect, compact = false, onCancel }: {
  game: NovelState;
  onSelect: (agendaId: string) => void;
  compact?: boolean;
  onCancel?: () => void;
}) {
  const options = getPlayerAgendaOptions(game);
  return (
    <section className={`${styles.agendaChooser} ${compact ? styles.agendaChooserCompact : ""}`} aria-label="选择长期路线">
      <header>
        <span>这一章，你想主动走哪条路？</span>
        <h2>{game.hero.origin === "sect_disciple" ? "山门就在身后，下一步由你定" : "先定眼下所求，再安排今日行程"}</h2>
        <p>路线只影响优先行动，不会锁死内容；下一章或平日计划时都能更换。</p>
        {onCancel && <button type="button" onClick={onCancel} aria-label="收起路线选择"><CloseOutlined /></button>}
      </header>
      <div className={styles.agendaOptions}>
        {options.map((agenda, index) => (
          <button
            type="button"
            className={`${styles.agendaOption} ${styles[`agendaTone${agenda.tone}`]}`}
            key={agenda.id}
            onClick={() => onSelect(agenda.id)}
          >
            <span className={styles.agendaIndex}>0{index + 1}</span>
            <span className={styles.agendaOptionBody}>
              <small>{agenda.primaryVerb}</small>
              <strong>{agenda.title}</strong>
              <em>{agenda.subtitle}</em>
              <p>{agenda.description}</p>
            </span>
            <span className={styles.choiceArrow}>↗</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LeadIntentBoard({ game, onIntent, onPause }: {
  game: NovelState;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
}) {
  const leads = game.campaign.leads
    .filter((lead) => lead.kind === "person" && !["resolved", "expired"].includes(lead.status))
    .slice(0, 3);
  if (!leads.length) return null;
  return (
    <section className={styles.leadIntentBoard} aria-label="人物追寻目标">
      <div className={styles.planningSectionTitle}><span>人物追寻</span><small>可以改变心意，也可以暂缓</small></div>
      <div className={styles.leadRows}>
        {leads.map((lead) => {
          const actor = game.world.actors.find((entry) => entry.id === lead.targetActorId);
          const location = game.locations.find((entry) => entry.id === actor?.locationId);
          return (
            <article className={lead.status === "active" ? styles.leadActive : ""} key={lead.id}>
              <div className={styles.leadIdentity}>
                <span><strong>{actor?.name || lead.title}</strong><small>{actor?.title || "人物线索"} · {location?.name || "行踪未明"}</small></span>
                <button type="button" onClick={() => onPause(lead.id)} disabled={lead.status === "paused"}>{lead.status === "active" ? "暂缓" : "已暂缓"}</button>
              </div>
              <p>{lead.summary}</p>
              <div className={styles.intentSegments} aria-label={`对${actor?.name || "此人"}的心意`}>
                {INTENT_OPTIONS.map((intent) => (
                  <button
                    type="button"
                    key={intent.id}
                    aria-pressed={lead.status === "active" && lead.intent === intent.id}
                    onClick={() => onIntent(lead.id, intent.id)}
                  >
                    {intent.label}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PlanningBoard({ game, onSelectAgenda, onActivity, onIntent, onPause }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
}) {
  const [changingAgenda, setChangingAgenda] = useState(false);
  const agenda = game.campaign.agenda!;
  const openOpportunities = game.campaign.opportunities
    .filter((opportunity) => ["announced", "open"].includes(opportunity.status))
    .sort((left, right) => left.endDay - right.endDay)
    .slice(0, 3);
  if (changingAgenda) {
    return <AgendaChooser game={game} compact onSelect={(agendaId) => { onSelectAgenda(agendaId); setChangingAgenda(false); }} onCancel={() => setChangingAgenda(false)} />;
  }
  return (
    <section className={styles.planningBoard} aria-label="安排今日行程">
      <header className={styles.planningHeader}>
        <div>
          <span>第 {game.world.day} 日 · {game.locations.find((location) => location.id === game.currentLocationId)?.name}</span>
          <h2>{agenda.title}</h2>
          <p>{agenda.description}</p>
        </div>
        <button type="button" onClick={() => setChangingAgenda(true)}><ReloadOutlined /> 更换路线</button>
      </header>
      <div className={styles.agendaProgress}>
        <span><small>当前所求</small><strong>{agenda.primaryVerb}</strong></span>
        <div><i style={{ width: `${agenda.progress}%` }} /></div>
        <em>{agenda.completedSteps} 次主动安排</em>
      </div>
      <div className={styles.campaignLedger} aria-label="生涯积累">
        <span><small>武学领悟</small><strong>{game.campaign.legacy.martialInsights}</strong></span>
        <span><small>江湖名望</small><strong>{game.hero.stats.fame}</strong></span>
        <span><small>追随者</small><strong>{game.campaign.legacy.followers}</strong></span>
        <span><small>自创武学</small><strong>{game.campaign.legacy.authoredTechniques.length}</strong></span>
      </div>

      {openOpportunities.length > 0 && (
        <section className={styles.opportunityTicker} aria-label="江湖机会">
          <div className={styles.planningSectionTitle}><span>正在发生的江湖</span><small>地点与期限都是真实世界状态</small></div>
          <div>
            {openOpportunities.map((opportunity) => (
              <p key={opportunity.id}>
                <span>{opportunity.status === "open" ? "进行中" : `第${opportunity.startDay}日开场`}</span>
                <strong>{opportunity.shortTitle}</strong>
                <small>{game.locations.find((location) => location.id === opportunity.locationId)?.name} · 第{opportunity.endDay}日收场</small>
              </p>
            ))}
          </div>
        </section>
      )}

      <LeadIntentBoard game={game} onIntent={onIntent} onPause={onPause} />

      <section className={styles.activityPlanner} aria-label="可安排活动">
        <div className={styles.planningSectionTitle}><span>今日做什么？</span><small>选择行动后，才会生成对应的一幕</small></div>
        <div className={styles.activityGrid}>
          {game.campaign.availableActivities.map((activity, index) => (
            <button
              type="button"
              className={`${styles.activityOption} ${styles[`agendaTone${activity.tone}`]}`}
              key={activity.id}
              disabled={!activity.enabled}
              onClick={() => onActivity(activity.id)}
            >
              <span className={styles.activityNumber}>{index + 1}</span>
              <span className={styles.activityGlyph}>{activityIcon(activity.kind)}</span>
              <span className={styles.activityBody}>
                <strong>{activity.title}</strong>
                <small>{activity.description}</small>
                <em>{activity.enabled ? activity.preview.join(" · ") : activity.unavailableReason}</em>
              </span>
              <span className={styles.choiceArrow}>↗</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function ChapterBreakView({ game, onContinue }: { game: NovelState; onContinue: () => void }) {
  const milestone = game.campaign.chapterMilestone;
  if (!milestone) return null;
  const unresolved = milestone.unresolvedLeadIds.length;
  return (
    <section className={styles.chapterBreak} aria-label={`第${milestone.chapter}章小结`}>
      <span className={styles.chapterBreakKicker}>第 {milestone.chapter} 章 · 已写成</span>
      <h2>{milestone.title}</h2>
      <p className={styles.chapterBreakEpigraph}>{milestone.epigraph}</p>
      <p className={styles.chapterBreakSummary}>{milestone.summary}</p>
      <div className={styles.chapterAchievements}>
        {milestone.achievements.map((achievement) => <p key={achievement}><StarOutlined /><span>{achievement}</span></p>)}
      </div>
      <div className={styles.chapterCarryover}>
        <span><strong>{unresolved}</strong><small>条人物、机会或传闻仍可继续</small></span>
        <span><strong>{game.world.day}</strong><small>日，世界人物照常行路</small></span>
        <span><strong>{game.campaign.legacy.martialInsights}</strong><small>段武学领悟已保留</small></span>
      </div>
      <button type="button" className={styles.chapterContinue} onClick={onContinue} aria-label="开启下一章">
        <span><small>故事不会在这里结束</small><strong>开启下一章</strong></span><span className={styles.startArrow}>↗</span>
      </button>
    </section>
  );
}

const qualitativePreviewValue = (value: string) => {
  const numeric = value.match(/^([+-])(\d+)$/);
  if (!numeric) return value;
  const amount = Number(numeric[2]);
  if (numeric[1] === "+") return amount <= 3 ? "略有增长" : amount <= 7 ? "有所增长" : "显著增长";
  return amount <= 3 ? "略有消耗" : amount <= 8 ? "有所消耗" : "消耗明显";
};

const qualitativeOutcomeValue = (value: string) => {
  const simple = qualitativePreviewValue(value);
  if (simple !== value) return simple;
  if (/新增\s*\d+\s*人/.test(value)) return "有人正式署名";
  if (/揭开\s*\d+\s*条/.test(value)) return "有了新的发现";
  if (/往来[+-]\d+.*戒心[+-]\d+/.test(value)) {
    const favor = Number(value.match(/往来([+-]\d+)/)?.[1] || 0);
    const pressure = Number(value.match(/戒心([+-]\d+)/)?.[1] || 0);
    const favorText = favor > 0 ? "往来转暖" : favor < 0 ? "往来转冷" : "往来未改";
    const pressureText = pressure > 0 ? "戒心加深" : pressure < 0 ? "戒心稍解" : "戒心未改";
    return `${favorText} · ${pressureText}`;
  }
  if (/\s[+-]\d+$/.test(value)) return `${value.replace(/\s[+-]\d+$/, "")} · 更加纯熟`;
  return value;
};

const combatConditionLabel = (value: number, maximum: number) => {
  const ratio = maximum > 0 ? value / maximum : 0;
  if (ratio <= 0) return "气力已尽";
  if (ratio <= 0.18) return "强撑不退";
  if (ratio <= 0.42) return "伤势不轻";
  if (ratio <= 0.7) return "呼吸稍乱";
  return "气息尚稳";
};

const combatBreathLabel = (value: number, maximum: number) => {
  const ratio = maximum > 0 ? value / maximum : 0;
  if (ratio <= 0.08) return "内息枯竭";
  if (ratio <= 0.28) return "内息将竭";
  if (ratio <= 0.55) return "换气吃紧";
  if (ratio <= 0.8) return "内息尚稳";
  return "内息充盈";
};

const immersiveCheckLabel = (label: string) => label.replace(/检定$/, "");

const checkConfidence = (odds: number) => {
  if (odds >= 76) return "把握颇高";
  if (odds >= 61) return "尚有把握";
  if (odds >= 46) return "胜负未定";
  if (odds >= 31) return "颇为冒险";
  return "机会渺茫";
};

function ChoiceDeck({ game, onChoose }: { game: NovelState; onChoose: (choiceId: string) => void }) {
  if (!game.currentEvent) return null;
  return (
    <section className={styles.choiceDeck} aria-label="当前选择">
      <div className={styles.choiceDeckHeader}><span className={styles.choicePrompt}>你要怎么做？</span><span className={styles.choiceHint}>一念落笔，此后便有回声</span></div>
      <div className={styles.choiceGrid}>
        {game.currentEvent.choices.map((choice, index) => (
          <button type="button" className={`${styles.choiceCard} ${styles[`choiceTone${choice.tone}`]}`} key={choice.id} onClick={() => onChoose(choice.id)}>
            <span className={styles.choiceIndex}>{index + 1}</span>
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitleLine}><strong>{choice.label}</strong><small>{choice.risk}风险</small></span>
              <span className={styles.choiceDescription}>{choice.description}</span>
              <span className={styles.choiceMeta}>
                {choice.preview.map((preview) => <em className={styles[`preview${preview.tone}`]} key={`${preview.label}-${preview.value}`}>{preview.label} {qualitativePreviewValue(preview.value)}</em>)}
                {choice.check && <em className={styles.checkMeta}>{immersiveCheckLabel(choice.check.label)} · {checkConfidence(choice.check.odds)}</em>}
              </span>
            </span>
            <span className={styles.choiceArrow}>↗</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CombatReplay({ combat }: { combat: WuxiaCombatResult }) {
  const visible = combat.exchanges.slice(0, 6);
  const remaining = combat.exchanges.slice(6);
  const exchangeClass = (result: WuxiaCombatResult["exchanges"][number]["result"]) => {
    if (["命中", "反击"].includes(result)) return styles.combatHit;
    if (["破招", "格挡"].includes(result)) return styles.combatGuard;
    return styles.combatMove;
  };
  const renderExchange = (exchange: WuxiaCombatResult["exchanges"][number]) => {
    const actor = exchange.actorId === combat.hero.actorId ? combat.hero : combat.enemy;
    const target = exchange.targetId === combat.hero.actorId ? combat.hero : combat.enemy;
    return (
      <li key={exchange.sequence}>
        <span>第{exchange.round}合</span>
        <i className={exchangeClass(exchange.result)}>{exchange.result}</i>
        <p>{exchange.text}</p>
        <small>{exchange.techniqueName} · {combatBreathLabel(exchange.actorQi, actor.maxQi)} · 对手{combatConditionLabel(exchange.targetHp, target.maxHp)}</small>
      </li>
    );
  };
  return (
    <section className={styles.combatReplay} aria-label="交手实录">
      <header>
        <div><span>交手实录</span><strong>{combat.rounds} 合 · {combat.success ? "得胜" : "失利"}</strong></div>
        <small>步法、换气与招式相克均已在幕后演算</small>
      </header>
      <div className={styles.combatVitals}>
        {[combat.hero, combat.enemy].map((fighter) => (
          <div key={fighter.actorId}>
            <span><strong>{fighter.name}</strong><small>{combatConditionLabel(fighter.hp, fighter.maxHp)}</small></span>
            <i><b style={{ width: `${(fighter.hp / fighter.maxHp) * 100}%` }} /></i>
            <em>{combatBreathLabel(fighter.qi, fighter.maxQi)}</em>
          </div>
        ))}
      </div>
      <ol className={styles.combatTimeline}>{visible.map(renderExchange)}</ol>
      {remaining.length > 0 && (
        <details className={styles.combatMore}>
          <summary>展开其余 {remaining.length} 次攻防</summary>
          <ol className={styles.combatTimeline}>{remaining.map(renderExchange)}</ol>
        </details>
      )}
      <p className={styles.combatSummary}>{combat.summary}</p>
    </section>
  );
}

function OutcomeReveal({ game, onContinue }: { game: NovelState; onContinue: () => void }) {
  const outcome = game.pendingOutcome;
  if (!outcome) return null;
  const status = outcome.check ? (outcome.success ? "success" : "failure") : "resolved";
  const statusLabel = outcome.combat ? (outcome.success ? "实战得胜" : "实战失利") : outcome.check ? (outcome.success ? "此事已成" : "横生波折") : "抉择落定";
  const continueLabel = outcome.turn > 0 && outcome.turn % game.campaign.chapterLength === 0
    ? "查看本章小结"
    : "回到行程安排";
  return (
    <section
      id="wuxia-turn-outcome"
      className={`${styles.outcomeReveal} ${styles[`outcome${status}`]}`}
      aria-label={`第${outcome.turn}回结果`}
      aria-live="polite"
    >
      <div className={styles.outcomeTopline}>
        <span><i className={styles.newTextDot} /> 第 {outcome.turn} 回 · 新正文</span>
        <strong>{statusLabel}</strong>
      </div>
      <div className={styles.outcomeHeading}>
        <span className={styles.outcomeSeal}>{outcome.check ? (outcome.success ? "成" : "变") : "定"}</span>
        <div><small>你选择了 · {outcome.choiceLabel}</small><h2>{outcome.revealTitle}</h2></div>
      </div>
      <p className={styles.outcomeLead}>{outcome.revealLead}</p>
      {outcome.check && outcome.check.method === "roll" && (
        <div className={styles.outcomeCheck}>
          <span>{immersiveCheckLabel(outcome.check.label)}</span>
          <small>{checkConfidence(outcome.check.odds)}</small>
          <strong>{outcome.success ? "应手" : "失手"}</strong>
        </div>
      )}
      <div className={styles.outcomeProse} aria-label="本回新写入正文">
        {outcome.resultParagraphs.map((paragraph, index) => (
          <p key={`${outcome.eventId}-result-${index}`}>{paragraph}</p>
        ))}
      </div>
      {outcome.combat && <CombatReplay combat={outcome.combat} />}
      {outcome.discovery && <div className={styles.outcomeDiscovery}><StarOutlined /><span><small>本回领悟</small><strong>{outcome.discovery}</strong></span></div>}
      {outcome.changes.length > 0 && (
        <div className={styles.outcomeChanges} aria-label="本回变化">
          {outcome.changes.map((change, index) => (
            <span className={styles[`outcomeChange${change.tone}`]} key={`${change.label}-${change.value}-${index}`}>
              <small>{change.label}</small><strong>{qualitativeOutcomeValue(change.value)}</strong>
            </span>
          ))}
        </div>
      )}
      <div className={styles.outcomeContinue}>
        <span>本回正文已收入 {game.narrative.bible.title}</span>
        <button type="button" onClick={onContinue} aria-label={continueLabel} aria-keyshortcuts="Enter Space">
          <span>{continueLabel}</span><span className={styles.startArrow} aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );
}

function StoryColumn({ game, onSelectAgenda, onActivity, onIntent, onPause, onChoose, onContinue }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
}) {
  const location = game.locations.find((item) => item.id === game.currentLocationId) || game.locations[0];
  const outcome = game.pendingOutcome;
  const { phase } = game.campaign;
  const completedScenes = game.narrative.chapters.flatMap((chapter) => chapter.scenes);
  const previousScene = completedScenes[completedScenes.length - 1];
  const eventCharacterIds = (game.currentEvent?.id.split(":") || [])
    .filter((part) => part.startsWith("actor_character_"))
    .map((actorId) => game.world.actors.find((actor) => actor.id === actorId)?.characterId)
    .filter((characterId): characterId is string => Boolean(characterId));
  const availableThreads = game.narrative.threads
    .filter((thread) => thread.status !== "兑现" && thread.introducedTurn <= game.turn + 1)
    .sort((left, right) => right.progress - left.progress);
  const activeThread = availableThreads.find((thread) => thread.actorIds.some((actorId) => eventCharacterIds.includes(actorId)))
    || availableThreads[0];
  useEffect(() => {
    if (!outcome) return;
    window.requestAnimationFrame(() => {
      document.getElementById("wuxia-turn-outcome")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  }, [outcome]);
  const banner = (() => {
    if (outcome) return {
      eyebrow: `第${outcome.turn}回 · 落笔`,
      title: outcome.revealTitle,
      subtitle: `新正文正在写入 ${game.narrative.bible.title}`,
    };
    if (phase === "choose_agenda") return {
      eyebrow: `第${game.chapter}章 · 开卷`,
      title: "先定此行所求",
      subtitle: "江湖不会替你排好主线；你先决定眼下最想做的事。",
    };
    if (phase === "planning") return {
      eyebrow: `第${game.world.day}日 · 安排行程`,
      title: game.campaign.agenda?.title || "今日做什么？",
      subtitle: "人物、地点和机会都在照常变化，这一幕由你的行动开始。",
    };
    if (phase === "chapter_break") return {
      eyebrow: `第${game.chapter}章 · 章末`,
      title: game.campaign.chapterMilestone?.title || game.chapterTitle,
      subtitle: "这一章已经写成，未尽的人与事会带进下一章。",
    };
    return {
      eyebrow: game.currentEvent?.eyebrow || "江湖此刻",
      title: game.currentEvent?.title || game.ending?.title || game.chapterTitle,
      subtitle: game.currentEvent?.subtitle || game.ending?.subtitle || "风声仍在路上。",
    };
  })();
  return (
    <main className={styles.storyColumn}>
      <div className={`${styles.sceneBanner} ${getLocationTone(location.type)}`}>
        <div>
          <span className={styles.sceneEyebrow}>{banner.eyebrow}</span>
          <h1>{banner.title}</h1>
          <p>{banner.subtitle}</p>
        </div>
        <div className={styles.sceneLocation}><EnvironmentOutlined /><strong>{location.name}</strong><small>{location.descriptor}</small></div>
      </div>
      <div className={`${styles.storyScroll} ${outcome ? styles.outcomeScroll : ""} ${["choose_agenda", "planning", "chapter_break"].includes(phase) ? styles.planningScroll : ""}`}>
        {outcome ? <OutcomeReveal game={game} onContinue={onContinue} /> : phase === "choose_agenda" ? (
          <AgendaChooser game={game} onSelect={onSelectAgenda} />
        ) : phase === "planning" ? (
          <PlanningBoard game={game} onSelectAgenda={onSelectAgenda} onActivity={onActivity} onIntent={onIntent} onPause={onPause} />
        ) : phase === "chapter_break" ? (
          <ChapterBreakView game={game} onContinue={onContinue} />
        ) : (
          <>
            <div className={styles.storyRule}><span />{game.chapterTitle}<span /></div>
            {previousScene && (
              <div className={styles.storyContinuity}>
                <span>前情落点 · 第{previousScene.turn}回</span>
                <p>{previousScene.consequence}。</p>
              </div>
            )}
            {game.currentEvent && (
              <div className={styles.eventCopy}>
                {game.currentEvent.lines.map((entry) => (
                  <p className={`${styles.eventLine} ${styles[`eventType${entry.type}`]}`} key={entry.id}>
                    {entry.speaker && <strong>{entry.speaker}<i>：</i></strong>}{entry.text}
                  </p>
                ))}
              </div>
            )}
            {activeThread && (
              <div className={styles.storyThread}>
                <span>{activeThread.title}</span>
                <p>{activeThread.question}</p>
                <div><i style={{ width: `${activeThread.progress}%` }} /></div>
              </div>
            )}
          </>
        )}
      </div>
      {phase === "scene" && !outcome && <ChoiceDeck game={game} onChoose={onChoose} />}
    </main>
  );
}

function GameTopbar({ game, onOpen }: { game: NovelState; onOpen: (panel: Panel) => void }) {
  const [copied, setCopied] = useState(false);
  const progress = chapterProgress(game);
  const chapterScenes = game.narrative.chapters.find((chapter) => chapter.number === game.chapter)?.scenes.length || 0;
  const phaseLabel = game.campaign.phase === "choose_agenda"
    ? "先选路线"
    : game.campaign.phase === "planning"
      ? `本章 ${chapterScenes}/${game.campaign.chapterLength} 幕`
      : game.campaign.phase === "scene"
        ? `本章第 ${Math.min(chapterScenes + 1, game.campaign.chapterLength)}/${game.campaign.chapterLength} 幕`
        : game.campaign.phase === "outcome"
          ? `本章第 ${chapterScenes}/${game.campaign.chapterLength} 幕`
          : game.campaign.phase === "chapter_break"
            ? "本章已成"
            : "本卷暂结";
  const handleCopy = async () => {
    const ok = await copyText(game.setup.seed);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <header className={styles.gameTopbar}>
      <BrandLockup compact />
      <div className={styles.chapterMeter}>
        <div className={styles.chapterMeta}><span>{phaseLabel}</span><strong>第{game.chapter}章 · {game.chapterTitle}</strong></div>
        <div className={styles.chapterTrack}><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className={styles.topbarActions}>
        <button type="button" onClick={handleCopy} title="复制命数种子" aria-label="复制命数种子"><CopyOutlined /><span className={styles.seedLabel}>{copied ? "已复制" : game.setup.seed}</span></button>
        <button type="button" onClick={() => onOpen("journal")} title="打开江湖志" aria-label="打开江湖志"><BookOutlined /></button>
        <button type="button" onClick={() => onOpen("settings")} title="打开设置" aria-label="打开设置"><MenuOutlined /></button>
      </div>
    </header>
  );
}

function EndingView({ game, onRestart }: { game: NovelState; onRestart: () => void }) {
  const [activeSection, setActiveSection] = useState<number | "epilogue">("epilogue");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (game.ending) setActiveSection("epilogue");
  }, [game.ending]);
  if (!game.ending) return null;
  const chapter = typeof activeSection === "number"
    ? game.narrative.chapters.find((entry) => entry.number === activeSection)
    : null;
  const handleCopy = async () => {
    const ok = await copyText(manuscriptText(game.narrative, game.ending));
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className={styles.endingOverlay} role="dialog" aria-modal="true" aria-label="本卷成稿">
      <header className={styles.endingTopbar}>
        <div><span>本卷成稿 · {game.ending.rank}</span><strong>{game.narrative.bible.title}</strong></div>
        <div className={styles.endingTopActions}>
          <button type="button" onClick={handleCopy}><CopyOutlined /> {copied ? "已复制" : "复制整卷"}</button>
          <button type="button" onClick={onRestart}><ReloadOutlined /> 再写一卷</button>
        </div>
      </header>
      <div className={styles.endingReader}>
        <nav className={styles.chapterNavigation} aria-label="章节目录">
          <div className={styles.endingSeal}>终</div>
          <p>{game.narrative.bible.subtitle}</p>
          {game.narrative.chapters.map((entry) => (
            <button
              type="button"
              key={entry.number}
              className={activeSection === entry.number ? styles.chapterActive : ""}
              onClick={() => setActiveSection(entry.number)}
            >
              <span>第{entry.number}章</span><strong>{entry.title}</strong><small>{entry.scenes.length} 回</small>
            </button>
          ))}
          <button type="button" className={activeSection === "epilogue" ? styles.chapterActive : ""} onClick={() => setActiveSection("epilogue")}>
            <span>尾声</span><strong>{game.ending.title}</strong><small>{game.ending.rank}</small>
          </button>
          <div className={styles.endingScore}><strong>缘未尽</strong><span>卷外余韵</span></div>
        </nav>
        <article className={styles.manuscriptReader}>
          {chapter ? (
            <>
              <div className={styles.manuscriptHeader}>
                <span>第 {chapter.number} 章</span>
                <h1>{chapter.title}</h1>
                <p>{chapter.epigraph}</p>
              </div>
              {chapter.scenes.map((scene) => (
                <section className={styles.manuscriptScene} key={scene.id}>
                  <header><span>第{scene.turn}回 · {scene.locationName}</span><h2>{scene.title}</h2></header>
                  {scene.paragraphs.map((paragraph, index) => <p key={`${scene.id}-${index}`}>{paragraph}</p>)}
                </section>
              ))}
            </>
          ) : (
            <>
              <div className={styles.manuscriptHeader}>
                <span>尾声 · {game.ending.rank}</span>
                <h1>{game.ending.title}</h1>
                <p>{game.ending.subtitle}</p>
              </div>
              <p className={styles.endingSummary}>{game.ending.summary}</p>
              <div className={styles.epilogueProse}>{game.ending.epilogue.map((paragraph, index) => <p key={`epilogue-${index}`}>{paragraph}</p>)}</div>
              <div className={styles.endingTags}>{game.ending.tags.map((tag) => <span key={tag}># {tag}</span>)}</div>
              <p className={styles.endingSeed}>命数种子 · {game.setup.seed}</p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

const actorDisplayName = (game: NovelState, actorId: string) => game.world.actors.find((actor) => actor.id === actorId)?.name || actorId;
const actorLocationName = (game: NovelState, actor: WorldActor) => game.locations.find((location) => location.id === actor.locationId)?.name || "行踪不明";

function RelationshipLedger({ game, relations }: { game: NovelState; relations: WorldRelation[] }) {
  const relationTone = (relation: WorldRelation) => {
    if (["parent", "child", "adoptive_parent", "adoptive_child", "sibling", "uncle", "niece"].includes(relation.type)) return styles.relationKin;
    if (["master", "disciple", "sect_sibling", "sworn_sibling"].includes(relation.type)) return styles.relationSect;
    if (["enemy", "rival"].includes(relation.type)) return styles.relationEnemy;
    return styles.relationBond;
  };
  const relationStrength = (strength: number) => {
    if (strength >= 85) return "生死相系";
    if (strength >= 65) return "牵系深厚";
    if (strength >= 45) return "往来已久";
    if (strength >= 25) return "尚有牵连";
    return "一面之缘";
  };
  return (
    <div className={styles.relationshipLedger}>
      {relations.map((relation) => (
        <article key={relation.id}>
          <div><strong>{actorDisplayName(game, relation.fromActorId)}</strong><span className={relationTone(relation)}>{relationLabel[relation.type]}</span><strong>{actorDisplayName(game, relation.toActorId)}</strong></div>
          <p>{relation.description}</p>
          <small><i style={{ width: `${relation.strength}%` }} />{relationStrength(relation.strength)}</small>
        </article>
      ))}
      {relations.length === 0 && <p className={styles.drawerHint}>已知的人名还没有连成线。真正的亲属与恩仇会在相遇和选择后显露。</p>}
    </div>
  );
}

function MartialLedger({ game }: { game: NovelState }) {
  const hero = game.world.actors.find((actor) => actor.id === "hero");
  const heroTechniques = hero?.techniques.map((known) => ({
    known,
    definition: game.world.techniques.find((technique) => technique.id === known.techniqueId),
  })).filter((entry) => entry.definition) || [];
  const knownActorIds = new Set(knownRelations(game.world).flatMap((relation) => [relation.fromActorId, relation.toActorId]));
  const observedArtIds = new Set(game.world.actors
    .filter((actor) => actor.id === "hero" || knownActorIds.has(actor.id) || actor.memories.length > 0)
    .flatMap((actor) => actor.techniques.map((known) => game.world.techniques.find((technique) => technique.id === known.techniqueId)?.artId).filter(Boolean)));
  const observedArts = game.world.martialArts.filter((art) => observedArtIds.has(art.id));
  const visibleManuals = game.world.manuals.filter((manual) => manual.state !== "藏匿" || game.history.some((entry) => entry.eventId === "broken-manual"));
  const followerNames = game.campaign.legacy.followerActorIds
    .map((actorId) => game.world.actors.find((actor) => actor.id === actorId)?.name)
    .filter((name): name is string => Boolean(name));
  const factionName = (factionId: string) => game.narrative.factions.find((faction) => faction.id === factionId)?.name
    || (factionId === "hero" ? "自家所学" : factionId === "home" ? game.hero.sectName : "来路未明");
  return (
    <div className={styles.martialLedger}>
      <div className={styles.martialDoctrine}>
        <span>{game.narrative.martial.name} · {game.narrative.martial.mastery}% 总火候</span>
        <p>{game.narrative.martial.philosophy}</p>
        <small>行功之忌 · {game.narrative.martial.cost}</small>
      </div>
      <div className={styles.techniqueTable}>
        {heroTechniques.map(({ known, definition }) => definition && (
          <article key={known.techniqueId}>
            <header><span>{definition.nature}</span><strong>{definition.name}</strong><em>{known.source}</em></header>
            <p>{definition.description}</p>
            <div>
              <span>威力 <b>{definition.power}</b></span><span>迅捷 <b>{definition.speed}</b></span><span>命中 <b>{definition.accuracy}</b></span><span>距离 <b>{definition.range}</b></span><span>耗气 <b>{definition.qiCost}</b></span><span>冷却 <b>{definition.cooldown}</b></span>
            </div>
            <footer><i><b style={{ width: `${known.mastery}%` }} /></i><span>熟练 {known.mastery}% · 难度 {definition.difficulty}</span></footer>
          </article>
        ))}
      </div>
      {visibleManuals.length > 0 && (
        <div className={styles.manualLedger}>
          {visibleManuals.map((manual) => <p key={manual.id}><span>秘籍 · {manual.state}</span><strong>{manual.name}</strong><small>{manual.provenance}</small></p>)}
        </div>
      )}
      <div className={styles.observedArts}>
        {observedArts.map((art) => <p key={art.id}><span>{factionName(art.factionId)} · {art.grade} {art.category}</span><strong>{art.name}</strong><small>{art.principle}</small></p>)}
      </div>
      <div className={styles.legacyLedger}>
        <span>你的传承</span>
        <p><strong>武学领悟</strong><small>{game.campaign.legacy.martialInsights} 段来自练功、辨招或实战</small></p>
        <p><strong>自创招式</strong><small>{game.campaign.legacy.authoredTechniques.map((technique) => technique.name).join("、") || "尚未自成一式"}</small></p>
        <p><strong>愿意追随</strong><small>{followerNames.join("、") || "尚无人正式署名"}</small></p>
        {game.campaign.legacy.foundedSect && <p><strong>{game.campaign.legacy.foundedSect.name}</strong><small>{game.campaign.legacy.foundedSect.creed}</small></p>}
      </div>
    </div>
  );
}

function FactionDossier({ game, faction }: {
  game: NovelState;
  faction: NovelState["narrative"]["factions"][number];
}) {
  const knowledge = game.campaign.factionKnowledge[faction.id];
  const recognizedNames = knowledge?.recognizedTechniqueIds
    .map((techniqueId) => game.world.techniques.find((technique) => technique.id === techniqueId)?.name)
    .filter((name): name is string => Boolean(name)) || [];
  const encounters = knowledge?.encounters?.slice(-2).reverse() || [];
  const recognitionLabel = (confidence: number) => {
    if (confidence >= 85) return "已识根脉";
    if (confidence >= 60) return "已辨来路";
    if (confidence >= 30) return "初窥门径";
    return "只闻其名";
  };
  const favorShift = (value: number) => (value > 0 ? "转暖" : value < 0 ? "转冷" : "未改");
  const pressureShift = (value: number) => (value > 0 ? "加深" : value < 0 ? "稍解" : "未改");
  return (
    <article className={styles.factionDossier}>
      <header><h3>{faction.name}</h3><span>{faction.stance}</span></header>
      {faction.sourceLabel && <small>{faction.sourceLabel}</small>}
      <p>{faction.creed}</p>
      {faction.agendaRevealed && <small>{faction.hiddenAgenda}</small>}
      <div className={styles.factionMeters} aria-label={`${faction.name}往来与戒心`}>
        <i style={{ width: `${faction.favor}%` }} /><b style={{ width: `${faction.pressure}%` }} />
      </div>
      {knowledge && (
        <div className={styles.factionKnowledge}>
          <p><strong>辨招把握 · {recognitionLabel(knowledge.confidence)}</strong><span>{recognizedNames.length ? `已认出：${recognizedNames.join("、")}` : "只认得本门根基"}</span></p>
          {encounters.map((encounter) => (
            <article key={`${faction.id}-${encounter.turn}-${encounter.opponentActorId}`}>
              <span>第{encounter.turn}回 · {encounter.context} · {encounter.result}</span>
              <strong>{encounter.opponentName}</strong>
              <small>往来{favorShift(encounter.favorDelta)} · 戒心{pressureShift(encounter.pressureDelta)}</small>
              <p>{encounter.consequence}</p>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

function TravelLedger({ game }: { game: NovelState }) {
  const latestMovements = game.world.movements.slice(-10).reverse();
  const selectedScore = game.eventDirector?.candidates.find((candidate) => candidate.eventId === (game.eventDirector?.selectedCandidateEventId || game.eventDirector?.selectedEventId));
  return (
    <div className={styles.travelLedger}>
      {game.eventDirector && (
        <section className={styles.directorDecision}>
          <span>本回为何在此发生</span>
          <strong>{game.currentEvent?.title || game.eventDirector.selectedEventId}</strong>
          <p>{selectedScore?.reasons.join(" · ") || "人物的行程恰在此刻交汇"}</p>
          {selectedScore && <small>人物目标、真实位置、旧有关系与近期重复共同决定此幕</small>}
        </section>
      )}
      <section>
        <div className={styles.drawerSectionTitle}><span>近十日行踪</span><small>每人每日最多走一段路</small></div>
        <div className={styles.travelRows}>
          {latestMovements.map((movement) => (
            <p key={`${movement.day}-${movement.actorId}-${movement.fromLocationId}-${movement.toLocationId}`}>
              <span>第{movement.day}日</span><strong>{actorDisplayName(game, movement.actorId)}</strong><small>{game.locations.find((location) => location.id === movement.fromLocationId)?.name} → {game.locations.find((location) => location.id === movement.toLocationId)?.name}</small><em>{movement.reason}</em>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function Drawer({ panel, game, onClose, onConclude, onRestart }: {
  panel: Panel;
  game: NovelState;
  onClose: () => void;
  onConclude: () => void;
  onRestart: () => void;
}) {
  if (!panel) return null;
  const title = panel === "journal" ? "本卷正文" : panel === "map" ? "行路图" : panel === "cast" ? "人物与江湖" : "卷外设置";
  const knownCast = game.narrative.cast.filter((character) => character.firstSeenTurn !== undefined);
  const relations = knownRelations(game.world);
  const knownActorIds = new Set(relations.flatMap((relation) => [relation.fromActorId, relation.toActorId]));
  const knownWorldActors = game.world.actors.filter((actor) => actor.id !== "hero" && (
    knownActorIds.has(actor.id)
    || actor.memories.length > 0
    || actor.locationId === game.currentLocationId
    || game.companions.some((companion) => actor.characterId === companion.characterId)
  ));
  return (
    <div className={styles.drawerBackdrop} role="presentation">
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.drawerHeader}><div><span className={styles.eyebrow}>CURRENT VOLUME</span><h2>{title}</h2></div><button type="button" onClick={onClose} title="关闭" aria-label="关闭"><CloseOutlined /></button></div>
        {panel === "journal" && (
          <div className={styles.drawerManuscript}>
            <div className={styles.drawerBookTitle}><span>{game.narrative.bible.subtitle}</span><h3>{game.narrative.bible.title}</h3><p>{game.narrative.bible.thematicQuestion}</p></div>
            {game.narrative.chapters.filter((chapter) => chapter.scenes.length > 0).map((chapter) => (
              <section key={chapter.number}>
                <header><span>第{chapter.number}章</span><h3>{chapter.title}</h3></header>
                {chapter.scenes.map((scene) => (
                  <article key={scene.id}><span>第{scene.turn}回 · {scene.locationName}</span><h4>{scene.title}</h4>{scene.paragraphs.map((paragraph, index) => <p key={`${scene.id}-drawer-${index}`}>{paragraph}</p>)}</article>
                ))}
              </section>
            ))}
            {game.narrative.chapters.every((chapter) => chapter.scenes.length === 0) && <p className={styles.drawerHint}>第一回尚未落笔。做出选择后，完整正文会收在这里。</p>}
          </div>
        )}
        {panel === "map" && <div className={styles.drawerMap}><RouteMap game={game} /><TravelLedger game={game} /></div>}
        {panel === "cast" && (
          <div className={styles.drawerWorld}>
            <section><div className={styles.drawerSectionTitle}><span>人物谱</span><small>{knownCast.length} 人入局</small></div>{knownCast.map((character) => <article className={styles.castDossier} key={character.id}><Image src={character.portrait} alt="" width={68} height={68} /><div><h3>{character.name}<small>{character.title} · {character.relationship.label}</small></h3><p><strong>原型</strong>{character.sourceName} · {character.role}</p><p><strong>独门</strong>{character.signatureMove}</p><p><strong>所求</strong>{character.desire}</p>{character.secretRevealed && <p><strong>隐秘</strong>{character.secret}</p>}</div></article>)}</section>
            <section><div className={styles.drawerSectionTitle}><span>江湖人物行踪</span><small>{knownWorldActors.length} 人可追踪</small></div><div className={styles.actorLedger}>{knownWorldActors.map((actor) => <article key={actor.id}><span>{actor.name.slice(0, 1)}</span><div><h3>{actor.name}<small>{actor.title}</small></h3><p>{actorLocationName(game, actor)} · {actor.activity} · 停至第{actor.stayUntilDay}日</p><small>{actor.goals[0]?.reason || actor.role}</small></div></article>)}</div></section>
            <section><div className={styles.drawerSectionTitle}><span>关系网</span><small>{relations.length} 条已知牵系</small></div><RelationshipLedger game={game} relations={relations} /></section>
            <section><div className={styles.drawerSectionTitle}><span>势力志</span><small>辨招、交手与态度都会留下账</small></div>{game.narrative.factions.map((faction) => <FactionDossier game={game} faction={faction} key={faction.id} />)}</section>
            <section><div className={styles.drawerSectionTitle}><span>武学谱</span><small>招式、来源与实战熟练</small></div><MartialLedger game={game} /></section>
          </div>
        )}
        {panel === "settings" && (
          <div className={styles.drawerSettings}>
            <div className={styles.settingsSeed}>
              <span>本卷种子</span><strong>{game.setup.seed}</strong>
              <button type="button" onClick={() => copyText(game.setup.seed)}><ShareAltOutlined /> 分享种子</button>
              <button type="button" onClick={() => copyText(manuscriptText(game.narrative, game.ending))}><CopyOutlined /> 复制当前正文</button>
            </div>
            <button
              type="button"
              className={styles.concludeButton}
              disabled={game.turn === 0 || game.campaign.phase === "scene" || game.campaign.phase === "outcome"}
              onClick={onConclude}
            >
              <BookOutlined /> 暂结此卷，生成收束
            </button>
            <p>暂结只为当前经历写下卷尾，不会假装所有人物和恩怨都已结束。</p>
            <button type="button" className={styles.resetButton} onClick={onRestart}><ReloadOutlined /> 舍弃存档，重新开局</button>
            <p>重新开局会清除当前自动存档；若想重走同一条命数，请先复制种子。</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function GameScreen({ game, onSelectAgenda, onActivity, onIntent, onPause, onChoose, onContinue, onConclude, onRestart }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onConclude: () => void;
  onRestart: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const openPanel = (next: Panel) => setPanel(next);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
      if (panel) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName || "")) return;
      if (game.campaign.phase === "outcome" || game.campaign.phase === "chapter_break") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onContinue();
        }
        return;
      }
      const keyIndex = /^[1-9]$/.test(event.key)
        ? Number(event.key) - 1
        : ["a", "b", "c"].indexOf(event.key.toLowerCase());
      const index = keyIndex;
      if (index < 0) return;
      if (game.campaign.phase === "choose_agenda") {
        const agenda = getPlayerAgendaOptions(game)[index];
        if (agenda) onSelectAgenda(agenda.id);
        return;
      }
      if (game.campaign.phase === "planning") {
        const activity = game.campaign.availableActivities[index];
        if (activity?.enabled) onActivity(activity.id);
        return;
      }
      if (game.campaign.phase === "scene") {
        const choice = game.currentEvent?.choices[index];
        if (choice) onChoose(choice.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, onActivity, onChoose, onContinue, onSelectAgenda, panel]);

  return (
    <main className={styles.gameShell}>
      <GameTopbar game={game} onOpen={openPanel} />
      <div className={styles.mobileStats}><StatStrip game={game} /></div>
      <div className={styles.gameGrid}>
        <HeroRail game={game} onOpen={openPanel} />
        <StoryColumn game={game} onSelectAgenda={onSelectAgenda} onActivity={onActivity} onIntent={onIntent} onPause={onPause} onChoose={onChoose} onContinue={onContinue} />
        <aside className={styles.rightRail}><StatStrip game={game} /><RouteMap game={game} /><WorldPulse game={game} /><CompanionPanel game={game} /></aside>
      </div>
      <div className={styles.mobileDock}><button type="button" aria-label="打开江湖志" onClick={() => openPanel("journal")}><BookOutlined />江湖志</button><button type="button" aria-label="打开行路图" onClick={() => openPanel("map")}><CompassOutlined />行路图</button><button type="button" aria-label="打开人物与江湖" onClick={() => openPanel("cast")}><TeamOutlined />人物谱</button><button type="button" aria-label="打开设置" onClick={() => openPanel("settings")}><MenuOutlined />设置</button></div>
      <EndingView game={game} onRestart={onRestart} />
      <Drawer panel={panel} game={game} onClose={() => setPanel(null)} onConclude={() => { setPanel(null); onConclude(); }} onRestart={onRestart} />
    </main>
  );
}

export default function WuxiaGame() {
  const {
    game,
    isStarted,
    hasSavedGame,
    startGame,
    continueGame,
    chooseAgenda,
    chooseActivity,
    setLeadIntent,
    pauseLead,
    chooseAction,
    continueAction,
    concludeGame,
    abandonGame,
  } = useWuxiaGame();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    window.advanceTime = () => {
      // This game advances only on explicit choices; real time never mutates simulation state.
    };
    window.render_game_to_text = () => {
      if (!game) return JSON.stringify({ edition: "sandbox", screen: "setup", saved: hasSavedGame });
      const scenes = game.narrative.chapters.flatMap((chapter) => chapter.scenes);
      const currentChapterScenes = game.narrative.chapters.find((chapter) => chapter.number === game.chapter)?.scenes.length || 0;
      const screen = game.ending
        ? "ending"
        : game.campaign.phase === "choose_agenda"
          ? "agenda"
          : game.campaign.phase === "planning"
            ? "planning"
            : game.campaign.phase === "chapter_break"
              ? "chapter_break"
              : game.campaign.phase === "outcome"
                ? "outcome"
                : "story";
      return JSON.stringify({
        edition: "sandbox",
        version: game.version,
        screen,
        phase: game.campaign.phase,
        turn: game.turn,
        chapter: `${game.chapter} · ${game.chapterTitle}`,
        chapterScene: currentChapterScenes,
        chapterLength: game.campaign.chapterLength,
        hero: game.hero,
        location: game.currentLocationId,
        eventLocation: game.pendingOutcome ? game.currentLocationId : game.currentEvent?.locationId || game.currentLocationId,
        eventId: game.pendingOutcome?.eventId || game.currentEvent?.id || null,
        event: game.currentEvent?.title || null,
        eventProse: game.currentEvent?.lines.map((entry) => entry.text) || [],
        choices: game.pendingOutcome ? [] : game.currentEvent?.choices.map((choice) => ({ id: choice.id, label: choice.label, risk: choice.risk, odds: choice.check?.odds })) || [],
        outcome: game.pendingOutcome || null,
        companions: game.companions.map((companion) => ({ name: companion.name, affinity: companion.affinity, characterId: companion.characterId })),
        world: {
          coordinateSystem: "地图左上角为 (0,0)，x 向右、y 向下，单位为地图百分比；人物每天最多沿一条 connection 移动一站。",
          day: game.world.day,
          locations: game.world.locations.map((location) => ({ id: location.id, name: location.name, x: location.x, y: location.y, connections: location.connections, danger: location.danger })),
          actors: game.world.actors.map((actor) => ({ id: actor.id, characterId: actor.characterId, name: actor.name, title: actor.title, factionId: actor.factionId, locationId: actor.locationId, destinationId: actor.destinationId, activity: actor.activity, stayUntilDay: actor.stayUntilDay, goals: actor.goals, techniques: actor.techniques })),
          martialArts: game.world.martialArts.map((art) => ({ id: art.id, name: art.name, factionId: art.factionId, grade: art.grade, category: art.category, techniqueIds: art.techniqueIds })),
          techniques: game.world.techniques.map((technique) => ({ id: technique.id, artId: technique.artId, name: technique.name, nature: technique.nature, tags: technique.tags })),
          knownRelations: knownRelations(game.world),
          relationTypes: Array.from(new Set(game.world.relations.map((relation) => relation.type))).sort(),
          hiddenRelationCount: game.world.relations.filter((relation) => !relation.knownToHero).length,
          manuals: game.world.manuals,
          movements: game.world.movements.slice(-12),
          encounters: game.world.encounters.slice(-4),
          lastTransition: game.world.lastTransition || null,
          eventDirector: game.eventDirector || null,
        },
        narrative: {
          mode: game.narrative.mode,
          title: game.narrative.bible.title,
          centralMystery: game.narrative.bible.centralMystery,
          cast: game.narrative.cast.map((character) => ({ id: character.id, name: character.name, sourceName: character.sourceName, factionId: character.factionId, circles: character.circles, signatureMove: character.signatureMove, signatureDescription: character.signatureDescription, desire: character.desire, status: character.status, relationship: character.relationship, secretRevealed: character.secretRevealed })),
          factions: game.narrative.factions.map((faction) => ({ id: faction.id, name: faction.name, sourceLabel: faction.sourceLabel, stance: faction.stance, favor: faction.favor, pressure: faction.pressure, agendaRevealed: faction.agendaRevealed })),
          martial: game.narrative.martial,
          threads: game.narrative.threads,
        },
        campaign: {
          agenda: game.campaign.agenda || null,
          activities: game.campaign.availableActivities,
          leads: game.campaign.leads.map((lead) => ({
            ...lead,
            intentLabel: lead.intent ? intentLabel[lead.intent] : null,
          })),
          opportunities: game.campaign.opportunities,
          factionKnowledge: game.campaign.factionKnowledge,
          legacy: game.campaign.legacy,
          milestone: game.campaign.chapterMilestone || null,
          installedPackIds: game.campaign.installedPackIds,
        },
        content: {
          packs: game.content.packs,
          agendaCount: game.content.agendas.length,
          activityCount: game.content.activities.length,
          opportunityCount: game.content.opportunities.length,
          characterCount: game.content.characters.length,
          locationCount: game.content.locations.length,
        },
        manuscript: {
          sceneCount: scenes.length,
          chapters: game.narrative.chapters.map((chapter) => ({ number: chapter.number, title: chapter.title, sceneCount: chapter.scenes.length, scenes: chapter.scenes })),
          text: game.ending ? manuscriptText(game.narrative, game.ending) : null,
        },
        history: game.history,
        ending: game.ending || null,
      });
    };
    return () => {
      delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [game, hasSavedGame]);

  const handleRestart = useCallback(() => {
    abandonGame();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 1800);
  }, [abandonGame]);

  const content = (() => {
    if (!isStarted || !game) return <StartScreen hasSavedGame={hasSavedGame} onStart={startGame} onContinue={continueGame} />;
    return (
      <GameScreen
        game={game}
        onSelectAgenda={chooseAgenda}
        onActivity={chooseActivity}
        onIntent={setLeadIntent}
        onPause={pauseLead}
        onChoose={chooseAction}
        onContinue={continueAction}
        onConclude={concludeGame}
        onRestart={handleRestart}
      />
    );
  })();

  return <div className={styles.wuxiaRoot}>{content}{showToast && <div className={styles.toast}>旧卷已收起 · 可重新落笔</div>}</div>;
}
