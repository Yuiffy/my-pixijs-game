import modelJson from "./goCombatModel.json";
import type { AugmentId, StarterId, UnitId } from "../core/gameData";

type Vector = Float64Array;
type Matrix = Float64Array[];
type JsonVector = number[];
type JsonMatrix = number[][];

export type GoModelData = {
  schema: "go-combat-ranker-v2";
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
  state: Record<string, JsonVector | JsonMatrix>;
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

export type GoCombatScorer = (evaluation: GoCombatEvaluation) => number;

const indexOf = (values: readonly string[]) => new Map(
  values.map((value, index) => [value, index]),
);

const add = (...vectors: readonly Vector[]) => {
  const result = new Float64Array(vectors[0].length);
  for (let vectorIndex = 0; vectorIndex < vectors.length; vectorIndex += 1) {
    const values = vectors[vectorIndex];
    for (let index = 0; index < result.length; index += 1) {
      result[index] += values[index];
    }
  }
  return result;
};

const linear = (input: Vector, weight: Matrix, bias?: Vector) => {
  const result = new Float64Array(weight.length);
  for (let output = 0; output < weight.length; output += 1) {
    const row = weight[output];
    let sum = bias?.[output] || 0;
    for (let inputIndex = 0; inputIndex < row.length; inputIndex += 1) {
      sum += row[inputIndex] * input[inputIndex];
    }
    result[output] = sum;
  }
  return result;
};

const relu = (values: Vector) => {
  for (let index = 0; index < values.length; index += 1) {
    values[index] = Math.max(0, values[index]);
  }
  return values;
};

export const createGoCombatScorer = (model: GoModelData): GoCombatScorer => {
  if (model.schema !== "go-combat-ranker-v2") {
    throw new Error(`Unsupported Go combat model schema: ${model.schema}`);
  }
  const unitIndex = indexOf(model.vocab.units);
  const starterIndex = indexOf(model.vocab.starters);
  const tagIndex = indexOf(model.vocab.waveTags);
  const augmentIndex = indexOf(model.vocab.augments);
  const matrixCache = new Map<string, Matrix>();
  const vectorCache = new Map<string, Vector>();
  const matrix = (name: string) => {
    const cached = matrixCache.get(name);
    if (cached) return cached;
    const value = (model.state[name] as JsonMatrix).map((row) => Float64Array.from(row));
    matrixCache.set(name, value);
    return value;
  };
  const vector = (name: string) => {
    const cached = vectorCache.get(name);
    if (cached) return cached;
    const value = Float64Array.from(model.state[name] as JsonVector);
    vectorCache.set(name, value);
    return value;
  };
  const denseRelu = (input: Vector, prefix: string) => relu(linear(
    input,
    matrix(`${prefix}.weight`),
    vector(`${prefix}.bias`),
  ));
  const unitFeatures = matrix("unit_features");
  const unitEmbedding = matrix("unit_embedding.weight");
  const starEmbedding = matrix("star_embedding.weight");
  const playerPositionEmbedding = matrix("player_position_embedding.weight");
  const enemyPositionEmbedding = matrix("enemy_position_embedding.weight");
  const starterEmbedding = matrix("starter_embedding.weight");
  const tagEmbedding = matrix("tag_embedding.weight");
  const baseUnitEmbedding = model.vocab.units.map((_, index) => add(
    unitEmbedding[index],
    linear(unitFeatures[index], matrix("unit_feature_projection.weight")),
  ));
  const tokenCache = new Map<string, Vector>();
  const encodeToken = (token: GoCombatToken, team: "player" | "enemy") => {
    const tokenUnitIndex = unitIndex.get(token.id) || 0;
    const positions = team === "player" ? playerPositionEmbedding : enemyPositionEmbedding;
    const position = Math.max(0, Math.min(positions.length - 1, Math.floor(token.position)));
    const key = `${team}/${tokenUnitIndex}/${token.star}/${position}`;
    const cached = tokenCache.get(key);
    if (cached) return cached;
    const encoded = denseRelu(
      add(
        baseUnitEmbedding[tokenUnitIndex],
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
      return { total: new Float64Array(width), maximum: new Float64Array(width) };
    }
    const total = new Float64Array(width);
    const maximum = new Float64Array(width);
    maximum.fill(Number.NEGATIVE_INFINITY);
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      for (let index = 0; index < token.length; index += 1) {
        total[index] += token[index];
        maximum[index] = Math.max(maximum[index], token[index]);
      }
    }
    return { total, maximum };
  };

  const enemyPoolCache = new Map<string, ReturnType<typeof pool>>();
  const augmentEmbeddingCache = new Map<string, Vector>();

  return (evaluation: GoCombatEvaluation) => {
    const players = pool(evaluation.players.map((token) => encodeToken(token, "player")));
    const enemyKey = evaluation.enemies
      .map(({ id, star, position }) => `${id}:${star}:${position}`)
      .join("|");
    let enemies = enemyPoolCache.get(enemyKey);
    if (!enemies) {
      enemies = pool(evaluation.enemies.map((token) => encodeToken(token, "enemy")));
      enemyPoolCache.set(enemyKey, enemies);
    }
    const starter = starterIndex.get(evaluation.starter || "") || 0;
    const tag = tagIndex.get(evaluation.waveTag) || 0;
    const augmentKey = [...evaluation.augments].sort().join("|");
    let augmentEmbedding = augmentEmbeddingCache.get(augmentKey);
    if (!augmentEmbedding) {
      const augmentVector = new Float64Array(model.vocab.augments.length);
      evaluation.augments.forEach((augment) => {
        const index = augmentIndex.get(augment);
        if (index !== undefined) augmentVector[index] = 1;
      });
      augmentEmbedding = denseRelu(augmentVector, "augment_projection.0");
      augmentEmbeddingCache.set(augmentKey, augmentEmbedding);
    }
    const features = new Float64Array(matrix("head.0.weight")[0].length);
    let offset = 0;
    const append = (values: Vector) => {
      features.set(values, offset);
      offset += values.length;
    };
    append(players.total);
    append(players.maximum);
    append(enemies.total);
    append(enemies.maximum);
    for (let index = 0; index < players.total.length; index += 1) {
      features[offset + index] = Math.abs(players.total[index] - enemies.total[index]);
    }
    offset += players.total.length;
    for (let index = 0; index < players.total.length; index += 1) {
      features[offset + index] = players.total[index] * enemies.total[index];
    }
    offset += players.total.length;
    append(starterEmbedding[starter]);
    append(tagEmbedding[tag]);
    append(augmentEmbedding);
    features[offset] = (evaluation.modifier - model.normalization.modifierMean)
      / model.normalization.modifierStd;
    features[offset + 1] = evaluation.players.length / 10;
    features[offset + 2] = evaluation.enemies.length / 20;
    const hidden = denseRelu(features, "head.0");
    const narrowed = denseRelu(hidden, "head.2");
    return linear(narrowed, matrix("head.4.weight"), vector("head.4.bias"))[0];
  };
};

export const scoreGoCombatCandidate = createGoCombatScorer(MODEL);

export const GO_COMBAT_MODEL_SCHEMA = MODEL.schema;
export const GO_COMBAT_MODEL_METRICS = MODEL.metrics;
export const GO_COMBAT_MODEL_VERIFICATION = MODEL.verification;
