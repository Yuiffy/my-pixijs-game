// src/components/wuxia/snippets/index.ts
import { StorySnippet } from '../logic/types';
import { commonSnippets } from './common';
// import { storySnippets } from './story';
// import { encounterSnippets } from './encounters';
// import { companionSnippets } from './companion';

export const SNIPPETS: StorySnippet[] = [
  ...commonSnippets,
//   ...storySnippets,
//   ...encounterSnippets,
//   ...companionSnippets,
];
