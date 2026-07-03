const auth = require('./auth.js');
const fs = require('fs');
if (!fs.existsSync('session.js') || !fs.existsSync('verify.js')) throw new Error('session.js or verify.js missing');
const token = auth.login('admin', 'secret');
if (!token) throw new Error('login failed');
if (!auth.logout(token)) throw new Error('logout failed');
console.log("ALL TESTS PASSED");
