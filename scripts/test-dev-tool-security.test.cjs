'use strict';
// Dependabot #222/#152: brace-expansion DoS; #126/#49: tmp path escape.
// Keep existing minimatch/brace-expansion majors (1/2/5), and tmp 0.2.x.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const pkg=require('../package.json');
const lock=require('../package-lock.json');
const pk=lock.packages;
function resolve(from,name){
  for(let current=from;;){
    const key=(current?current+'/':'')+'node_modules/'+name;
    if(pk[key])return {path:key,entry:pk[key]};
    if(!current)return null;
    const i=current.lastIndexOf('/node_modules/');
    current=i<0?'':current.slice(0,i);
  }
}
test('all brace-expansion versions are patched within their respective major',()=>{
  assert.equal(pkg.devDependencies['brace-expansion'],'1.1.21');
  const min={1:[1,1,21],2:[2,1,7],3:[3,0,9],5:[5,0,12]};
  const copies=Object.entries(pk).filter(([name])=>
    name==='node_modules/brace-expansion'||name.endsWith('/node_modules/brace-expansion'));
  assert.ok(copies.length>0);
  for(const [name,entry] of copies){
    const v=entry.version.split('.').map(Number);
    assert.ok(min[v[0]],'unexpected brace-expansion major at '+name);
    const m=min[v[0]];
    const okay=v[0]>m[0]||(v[0]===m[0]&&(v[1]>m[1]||(v[1]===m[1]&&v[2]>=m[2])));
    assert.ok(okay,name+' still vulnerable: '+entry.version);
    assert.match(entry.integrity||'',/^sha512-/,name);
  }
  assert.equal(resolve('node_modules/minimatch','brace-expansion')?.entry.version,'1.1.21');
  assert.equal(resolve('node_modules/filelist/node_modules/minimatch','brace-expansion')?.entry.version,'2.1.7');
});
test('tmp is patched for all test-runner consumers',()=>{
  assert.equal(pkg.overrides.tmp,'0.2.7');
  const copies=Object.entries(pk).filter(([name])=>
    name==='node_modules/tmp'||name.endsWith('/node_modules/tmp'));
  assert.ok(copies.length>0);
  for(const [name,entry] of copies){
    assert.equal(entry.version,'0.2.7',name);
    assert.match(entry.integrity||'',/^sha512-/,name);
    assert.equal(entry.dev,true,name+' must remain development-only');
  }
  assert.equal(resolve('node_modules/karma','tmp')?.entry.version,'0.2.7');
  assert.equal(resolve('node_modules/tmp-promise','tmp')?.entry.version,'0.2.7');
  assert.equal(pk['node_modules/karma']?.version,'6.3.19');
});
test('patched API keeps ordinary brace expansions and tmp creation working',()=>{
  const expand=require('brace-expansion');
  assert.deepEqual(expand('a{1,2}b'),['a1b','a2b']);
  const tmp=require('tmp');
  const file=tmp.fileSync({prefix:'nault-ci-',postfix:'.tmp'});
  assert.ok(file.name.startsWith(os.tmpdir()+path.sep));
  assert.ok(fs.existsSync(file.name));
  file.removeCallback();
  assert.equal(fs.existsSync(file.name),false);
});

test('Karma body-parser and ts-node diff resolve patched development-only copies',()=>{
  for(const [name,release,parent] of [
    ['body-parser','1.20.9','node_modules/karma'],
    ['diff','3.5.1','node_modules/ts-node']
  ]){
    assert.equal(pkg.overrides[name],release);
    const copies=Object.entries(pk).filter(([key])=>
      key==='node_modules/'+name||key.endsWith('/node_modules/'+name));
    assert.ok(copies.length>0,name+' missing from lockfile');
    for(const [key,entry] of copies){
      assert.equal(entry.version,release,key);
      assert.equal(entry.dev,true,key+' must remain development-only');
      assert.match(entry.integrity||'',/^sha512-/,key);
    }
    assert.equal(resolve(parent,name)?.entry.version,release,parent);
  }
});

test('patched diff preserves patch round trips used by developer tooling',()=>{
  const diff=require('diff');
  const before='first\nsecond\n';
  const after='first\nupdated\nthird\n';
  const patch=diff.createPatch('sample.txt',before,after);
  assert.equal(diff.parsePatch(patch).length,1);
  assert.equal(diff.applyPatch(before,patch),after);
});

test('follow-redirects is patched in Karma HTTP proxy tooling',()=>{
  assert.equal(pkg.overrides['follow-redirects'],'1.16.2');
  const copy=resolve('node_modules/http-proxy','follow-redirects');
  assert.ok(copy,'http-proxy should resolve follow-redirects');
  assert.equal(copy.entry.version,'1.16.2');
  assert.equal(copy.entry.dev,true,'redirect handling here is dev-only');
  assert.match(copy.entry.integrity||'',/^sha512-/);
});

test('affected minimatch 10.x and Electron universal consumers use patched v11, legacy APIs remain',()=>{
  assert.equal(pkg.overrides['minimatch@^10.0.0'],'11.0.3');
  assert.equal(pkg.overrides['@electron/universal']?.minimatch,'11.0.3');
  for(const parent of [
    'node_modules/@eslint/config-array',
    'node_modules/@typescript-eslint/typescript-estree',
    'node_modules/app-builder-lib',
    'node_modules/eslint'
  ]){
    const dependency=resolve(parent,'minimatch');
    assert.ok(dependency,parent+' needs minimatch');
    assert.equal(dependency.entry.version,'11.0.3',parent);
    assert.equal(dependency.entry.dev,true,parent);
    assert.match(dependency.entry.integrity||'',/^sha512-/);
    assert.equal(dependency.entry.dependencies?.['@isaacs/nonrecursive-glob-match'],'^1.0.3');
  }
  const copies=Object.entries(pk).filter(([key])=>key.endsWith('/minimatch'));
  assert.ok(copies.length>=6,'expected legacy and modern minimatch consumers');
  for(const [name,entry] of copies)
    assert.ok(!['9.0.9','10.2.6'].includes(entry.version),name+' remains flagged by Dependabot: '+entry.version);
  assert.equal(resolve('node_modules/@electron/universal','minimatch')?.entry.version,'11.0.3');
  assert.equal(resolve('node_modules/karma','minimatch')?.entry.version,'3.1.5');
  assert.equal(resolve('node_modules/@electron/asar','minimatch')?.entry.version,'3.1.5');
  assert.equal(resolve('node_modules/dir-compare','minimatch')?.entry.version,'3.1.5');
  assert.equal(resolve('node_modules/filelist','minimatch')?.entry.version,'5.1.9');
  assert.equal(pk['node_modules/@isaacs/nonrecursive-glob-match']?.version,'1.0.3');
});

test('Electron universal resolves minimatch v11 with matchBase patterns',()=>{
  const {createRequire}=require('node:module');
  const universalRequire=createRequire(path.resolve(__dirname,'../node_modules/@electron/universal/package.json'));
  const minimatch=universalRequire('minimatch');
  assert.equal(typeof minimatch.minimatch,'function','CJS named minimatch export required by universal 2.x');
  assert.equal(minimatch.minimatch('Contents/Frameworks/Helper.app','*.app',{matchBase:true}),true);
  assert.equal(minimatch.minimatch('Contents/Frameworks/Helper.app','*.asar',{matchBase:true}),false);
  assert.equal(minimatch.minimatch('Contents/Resources/app.asar','**/*.asar',{matchBase:true}),true);
});
