import {
  ENTITIES,
  INTERIORS,
  REGIONS,
  TILE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  tileAt,
} from "./content";
import { objective, questEntries, storyBonuses } from "./engine";
import type { Point, RpgState } from "./types";
import styles from "./rpg.module.css";

const colors = {
  grass: "#6c8863",
  forest: "#526e54",
  path: "#c8b38a",
  town: "#c3b594",
  water: "#548d98",
  bridge: "#bca075",
  mountain: "#727972",
  ruins: "#99978a",
};
const tiles = Array.from({ length: 56 * 38 }, (_, i) => ({
  x: i % 56,
  y: Math.floor(i / 56),
}));

export function RpgMap({
  state,
  onWalk,
  onVisit,
}: {
  state: RpgState;
  onWalk: (point: Point) => void;
  onVisit: (id: string) => void;
}) {
  const room = INTERIORS[state.area];
  const worldPoint =
    state.area === "world" ? state.player : state.worldReturn || state.player;
  const worldEntities = ENTITIES.filter((e) => !e.area || e.area === "world");
  return (
    <>
      <p className={styles.panelNote}>
        {room
          ? `你正在${room.name}内。黄点标记返回山河的位置；从出口离开后可以前往其他地方。`
          : "黄点是你所在的位置。两座桥连接东西两岸；已发现的驿站之间可以交谈往返。"}
      </p>
      <svg
        className={styles.worldMap}
        viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        role="img"
        aria-label="虚境世界地图"
      >
        <title>虚境世界地图</title>
        {tiles.map((p) => (
          <rect
            key={`${p.x},${p.y}`}
            x={p.x * TILE}
            y={p.y * TILE}
            width={TILE + 1}
            height={TILE + 1}
            fill={colors[tileAt(p.x, p.y)]}
          />
        ))}
        {REGIONS.map((r) => (
          <text
            key={r.id}
            x={r.x}
            y={r.y - 80}
            className={styles.regionLabel}
            textAnchor="middle"
            fill="#faf1cf"
            stroke="#304538"
            strokeWidth="7"
            paintOrder="stroke"
          >
            {r.name}
          </text>
        ))}
        {worldEntities
          .filter(
            (e) => ["camp", "portal", "npc", "door"].includes(e.kind) || e.shard,
          )
          .map((e) => (
            <g key={e.id}>
              {e.kind === "door" ? (
                <rect
                  x={e.x - 20}
                  y={e.y - 20}
                  width="40"
                  height="40"
                  fill={
                    state.visited.includes(e.destination || "")
                      ? "#f7d17b"
                      : "#d6c6a2"
                  }
                  stroke="#465840"
                  strokeWidth="6"
                />
              ) : (
                <circle
                  cx={e.x}
                  cy={e.y}
                  r={e.shard ? 19 : 13}
                  fill={
                    state.completed.includes(e.id)
                      ? "#8ce0ae"
                      : e.kind === "camp"
                        ? "#fff0c3"
                        : e.kind === "npc"
                          ? "#b9dae1"
                          : "#ca715c"
                  }
                />
              )}
              <title>{e.name}</title>
            </g>
          ))}
        <circle
          cx={worldPoint.x}
          cy={worldPoint.y}
          r="25"
          fill="#ffdb68"
          stroke="#423b25"
          strokeWidth="9"
        />
      </svg>
      <div className={styles.mapLegend}>
        <span>● 驿站</span>
        <span>● 伙伴</span>
        <span>◆ 碎片首领</span>
        <span>■ 可进入地点</span>
      </div>
      <div className={styles.destinations}>
        {REGIONS.map((r) => (
          <button
            key={r.id}
            disabled={state.mode !== "explore" || state.area !== "world"}
            onClick={() => onWalk(r)}
          >
            前往{r.name} ↗
          </button>
        ))}
      </div>
      <h3>山河里的灯火</h3>
      <div className={styles.placeList}>
        {worldEntities
          .filter((e) => e.kind === "door")
          .map((e) => (
            <button
              key={e.id}
              data-location={e.destination}
              disabled={
                state.mode !== "explore" || state.area === e.destination
              }
              onClick={() => onVisit(e.id)}
            >
              <span>
                <strong>
                  {INTERIORS[e.destination || ""]?.name || e.name}
                </strong>
                <small>
                  {INTERIORS[e.destination || ""]?.subtitle || e.description}
                </small>
              </span>
              <b>
                {state.area === e.destination
                  ? "正在此处"
                  : state.visited.includes(e.destination || "")
                    ? "再访 ↗"
                    : "探访 ↗"}
              </b>
            </button>
          ))}
      </div>
    </>
  );
}

export function StoryGifts({ state }: { state: RpgState }) {
  const bonuses = storyBonuses(state);
  const entries = [
    bonuses.hp > 0 ? `气血 +${bonuses.hp}` : "",
    bonuses.attack > 0 ? `攻击 +${bonuses.attack}` : "",
    bonuses.defense > 0 ? `防御 +${bonuses.defense}` : "",
    bonuses.healing > 0 ? `治疗 +${Math.round(bonuses.healing * 100)}%` : "",
  ].filter(Boolean);
  return entries.length ? (
    <div className={styles.storyGifts}>
      <span>同行留下的馈赠</span>
      <p>{entries.join("　·　")}</p>
      <small>由故事中的决定获得，已计入队伍战力。</small>
    </div>
  ) : null;
}

export function RpgJournal({
  state,
  onTrack,
  onVisit,
}: {
  state: RpgState;
  onTrack: (id: string | null) => void;
  onVisit: (id: string) => void;
}) {
  const quests = questEntries(state);
  return (
    <>
      <p className={styles.story}>
        原本只是一个普通的管人粉丝，再次睁眼，却成了虚境里一块会走路的饼干。远方传来了熟悉的声音。找到她们，也许就能找到回家的路。
      </p>
      <div className={styles.journalQuest}>
        <span>当前追踪</span>
        <h3>{objective(state)}</h3>
        {state.story.tracked && (
          <button onClick={() => onTrack(null)}>回到归乡主线</button>
        )}
      </div>
      <h3>路上的约定</h3>
      <div className={styles.storyQuests}>
        {quests.map((quest) => (
          <article key={quest.id} data-quest={quest.id}>
            <div className={styles.questHeader}>
              <span>{quest.companion}</span>
              <small>
                {quest.status === "complete"
                  ? "已写入回忆"
                  : quest.status === "active"
                    ? "约定尚未完成"
                    : quest.status === "available"
                      ? "可以启程"
                      : "传闻"}
              </small>
            </div>
            <h4>{quest.title}</h4>
            <p>{quest.text}</p>
            <span className={styles.questWhere}>{quest.location}</span>
            {quest.status !== "complete" && (
              <div className={styles.questActions}>
                <button onClick={() => onTrack(quest.id)}>
                  {state.story.tracked === quest.id ? "正在追踪" : "追踪约定"}
                </button>
                {quest.targetId && (
                  <button
                    disabled={state.mode !== "explore"}
                    onClick={() => onVisit(quest.targetId!)}
                  >
                    走向线索 ↗
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <StoryGifts state={state} />
      <h3>散落山河的三枚碎片</h3>
      <div className={styles.questList}>
        {ENTITIES.filter((e) => e.shard).map((e) => (
          <div key={e.id}>
            <b>{state.completed.includes(e.id) ? "✓" : "◇"}</b>
            <span>
              <strong>{e.name}</strong>
              <p>{e.description}</p>
            </span>
          </div>
        ))}
      </div>
      <h3>已经走过的路</h3>
      {state.story.journal.length ? (
        <ol className={styles.travelLog}>
          {[...state.story.journal].reverse().map((entry, index) => (
            <li key={`${index}-${entry}`}>{entry}</li>
          ))}
        </ol>
      ) : (
        <p className={styles.panelNote}>
          遇见一个人、完成一件事，这里就会留下新的记忆。
        </p>
      )}
      <h3>听说这里还有人等你</h3>
      {ENTITIES.filter(
        (e) => e.kind === "npc" &&
          e.characterId &&
          !e.storyId &&
          !state.party.some((m) => m.id === e.characterId),
      ).map((e) => (
        <p key={e.id} className={styles.lead}>
          {e.name} · {e.description}
        </p>
      ))}
      <p className={styles.panelNote}>
        伙伴的约定可以慢慢完成。强敌不会主动袭击；交谈、补给与调整队伍后，再决定是否应战。
      </p>
    </>
  );
}
