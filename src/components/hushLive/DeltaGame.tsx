import { deltaPosition, Game, hitDelta, leaveDelta, missDelta } from "./engine";
import styles from "./hush3d.module.css";

export default function DeltaGame({
  game,
  onChange,
}: {
  game: Game;
  onChange: () => void;
}) {
  const d = game.delta;
  if (!d?.active) return null;
  const { id } = d;
  const point = deltaPosition(d);
  return (
    <section
      className={styles.deltaPanel}
      aria-label="三角洲报点小游戏"
      data-delta-active="true"
    >
      <header>
        <div>
          <small>DELTA / 小队频道</small>
          <h2>瞄准小球，点击报点</h2>
        </div>
        <button
          onClick={() => {
            leaveDelta(game);
            onChange();
          }}
        >
          返回房间
        </button>
      </header>
      <div className={styles.deltaStats}>
        <strong>报点 {d.hits} / 8</strong>
        <span>失误 {d.misses} / 3</span>
        <button
          aria-pressed={game.quiet}
          onClick={() => {
            game.quiet = !game.quiet;
            onChange();
          }}
        >
          {game.quiet ? "低声 · 每次+1" : "大声 · 每次+2，噪声更大"}
        </button>
      </div>
      <div
        className={styles.deltaArena}
        aria-label="报点场地"
        onPointerDown={(event) => {
          if (event.button === 0 && event.isPrimary && event.target === event.currentTarget) {
            missDelta(game);
            onChange();
          }
        }}
      >
        <span className={styles.deltaWatermark}>NORTH BRIDGE</span>
        <button
          key={id}
          data-delta-target={id}
          aria-label={`报点目标 ${id}`}
          className={styles.deltaTarget}
          style={
            {
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              "--life": `${Math.max(0, 1 - d.age / 2.1) * 360}deg`,
            } as React.CSSProperties
          }
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            event.stopPropagation();
            hitDelta(game, id);
            onChange();
          }}
          onClick={(event) => {
            event.stopPropagation();
            // Mouse/touch already scored on pointerdown. Preserve native keyboard/AT activation.
            if (event.detail !== 0) return;
            hitDelta(game, id);
            onChange();
          }}
        >
          <i />
        </button>
        <div className={styles.deltaFeedback} aria-live="polite">
          {d.feedback}
        </div>
      </div>
      <footer>
        小球会移动，2秒内点中。点空或超时算失误。
        <br />
        报点会出声，关门和唱歌仍能掩护你。
        <span>{game.doorClosed ? "✓ 门已关" : "门还开着"}</span>
      </footer>
    </section>
  );
}
