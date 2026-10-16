/* Actual distributed snippets run at their external API boundaries. No browser,
 * game engine, real GitNexus index or MCP transport is exercised by this probe. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const Handlebars = require("handlebars");

const root = process.argv[3] || path.resolve(__dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;

async function mcpArguments() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fw-mcp-example-"));
  const previousPath = process.env.PATH;
  try {
    const bin = path.join(temporary, "bin");
    fs.mkdirSync(bin);
    const log = path.join(temporary, "argv.jsonl");
    const cwdLog = path.join(temporary, "cwd.jsonl");
    const cliSource = `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nrequire('node:fs').appendFileSync(${JSON.stringify(cwdLog)}, JSON.stringify(process.cwd()) + '\\n');\nconsole.log('fixture result');\n`;
    const cliPath = path.join(temporary, "gitnexus.cjs");
    fs.writeFileSync(cliPath, cliSource);
    fs.writeFileSync(
      path.join(bin, "gitnexus"),
      `#!${process.execPath}\n${cliSource}`,
      { mode: 0o700 },
    );
    process.env.PATH = bin + path.delimiter + previousPath;
    let server;
    class Server {
      handlers = new Map();
      constructor() {
        server = this;
      }
      setRequestHandler(schema, handler) {
        this.handlers.set(schema, handler);
      }
      async connect() {}
    }
    const fakeRequire = (id) => {
      if (id.endsWith("/server/index.js")) return { Server };
      if (id.endsWith("/server/stdio.js"))
        return { StdioServerTransport: class {} };
      if (id.endsWith("/types.js"))
        return {
          CallToolRequestSchema: "call",
          ListToolsRequestSchema: "list",
        };
      if (id === "module" || id === "node:module")
        return {
          findPackageJSON: () => path.join(temporary, "a/b/package.json"),
          createRequire: () => ({
            resolve: (name) => {
              assert.equal(name, "gitnexus/dist/cli/index.js");
              return cliPath;
            },
          }),
        };
      if (id === "url")
        return { fileURLToPath: () => path.join(temporary, "a/b/server.js") };
      return require(id);
    };
    let source = Handlebars.compile(
      read("skills/mcp-generator/templates/server.ts.hbs"),
    )({
      projectName: "Fixture",
      projectNameLowerCase: "fixture",
      generatedAt: "fixture",
    });
    source = source.replaceAll(
      "import.meta.url",
      JSON.stringify("file:///fixture/server.js"),
    );
    vm.runInNewContext(
      compile(source),
      {
        require: fakeRequire,
        exports: {},
        process: { title: "", execPath: process.execPath },
        console: { error() {} },
      },
      { timeout: 1000 },
    );
    const handler = server.handlers.get("call");
    const expectedArgv = [];
    const markers = [];
    for (const [name, key, command] of [
      ["project_query", "query", "query"],
      ["project_context", "name", "context"],
      ["project_impact", "target", "impact"],
    ]) {
      const marker = path.join(temporary, command + "-injected");
      markers.push(marker);
      const value = `literal $(printf injected > ${marker})`;
      await handler({ params: { name, arguments: { [key]: value } } });
      expectedArgv.push([command, "--", value]);
      await handler({
        params: {
          name,
          arguments: { [key]: '--repo=untrusted with spaces "quoted"' },
        },
      });
      expectedArgv.push([
        command,
        "--",
        '--repo=untrusted with spaces "quoted"',
      ]);
    }
    const sideEffects = markers
      .filter((marker) => fs.existsSync(marker))
      .map((p) => path.basename(p));
    let invalidRequestsRejected = 0;
    for (const value of [
      undefined,
      "",
      " \t\n",
      [],
      { query: "nested" },
      7,
      "x".repeat(4097),
      "\0",
    ]) {
      try {
        const response = await handler({
          params: { name: "project_query", arguments: { query: value } },
        });
        if (response.isError === true) invalidRequestsRejected++;
      } catch {
        invalidRequestsRejected++;
      }
    }
    let unknownToolRejected = false;
    try {
      await handler({
        params: { name: "unknown_tool", arguments: { query: "hello" } },
      });
    } catch {
      unknownToolRejected = true;
    }
    const argv = fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const cwdCorrect = fs
      .readFileSync(cwdLog, "utf8")
      .trim()
      .split("\n")
      // Node resolves cwd through filesystem aliases, including macOS /var.
      .every((line) => JSON.parse(line) === fs.realpathSync(temporary));
    return {
      sideEffects,
      argv,
      expectedArgv,
      invalidRequestsRejected,
      unknownToolRejected,
      cwdCorrect,
    };
  } finally {
    process.env.PATH = previousPath;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function projectiles() {
  const blocks = [
    ...read("skills/game-engineer/LITE.md").matchAll(
      /```typescript\n([\s\S]*?)```/g,
    ),
  ];
  const source = blocks.find((match) =>
    match[1].includes("export class ProjectileManager"),
  )?.[1];
  assert.ok(source, "ProjectileManager example exists");
  const exported = {};
  vm.runInNewContext(
    compile(source),
    {
      exports: exported,
      require: () => ({
        default: { Physics: { Arcade: { Image: class {} } } },
      }),
    },
    { timeout: 1000 },
  );
  const make = () => {
    const bullet = {
      active: false,
      visible: false,
      y: 0,
      body: {
        enable: true,
        velocity: { y: 0 },
        setVelocityY(v) {
          this.velocity.y = v;
        },
      },
      setActive(v) {
        this.active = v;
        return this;
      },
      setVisible(v) {
        this.visible = v;
        return this;
      },
      setVelocityY(v) {
        this.body.setVelocityY(v);
        return this;
      },
      enableBody(reset, x, y, active, visible) {
        if (reset) this.y = y;
        this.body.enable = true;
        this.active = active;
        this.visible = visible;
        return this;
      },
      disableBody(disable, hide) {
        this.body.enable = false;
        if (disable) this.active = false;
        if (hide) this.visible = false;
        return this;
      },
    };
    const group = {
      get(x, y) {
        if (bullet.active) return null;
        bullet.y = y;
        return bullet;
      },
      getChildren() {
        return [bullet];
      },
      killAndHide(target) {
        target.active = false;
        target.visible = false;
      },
    };
    const scene = { physics: { add: { group: () => group } } };
    return { bullet, manager: new exported.ProjectileManager(scene) };
  };
  const distances = [30, 60, 120].map((fps) => {
    const { bullet, manager } = make();
    manager.fireBullet(10, 1000, 600, 1 / fps);
    const initialY = bullet.y;
    // Arcade Body velocity is pixels/second; integrate for exactly one second.
    for (let frame = 0; frame < fps; frame++)
      bullet.y += bullet.body.velocity.y / fps;
    return initialY - bullet.y;
  });
  const { bullet, manager } = make();
  manager.fireBullet(10, 10, 600, 1 / 60);
  bullet.y = -1;
  manager.update();
  const inactiveBodyEnabled = bullet.body.enable;
  manager.fireBullet(20, 1000, 600, 1 / 60);
  const reuse = {
    active: bullet.active,
    visible: bullet.visible,
    enabled: bullet.body.enable,
  };
  return { distances, inactiveBodyEnabled, reuse };
}

const probes = { "mcp-arguments": mcpArguments, projectiles };
Promise.resolve()
  .then(() => {
    assert.ok(probes[process.argv[2]], "known probe");
    return probes[process.argv[2]]();
  })
  .then((result) => process.stdout.write(JSON.stringify(result) + "\n"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
