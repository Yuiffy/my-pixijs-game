"use client";

import {
  ArrowLeftOutlined,
  BookOutlined,
  CalendarOutlined,
  CompassOutlined,
  CopyOutlined,
  CrownOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  HeartOutlined,
  HistoryOutlined,
  HomeOutlined,
  LockOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyOutlined,
  ShareAltOutlined,
  StarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
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
  getLifeEndingOptions,
  getPlayerAgendaOptions,
  type AmbitionId,
  type NovelSetup,
  type NovelState,
  type OriginId,
  type StatKey,
  previewWuxiaWorld,
} from "./wuxia/game/novelEngine";
import {
  formatWuxiaDate,
  projectStageDescription,
  wuxiaDateFromDay,
} from "./wuxia/game/wuxiaLife";
import type { WuxiaWorldSlotV7 } from "./wuxia/game/wuxiaSave";
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

type Panel = "journal" | "map" | "cast" | "chronicle" | "settings" | null;

type WuxiaUiController = ReturnType<typeof useWuxiaGame>;

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

const gameDate = (game: NovelState) => wuxiaDateFromDay(game.world.day, game.chronicle.eraName);
const gameDateLabel = (game: NovelState) => formatWuxiaDate(gameDate(game));

const conditionLabel = (value: number, maximum: number) => {
  const ratio = maximum > 0 ? value / maximum : 0;
  if (ratio <= 0.15) return "伤重难支";
  if (ratio <= 0.42) return "伤势未平";
  if (ratio <= 0.72) return "气息稍乱";
  return "气息安稳";
};

const aptitudeLabel = (value: number) => {
  if (value >= 82) return "已臻化境";
  if (value >= 66) return "炉火纯青";
  if (value >= 48) return "渐入佳境";
  if (value >= 30) return "略有所成";
  return "初窥门径";
};

const techniqueDifficultyLabel = (value: number) => {
  if (value >= 76) return "极难驾驭";
  if (value >= 58) return "颇费心力";
  if (value >= 40) return "须勤加揣摩";
  return "较易入门";
};

const martialInsightLabel = (value: number) => {
  if (value >= 10) return "诸般招意已可自成一路";
  if (value >= 6) return "练功、辨招与实战正渐渐融会";
  if (value >= 3) return "数次灵光已经连成脉络";
  if (value > 0) return "偶有招意留在心头";
  return "尚待一次真正的触类旁通";
};

const techniquePowerLabel = (value: number) => (value >= 78 ? "势若奔雷" : value >= 60 ? "劲力雄浑" : value >= 44 ? "刚柔相济" : "轻灵试探");
const techniqueSpeedLabel = (value: number) => (value >= 78 ? "快若惊鸿" : value >= 60 ? "出手迅疾" : value >= 44 ? "疾徐有度" : "蓄势而发");
const techniqueAccuracyLabel = (value: number) => (value >= 82 ? "几无虚发" : value >= 68 ? "落点精稳" : value >= 52 ? "招到意到" : "重势取机");
const techniqueRangeLabel = (value: string) => (value === "远" ? "隔空可及" : value === "中" ? "进退皆宜" : "近身取势");
const techniqueCostLabel = (value: number) => (value >= 38 ? "耗气甚重" : value >= 24 ? "耗气不轻" : value >= 14 ? "耗气平常" : "气息轻省");
const techniqueRecoveryLabel = (value: number) => (value >= 4 ? "收势甚久" : value >= 3 ? "须缓一息" : value >= 2 ? "宜先换气" : "可接连招");

const purseLabel = (value: number) => (value >= 80 ? "行囊丰足" : value >= 36 ? "尚有盘缠" : value >= 12 ? "囊中尚可" : "盘缠将尽");
const clueLabel = (value: number) => (value >= 5 ? "线索将合" : value >= 3 ? "已有眉目" : value > 0 ? "略闻风声" : "尚无头绪");
const heatLabel = (value: number) => (value >= 70 ? "风声正紧" : value >= 42 ? "有人留意" : value >= 18 ? "略有传闻" : "行迹未显");

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
  inheritedWorld,
  onBack,
}: {
  hasSavedGame: boolean;
  onStart: (setup: Partial<NovelSetup>) => void;
  onContinue: () => void;
  inheritedWorld?: WuxiaWorldSlotV7;
  onBack?: () => void;
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
    onStart({
      heroName,
      origin,
      ambition,
      sectId: selectedOrigin.sectId,
      ...(inheritedWorld ? {} : { seed }),
    });
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
          {onBack && <button type="button" className={styles.setupBack} onClick={onBack}><ArrowLeftOutlined /> 返回江湖册</button>}
          <div className={styles.panelKicker}>{inheritedWorld ? "同世续卷" : "开卷设定"} <span>01 / 01</span></div>
          <div className={styles.setupHeader}>
            <div>
              <h2>{inheritedWorld ? "谁来接着走这方江湖？" : "你要以谁的身份入局？"}</h2>
              <p>{inheritedWorld ? `${inheritedWorld.label}的年月、旧人、门派与恩怨都会保留。` : "先定下自己；其余人物会依种子获得位置、目标与旧关系。"}</p>
            </div>
            <span className={styles.inkStamp}>{inheritedWorld ? "承" : "起"}</span>
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

          {!inheritedWorld && (
            <>
              <div className={styles.seedRow}>
                <span className={styles.fieldLabel}>命数种子</span>
                <button type="button" className={styles.iconButton} onClick={randomizeSeed} title="随机命数与活跃江湖人物" aria-label="随机命数与活跃江湖人物"><ReloadOutlined /></button>
              </div>
              <input id="wuxia-seed" className={styles.seedInput} value={seed} onChange={(event) => setSeed(event.target.value)} maxLength={32} />
            </>
          )}

          <div className={styles.setupSummary}>
            <span><strong>{selectedOrigin.label}</strong> · {selectedOrigin.epithet}</span>
            <span><strong>{selectedAmbition.label}</strong> · 偏重 {STAT_META.find((stat) => stat.key === selectedAmbition.stat)?.label}</span>
          </div>
          {inheritedWorld ? (
            <div className={styles.worldPreview}>
              <span>承接旧世</span>
              <strong>{gameDateLabel(inheritedWorld.game)} · {inheritedWorld.game.hero.name}的旧卷仍在</strong>
              <small>历代人物仍可相逢，已经发生的家门、武学与天下大事不会重置。</small>
            </div>
          ) : (
            <div className={styles.worldPreview}>
              <span>此卷活跃人物</span>
              <strong>{worldPreview.cast.slice(0, 5).map((entry) => entry.name).join(" · ")}</strong>
              <small>{worldPreview.factions.join(" / ")} · 换种子会重抽人物、位置、目标与隐秘</small>
            </div>
          )}
          <button className={styles.startButton} type="submit"><span>{inheritedWorld ? "承世入江湖" : "落笔开卷"}</span><span className={styles.startArrow}>↗</span></button>
          {hasSavedGame && !inheritedWorld && (
            <button type="button" className={styles.continueButton} onClick={onContinue}>继续上一卷 <span>→</span></button>
          )}
          <p className={styles.setupFootnote}>角色与招式取材自项目自走棋的主播原型和关系梗 · 同种子、同选择可完整重演</p>
        </form>
      </div>
    </main>
  );
}

function WorldLibrary({
  worlds,
  activeWorldId,
  onContinue,
  onNewLife,
  onNewWorld,
}: {
  worlds: WuxiaWorldSlotV7[];
  activeWorldId?: string;
  onContinue: (worldId: string) => void;
  onNewLife?: (worldId: string) => void;
  onNewWorld: () => void;
}) {
  const [selectedId, setSelectedId] = useState(activeWorldId || worlds[0]?.id || "");
  useEffect(() => {
    if (!worlds.some((world) => world.id === selectedId)) setSelectedId(activeWorldId || worlds[0]?.id || "");
  }, [activeWorldId, selectedId, worlds]);
  const selected = worlds.find((world) => world.id === selectedId) || worlds[0];
  if (!selected) return null;
  const activeProjects = selected.game.chronicle.projects.filter((project) => ["announced", "active"].includes(project.status));
  const archives = [...selected.game.chronicle.protagonists].reverse();
  const { household } = selected.game.life;
  const canBeginNewLife = Boolean(selected.game.ending && onNewLife);
  return (
    <main className={styles.worldLibraryShell}>
      <header className={styles.worldLibraryHeader}>
        <BrandLockup />
        <span>江湖册 · 世界与人生分别留卷</span>
      </header>
      <section className={styles.worldLibraryIntro}>
        <p className={styles.eyebrow}>WORLD CHRONICLE</p>
        <h1>翻开哪一方江湖？</h1>
        <p>旧主角、亲友、门派和天下大事都留在各自的世界里。你可以续写眼前人生，也可以让后来者接着走。</p>
      </section>
      <div className={styles.worldLibraryGrid}>
        <nav className={styles.worldShelf} aria-label="已有江湖">
          {worlds.map((world) => (
            <button type="button" className={world.id === selected.id ? styles.worldShelfActive : ""} onClick={() => setSelectedId(world.id)} key={world.id}>
              <GlobalOutlined />
              <span><strong>{world.label}</strong><small>{gameDateLabel(world.game)} · {world.game.hero.name}</small></span>
              <em>{world.game.life.status === "ending_preview" ? "尾声待定" : "仍在行路"}</em>
            </button>
          ))}
          <button type="button" className={styles.newWorldRow} onClick={onNewWorld}><ReloadOutlined /><span><strong>另造一方江湖</strong><small>人物、地点与旧关系重新落子</small></span></button>
        </nav>
        <section className={styles.worldLibraryDetail} aria-live="polite">
          <header>
            <span>{gameDateLabel(selected.game)} · 第{selected.game.life.generation}代执卷人</span>
            <h2>{selected.label}</h2>
            <p>{selected.game.hero.name}，{selected.game.life.age}岁，现居{selected.game.locations.find((location) => location.id === selected.game.currentLocationId)?.name || "江湖途中"}。</p>
          </header>
          <div className={styles.worldCurrentLife}>
            <span className={styles.worldLifeSeal}>{selected.game.hero.name.slice(0, 1)}</span>
            <div><small>当前人生</small><strong>{selected.game.hero.name} · {selected.game.hero.epithet}</strong><p>{household.partners.length ? `与${household.partners.map((partner) => partner.name).join("、")}共立家门` : "此刻仍独自行路"}{household.children.length ? `，家中有${household.children.map((child) => child.name).join("、")}` : ""}。</p></div>
          </div>
          <div className={styles.worldAffairSummary}>
            <span><TrophyOutlined /><strong>{selected.game.chronicle.ranking.holderName ? `${selected.game.chronicle.ranking.holderName}居天下第一` : "天下第一仍待群雄争定"}</strong></span>
            <p>{activeProjects.length ? activeProjects.map((project) => `${project.shortTitle} · ${project.stage}`).join("；") : "眼下没有未决的天下大事。"}</p>
          </div>
          <section className={styles.previousLives}>
            <div className={styles.drawerSectionTitle}><span>历代人物</span><small>{archives.length ? "旧人的名字仍在世间" : "尚无前代落款"}</small></div>
            {archives.slice(0, 4).map((life) => (
              <article key={life.id}><HistoryOutlined /><div><strong>第{life.generation}代 · {life.name}</strong><small>{life.age}岁落款 · {life.endingTitle}</small><p>{life.endingSummary}</p></div></article>
            ))}
          </section>
          <div className={styles.worldLibraryActions}>
            <button type="button" className={styles.worldPrimaryAction} onClick={() => onContinue(selected.id)}><BookOutlined /><span><small>回到当前年月</small><strong>续写{selected.game.hero.name}的人生</strong></span></button>
            <button type="button" disabled={!canBeginNewLife} onClick={() => onNewLife?.(selected.id)} title={canBeginNewLife ? "让旧主角留在世界中，由后来者接卷" : "当前人生落款后，才可由后来者接卷"}><TeamOutlined /> 同一江湖，另启一生</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatStrip({ game }: { game: NovelState }) {
  return (
    <div className={styles.statStrip}>
      <div className={styles.healthStat}>
        <div className={styles.statTopline}><span><HeartOutlined /> 气血</span><strong>{conditionLabel(game.hero.health, game.hero.maxHealth)}</strong></div>
        <div className={styles.progressTrack}><span style={{ width: `${(game.hero.health / game.hero.maxHealth) * 100}%` }} /></div>
      </div>
      {STAT_META.map((stat) => (
        <div className={styles.miniStat} key={stat.key} title={stat.label}>
          <span className={styles.miniStatIcon}>{stat.icon}</span>
          <span>{stat.short}</span>
          <strong>{aptitudeLabel(game.hero.stats[stat.key])}</strong>
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
        <p className={styles.heroSubtitle}>{game.life.age}岁 · {game.hero.sectName} · {game.hero.art}</p>
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
          <div><WalletOutlined /><span>银两</span><strong>{purseLabel(game.hero.silver)}</strong></div>
          <div><CompassOutlined /><span>线索</span><strong>{clueLabel(game.hero.clues)}</strong></div>
          <div className={game.hero.heat > 55 ? styles.dangerResource : ""}><SafetyOutlined /><span>风声</span><strong>{heatLabel(game.hero.heat)}</strong></div>
        </div>
      </div>
      <div className={styles.railActions}>
        <button type="button" aria-label="打开江湖志" onClick={() => onOpen("journal")}><BookOutlined /><span>本卷正文</span><small>{game.narrative.chapters.reduce((total, chapter) => total + chapter.scenes.length, 0)}</small></button>
        <button type="button" aria-label="打开行路图" onClick={() => onOpen("map")}><CompassOutlined /><span>行路图</span><small>{game.discoveredLocationIds.length}/{game.locations.length}</small></button>
        <button type="button" aria-label="打开同行者" onClick={() => onOpen("cast")}><TeamOutlined /><span>同行者</span><small>{game.companions.length}/2</small></button>
        <button type="button" aria-label="打开生涯年鉴" onClick={() => onOpen("chronicle")}><HistoryOutlined /><span>生涯年鉴</span><small>{gameDate(game).year}年</small></button>
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
      <div className={styles.sectionHeading}><span>江湖行路图</span><small>{gameDateLabel(game)} · {game.discoveredLocationIds.length} 处已至</small></div>
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
            <span>{formatWuxiaDate(wuxiaDateFromDay(movement.day, game.chronicle.eraName))}</span>
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
  if (kind === "bond" || kind === "pursue" || kind === "rite") return <HeartOutlined />;
  if (kind === "travel" || kind === "opportunity") return <CompassOutlined />;
  if (kind === "world_project") return <GlobalOutlined />;
  if (kind === "rest") return <SafetyOutlined />;
  if (kind === "found_sect") return <TeamOutlined />;
  return <BookOutlined />;
};

const planningActivitiesForDisplay = (game: NovelState) => [
  ...game.campaign.availableActivities.filter((activity) => activity.kind === "rite"),
  ...game.campaign.availableActivities.filter((activity) => activity.kind !== "rite"),
];

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

function PlanningBoard({ game, onSelectAgenda, onActivity, onIntent, onPause, onCloseYear, onConclude }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
  onCloseYear?: () => void;
  onConclude: (endingId: string) => void;
}) {
  const [changingAgenda, setChangingAgenda] = useState(false);
  const [confirmYearEnd, setConfirmYearEnd] = useState(false);
  const agenda = game.campaign.agenda!;
  const openOpportunities = game.campaign.opportunities
    .filter((opportunity) => ["announced", "open"].includes(opportunity.status))
    .sort((left, right) => left.endDay - right.endDay)
    .slice(0, 3);
  const activeProjects = game.chronicle.projects
    .filter((project) => ["announced", "active"].includes(project.status))
    .slice(0, 3);
  const rites = game.campaign.availableActivities.filter((activity) => activity.kind === "rite");
  const ordinaryActivities = game.campaign.availableActivities.filter((activity) => activity.kind !== "rite");
  const endingOptions = getLifeEndingOptions(game).filter((option) => option.unlocked);
  const yearDepth = game.life.scenesThisYear / Math.max(1, game.life.maxScenesPerYear);
  const yearStage = yearDepth >= 0.72 ? "岁暮渐近" : yearDepth >= 0.38 ? "行至年中" : "岁序初开";
  const householdLabel = game.life.household.children.length
    ? "门庭已有后人"
    : game.life.household.partners.length
      ? "已有同心之人"
      : game.life.household.swornSiblingActorIds.length
        ? "已有结义手足"
        : "此刻独行";
  const renderActivity = (activity: NovelState["campaign"]["availableActivities"][number], index: number) => (
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
  );
  if (changingAgenda) {
    return <AgendaChooser game={game} compact onSelect={(agendaId) => { onSelectAgenda(agendaId); setChangingAgenda(false); }} onCancel={() => setChangingAgenda(false)} />;
  }
  return (
    <section className={styles.planningBoard} aria-label="安排今日行程">
      <header className={styles.planningHeader}>
        <div>
          <span>{gameDateLabel(game)} · {game.locations.find((location) => location.id === game.currentLocationId)?.name}</span>
          <h2>{agenda.title}</h2>
          <p>{agenda.description}</p>
        </div>
        <button type="button" onClick={() => setChangingAgenda(true)}><ReloadOutlined /> 更换路线</button>
      </header>
      <div className={styles.agendaProgress}>
        <span><small>当前所求</small><strong>{agenda.primaryVerb}</strong></span>
        <div><i style={{ width: `${agenda.progress}%` }} /></div>
        <em>{agenda.completedSteps ? "这条路已经留下脚印" : "这条路正要起步"}</em>
      </div>
      <div className={styles.lifeLedger} aria-label="人生近况">
        <span><CalendarOutlined /><small>今岁</small><strong>{yearStage}</strong></span>
        <span><HomeOutlined /><small>家门</small><strong>{householdLabel}</strong></span>
        <span><TrophyOutlined /><small>武名</small><strong>{game.chronicle.ranking.heroBest}</strong></span>
        <span><HistoryOutlined /><small>生涯</small><strong>{game.life.age}岁 · 第{game.life.generation}代</strong></span>
      </div>

      {(openOpportunities.length > 0 || activeProjects.length > 0) && (
        <section className={styles.opportunityTicker} aria-label="今岁江湖大事">
          <div className={styles.planningSectionTitle}><span>今岁江湖</span><small>大会会再开，天下大事也会被旁人继续推动</small></div>
          {activeProjects.length > 0 && (
            <div className={styles.projectTicker}>
              {activeProjects.map((project) => (
                <article key={project.id}>
                  <span>{project.stage}</span>
                  <div><strong>{project.shortTitle}</strong><p>{projectStageDescription(project)}</p></div>
                  <small>{game.locations.find((location) => location.id === project.locationId)?.name || "江湖各处"}</small>
                </article>
              ))}
            </div>
          )}
          <div>
            {openOpportunities.map((opportunity) => (
              <p key={opportunity.id}>
                <span>{opportunity.status === "open" ? "正在举行" : formatWuxiaDate(wuxiaDateFromDay(opportunity.startDay, game.chronicle.eraName))}</span>
                <strong>{opportunity.shortTitle}</strong>
                <small>{game.locations.find((location) => location.id === opportunity.locationId)?.name} · {formatWuxiaDate(wuxiaDateFromDay(opportunity.endDay, game.chronicle.eraName))}收场</small>
              </p>
            ))}
          </div>
        </section>
      )}

      <LeadIntentBoard game={game} onIntent={onIntent} onPause={onPause} />

      {rites.length > 0 && (
        <section className={styles.ritePlanner} aria-label="可举行的关系仪式">
          <div className={styles.planningSectionTitle}><span>可行之礼</span><small>名分不会凭空出现，要由彼此当面作答</small></div>
          <div className={styles.activityGrid}>{rites.map((activity, index) => renderActivity(activity, index))}</div>
        </section>
      )}

      <section className={styles.activityPlanner} aria-label="可安排活动">
        <div className={styles.planningSectionTitle}><span>今日做什么？</span><small>选择行动后，才会生成对应的一幕</small></div>
        <div className={styles.activityGrid}>{ordinaryActivities.map((activity, index) => renderActivity(activity, index + rites.length))}</div>
      </section>

      <section className={styles.yearEndAction} aria-label="岁末安排">
        <div><CalendarOutlined /><span><small>不必把一年拆成无数琐事</small><strong>愿意时，可以让余下日子安静过去</strong><p>人物仍会赶路，大会会落幕，天下大事也会继续生长；来年你会年长一岁。</p></span></div>
        {confirmYearEnd ? (
          <div className={styles.yearEndConfirm} role="group" aria-label="确认结束今年">
            <button type="button" onClick={() => setConfirmYearEnd(false)}>再走几日</button>
            <button type="button" disabled={!onCloseYear} onClick={onCloseYear}>收住今年</button>
          </div>
        ) : (
          <button type="button" disabled={!onCloseYear} onClick={() => setConfirmYearEnd(true)}>今年就这样吧 <span aria-hidden="true">↗</span></button>
        )}
      </section>

      {endingOptions.length > 0 && (
        <section className={styles.endingInvitation} aria-label="可选择的人生结局">
          <div className={styles.planningSectionTitle}><span>这一生已有可落笔处</span><small>先展开尾声看看；若不愿结束，仍可回来继续游历</small></div>
          <div className={styles.endingOptionList}>
            {endingOptions.map((option) => (
              <button type="button" key={option.id} onClick={() => onConclude(option.id)}>
                <span><small>{option.tag}</small><strong>{option.title}</strong><em>{option.subtitle}</em></span><span className={styles.choiceArrow}>↗</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function ChapterBreakView({ game, onContinue }: { game: NovelState; onContinue: () => void }) {
  const milestone = game.campaign.chapterMilestone;
  if (!milestone) return null;
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
        <span><strong>{milestone.unresolvedLeadIds.length ? "旧线未断" : "此章已清"}</strong><small>人物、机会与传闻会如实带进下一章</small></span>
        <span><strong>{gameDateLabel(game)}</strong><small>世界人物仍按自己的日子行路</small></span>
        <span><strong>{game.campaign.legacy.martialInsights ? "招意留心" : "武学如常"}</strong><small>所得领悟与所学招式都会保留</small></span>
      </div>
      <button type="button" className={styles.chapterContinue} onClick={onContinue} aria-label="开启下一章">
        <span><small>故事不会在这里结束</small><strong>开启下一章</strong></span><span className={styles.startArrow}>↗</span>
      </button>
    </section>
  );
}

function YearBreakView({ game, onContinue }: { game: NovelState; onContinue: () => void }) {
  const milestone = game.life.pendingYearMilestone;
  if (!milestone) return null;
  return (
    <section className={styles.yearBreak} aria-label={`${milestone.title}年终回顾`}>
      <span className={styles.chapterBreakKicker}><CalendarOutlined /> {milestone.title}</span>
      <h2>又一岁，写进江湖</h2>
      <p className={styles.yearBreakAge}>{game.hero.name} · {milestone.age}岁</p>
      <p className={styles.chapterBreakSummary}>{milestone.summary}</p>
      <div className={styles.chapterAchievements}>
        {milestone.highlights.length > 0
          ? milestone.highlights.map((highlight) => <p key={highlight}><StarOutlined /><span>{highlight}</span></p>)
          : <p><HistoryOutlined /><span>这一年没有惊天大事，平静本身也被年鉴记下。</span></p>}
      </div>
      <div className={styles.yearBreakWorld}>
        <strong>江湖没有随你停笔</strong>
        <p>{game.chronicle.projects.filter((project) => ["announced", "active"].includes(project.status)).map((project) => `${project.shortTitle}已至“${project.stage}”`).join("；") || "这一年天下暂得安静。"}</p>
      </div>
      <button type="button" className={styles.chapterContinue} onClick={onContinue} aria-label="翻入下一年">
        <span><small>旧人旧事仍在原处</small><strong>翻入下一年</strong></span><span className={styles.startArrow}>↗</span>
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
          <button type="button" className={`${styles.choiceCard} ${styles[`choiceTone${choice.tone}`]}`} key={choice.id} disabled={Boolean(choice.unavailableReason)} onClick={() => onChoose(choice.id)}>
            <span className={styles.choiceIndex}>{index + 1}</span>
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitleLine}><strong>{choice.label}</strong><small>{choice.unavailableReason ? "暂不可选" : `${choice.risk}风险`}</small></span>
              <span className={styles.choiceDescription}>{choice.unavailableReason || choice.description}</span>
              <span className={styles.choiceMeta}>
                {choice.preview.map((preview) => <em className={styles[`preview${preview.tone}`]} key={`${preview.label}-${preview.value}`}>{preview.label} {qualitativePreviewValue(preview.value)}</em>)}
                {choice.check && !choice.unavailableReason && <em className={styles.checkMeta}>{immersiveCheckLabel(choice.check.label)} · {checkConfidence(choice.check.odds)}</em>}
              </span>
            </span>
            <span className={styles.choiceArrow}>{choice.unavailableReason ? <LockOutlined /> : "↗"}</span>
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
        <div><span>交手实录</span><strong>{combat.success ? "数合之后，胜负已定" : "数合之后，暂退一步"}</strong></div>
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
  const continueLabel = game.life.pendingYearMilestone || game.life.scenesThisYear >= game.life.maxScenesPerYear
    ? "查看岁末回顾"
    : outcome.turn > 0 && outcome.turn % game.campaign.chapterLength === 0
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

function StoryColumn({ game, onSelectAgenda, onActivity, onIntent, onPause, onChoose, onContinue, onCloseYear, onConclude }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onCloseYear?: () => void;
  onConclude: (endingId: string) => void;
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
      eyebrow: `${gameDateLabel(game)} · 安排行程`,
      title: game.campaign.agenda?.title || "今日做什么？",
      subtitle: "人物、地点和机会都在照常变化，这一幕由你的行动开始。",
    };
    if (phase === "year_break") return {
      eyebrow: `${game.life.pendingYearMilestone?.title || gameDateLabel(game)} · 岁序`,
      title: "又一岁，写进江湖",
      subtitle: "你长了一岁，旧人和天下也各自走过了这一年。",
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
      <div className={`${styles.storyScroll} ${outcome ? styles.outcomeScroll : ""} ${["choose_agenda", "planning", "chapter_break", "year_break"].includes(phase) ? styles.planningScroll : ""}`}>
        {outcome ? <OutcomeReveal game={game} onContinue={onContinue} /> : phase === "choose_agenda" ? (
          <AgendaChooser game={game} onSelect={onSelectAgenda} />
        ) : phase === "planning" ? (
          <PlanningBoard game={game} onSelectAgenda={onSelectAgenda} onActivity={onActivity} onIntent={onIntent} onPause={onPause} onCloseYear={onCloseYear} onConclude={onConclude} />
        ) : phase === "chapter_break" ? (
          <ChapterBreakView game={game} onContinue={onContinue} />
        ) : phase === "year_break" ? (
          <YearBreakView game={game} onContinue={onContinue} />
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
  const phaseLabel = game.campaign.phase === "choose_agenda"
    ? "先选路线"
    : game.campaign.phase === "planning"
      ? "安排行程"
      : game.campaign.phase === "scene"
        ? "此幕待决"
        : game.campaign.phase === "outcome"
          ? "新正文"
          : game.campaign.phase === "chapter_break"
            ? "本章已成"
            : game.campaign.phase === "year_break"
              ? "岁序收笔"
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
        <div className={styles.calendarLine}><span><CalendarOutlined /> {gameDateLabel(game)}</span><strong>{game.life.age}岁</strong></div>
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

function EndingView({ game, onResume, onSameWorld, onNewWorld, onWorldLibrary }: {
  game: NovelState;
  onResume?: () => void;
  onSameWorld?: () => void;
  onNewWorld: () => void;
  onWorldLibrary: () => void;
}) {
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
          <button type="button" disabled={!onResume} onClick={onResume}><CompassOutlined /> 继续游历</button>
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
              <section className={styles.endingNextSteps} aria-label="尾声之后">
                <span className={styles.chapterBreakKicker}>尾声之后</span>
                <h2>这方江湖，不必随一人落幕</h2>
                <p>你可以撤下尾声继续走，也可以把此人留作旧日侠客，让下一位主角在同一年月和关系网中醒来。</p>
                <div>
                  <button type="button" className={styles.endingResumeAction} disabled={!onResume} onClick={onResume}><CompassOutlined /><span><small>暂不落款</small><strong>继续此人的江湖路</strong></span></button>
                  <button type="button" className={styles.endingLegacyAction} disabled={!onSameWorld} onClick={onSameWorld}><TeamOutlined /><span><small>旧人仍在世间</small><strong>同一江湖，另启一生</strong></span></button>
                  <button type="button" onClick={onWorldLibrary}><HistoryOutlined /> 回到江湖册</button>
                  <button type="button" onClick={onNewWorld}><GlobalOutlined /> 另造新江湖</button>
                </div>
              </section>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

const actorDisplayName = (game: NovelState, actorId: string) => game.world.actors.find((actor) => actor.id === actorId)?.name
  || game.chronicle.protagonists.find((life) => life.actorId === actorId)?.name
  || "一位未留名的江湖人";
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

function HouseholdLedger({ game }: { game: NovelState }) {
  const { household } = game.life;
  const swornNames = household.swornSiblingActorIds.map((actorId) => actorDisplayName(game, actorId));
  return (
    <div className={styles.householdLedger}>
      <div className={styles.householdLead}>
        <HomeOutlined />
        <span><small>{game.hero.name}的家门簿</small><strong>{household.partners.length || household.children.length || swornNames.length ? "名字已经彼此相连" : "此刻仍是一人一卷"}</strong></span>
      </div>
      {swornNames.length > 0 && <section><span>结义手足</span><p>{swornNames.join("、")}</p></section>}
      {household.partners.map((partner) => (
        <section key={`${partner.kind}-${partner.actorId}`}>
          <span>{partner.kind === "spouse" ? "夫妻" : "侧室"}</span>
          <strong>{partner.name}</strong>
          <small>{formatWuxiaDate(wuxiaDateFromDay(partner.sinceDay, game.chronicle.eraName))}写入家门簿</small>
        </section>
      ))}
      {household.children.map((child) => (
        <section key={child.actorId}>
          <span>子女</span><strong>{child.name}</strong>
          <small>{formatWuxiaDate(wuxiaDateFromDay(child.birthDay, game.chronicle.eraName))}生于{game.locations.find((location) => location.id === child.homeLocationId)?.name || "家中"}</small>
        </section>
      ))}
      {!household.partners.length && !household.children.length && !swornNames.length && <p className={styles.drawerHint}>真正的结义、婚约与子女会从相处和当面选择中生长，不会因一条数值自动出现。</p>}
    </div>
  );
}

function WorldProjectLedger({ game }: { game: NovelState }) {
  return (
    <div className={styles.worldProjectLedger}>
      {game.chronicle.projects.map((project) => {
        const latestContribution = project.contributions[project.contributions.length - 1];
        return (
          <article key={project.id}>
            <header><span>{project.stage}</span><strong>{project.title}</strong><small>{game.locations.find((location) => location.id === project.locationId)?.name || "天下各处"}</small></header>
            <p>{project.description}</p>
            <div className={styles.projectStageTrack} aria-label={project.stage}><i className={styles[`projectStage${project.stage === "风声初起" ? "Rumor" : project.stage === "群雄会盟" ? "Alliance" : project.stage === "战局正急" ? "Urgent" : project.stage === "最后一役" ? "Final" : "Done"}Core`]} /></div>
            <small>{projectStageDescription(project)}</small>
            {latestContribution && <blockquote><strong>{latestContribution.actorName}</strong><span>{latestContribution.description}</span><small>{formatWuxiaDate(wuxiaDateFromDay(latestContribution.day, game.chronicle.eraName))}</small></blockquote>}
          </article>
        );
      })}
    </div>
  );
}

function TournamentLedger({ game }: { game: NovelState }) {
  const { ranking } = game.chronicle;
  return (
    <div className={styles.tournamentLedger}>
      <div className={styles.rankingBanner}><CrownOutlined /><span><small>{ranking.title}</small><strong>{ranking.holderName || "尚待群雄争定"}</strong><p>你此生最好的正式战绩：{ranking.heroBest}</p></span></div>
      {game.chronicle.tournaments.slice().reverse().map((record) => (
        <article key={record.opportunityId}><span>{game.chronicle.eraName}{record.year}年</span><strong>{record.title}</strong><em>{record.result}</em><small>{record.championActorId ? `${actorDisplayName(game, record.championActorId)}留名榜首` : "此届榜首未入你的已知记载"}</small></article>
      ))}
      {!game.chronicle.tournaments.length && <p className={styles.drawerHint}>大会会按年月重开。错过一届，不会永远失去争名的机会。</p>}
    </div>
  );
}

function ProtagonistLedger({ game }: { game: NovelState }) {
  const archives = [...game.chronicle.protagonists].reverse();
  return (
    <div className={styles.protagonistLedger}>
      <article className={styles.currentProtagonist}><span>今</span><div><small>第{game.life.generation}代 · 正在行路</small><strong>{game.hero.name}</strong><p>{game.life.age}岁 · {game.hero.epithet} · {game.hero.sectName}</p></div></article>
      {archives.map((life) => (
        <article key={life.id}><span>{life.generation}</span><div><small>前代 · {life.age}岁落款</small><strong>{life.name} · {life.endingTitle}</strong><p>{life.endingSummary}</p>{life.foundedSectName && <em>留下门庭 · {life.foundedSectName}</em>}</div></article>
      ))}
      {!archives.length && <p className={styles.drawerHint}>当这一生真正落款，旧主角会作为世界人物留在这里，而不是被新存档抹去。</p>}
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
        <span>{game.narrative.martial.name} · {aptitudeLabel(game.narrative.martial.mastery)}</span>
        <p>{game.narrative.martial.philosophy}</p>
        <small>行功之忌 · {game.narrative.martial.cost}</small>
      </div>
      <div className={styles.techniqueTable}>
        {heroTechniques.map(({ known, definition }) => definition && (
          <article key={known.techniqueId}>
            <header><span>{definition.nature}</span><strong>{definition.name}</strong><em>{known.source}</em></header>
            <p>{definition.description}</p>
            <div>
              <span>劲路 <b>{techniquePowerLabel(definition.power)}</b></span><span>身势 <b>{techniqueSpeedLabel(definition.speed)}</b></span><span>落点 <b>{techniqueAccuracyLabel(definition.accuracy)}</b></span><span>取势 <b>{techniqueRangeLabel(definition.range)}</b></span><span>行气 <b>{techniqueCostLabel(definition.qiCost)}</b></span><span>回转 <b>{techniqueRecoveryLabel(definition.cooldown)}</b></span>
            </div>
            <footer><i><b style={{ width: `${known.mastery}%` }} /></i><span>火候 {aptitudeLabel(known.mastery)} · {techniqueDifficultyLabel(definition.difficulty)}</span></footer>
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
        <p><strong>武学领悟</strong><small>{martialInsightLabel(game.campaign.legacy.martialInsights)}</small></p>
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
        <div className={styles.drawerSectionTitle}><span>近十次行踪</span><small>每人每日最多走一段路</small></div>
        <div className={styles.travelRows}>
          {latestMovements.map((movement) => (
            <p key={`${movement.day}-${movement.actorId}-${movement.fromLocationId}-${movement.toLocationId}`}>
              <span>{formatWuxiaDate(wuxiaDateFromDay(movement.day, game.chronicle.eraName))}</span><strong>{actorDisplayName(game, movement.actorId)}</strong><small>{game.locations.find((location) => location.id === movement.fromLocationId)?.name} → {game.locations.find((location) => location.id === movement.toLocationId)?.name}</small><em>{movement.reason}</em>
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

function Drawer({ panel, game, onClose, onConclude, onWorldLibrary }: {
  panel: Panel;
  game: NovelState;
  onClose: () => void;
  onConclude: (endingId: string) => void;
  onWorldLibrary: () => void;
}) {
  if (!panel) return null;
  const title = panel === "journal" ? "本卷正文" : panel === "map" ? "行路图" : panel === "cast" ? "人物与江湖" : panel === "chronicle" ? "生涯年鉴" : "卷外设置";
  const knownCast = game.narrative.cast.filter((character) => character.firstSeenTurn !== undefined);
  const relations = knownRelations(game.world);
  const knownActorIds = new Set(relations.flatMap((relation) => [relation.fromActorId, relation.toActorId]));
  const knownWorldActors = game.world.actors.filter((actor) => actor.id !== "hero" && (
    knownActorIds.has(actor.id)
    || actor.memories.length > 0
    || actor.locationId === game.currentLocationId
    || game.companions.some((companion) => actor.characterId === companion.characterId)
  ));
  const endingOptions = getLifeEndingOptions(game).filter((option) => option.unlocked);
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
            <section><div className={styles.drawerSectionTitle}><span>江湖人物行踪</span><small>{knownWorldActors.length} 人可追踪</small></div><div className={styles.actorLedger}>{knownWorldActors.map((actor) => <article key={actor.id}><span>{actor.name.slice(0, 1)}</span><div><h3>{actor.name}<small>{actor.title}</small></h3><p>{actorLocationName(game, actor)} · {actor.activity} · 停至{formatWuxiaDate(wuxiaDateFromDay(actor.stayUntilDay, game.chronicle.eraName))}</p><small>{actor.goals[0]?.reason || actor.role}</small></div></article>)}</div></section>
            <section><div className={styles.drawerSectionTitle}><span>关系网</span><small>{relations.length} 条已知牵系</small></div><RelationshipLedger game={game} relations={relations} /></section>
            <section><div className={styles.drawerSectionTitle}><span>势力志</span><small>辨招、交手与态度都会留下账</small></div>{game.narrative.factions.map((faction) => <FactionDossier game={game} faction={faction} key={faction.id} />)}</section>
            <section><div className={styles.drawerSectionTitle}><span>武学谱</span><small>招式、来源与实战熟练</small></div><MartialLedger game={game} /></section>
          </div>
        )}
        {panel === "chronicle" && (
          <div className={styles.drawerWorld}>
            <section className={styles.chronicleDate}><CalendarOutlined /><div><small>此刻岁序</small><strong>{gameDateLabel(game)} · {game.life.age}岁</strong><p>第{game.life.generation}代执卷人 · {game.hero.name}</p></div></section>
            <section><div className={styles.drawerSectionTitle}><span>家门簿</span><small>关系经仪式写入世界</small></div><HouseholdLedger game={game} /></section>
            <section><div className={styles.drawerSectionTitle}><span>天下大事</span><small>你不在场时，旁人也会继续行动</small></div><WorldProjectLedger game={game} /></section>
            <section><div className={styles.drawerSectionTitle}><span>武林名次</span><small>大会按年月重开，榜首并非永久</small></div><TournamentLedger game={game} /></section>
            <section><div className={styles.drawerSectionTitle}><span>历代人物</span><small>落款者仍会留在同一世界</small></div><ProtagonistLedger game={game} /></section>
            <section><div className={styles.drawerSectionTitle}><span>流年小记</span><small>{game.life.annualMilestones.length ? "走过的每一年都有落点" : "第一年仍在继续"}</small></div><div className={styles.annualLedger}>{game.life.annualMilestones.slice().reverse().map((milestone) => <article key={`${milestone.year}-${milestone.endedDay}`}><span>{milestone.title}</span><strong>{milestone.age}岁</strong><p>{milestone.summary}</p></article>)}</div></section>
          </div>
        )}
        {panel === "settings" && (
          <div className={styles.drawerSettings}>
            <div className={styles.settingsSeed}>
              <span>本卷种子</span><strong>{game.setup.seed}</strong>
              <button type="button" onClick={() => copyText(game.setup.seed)}><ShareAltOutlined /> 分享种子</button>
              <button type="button" onClick={() => copyText(manuscriptText(game.narrative, game.ending))}><CopyOutlined /> 复制当前正文</button>
            </div>
            <div className={styles.settingsEndingOptions}>
              <span>可写成的尾声</span>
              {endingOptions.map((option) => <button type="button" key={option.id} disabled={["scene", "outcome"].includes(game.campaign.phase)} onClick={() => onConclude(option.id)}><BookOutlined /><span><strong>{option.title}</strong><small>{option.reason}</small></span></button>)}
              {!endingOptions.length && <p>再走几幕，才有足够经历为这一卷落款。</p>}
            </div>
            <p>尾声只会先展开预览。若觉得缘分未尽，可以撤下尾声继续游历。</p>
            <button type="button" className={styles.resetButton} onClick={onWorldLibrary}><HistoryOutlined /> 返回江湖册</button>
            <p>返回卷册不会删除当前人物、关系或天下大事。</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function GameScreen({ game, onSelectAgenda, onActivity, onIntent, onPause, onChoose, onContinue, onCloseYear, onConclude, onResumeAfterEnding, onStartSuccessor, onNewWorld, onWorldLibrary }: {
  game: NovelState;
  onSelectAgenda: (agendaId: string) => void;
  onActivity: (activityId: string) => void;
  onIntent: (leadId: string, intent: PlayerIntent) => void;
  onPause: (leadId: string) => void;
  onChoose: (choiceId: string) => void;
  onContinue: () => void;
  onCloseYear: () => void;
  onConclude: (endingId: string) => void;
  onResumeAfterEnding: () => void;
  onStartSuccessor: () => void;
  onNewWorld: () => void;
  onWorldLibrary: () => void;
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
      if (["outcome", "chapter_break", "year_break"].includes(game.campaign.phase)) {
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
        const activity = planningActivitiesForDisplay(game)[index];
        if (activity?.enabled) onActivity(activity.id);
        return;
      }
      if (game.campaign.phase === "scene") {
        const choice = game.currentEvent?.choices[index];
        if (choice && !choice.unavailableReason) onChoose(choice.id);
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
        <StoryColumn game={game} onSelectAgenda={onSelectAgenda} onActivity={onActivity} onIntent={onIntent} onPause={onPause} onChoose={onChoose} onContinue={onContinue} onCloseYear={onCloseYear} onConclude={onConclude} />
        <aside className={styles.rightRail}><StatStrip game={game} /><RouteMap game={game} /><WorldPulse game={game} /><CompanionPanel game={game} /></aside>
      </div>
      <div className={styles.mobileDock}><button type="button" aria-label="打开江湖志" onClick={() => openPanel("journal")}><BookOutlined />江湖志</button><button type="button" aria-label="打开行路图" onClick={() => openPanel("map")}><CompassOutlined />行路图</button><button type="button" aria-label="打开人物与江湖" onClick={() => openPanel("cast")}><TeamOutlined />人物谱</button><button type="button" aria-label="打开生涯年鉴" onClick={() => openPanel("chronicle")}><HistoryOutlined />生涯</button></div>
      <EndingView game={game} onResume={onResumeAfterEnding} onSameWorld={onStartSuccessor} onNewWorld={onNewWorld} onWorldLibrary={onWorldLibrary} />
      <Drawer panel={panel} game={game} onClose={() => setPanel(null)} onConclude={(endingId) => { setPanel(null); onConclude(endingId); }} onWorldLibrary={onWorldLibrary} />
    </main>
  );
}

export default function WuxiaGame() {
  const controller: WuxiaUiController = useWuxiaGame();
  const {
    game,
    saveRoot,
    worlds,
    screen: appScreen,
    hasSavedGame,
    saveError,
    startGame,
    continueGame,
    selectWorld,
    openWorldLibrary,
    openNewWorldSetup,
    chooseAgenda,
    chooseActivity,
    setLeadIntent,
    pauseLead,
    chooseAction,
    continueAction,
    closeYear,
    concludeGame,
    resumeAfterEnding,
    startSuccessor,
  } = controller;
  const [successorWorldId, setSuccessorWorldId] = useState<string | null>(null);
  const inheritedWorld = successorWorldId ? worlds.find((world) => world.id === successorWorldId) : undefined;

  const showWorldLibrary = useCallback(() => {
    setSuccessorWorldId(null);
    openWorldLibrary();
  }, [openWorldLibrary]);

  const showNewWorldSetup = useCallback(() => {
    setSuccessorWorldId(null);
    openNewWorldSetup();
  }, [openNewWorldSetup]);

  const showSuccessorSetup = useCallback((worldId: string) => {
    selectWorld(worldId);
    setSuccessorWorldId(worldId);
  }, [selectWorld]);

  const createSuccessor = useCallback((setup: Partial<NovelSetup>) => {
    startSuccessor(setup);
    setSuccessorWorldId(null);
  }, [startSuccessor]);

  useEffect(() => {
    window.advanceTime = () => {
      // This game advances only on explicit choices; real time never mutates simulation state.
    };
    window.render_game_to_text = () => {
      if (inheritedWorld) return JSON.stringify({
        edition: "sandbox",
        screen: "successor-setup",
        worldId: inheritedWorld.id,
        protagonistId: inheritedWorld.game.life.protagonistId,
        date: gameDateLabel(inheritedWorld.game),
        previousHero: inheritedWorld.game.hero.name,
        generation: inheritedWorld.game.life.generation + 1,
      });
      if (!game) return JSON.stringify({
        edition: "sandbox",
        screen: appScreen === "library" ? "world-library" : appScreen,
        saved: hasSavedGame,
        worlds: worlds.map((world) => ({
          worldId: world.id,
          protagonistId: world.game.life.protagonistId,
          label: world.label,
          date: gameDateLabel(world.game),
          activeHero: world.game.hero.name,
          age: world.game.life.age,
          generation: world.game.life.generation,
          archivedProtagonists: world.game.chronicle.protagonists.map((life) => ({ name: life.name, ending: life.endingTitle })),
        })),
      });
      const scenes = game.narrative.chapters.flatMap((chapter) => chapter.scenes);
      const currentChapterScenes = game.narrative.chapters.find((chapter) => chapter.number === game.chapter)?.scenes.length || 0;
      const gameScreen = game.ending
        ? "ending"
        : game.campaign.phase === "choose_agenda"
          ? "agenda"
          : game.campaign.phase === "planning"
            ? "planning"
            : game.campaign.phase === "chapter_break"
              ? "chapter_break"
              : game.campaign.phase === "year_break"
                ? "year_break"
                : game.campaign.phase === "outcome"
                  ? "outcome"
                  : "story";
      return JSON.stringify({
        edition: "sandbox",
        version: game.version,
        worldId: game.chronicle.worldId,
        protagonistId: game.life.protagonistId,
        date: gameDateLabel(game),
        age: game.life.age,
        screen: gameScreen,
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
        choices: game.pendingOutcome ? [] : game.currentEvent?.choices.map((choice) => ({ id: choice.id, label: choice.label, risk: choice.risk, odds: choice.check?.odds, enabled: !choice.unavailableReason, unavailableReason: choice.unavailableReason })) || [],
        outcome: game.pendingOutcome || null,
        companions: game.companions.map((companion) => ({ name: companion.name, affinity: companion.affinity, characterId: companion.characterId })),
        household: {
          swornSiblings: game.life.household.swornSiblingActorIds.map((actorId) => actorDisplayName(game, actorId)),
          partners: game.life.household.partners.map((partner) => ({ name: partner.name, kind: partner.kind })),
          children: game.life.household.children.map((child) => ({ name: child.name, birthDay: child.birthDay })),
        },
        projects: game.chronicle.projects.map((project) => ({ title: project.title, stage: project.stage, status: project.status, outcome: project.outcome })),
        ranking: game.chronicle.ranking,
        endingCandidates: getLifeEndingOptions(game).filter((option) => option.unlocked).map((option) => ({ id: option.id, title: option.title })),
        archivedProtagonists: game.chronicle.protagonists.map((life) => ({ name: life.name, generation: life.generation, ending: life.endingTitle })),
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
        life: {
          ...game.life,
          date: gameDate(game),
          dateLabel: gameDateLabel(game),
          endingOptions: getLifeEndingOptions(game).map((option) => ({ id: option.id, title: option.title, unlocked: option.unlocked, reason: option.reason })),
        },
        chronicle: game.chronicle,
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
  }, [appScreen, game, hasSavedGame, inheritedWorld, worlds]);

  const content = (() => {
    if (appScreen === "loading") return <div className={styles.wuxiaLoading} role="status"><span>卷</span><p>正在翻检江湖旧册</p></div>;
    if (inheritedWorld) return (
      <StartScreen
        key={`successor-${inheritedWorld.id}`}
        hasSavedGame={hasSavedGame}
        inheritedWorld={inheritedWorld}
        onStart={createSuccessor}
        onContinue={continueGame}
        onBack={showWorldLibrary}
      />
    );
    if (appScreen === "library") return (
      <WorldLibrary
        worlds={worlds}
        activeWorldId={saveRoot?.activeWorldId}
        onContinue={selectWorld}
        onNewLife={showSuccessorSetup}
        onNewWorld={showNewWorldSetup}
      />
    );
    if (appScreen === "setup" || !game) return <StartScreen key="new-world" hasSavedGame={hasSavedGame} onStart={startGame} onContinue={continueGame} onBack={worlds.length ? showWorldLibrary : undefined} />;
    return (
      <GameScreen
        game={game}
        onSelectAgenda={chooseAgenda}
        onActivity={chooseActivity}
        onIntent={setLeadIntent}
        onPause={pauseLead}
        onChoose={chooseAction}
        onContinue={continueAction}
        onCloseYear={closeYear}
        onConclude={concludeGame}
        onResumeAfterEnding={resumeAfterEnding}
        onStartSuccessor={() => showSuccessorSetup(game.chronicle.worldId)}
        onNewWorld={showNewWorldSetup}
        onWorldLibrary={showWorldLibrary}
      />
    );
  })();

  return <div className={styles.wuxiaRoot}>{saveError && <div className={styles.saveError} role="alert">{saveError}</div>}{content}</div>;
}
