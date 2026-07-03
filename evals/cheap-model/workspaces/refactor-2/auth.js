const sessions = {};
const users = { 'admin': 'secret' };

function login(username, password) {
  if (users[username] === password) {
    const sessionId = Math.random().toString(36).substring(2);
    sessions[sessionId] = username;
    return sessionId;
  }
  return null;
}

function logout(sessionId) {
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    return true;
  }
  return false;
}

module.exports = { login, logout };
