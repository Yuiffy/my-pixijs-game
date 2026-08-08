import modelJson from "./goCombatModel.json";
import type { AugmentId, StarterId, UnitId } from "../core/gameData";

type Vector = number[];
type Matrix = number[][];

type GoModelData = {
  schema: "go-combat-ranker-v1";
  vocab: {
    units: string[];
    starters: string[];
    waveTags: string[];
    augments: string[];
  };
  normalization: {
    modifierMean: number;
    modifierStd: number;
  };
  metrics: unknown;
  verification: Array<GoCombatEvaluation & {
    combatScore: number;
    modelScore: number;
  }>;
  state: Record<string, Vector | Matrix>;
};

const MODEL = modelJson as GoModelData;

export type GoCombatToken = {
  id: UnitId;
  star: 1 | 2 | 3;
  position: number;
};

export type GoCombatEvaluation = {
  starter: StarterId | null;
  augments: readonly AugmentId[];
  waveTag: string;
  modifier: number;
  players: readonly GoCombatToken[];
  enemies: readonly GoCombatToken[];
};

const indexOf = (values: readonly string[]) => new Map(
  values.map((value, index) => [value, index]),
);

const UNIT_INDEX = indexOf(MODEL.vocab.units);
const STARTER_INDEX = indexOf(MODEL.vocab.starters);
const TAG_INDEX = indexOf(MODEL.vocab.waveTags);
const AUGMENT_INDEX = indexOf(MODEL.vocab.augments);

const matrix = (name: string) => MODEL.state[name] as Matrix;
const vector = (name: string) => MODEL.state[name] as Vector;
const unitFeatures = matrix("unit_features");
const unitEmbedding = matrix("unit_embedding.weight");
const starEmbedding = matrix("star_embedding.weight");
const playerPositionEmbedding = matrix("player_position_embedding.weight");
const enemyPositionEmbedding = matrix("enemy_position_embedding.weight");
const starterEmbedding = matrix("starter_embedding.weight");
const tagEmbedding = matrix("tag_embedding.weight");

const add = (...vectors: readonly Vector[]) => vectors[0].map(
  (_, index) => vectors.reduce((sum, values) => sum + values[index], 0),
);

const linear = (input: Vector, weight: Matrix, bias?: Vector) => weight.map(
  (row, output) => row.reduce(
    (sum, value, inputIndex) => sum + value * input[inputIndex],
    bias?.[output] || 0,
  ),
);

const relu = (values: Vector) => values.map((value) => Math.max(0, value));

const denseRelu = (input: Vector, prefix: string) => relu(linear(
  input,
  matrix(`${prefix}.weight`),
  vector(`${prefix}.bias`),
));

const baseUnitEmbedding = MODEL.vocab.units.map((_, unitIndex) => add(
  unitEmbedding[unitIndex],
  linear(unitFeatures[unitIndex], matrix("unit_feature_projection.weight")),
));

const tokenCache = new Map<string, Vector>();
const encodeToken = (token: GoCombatToken, team: "player" | "enemy") => {
  const unitIndex = UNIT_INDEX.get(token.id) || 0;
  const positions = team === "player" ? playerPositionEmbedding : enemyPositionEmbedding;
  const position = Math.max(0, Math.min(positions.length - 1, Math.floor(token.position)));
  const key = `${team}/${unitIndex}/${token.star}/${position}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const encoded = denseRelu(
    add(
      baseUnitEmbedding[unitIndex],
      starEmbedding[token.star],
      positions[position],
    ),
    team === "player" ? "player_token.0" : "enemy_token.0",
  );
  tokenCache.set(key, encoded);
  return encoded;
};

const pool = (tokens: readonly Vector[]) => {
  const width = matrix("player_token.0.weight").length;
  if (tokens.length === 0) {
    return { total: Array(width).fill(0), maximum: Array(width).fill(0) };
  }
  const total = Array(width).fill(0) as Vector;
  const maximum = Array(width).fill(Number.NEGATIVE_INFINITY) as Vector;
  tokens.forEach((token) => token.forEach((value, index) => {
    total[index] += value;
    maximum[index] = Math.max(maximum[index], value);
  }));
  return { total, maximum };
};

export const scoreGoCombatCandidate = (evaluation: GoCombatEvaluation) => {
  const players = pool(evaluation.players.map((token) => encodeToken(token, "player")));
  const enemies = pool(evaluation.enemies.map((token) => encodeToken(token, "enemy")));
  const starterIndex = STARTER_INDEX.get(evaluation.starter || "") || 0;
  const tagIndex = TAG_INDEX.get(evaluation.waveTag) || 0;
  const augmentVector = Array(MODEL.vocab.augments.length).fill(0) as Vector;
  evaluation.augments.forEach((augment) => {
    const augmentIndex = AUGMENT_INDEX.get(augment);
    if (augmentIndex !== undefined) augmentVector[augmentIndex] = 1;
  });
  const augmentEmbedding = denseRelu(augmentVector, "augment_projection.0");
  const difference = players.total.map(
    (value, index) => Math.abs(value - enemies.total[index]),
  );
  const interaction = players.total.map(
    (value, index) => value * enemies.total[index],
  );
  const features = [
    ...players.total,
    ...players.maximum,
    ...enemies.total,
    ...enemies.maximum,
    ...difference,
    ...interaction,
    ...starterEmbedding[starterIndex],
    ...tagEmbedding[tagIndex],
    ...augmentEmbedding,
    (evaluation.modifier - MODEL.normalization.modifierMean)
      / MODEL.normalization.modifierStd,
    evaluation.players.length / 10,
    evaluation.enemies.length / 20,
  ];
  const hidden = denseRelu(features, "head.0");
  const narrowed = denseRelu(hidden, "head.2");
  return linear(narrowed, matrix("head.4.weight"), vector("head.4.bias"))[0];
};

export const GO_COMBAT_MODEL_SCHEMA = MODEL.schema;
export const GO_COMBAT_MODEL_METRICS = MODEL.metrics;
export const GO_COMBAT_MODEL_VERIFICATION = MODEL.verification;
