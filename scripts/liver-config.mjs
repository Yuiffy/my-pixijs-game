/**
 * 主播数据源配置
 * 用于自动化脚本同步多主播数据
 */

export const liverConfigs = {
  sui: {
    id: 'sui',
    name: '岁己SUI',
    sourceDirs: [
      'D:/files/videos/DDTV录播/25788785_岁己SUI',
      'E:/EFiles/Evideo/DDTV录播-E/25788785_岁己SUI'
    ],
    targetDir: 'public/data/streams/sui',
    bilibiliUid: '25788785'
  },
  shiori: {
    id: 'shiori',
    name: '栞栞',
    sourceDirs: [
      // 请根据实际情况填写栞栞的数据源路径
      // 'D:/files/videos/DDTV录播/[UID]_栞栞',
    ],
    targetDir: 'public/data/streams/shiori',
    bilibiliUid: '' // 请填写栞栞的B站UID
  },
  'vr-new-1': {
    id: 'vr-new-1',
    name: 'VirtuaReal新成员1',
    sourceDirs: [
      // 请根据实际情况填写新成员1的数据源路径
      // 'D:/files/videos/DDTV录播/[UID]_[名称]',
    ],
    targetDir: 'public/data/streams/vr-new-1',
    bilibiliUid: '' // 请填写新成员1的B站UID
  },
  'vr-new-2': {
    id: 'vr-new-2',
    name: 'VirtuaReal新成员2',
    sourceDirs: [
      // 请根据实际情况填写新成员2的数据源路径
    ],
    targetDir: 'public/data/streams/vr-new-2',
    bilibiliUid: '' // 请填写新成员2的B站UID
  },
  'vr-new-3': {
    id: 'vr-new-3',
    name: 'VirtuaReal新成员3',
    sourceDirs: [
      // 请根据实际情况填写新成员3的数据源路径
    ],
    targetDir: 'public/data/streams/vr-new-3',
    bilibiliUid: '' // 请填写新成员3的B站UID
  },
  'vr-new-4': {
    id: 'vr-new-4',
    name: 'VirtuaReal新成员4',
    sourceDirs: [
      // 请根据实际情况填写新成员4的数据源路径
    ],
    targetDir: 'public/data/streams/vr-new-4',
    bilibiliUid: '' // 请填写新成员4的B站UID
  }
};

export function getLiverConfig(liverId) {
  return liverConfigs[liverId];
}

export function getAllLiverIds() {
  return Object.keys(liverConfigs);
}
