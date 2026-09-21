// Instant answers for the command palette: arithmetic and unit conversion.
// Everything runs on this device — no expression is ever sent anywhere, and
// nothing is evaluated with eval(); the parser below only knows numbers,
// operators and the functions listed here.

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/** Round to `digits` significant figures, then drop the trailing zeros. */
export function formatNumber(value, digits = 10) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) {
    return value.toExponential(4).replace(/\.?0+e/, 'e');
  }
  const fixed = Number(value.toPrecision(digits));
  const [whole, fraction] = String(fixed).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const SUPERSCRIPT = { '²': '2', '³': '3' };
const OPERATOR_ALIAS = { '×': '*', '·': '*', '÷': '/', '−': '-', '–': '-' };

/** Split text into numbers, words, operators and brackets. `null` if unknown. */
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/[\d.]/.test(char)) {
      const match = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?|^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!match) return null;
      tokens.push({ type: 'number', value: Number(match[0].replace(/,/g, '')) });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z°µΩ%]/.test(char)) {
      const match = /^[a-zA-Z°µΩ%²³]+\d?/.exec(text.slice(i));
      if (!match) return null;
      const word = [...match[0]].map((c) => SUPERSCRIPT[c] ?? c).join('');
      // A trailing % is its own token: "50%" is a number and a percent sign.
      if (word.length > 1 && word.endsWith('%')) {
        tokens.push({ type: 'word', value: word.slice(0, -1) });
        tokens.push({ type: 'op', value: '%' });
      } else if (word === '%') {
        tokens.push({ type: 'op', value: '%' });
      } else {
        tokens.push({ type: 'word', value: word });
      }
      i += match[0].length;
      continue;
    }
    if (text.startsWith('**', i)) {
      tokens.push({ type: 'op', value: '^' });
      i += 2;
      continue;
    }
    const op = OPERATOR_ALIAS[char] ?? char;
    if ('+-*/^(),'.includes(op)) {
      tokens.push({ type: 'op', value: op });
      i += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Arithmetic                                                          */
/* ------------------------------------------------------------------ */

const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  log10: Math.log10,
  exp: Math.exp,
  sign: Math.sign,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot,
};

/**
 * Recursive descent over the token list. Every parse function returns
 * `{ v, pct }`; `pct` marks a value written with a percent sign, so that
 * "120 + 10%" adds a tenth of 120 rather than the number ten.
 */
function parser(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (...values) => peek()?.type === 'op' && values.includes(peek().value);
  const isWord = (...values) =>
    peek()?.type === 'word' && values.includes(peek().value.toLowerCase());
  const plain = (node) => (node.pct ? node.v / 100 : node.v);

  function expression() {
    let left = term();
    while (isOp('+', '-')) {
      const op = tokens[pos++].value;
      const right = term();
      const delta = right.pct ? (left.pct ? left.v / 100 : left.v) * (right.v / 100) : right.v;
      left = { v: op === '+' ? plain(left) + delta : plain(left) - delta, pct: false };
    }
    return left;
  }

  function term() {
    let left = power();
    for (;;) {
      if (isOp('*', '/')) {
        const op = tokens[pos++].value;
        const right = power();
        left = {
          v: op === '*' ? plain(left) * plain(right) : plain(left) / plain(right),
          pct: false,
        };
      } else if (isWord('mod', 'rem')) {
        pos += 1;
        const right = power();
        left = { v: plain(left) % plain(right), pct: false };
      } else if (isWord('of') && left.pct) {
        // "20% of 60" reads as a multiplication.
        pos += 1;
        const right = power();
        left = { v: plain(left) * plain(right), pct: false };
      } else {
        return left;
      }
    }
  }

  function power() {
    const base = unary();
    if (!isOp('^')) return base;
    pos += 1;
    return { v: plain(base) ** plain(power()), pct: false };
  }

  function unary() {
    if (isOp('-')) {
      pos += 1;
      const node = unary();
      return { v: -node.v, pct: node.pct };
    }
    if (isOp('+')) {
      pos += 1;
      return unary();
    }
    return postfix();
  }

  function postfix() {
    const node = primary();
    if (isOp('%')) {
      pos += 1;
      return { v: node.v, pct: true };
    }
    return node;
  }

  function primary() {
    const token = peek();
    if (!token) throw new Error('unexpected end');
    if (token.type === 'number') {
      pos += 1;
      return { v: token.value, pct: false };
    }
    if (token.type === 'op' && token.value === '(') {
      pos += 1;
      const node = expression();
      if (!isOp(')')) throw new Error('missing bracket');
      pos += 1;
      return { v: plain(node), pct: false };
    }
    if (token.type === 'word') {
      const name = token.value.toLowerCase();
      if (name in CONSTANTS) {
        pos += 1;
        return { v: CONSTANTS[name], pct: false };
      }
      if (name in FUNCTIONS) {
        pos += 1;
        const args = [];
        if (isOp('(')) {
          pos += 1;
          if (!isOp(')')) {
            args.push(plain(expression()));
            while (isOp(',')) {
              pos += 1;
              args.push(plain(expression()));
            }
          }
          if (!isOp(')')) throw new Error('missing bracket');
          pos += 1;
        } else {
          args.push(plain(unary()));
        }
        return { v: FUNCTIONS[name](...args), pct: false };
      }
    }
    throw new Error('unexpected token');
  }

  return {
    run() {
      const node = expression();
      if (pos !== tokens.length) throw new Error('trailing input');
      return plain(node);
    },
  };
}

/** Evaluate an arithmetic expression. Returns `null` when it is not one. */
export function evaluate(text) {
  const tokens = tokenize(text ?? '');
  if (!tokens?.length) return null;
  try {
    const value = parser(tokens).run();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

// Each entry: symbol -> [factor to the base unit, ...other names].
const SCALES = {
  length: {
    m: [1, 'meter', 'meters', 'metre', 'metres'],
    km: [1000, 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
    cm: [0.01, 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
    mm: [0.001, 'millimeter', 'millimeters'],
    um: [1e-6, 'micron', 'micrometer', 'micrometers'],
    nm: [1e-9, 'nanometer', 'nanometers'],
    mi: [1609.344, 'mile', 'miles'],
    yd: [0.9144, 'yard', 'yards'],
    ft: [0.3048, 'foot', 'feet'],
    in: [0.0254, 'inch', 'inches'],
    nmi: [1852, 'nauticalmile', 'nauticalmiles'],
    ly: [9.4607304725808e15, 'lightyear', 'lightyears'],
  },
  mass: {
    kg: [1, 'kilogram', 'kilograms', 'kilo', 'kilos'],
    g: [0.001, 'gram', 'grams'],
    mg: [1e-6, 'milligram', 'milligrams'],
    t: [1000, 'tonne', 'tonnes', 'metricton'],
    lb: [0.45359237, 'pound', 'pounds', 'lbs'],
    oz: [0.028349523125, 'ounce', 'ounces'],
    st: [6.35029318, 'stone', 'stones'],
  },
  volume: {
    l: [1, 'liter', 'liters', 'litre', 'litres'],
    ml: [0.001, 'milliliter', 'milliliters', 'millilitre'],
    cl: [0.01, 'centiliter', 'centiliters'],
    m3: [1000, 'cubicmeter', 'cubicmeters'],
    gal: [3.785411784, 'gallon', 'gallons'],
    qt: [0.946352946, 'quart', 'quarts'],
    pt: [0.473176473, 'pint', 'pints'],
    cup: [0.2365882365, 'cups'],
    floz: [0.0295735295625, 'fluidounce', 'fluidounces'],
    tbsp: [0.01478676478125, 'tablespoon', 'tablespoons'],
    tsp: [0.00492892159375, 'teaspoon', 'teaspoons'],
  },
  data: {
    b: [1, 'byte', 'bytes'],
    bit: [0.125, 'bits'],
    kb: [1e3, 'kilobyte', 'kilobytes'],
    mb: [1e6, 'megabyte', 'megabytes'],
    gb: [1e9, 'gigabyte', 'gigabytes'],
    tb: [1e12, 'terabyte', 'terabytes'],
    pb: [1e15, 'petabyte', 'petabytes'],
    kib: [1024, 'kibibyte', 'kibibytes'],
    mib: [1024 ** 2, 'mebibyte', 'mebibytes'],
    gib: [1024 ** 3, 'gibibyte', 'gibibytes'],
    tib: [1024 ** 4, 'tebibyte', 'tebibytes'],
  },
  time: {
    s: [1, 'sec', 'secs', 'second', 'seconds'],
    ms: [0.001, 'millisecond', 'milliseconds'],
    min: [60, 'minute', 'minutes', 'mins'],
    h: [3600, 'hr', 'hrs', 'hour', 'hours'],
    d: [86400, 'day', 'days'],
    wk: [604800, 'week', 'weeks'],
    mo: [2629800, 'month', 'months'],
    yr: [31557600, 'year', 'years'],
  },
  speed: {
    mps: [1, 'meterspersecond'],
    kph: [1 / 3.6, 'kmh', 'kilometersperhour'],
    mph: [0.44704, 'milesperhour'],
    kn: [0.514444, 'knot', 'knots'],
    fps: [0.3048, 'feetpersecond'],
  },
  area: {
    m2: [1, 'sqm', 'squaremeter', 'squaremeters'],
    km2: [1e6, 'sqkm', 'squarekilometer', 'squarekilometers'],
    cm2: [1e-4, 'sqcm'],
    ft2: [0.09290304, 'sqft', 'squarefoot', 'squarefeet'],
    mi2: [2589988.110336, 'sqmi', 'squaremile', 'squaremiles'],
    ac: [4046.8564224, 'acre', 'acres'],
    ha: [10000, 'hectare', 'hectares'],
  },
  angle: {
    deg: [1, 'degree', 'degrees'],
    rad: [180 / Math.PI, 'radian', 'radians'],
    grad: [0.9, 'gradian', 'gradians'],
    turn: [360, 'turns', 'revolution', 'revolutions'],
  },
};

// Temperature is not a plain factor, so each unit says how to reach Celsius.
const TEMPERATURES = {
  c: { names: ['celsius', 'centigrade'], toC: (v) => v, fromC: (v) => v },
  f: { names: ['fahrenheit'], toC: (v) => ((v - 32) * 5) / 9, fromC: (v) => (v * 9) / 5 + 32 },
  k: { names: ['kelvin'], toC: (v) => v - 273.15, fromC: (v) => v + 273.15 },
};

const UNITS = new Map();

function register(alias, entry) {
  const key = alias.toLowerCase();
  if (!UNITS.has(key)) UNITS.set(key, entry);
}

Object.entries(SCALES).forEach(([category, units]) => {
  Object.entries(units).forEach(([symbol, [factor, ...names]]) => {
    const entry = { category, symbol, factor };
    register(symbol, entry);
    names.forEach((name) => register(name, entry));
    // Plain plurals, so "kms" lands here as well as "km".
    if (!/\d$/.test(symbol)) register(`${symbol}s`, entry);
  });
});

Object.entries(TEMPERATURES).forEach(([symbol, { names, toC, fromC }]) => {
  const entry = { category: 'temperature', symbol, toC, fromC };
  register(symbol, entry);
  register(`°${symbol}`, entry);
  names.forEach((name) => register(name, entry));
});

/** Look up a unit by symbol, name or plural. `null` when unknown. */
export function findUnit(name) {
  if (!name) return null;
  const clean = String(name)
    .toLowerCase()
    .replace(/[\s./]/g, '')
    .replace(/²/g, '2')
    .replace(/³/g, '3');
  return UNITS.get(clean) ?? UNITS.get(clean.replace(/^°/, '')) ?? null;
}

/** Convert a value between two units of the same kind. `null` if they differ. */
export function convert(value, fromName, toName) {
  const from = findUnit(fromName);
  const to = findUnit(toName);
  if (!from || !to || from.category !== to.category) return null;
  if (from.category === 'temperature') {
    return { value: to.fromC(from.toC(value)), unit: to.symbol, category: from.category };
  }
  return { value: (value * from.factor) / to.factor, unit: to.symbol, category: from.category };
}

const SEPARATORS = new Set(['in', 'to', 'into', 'as']);

/**
 * Read "<expression> <unit> to <unit>". The word "in" is both a separator and
 * a unit, so every candidate split is tried and the first that parses wins.
 */
function readConversion(text) {
  // Without an amount this is prose, not a conversion. "c to f" stays a search.
  if (!/\d/.test(text)) return null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 1; i < words.length - 1; i += 1) {
    if (!SEPARATORS.has(words[i].toLowerCase())) continue;
    const targetText = words.slice(i + 1).join(' ');
    if (!findUnit(targetText)) continue;
    const left = words.slice(0, i);

    // "10 km to mi" — the unit stands on its own.
    if (left.length > 1 && findUnit(left[left.length - 1])) {
      const amount = evaluate(left.slice(0, -1).join(' '));
      if (amount !== null) {
        return { amount, source: left[left.length - 1], target: targetText };
      }
    }
    // "10km to mi" — the unit is stuck to the number.
    const match = /^(.*?)([a-zA-Z°µ²³]+\d?)$/.exec(left.join(''));
    if (match && findUnit(match[2])) {
      const amount = evaluate(match[1] || '1');
      if (amount !== null) return { amount, source: match[2], target: targetText };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

const MATH_WORDS =
  /\b(?:sqrt|cbrt|abs|round|floor|ceil|ln|log|log2|log10|exp|sign|sin|cos|tan|asin|acos|atan|min|max|hypot|mod|rem|pi|tau|phi)\b/i;
const HAS_OPERATOR = /[+\-*/^%×÷·]/;

/**
 * Turn a query into an instant answer, or `null` when it is not one.
 * `{ kind, title, detail, value }` — `value` is the plain text to copy.
 */
export function answer(query) {
  const text = (query ?? '').trim();
  if (!text || text.length > 200) return null;

  const conversion = readConversion(text);
  if (conversion) {
    const result = convert(conversion.amount, conversion.source, conversion.target);
    if (!result) return null;
    const value = formatNumber(result.value, 8);
    const from = findUnit(conversion.source);
    return {
      kind: 'convert',
      title: `${value} ${result.unit}`,
      detail: `${formatNumber(conversion.amount, 8)} ${from.symbol} =`,
      value,
    };
  }

  if (!HAS_OPERATOR.test(text) && !MATH_WORDS.test(text)) return null;
  if (!/\d/.test(text) && !MATH_WORDS.test(text)) return null;
  const value = evaluate(text);
  if (value === null) return null;
  const formatted = formatNumber(value);
  // An answer of "5" to the question "5" helps nobody.
  if (formatted === text.replace(/\s+/g, '')) return null;
  return { kind: 'math', title: formatted, detail: `${text} =`, value: formatted };
}
