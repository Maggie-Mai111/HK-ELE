(() => {
  "use strict";

  const encoder = new TextEncoder();
  const xmlEscape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]));

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }

  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function header(length) {
    return new Uint8Array(length);
  }

  function set16(bytes, offset, value) { new DataView(bytes.buffer).setUint16(offset, value, true); }
  function set32(bytes, offset, value) { new DataView(bytes.buffer).setUint32(offset, value >>> 0, true); }

  function zip(files) {
    const localParts = [], centralParts = [];
    let localOffset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
      const checksum = crc32(data);
      const local = header(30);
      set32(local, 0, 0x04034b50); set16(local, 4, 20); set16(local, 6, 0x0800);
      set16(local, 8, 0); set16(local, 10, 0); set16(local, 12, 0);
      set32(local, 14, checksum); set32(local, 18, data.length); set32(local, 22, data.length);
      set16(local, 26, name.length); set16(local, 28, 0);
      localParts.push(local, name, data);

      const central = header(46);
      set32(central, 0, 0x02014b50); set16(central, 4, 20); set16(central, 6, 20);
      set16(central, 8, 0x0800); set16(central, 10, 0); set16(central, 12, 0); set16(central, 14, 0);
      set32(central, 16, checksum); set32(central, 20, data.length); set32(central, 24, data.length);
      set16(central, 28, name.length); set16(central, 30, 0); set16(central, 32, 0);
      set16(central, 34, 0); set16(central, 36, 0); set32(central, 38, 0); set32(central, 42, localOffset);
      centralParts.push(central, name);
      localOffset += local.length + name.length + data.length;
    }
    const centralData = concat(centralParts);
    const end = header(22);
    set32(end, 0, 0x06054b50); set16(end, 4, 0); set16(end, 6, 0);
    set16(end, 8, files.length); set16(end, 10, files.length);
    set32(end, 12, centralData.length); set32(end, 16, localOffset); set16(end, 20, 0);
    return concat([...localParts, centralData, end]);
  }

  function columnName(index) {
    let value = index + 1, name = "";
    while (value) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
    return name;
  }

  function cellXml(value, row, column) {
    const reference = `${columnName(column)}${row + 1}`;
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
    const text = xmlEscape(value);
    const preserve = /^\s|\s$|\n/.test(String(value ?? "")) ? ' xml:space="preserve"' : "";
    return `<c r="${reference}" t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
  }

  function worksheetXml(rows) {
    const body = rows.map((values, row) => `<row r="${row + 1}">${values.map((value, column) => cellXml(value, row, column)).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  function build(rows) {
    const files = [
      {name:"[Content_Types].xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
      {name:"_rels/.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:"xl/workbook.xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Teaching List" sheetId="1" r:id="rId1"/></sheets></workbook>'},
      {name:"xl/_rels/workbook.xml.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
      {name:"xl/worksheets/sheet1.xml",data:worksheetXml(rows)},
    ];
    return zip(files);
  }

  function download(rows, filename) {
    const blob = new Blob([build(rows)], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.HKELE_XLSX = {build, download};
})();
