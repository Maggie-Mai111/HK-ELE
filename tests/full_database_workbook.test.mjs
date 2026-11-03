import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const release=JSON.parse(readFileSync(new URL('full_database_workbook.json',root),'utf8'));
function zipEntry(bytes,name){
 let end=bytes.length-22;while(end>=0&&bytes.readUInt32LE(end)!==0x06054b50)end--;
 assert.ok(end>=0);let at=bytes.readUInt32LE(end+16);
 for(let i=0;i<bytes.readUInt16LE(end+10);i++){
  assert.equal(bytes.readUInt32LE(at),0x02014b50);
  const size=bytes.readUInt32LE(at+20),n=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),method=bytes.readUInt16LE(at+10),offset=bytes.readUInt32LE(at+42);
  if(bytes.subarray(at+46,at+46+n).toString()===name){const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);const data=bytes.subarray(start,start+size);return (method===8?inflateRawSync(data):data).toString();}
  at+=46+n+extra+comment;
 }
 throw new Error('Workbook entry missing: '+name);
}
test('full-database link points to the complete pinned workbook, separately from teaching-list export',()=>{
 const html=readFileSync(new URL('index.html',root),'utf8');
 assert.ok(html.includes('type="button">Download full database (.xlsx)</button>'));
 assert.ok(html.includes('id="download-full-database"'));assert.ok(html.includes('id="export-xlsx"'));
 const bytes=readFileSync(new URL(release.assetPath,root));
 assert.equal(bytes.length,release.byteSize);assert.equal(createHash('sha256').update(bytes).digest('hex'),release.sha256);
 const workbook=zipEntry(bytes,'xl/workbook.xml');
 assert.equal((workbook.match(/<x:sheet /g)||[]).length,1);
 assert.ok(workbook.includes('name="Word information"'));
 assert.ok(zipEntry(bytes,'xl/tables/table1.xml').includes('ref="A1:P328254"'));
});
