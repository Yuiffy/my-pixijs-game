/**
 * 主播配置导出
 * 统一管理所有主播的配置信息
 */

import { LiverInfo, LiverConfig, ArtworkItem, ArtworkMaterials } from './types';
// @ts-ignore
import liverConfigRawData from '../../../scripts/liver-config.js';

const liverConfigsRaw = liverConfigRawData;

// 导出类型
export type { LiverInfo, LiverConfig, ArtworkItem, ArtworkMaterials };

// 将 liver-config.js 中的配置转换为 LiverConfig 格式
function parseLiverConfigs(): LiverConfig {
  const result: LiverConfig = {};
  const liverConfigs = liverConfigsRaw.liverConfigs || liverConfigsRaw;

  for (const key in liverConfigs) {
    const config = liverConfigs[key];
    result[key] = {
      id: config.id,
      name: config.name,
      shortName: config.id,
      group: 'personal',
      tags: [],
      description: config.name,
      colorMain: '#888888',
      colorSub: '#666666',
      dataPath: `/${config.targetDir}`,
      bilibiliUid: config.bilibiliUid,
      bilibiliSpace: `https://space.bilibili.com/${config.bilibiliUid}`,
    };
  }

  return result;
}

/**
 * 所有主播配置的集合
 * 从 scripts/liver-config.js 动态读取
 */
export const livers: LiverConfig = parseLiverConfigs();

/**
 * 主播ID类型
 * 从 livers 对象中提取所有有效的键
 */
export type LiverId = keyof typeof livers;

/**
 * 获取主播配置
 * @param liverId 主播ID
 * @returns 主播配置对象，如果不存在则返回 null
 */
export function getLiverConfig(liverId: string): LiverInfo | null {
  return livers[liverId as LiverId] || null;
}

/**
 * 获取所有主播ID列表
 * @returns 所有主播ID的数组
 */
export function getAllLiverIds(): LiverId[] {
  return Object.keys(livers) as LiverId[];
}

/**
 * 获取所有主播配置列表
 * @returns 所有主播配置的数组
 */
export function getAllLiverConfigs(): LiverInfo[] {
  return Object.values(livers);
}

/**
 * 检查主播ID是否有效
 * @param liverId 主播ID
 * @returns 如果主播ID有效则返回 true
 */
export function isValidLiverId(liverId: string): boolean {
  return liverId in livers;
}
