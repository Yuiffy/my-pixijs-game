/**
 * 主播配置类型定义
 * 支持多主播系统的统一配置结构
 */

export interface LiverInfo {
  /** 唯一标识符，用于路由和数据路径 */
  id: string;
  /** 主播全名 */
  name: string;
  /** 简称 */
  shortName: string;
  /** 英文名（可选） */
  englishName?: string;
  /** 所属团体 */
  group: string;
  /** 种族/设定（可选） */
  race?: string;
  /** 生日（可选） */
  birthday?: string;
  /** 标签列表 */
  tags: string[];
  /** 描述 */
  description: string;
  /** 主色调 */
  colorMain: string;
  /** 副色调 */
  colorSub: string;
  /** 数据路径，如 "/data/streams/sui/" */
  dataPath: string;
  /** 本地头像路径（可选） */
  avatarSrc?: string;
  /** B站UID（可选） */
  bilibiliUid?: string;
  /** B站空间链接（可选） */
  bilibiliSpace?: string;
  /** 素材图分类（可选）- 支持对象形式 */
  artworkMaterials?: ArtworkMaterials;
  /** B站直播录像合集链接（可选） */
  bilibiliReplayUrl?: string;
  /** 其他自定义字段 */
  [key: string]: any;
}

export interface ArtworkMaterials {
  [category: string]: ArtworkItem[];
}

export interface ArtworkItem {
  src: string;
  title: string;
  tag: string;
}

/**
 * 主播配置类型
 * 用于类型安全的配置导出
 */
export type LiverConfig = Record<string, LiverInfo>;

/**
 * 主播ID类型
 * 从配置中提取所有有效的主播ID
 */
export type LiverId = string;
