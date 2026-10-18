// Lines for the time-out page. Each one is real and named, with where it
// comes from, and none is a slogan. No DOM, so the tests can read the list.

export const QUOTES = [
  {
    text: 'How we spend our days is, of course, how we spend our lives.',
    author: 'Annie Dillard',
    source: 'The Writing Life',
  },
  {
    text: 'A schedule defends from chaos and whim. It is a net for catching days.',
    author: 'Annie Dillard',
    source: 'The Writing Life',
  },
  {
    text: 'It is not that we have a short time to live, but that we waste a lot of it.',
    author: 'Seneca',
    source: 'On the Shortness of Life',
  },
  {
    text: 'Hold every hour in your grasp. Lay hold of to-day’s task, and you will not need to depend so much upon to-morrow’s.',
    author: 'Seneca',
    source: 'Letters to Lucilius, I',
  },
  {
    text: 'You could leave life right now. Let that determine what you do and say and think.',
    author: 'Marcus Aurelius',
    source: 'Meditations, II.11',
  },
  {
    text: 'The cost of a thing is the amount of what I will call life which is required to be exchanged for it, immediately or in the long run.',
    author: 'Henry David Thoreau',
    source: 'Walden',
  },
  {
    text: 'What information consumes is rather obvious: it consumes the attention of its recipients. Hence a wealth of information creates a poverty of attention.',
    author: 'Herbert A. Simon',
    source: 'Designing Organizations for an Information-Rich World, 1971',
  },
  {
    text: 'My experience is what I agree to attend to.',
    author: 'William James',
    source: 'The Principles of Psychology',
  },
  {
    text: 'Attention is the rarest and purest form of generosity.',
    author: 'Simone Weil',
    source: 'Letter to Joë Bousquet, 1942',
  },
  {
    text: 'Attention is the beginning of devotion.',
    author: 'Mary Oliver',
    source: 'Upstream',
  },
  {
    text: 'Tell me, what is it you plan to do with your one wild and precious life?',
    author: 'Mary Oliver',
    source: 'The Summer Day',
  },
  {
    text: 'I have often said that the sole cause of man’s unhappiness is that he does not know how to stay quietly in his room.',
    author: 'Blaise Pascal',
    source: 'Pensées',
  },
  {
    text: 'The first principle is that you must not fool yourself — and you are the easiest person to fool.',
    author: 'Richard Feynman',
    source: 'Cargo Cult Science, 1974',
  },
  {
    text: 'If you do not work on an important problem, it’s unlikely you’ll do important work.',
    author: 'Richard Hamming',
    source: 'You and Your Research, 1986',
  },
  {
    text: 'Knowledge and productivity are like compound interest.',
    author: 'Richard Hamming',
    source: 'You and Your Research, 1986',
  },
  {
    text: 'Inspiration is for amateurs — the rest of us just show up and get to work.',
    author: 'Chuck Close',
    source: '',
  },
  {
    text: 'The best minds of my generation are thinking about how to make people click ads. That sucks.',
    author: 'Jeff Hammerbacher',
    source: 'Bloomberg Businessweek, 2011',
  },
  {
    text: 'What Orwell feared were those who would ban books. What Huxley feared was that there would be no reason to ban a book, for there would be no one who wanted to read one.',
    author: 'Neil Postman',
    source: 'Amusing Ourselves to Death',
  },
  {
    text: 'The average human lifespan is absurdly, terrifyingly, insultingly short.',
    author: 'Oliver Burkeman',
    source: 'Four Thousand Weeks',
  },
  {
    text: 'Almost everything will work again if you unplug it for a few minutes, including you.',
    author: 'Anne Lamott',
    source: '12 truths I learned from life and writing, 2017',
  },
  {
    text: 'Lost time is never found again.',
    author: 'Benjamin Franklin',
    source: 'Poor Richard’s Almanack',
  },
];

/** One quote for a number, so the same visit shows the same line. */
export function quoteFor(seed = 0) {
  const index = Math.abs(Math.floor(Number(seed) || 0)) % QUOTES.length;
  return QUOTES[index];
}
