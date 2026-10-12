import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('package-lock.json', root), 'utf8'));
test('npm ci has a consistent canonical lockfile for every direct dependency', () => {
 assert.equal(lock.lockfileVersion, 3);
 assert.equal(lock.name, manifest.name);
 assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
 assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
 assert.match(manifest.packageManager, /^npm@11\.13\.0$/);
 for (const name of [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]) {
  assert.ok(lock.packages[`node_modules/${name}`]?.version, `Missing locked package: ${name}`);
 }
 assert.equal(fs.existsSync(new URL('pnpm-lock.yaml', root)), false, 'Only one canonical dependency lock should be published');
});
test('locked registry tarballs are integrity-pinned and contain no URL credentials', () => {
 for (const [name, pkg] of Object.entries(lock.packages) as Array<[string, {resolved?: string; integrity?: string; link?: boolean; inBundle?: boolean}]>) {
  if (!name || pkg.link) continue;
  if (pkg.inBundle) {
   const parent = name.slice(0, name.lastIndexOf('/node_modules/'));
   assert.ok(lock.packages[parent]?.integrity, `Bundle parent must be integrity-pinned: ${name}`);
   continue;
  }
  assert.ok(pkg.integrity, `Unpinned integrity: ${name}`);
  const url = new URL(pkg.resolved!);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'registry.npmjs.org');
  assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.search, '');
 }
});
