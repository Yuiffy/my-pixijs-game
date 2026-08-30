"use client";

import {
  ArrowRightOutlined,
  BookOutlined,
  CompassOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./WuxiaEditionGate.module.css";

type WuxiaEdition = "legacy" | "sandbox";

const SANDBOX_SAVE_KEY = "wuxia-novel-save-v6";

const CurrentWuxiaGame = dynamic(() => import("./WuxiaGame"), {
  ssr: false,
  loading: () => <EditionLoading label="正在展开开放江湖" />,
});

const LegacyWuxiaGame = dynamic(() => import("./LegacyWuxiaGame"), {
  ssr: false,
  loading: () => <EditionLoading label="正在取出简陋测试版" />,
});

const editionName: Record<WuxiaEdition, string> = {
  legacy: "简陋测试版",
  sandbox: "开放江湖",
};

const hasStoredSave = (key: string) => {
  try {
    return Boolean(window.localStorage.getItem(key));
  } catch {
    return false;
  }
};

function EditionLoading({ label }: { label: string }) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.loadingSeal}>卷</span>
      <p>{label}</p>
    </div>
  );
}

function EditionPicker({
  saves,
  onSelect,
}: {
  saves: Record<WuxiaEdition, boolean>;
  onSelect: (edition: WuxiaEdition) => void;
}) {
  return (
    <main className={styles.picker}>
      <div className={styles.landscape} aria-hidden="true">
        <span className={styles.ridgeBack} />
        <span className={styles.ridgeFront} />
        <span className={styles.sun} />
      </div>

      <header className={styles.pickerHeader}>
        <div className={styles.brand}>
          <span className={styles.brandSeal}>JH</span>
          <span><strong>江湖志</strong><small>DUAL EDITION</small></span>
        </div>
        <div className={styles.headerRule} />
        <p>两套玩法分别保留，各自续卷</p>
      </header>

      <section className={styles.pickerIntro} aria-labelledby="wuxia-edition-title">
        <p className={styles.eyebrow}>选择此行翻开的版本</p>
        <h1 id="wuxia-edition-title">选一卷江湖</h1>
        <p>一边保留改版前的原始试玩，一边让人物与世界继续生长。</p>
      </section>

      <section className={styles.editionGrid} aria-label="武侠游戏版本">
        <button
          type="button"
          className={`${styles.editionCard} ${styles.legacyCard}`}
          aria-label="进入简陋测试版"
          onClick={() => onSelect("legacy")}
        >
          <span className={styles.cardIndex}>卷一</span>
          <span className={styles.portrait}>
            <Image src="/images/autochess/portraits/sui.png" alt="简陋测试版人物" fill sizes="(max-width: 760px) 42vw, 220px" priority />
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardIcon}><BookOutlined /></span>
            <span className={styles.cardTitle}>简陋测试版</span>
            <span className={styles.cardMeta}>自动演义 · 同行助战 · 全书完</span>
            <span className={styles.cardDescription}>改版前的原始试玩：朴素文字自动推进，途中可结伴、共同迎敌，并会真正写到结局。</span>
            <span className={styles.cardFoot}>
              <span>从头演义</span>
              <ArrowRightOutlined />
            </span>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.editionCard} ${styles.sandboxCard}`}
          aria-label="进入开放江湖"
          onClick={() => onSelect("sandbox")}
        >
          <span className={styles.cardIndex}>卷二</span>
          <span className={styles.portrait}>
            <Image src="/images/autochess/portraits/xuehui.png" alt="开放江湖人物" fill sizes="(max-width: 760px) 42vw, 220px" priority />
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardIcon}><CompassOutlined /></span>
            <span className={styles.cardTitle}>开放江湖</span>
            <span className={styles.cardMeta}>自由行程 · 人物沙盘 · 无尽章节</span>
            <span className={styles.cardDescription}>地点、关系、招式与人物意图共同运转；更自由，也仍是一卷尚未写出终章的实验。</span>
            <span className={styles.cardFoot}>
              <span>{saves.sandbox ? "已有江湖存档" : "进入新江湖"}</span>
              <ArrowRightOutlined />
            </span>
          </span>
        </button>
      </section>

      <footer className={styles.pickerFooter}>
        开放江湖会保留自己的存档；简陋测试版每次从头演义。
      </footer>
    </main>
  );
}

export default function WuxiaEditionGate() {
  const [edition, setEdition] = useState<WuxiaEdition | null>(null);
  const [saves, setSaves] = useState<Record<WuxiaEdition, boolean>>({ legacy: false, sandbox: false });

  useEffect(() => {
    if (edition) return;
    setSaves({
      legacy: false,
      sandbox: hasStoredSave(SANDBOX_SAVE_KEY),
    });
  }, [edition]);

  useEffect(() => {
    if (edition) return undefined;
    const renderPicker = () => JSON.stringify({
      screen: "edition-select",
      editions: [
        { id: "legacy", name: editionName.legacy, saved: saves.legacy },
        { id: "sandbox", name: editionName.sandbox, saved: saves.sandbox },
      ],
    });
    window.render_game_to_text = renderPicker;
    return () => {
      if (window.render_game_to_text === renderPicker) delete window.render_game_to_text;
    };
  }, [edition, saves]);

  if (!edition) return <EditionPicker saves={saves} onSelect={setEdition} />;

  return (
    <div className={styles.playing} data-wuxia-edition={edition}>
      <button
        type="button"
        className={styles.switchButton}
        aria-label="切换武侠版本"
        title="返回版本选择"
        onClick={() => setEdition(null)}
      >
        <SwapOutlined />
        <span>切换版本</span>
        <small>{editionName[edition]}</small>
      </button>
      {edition === "legacy" ? <LegacyWuxiaGame /> : <CurrentWuxiaGame />}
    </div>
  );
}
