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
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import styles from "./WuxiaGame.module.css";
import { useWuxiaGame } from "./wuxia/game/useWuxiaGame";
import {
  AMBITION_OPTIONS,
  ORIGIN_OPTIONS,
  generateName,
  type AmbitionId,
  type NovelSetup,
  type NovelState,
  type OriginId,
  type StatKey,
} from "./wuxia/game/novelEngine";

declare global {
  interface Window {
    render_game_to_text?: () => string;
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

const chapterProgress = (game: NovelState) => Math.min(100, Math.round((game.turn / game.maxTurns) * 100));

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
        {!compact && <small>一卷一命 · INTERACTIVE NOVEL</small>}
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

  const selectedOrigin = ORIGIN_OPTIONS.find((item) => item.id === origin) || ORIGIN_OPTIONS[0];
  const selectedAmbition = AMBITION_OPTIONS.find((item) => item.id === ambition) || AMBITION_OPTIONS[0];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart({ heroName, origin, ambition, sectId: selectedOrigin.sectId, seed });
  };

  const randomizeSeed = () => {
    const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 999).toString().padStart(3, "0")}`;
    setSeed(stamp);
    setHeroName(generateName(stamp));
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
          <p className={styles.eyebrow}>A PROCEDURAL WUXIA NOVEL</p>
          <h1>把你的名字，<em>写进江湖。</em></h1>
          <p className={styles.introLead}>
            十二回合，四章风云。每一次取舍都会改变你的名声、伤痕和身边的人，直到最后一页落款。
          </p>
          <div className={styles.heroPortraitWrap}>
            <div className={styles.portraitHalo} />
            <Image src={selectedOrigin.portrait} alt={`${selectedOrigin.label}形象`} className={styles.heroPortrait} width={420} height={420} priority />
            <span className={styles.portraitCaption}>「风起于青萍之末」</span>
          </div>
          <div className={styles.startNotes}>
            <span><BookOutlined /> 可复现种子</span>
            <span><ThunderboltOutlined /> 分支检定</span>
            <span><TeamOutlined /> 关系与结局</span>
          </div>
        </section>

        <form className={styles.setupPanel} onSubmit={handleSubmit}>
          <div className={styles.panelKicker}>开卷设定 <span>01 / 01</span></div>
          <div className={styles.setupHeader}>
            <div>
              <h2>你要以谁的身份入局？</h2>
              <p>先定下出身和执念，故事会从这里长出来。</p>
            </div>
            <span className={styles.inkStamp}>起</span>
          </div>

          <span className={styles.fieldLabel}>姓名</span>
          <div className={styles.nameField}>
            <input id="wuxia-hero-name" value={heroName} onChange={(event) => setHeroName(event.target.value)} maxLength={8} />
            <button type="button" onClick={() => setHeroName(generateName(seed))} title="换一个名字" aria-label="换一个名字"><ReloadOutlined /></button>
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
            <button type="button" className={styles.iconButton} onClick={randomizeSeed} title="随机命数与姓名" aria-label="随机命数与姓名"><ReloadOutlined /></button>
          </div>
          <input id="wuxia-seed" className={styles.seedInput} value={seed} onChange={(event) => setSeed(event.target.value)} maxLength={32} />

          <div className={styles.setupSummary}>
            <span><strong>{selectedOrigin.label}</strong> · {selectedOrigin.epithet}</span>
            <span><strong>{selectedAmbition.label}</strong> · 偏重 {STAT_META.find((stat) => stat.key === selectedAmbition.stat)?.label}</span>
          </div>
          <button className={styles.startButton} type="submit"><span>落笔开卷</span><span className={styles.startArrow}>↗</span></button>
          {hasSavedGame && (
            <button type="button" className={styles.continueButton} onClick={onContinue}>继续上一卷 <span>→</span></button>
          )}
          <p className={styles.setupFootnote}>每局状态会自动保存 · 种子相同，命运路径可重演</p>
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
  return (
    <aside className={styles.leftRail}>
      <div className={styles.heroCard}>
        <div className={styles.heroCardTop}><span className={styles.rankMark}>壹</span><span className={styles.heroOrigin}>{game.hero.epithet}</span></div>
        <div className={styles.avatarFrame}><Image src={origin?.portrait || "/images/autochess/portraits/sui.png"} alt={`${game.hero.name}的角色形象`} width={180} height={180} /></div>
        <h2>{game.hero.name}</h2>
        <p className={styles.heroSubtitle}>{game.hero.sectName} · {game.hero.art}</p>
        <div className={styles.ambitionRibbon}><StarOutlined /> {ambition?.label} · {ambition?.description}</div>
        <div className={styles.heroResources}>
          <div><WalletOutlined /><span>银两</span><strong>{game.hero.silver}</strong></div>
          <div><CompassOutlined /><span>线索</span><strong>{game.hero.clues}<small>/6</small></strong></div>
          <div className={game.hero.heat > 55 ? styles.dangerResource : ""}><SafetyOutlined /><span>风声</span><strong>{game.hero.heat}</strong></div>
        </div>
      </div>
      <div className={styles.railActions}>
        <button type="button" aria-label="打开江湖志" onClick={() => onOpen("journal")}><BookOutlined /><span>江湖志</span><small>{game.log.length}</small></button>
        <button type="button" aria-label="打开行路图" onClick={() => onOpen("map")}><CompassOutlined /><span>行路图</span><small>{game.discoveredLocationIds.length}/{game.locations.length}</small></button>
        <button type="button" aria-label="打开同行者" onClick={() => onOpen("cast")}><TeamOutlined /><span>同行者</span><small>{game.companions.length}/2</small></button>
      </div>
    </aside>
  );
}

function RouteMap({ game }: { game: NovelState }) {
  return (
    <section className={styles.mapPanel}>
      <div className={styles.sectionHeading}><span>行路图</span><small>{game.discoveredLocationIds.length} 处已至</small></div>
      <div className={styles.routeMap}>
        <span className={`${styles.routePath} ${styles.routePathOne}`} />
        <span className={`${styles.routePath} ${styles.routePathTwo}`} />
        {game.locations.map((location) => {
          const active = location.id === game.currentLocationId;
          const discovered = game.discoveredLocationIds.includes(location.id);
          return (
            <div className={`${styles.mapNode} ${active ? styles.mapNodeActive : ""} ${discovered ? styles.mapNodeKnown : ""}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} key={location.id} title={location.name}>
              <span>{active ? "◆" : discovered ? "·" : "?"}</span>
              <small>{location.name}</small>
            </div>
          );
        })}
      </div>
      <div className={styles.currentLocation}><EnvironmentOutlined /><span><small>此刻所在</small><strong>{game.locations.find((location) => location.id === game.currentLocationId)?.name}</strong></span></div>
    </section>
  );
}

function CompanionPanel({ game }: { game: NovelState }) {
  return (
    <section className={styles.castPanel}>
      <div className={styles.sectionHeading}><span>同行者</span><small>{game.companions.length ? "关系会记得" : "尚无同行"}</small></div>
      {game.companions.length === 0 ? (
        <div className={styles.emptyCast}><span>—</span><p>江湖还很大，先把自己的名字写稳。</p></div>
      ) : game.companions.map((companion) => (
        <div className={styles.companionRow} key={companion.id}>
          <Image src={companion.portrait} alt="" width={76} height={76} />
          <div><strong>{companion.name}</strong><small>{companion.title} · {companion.trait}</small><div className={styles.affinityTrack}><span style={{ width: `${companion.affinity}%` }} /></div></div>
          <b>{companion.affinity}</b>
        </div>
      ))}
    </section>
  );
}

function ChoiceDeck({ game, onChoose }: { game: NovelState; onChoose: (choiceId: string) => void }) {
  if (!game.currentEvent) return null;
  return (
    <section className={styles.choiceDeck} aria-label="当前选择">
      <div className={styles.choiceDeckHeader}><span className={styles.choicePrompt}>你要怎么做？</span><span className={styles.choiceHint}>一念落笔，下一回合即成</span></div>
      <div className={styles.choiceGrid}>
        {game.currentEvent.choices.map((choice, index) => (
          <button type="button" className={`${styles.choiceCard} ${styles[`choiceTone${choice.tone}`]}`} key={choice.id} onClick={() => onChoose(choice.id)}>
            <span className={styles.choiceIndex}>{index + 1}</span>
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitleLine}><strong>{choice.label}</strong><small>{choice.risk}风险</small></span>
              <span className={styles.choiceDescription}>{choice.description}</span>
              <span className={styles.choiceMeta}>
                {choice.preview.map((preview) => <em className={styles[`preview${preview.tone}`]} key={`${preview.label}-${preview.value}`}>{preview.label} {preview.value}</em>)}
                {choice.check && <em className={styles.checkMeta}>{choice.check.label} {choice.check.odds}%</em>}
              </span>
            </span>
            <span className={styles.choiceArrow}>↗</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OutcomeReveal({ game, onContinue }: { game: NovelState; onContinue: () => void }) {
  const outcome = game.pendingOutcome;
  if (!outcome) return null;
  const status = outcome.check ? (outcome.success ? "success" : "failure") : "resolved";
  const statusLabel = outcome.check ? (outcome.success ? "检定成功" : "检定未过") : "抉择落定";
  const continueLabel = outcome.turn >= game.maxTurns ? "查看本卷结局" : "继续下一回";
  return (
    <section
      id="wuxia-turn-outcome"
      className={`${styles.outcomeReveal} ${styles[`outcome${status}`]}`}
      aria-label={`第${outcome.turn}回结果`}
      aria-live="polite"
    >
      <div className={styles.outcomeTopline}>
        <span>第 {outcome.turn} 回 · 落笔回响</span>
        <strong>{statusLabel}</strong>
      </div>
      <div className={styles.outcomeHeading}>
        <span className={styles.outcomeSeal}>{outcome.check ? (outcome.success ? "成" : "变") : "定"}</span>
        <div><small>你的选择</small><h2>{outcome.choiceLabel}</h2></div>
      </div>
      {outcome.check && (
        <div className={styles.outcomeCheck}>
          <span>{outcome.check.label}</span>
          <div className={styles.outcomeOdds} aria-hidden="true"><span style={{ width: `${outcome.check.odds}%` }} /></div>
          <small>胜算 {outcome.check.odds}%</small>
          <strong>掷签 {outcome.check.roll}</strong>
        </div>
      )}
      <div className={styles.outcomeLines}>
        {outcome.lines.map((entry) => (
          <p key={entry.id} className={styles[`eventType${entry.type}`]}>
            {entry.speaker && <strong>{entry.speaker}<i>：</i></strong>}{entry.text}
          </p>
        ))}
      </div>
      {outcome.changes.length > 0 && (
        <div className={styles.outcomeChanges} aria-label="本回变化">
          {outcome.changes.map((change, index) => (
            <span className={styles[`outcomeChange${change.tone}`]} key={`${change.label}-${change.value}-${index}`}>
              <small>{change.label}</small><strong>{change.value}</strong>
            </span>
          ))}
        </div>
      )}
      <div className={styles.outcomeContinue}>
        <span>结果已写入江湖志</span>
        <button type="button" onClick={onContinue} aria-label={continueLabel} aria-keyshortcuts="Enter Space">
          <span>{continueLabel}</span><span className={styles.startArrow} aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );
}

function StoryColumn({ game, onChoose, onContinue }: { game: NovelState; onChoose: (choiceId: string) => void; onContinue: () => void }) {
  const location = game.locations.find((item) => item.id === game.currentLocationId) || game.locations[0];
  const visibleLog = game.log.slice(-6);
  const outcome = game.pendingOutcome;
  useEffect(() => {
    if (!outcome) return;
    window.requestAnimationFrame(() => {
      document.getElementById("wuxia-turn-outcome")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  }, [outcome]);
  return (
    <main className={styles.storyColumn}>
      <div className={`${styles.sceneBanner} ${getLocationTone(location.type)}`}>
        <div>
          <span className={styles.sceneEyebrow}>{outcome ? `第${outcome.turn}回 · 落笔` : game.currentEvent?.eyebrow || "江湖终章"}</span>
          <h1>{outcome ? "这一念，已有回响" : game.currentEvent?.title || game.ending?.title}</h1>
          <p>{outcome ? `你选择了「${outcome.choiceLabel}」` : game.currentEvent?.subtitle || game.ending?.subtitle}</p>
        </div>
        <div className={styles.sceneLocation}><EnvironmentOutlined /><strong>{location.name}</strong><small>{location.descriptor}</small></div>
      </div>
      <div className={`${styles.storyScroll} ${outcome ? styles.outcomeScroll : ""}`}>
        {outcome ? <OutcomeReveal game={game} onContinue={onContinue} /> : (
          <>
            <div className={styles.storyRule}><span />{game.chapterTitle}<span /></div>
            <div className={styles.logStack}>
              {visibleLog.map((entry) => (
                <div className={`${styles.logLine} ${styles[`logTone${entry.tone || "muted"}`]}`} key={entry.id}>
                  {entry.title && <strong>{entry.title}</strong>}
                  <p>{entry.text}</p>
                </div>
              ))}
            </div>
            {game.currentEvent && (
              <div className={styles.eventCopy}>
                {game.currentEvent.lines.map((entry) => (
                  <p className={`${styles.eventLine} ${styles[`eventType${entry.type}`]}`} key={entry.id}>
                    {entry.speaker && <strong>{entry.speaker}<i>：</i></strong>}{entry.text}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {!outcome && <ChoiceDeck game={game} onChoose={onChoose} />}
    </main>
  );
}

function GameTopbar({ game, onOpen }: { game: NovelState; onOpen: (panel: Panel) => void }) {
  const [copied, setCopied] = useState(false);
  const progress = chapterProgress(game);
  const visibleTurn = game.pendingOutcome ? game.turn : Math.min(game.turn + 1, game.maxTurns);
  const handleCopy = async () => {
    const ok = await copyText(game.setup.seed);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <header className={styles.gameTopbar}>
      <BrandLockup compact />
      <div className={styles.chapterMeter}>
        <div className={styles.chapterMeta}><span>第 {visibleTurn} / {game.maxTurns} 回</span><strong>第{game.chapter}章 · {game.chapterTitle}</strong></div>
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
  if (!game.ending) return null;
  return (
    <div className={styles.endingOverlay}>
      <div className={styles.endingSeal}>终</div>
      <p className={styles.eyebrow}>THE LAST PAGE · {game.ending.rank}</p>
      <h1>{game.ending.title}</h1>
      <p className={styles.endingSubtitle}>{game.ending.subtitle}</p>
      <div className={styles.endingDivider}><span /><StarOutlined /><span /></div>
      <p className={styles.endingSummary}>{game.ending.summary}</p>
      <div className={styles.endingScore}><strong>{game.ending.score}</strong><span>卷中评分</span></div>
      <div className={styles.endingTags}>{game.ending.tags.map((tag) => <span key={tag}># {tag}</span>)}</div>
      <div className={styles.endingActions}><button type="button" className={styles.startButton} onClick={onRestart}><span>再写一卷</span><span className={styles.startArrow}>↗</span></button></div>
      <p className={styles.endingSeed}>种子 · {game.setup.seed}</p>
    </div>
  );
}

function Drawer({ panel, game, onClose, onRestart }: { panel: Panel; game: NovelState; onClose: () => void; onRestart: () => void }) {
  if (!panel) return null;
  const title = panel === "journal" ? "江湖志" : panel === "map" ? "行路图" : panel === "cast" ? "同行者" : "卷外设置";
  return (
    <div className={styles.drawerBackdrop} role="presentation">
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.drawerHeader}><div><span className={styles.eyebrow}>CURRENT VOLUME</span><h2>{title}</h2></div><button type="button" onClick={onClose} title="关闭" aria-label="关闭"><CloseOutlined /></button></div>
        {panel === "journal" && <div className={styles.drawerJournal}>{game.log.slice().reverse().map((entry) => <div className={`${styles.journalEntry} ${styles[`logTone${entry.tone || "muted"}`]}`} key={entry.id}><span>回 {entry.turn}</span><p>{entry.title || entry.text}</p>{entry.title && <small>{entry.text}</small>}</div>)}</div>}
        {panel === "map" && <div className={styles.drawerMap}><RouteMap game={game} /><p className={styles.drawerHint}>未至之处仍在雾里，下一次选择可能改变你的路线。</p></div>}
        {panel === "cast" && <div className={styles.drawerCast}><CompanionPanel game={game} /></div>}
        {panel === "settings" && <div className={styles.drawerSettings}><div className={styles.settingsSeed}><span>本卷种子</span><strong>{game.setup.seed}</strong><button type="button" onClick={() => copyText(game.setup.seed)}><ShareAltOutlined /> 分享</button></div><button type="button" className={styles.resetButton} onClick={onRestart}><ReloadOutlined /> 结束本卷，重新开局</button><p>重新开局会清除当前自动存档；若想重走同一条命数，请先复制种子。</p></div>}
      </aside>
    </div>
  );
}

function GameScreen({ game, onChoose, onContinue, onRestart }: { game: NovelState; onChoose: (choiceId: string) => void; onContinue: () => void; onRestart: () => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const openPanel = (next: Panel) => setPanel(next);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
      if (panel) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName || "")) return;
      if (game.pendingOutcome) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onContinue();
        }
        return;
      }
      if (!game.currentEvent) return;
      const keyIndex = /^[1-9]$/.test(event.key)
        ? Number(event.key) - 1
        : ["a", "b", "c"].indexOf(event.key.toLowerCase());
      const index = keyIndex;
      if (index >= 0 && index < game.currentEvent.choices.length) onChoose(game.currentEvent.choices[index].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game.currentEvent, game.pendingOutcome, onChoose, onContinue, panel]);

  return (
    <main className={styles.gameShell}>
      <GameTopbar game={game} onOpen={openPanel} />
      <div className={styles.mobileStats}><StatStrip game={game} /></div>
      <div className={styles.gameGrid}>
        <HeroRail game={game} onOpen={openPanel} />
        <StoryColumn game={game} onChoose={onChoose} onContinue={onContinue} />
        <aside className={styles.rightRail}><StatStrip game={game} /><RouteMap game={game} /><CompanionPanel game={game} /></aside>
      </div>
      <div className={styles.mobileDock}><button type="button" aria-label="打开江湖志" onClick={() => openPanel("journal")}><BookOutlined />江湖志</button><button type="button" aria-label="打开行路图" onClick={() => openPanel("map")}><CompassOutlined />行路图</button><button type="button" aria-label="打开同行者" onClick={() => openPanel("cast")}><TeamOutlined />同行者</button><button type="button" aria-label="打开设置" onClick={() => openPanel("settings")}><MenuOutlined />设置</button></div>
      <EndingView game={game} onRestart={onRestart} />
      <Drawer panel={panel} game={game} onClose={() => setPanel(null)} onRestart={onRestart} />
    </main>
  );
}

export default function WuxiaGame() {
  const { game, isStarted, hasSavedGame, startGame, continueGame, chooseAction, continueAction, abandonGame } = useWuxiaGame();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    window.render_game_to_text = () => {
      if (!game) return JSON.stringify({ screen: "setup", saved: hasSavedGame });
      return JSON.stringify({
        screen: game.pendingOutcome ? "outcome" : game.ending ? "ending" : "story",
        turn: game.turn,
        maxTurns: game.maxTurns,
        chapter: `${game.chapter} · ${game.chapterTitle}`,
        hero: game.hero,
        location: game.currentLocationId,
        eventLocation: game.pendingOutcome ? game.currentLocationId : game.currentEvent?.locationId || game.currentLocationId,
        event: game.currentEvent?.title || null,
        choices: game.pendingOutcome ? [] : game.currentEvent?.choices.map((choice) => ({ id: choice.id, label: choice.label, risk: choice.risk, odds: choice.check?.odds })) || [],
        outcome: game.pendingOutcome || null,
        companions: game.companions.map((companion) => ({ name: companion.name, affinity: companion.affinity })),
        history: game.history,
        ending: game.ending || null,
      });
    };
    return () => { delete window.render_game_to_text; };
  }, [game, hasSavedGame]);

  const handleRestart = useCallback(() => {
    abandonGame();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 1800);
  }, [abandonGame]);

  const content = (() => {
    if (!isStarted || !game) return <StartScreen hasSavedGame={hasSavedGame} onStart={startGame} onContinue={continueGame} />;
    return <GameScreen game={game} onChoose={chooseAction} onContinue={continueAction} onRestart={handleRestart} />;
  })();

  return <div className={styles.wuxiaRoot}>{content}{showToast && <div className={styles.toast}>旧卷已收起 · 可重新落笔</div>}</div>;
}
