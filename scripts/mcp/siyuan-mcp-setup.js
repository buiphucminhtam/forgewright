#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const HOME = os.homedir();
const CURSOR_MCP_PATH = path.join(HOME, '.cursor/mcp.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME, 'Library/Application Support/Claude/claude_desktop_config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('==================================================');
console.log('🔌 SIYUAN NOTE MCP INTEGRATOR');
console.log('==================================================');

rl.question('🔑 Nhập SiYuan API Token của bạn (lấy từ Settings > About): ', (token) => {
  token = token.trim();
  if (!token) {
    console.log('❌ Token không được để trống.');
    rl.close();
    process.exit(1);
  }

  // 1. Update Cursor mcp.json
  try {
    let cursorConfig = { mcpServers: {} };
    if (fs.existsSync(CURSOR_MCP_PATH)) {
      cursorConfig = JSON.parse(fs.readFileSync(CURSOR_MCP_PATH, 'utf8'));
      cursorConfig.mcpServers = cursorConfig.mcpServers || {};
    }
    
    cursorConfig.mcpServers.siyuan = {
      command: "npx",
      args: ["-y", "siyuan-agent-mcp"],
      env: {
        SIYUAN_API_TOKEN: token,
        SIYUAN_API_URL: "http://127.0.0.1:6806"
      }
    };

    fs.writeFileSync(CURSOR_MCP_PATH, JSON.stringify(cursorConfig, null, 2), 'utf8');
    console.log(`\n✓ Đã cấu hình SiYuan MCP cho Cursor tại: ${CURSOR_MCP_PATH}`);
  } catch (err) {
    console.log(`❌ Lỗi khi cấu hình cho Cursor: ${err.message}`);
  }

  // 2. Update Claude Desktop Config
  try {
    let claudeConfig = { mcpServers: {} };
    if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      claudeConfig = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8'));
      claudeConfig.mcpServers = claudeConfig.mcpServers || {};
    } else {
      // Create directories if needed
      const parentDir = path.dirname(CLAUDE_SETTINGS_PATH);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    claudeConfig.mcpServers.siyuan = {
      command: "npx",
      args: ["-y", "siyuan-agent-mcp"],
      env: {
        SIYUAN_API_TOKEN: token,
        SIYUAN_API_URL: "http://127.0.0.1:6806"
      }
    };

    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(claudeConfig, null, 2), 'utf8');
    console.log(`✓ Đã cấu hình SiYuan MCP cho Claude Desktop tại: ${CLAUDE_SETTINGS_PATH}`);
  } catch (err) {
    console.log(`❌ Lỗi khi cấu hình cho Claude Desktop: ${err.message}`);
  }

  console.log('\n==================================================');
  console.log('✅ Hoàn tất cấu hình! Vui lòng khởi động lại Cursor hoặc Claude để áp dụng.');
  console.log('==================================================');
  rl.close();
});
