import type { LocationInfo, Person } from './types';
import { genName, genAppearance } from './world';

export const calculateTravelCost = (
  fromId: string,
  toId: string,
  locations: LocationInfo[]
): { distance: number, roadRisk: number, wildRisk: number } => {
  // 简化处理：如果是相邻节点，距离为 1-3 不等
  // 实际项目中可以用 Dijkstra 算法，这里简化为：只要相连，就有基础距离
  // 如果不相连（长途），我们假设需要跳跃多个节点（这里暂时只允许移动到相邻节点，模拟真实步行）

  const target = locations.find(l => l.id === toId);
  const type = target?.type || 'wild';

  let distance = 3; // 默认3天路程
  if (type === 'city') distance = 5; // 城市间一般较远
  if (type === 'inn' || type === 'government') distance = 0; // 城内移动瞬间到达

  return {
    distance,
    roadRisk: 10, // 官道遇到强盗概率低
    wildRisk: 40 // 山路遇到野兽/强盗概率高
  };
};

export const checkCompanionsDestination = (partyIds: string[], targetLocId: string, world: any): string[] => {
  const leavingNames: string[] = [];
  partyIds.forEach(id => {
    const npc = world.npcs.find((n: any) => n.id === id);
    // 如果NPC有想去的地方，且就是当前目的地，或者随机判定他到站了
    if (npc && (npc.desiredLocationId === targetLocId || (Math.random() < 0.3 && npc.sectId !== 'hero'))) {
      leavingNames.push(npc.name);
    }
  });
  return leavingNames;
};

export const generateNpc = (options: {
  gender?: 'male' | 'female';
  role?: Person['role'];
  sectId?: string;
  locationId?: string;
  age?: number;
  desiredLocationId?: string;
} = {}): Person => {
  const gender = options.gender || (Math.random() > 0.5 ? 'male' : 'female');
  const age = options.age || (20 + Math.floor(Math.random() * 20));

  return {
    id: `npc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: genName(gender),
    sectId: options.sectId || 'none',
    role: options.role || 'hero',
    gender,
    age,
    status: 'alive',
    relations: [],
    locationId: options.locationId || '',
    inventory: [],
    flags: {},
    arts: [],
    knowledge: [],
    appearance: genAppearance(gender, options.role || 'hero'),
    desiredLocationId: options.desiredLocationId
  };
};

export const findRoute = (
  startId: string,
  endId: string,
  locations: LocationInfo[]
): { path: string[]; distances: number[] } | null => {
  // 如果起点和终点相同，直接返回
  if (startId === endId) {
    return { path: [startId], distances: [] };
  }

  // 创建访问记录和路径记录
  const visited = new Set<string>();
  const queue: { id: string; path: string[]; distances: number[] }[] = [
    { id: startId, path: [startId], distances: [] }
  ];

  // 构建邻接表
  const adjacencyList = new Map<string, { id: string, distance: number }[]>();
  locations.forEach(location => {
    if (location.connections) {
      adjacencyList.set(
        location.id,
        location.connections.map(connId => {
          const connectedLoc = locations.find(l => l.id === connId);
          return {
            id: connId,
            // 简化处理：城市间距离为5，其他为3
            distance: connectedLoc?.type === 'city' ? 5 : 3
          };
        })
      );
    } else {
      adjacencyList.set(location.id, []);
    }
  });

  // BFS搜索
  while (queue.length > 0) {
    const current = queue.shift()!;

    // 如果已访问过，跳过
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    // 获取相邻节点
    const neighbors = adjacencyList.get(current.id) || [];

    for (const neighbor of neighbors) {
      // 找到目标节点
      if (neighbor.id === endId) {
        return {
          path: [...current.path, neighbor.id],
          distances: [...current.distances, neighbor.distance]
        };
      }

      // 将未访问的相邻节点加入队列
      if (!visited.has(neighbor.id)) {
        queue.push({
          id: neighbor.id,
          path: [...current.path, neighbor.id],
          distances: [...current.distances, neighbor.distance]
        });
      }
    }
  }

  // 未找到路径
  return null;
};

export const observePerson = (hero: Person, target: Person): string => {
  // 简单计算战力 (HP + Arts数量 * 20)
  const getPower = (p: Person) => (p.maxHp || 100) + (p.arts.length * 20);
  const heroPower = getPower(hero);
  const targetPower = getPower(target);
  const diff = targetPower - heroPower;

  if (target.role === 'villager' || target.role === 'merchant') {
    return '看着是个不会武功的普通人。';
  }

  if (diff > 50) return '此人太阳穴高鼓，双目神光内敛，只怕武功深不可测！(极度危险)';
  if (diff > 10) return '此人呼吸绵长，步伐沉稳，是个劲敌。(强于你)';
  if (diff > -10) return '此人身形矫健，气息与你在伯仲之间。(旗鼓相当)';
  if (diff > -50) return '此人脚步略显虚浮，应该不是你的对手。(弱于你)';
  return '此人破绽百出，你可以轻易拿捏。(不堪一击)';
};

export const getPeopleAtLocation = (locationId: string, world: any): Person[] => {
  if (!world || !world.npcs) return [];
  return world.npcs.filter((npc: Person) => npc.locationId === locationId && npc.status === 'alive');
};
