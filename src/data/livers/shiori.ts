import { LiverInfo } from './types';

/**
 * 栞栞 主播配置
 * 示例配置，可根据实际情况调整
 */
export const shiori: LiverInfo = {
  id: 'shiori',
  name: '栞栞',
  shortName: '栞栞',
  englishName: 'Shiori',
  group: 'VirtuaReal',
  description: 'VirtuaReal 栞栞的主页，记录每一场直播的珍贵瞬间。',
  colorMain: '#FF6B9D', // 粉色系
  colorSub: '#4ECDC4', // 青色系
  dataPath: '/data/streams/shiori/',
  tags: ['虚拟主播', 'VirtuaReal', '栞栞'],
  bilibiliReplayUrl: 'https://space.bilibili.com/[UID]/lists/[series-id]?type=series',
};
