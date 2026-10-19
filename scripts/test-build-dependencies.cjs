// Exercise tar's consumer-resolved API after the 6.x -> 7.x security upgrade.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pipeline } = require('node:stream/promises');
const { createRequire } = require('node:module');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nault-tar-'));
  try {
    await fs.mkdir(path.join(root, 'source'));
    await fs.writeFile(path.join(root, 'source', 'test.h'), 'nault compatibility\n');
    await fs.writeFile(path.join(root, 'source', 'ignored.txt'), 'filtered');
    const archive = path.join(root, 'test.tgz');
    await require('tar').c({ gzip: true, file: archive, cwd: root }, ['source']);
    for (const consumer of ['node-gyp', '@electron/rebuild', 'app-builder-lib']) {
      const consumerRequire = createRequire(require.resolve(consumer + '/package.json'));
      const tar = consumerRequire('tar');
      const destination = path.join(root, consumer.replace('/', '-'));
      await fs.mkdir(destination);
      await pipeline(createReadStream(archive), tar.x({
        cwd: destination, strip: 1, filter: name => name.endsWith('.h')
      }));
      assert.equal(await fs.readFile(path.join(destination, 'test.h'), 'utf8'), 'nault compatibility\n');
      await assert.rejects(fs.stat(path.join(destination, 'ignored.txt')), { code: 'ENOENT' });
      console.log('PASS tar stream/strip/filter through ' + consumer);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
