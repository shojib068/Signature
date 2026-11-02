import { describe, expect, it } from 'vitest';
import { documentXml, para } from '../../test/fixtures';
import { findTopLevelParagraphs, helperDestIndex, injectParagraphBookmarks, insertIntoParagraphs, mainPrefix, maxNumericId, sectionPageWidthsPt } from './wordXml';

const TABLE = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>in table</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';

describe('findTopLevelParagraphs', () => {
  it('finds body paragraphs, including self-closing ones, and skips table paragraphs', () => {
    const xml = documentXml(para('one') + '<w:p/>' + TABLE + para('two', '<w:jc w:val="center"/>'));
    const spans = findTopLevelParagraphs(xml);
    expect(spans).toHaveLength(3);
    expect(xml.slice(spans[0].start, spans[0].end)).toBe(para('one'));
    expect(spans[1].selfClosing).toBe(true);
    expect(xml.slice(spans[2].start, spans[2].contentStart)).toBe('<w:p><w:pPr><w:jc w:val="center"/></w:pPr>');
  });

  it('is not fooled by ">" inside attribute values or by comments', () => {
    const xml = documentXml('<!-- <w:p> --><w:p w:rsidR="a>b"><w:r><w:t>x</w:t></w:r></w:p>');
    const spans = findTopLevelParagraphs(xml);
    expect(spans).toHaveLength(1);
    expect(xml.slice(spans[0].start, spans[0].end)).toBe('<w:p w:rsidR="a>b"><w:r><w:t>x</w:t></w:r></w:p>');
  });

  it('supports a non-standard prefix for the main namespace', () => {
    const xml = documentXml(para('a')).replace(/w:/g, 'ns0:').replace('xmlns:w=', 'xmlns:ns0=');
    expect(mainPrefix(xml)).toBe('ns0');
    expect(findTopLevelParagraphs(xml)).toHaveLength(1);
  });
});

describe('injectParagraphBookmarks', () => {
  it('adds one sigp_n bookmark per top-level paragraph, after pPr, with fresh ids', () => {
    const xml = documentXml(
      '<w:p><w:bookmarkStart w:id="7" w:name="mine"/><w:bookmarkEnd w:id="7"/></w:p>' + para('b', '<w:jc w:val="left"/>') + '<w:p/>' + TABLE,
    );
    const out = injectParagraphBookmarks(xml);
    const names = [...out.matchAll(/w:name="(sigp_\d+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['sigp_0', 'sigp_1', 'sigp_2']);
    expect(out).toContain('<w:pPr><w:jc w:val="left"/></w:pPr><w:bookmarkStart w:id="9" w:name="sigp_1"/>');
    expect(out).toContain('<w:p><w:bookmarkStart w:id="10" w:name="sigp_2"/><w:bookmarkEnd w:id="10"/></w:p>');
    // The table paragraph is untouched, and the scanner still sees the same paragraphs.
    expect(out).toContain(TABLE);
    expect(findTopLevelParagraphs(out)).toHaveLength(3);
  });
});

describe('insertIntoParagraphs', () => {
  it('can add at the start and the end of the same paragraph', () => {
    const xml = documentXml(para('x'));
    const out = insertIntoParagraphs(xml, findTopLevelParagraphs(xml), new Map([[0, { start: '<A/>', end: '<B/>' }]]));
    expect(out).toContain('<w:p><A/><w:r><w:t>x</w:t></w:r><B/></w:p>');
  });
});

describe('helpers', () => {
  it('reads the largest w:id and section page widths', () => {
    const xml = documentXml('<w:p><w:ins w:id="42"/></w:p>');
    expect(maxNumericId(xml)).toBe(42);
    expect(sectionPageWidthsPt(xml)).toEqual([595.3]);
  });
});

describe('helperDestIndex', () => {
  it('reads both the raw and the LibreOffice-escaped names', () => {
    expect(helperDestIndex('sigp_12')).toBe(12);
    expect(helperDestIndex('sigp5F3')).toBe(3);
    expect(helperDestIndex('chapter_1')).toBeNull();
    expect(helperDestIndex('sigp_x')).toBeNull();
  });
});
