"use client";

import type { Game } from "./engine";
import { showPosition } from "./engine";
import { edgeId, FLOOR_HEIGHT } from "./world";
import styles from "./wayfinder.module.css";

type Props = {
  game: Game;
  review?: boolean;
  onLocate?: (x: number, z: number, floor: number) => void;
  onFloor: (floor: number) => void;
};
export default function Atlas({
  game: g,
  review = false,
  onLocate,
  onFloor,
}: Props) {
  const { world } = g;
  const floor = g.mapFloor;
  const scale = 4.25;
  const at = (n: number) => 220 + n * scale;
  const floors = Array.from(new Set(world.nodes.map((n) => n.floor)));
  return (
    <div className={styles.atlas}>
      <div className={styles.atlasHeading}>
        <span>
          {world.theme === "cave"
            ? "回声洞窟 · 石廊手绘图"
            : world.theme === "arcade"
              ? "风庭商场导览"
              : g.mission === 5
                ? "海风外岛街图"
                : "风邮小镇街图"}
        </span>
        <strong>北 ↑</strong>
      </div>
      {floors.length > 1 && (
        <div className={styles.floorTabs} aria-label="地图楼层">
          {floors.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={floor === f}
              onClick={() => onFloor(f)}
            >
              {f + 1}F {f === 0 ? "街庭" : "空中走廊"}
            </button>
          ))}
        </div>
      )}
      <svg
        viewBox="0 0 440 400"
        role="img"
        aria-label={`${floor + 1}楼纸地图，北朝上。${g.locate ? "点击你认为所在的位置" : "道路与地标"}`}
        className={g.locate ? styles.locating : ""}
        onPointerDown={(event) => {
          if (!g.locate || !onLocate) return;
          const matrix = event.currentTarget.getScreenCTM();
          if (!matrix) return;
          const point = new DOMPoint(
            event.clientX,
            event.clientY,
          ).matrixTransform(matrix.inverse());
          onLocate((point.x - 220) / scale, (point.y - 220) / scale, floor);
        }}
      >
        <defs>
          <pattern
            id="wf-paper-grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 22 0 L 0 0 0 22"
              fill="none"
              stroke="#e0d6bd"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width="440" height="400" fill="#f5ebd2" />
        <rect width="440" height="400" fill="url(#wf-paper-grid)" />
        <text x="24" y="31" fill="#8f8b71" fontSize="11" letterSpacing="3">
          WINDPOST FIELD NOTES
        </text>
        {world.edges
          .filter((e) => !e.stair && world.nodes[e.a].floor === floor)
          .map((e) => {
            const a = world.nodes[e.a];
            const b = world.nodes[e.b];
            return (
              <g key={edgeId(e.a, e.b)}>
                <line
                  x1={at(a.x)}
                  y1={at(a.z)}
                  x2={at(b.x)}
                  y2={at(b.z)}
                  stroke="#c2b18d"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <line
                  x1={at(a.x)}
                  y1={at(a.z)}
                  x2={at(b.x)}
                  y2={at(b.z)}
                  stroke="#fff9e7"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                {g.blocked.includes(edgeId(e.a, e.b)) && (
                  <text
                    x={at((a.x + b.x) / 2)}
                    y={at((a.z + b.z) / 2) + 7}
                    textAnchor="middle"
                    fontSize="24"
                    fill="#b75437"
                  >
                    ×
                  </text>
                )}
              </g>
            );
          })}
        {!review &&
          world.edges
            .filter((e) => g.chalk.includes(edgeId(e.a, e.b)))
            .map((e) => {
              const a = world.nodes[e.a];
              const b = world.nodes[e.b];
              return (
                <text
                  key={edgeId(e.a, e.b)}
                  x={at((a.x + b.x) / 2)}
                  y={at((a.z + b.z) / 2) + 5}
                  textAnchor="middle"
                  fontSize="18"
                  fill="#a67b4f"
                >
                  ☾
                </text>
              );
            })}
        {review &&
          g.referenceTrace.slice(1).map((point, i) => {
            const previous = g.referenceTrace[i];
            if (point.floor !== floor || previous.floor !== floor) return null;
            return (
              <line
                key={i}
                x1={at(previous.x) + 4}
                y1={at(previous.z) + 4}
                x2={at(point.x) + 4}
                y2={at(point.z) + 4}
                stroke="#56795b"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.8"
              />
            );
          })}
        {review &&
          g.trace.slice(1).map((point, i) => {
            const previous = g.trace[i];
            if (
              point.floor !== floor ||
              previous.floor !== floor ||
              Math.hypot(point.x - previous.x, point.z - previous.z) > 5
            ) return null;
            return (
              <line
                key={i}
                x1={at(previous.x)}
                y1={at(previous.z)}
                x2={at(point.x)}
                y2={at(point.z)}
                stroke="#bf6043"
                strokeWidth="2.8"
                opacity="0.65"
              />
            );
          })}
        {world.edges
          .filter((e) => e.stair)
          .map((e) => {
            const n =
              world.nodes[
                [e.a, e.b].find((id) => world.nodes[id].floor === floor)!
              ];
            return (
              <g key={e.a} transform={`translate(${at(n.x)},${at(n.z)})`}>
                <rect
                  x="-12"
                  y="-12"
                  width="24"
                  height="24"
                  rx="3"
                  fill={
                    g.blocked.includes(edgeId(e.a, e.b)) ? "#b75437" : "#547e78"
                  }
                />
                <text y="6" textAnchor="middle" fill="white" fontSize="18">
                  {g.blocked.includes(edgeId(e.a, e.b)) ? "×" : "↕"}
                </text>
                <text y="28" textAnchor="middle" fill="#475f58" fontSize="10">
                  楼梯
                </text>
              </g>
            );
          })}
        {world.places
          .filter((p) => world.nodes[p.node].floor === floor)
          .map((p) => {
            const n = world.nodes[p.node];
            const planned = p.id === g.plan;
            return (
              <g key={p.id} transform={`translate(${at(n.x)},${at(n.z)})`}>
                {planned && (
                  <circle
                    r="18"
                    fill="none"
                    stroke="#647862"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                )}
                <circle
                  r="11"
                  fill={p.color}
                  stroke="#fcf3dc"
                  strokeWidth="2"
                />
                <text y="4" textAnchor="middle" fill="#fff6dd" fontSize="13">
                  {p.symbol}
                </text>
                <rect
                  x="-34"
                  y="-29"
                  width="68"
                  height="15"
                  rx="2"
                  fill="#f5ebd2"
                  opacity="0.94"
                />
                <text
                  className={styles.mapLabel}
                  y="-18"
                  textAnchor="middle"
                  fill="#454b3e"
                  fontSize="11"
                  fontWeight="600"
                >
                  {p.name}
                </text>
              </g>
            );
          })}
        {!review && showPosition(g) && g.player.floor === floor && (
          <g transform={`translate(${at(g.player.x)},${at(g.player.z)})`}>
            <circle r="7" fill="#273d38" stroke="white" strokeWidth="2" />
            <path
              d="M 0 -16 L -4 -9 L 4 -9 Z"
              fill="#273d38"
              transform={`rotate(${g.player.yaw * (180 / Math.PI)})`}
            />
          </g>
        )}
        {g.mapPin?.floor === floor && !review && (
          <g transform={`translate(${at(g.mapPin.x)},${at(g.mapPin.z)})`}>
            <circle
              r="9"
              fill="none"
              stroke="#bb684c"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          </g>
        )}
        <line
          x1="30"
          y1="365"
          x2={30 + 18 * scale}
          y2="365"
          stroke="#79816b"
          strokeWidth="2"
        />
        <text x="30" y="383" fontSize="10" fill="#79816b">
          一条街约 18 米{" "}
          {world.theme === "arcade" ? `· 层高 ${FLOOR_HEIGHT} 米` : ""}
        </text>
      </svg>
      <div className={styles.mapLegend}>
        <span>○ 地标</span>
        <span>↕ 楼梯</span>
        <span>× 断路{world.theme === "cave" ? " · ☾ 自己的记号" : ""}</span>
        <span>
          {review
            ? "橙线：脚步 · 绿虚线：最短路参考"
            : showPosition(g)
              ? "● 现在的位置"
              : "先用地标判断位置"}
        </span>
      </div>
      {g.locate && !review && (
        <details className={styles.keyboardLocations}>
          <summary>用键盘选择一个路口位置</summary>
          <div>
            {world.nodes
              .filter((n) => n.floor === floor)
              .map((n) => (
                <button key={n.id} onClick={() => onLocate?.(n.x, n.z, floor)}>
                  {world.theme === "cave"
                    ? `石廊节点 ${n.id + 1}`
                    : `第 ${Math.floor((n.id % (world.size ** 2)) / world.size) + 1} 行，第 ${(n.id % world.size) + 1} 列`}
                </button>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
