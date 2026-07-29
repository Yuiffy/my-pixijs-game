import {
  AUGMENTS,
  AUGMENT_TIER_LABELS,
  BOSS_WARNING_TEXT,
  CAMPAIGN_ROUNDS,
  ELITE_WARNING_TEXT,
  FINANCE_INTEREST_CAP,
  HELL_ENDLESS_START_ROUND,
  HELL_WARNING_TEXT,
  NORMAL_INTEREST_CAP,
  PASSIVE_UPGRADE_DISCOUNT,
  type AugmentId,
  type AugmentTier,
  type TraitId,
  waveForRound,
  augmentTierForRound,
} from "../gameData";
import type {
  Fighter,
  GameState,
  Team,
  ToastState,
} from "../gameTypes";
import type { RandomSource } from "./random";
import { STARTER_EFFECTS } from "./runRules";

interface ProgressionHost {
  state: () => GameState;
  rng: () => RandomSource;
  getTraitLevel: (id: TraitId) => number;
  living: (team: Team) => Fighter[];
  isMaxPlayerLevel: () => boolean;
  generateShop: () => GameState["shop"];
  setToast: (text: string, tone?: ToastState["tone"]) => void;
}

export class ProgressionSystem {
  constructor(private readonly host: ProgressionHost) {}

  private get state() {
    return this.host.state();
  }

  private get rng() {
    return this.host.rng();
  }

  private get isMaxPlayerLevel() {
    return this.host.isMaxPlayerLevel();
  }

  private getTraitStatus(id: TraitId) {
    return { level: this.host.getTraitLevel(id) };
  }

  private living(team: Team) {
    return this.host.living(team);
  }

  private generateShop() {
    return this.host.generateShop();
  }

  private setToast(text: string, tone: ToastState["tone"] = "info") {
    this.host.setToast(text, tone);
  }

public get interestIncome() {
    const financeLevel = this.getTraitStatus("finance").level;
    return financeLevel >= 2
      ? Math.min(FINANCE_INTEREST_CAP, Math.floor(this.state.gold / 4))
      : Math.min(NORMAL_INTEREST_CAP, Math.floor(this.state.gold / 5));
  }

public get financeIncomeBonus() {
    return this.getTraitStatus("finance").level > 0 ? 2 : 0;
  }

public get currentWave() {
    return waveForRound(this.state.round, this.state.seed);
  }

public get potentialBounty() {
    return this.currentWave.units.reduce(
      (total, unit) => total + (unit.star || 1),
      0,
    );
  }

public finishBattle(won: boolean) {
    if (this.state.phase !== "battle" || !this.state.battle) return;
    const wave = this.currentWave;
    const interest = this.interestIncome;
    const financeIncome = this.financeIncomeBonus;
    const defeatedByStar: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    const enemyByStar: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    this.state.battle.enemy.forEach((fighter) => {
      enemyByStar[fighter.star] += 1;
      if (!fighter.alive || fighter.hp <= 0) defeatedByStar[fighter.star] += 1;
    });
    const defeatedEnemies = defeatedByStar[1] + defeatedByStar[2] + defeatedByStar[3];
    const enemyCount = enemyByStar[1] + enemyByStar[2] + enemyByStar[3];
    const bounty = enemyByStar[1] + enemyByStar[2] * 2 + enemyByStar[3] * 3;
    const bountyBreakdown = ([1, 2, 3] as const)
      .filter((star) => enemyByStar[star] > 0)
      .map((star) => `${star}星×${enemyByStar[star]}`)
      .join("、");
    const bountyDetail = `阵容结算 ${bounty}（敌军${bountyBreakdown}；击败 ${defeatedEnemies}/${enemyCount}）`;
    let income = 0;
    let damage = 0;
    const debtRoundActive = this.state.paydayDebtRounds > 0;
    let debtPayment = 0;
    if (debtRoundActive) this.state.paydayDebtRounds -= 1;

    if (won) {
      this.state.streak += 1;
      this.state.victories += 1;
      const streakBonus = Math.min(2, Math.max(0, this.state.streak - 1));
      const blazeBonus =
        this.state.victories === 1 ? STARTER_EFFECTS[this.state.starter || "bastion"].firstWinGold || 0 : 0;
      const grossIncome =
        bounty +
        interest +
        streakBonus +
        blazeBonus +
        financeIncome +
        this.state.incomeBonus;
      debtPayment = Math.min(debtRoundActive ? 1 : 0, grossIncome);
      income = grossIncome - debtPayment;
      this.state.gold += income;
      const healthRatio = this.living("player").reduce(
        (sum, fighter) => sum + fighter.hp / fighter.maxHp,
        0,
      );
      this.state.score += Math.round(
        this.state.round * 120 + healthRatio * 32 + this.state.streak * 15,
      );
      this.state.result = {
        won: true,
        headline: wave.tag === "boss" ? "裂隙封闭" : "战线守住了",
        detail: `${bountyDetail} + 利息 ${interest} + 连胜 ${streakBonus}${blazeBonus ? ` + 首胜 ${blazeBonus}` : ""}${financeIncome ? " + 理财 2" : ""}${debtPayment ? " - 花呗还款 1" : ""}`,
        income,
        bounty,
        defeatedEnemies,
        defeatedByStar,
        upgradeDiscount:
          this.state.round < Number.MAX_SAFE_INTEGER && !this.isMaxPlayerLevel
            ? PASSIVE_UPGRADE_DISCOUNT
            : 0,
        damage: 0,
      };
    } else {
      const enemySurvivors = this.living("enemy").length;
      this.state.streak = 0;
      damage = Math.min(
        8,
        2 +
          Math.floor((this.state.round - 1) / 3) +
          Math.min(3, enemySurvivors),
      );
      this.state.hp = Math.max(0, this.state.hp - damage);
      const grossIncome = bounty + interest + financeIncome + this.state.incomeBonus;
      debtPayment = Math.min(debtRoundActive ? 1 : 0, grossIncome);
      income = grossIncome - debtPayment;
      this.state.gold += income;
      this.state.score += this.state.round * 35;
      this.state.result = {
        won: false,
        headline: this.state.hp > 0 ? "防线后撤" : "核心失守",
        detail: `${bountyDetail} + 利息 ${interest}${financeIncome ? " + 理财 2" : ""}${debtPayment ? " - 花呗还款 1" : ""}`,
        income,
        bounty,
        defeatedEnemies,
        defeatedByStar,
        upgradeDiscount:
          this.state.hp > 0 && !this.isMaxPlayerLevel
            ? PASSIVE_UPGRADE_DISCOUNT
            : 0,
        damage,
      };
    }

    this.state.phase = "result";
  }

public continueAfterResult() {
    const { result } = this.state;
    if (this.state.phase !== "result" || !result) return;
    if (this.state.hp <= 0) {
      this.endGame(false);
      return;
    }
    if (result.upgradeDiscount > 0 && !this.isMaxPlayerLevel) {
      const appliedDiscount = Math.min(
        this.state.upgradeRemaining,
        result.upgradeDiscount,
      );
      this.state.upgradeRemaining -= appliedDiscount;
      this.state.upgradeDiscountCarry += result.upgradeDiscount - appliedDiscount;
    }
    if (this.state.round === CAMPAIGN_ROUNDS && result.won) {
      this.state.endlessUnlocked = true;
      this.state.score += this.state.hp * 45 + 500;
      this.setToast("16 战通关！普通无限已开启，31 战后将进入地狱无限。", "good");
    }
    const augmentTier = augmentTierForRound(this.state.round);
    if (augmentTier) {
      this.state.augmentChoices = this.rollAugmentChoices(augmentTier);
      this.state.phase = "augment";
      this.state.battle = null;
      this.state.result = null;
      return;
    }
    this.prepareNextRound();
  }

private rollAugmentChoices(tier: AugmentTier) {
    const tierPool = AUGMENTS.filter((augment) => augment.tier === tier).map(
      (augment) => augment.id,
    );
    const unseen = tierPool.filter((id) => !this.state.augments.includes(id));
    // 只有该档全部拿完后才回补重复项；主线两次选择永远不会见到旧天赋。
    const pool = unseen.length ? unseen : [...tierPool];
    const choices: AugmentId[] = [];
    while (choices.length < 3 && pool.length) {
      const index = Math.floor(this.rng.next() * pool.length);
      choices.push(pool.splice(index, 1)[0]);
    }
    return choices;
  }

public chooseAugment(index: number) {
    if (this.state.phase !== "augment") return;
    const id = this.state.augmentChoices[index];
    if (!id) return;
    this.state.augments.push(id);
    this.state.augmentHistory.push({ round: this.state.round, id });
    if (id === "payday") {
      this.state.gold += 8;
      this.state.paydayDebtRounds = Math.max(this.state.paydayDebtRounds, 4);
    }
    this.state.score += 75;
    const augment = AUGMENTS.find((item) => item.id === id);
    this.setToast(
      `已选择${augment ? AUGMENT_TIER_LABELS[augment.tier] : "局中天赋"}：${augment?.name || id}`,
      "good",
    );
    this.prepareNextRound();
  }

public prepareNextRound() {
    this.state.round += 1;
    this.state.phase = "preparation";
    this.state.battle = null;
    this.state.result = null;
    this.state.selected = null;
    this.state.augmentChoices = [];
    // 流量刷新是每个备战回合重新结算，未使用的次数不会带入下一回合。
    this.state.freeRerollCharges = this.getTraitStatus("traffic").level;
    if (!this.state.shopLocked) this.state.shop = this.generateShop();
    const wave = this.currentWave;
    if (this.state.round === HELL_ENDLESS_START_ROUND) {
      this.setToast(HELL_WARNING_TEXT, "bad");
    } else if (wave.tag === "boss") {
      this.setToast(BOSS_WARNING_TEXT, "bad");
    } else if (wave.tag === "elite") {
      this.setToast(ELITE_WARNING_TEXT, "info");
    }
  }

private endGame(won: boolean) {
    this.state.finalWon = won;
    if (won && !this.state.endlessUnlocked) this.state.score += this.state.hp * 45 + this.state.gold * 10 + 500;
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "rift-line-best-score",
        String(this.state.bestScore),
      );
    }
    this.state.phase = "gameover";
    this.state.battle = null;
    this.state.result = null;
  }
}
