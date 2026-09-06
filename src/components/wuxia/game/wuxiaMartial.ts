import type { NovelState } from "./novelEngine";
import type { MartialTechnique, NarrativeArchitecture, SceneManuscript } from "./storyArchitecture";
import type { AuthoredTechnique, AuthoredTechniqueBranch } from "./wuxiaCampaign";
import type { WuxiaCombatResult } from "./wuxiaCombat";
import type { ActorTechnique, WuxiaWorldState } from "./worldSimulation";

export const AUTHORED_TECHNIQUE_BRANCHES: AuthoredTechniqueBranch[] = ["break", "guard", "flow"];
export const AUTHORED_REFINEMENT_GAIN = 12;
export const AUTHORED_TECHNIQUE_DETAILS = {
  break: { name: "截流一式", nature: "破" as const, description: "舍去繁复变化，只在对手换气未成时截断来势，使强招无从续接。", tags: ["破招", "截气"] },
  guard: { name: "同路回锋", nature: "守" as const, description: "不追敌锋，只在来势越过身侧时回转半步，替同行之人留出退路。", tags: ["护持", "回锋"] },
  flow: { name: "行云换影", nature: "身" as const, description: "不拘固定三步，把地形、人群与呼吸都化成下一次换位的落点。", tags: ["换位", "行旅"] },
};

const authoredBranch = (entry: { id: string; name: string; branch?: AuthoredTechniqueBranch }) => (
  entry.branch || AUTHORED_TECHNIQUE_BRANCHES.find((branch) => (
    entry.name === AUTHORED_TECHNIQUE_DETAILS[branch].name
    && entry.id.startsWith("authored_")
    && new RegExp(`_${branch}(?:_\\d+)?$`).test(entry.id)
  ))
);

export const findAuthoredTechnique = (state: NovelState, branch: AuthoredTechniqueBranch) => (
  state.campaign.legacy.authoredTechniques.find((entry) => authoredBranch(entry) === branch)
);

export const authoredMastery = (state: NovelState, techniqueId: string) => (
  state.world.actors.find((actor) => actor.id === "hero")?.techniques.find((entry) => entry.techniqueId === techniqueId)?.mastery || 0
);

export const inventionUnavailableReason = (state: NovelState, branch: AuthoredTechniqueBranch): string | undefined => {
  const existing = findAuthoredTechnique(state, branch);
  if (existing) return authoredMastery(state, existing.id) >= 100 ? "此式已臻圆熟" : undefined;
  const rules = state.content.rules.inventTechnique;
  const missing = [
    state.narrative.martial.mastery < rules.martialMastery ? "本门火候尚浅" : "",
    state.campaign.legacy.martialInsights < rules.martialInsights ? `还需${rules.martialInsights - state.campaign.legacy.martialInsights}段武学领悟` : "",
    state.hero.stats.fame < rules.fame ? "名望尚不足以请人见证" : "",
  ].filter(Boolean);
  return missing.length ? missing.join("，") : undefined;
};

export const syncHeroMartialNarrative = (
  narrative: NarrativeArchitecture,
  world: WuxiaWorldState,
  turn: number,
): NarrativeArchitecture => {
  if (narrative.mode !== "emergent_sandbox") return narrative;
  const techniques = new Map(narrative.martial.techniques.map((entry) => [entry.id, entry]));
  world.actors.find((actor) => actor.id === "hero")?.techniques.forEach((known) => {
    const definition = world.techniques.find((entry) => entry.id === known.techniqueId);
    if (!definition) return;
    const previous = techniques.get(known.techniqueId);
    techniques.set(known.techniqueId, {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      ...previous,
      mastery: known.mastery,
      status: known.mastery >= 75 ? "大成" : previous?.status === "已会" ? "已会" : "初悟",
      ...(previous ? {} : { unlockedTurn: turn }),
    });
  });
  return { ...narrative, martial: { ...narrative.martial, techniques: Array.from(techniques.values()) } };
};

export const normalizeAuthoredTechniques = (state: NovelState): NovelState => {
  const canonicalIds = new Map<string, string>();
  const aliases = new Map<string, string>();
  // Art IDs belong to a specific author, so names shared by different lives stay distinct.
  state.world.techniques.forEach((entry) => {
    const branch = authoredBranch(entry);
    if (!branch || !entry.tags.includes("自创")) return;
    const key = `${entry.artId}:${branch}`;
    const canonical = canonicalIds.get(key);
    if (canonical && canonical !== entry.id) aliases.set(entry.id, canonical);
    else canonicalIds.set(key, entry.id);
  });
  if (!aliases.size) return state;

  const remap = (id: string) => aliases.get(id) || id;
  const remapIds = (ids: string[]) => Array.from(new Set(ids.map(remap)));
  const remapChoiceId = (id: string) => {
    if (!id.startsWith("campaign-train:")) return id;
    const parts = id.split(":");
    parts[1] = remap(parts[1]);
    return parts.join(":");
  };
  const mergeKnown = (entries: ActorTechnique[]) => {
    const merged = new Map<string, ActorTechnique>();
    entries.forEach((entry) => {
      const id = remap(entry.techniqueId);
      const previous = merged.get(id);
      merged.set(id, previous
        ? { ...previous, mastery: Math.min(100, Math.max(previous.mastery, entry.mastery)), learnedDay: Math.min(previous.learnedDay, entry.learnedDay) }
        : { ...entry, techniqueId: id });
    });
    return Array.from(merged.values());
  };
  const remapCombat = (combat: WuxiaCombatResult): WuxiaCombatResult => ({
    ...combat,
    techniqueIds: remapIds(combat.techniqueIds),
    hero: { ...combat.hero, techniquesUsed: remapIds(combat.hero.techniquesUsed) },
    enemy: { ...combat.enemy, techniquesUsed: remapIds(combat.enemy.techniquesUsed) },
    exchanges: combat.exchanges.map((entry) => ({ ...entry, ...(entry.techniqueId ? { techniqueId: remap(entry.techniqueId) } : {}) })),
  });
  const remapScene = (scene: SceneManuscript): SceneManuscript => ({
    ...scene,
    techniqueIds: remapIds(scene.techniqueIds),
    ...(scene.combat ? { combat: remapCombat(scene.combat) } : {}),
  });
  const authored = new Map<string, AuthoredTechnique>();
  state.campaign.legacy.authoredTechniques.forEach((entry) => {
    const id = remap(entry.id);
    const previous = authored.get(id);
    authored.set(id, {
      ...entry,
      ...previous,
      id,
      createdTurn: Math.min(previous?.createdTurn ?? entry.createdTurn, entry.createdTurn),
      inspirationTechniqueIds: remapIds([...(previous?.inspirationTechniqueIds || []), ...entry.inspirationTechniqueIds]).filter((sourceId) => sourceId !== id),
    });
  });
  const narrativeTechniques = new Map<string, MartialTechnique>();
  state.narrative.martial.techniques.forEach((entry) => {
    const id = remap(entry.id);
    const previous = narrativeTechniques.get(id);
    narrativeTechniques.set(id, previous
      ? { ...previous, mastery: Math.min(100, Math.max(previous.mastery, entry.mastery)) }
      : { ...entry, id });
  });
  const world: WuxiaWorldState = {
    ...state.world,
    techniques: state.world.techniques.filter((entry) => !aliases.has(entry.id)),
    martialArts: state.world.martialArts.map((art) => ({ ...art, techniqueIds: remapIds(art.techniqueIds) })),
    manuals: state.world.manuals.map((manual) => ({ ...manual, techniqueIds: remapIds(manual.techniqueIds) })),
    actors: state.world.actors.map((actor) => ({
      ...actor,
      techniques: mergeKnown(actor.techniques).map((entry) => (
        actor.id === "hero" && authored.has(entry.techniqueId)
          ? { ...entry, mastery: Math.min(100, Math.max(entry.mastery, narrativeTechniques.get(entry.techniqueId)?.mastery || 0)) }
          : entry
      )),
    })),
  };
  const { foundedSect } = state.campaign.legacy;
  return {
    ...state,
    world,
    campaign: {
      ...state.campaign,
      factionKnowledge: Object.fromEntries(Object.entries(state.campaign.factionKnowledge).map(([id, knowledge]) => [id, {
        ...knowledge,
        recognizedTechniqueIds: remapIds(knowledge.recognizedTechniqueIds),
        ...(knowledge.encounters ? { encounters: knowledge.encounters.map((entry) => ({ ...entry, techniqueIds: remapIds(entry.techniqueIds) })) } : {}),
      }])),
      legacy: {
        ...state.campaign.legacy,
        authoredTechniques: Array.from(authored.values()),
        ...(foundedSect ? { foundedSect: { ...foundedSect, founderTechniqueId: remap(foundedSect.founderTechniqueId) } } : {}),
      },
    },
    narrative: syncHeroMartialNarrative({
      ...state.narrative,
      martial: { ...state.narrative.martial, signatureTechniqueId: remap(state.narrative.martial.signatureTechniqueId), techniques: Array.from(narrativeTechniques.values()) },
      chapters: state.narrative.chapters.map((chapter) => ({ ...chapter, scenes: chapter.scenes.map(remapScene) })),
    }, world, state.turn),
    currentEvent: state.currentEvent ? {
      ...state.currentEvent,
      choices: state.currentEvent.choices.map((entry) => ({ ...entry, id: remapChoiceId(entry.id) })),
    } : null,
    ...(state.pendingOutcome ? {
      pendingOutcome: {
        ...state.pendingOutcome,
        choiceId: remapChoiceId(state.pendingOutcome.choiceId),
        scene: remapScene(state.pendingOutcome.scene),
        ...(state.pendingOutcome.combat ? { combat: remapCombat(state.pendingOutcome.combat) } : {}),
      },
    } : {}),
  };
};
