import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { docxXmlToText, odfXmlToText, decodeEntities } from '../src/xmltext.js';
import { extractText } from '../src/extract.js';

test('decodeEntities handles named and numeric entities', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#65;&#x42;'), 'a & b <c> "d" AB');
  assert.equal(decodeEntities('&unknown; stays'), '&unknown; stays');
});

test('docxXmlToText joins runs, handles tabs and breaks, skips empty paragraphs', () => {
  const xml =
    '<w:body>' +
    '<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t xml:space="preserve">world</w:t></w:r></w:p>' +
    '<w:p></w:p>' +
    '<w:p><w:r><w:t>A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>B</w:t><w:br/><w:t>C &amp; D</w:t></w:r></w:p>' +
    '<w:p><w:tbl/><w:r><w:instrText>HYPERLINK</w:instrText></w:r></w:p>' +
    '</w:body>';
  assert.equal(docxXmlToText(xml), 'Hello world\n\nA\tB\nC & D');
});

test('odfXmlToText handles headings, spans, spaces, tabs and ignores empty paragraphs', () => {
  const xml =
    '<office:text>' +
    '<text:h text:outline-level="1">Title</text:h>' +
    '<text:p text:style-name="P1"/>' +
    '<text:p>One<text:s text:c="2"/>two<text:tab/>three<text:line-break/>four</text:p>' +
    '<text:p><text:span text:style-name="T1">Bold</text:span> &amp; plain</text:p>' +
    '</office:text>';
  assert.equal(odfXmlToText(xml), 'Title\n\nOne  two\tthree\nfour\n\nBold & plain');
});

const file = (bytes, name) => new File([bytes], name);

test('extractText reads a DOCX built in memory', async () => {
  const zip = zipSync({
    'word/document.xml': strToU8('<w:p><w:r><w:t>From docx</w:t></w:r></w:p>'),
  });
  assert.equal(await extractText(file(zip, 'Report.DOCX')), 'From docx');
});

test('extractText reads an ODT built in memory', async () => {
  const zip = zipSync({ 'content.xml': strToU8('<text:p>From odt</text:p>') });
  assert.equal(await extractText(file(zip, 'a.odt')), 'From odt');
});

test('extractText reads plain text and markdown', async () => {
  assert.equal(await extractText(file('# Hi', 'a.md')), '# Hi');
  assert.equal(await extractText(file('plain', 'a.txt')), 'plain');
});

test('extractText gives friendly errors', async () => {
  await assert.rejects(extractText(file('x', 'old.doc')), /\.doc files are not supported/);
  await assert.rejects(extractText(file('x', 'pic.png')), /Unsupported file type/);
  await assert.rejects(extractText(file('   ', 'empty.txt')), /No text found/);
  await assert.rejects(extractText(file('not a zip', 'bad.docx')), /couldn't be opened/);
  const emptyDocx = zipSync({ 'word/document.xml': strToU8('<w:p></w:p>') });
  await assert.rejects(extractText(file(emptyDocx, 'blank.docx')), /No text found/);
  const wrongZip = zipSync({ 'other.xml': strToU8('x') });
  await assert.rejects(extractText(file(wrongZip, 'wrong.docx')), /missing word\/document\.xml/);
});
