import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve('dist');
const files = (await readdir(distDir, { recursive: true }))
  .filter((file) => file.endsWith('.js'));

if (files.length === 0) {
  throw new Error('No emitted JavaScript files found in dist. Run the production build first.');
}

const bareImports = [];
const importPattern = /\bimport\s*(?:[\w*${},\s]*\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const isBareSpecifier = (specifier) => !/^(?:\.{1,2}\/|\/|[a-zA-Z][a-zA-Z\d+.-]*:)/.test(specifier);

for (const file of files) {
  const source = await readFile(resolve(distDir, file), 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    if (isBareSpecifier(specifier)) bareImports.push(`${file}: ${specifier}`);
  }
}

if (bareImports.length > 0) {
  throw new Error(`Unresolved bare imports found in emitted bundle:\n${bareImports.join('\n')}`);
}

console.log(`Bundle check passed: ${files.length} JavaScript file(s) contain no unresolved bare imports.`);
