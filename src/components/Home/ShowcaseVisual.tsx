import Image from 'next/image';
import styles from './ShowcaseVisual.module.css';

type Kind = 'gallery' | 'records' | 'games';

const galleryCards = [
  { label: '小红帽', src: '/images/materials/red/1d5ad005aff0b4b648a0f1ef6b8d0cd71954091502.png' },
  { label: '小猫帽', src: '/images/materials/岁己SUI小猫帽带饼干岁紫色外套双马尾.png' },
  { label: '小蓝帽', src: '/images/materials/blue/5a2bcc519c33a2213134bdc196799d041954091502.png' },
] as const;

function GalleryVisual() {
  return (
    <div className={styles.gallerySpread}>
      {galleryCards.map(({ label, src }, index) => (
        <div className={styles.artCard} key={label}>
          <Image src={src} alt="" fill sizes="(max-width: 640px) 105px, 146px" draggable={false} />
          <span><i>0{index + 1}</i>{label}</span>
        </div>
      ))}
    </div>
  );
}

function RecordsVisual() {
  return (
    <div className={styles.archive}>
      <div className={styles.archiveTop}><span>直播文字总结</span><time dateTime="2026-08-23T20:12:35+08:00">2026.08.23 · 20:12</time></div>
      <div className={styles.archiveTitle}>艾尔登法环 · 内容分段</div>
      <div className={styles.recordTrack}><span /><span /><span /><span /></div>
      <div className={`${styles.chapter} ${styles.chapterFirst}`}><b>01</b><span>挑战大树守卫</span></div>
      <div className={`${styles.chapter} ${styles.chapterBright}`}><b>02</b><span>大树守卫二阶段</span><span className={styles.chapterMark}>●</span></div>
      <div className={styles.chapter}><b>03</b><span>石堆地形中的反复尝试</span></div>
    </div>
  );
}

function GamesVisual() {
  return (
    <div className={styles.gameStage}>
      <div className={styles.gameArt}>
        <Image src="/images/demos/rift-line-hero.png" alt="" fill sizes="(max-width: 640px) 330px, 460px" draggable={false} />
      </div>
      <div className={styles.gameGrid} />
      <div className={styles.gameLabel}><span>策略自走棋</span><b>裂隙阵线</b></div>
      <div className={styles.formation}>
        <span>站位示意</span>
        <div className={styles.formationGrid}><i>前排</i><i>前排</i><i>输出</i></div>
      </div>
      <div className={styles.gameAccent}>✦</div>
    </div>
  );
}

export default function ShowcaseVisual({ kind }: { kind: Kind }) {
  return (
    <div className={`${styles.visual} ${styles[kind]}`} aria-hidden="true" data-showcase-visual={kind}>
      {kind === 'gallery' ? <GalleryVisual /> : kind === 'records' ? <RecordsVisual /> : <GamesVisual />}
    </div>
  );
}
