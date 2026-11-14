import assert from 'node:assert/strict';
import test from 'node:test';
import { isContainedDuplicate } from '../stream-sync-helpers.mjs';

test('recognizes same-title short captures contained by a longer recording', () => {
  const long = { id: '2026_11_01_20_00_57', title: '陪你这个猪过周日！聊聊先影之刃零后', duration: 28855 };
  const short = { id: '2026_11_02_03_53_17', title: '陪你这个猪过周日！聊聊先影之刃零后', duration: 251 };
  assert.equal(isContainedDuplicate(short, long), true);
});

test('does not discard an independent short stream or a different title', () => {
  const long = { id: '2026_11_01_20_00_57', title: '晚间歌回', duration: 28855 };
  assert.equal(isContainedDuplicate({ id: '2026_11_02_03_53_17', title: '晚间歌回', duration: 251 }, long), true);
  assert.equal(isContainedDuplicate({ id: '2026_11_02_05_00_00', title: '早安杂谈', duration: 251 }, long), false);
  assert.equal(isContainedDuplicate({ id: '2026_11_02_03_53_17', title: '晚间歌回', duration: 251 }, { id: '2026_11_02_03_00_00', title: '晚间歌回', duration: 1800 }), false);
});

test('keeps a short stream when it is not fully contained', () => {
  const long = { id: '2026_11_01_20_00_57', title: '晚间歌回', duration: 28855 };
  assert.equal(isContainedDuplicate({ id: '2026_11_02_03_53_17', title: '晚间歌回', duration: 251 }, long), true);
  assert.equal(isContainedDuplicate({ id: '2026_11_02_04_00_00', title: '晚间歌回', duration: 900 }, long), false);
});
