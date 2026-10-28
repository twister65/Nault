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
