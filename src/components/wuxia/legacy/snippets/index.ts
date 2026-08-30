// src/components/wuxia/snippets/index.ts
import { StorySnippet } from '../logic/types';
import { commonSnippets } from './common';
import { sectSnippets } from './sect';
import { companionFarewellSnippet, companionDailySnippet } from './companionInteractions';
import { friendSnippets } from './friend';
import { otherPeopleSnippets } from './otherPeople';
import { compainionSnippets } from './companion';

// 过滤掉已移动的同伴相关snippets
const filteredCommonSnippets = commonSnippets.filter(snippet => !['companion_farewell', 'companion_daily'].includes(snippet.id));

export const SNIPPETS: StorySnippet[] = [
  ...filteredCommonSnippets,
  ...sectSnippets,
  companionFarewellSnippet,
  companionDailySnippet,
  ...friendSnippets,
  ...otherPeopleSnippets,
  ...compainionSnippets,
];

// 导出工具函数
export * from './companionUtils';
export * from './companionInteractions';
