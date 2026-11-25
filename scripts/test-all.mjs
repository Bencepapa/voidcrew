import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputLimit = 8 * 1024;
const usage = 'Usage: npm test -- [filter] [--jobs N] [--timeout S] [--list] [--bail] [--quiet]';

function parseOptions(args) {
  const options = {
    jobs: Math.max(1, Math.floor(availableParallelism() / 2)),
    timeout: 120,
    list: false,
    bail: false,
    quiet: false,
    filter: '',
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    switch (arg) {
      case '--jobs':
      case '--timeout': {
        const value = args[++index];
        const number = Number(value);
        const max = arg === '--timeout' ? Math.floor(2_147_483_647 / 1000) : Number.MAX_SAFE_INTEGER;
        if (!/^\d+$/.test(value ?? '') || number < 1 || number > max) {
          throw new Error(`${arg} expects a positive integer up to ${max}`);
        }
        options[arg.slice(2)] = number;
        break;
      }
      case '--list':
      case '--bail':
      case '--quiet':
        options[arg.slice(2)] = true;
        break;
      default:
        if (!arg || arg.startsWith('-') || options.filter) throw new Error(`Unexpected argument: ${arg}`);
        options.filter = arg.replaceAll('\\', '/').replace(/^\.\//, '');
    }
  }
  return options;
}

async function discover(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...await discover(path));
    else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) paths.push(path);
  }
  return paths;
}

function runTest(file, timeout) {
  return new Promise(resolve => {
    const start = performance.now();
    const child = spawn(process.execPath, ['--import', 'tsx', file], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = Buffer.alloc(0);
    let truncated = false;
    let failure = '';

    function capture(chunk) {
      const combined = Buffer.concat([output, chunk]);
      truncated ||= combined.length > outputLimit;
      output = combined.subarray(-outputLimit);
    }

    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', error => { failure ||= error.message; });
    // Use a hard kill so a test cannot ignore its deadline.
    const timer = setTimeout(() => {
      failure = `timed out after ${timeout}s`;
      child.kill('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
    }, timeout * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) failure ||= signal ? `terminated by ${signal}` : `exit code ${code}`;
      resolve({
        file,
        failure,
        seconds: (performance.now() - start) / 1000,
        output: failure ? output.toString('utf8').trimEnd() : '',
        truncated,
      });
    });
  });
}

async function main(args) {
  let options;
  try {
    options = parseOptions(args);
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    return 1;
  }

  const start = performance.now();
  const discovered = (await Promise.all(['src', 'scripts'].map(discover))).flat().sort();
  const files = discovered.filter(file =>
    !options.filter || file.includes(options.filter) || posix.matchesGlob(file, options.filter));

  if (options.list) {
    for (const file of files) console.log(file);
    return 0;
  }
  if (files.length === 0) {
    console.error('No test files matched.');
    return 1;
  }

  let next = 0;
  const results = [];
  const failures = [];
  const duration = seconds => `${seconds.toFixed(2)}s`;

  async function worker() {
    while (next < files.length && !(options.bail && failures.length)) {
      const result = await runTest(files[next++], options.timeout);
      results.push(result);
      if (result.failure) failures.push(result);
      if (!options.quiet) {
        console.log(`${result.failure ? 'FAIL' : 'ok'} ${result.file} (${duration(result.seconds)})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.jobs, files.length) }, worker));
  const total = duration((performance.now() - start) / 1000);
  console.log(`\n${results.length}/${files.length} files run, ${results.length - failures.length} passed, ${failures.length} failed, ${files.length - results.length} skipped in ${total}`);
  for (const result of failures) {
    console.log(`\nFAIL ${result.file} (${result.failure})`);
    if (result.truncated) console.log('[showing the last 8 KiB of stdout and stderr]');
    if (result.output) console.log(result.output);
  }

  console.log('\nSlowest files');
  results.sort((a, b) => b.seconds - a.seconds);
  for (const result of results.slice(0, 5)) console.log(`  ${duration(result.seconds)}  ${result.file}`);
  return failures.length ? 1 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
