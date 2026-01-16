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
    name: '栞栞Shiori',
    sourceDirs: [
      'D:/files/videos/DDTV录播/26966466_栞栞Shiori',
      'E:/EFiles/Evideo/DDTV录播-E/26966466_栞栞Shiori'
    ],
    targetDir: 'public/data/streams/shiori',
    bilibiliUid: '26966466',
    // AI生成配置
    referenceImage: 'public/reference_images/獭獭栞_舰长礼物长图里截图.png',
    characterDescription: '栞栞Shiori（有兽耳的女生，浅黄色头发小孩），獭獭栞（长得像滑板的海獭）',
    anchorName: '栞栞Shiori',
    fanName: '獭獭栞',
    enableTextGeneration: true,
    enableComicGeneration: true
  },
  hazel: {
    id: 'hazel',
    name: '灰泽满Hazel',
    sourceDirs: [
      'D:/files/videos/DDTV录播/1713546334_灰泽满Hazel',
      'E:/EFiles/Evideo/DDTV录播-E/1713546334_灰泽满Hazel'
    ],
    targetDir: 'public/data/streams/hazel',
    bilibiliUid: '1713546334',
    // AI生成配置
    referenceImage: 'public/reference_images/Hazel_灰泽满_立绘.png',
    characterDescription: '灰泽满Hazel（永远16岁的女高中生，浅色短发，风纪委员，身上挂着很多果冻形状的饰品，随身带着果冻应急储备箱，性格有些偏执和元气）',
    anchorName: '灰泽满Hazel',
    fanName: '果冻',
    enableTextGeneration: true,
    enableComicGeneration: true
  },
  liko: {
    id: 'liko',
    name: '莉蔻Liko',
    sourceDirs: [
      'D:/files/videos/DDTV录播/1713548468_莉蔻Liko',
      'E:/EFiles/Evideo/DDTV录播-E/1713548468_莉蔻Liko'
    ],
    targetDir: 'public/data/streams/liko',
    bilibiliUid: '1713548468',
    // AI生成配置
    referenceImage: 'public/reference_images/Liko_莉蔻_立绘.png',
    characterDescription: '莉蔻Liko（长着兔耳的少女，戴着大帽子，性格胆小没见过世面，手里常拿着胡萝卜棒冰，虽然是秘密组织的特工但看起来很弱气）',
    anchorName: '莉蔻Liko',
    fanName: '胡萝卜',
    enableTextGeneration: true,
    enableComicGeneration: true
  },
  kloa: {
    id: 'kloa',
    name: '克罗雅Kloa',
    sourceDirs: [
      'D:/files/videos/DDTV录播/1986461465_克罗雅Kloa',
      'E:/EFiles/Evideo/DDTV录播-E/1986461465_克罗雅Kloa'
    ],
    targetDir: 'public/data/streams/kloa',
    bilibiliUid: '1986461465',
    // AI生成配置
    referenceImage: 'public/reference_images/Kloa_克罗雅_立绘.png',
    characterDescription: '克罗雅Kloa（混沌属性的少女，头顶天使光环但背后是黑色的恶魔翅膀，戴着黑色头纱，表情慵懒，喜欢睡觉和发呆，废柴神造物）',
    anchorName: '克罗雅Kloa',
    fanName: '信徒',
    enableTextGeneration: true,
    enableComicGeneration: true
  },
  izayoi: {
    id: 'izayoi',
    name: '十六萤Izayoi',
    sourceDirs: [
      'D:/files/videos/DDTV录播/1741667419_十六萤Izayoi',
      'E:/EFiles/Evideo/DDTV录播-E/1741667419_十六萤Izayoi'
    ],
    targetDir: 'public/data/streams/izayoi',
    bilibiliUid: '1741667419',
    // AI生成配置
    referenceImage: 'public/reference_images/十六萤Izayoi.png',
    characterDescription: '十六萤Izayoi（拥有浣熊耳朵和毛茸茸大尾巴的少女，面无表情的三无特工，穿着女仆装或异域服饰，气质清冷，经常用尾巴把自己裹住）',
    anchorName: '十六萤Izayoi',
    fanName: '萤火虫',
    enableTextGeneration: true,
    enableComicGeneration: true
  }
};

export function getLiverConfig(liverId) {
  return liverConfigs[liverId];
}

export function getAllLiverIds() {
  return Object.keys(liverConfigs);
}
