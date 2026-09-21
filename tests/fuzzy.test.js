import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, scoreFields, rank } from '../js/fuzzy.js';

test('an empty query matches everything', () => {
  assert.equal(fuzzyScore('', 'anything'), 0);
});

test('no match returns -1', () => {
  assert.equal(fuzzyScore('zzz', 'github'), -1);
  assert.equal(fuzzyScore('abc', ''), -1);
});

test('a prefix beats a match in the middle', () => {
  assert.ok(fuzzyScore('git', 'github') > fuzzyScore('git', 'my git mirror'));
});

test('a whole word beats a scattered subsequence', () => {
  assert.ok(fuzzyScore('news', 'news.ycombinator.com') > fuzzyScore('news', 'no easy wins'));
});

test('a word boundary beats mid-word', () => {
  assert.ok(fuzzyScore('tab', 'new tab page') > fuzzyScore('tab', 'notable'));
});

test('matching is case insensitive', () => {
  assert.equal(fuzzyScore('GIT', 'github'), fuzzyScore('git', 'GitHub'));
});

test('subsequences match in order only', () => {
  assert.ok(fuzzyScore('ghb', 'github') > 0);
  assert.equal(fuzzyScore('bhg', 'github'), -1);
});

test('scoreFields takes the best weighted field', () => {
  const fields = [
    ['nothing', 1],
    ['github', 0.5],
  ];
  assert.equal(scoreFields('github', fields), fuzzyScore('github', 'github') * 0.5);
  assert.equal(scoreFields('zzz', fields), -1);
});

test('rank sorts by score and drops non-matches', () => {
  const items = [{ title: 'random' }, { title: 'git mirror' }, { title: 'github' }];
  const ranked = rank('git', items, (item) => [[item.title, 1]]);
  assert.deepEqual(
    ranked.map((entry) => entry.item.title),
    ['github', 'git mirror']
  );
});

test('rank honours a per-item boost', () => {
  const items = [
    { title: 'github', boost: 0 },
    { title: 'github mirror', boost: 500 },
  ];
  const ranked = rank('github', items, (item) => [[item.title, 1]]);
  assert.equal(ranked[0].item.title, 'github mirror');
});

test('rank respects the limit', () => {
  const items = [{ title: 'aa' }, { title: 'ab' }, { title: 'ac' }];
  assert.equal(rank('a', items, (item) => [[item.title, 1]], { limit: 2 }).length, 2);
});
