const p = require('./parser.js');
if (JSON.stringify(p.parseConfig('{invalid}')) !== '{}') throw new Error('Failed invalid JSON check');
if (p.parseConfig('{"a":1}').a !== 1) throw new Error('Failed valid JSON check');
console.log("ALL TESTS PASSED");
