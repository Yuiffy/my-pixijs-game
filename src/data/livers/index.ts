/**
 * 主播配置导出
 * 统一管理所有主播的配置信息
 */

import { LiverInfo, LiverConfig, ArtworkItem, ArtworkMaterials } from './types';
import { sui } from './sui';
import { shiori } from './shiori';
import { vrNew1, vrNew2, vrNew3, vrNew4 } from './virtuareal-new';

// 导出类型
export type { LiverInfo, LiverConfig, ArtworkItem, ArtworkMaterials };

/**
 * 所有主播配置的集合
 * 使用 as const 确保类型安全
 */
export const livers: LiverConfig = {
  sui,
  shiori,
  'vr-new-1': vrNew1,
  'vr-new-2': vrNew2,
  'vr-new-3': vrNew3,
  'vr-new-4': vrNew4,
};

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
