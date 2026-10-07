(function (root) {
  'use strict';

  const encoder = new TextEncoder();
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const xmlEscape = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const normalizeLine = value => String(value ?? '').trim().replace(/[\t ]+/g, ' ');
  const normalizeMultiline = value => String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim().replace(/[\t ]+/g, ' '))
    .filter(Boolean);

  const bytes = value => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return encoder.encode(String(value));
  };

  const concatBytes = parts => {
    const arrays = parts.map(bytes);
    const length = arrays.reduce((sum, item) => sum + item.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    arrays.forEach(item => {
      output.set(item, offset);
      offset += item.length;
    });
    return output;
  };

  const le16 = value => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  const le32 = value => new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);

  let crcTable;
  const getCrcTable = () => {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  };

  const crc32 = data => {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const dosDateTime = date => {
    const year = Math.max(1980, date.getFullYear());
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
    const day = ((year - 1980) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
    return { time, day };
  };

  const buildStoredZip = entries => {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const now = dosDateTime(new Date());

    entries.forEach(entry => {
      const name = encoder.encode(entry.name);
      const data = bytes(entry.data);
      const crc = crc32(data);
      const local = concatBytes([
        le32(0x04034b50), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.day),
        le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), name, data
      ]);
      localParts.push(local);

      const central = concatBytes([
        le32(0x02014b50), le16(20), le16(20), le16(0x0800), le16(0), le16(now.time), le16(now.day),
        le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0),
        le32(0), le32(localOffset), name
      ]);
      centralParts.push(central);
      localOffset += local.length;
    });

    const localData = concatBytes(localParts);
    const centralData = concatBytes(centralParts);
    const end = concatBytes([
      le32(0x06054b50), le16(0), le16(0), le16(entries.length), le16(entries.length),
      le32(centralData.length), le32(localData.length), le16(0)
    ]);
    return concatBytes([localData, centralData, end]);
  };

  const run = (text, options = {}) => {
    const props = [
      options.bold ? '<w:b/>' : '',
      options.italic ? '<w:i/>' : '',
      options.color ? `<w:color w:val="${options.color}"/>` : '',
      options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
      options.font ? `<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}" w:eastAsia="${options.font}" w:cs="${options.font}"/>` : ''
    ].join('');
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  };

  const paragraph = (content, options = {}) => {
    const properties = [
      options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
      options.align ? `<w:jc w:val="${options.align}"/>` : '',
      options.before || options.after || options.line ? `<w:spacing${options.before ? ` w:before="${options.before}"` : ''}${options.after ? ` w:after="${options.after}"` : ''}${options.line ? ` w:line="${options.line}" w:lineRule="auto"` : ''}/>` : '',
      options.keepNext ? '<w:keepNext/>' : '',
      options.topBorder ? `<w:pBdr><w:top w:val="single" w:sz="${options.topBorder.size || 6}" w:space="${options.topBorder.space || 10}" w:color="${options.topBorder.color || 'D6C4B3'}"/></w:pBdr>` : ''
    ].join('');
    const body = Array.isArray(content) ? content.join('') : run(content, options.run || {});
    return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${body}</w:p>`;
  };

  const textParagraphs = (value, options = {}) => {
    const lines = normalizeMultiline(value);
    if (!lines.length) return paragraph('—', { run: { color: '6F6F6F', italic: true } });
    return lines.map(line => paragraph(line, options)).join('');
  };

  const cell = (label, value, options = {}) => {
    const width = options.width || 4680;
    const fill = options.fill || 'F6F1EB';
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="155" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:bottom w:w="155" w:type="dxa"/><w:right w:w="220" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${paragraph(label.toUpperCase(), { after: 80, run: { font: 'Arial', size: 15, bold: true, color: '8A7462' } })}${paragraph(value || '—', { after: 0, run: { font: 'Arial', size: 20, bold: true, color: '171A16' } })}</w:tc>`;
  };

  const metaTable = data => `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr>${cell('Автор', data.name)}${cell('Роль', data.role, { fill: 'F1F3EF' })}</w:tr><w:tr>${cell('Контакт', data.contact, { fill: 'F1F3EF' })}${cell('Дата', data.date)}</w:tr></w:tbl>`;

  const contentBox = (label, title, value, accent, fill) => `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:right w:val="nil"/><w:bottom w:val="nil"/><w:left w:val="single" w:sz="18" w:space="0" w:color="${accent}"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9360"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9360" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcMar><w:top w:w="225" w:type="dxa"/><w:left w:w="330" w:type="dxa"/><w:bottom w:w="225" w:type="dxa"/><w:right w:w="330" w:type="dxa"/></w:tcMar></w:tcPr>${paragraph(label, { after: 100, run: { font: 'Arial', size: 15, bold: true, color: accent } })}${paragraph(title, { after: 180, run: { font: 'Arial', size: 25, bold: true, color: '11140F' } })}${textParagraphs(value, { after: 90, line: 320, run: { font: 'Arial', size: 21, color: '2D302B' } })}</w:tc></w:tr></w:tbl>`;

  const logoParagraph = () => `<w:p><w:pPr><w:spacing w:after="135"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1450000" cy="688900"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Логотип Новое поколение" descr="Новое поколение"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo-main.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1450000" cy="688900"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  const contentTypes = hasLogo => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasLogo ? '<Default Extension="png" ContentType="image/png"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

  const documentRels = hasLogo => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${hasLogo ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-main.png"/>' : ''}</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="2B2E29"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

  const coreXml = data => {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(data.title)} — проектная заявка</dc:title><dc:subject>Новое поколение — проектная заявка</dc:subject><dc:creator>Новое поколение</dc:creator><cp:lastModifiedBy>Новое поколение</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  };

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Новое поколение</Application><AppVersion>1.0</AppVersion></Properties>`;

  const documentXml = (data, hasLogo) => {
    const header = hasLogo
      ? logoParagraph()
      : paragraph('НОВОЕ ПОКОЛЕНИЕ', { after: 190, run: { font: 'Arial', size: 24, bold: true, color: '5C493A' } });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${header}${paragraph('PROJECT NOTE / НОВОЕ ПОКОЛЕНИЕ', { after: 120, run: { font: 'Arial', size: 15, bold: true, color: '8A7462' } })}${paragraph('Проектная заявка', { after: 80, line: 520, keepNext: true, run: { font: 'Arial', size: 58, bold: true, color: '0D110C' } })}${paragraph(data.title, { after: 180, line: 470, run: { font: 'Georgia', size: 42, bold: true, color: '72533B' } })}${paragraph('Черновик инициативы, сформированный на сайте проекта «Новое поколение».', { after: 220, line: 285, run: { font: 'Arial', size: 19, color: '65675F' } })}${metaTable(data)}${paragraph('', { after: 160 })}${contentBox('01 / ПРОБЛЕМА ИЛИ СИТУАЦИЯ', 'Что хотим изменить', data.problem, '876A52', 'F7F2EC')}${paragraph('', { after: 130 })}${contentBox('02 / ОЖИДАЕМЫЙ РЕЗУЛЬТАТ', 'К чему хотим прийти', data.result, '4F6048', 'F1F4EF')}${paragraph('', { after: 150 })}${paragraph('СЛЕДУЮЩИЙ ШАГ', { after: 90, keepNext: true, run: { font: 'Arial', size: 15, bold: true, color: '8A7462' } })}${paragraph('Эту заявку можно отправить руководителю проекта, обсудить с будущей командой или использовать как основу для дальнейшей проработки инициативы.', { after: 180, line: 300, run: { font: 'Arial', size: 20, color: '3F423D' } })}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="1276" w:bottom="850" w:left="1276" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
  };

  const fetchLogo = async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const response = await fetch('assets/logo-main.png', { cache: 'force-cache' });
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    } catch (_) {
      return null;
    }
  };

  const buildProposalDocx = async (rawData, options = {}) => {
    const data = {
      title: normalizeLine(rawData.title) || 'Новая идея',
      name: normalizeLine(rawData.name),
      role: normalizeLine(rawData.role),
      contact: normalizeLine(rawData.contact),
      problem: String(rawData.problem ?? '').trim(),
      result: String(rawData.result ?? '').trim(),
      date: normalizeLine(rawData.date) || new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
    };

    const logo = options.logoBytes ? bytes(options.logoBytes) : await fetchLogo();
    const hasLogo = Boolean(logo && logo.length);
    const entries = [
      { name: '[Content_Types].xml', data: contentTypes(hasLogo) },
      { name: '_rels/.rels', data: rootRels },
      { name: 'word/document.xml', data: documentXml(data, hasLogo) },
      { name: 'word/styles.xml', data: stylesXml },
      { name: 'word/_rels/document.xml.rels', data: documentRels(hasLogo) },
      { name: 'docProps/core.xml', data: coreXml(data) },
      { name: 'docProps/app.xml', data: appXml }
    ];
    if (hasLogo) entries.push({ name: 'word/media/logo-main.png', data: logo });

    return new Blob([buildStoredZip(entries)], { type: DOCX_MIME });
  };

  const api = { buildProposalDocx, DOCX_MIME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NPProposalDocx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
