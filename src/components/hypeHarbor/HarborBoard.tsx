"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import Image from "next/image";
import {
  type Boat,
  type GameState,
  type StreamerId,
  PLAYER_COLORS,
  PROJECTS,
  EVENTS,
  TARGET,
  CLIP_SPOT,
  START_MIN,
  START_MAX,
  START_TOTAL,
  streamerById,
  successChance,
  seatPayout,
  projectTerms,
  setStartingPosition,
} from "./engine";
import styles from "./harbor.module.css";

const track = (width: number) => ({
  start: width < 540 ? 78 : 100,
  finish: width - (width < 540 ? 78 : 115),
});

/** Canvas carries water and the route; readable contracts and interactive pieces live in DOM. */
function drawWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  boats: Boat[],
  selected: number,
  time: number,
  reduced: boolean,
) {
  const { start, finish } = track(width);
  const laneHeight = height / 3;
  ctx.clearRect(0, 0, width, height);
  boats.forEach((boat, index) => {
    const top = index * laneHeight;
    ctx.fillStyle =
      index === selected ? "#c1dcd2" : index === 1 ? "#d1e5e0" : "#d2e3d8";
    ctx.fillRect(0, top, width, laneHeight);
    ctx.fillStyle = `${PROJECTS[index].color}12`;
    ctx.fillRect(0, top, width, laneHeight);
    ctx.fillStyle = "#e9d9b7";
    ctx.fillRect(finish + 28, top, width - finish, laneHeight);
    ctx.strokeStyle = "#d3c19d";
    for (let y = top + 18; y < top + laneHeight; y += 24) {
      ctx.beginPath();
      ctx.moveTo(finish + 28, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f6fff399";
    ctx.lineWidth = 2;
    for (let n = 0; n < 10; n++) {
      const x = 15 + ((n * 89 + index * 41) % Math.max(50, finish - 20));
      const y = top + 95 + ((n * 29) % 95);
      const drift = reduced ? 0 : Math.sin(time / 2400 + n) * 3;
      ctx.beginPath();
      ctx.moveTo(x + drift, y);
      ctx.quadraticCurveTo(x + 9 + drift, y + 3, x + 20 + drift, y);
      ctx.stroke();
    }
    const y = top + laneHeight - 23;
    ctx.strokeStyle = "#7ba395";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(finish, y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let tick = 0; tick <= TARGET; tick++) {
      if (width < 540 && tick % 3 && tick !== CLIP_SPOT) continue;
      if (width < 540 && tick === 12) continue;
      const x = start + ((finish - start) * tick) / TARGET;
      ctx.fillStyle = tick <= boat.position ? "#5c8a7b" : "#fff9ea";
      ctx.beginPath();
      ctx.arc(x, y, tick === TARGET ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
      if (tick % 3 === 0 || tick === CLIP_SPOT) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#537367";
        ctx.font = "10px sans-serif";
        ctx.fillText(String(tick), x, y + 15);
      }
    }
    const clipX = start + ((finish - start) * CLIP_SPOT) / TARGET;
    ctx.strokeStyle = "#b38c5d";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(clipX, top + 71);
    ctx.lineTo(clipX, y - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#977345";
    ctx.font = "14px sans-serif";
    ctx.fillText("✂", clipX, top + 66);
    for (let square = 0; square < 9; square++) {
      ctx.fillStyle = square % 2 ? "#faf4df" : "#749080";
      ctx.fillRect(finish + 24, top + 76 + square * 11, 7, 11);
    }
    ctx.strokeStyle = "#59796630";
    ctx.beginPath();
    ctx.moveTo(0, top + laneHeight);
    ctx.lineTo(width, top + laneHeight);
    ctx.stroke();
  });
}

type Gesture = {
  id: number;
  target: HTMLButtonElement;
  kind: "character" | "position";
  index: number;
  streamer: StreamerId;
  x: number;
  y: number;
  initial: number;
  value: number;
  moved: boolean;
};

export default function HarborBoard({
  state,
  selected,
  onSelect,
  previewRoster,
  canArrange = false,
  onArrange,
  onPosition,
}: {
  state: GameState | null;
  selected: number;
  onSelect: (index: number) => void;
  previewRoster: StreamerId[];
  canArrange?: boolean;
  onArrange?: (index: number, streamer: StreamerId) => void;
  onPosition?: (index: number, position: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [picked, setPicked] = useState<StreamerId | null>(null);
  const [drag, setDrag] = useState<{
    streamer: StreamerId;
    x: number;
    y: number;
    target: number | null;
  } | null>(null);
  const [draftPosition, setDraftPosition] = useState<{
    index: number;
    value: number;
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const previewBoats: Boat[] = previewRoster
    .slice(0, 3)
    .map((streamer) => ({
      streamer,
      position: 4,
      warmup: 1,
      seats: [],
      die: null,
      movement: 0,
    }));
  const displayState =
    state && draftPosition
      ? setStartingPosition(state, draftPosition.index, draftPosition.value)
      : state;
  const boats = displayState?.boats || previewBoats;
  const settled = state?.phase === "settlement" || state?.phase === "finished";
  const resting = (state?.roster || previewRoster).find(
    (id) => !boats.some((boat) => boat.streamer === id),
  );
  const data = useRef({ boats, selected });
  data.current = { boats, selected };
  // Polling returns fresh objects even when the arrangement has not changed.
  const arrangementKey = state?.boats.map(boat => `${boat.streamer}:${boat.position}`).join('|');

  const releaseGesture = useCallback(() => {
    const { current } = gesture;
    gesture.current = null;
    if (current?.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  }, []);
  const cancel = useCallback(() => {
    if (gesture.current) setFeedback('已取消拖动，以当前排布为准。');
    releaseGesture();
    setPicked(null);
    setDrag(null);
    setDraftPosition(null);
    suppressClick.current = true;
  }, [releaseGesture]);

  useEffect(() => {
    cancel();
  }, [state?.round, state?.phase, state?.turn, arrangementKey, canArrange, cancel]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      releaseGesture();
    };
  }, [cancel, releaseGesture]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    let width = 900;
    let height = 720;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      boardRef.current?.setAttribute("data-compact", String(width < 540));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const render = (time: number) => {
      drawWater(
        ctx,
        width,
        height,
        data.current.boats,
        data.current.selected,
        time,
        reduced.matches,
      );
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const arrange = (target: number, streamer: StreamerId) => {
    if (!canArrange || !state) return;
    if (target < 3) onArrange?.(target, streamer);
    else {
      const from = state.boats.findIndex((boat) => boat.streamer === streamer);
      if (from >= 0 && resting) onArrange?.(from, resting);
    }
    setPicked(null);
    setFeedback(
      target < 3
        ? `${streamerById(streamer).name}接下${PROJECTS[target].name}，活动的酬金与预热不变。`
        : `${streamerById(streamer).name}本场去板凳区，暂不接活动。`,
    );
  };
  const select = (index: number, streamer: StreamerId) => {
    if (gesture.current || suppressClick.current) return;
    if (!canArrange) {
      if (index < 3) onSelect(index);
      return;
    }
    if (picked) arrange(index, picked);
    else setPicked(streamer);
  };
  const targetAt = (event: PointerEvent<HTMLButtonElement>) => {
    const node = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-roster-target]");
    return node ? Number(node.getAttribute("data-roster-target")) : null;
  };
  const commitPosition = (index: number, value: number) => {
    if (!canArrange || !state) return;
    const changed = setStartingPosition(state, index, value);
    if (changed === state) return;
    onPosition?.(index, value);
    setFeedback(
      `预热 ${changed.boats.map((b) => b.position).join(" / ")} · 其他活动自动平衡，总计 ${START_TOTAL} 格。`,
    );
  };
  const handlers = (
    kind: Gesture["kind"],
    index: number,
    streamer: StreamerId,
  ) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (gesture.current) { event.preventDefault(); return; }
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick.current = false;
      if (!canArrange || !state) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      const initial = state.boats[index]?.position || 4;
      gesture.current = {
        id: event.pointerId,
        target: event.currentTarget,
        kind,
        index,
        streamer,
        x: event.clientX,
        y: event.clientY,
        initial,
        value: initial,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const { current } = gesture;
      if (!current || current.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6) current.moved = true;
      if (!current.moved) return;
      event.preventDefault();
      if (kind === "character") setDrag({
          streamer,
          x: event.clientX,
          y: event.clientY,
          target: targetAt(event),
        });
      else {
        const { start, finish } = track(boardRef.current!.clientWidth);
        current.value = Math.max(
          START_MIN,
          Math.min(
            START_MAX,
            Math.round(
              current.initial +
                ((event.clientX - current.x) * TARGET) / (finish - start),
            ),
          ),
        );
        setDraftPosition({ index, value: current.value });
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const { current } = gesture;
      if (!current || current.id !== event.pointerId) return;
      releaseGesture();
      setDrag(null);
      setDraftPosition(null);
      if (kind === "position") {
        if (current.moved) commitPosition(index, current.value);
        else if (picked) arrange(index, picked);
        else onSelect(index);
      } else if (current.moved) {
        const target = targetAt(event);
        if (target !== null) arrange(target, streamer);
        else setPicked(null);
      } else select(index, streamer);
      suppressClick.current = true;
    },
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => {
      if (gesture.current?.id === event.pointerId) cancel();
    },
    onBlur: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (gesture.current?.target === event.currentTarget) cancel();
    },
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
      if (gesture.current?.id === event.pointerId) cancel();
    },
  });

  return (
    <div
      className={styles.harborTable}
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          cancel();
          setFeedback("已取消拖动");
        }
        if (event.key === "Enter" || event.key === " ") suppressClick.current = false;
      }}
    >
      {state?.phase === "preparing" && (
        <div className={styles.arrangeGuide}>
          <span>
            <i className={styles.swapCue}>↕</i>
            <b>抓角色</b> 换活动
          </span>
          <span>
            <i className={styles.slideCue}>↔</i>
            <b>抓船身</b> 调预热
          </span>
          <strong>
            {boats.map((boat) => boat.position).join(" / ")}{" "}
            <small>总计 12</small>
          </strong>
        </div>
      )}
      {state?.phase === "preparing" && (
        <div className={styles.arrangeStatus} role="status">
          {!canArrange
            ? "等主理人排活动"
            : picked
              ? `已选${streamerById(picked).name}：点活动船或板凳区交换 · Esc 取消`
              : draftPosition
                ? "松手确认 · 其他船已自动让出或接收预热"
                : feedback ||
                  "左右拖船，另外两艘自动平衡；不想拖，也能用右侧 − / +。"}
        </div>
      )}
      <div
        ref={boardRef}
        className={styles.activityBoard}
        data-testid="activity-board"
      >
        <canvas
          ref={canvasRef}
          data-game-canvas="hype-harbor"
          aria-label="三场主播活动：歌回、见面会、周年场，向右推进到 15 达标"
        />
        {boats.map((boat, index) => {
          const project = projectTerms(state, index);
          const streamer = streamerById(boat.streamer);
          const moved = state && boat.position !== state.boats[index].position;
          const chance = displayState
            ? Math.round(successChance(displayState, index) * 100)
            : null;
          const wind = displayState ? EVENTS[displayState.event].wind[index] : 0;
          return (
            <div
              key={project.name}
              className={styles.activityLane}
              data-roster-target={canArrange ? index : undefined}
              data-drop={drag?.target === index}
              data-selected={selected === index}
              style={
                {
                  top: `${(index * 100) / 3}%`,
                  "--lane-color": project.color,
                } as CSSProperties
              }
            >
              <button
                className={styles.activityHeading}
                data-wind={wind !== 0}
                data-testid={`boat-${index}`}
                onClick={(event) => {
                  if (canArrange && event.detail !== 0) return;
                  if (event.detail === 0) suppressClick.current = false;
                  select(index, boat.streamer);
                }}
                {...handlers("character", index, boat.streamer)}
                aria-pressed={selected === index}
                aria-label={`选择${project.name}，主播${streamer.name}，${project.seatCosts.length}个协办席${state && wind !== 0 ? `，本场每骰${wind > 0 ? "+" : ""}${wind}格` : ""}`}
              >
                <span>{project.icon}</span>
                <b>{project.name}</b>
                <small>{project.seatCosts.length} 席</small>
                {state && wind !== 0 && (
                  <strong className={styles.laneWind} data-positive={wind > 0}>
                    {wind > 0 ? "顺风" : "逆风"} · 每骰 {wind > 0 ? "+" : ""}{wind} 格
                  </strong>
                )}
                <em>{project.brief}</em>
              </button>
              <span className={styles.activityProgress}>
                <b>
                  {boat.position}
                  <small> / 15</small>
                </b>
                <small>
                  {boat.position >= TARGET
                    ? "活动达标 ✓"
                    : state?.phase === "preparing"
                      ? "预热起点"
                      : chance === null
                        ? "活动进度"
                        : `达标 ${chance}%`}
                </small>
                {state?.phase === "reveal" && boat.die !== null && (
                  <i data-testid={`die-${index}`}>
                    {["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][boat.die]}
                  </i>
                )}
              </span>
              <div
                className={styles.activityShip}
                data-preview={Boolean(draftPosition)}
                data-balanced={Boolean(moved)}
                style={{
                  left: `calc(var(--track-start) + (100% - var(--track-start) - var(--track-end)) * ${boat.position / TARGET})`,
                }}
              >
                <button
                  className={styles.characterGrip}
                  data-testid={`character-${index}`}
                  data-draggable={canArrange}
                  data-picked={picked === boat.streamer}
                  aria-label={`${streamer.name}，${canArrange ? "拖动换活动，也可点击后选目标" : project.name}`}
                  {...handlers("character", index, boat.streamer)}
                  onClick={(event) => {
                    if (canArrange && event.detail !== 0) return;
                    if (event.detail === 0) suppressClick.current = false;
                    select(index, boat.streamer);
                  }}
                >
                  <Image
                    key={boat.streamer}
                    src={streamer.portrait}
                    width={58}
                    height={58}
                    alt=""
                    draggable={false}
                  />
                  <span>
                    <b>{streamer.name}</b>
                    <small>{canArrange ? "⠿ 拖我换活动" : "本场主播"}</small>
                  </span>
                </button>
                <button
                  className={styles.contractHull}
                  data-testid={`warmup-${index}`}
                  data-draggable={canArrange}
                  role={canArrange ? "slider" : undefined}
                  aria-label={
                    canArrange
                      ? `${project.name}预热位置`
                      : `${project.name}协办酬金${project.prizePool}币，筹备费${project.seatCosts.join("、")}`
                  }
                  aria-valuemin={canArrange ? START_MIN : undefined}
                  aria-valuemax={canArrange ? START_MAX : undefined}
                  aria-valuenow={canArrange ? boat.position : undefined}
                  aria-valuetext={
                    canArrange
                      ? `起点${boat.position}格，总预热12格，其他船自动平衡`
                      : undefined
                  }
                  aria-orientation={canArrange ? "horizontal" : undefined}
                  {...handlers("position", index, boat.streamer)}
                  onClick={(event) => {
                    if (canArrange && event.detail !== 0) return;
                    if (event.detail === 0) suppressClick.current = false;
                    if (suppressClick.current) return;
                    if (canArrange && picked) arrange(index, picked);
                    else onSelect(index);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !canArrange ||
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) return;
                    event.preventDefault();
                    const value =
                      event.key === "Home"
                        ? START_MIN
                        : event.key === "End"
                          ? START_MAX
                          : boat.position +
                            (event.key === "ArrowRight" ? 1 : -1);
                    commitPosition(index, value);
                  }}
                >
                  <span className={styles.contractValue}>
                    {state?.legacyEconomy ? "旧约每席" : "协办酬金"}
                    <strong>
                      {state?.legacyEconomy ? 12 : project.prizePool}
                    </strong>
                    <small>币</small>
                  </span>
                  <span className={styles.deckCaption}>协办席 · 筹备费</span>
                  <span
                    className={styles.deckTickets}
                    style={{
                      gridTemplateColumns: `repeat(${project.seatCosts.length}, 1fr)`,
                    }}
                  >
                    {project.seatCosts.map((cost, slot) => {
                      const seat = boat.seats[slot];
                      return (
                        <span
                          key={slot}
                          data-occupied={Boolean(seat)}
                          title={
                            seat && state
                              ? `${state.players[seat.player].name}${seat.insured ? " · 已保" : ""}`
                              : `第${slot + 1}席，筹备费${cost}币`
                          }
                        >
                          <b
                            style={
                              seat
                                ? {
                                    background: PLAYER_COLORS[seat.player],
                                    color: "#fff",
                                  }
                                : {}
                            }
                          >
                            {seat ? `P${seat.player + 1}` : cost}
                          </b>
                          <small>
                            {seat
                              ? seat.source === "clip"
                                ? "切片"
                                : `${seat.cost}币${seat.insured ? "•保" : ""}`
                              : "币"}
                          </small>
                        </span>
                      );
                    })}
                  </span>
                  <span className={styles.hullHandle}>
                    {canArrange ? (
                      <>
                        <i>↔</i> 拖船调预热 {boat.position}
                      </>
                    ) : settled ? (
                      boat.position < TARGET ? (
                        "未达标 · 协办酬金 0"
                      ) : boat.seats.length && state ? (
                        `已结算 ${seatPayout(state, index)} 币 / 席`
                      ) : (
                        "活动达标 · 无协办席"
                      )
                    ) : boat.seats.length && state ? (
                      `达标暂分 ${seatPayout(state, index)} 币 / 席`
                    ) : (
                      "达标后按协办席平分"
                    )}
                  </span>
                </button>
                {moved && (
                  <span className={styles.balanceBubble}>
                    {boat.position > state!.boats[index].position ? "+" : ""}
                    {boat.position - state!.boats[index].position} 预热
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {resting && (
        <button
          className={styles.benchDock}
          disabled={!canArrange}
          data-testid="resting-dock"
          data-roster-target={canArrange ? 3 : undefined}
          data-drop={drag?.target === 3}
          data-picked={picked === resting}
          aria-pressed={picked === resting}
          {...handlers("character", 3, resting)}
          onClick={(event) => {
            if (canArrange && event.detail !== 0) return;
            if (event.detail === 0) suppressClick.current = false;
            select(3, resting);
          }}
        >
          <span className={styles.benchPortrait}>
            <Image
              src={streamerById(resting).portrait}
              width={55}
              height={55}
              alt=""
              draggable={false}
            />
            <i>z Z</i>
          </span>
          <span>
            <b>☕ 板凳区 · {streamerById(resting).name}摆了</b>
            <small>本场没活动 · 不推进、不分酬金 · 份额价格不变</small>
          </span>
          {canArrange && (
            <strong>
              ↕<small>拖上船</small>
            </strong>
          )}
        </button>
      )}
      {drag && (
        <div
          className={styles.dragCharacter}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          <Image
            src={streamerById(drag.streamer).portrait}
            alt=""
            width={46}
            height={46}
            draggable={false}
          />
          {streamerById(drag.streamer).name}
          <small>
            {drag.target === null ? "移到活动船或板凳区" : "松手换位"}
          </small>
        </div>
      )}
    </div>
  );
}
