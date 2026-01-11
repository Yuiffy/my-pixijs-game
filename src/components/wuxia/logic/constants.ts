import { Personality, Sect } from './types';

export const MALE_FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '松', '竹', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '平之', '复', '延庆', '不群', '沧海', '伯光', '问天'];
export const FEMALE_FIRST_NAMES = ['灵珊', '盈盈', '语嫣', '素素', '莫愁', '芷若', '敏', '嫣然', '婉清', '弄玉', '铁心', '凤凰', '蓉', '念慈', '如是', '小玩', '双', '弗之', '龙儿', '语花', '木兰', '岁', '岁己', '小岁'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范', '欧阳', '上官', '段', '乔', '李', '张'];

export const CITY_PREFIXES = ['襄', '洛', '长', '扬', '苏', '杭', '汴', '京', '成', '渝', '金', '姑'];
export const CITY_SUFFIXES = ['阳', '州', '安', '陵', '京', '都'];
export const WILD_PREFIXES = ['迷雾', '断肠', '绝情', '黑风', '落日', '万劫', '无量', '缥缈', '恶人', '神农'];
export const WILD_SUFFIXES = ['林', '谷', '崖', '山', '窟', '岭', '沼', '漠'];

export const MERCHANT_ITEMS = [
  '匕首', '短剑', '护腕', '玉佩', '银两', '草药', '酒葫芦', '暗器', '绳索', '火折子',
  '地图', '指南针', '解毒丹', '金疮药', '干粮', '水袋', '夜明珠', '丝绸', '香料', '茶叶',
];

export const SECTS_DATA: Sect[] = [
  {
    id: 'sect_qingyun',
    name: '青云门',
    type: 'good',
    locationId: 'sect_qingyun',
    recruitGender: 'both',
    history: '青云门始创于三百年前，由一代奇人青云子所创。门派以道法自然为宗旨，门中弟子多修习雷法剑术，门派曾多次主持武林大会，声名显赫。近年来门派内部出现分歧，掌门一脉坚持传统道法，而部分长老倾向于更激进的修炼方式。',
    description: '江湖上最古老的门派之一，以雷法剑术闻名天下。门派位于青云山巅，山清水秀，灵气充沛。',
    reputation: 85,
  },
  {
    id: 'sect_xuedao',
    name: '血刀堂',
    type: 'evil',
    locationId: 'sect_xuedao',
    recruitGender: 'both',
    history: '血刀堂起源于北方苦寒之地，由魔道中人血刀老祖创立。门派以血刀秘法著称，修炼者需以自身精血为引，威力极大但极易走火入魔。近年来血刀堂扩张迅速，与各大正派多次冲突，已成江湖一大祸患。',
    description: '魔道门派，以血刀秘法闻名。修炼者性格多偏激，行事狠辣，但门派内部纪律严明。',
    reputation: 25,
  },
  {
    id: 'sect_tingyu',
    name: '听雨阁',
    type: 'good',
    locationId: 'sect_tingyu',
    recruitGender: 'female',
    history: '听雨阁为江湖上唯一的女侠门派，由一代女侠听雨仙子创立。门派以轻功和暗器闻名，弟子多为江湖侠女。听雨阁从不参与江湖纷争，但门中弟子常在暗中行侠仗义，帮助弱者。',
    description: '江湖上唯一的女侠门派，以轻功和暗器闻名。门派位于江南水乡，环境优雅宁静。',
    reputation: 70,
  },
  {
    id: 'sect_wanshou',
    name: '万兽山庄',
    type: 'evil',
    locationId: 'sect_wanshou',
    recruitGender: 'both',
    history: '万兽山庄位于深山密林之中，庄主自称能够与百兽沟通。门派以驭兽术闻名，弟子常与各种猛兽为伴。山庄与外界交往不多，但偶尔有弟子下山为非作歹，引起江湖注意。',
    description: '神秘的驭兽门派，与百兽为伴。门派位于深山之中，鲜有外人踏足。',
    reputation: 45,
  },
  {
    id: 'sect_gai',
    name: '丐帮',
    type: 'good',
    locationId: 'sect_gai',
    recruitGender: 'both',
    history: '丐帮为江湖第一大帮派，起源于宋朝，由江湖乞丐组成。门派以打狗棒法和降龙十八掌闻名天下。丐帮弟子遍布江湖各地，消息灵通，是正道的中坚力量。近年来丐帮内部出现帮主之争，影响了门派的团结。',
    description: '江湖第一大帮派，以乞丐为主要成员。门派以消息灵通著称，弟子众多。',
    reputation: 90,
  },
  {
    id: 'sect_shaolin',
    name: '少林',
    type: 'good',
    locationId: 'sect_shaolin',
    recruitGender: 'male',
    history: '少林寺为武林圣地，始创于南北朝时期。寺中以禅武合一著称，门派武功博大精深，包括易筋经、罗汉拳等绝学。少林弟子多为僧人，严守清规戒律，从不主动参与江湖争端，但遇不平事必会出手。',
    description: '武林圣地，以禅武合一著称。门派严守清规戒律，只收男弟子。',
    reputation: 95,
  },
  {
    id: 'sect_emei',
    name: '峨眉',
    type: 'good',
    locationId: 'sect_emei',
    recruitGender: 'female',
    history: '峨眉派为江湖第二大门派，由女侠郭襄创立。门派以峨眉剑法和佛门心法闻名，弟子多为女尼或女侠。峨眉派与武当派交好，共同维护江湖正义。近年来门派人才辈出，成为正道的重要力量。',
    description: '江湖第二大门派，以剑法闻名天下。只收女弟子，门派位于峨眉山巅。',
    reputation: 85,
  },
  {
    id: 'sect_wudang',
    name: '武当',
    type: 'good',
    locationId: 'sect_wudang',
    recruitGender: 'male',
    history: '武当派由张三丰真人创立，门派以太极拳和太极剑闻名天下。武当讲究以柔克刚，阴阳平衡之道。门派位于武当山，环境清幽，适合修炼。武当弟子多为道士，性格温和，但武功高强。',
    description: '道家门派，以太极拳和太极剑闻名。讲究以柔克刚，阴阳平衡。',
    reputation: 88,
  },
  {
    id: 'sect_huashan',
    name: '华山',
    type: 'good',
    locationId: 'sect_huashan',
    recruitGender: 'both',
    history: '华山派位于华山之巅，以险峻的地势和独孤九剑闻名。门派由风清扬等前辈创立，讲究剑术的精妙变化。华山派弟子性格多豪爽直率，重视剑术的艺术性。',
    description: '剑术门派，以独孤九剑闻名。门派位于华山之巅，环境险峻。',
    reputation: 75,
  },
  {
    id: 'sect_kunlun',
    name: '昆仑',
    type: 'good',
    locationId: 'sect_kunlun',
    recruitGender: 'both',
    history: '昆仑派为江湖古老门派之一，位于昆仑山深处。门派以昆仑剑法和玄功闻名，修炼者需耐得住高山严寒。昆仑弟子性格坚韧，武功扎实，但门派较为封闭，与外界交往不多。',
    description: '古老的剑术门派，位于昆仑山深处。修炼者需耐得住严寒考验。',
    reputation: 65,
  },
  {
    id: 'sect_feiniao',
    name: '飞鸟派',
    type: 'good',
    locationId: 'sect_feiniao',
    recruitGender: 'both',
    history: '飞鸟派由神秘女侠岁己苏一所创，传说她生有白色羽翼，常戴一顶宽檐帽，以轻灵飘逸的身法和独特的飞鸟拳法闻名江湖。门派位于绝壁之巅的"飞鸟崖"，常年云雾缭绕，宛如仙境。飞鸟派弟子以轻功见长，擅长空中作战，常以优雅的姿态击败对手。',
    description: '神秘而优雅的门派，以轻功和飞鸟拳法著称。门派建筑依山而建，与自然融为一体，弟子们常年在绝壁间练习轻功。',
    reputation: 75,
  },
];

export const SECT_NAMES = SECTS_DATA.map((sect) => sect.name);
