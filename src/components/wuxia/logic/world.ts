import type { Appearance, LocationInfo, Person, Personality, Sect } from "./types";
import {
  CITY_PREFIXES,
  CITY_SUFFIXES,
  FEMALE_FIRST_NAMES,
  LAST_NAMES,
  MALE_FIRST_NAMES,
  SECTS_DATA,
  WILD_PREFIXES,
  WILD_SUFFIXES,
} from "./constants";

export const rand = <T>(arr: T[]): T => {
  if (!arr || arr.length === 0) return {} as T;
  return arr[Math.floor(Math.random() * arr.length)];
};

export const genName = (gender: 'male' | 'female') => {
  const firstNames = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  return `${rand(LAST_NAMES)}${rand(firstNames)}`;
};

export const genCityName = () => `${rand(CITY_PREFIXES)}${rand(CITY_SUFFIXES)}城`;
export const genWildName = () => `${rand(WILD_PREFIXES)}${rand(WILD_SUFFIXES)}`;
// 生成性格
export const genPersonality = (): Personality => rand(['gentle', 'bold', 'cunning', 'righteous', 'mysterious', 'playful', 'serious', 'passionate'] as Personality[]);

// 生成外表
export const genAppearance = (gender: 'male' | 'female', role: Person['role']): Appearance => {
  const maleFaces = ['剑眉星目', '浓眉大眼', '面如冠玉', '英气逼人', '棱角分明', '温润如玉'];
  const femaleFaces = ['眉目如画', '清丽脱俗', '明眸皓齿', '娇美动人', '英姿飒爽', '温婉可人'];
  const maleBuilds = ['身材魁梧', '身形修长', '体态匀称', '虎背熊腰', '精悍干练'];
  const femaleBuilds = ['身姿窈窕', '体态轻盈', '身材高挑', '娇小玲珑', '婀娜多姿'];
  const maleClothing = ['一袭青衫', '黑衣劲装', '白衣胜雪', '粗布麻衣', '锦袍华服'];
  const femaleClothing = ['素衣如雪', '红衣如火', '青衣淡雅', '紫衣华贵', '布衣朴素'];

  const weapons = ['长剑', '短刀', '长枪', '双刀', '软鞭', '暗器', '拳套', '棍棒'];

  const face = gender === 'male' ? rand(maleFaces) : rand(femaleFaces);
  const build = gender === 'male' ? rand(maleBuilds) : rand(femaleBuilds);
  const clothing = gender === 'male' ? rand(maleClothing) : rand(femaleClothing);
  const weapon = role === 'bandit' || role === 'hero' ? rand(weapons) : undefined;

  return {
    face, build, clothing, weapon,
  };
};

// 描述角色外表（首次见面）
export const getAgeDescription = (person: Person): string => {
  if (person.age < 20) return '弱冠之年';
  if (person.age < 30) return '风华正茂';
  if (person.age < 40) return '而立之年';
  if (person.age < 50) return '不惑之年';
  if (person.age < 60) return '知天命之年';
  return '花甲之年';
};
// ... (此处省略 genAppearance, getAgeDescription 等函数，直接从原文件移动过来)

export const initSectRelations = (sects: Sect[]): void => {
  sects.forEach((s1: Sect) => {
    // Ensure relations object exists
    const relations: { [key: string]: number } = s1.relations || {};
    s1.relations = relations;

    sects.forEach((s2: Sect) => {
      if (s1.id === s2.id) return;

      let baseValue = 0;
      if (s1.type !== s2.type) {
        // 正邪不两立
        baseValue = -60 - Math.floor(Math.random() * 40); // -60 ~ -100 for enemies
      } else {
        // 同为正派或邪派，关系较好但可能有竞争
        baseValue = 10 + Math.floor(Math.random() * 40); // 10 ~ 50 for allies
      }

      relations[s2.id] = baseValue;
    });
  });
};

// 🆕 地理系统：生成复杂的世界地图
export const generateWorldMap = (): LocationInfo[] => {
  const locations: LocationInfo[] = [];

  // 生成多个城市
  const cities: LocationInfo[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cityId = `city_${i}`;
    const city: LocationInfo = {
      id: cityId,
      name: genCityName(),
      type: 'city',
      x: i * 200 + 100,
      y: 300,
      connections: [],
    };
    cities.push(city);
    locations.push(city);

    // 每个城市有客栈和官府
    const inn: LocationInfo = {
      id: `${cityId}_inn`,
      name: `${city.name}·悦来客栈`,
      type: 'inn',
      parentId: cityId,
      connections: [],
    };
    const government: LocationInfo = {
      id: `${cityId}_government`,
      name: `${city.name}·官府`,
      type: 'government',
      parentId: cityId,
      connections: [],
    };
    locations.push(inn, government);
  }

  // 生成村庄
  const villages: LocationInfo[] = [];
  for (let i = 0; i < 2; i += 1) {
    const villageId = `village_${i}`;
    const village: LocationInfo = {
      id: villageId,
      name: `${rand(['小', '大', '古', '新'])}${rand(['村', '庄', '镇'])}`,
      type: 'village',
      x: i * 250 + 150,
      y: 200,
      connections: [],
    };
    villages.push(village);
    locations.push(village);
  }

  // 生成多个门派
  const sects: LocationInfo[] = [];
  SECTS_DATA.forEach((sectData, idx) => {
    const sect: LocationInfo = {
      id: sectData.locationId,
      name: `${sectData.name}驻地`,
      type: 'sect',
      x: (idx % 3) * 200 + 50,
      y: 50 + Math.floor(idx / 3) * 150,
      connections: [],
    };
    sects.push(sect);
    locations.push(sect);
  });

  // 生成野外区域（连接各个地点）
  const wilds: LocationInfo[] = [];
  for (let i = 0; i < 5; i += 1) {
    const wildId = `wild_${i}`;
    const wild: LocationInfo = {
      id: wildId,
      name: genWildName(),
      type: 'wild',
      x: 100 + (i % 3) * 200,
      y: 100 + Math.floor(i / 3) * 200,
      connections: [],
    };
    wilds.push(wild);
    locations.push(wild);
  }

  // 🆕 建立连接关系（图结构）
  // 城市之间通过野外连接
  cities.forEach((city, idx) => {
    if (idx < cities.length - 1) {
      const nextCity = cities[idx + 1];
      const wildBetween = wilds[idx % wilds.length];
      if (city.connections) city.connections.push(wildBetween.id);
      if (wildBetween.connections) {
        wildBetween.connections.push(city.id);
        wildBetween.connections.push(nextCity.id);
      }
      if (nextCity.connections) nextCity.connections.push(wildBetween.id);
    }
  });

  // 村庄连接到最近的野外
  villages.forEach((village, idx) => {
    const nearestWild = wilds[idx % wilds.length];
    if (village.connections) village.connections.push(nearestWild.id);
    if (nearestWild.connections) nearestWild.connections.push(village.id);
  });

  // 门派连接到最近的野外
  sects.forEach((sect, idx) => {
    const nearestWild = wilds[idx % wilds.length];
    if (sect.connections) sect.connections.push(nearestWild.id);
    if (nearestWild.connections) nearestWild.connections.push(sect.id);
  });

  // 城市内的地点连接到城市
  locations.forEach((loc) => {
    if (loc.parentId) {
      const parent = locations.find((l) => l.id === loc.parentId);
      if (parent) {
        // 创建副本避免修改参数
        const locIndex = locations.indexOf(loc);
        const parentIndex = locations.indexOf(parent);

        if (locIndex >= 0) {
          locations[locIndex] = { ...locations[locIndex], connections: [parent.id] };
        }
        if (parentIndex >= 0 && !parent.connections) {
          locations[parentIndex] = { ...locations[parentIndex], connections: [] };
        }
        if (parentIndex >= 0 && !locations[parentIndex].connections?.includes(loc.id)) {
          locations[parentIndex] = {
            ...locations[parentIndex],
            connections: [...(locations[parentIndex].connections || []), loc.id],
          };
        }
      }
    }
  });

  return locations;
};

// ... 其他辅助函数如 findPath, getReachableLocations, describeAppearance 等
// 🆕 路径查找：找到从A到B的路径
export const findPath = (fromId: string, toId: string, locations: LocationInfo[]): string[] => {
  if (fromId === toId) return [];

  const visited = new Set<string>();
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === toId) {
      return current.path;
    }

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const location = locations.find((l) => l.id === current.id);
    if (!location || !location.connections) continue;

    location.connections.forEach((nextId) => {
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, path: [...current.path, nextId] });
      }
    });
  }

  return []; // 无法到达
};

// 🆕 获取可到达的地点列表
export const getReachableLocations = (currentId: string, locations: LocationInfo[]): LocationInfo[] => {
  const current = locations.find((l) => l.id === currentId);
  if (!current || !current.connections) return [];

  return current.connections
    .map((id) => locations.find((l) => l.id === id))
    .filter((loc): loc is LocationInfo => loc !== undefined);
};

export const LOCATION_TEMPLATES: LocationInfo[] = [
  { id: 'loc_sect_main', name: '门派驻地', type: 'sect' },
  { id: 'loc_city', name: '随机城市', type: 'city' },
  { id: 'loc_wild', name: '随机险地', type: 'wild' },
];
