import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const dataDirectory = path.join(root, 'data');

function cleanTestRuntimeFiles() {
  if (!fs.existsSync(dataDirectory)) return;
  for (const name of fs.readdirSync(dataDirectory)) {
    if (/^test-runtime-.*\.json(?:\.bak|\.corrupt-\d+)?$/.test(name)) {
      fs.rmSync(path.join(dataDirectory, name), { force: true });
    }
  }
}

const requested = process.argv.slice(2);
const tests = requested.length
  ? requested
  : fs.readdirSync(path.join(root, 'tests'))
      .filter((name) => name.endsWith('.test.ts'))
      .sort()
      .map((name) => path.join('tests', name));

cleanTestRuntimeFiles();
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...tests],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  },
);
cleanTestRuntimeFiles();

if (result.error) {
  console.error(`Test runner failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
