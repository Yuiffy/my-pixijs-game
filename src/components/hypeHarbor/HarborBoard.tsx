"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  Boat,
  GameState,
  PLAYER_COLORS,
  PROJECTS,
  STREAMERS,
  TARGET,
  CLIP_SPOT,
  streamerById,
  successChance,
} from "./engine";
import styles from "./harbor.module.css";

const PREVIEW: Boat[] = ["sui", "nagisa", "shiori"].map((id, i) => ({
  streamer: id as Boat["streamer"],
  position: 4 + i * 2,
  warmup: 0,
  seats: [],
  die: null,
  movement: 0,
}));

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawBoat(
  ctx: CanvasRenderingContext2D,
  boat: Boat,
  x: number,
  y: number,
  size: number,
  lane: number,
  selected: boolean,
  portrait?: HTMLImageElement,
) {
  const project = PROJECTS[lane];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  // A paper standee, timber deck, wake, and colored player pegs form one physical piece.
  ctx.fillStyle = "rgba(43,103,105,.12)";
  ctx.beginPath();
  ctx.ellipse(1, 35, 77, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  if (selected) {
    ctx.strokeStyle = "#e3694e";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.ellipse(0, 31, 84, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = "#f2fbf6";
  ctx.lineWidth = 2;
  [-62, -82, -98].forEach((wx, i) => {
    ctx.beginPath();
    ctx.moveTo(wx, 24 + i * 3);
    ctx.lineTo(wx - 17, 24 + i * 3);
    ctx.stroke();
  });
  ctx.fillStyle = "#f8f0d7";
  ctx.strokeStyle = "#426466";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-66, 2);
  ctx.lineTo(76, 2);
  ctx.lineTo(52, 33);
  ctx.quadraticCurveTo(-12, 41, -54, 28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = project.color;
  ctx.beginPath();
  ctx.moveTo(-63, 11);
  ctx.lineTo(68, 11);
  ctx.lineTo(60, 22);
  ctx.lineTo(-59, 20);
  ctx.fill();
  roundRect(ctx, -45, -10, 83, 14, 4, "#e3c694", "#64807a");
  // Flag mast.
  ctx.strokeStyle = "#4e6864";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(42, 1);
  ctx.lineTo(42, -67);
  ctx.stroke();
  ctx.fillStyle = project.color;
  ctx.beginPath();
  ctx.moveTo(42, -68);
  ctx.lineTo(74, -62);
  ctx.lineTo(42, -49);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff9ec";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(project.icon, 48, -57);
  // Original repository character artwork, with a pale backing like a board-game standee.
  ctx.fillStyle = "#fff8e9";
  ctx.beginPath();
  ctx.ellipse(-5, -40, 33, 42, -0.05, 0, Math.PI * 2);
  ctx.fill();
  if (portrait?.complete && portrait.naturalWidth) {
    ctx.save();
    if (portrait.src.endsWith(".jpg")) {
      ctx.beginPath();
      ctx.roundRect(-39, -80, 70, 70, 24);
      ctx.clip();
    }
    ctx.drawImage(portrait, -46, -90, 82, 82);
    ctx.restore();
  } else {
    ctx.fillStyle = "#46615d";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(streamerById(boat.streamer).name[0], -16, -30);
  }
  for (let i = 0; i < 3; i++) {
    const seat = boat.seats[i];
    const sx = -32 + i * 27;
    ctx.beginPath();
    ctx.arc(sx, 9, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = seat ? PLAYER_COLORS[seat.player] : "#faefd7";
    ctx.fill();
    ctx.strokeStyle = seat ? "#fff7e6" : "#b49d77";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = seat ? "#fff" : "#af9c79";
    ctx.textAlign = "center";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(seat ? String(seat.player + 1) : "·", sx, 12.5);
    if (seat?.insured) {
      ctx.fillStyle = "#f8d76c";
      ctx.beginPath();
      ctx.arc(sx + 5, 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = "left";
  if (boat.position >= TARGET) {
    ctx.fillStyle = "#347d65";
    ctx.beginPath();
    ctx.arc(60, -34, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px sans-serif";
    ctx.fillText("✓", 53, -28);
  }
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  boats: Boat[],
  positions: number[],
  selected: number,
  portraits: Map<string, HTMLImageElement>,
  elapsed: number,
  reduced: boolean,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#d8e8df";
  ctx.fillRect(0, 0, width, height);
  const mobile = width < 540;
  const laneHeight = height / 3;
  const start = mobile ? 47 : 83;
  const finish = width - (mobile ? 66 : 105);
  // Wooden finish pier, deliberately independent of boat color.
  ctx.fillStyle = "#e7d3ab";
  ctx.fillRect(finish + 17, 0, width - finish, height);
  for (let y = 0; y < height; y += 24) {
    ctx.strokeStyle = "#c9b990";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(finish + 18, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = "#b4a780";
    ctx.beginPath();
    ctx.arc(width - 12, y + 10, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  boats.forEach((boat, i) => {
    const top = i * laneHeight;
    ctx.fillStyle =
      i === selected ? "#c5e0d7" : i === 1 ? "#d4e7e2" : "#d3e4d9";
    ctx.fillRect(0, top, finish + 16, laneHeight);
    ctx.fillStyle = `${PROJECTS[i].color}12`;
    ctx.fillRect(0, top, finish + 16, laneHeight);
    // Calm water ripples; fixed placement, only a small visual drift.
    ctx.strokeStyle = "rgba(255,255,244,.55)";
    ctx.lineWidth = 2;
    for (let n = 0; n < 11; n++) {
      const drift = reduced ? 0 : Math.sin(elapsed / 2300 + n) * 3;
      const rx = 28 + ((n * 97 + i * 41) % Math.max(50, finish - 60));
      const ry = top + 66 + ((n * 31) % 78);
      ctx.beginPath();
      ctx.moveTo(rx + drift, ry);
      ctx.quadraticCurveTo(rx + 8 + drift, ry + 3, rx + 18 + drift, ry);
      ctx.stroke();
    }
    const trackY = top + laneHeight - 24;
    ctx.strokeStyle = "#89afa3";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(start, trackY);
    ctx.lineTo(finish, trackY);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let tick = 0; tick <= TARGET; tick++) {
      const tx = start + ((finish - start) * tick) / TARGET;
      if (mobile && ((tick % 3 !== 0 && tick !== CLIP_SPOT) || tick === 12)) continue;
      ctx.beginPath();
      ctx.arc(tx, trackY, tick === TARGET ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = tick <= boat.position ? "#678e80" : "#fbf8e9";
      ctx.fill();
      if (tick % 3 === 0 || tick === CLIP_SPOT) {
        ctx.fillStyle = tick === CLIP_SPOT ? "#936845" : "#627d72";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(tick), tx, trackY + 16);
      }
    }
    const clipX = start + ((finish - start) * CLIP_SPOT) / TARGET;
    ctx.strokeStyle = "#b58455";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(clipX, top + 60);
    ctx.lineTo(clipX, trackY - 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#a17049";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✂", clipX, top + 55);
    ctx.textAlign = "left";
    // The checkered ribbon reads as a finish without requiring a rulebook.
    for (let square = 0; square < 8; square++) {
      ctx.fillStyle = square % 2 === 0 ? "#708477" : "#f7f1d8";
      ctx.fillRect(finish + 11, top + 54 + square * 9, 8, 9);
      ctx.fillStyle = square % 2 === 1 ? "#708477" : "#f7f1d8";
      ctx.fillRect(finish + 19, top + 54 + square * 9, 8, 9);
    }
    const x = start + ((finish - start) * positions[i]) / TARGET;
    const bob = reduced ? 0 : Math.sin(elapsed / 1100 + i * 2) * 1.7;
    drawBoat(
      ctx,
      boat,
      x,
      top + laneHeight - 58 + bob,
      mobile ? 0.64 : 0.85,
      i,
      selected === i,
      portraits.get(boat.streamer),
    );
    if (i < 2) {
      ctx.strokeStyle = "rgba(71,108,95,.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top + laneHeight);
      ctx.lineTo(width, top + laneHeight);
      ctx.stroke();
    }
  });
}

export default function HarborBoard({
  state,
  selected,
  onSelect,
  previewRoster,
}: {
  state: GameState | null;
  selected: number;
  onSelect: (index: number) => void;
  previewRoster: Boat["streamer"][];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoats = PREVIEW.map((b, i) => ({
    ...b,
    streamer: previewRoster[i],
  }));
  const dataRef = useRef({ state, selected, previewBoats });
  dataRef.current = { state, selected, previewBoats };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const portraits = new Map<string, HTMLImageElement>();
    STREAMERS.forEach((s) => {
      const img = new Image();
      img.src = s.portrait;
      portraits.set(s.id, img);
    });
    let width = 800;
    let height = 480;
    let frame = 0;
    let previous = 0;
    let positions = (
      dataRef.current.state?.boats || dataRef.current.previewBoats
    ).map((b) => b.position);
    let previousRound = dataRef.current.state?.round;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const render = (now: number) => {
      const dt = Math.min(100, now - previous || 16);
      previous = now;
      const { current } = dataRef;
      const boats = current.state?.boats || current.previewBoats;
      if (current.state?.round !== previousRound) {
        positions = boats.map((b) => b.position);
        previousRound = current.state?.round;
      }
      positions = positions.map((p, i) => (reduced
          ? boats[i].position
          : p + (boats[i].position - p) * (1 - Math.exp(-dt / 190))),);
      drawScene(
        ctx,
        width,
        height,
        boats,
        positions,
        current.selected,
        portraits,
        now,
        reduced,
      );
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const boats = state?.boats || previewBoats;
  return (
    <div className={styles.board}>
      <canvas
        ref={canvasRef}
        data-game-canvas="hype-harbor"
        aria-label="三艘主播企划船，向右航行，到 15 格达标"
      />
      {boats.map((boat, index) => {
        const streamer = streamerById(boat.streamer);
        const chance = state
          ? Math.round(successChance(state, index) * 100)
          : null;
        return (
          <button
            key={PROJECTS[index].name}
            className={`${styles.lane} ${selected === index ? styles.selectedLane : ""}`}
            style={
              {
                top: `${(index * 100) / 3}%`,
                "--lane-color": PROJECTS[index].color,
              } as CSSProperties
            }
            onClick={() => onSelect(index)}
            aria-pressed={selected === index}
            aria-label={`选择${streamer.name}的船，${boat.position}/15 格，${boat.seats.length}/3 席${chance !== null ? `，达标概率 ${chance}%` : ""}`}
            data-testid={`boat-${index}`}
          >
            <span className={styles.laneName}>
              <span>{PROJECTS[index].icon}</span>{" "}
              <strong>{streamer.name}</strong>
              <small>{PROJECTS[index].name}</small>
            </span>
            <span className={styles.laneProgress}>
              {state?.phase === "reveal" && boat.die !== null && (
                <b className={styles.die} data-testid={`die-${index}`}>
                  {["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][boat.die]}
                </b>
              )}
              <strong>
                {boat.position}
                <i>/ 15</i>
              </strong>
              <small>
                {boat.position >= TARGET ? "已达标 ✓" : PROJECTS[index].goal}
              </small>
            </span>
            <span className={styles.laneSeats}>
              {boat.seats.length}/3 席{boat.seats.some((seat) => seat.source === "clip") ? " · 有切片佬蹭船" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
