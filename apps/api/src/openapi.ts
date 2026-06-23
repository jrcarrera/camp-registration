import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(currentDirectory, '../../../packages/contracts/openapi');
const outputFile = resolve(outputDirectory, 'openapi.json');

const app = await buildApp();
await app.ready();

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify(app.swagger(), null, 2)}\n`, 'utf8');
await app.close();

process.stdout.write(`Wrote ${outputFile}\n`);
