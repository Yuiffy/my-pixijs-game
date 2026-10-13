import type { Game } from "./engine";
import { FAULTS, FaultKind, repairInput, wakeNap } from "./lifeEvents";
import { skinOf } from "./skins";
import styles from "./daily.module.css";

export default function LifeEventPanel({ game: s, onChange }: { game: Game; onChange: () => void }) {
  const d = s.daily;
  if (!d) return null;
  const change = (fn: () => void) => { fn(); onChange(); };
  if (d.panel === "nap") return (
    <section className={`${styles.panel} ${styles.napPanel}`} aria-label="偷偷睡在床上">
      <small>JUST FIVE MINUTES / 偷一会儿懒</small>
      <h2>{d.events.nap.reaction >= 2 ? "好好好，这就起来…" : "枕头也太舒服了。"}</h2>
      <div className={styles.snore} aria-hidden="true">z<span>Z</span>z</div>
      <p role="status">{s.message}</p>
      {d.events.nap.reaction === 3 && <aside className={styles.phone}><strong>微信 · {skinOf(s.skin).name}</strong><p>{d.messages[d.messages.length - 1].text}</p></aside>}
      <button className={styles.primary} onClick={() => change(() => wakeNap(s))}>轻轻起床，收住呼噜</button>
      <small>随时可以起身，今晚的小事还在等你。</small>
    </section>
  );
  if (d.panel !== "repair") return null;
  const r = d.events.repair;
  const fault = FAULTS[r.kind];
  const testing = r.stage === "testing";
  return (
    <section className={styles.panel} aria-label="直播设备检修">
      <small>BACKSTAGE / 你的场外技术员</small>
      <h2>{testing ? "信号回来了，先别急。" : "别慌，我在镜头外。"}</h2>
      <div className={styles.signalBoard}>
        {(Object.keys(FAULTS) as FaultKind[]).map(kind => <div key={kind} data-status={!testing && kind === r.kind ? "fault" : "ok"}><i /><span>{FAULTS[kind].channel}</span><b>{!testing && kind === r.kind ? "异常" : "正常"}</b></div>)}
      </div>
      <p>{fault.symptom}</p>
      {r.feedback !== fault.symptom && <p role="status">{r.feedback}</p>}
      {r.stage === "fault" && <button className={styles.primary} onClick={() => change(() => repairInput(s, "isolate"))}>给TA暗号：闭麦，切稍等画面</button>}
      {r.stage === "isolated" && <div className={styles.choices}>{(Object.keys(FAULTS) as FaultKind[]).map(kind => <button key={kind} onClick={() => change(() => repairInput(s, kind))}>{FAULTS[kind].fix}</button>)}</div>}
      {testing && <><label htmlFor="repair-stable">稳定观察 · {r.stable.toFixed(1)} / 3 秒</label><progress id="repair-stable" max={3} value={r.stable} /><button className={styles.primary} disabled={r.stable < 3} onClick={() => change(() => repairInput(s, "resume"))}>确认恢复，示意TA继续播</button></>}
      <button className={styles.leaveEvent} onClick={() => change(() => repairInput(s, "close"))}>先起身，稍后继续</button>
    </section>
  );
}
