"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { AugmentSelection, StarterSelection } from "./core/gameEngine";
import {
  ABILITY_CAST_TIMING_LABELS,
  AUGMENTS,
  AUGMENT_TIER_LABELS,
  ENERGY_PROFILES,
  describeEnergyRecovery,
  PLAYER_LEVELS,
  PLAYER_LEVEL_CONFIG,
  SHOP_UNITS,
  STARTERS,
  TRAIT_IDS,
  TRAITS,
  UNIT_DEFS,
  UnitId,
  bookLevelForPlayerLevel,
  tierOddsForLevel,
} from "./core/gameData";

type Tab = "units" | "traits" | "talents" | "runTalents" | "odds" | "rules";
type TraitFamilyFilter = "all" | "阵营" | "职业" | "关系";

interface CodexProps {
  open: boolean;
  augmentHistory: AugmentSelection[];
  starterHistory: StarterSelection[];
  onClose: () => void;
}

const tabNames: Record<Tab, string> = {
  units: "棋子",
  traits: "羁绊",
  talents: "开局 / 天赋",
  runTalents: "本局天赋",
  odds: "商店概率",
  rules: "玩法说明",
};

const cellStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid rgba(125, 190, 225, 0.12)",
  textAlign: "center" as const,
};

export default function Codex({ open, augmentHistory, starterHistory, onClose }: CodexProps) {
  const [tab, setTab] = useState<Tab>("units");
  const [tier, setTier] = useState<number | "all">("all");
  const [traitFamily, setTraitFamily] = useState<TraitFamilyFilter>("all");
  const [selectedUnit, setSelectedUnit] = useState<UnitId>(SHOP_UNITS[0]);
  const units = useMemo(
    () => SHOP_UNITS.filter(
      (id) => tier === "all" || UNIT_DEFS[id].tier === tier,
    ),
    [tier],
  );
  if (!open) return null;

  const unit = UNIT_DEFS[selectedUnit];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="裂隙阵线图鉴"
      style={{
        position: "absolute",
        inset: "clamp(6px, 3vw, 38px)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(123, 220, 255, 0.42)",
        borderRadius: 16,
        background: "rgba(5, 14, 23, 0.98)",
        color: "#dfefff",
        boxShadow: "0 24px 80px rgba(0,0,0,.65)",
        overflow: "hidden",
        fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif',
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          flexWrap: "wrap",
          background: "#0b1a27",
          borderBottom: "1px solid rgba(123, 220, 255, .18)",
        }}
      >
        <strong style={{ marginRight: 12, fontSize: 17 }}>战术图鉴</strong>
        {(Object.keys(tabNames) as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "7px 13px",
              border: `1px solid ${tab === id ? "#79d8ff" : "#294658"}`,
              borderRadius: 8,
              color: tab === id ? "#07131d" : "#a7bdcc",
              background: tab === id ? "#79d8ff" : "#132635",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {tabNames[id]}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            padding: "7px 14px",
            border: "1px solid #496579",
            borderRadius: 8,
            color: "#dcecff",
            background: "#1b3040",
            cursor: "pointer",
          }}
        >
          关闭 Esc
        </button>
      </header>
      <main style={{ flex: 1, overflow: "auto", padding: 18 }}>
        {tab === "units" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
            <section>
              <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
                {(["all", 1, 2, 3, 4, 5] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTier(value)}
                    style={{
                      padding: "6px 11px",
                      border: "1px solid #345269",
                      borderRadius: 12,
                      color: tier === value ? "#07131d" : "#9fb7c8",
                      background: tier === value ? "#79d8ff" : "#102231",
                      cursor: "pointer",
                    }}
                  >
                    {value === "all" ? `全部 ${SHOP_UNITS.length}` : `${value} 费`}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: 8 }}>
                {units.map((id) => {
                  const definition = UNIT_DEFS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedUnit(id)}
                      style={{
                        minHeight: 72,
                        padding: 9,
                        textAlign: "left",
                        border: `1px solid ${selectedUnit === id ? definition.accent : "#294658"}`,
                        borderRadius: 10,
                        color: "#dfefff",
                        background: selectedUnit === id ? `${definition.accent}22` : "#0d1d2a",
                        cursor: "pointer",
                      }}
                    >
                      <strong style={{ color: definition.accent }}>{definition.name}</strong>
                      <div style={{ marginTop: 5, fontSize: 11, color: "#7f9aae" }}>
                        {definition.tier} 费 · {definition.traits.map((traitId) => TRAITS[traitId].name).join(" / ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            <aside style={{ padding: 18, border: `1px solid ${unit.accent}`, borderRadius: 14, background: "#091824" }}>
              {unit.portrait && (
                <Image
                  src={unit.portrait}
                  alt={unit.name}
                  width={unit.portraitStyle === "sprite" ? 112 : 120}
                  height={unit.portraitStyle === "sprite" ? 112 : 86}
                  style={unit.portraitStyle === "sprite"
                    ? {
                      width: 112,
                      height: 112,
                      objectFit: "contain",
                      imageRendering: "pixelated",
                      float: "right",
                      marginLeft: 12,
                    }
                    : {
                      width: 120,
                      height: 86,
                      objectFit: "cover",
                      objectPosition: unit.portraitFocus === "top" ? "center 16%" : "center",
                      borderRadius: 12,
                      float: "right",
                      marginLeft: 12,
                    }}
                />
              )}
              <div style={{ color: unit.accent, fontSize: 12 }}>{unit.tier} 费</div>
              <h2 style={{ margin: "6px 0 12px", fontSize: 25 }}>{unit.name}</h2>
              <div style={{ color: "#99b1c1", lineHeight: 1.8 }}>
                生命 {unit.hp} · 攻击 {unit.attack} · 护甲 {unit.armor}<br />
                {unit.attackType === "ranged" ? "远程" : "近战"} · 射程 {unit.range} · 攻击间隔 {unit.attackInterval.toFixed(2)} 秒 · 移速 {unit.moveSpeed}<br />
                <span style={{ color: ENERGY_PROFILES[unit.energyProfile.id].color }}>
                  能量 · {unit.energyProfile.name}：{describeEnergyRecovery(unit.energyProfile)}
                </span>
              </div>
              <p style={{ color: "#708a9d", margin: "8px 0 12px", fontSize: 12 }}>以上为基础属性；羁绊、开局和局中天赋会在战斗中进一步修改数值。</p>
              <h3 style={{ color: unit.accent, marginBottom: 6 }}>{unit.abilityName}</h3>
              <div style={{ color: "#8eb0c4", fontSize: 12, marginBottom: 6 }}>
                {ABILITY_CAST_TIMING_LABELS[unit.abilityCastTiming]}
              </div>
              <p style={{ color: "#b6c8d4", lineHeight: 1.7 }}>{unit.abilityDescription}</p>
              <h3 style={{ marginBottom: 6 }}>所属羁绊</h3>
              {unit.traits.map((id) => (
                <div key={id} style={{ marginBottom: 8, color: TRAITS[id].color }}>
                  <strong>{TRAITS[id].name}</strong> · {TRAITS[id].description}
                </div>
              ))}
              <p style={{ clear: "both", paddingTop: 12, fontSize: 12, color: "#708a9d" }}>
                3 个同名同星棋子自动合成；二星属性约为一星 1.68 倍，三星约为 2.82 倍。
              </p>
            </aside>
          </div>
        )}
        {tab === "traits" && (
          <section>
            <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
              {(["all", "阵营", "职业", "关系"] as const).map((family) => (
                <button key={family} type="button" onClick={() => setTraitFamily(family)} style={{ padding: "6px 11px", border: "1px solid #345269", borderRadius: 12, color: traitFamily === family ? "#07131d" : "#9fb7c8", background: traitFamily === family ? "#79d8ff" : "#102231", cursor: "pointer" }}>
                  {family === "all" ? "全部" : family}
                </button>
              ))}
            </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 12 }}>
            {TRAIT_IDS.filter((id) => traitFamily === "all" || TRAITS[id].family === traitFamily).map((id) => {
              const trait = TRAITS[id];
              return (
                <article key={id} style={{ padding: 16, border: `1px solid ${trait.color}88`, borderRadius: 12, background: `${trait.color}0d` }}>
                  <div style={{ color: trait.color, fontSize: 19, fontWeight: 800 }}>{trait.name} <small>· {trait.family}</small></div>
                  <p style={{ color: "#a8bdca" }}>{trait.description}</p>
                  {trait.thresholds.map((threshold, index) => (
                    <div key={threshold} style={{ marginTop: 7 }}>
                      <strong style={{ color: trait.color }}>{threshold} 名</strong>：{trait.bonuses[index]}
                    </div>
                  ))}
                  <div style={{ marginTop: 12, fontSize: 12, color: "#718b9c" }}>
                    相关棋子：{SHOP_UNITS.filter((unitId) => UNIT_DEFS[unitId].traits.includes(id)).map((unitId) => UNIT_DEFS[unitId].name).join("、")}
                  </div>
                </article>
              );
            })}
          </div>
          </section>
        )}
        {tab === "talents" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div>
              <h2 style={{ margin: "0 0 8px" }}>开局选择</h2>
              <p style={{ color: "#8da7b8" }}>开局协议决定初始棋子和整局的专属加成；每局会按战术种子从完整卡池随机提供 3 个不重复选项。</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {STARTERS.map((starter) => (
                  <article key={starter.id} style={{ padding: 14, border: `1px solid ${starter.color}88`, borderRadius: 12, background: `${starter.color}0d` }}>
                    <strong style={{ color: starter.color }}>{starter.name}</strong>
                    <div style={{ marginTop: 6, color: "#e4f2fb", fontWeight: 700 }}>{starter.subtitle}</div>
                    <p style={{ marginBottom: 0, color: "#a8bdca", lineHeight: 1.6 }}>{starter.description}</p>
                  </article>
                ))}
              </div>
            </div>
            {(["minor", "major"] as const).map((tier) => (
              <div key={tier}>
                <h2 style={{ margin: "0 0 8px" }}>{AUGMENT_TIER_LABELS[tier]}</h2>
                <p style={{ color: "#8da7b8" }}>
                  {tier === "minor"
                    ? "第 2 战后出现，提供早期定向强化。"
                    : "第 5 战后出现，每项都按足以改变后期打法的强度设计。"}
                  {" "}同档天赋拿完前不会重复。
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {AUGMENTS.filter((augment) => augment.tier === tier).map((augment) => (
                    <article key={augment.id} style={{ padding: 14, border: `1px solid ${augment.color}88`, borderRadius: 12, background: `${augment.color}0d` }}>
                      <strong style={{ color: augment.color }}>{augment.name}</strong>
                      <div style={{ marginTop: 6, color: augment.color, fontSize: 12, fontWeight: 800 }}>{augment.kicker}</div>
                      <p style={{ marginBottom: 0, color: "#a8bdca", lineHeight: 1.6 }}>{augment.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
        {tab === "runTalents" && (
          <section>
            <h2 style={{ margin: "0 0 8px" }}>本局选择记录</h2>
            <p style={{ color: "#8da7b8" }}>开局选择与后续天赋会按获得顺序记录在这里。</p>
            {starterHistory.map(({ id }) => {
              const starter = STARTERS.find((item) => item.id === id);
              if (!starter) return null;
              return (
                <article key={`starter-${id}`} style={{ marginBottom: 12, padding: 14, border: `1px solid ${starter.color}88`, borderRadius: 12, background: `${starter.color}0d` }}>
                  <div style={{ color: "#8da7b8", fontSize: 12, fontWeight: 700 }}>开局选择</div>
                  <strong style={{ display: "block", marginTop: 6, color: starter.color, fontSize: 18 }}>{starter.name}</strong>
                  <p style={{ marginBottom: 0, color: "#a8bdca", lineHeight: 1.6 }}>{starter.description}</p>
                </article>
              );
            })}
            {starterHistory.length === 0 && augmentHistory.length === 0 && (
              <div style={{ padding: 20, border: "1px dashed #345269", borderRadius: 12, color: "#8da7b8", background: "#0d1d2a" }}>
                本局尚未开始；选择开局后，后续天赋也会记录在这里。
              </div>
            )}
            {augmentHistory.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                {augmentHistory.map(({ round, id }) => {
                  const augment = AUGMENTS.find((item) => item.id === id);
                  if (!augment) return null;
                  return (
                    <article key={`${round}-${id}`} style={{ padding: 14, border: `1px solid ${augment.color}88`, borderRadius: 12, background: `${augment.color}0d` }}>
                      <div style={{ color: "#8da7b8", fontSize: 12, fontWeight: 700 }}>第 {round} 战 · {AUGMENT_TIER_LABELS[augment.tier]}</div>
                      <strong style={{ display: "block", marginTop: 6, color: augment.color, fontSize: 18 }}>{augment.name}</strong>
                      <div style={{ marginTop: 6, color: augment.color, fontSize: 12, fontWeight: 800 }}>{augment.kicker}</div>
                      <p style={{ marginBottom: 0, color: "#a8bdca", lineHeight: 1.6 }}>{augment.description}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
        {tab === "odds" && (
          <section>
            <h2>各等级商店抽取概率</h2>
            <p style={{ color: "#8da7b8" }}>每个商店格独立按下表抽取。升本需要一次付清当前剩余费用，每完成一回合费用自动减少 1 金币，最低可减至 0；零费后继续获得的减费会结转到后续本级。</p>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#0a1a26", border: "1px solid #294658" }}>
              <thead><tr><th style={cellStyle}>等级</th><th style={cellStyle}>人口</th><th style={cellStyle}>初始升本费用</th>{[1, 2, 3, 4, 5].map((value) => <th key={value} style={cellStyle}>{value} 费</th>)}</tr></thead>
              <tbody>{PLAYER_LEVELS.map((level) => <tr key={level}><td style={cellStyle}>{bookLevelForPlayerLevel(level)} 本</td><td style={cellStyle}>{PLAYER_LEVEL_CONFIG[level].boardCap}</td><td style={cellStyle}>{PLAYER_LEVEL_CONFIG[level].upgradeCost ?? "满级"}</td>{tierOddsForLevel(level).map((chance, index) => <td key={index} style={{ ...cellStyle, color: chance ? "#dcefff" : "#526775" }}>{chance}%</td>)}</tr>)}</tbody>
            </table>
            <h3 style={{ marginTop: 22 }}>数值节奏</h3>
            <ul style={{ color: "#a8bdca", lineHeight: 2 }}>
              <li>3→4 本初始 5 金；8→9 本初始 36 金；9→10 本初始 46 金。</li>
              <li>自然等待会降低升本负担；未及时升本不会损失减费，溢出部分会继续抵扣下一本。</li>
              <li>刷新花费 1 金；锁定后下回合保留货架，主动刷新会自动解锁。</li>
            </ul>
          </section>
        )}
        {tab === "rules" && (
          <section style={{ maxWidth: 820, lineHeight: 1.9 }}>
            <h2>远征与无限裂隙</h2>
            <p>守住前 8 战即完成远征，随后无缝进入无限裂隙。无限敌军会增加数量、升星和属性，每 5 层迎来强化首领，每 6 层交替获取小天赋或大天赋；同档全部拿完后才会回补重复强化。</p>
            <h2>操作</h2>
            <ul><li>点击商店购买；点击或拖拽棋子调整站位；右键棋子可快速回收。</li><li>R 刷新商店，Space 开战，F 全屏，Esc 关闭面板/取消选中。</li><li>敌情预览、棋子、羁绊均可悬浮查看详情。</li></ul>
            <h2>能量</h2>
            <p>棋子能量满后按技能类别触发：自保需受击才放；支援护盾满能量即放；支援治疗要等友军生命降到约 70% 才放；突进与远程进攻满能量即放；近距进攻需进入普攻距离。每张棋子卡和悬浮详情都会写明初始能量、回能来源与技能释放类别：自动回能按秒累积；攻击回能在普攻命中后获得；受击回能在被普攻命中后获得。能量数值会受到羁绊、开局与天赋影响。</p>
            <h2>经济</h2>
            <p>没有固定工资：每击败一名敌人，按其星级获得赏金，1/2/3 星分别提供 1/2/3 金。即使战斗失利，已击败敌人的赏金也会正常结算。每 5 金提供 1 利息，最多计算 20 金，即最高 4 利息；理财Ⅱ改为每 4 金提供 1 利息且无上限。连胜和理财还能提供额外收入。升本是“支付当前剩余费用直接升级”；每回合的自然减费最低可将费用降至 0，溢出减费会结转到后续本级。最高 10 本可上阵 10 人。</p>
          </section>
        )}
      </main>
    </div>
  );
}
