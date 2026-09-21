import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { answer, convert, evaluate, findUnit, formatNumber } from '../js/answers.js';

const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

describe('arithmetic', () => {
  test('the four operators keep their usual precedence', () => {
    assert.equal(evaluate('2 + 3 * 4'), 14);
    assert.equal(evaluate('(2 + 3) * 4'), 20);
    assert.equal(evaluate('10 / 4'), 2.5);
    assert.equal(evaluate('7 - 2 - 1'), 4);
  });

  test('powers are right associative', () => {
    assert.equal(evaluate('2 ^ 10'), 1024);
    assert.equal(evaluate('2 ** 3 ** 2'), 512);
  });

  test('unary minus binds tighter than the operators', () => {
    assert.equal(evaluate('-3 + 5'), 2);
    assert.equal(evaluate('4 * -2'), -8);
  });

  test('functions work with and without brackets', () => {
    assert.equal(evaluate('sqrt(144)'), 12);
    assert.equal(evaluate('sqrt 16'), 4);
    assert.equal(evaluate('max(3, 9, 5)'), 9);
    assert.equal(evaluate('round(2.6)'), 3);
  });

  test('constants are known', () => {
    close(evaluate('pi'), Math.PI);
    close(evaluate('tau / 2'), Math.PI);
  });

  test('a percent is a hundredth on its own', () => {
    assert.equal(evaluate('15%'), 0.15);
    assert.equal(evaluate('20% of 60'), 12);
    assert.equal(evaluate('50 * 10%'), 5);
  });

  test('a percent added to a number is a share of that number', () => {
    assert.equal(evaluate('120 + 10%'), 132);
    assert.equal(evaluate('100 - 25%'), 75);
  });

  test('thousands separators and exponents are read', () => {
    assert.equal(evaluate('1,234 * 2'), 2468);
    assert.equal(evaluate('1e3 + 1'), 1001);
  });

  test('mod divides and keeps the remainder', () => {
    assert.equal(evaluate('10 mod 3'), 1);
  });

  test('anything that is not arithmetic gives nothing', () => {
    ['', 'hello world', '2 +', '(1 + 2', 'alert(1)', 'a * b', '2 3'].forEach((text) => {
      assert.equal(evaluate(text), null, `${text} should not evaluate`);
    });
  });

  test('a division by zero gives nothing rather than infinity', () => {
    assert.equal(evaluate('1 / 0'), null);
  });
});

describe('numbers', () => {
  test('long decimals are cut and whole thousands are grouped', () => {
    assert.equal(formatNumber(1 / 3), '0.3333333333');
    assert.equal(formatNumber(1234567), '1,234,567');
    assert.equal(formatNumber(42), '42');
    assert.equal(formatNumber(0), '0');
  });

  test('very large and very small numbers use exponents', () => {
    assert.match(formatNumber(1e20), /e\+?20/);
    assert.match(formatNumber(1e-9), /e-9/);
  });
});

describe('units', () => {
  test('a unit is found by symbol, name or plural', () => {
    assert.equal(findUnit('km').symbol, 'km');
    assert.equal(findUnit('Kilometers').symbol, 'km');
    assert.equal(findUnit('kms').symbol, 'km');
    assert.equal(findUnit('°C').symbol, 'c');
    assert.equal(findUnit('nonsense'), null);
  });

  test('lengths, masses and data convert', () => {
    close(convert(10, 'km', 'mi').value, 6.2137119);
    close(convert(1, 'lb', 'g').value, 453.59237, 1e-4);
    assert.equal(convert(1, 'gb', 'mb').value, 1000);
    assert.equal(convert(1024, 'mib', 'gib').value, 1);
  });

  test('temperature uses its own formula', () => {
    close(convert(100, 'c', 'f').value, 212);
    close(convert(32, 'f', 'c').value, 0);
    close(convert(0, 'c', 'k').value, 273.15);
  });

  test('units of different kinds do not convert', () => {
    assert.equal(convert(1, 'km', 'kg'), null);
    assert.equal(convert(1, 'km', 'nonsense'), null);
  });
});

describe('answers', () => {
  test('arithmetic is answered with the total', () => {
    assert.deepEqual(answer('6*7').kind, 'math');
    assert.equal(answer('6*7').title, '42');
    assert.equal(answer('6*7').value, '42');
  });

  test('a conversion is answered with the value and the unit', () => {
    assert.equal(answer('10 km to miles').title, '6.2137119 mi');
    assert.equal(answer('72f to c').title, '22.222222 c');
    assert.equal(answer('1 day in minutes').title, '1,440 min');
  });

  test('the amount may itself be arithmetic', () => {
    assert.equal(answer('2 * 3 km in m').title, '6,000 m');
  });

  test('the unit may be stuck to the number', () => {
    assert.equal(answer('5mi in km').title, '8.04672 km');
  });

  test('"in" works as both the separator and as inches', () => {
    assert.equal(answer('10 cm in in').title, '3.9370079 in');
    assert.equal(answer('10 in to cm').title, '25.4 cm');
  });

  test('ordinary searches are left alone', () => {
    [
      'hello world',
      'github.com',
      '5',
      '2023',
      'how to write a test',
      'notes',
      'c to f',
      '3 days',
      'log in to gmail',
    ].forEach((text) => {
      assert.equal(answer(text), null, `${text} should not be an answer`);
    });
  });

  test('a very long query is ignored', () => {
    assert.equal(answer(`1 + ${'1 + '.repeat(100)}1`), null);
  });
});
