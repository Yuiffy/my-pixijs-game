import type { Ending } from "./core";
import { aiCompany, AiCompanyId } from "./agiIndustry";
import type { AiRival } from "./agiEngine";

export type AiRivalOutcome = {
  winnerId: AiCompanyId;
  endingId: string;
  decision: string;
  reason: string;
  consequences: string[];
  tradeoff: string;
  turn: number;
  metrics: Pick<AiRival, "capability" | "compute" | "reliability" | "safety" | "video" | "ecosystem" | "product" | "defense" | "reputation"> & { open: boolean };
};
export type AiEnding = Ending & { rivalOutcome?: AiRivalOutcome };
type WorldChoice = Pick<AiRivalOutcome, "endingId" | "decision" | "reason" | "consequences" | "tradeoff"> & { title: string };

function chooseWorld(r: AiRival): WorldChoice {
  const company = aiCompany(r.company);
  const careful = r.safety >= 75;
  const trusted = r.reliability >= 85;
  const network = r.ecosystem >= 40;
  switch (company.id) {
    case "deepseek": return {
      endingId: careful ? "research-commons" : "open-research-trials",
      title: careful ? "公共研究的黎明" : "开放研究试验区",
      decision: careful ? "将 AGI 纳入开放科研基础设施" : "先开放研究使用，再逐步扩大部署",
      reason: `延续开放研究路线；安全 ${r.safety}${careful ? "，足以选择更广泛的公共服务" : "，尚未达到充分对齐的 75，选择分阶段试用"}。`,
      consequences: ["高校与小型实验室可按开放许可延续研究，医疗和教育项目获得新的基础工具。", careful ? "公共评测与社区修订共同决定下一轮部署。" : "高风险部署仍需复核；科研成果向社会普及需要更长时间。"],
      tradeoff: "知识传播加快，但维护公共模型需要持续投入，领先技术也更容易被同行复用。",
    };
    case "anthropic": return {
      endingId: r.defense >= 2 ? "guarded-intelligence" : "audited-enterprise",
      title: r.defense >= 2 ? "灯塔准入协议" : "受审计的智能时代",
      decision: r.defense >= 2 ? "以严格准入和企业授权提供 AGI" : "通过审核后的企业合同部署 AGI",
      reason: `企业工具路线与闭源政策保持一致；当前防线 ${r.defense}${r.defense >= 2 ? "，沿用已有访问限制" : "，以合同审核为主，不宣称已经封锁采样"}。`,
      consequences: ["企业将关键流程交给受审计的智能服务，模型调用受到合同与权限约束。", "不符合准入条件的团队必须寻找替代供应商；规则解释权集中在运营方。"],
      tradeoff: "责任边界更清楚，获取智能的机会却取决于谁能通过审核。",
    };
    case "openai": return {
      endingId: r.product >= 70 && r.reputation >= 35 ? "subscription-empire" : "subscription-rollout",
      title: r.product >= 70 && r.reputation >= 35 ? "智能订阅帝国" : "智能服务公测季",
      decision: "把 AGI 纳入分级订阅与开发者服务",
      reason: `闭源产品路线；已发布能力 ${r.product}、信誉 ${r.reputation}${r.product >= 70 && r.reputation >= 35 ? "，已有产品和口碑支持扩大订阅" : "，市场积累仍有限，选择先试运行"}。`,
      consequences: ["个人与企业通过订阅获取智能劳动力，复杂开发任务成为按额度购买的服务。", "套餐、排队和调用价格影响谁能享受最多生产力红利。"],
      tradeoff: "使用门槛降低，社会对单一平台的定价和服务连续性也更加依赖。",
    };
    case "xai": return {
      endingId: r.video >= 40 ? "synthetic-social-world" : "live-intelligence-network",
      title: r.video >= 40 ? "全民幻想频道" : "永不下线的广场",
      decision: r.video >= 40 ? "将 AGI 接入实时生成的创意社交世界" : "先把 AGI 变成全天候的互动内容服务",
      reason: `创意与话题路线；视频 ${r.video}${r.video >= 40 ? "，已有音画能力支持沉浸内容" : "，暂不承诺成熟的沉浸影像"}，安全 ${r.safety}。`,
      consequences: ["每个人都能得到持续回应的角色与内容，公共讨论和娱乐体验被重新塑造。", careful ? "较高安全余量支持审核和内容标识，但真假辨识仍需社会适应。" : "安全仅通过启动验证，平台选择逐步放开内容能力，审核与真假辨识成为长期成本。"],
      tradeoff: "表达和创作更容易，注意力竞争与内容治理的压力也同步扩大。",
    };
    case "zai": return {
      endingId: trusted ? "verified-delivery" : "staged-delivery",
      title: trusted ? "交付标准时代" : "分批兑现的未来",
      decision: trusted ? "以可验证的交付标准推广 AGI" : "把 AGI 按验收里程碑分批交付",
      reason: `后训练与交付路线；可靠性 ${r.reliability}${trusted ? "，达到严格交付标准 85" : "，通过启动要求但未达严格交付标准 85"}。`,
      consequences: ["企业采购从追逐发布会转向检查真实任务表现，合同围绕验收结果付款。", trusted ? "已有可靠性交付支持更大规模的行业升级。" : "首批用户进入受控试点，后续推广取决于持续修复与验收。"],
      tradeoff: "技术红利更可核验，但推广速度受限于测试、客户验收和维护能力。",
    };
    case "minimax": return {
      endingId: r.video >= 50 ? "generative-cinema" : "creative-apprenticeship",
      title: r.video >= 50 ? "人人都是制片厂" : "创意工坊新纪元",
      decision: r.video >= 50 ? "将 AGI 投入音画生产与个人制片工具" : "先推广创意助手，再补齐成熟音画生产",
      reason: `创意路线；视频 ${r.video}${r.video >= 50 ? "，支持把音画生产作为主要落地场景" : "，未达成熟音画工具线 50，选择先辅助创作"}。开放政策适用于语言模型许可，不等于视频权重已经开放。`,
      consequences: [r.video >= 50 ? "小团队可以制作过去需要大型工作室的作品，影像生产成本显著下降。" : "小团队先获得脚本、分镜与制作协调助手，完整影像能力继续迭代。", "创作者转向审美、选题与授权管理；既有制作岗位需要重新分工。"],
      tradeoff: "创作门槛降低，版权授权与真实影像的信任机制需要一起建设。",
    };
    case "google": return {
      endingId: r.video >= 30 ? "multimodal-utility" : "compute-utility",
      title: r.video >= 30 ? "万物协作的云端" : "智能基础设施时代",
      decision: r.video >= 30 ? "把 AGI 接入云端多模态基础设施" : "先将 AGI 作为云端计算公共服务",
      reason: `算力研究路线；算力 ${r.compute}、视频 ${r.video}${r.video >= 30 ? "，已有跨模态积累" : "，影像积累有限，优先提供通用计算服务"}。`,
      consequences: ["科研机构和企业以云服务调用复杂智能任务，计算、工具与数据处理成为统一服务。", "算力供给和接入标准逐渐成为关键基础设施的治理议题。"],
      tradeoff: "基础服务更易获得，运行成本与控制权仍集中在大型云端运营方。",
    };
    case "qwen": return {
      endingId: network ? "modular-commons" : "open-toolkit",
      title: network ? "智能积木共同体" : "开放工具箱计划",
      decision: network ? "沿现有生态分发模块化 AGI 工具" : "先公开模块与接口，培育下游生态",
      reason: `开放生态路线；生态 ${r.ecosystem}${network ? "，已有足够下游网络承接模块" : "，尚未形成广泛网络，需要从工具建设开始"}。`,
      consequences: ["开发者能组合面向不同任务的智能模块，小型产品也有机会接入前沿能力。", network ? "下游部署推动行业标准竞争，生态中的改进持续反馈上游。" : "先行开发者承担适配工作，技术普及依赖后续社区投入。"],
      tradeoff: "供应商依赖降低，但模块兼容、版本碎片与安全维护成本由整个生态分担。",
    };
    case "kimi": return {
      endingId: trusted ? "delegated-work" : "supervised-agents",
      title: trusted ? "长程代理社会" : "人类监工协议",
      decision: trusted ? "让 AGI 代理承接完整的长程任务" : "让 AGI 代理在关键节点等待人类确认",
      reason: `长程工具路线；可靠性 ${r.reliability}${trusted ? "，足以选择更多端到端委托" : "，还需用人类确认约束长任务的累积误差"}。`,
      consequences: ["人类更多负责提出目标、判断结果，代理负责读资料、调用工具和推进工作。", trusted ? "组织从分派小步骤转向管理目标、权限与责任。" : "复杂工作获得辅助，但涉及付款、发布等关键步骤仍需负责人确认。"],
      tradeoff: "重复劳动减少，目标设定、权限控制与长期任务审计成为新的核心技能。",
    };
    case "meta": return {
      endingId: network ? "licensed-federation" : "licensed-seed",
      title: network ? "社区智能联邦" : "权重播种计划",
      decision: network ? "依许可让下游社区各自部署 AGI" : "以开放权重启动本地部署伙伴计划",
      reason: `社区许可路线；生态 ${r.ecosystem}${network ? "，支持多方运营的分布式部署" : "，下游规模还小，先培育部署能力"}。`,
      consequences: ["本地服务可以按地区和行业需要修改模型，更多组织获得自主运行智能的机会。", "运营者各自承担更新与治理责任，公共能力不再只由一家服务商提供。"],
      tradeoff: "控制权分散，许可证边界、维护质量与跨部署治理也更难保持一致。",
    };
    case "router": return {
      endingId: network ? "intelligence-exchange" : "intelligence-gateway",
      title: network ? "智能交换所" : "智能总调度台",
      decision: network ? "将自研 AGI 与伙伴服务纳入统一调度市场" : "先以自研 AGI 提供可回退的统一入口",
      reason: `调度生态路线；自研能力 ${r.capability} 已通过启动验证，生态 ${r.ecosystem}${network ? "，可承接伙伴市场" : "，仍需建立更广的伙伴网络"}。外部模型调用没有替代自研门槛。`,
      consequences: ["用户按任务和价格选择智能服务，平台负责切换、回退与交付协调。", "模型供应商竞争效率与质量，入口方掌握新的议价权；训练数据仍需分别获得许可。"],
      tradeoff: "切换供应商更方便，流量分配和数据授权规则却更加依赖调度平台。",
    };
    default: {
      const exhaustive: never = company.id;
      return exhaustive;
    }
  }
}

/** Freeze the winner's real launch metrics; later accounting must not rewrite this decision. */
export function selectAiRivalEnding(r: AiRival, turn: number): AiEnding {
  const company = aiCompany(r.company);
  const choice = chooseWorld(r);
  const { capability, compute, reliability, safety, video, ecosystem, product, defense, reputation } = r;
  const { title, ...details } = choice;
  const rivalOutcome: AiRivalOutcome = {
    ...details,
    winnerId: r.company,
    turn,
    metrics: { capability, compute, reliability, safety, video, ecosystem, product, defense, reputation, open: company.open },
  };
  return {
    title,
    text: `${company.name}在第 ${turn} 季率先启动 AGI，选择「${choice.decision}」。${choice.consequences.join("")} ${choice.tradeoff} 你的公司未能抢先，这个世界由对手的路线塑造。`,
    won: false,
    rivalOutcome,
  };
}
