import { Platform, Share } from 'react-native';
import {
  OfficialReceiptData,
  buildReceiptDetailRows,
  formatCOPPlain,
  getReceiptTitle,
} from './whatsapp-receipt';
import {
  KREDIA_LOGO_JPEG_BASE64,
  KREDIA_LOGO_JPEG_HEIGHT,
  KREDIA_LOGO_JPEG_WIDTH,
} from './kredia-logo-jpeg';

function decodeBase64ToBytes(b64: string): Uint8Array {
  const gBuf = (globalThis as any).Buffer;
  if (gBuf && typeof gBuf.from === 'function') {
    return new Uint8Array(gBuf.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  const gBuf = (globalThis as any).Buffer;
  if (gBuf && typeof gBuf.from === 'function') {
    return gBuf.from(bytes).toString('base64');
  }
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Codifica texto UTF-8 a secuencia WinAnsi/Latin-1 escapada para PDF 1.4 estándar (Helvetica).
 */
function encodePdfText(raw: string): string {
  const normalized = (raw || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\u2022/g, '\u00B7');

  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += '\\' + normalized[i];
    } else if (code >= 0x20 && code <= 0x7e) {
      out += normalized[i];
    } else if (code >= 0xa0 && code <= 0xff) {
      out += '\\' + code.toString(8).padStart(3, '0');
    } else {
      out += ' ';
    }
  }
  return out;
}

function approxTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('ilI1.,:;|!· '.includes(ch)) units += 0.28;
    else if ('mwMW@%'.includes(ch)) units += 0.85;
    else if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else units += 0.53;
  }
  return units * fontSize * (bold ? 1.04 : 1.0);
}

function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (approxTextWidth(candidate, fontSize, bold) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = r * 0.5522847498;
  return [
    `${(x + r).toFixed(2)} ${y.toFixed(2)} m`,
    `${(x + w - r).toFixed(2)} ${y.toFixed(2)} l`,
    `${(x + w - r + k).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + r - k).toFixed(2)} ${(x + w).toFixed(2)} ${(y + r).toFixed(2)} c`,
    `${(x + w).toFixed(2)} ${(y + h - r).toFixed(2)} l`,
    `${(x + w).toFixed(2)} ${(y + h - r + k).toFixed(2)} ${(x + w - r + k).toFixed(2)} ${(y + h).toFixed(2)} ${(x + w - r).toFixed(2)} ${(y + h).toFixed(2)} c`,
    `${(x + r).toFixed(2)} ${(y + h).toFixed(2)} l`,
    `${(x + r - k).toFixed(2)} ${(y + h).toFixed(2)} ${x.toFixed(2)} ${(y + h - r + k).toFixed(2)} ${x.toFixed(2)} ${(y + h - r).toFixed(2)} c`,
    `${x.toFixed(2)} ${(y + r).toFixed(2)} l`,
    `${x.toFixed(2)} ${(y + r - k).toFixed(2)} ${(x + r - k).toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)} c`,
  ].join('\n');
}

function circlePath(cx: number, cy: number, r: number): string {
  const k = r * 0.5522847498;
  return [
    `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m`,
    `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`,
    `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`,
    `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`,
    `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`,
  ].join('\n');
}

function stringToAsciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Genera un archivo PDF 1.4 binario auténtico estilo fintech (Oficina arriba + Logo Kredia en el footer).
 * Sin dependencias pesadas: funciona idéntico en Web, iOS Safari, Android APK y Node tests.
 */
export function generateOfficialReceiptPdfBytes(receipt: OfficialReceiptData): Uint8Array {
  const rows = buildReceiptDetailRows(receipt);
  const pageW = 340;
  const margin = 20;
  const cardX = margin;
  const cardW = pageW - margin * 2;
  const innerPad = 18;
  const valueMaxW = cardW - innerPad * 2 - 102;

  const wrappedRows = rows.map((row) => ({
    ...row,
    valueLines: wrapText(row.value, valueMaxW, 9.5, Boolean(row.highlight || row.danger)),
  }));

  const rowsTotalHeight = wrappedRows.reduce(
    (sum, r) => sum + Math.max(20, r.valueLines.length * 13 + 7),
    0
  );

  const footerMsg = (receipt.payload?.footerMessage || '').trim();
  const footerMsgLines = footerMsg ? wrapText(footerMsg, cardW - 36, 8, false) : [];
  const footerExtraH = footerMsgLines.length > 0 ? footerMsgLines.length * 11 + 8 : 0;

  const headerSectionH = 148;
  const ticketHeaderH = receipt.routeName ? 56 : 44;
  const ticketFooterH = 74 + footerExtraH;
  const ticketBoxH = ticketHeaderH + rowsTotalHeight + ticketFooterH + 18;
  const pageH = Math.max(460, headerSectionH + ticketBoxH + 38);

  const isVoid = receipt.status !== 'APPROVED';
  const title = getReceiptTitle(receipt.receiptType);
  const amountText = formatCOPPlain(receipt.amount);
  const statusLabel =
    receipt.status === 'REVERSED'
      ? 'Anulado'
      : receipt.status === 'CANCELLED'
      ? 'Cancelado'
      : 'Aprobado';
  const subtitle = (receipt.payload?.subtitle || '').trim();

  const ops: string[] = [];

  // Helper para dibujar texto desde coordenada top-down (topY = distancia desde el borde superior)
  const pdfY = (topY: number) => pageH - topY;
  const drawText = (
    text: string,
    x: number,
    topY: number,
    size: number,
    bold: boolean,
    r: number,
    g: number,
    b: number
  ) => {
    ops.push('BT');
    ops.push(`/${bold ? 'F2' : 'F1'} ${size.toFixed(1)} Tf`);
    ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    ops.push(`1 0 0 1 ${x.toFixed(2)} ${pdfY(topY).toFixed(2)} Tm`);
    ops.push(`(${encodePdfText(text)}) Tj`);
    ops.push('ET');
  };

  const drawCenteredText = (
    text: string,
    topY: number,
    size: number,
    bold: boolean,
    r: number,
    g: number,
    b: number
  ) => {
    const w = approxTextWidth(text, size, bold);
    const x = Math.max(margin, (pageW - w) / 2);
    drawText(text, x, topY, size, bold, r, g, b);
  };

  const drawRightText = (
    text: string,
    rightX: number,
    topY: number,
    size: number,
    bold: boolean,
    r: number,
    g: number,
    b: number
  ) => {
    const w = approxTextWidth(text, size, bold);
    drawText(text, rightX - w, topY, size, bold, r, g, b);
  };

  // Fondo blanco limpio
  ops.push('1 1 1 rg');
  ops.push(`0 0 ${pageW} ${pageH} re f`);

  // Título superior
  drawCenteredText(title, 30, 12.5, true, 0.06, 0.09, 0.16);

  // Círculo de estado (verde o rojo)
  const circleCy = pdfY(58);
  if (isVoid) {
    ops.push('0.996 0.949 0.949 rg');
    ops.push(circlePath(pageW / 2, circleCy, 17));
    ops.push('f');
    ops.push('0.863 0.149 0.149 RG 2.2 w 1 J');
    ops.push(`${(pageW / 2 - 5.5).toFixed(2)} ${(circleCy - 5.5).toFixed(2)} m ${(pageW / 2 + 5.5).toFixed(2)} ${(circleCy + 5.5).toFixed(2)} l S`);
    ops.push(`${(pageW / 2 + 5.5).toFixed(2)} ${(circleCy - 5.5).toFixed(2)} m ${(pageW / 2 - 5.5).toFixed(2)} ${(circleCy + 5.5).toFixed(2)} l S`);
  } else {
    ops.push('0.925 0.992 0.961 rg');
    ops.push(circlePath(pageW / 2, circleCy, 17));
    ops.push('f');
    ops.push('0.020 0.588 0.412 RG 2.2 w 1 J 1 j');
    ops.push(`${(pageW / 2 - 6).toFixed(2)} ${(circleCy - 0.5).toFixed(2)} m ${(pageW / 2 - 1.5).toFixed(2)} ${(circleCy - 5).toFixed(2)} l ${(pageW / 2 + 6.5).toFixed(2)} ${(circleCy + 4.5).toFixed(2)} l S`);
  }

  // Monto grande negrita
  drawCenteredText(amountText, 102, 23, true, 0.06, 0.09, 0.16);

  // Píldora Aprobado + fecha/hora
  const pillW = isVoid ? 58 : 64;
  const pillH = 16;
  const tsW = approxTextWidth(receipt.issuedAtDisplay, 8.5, false);
  const groupW = pillW + 8 + tsW;
  const groupX = (pageW - groupW) / 2;
  const pillTopY = 111;

  ops.push(isVoid ? '0.996 0.949 0.949 rg' : '0.925 0.992 0.961 rg');
  ops.push(roundedRectPath(groupX, pdfY(pillTopY + pillH), pillW, pillH, 8));
  ops.push('f');

  const statusTextW = approxTextWidth(statusLabel, 8.5, true);
  drawText(
    statusLabel,
    groupX + (pillW - statusTextW) / 2,
    pillTopY + 11.2,
    8.5,
    true,
    isVoid ? 0.863 : 0.02,
    isVoid ? 0.149 : 0.48,
    isVoid ? 0.149 : 0.34
  );
  drawText(receipt.issuedAtDisplay, groupX + pillW + 8, pillTopY + 11.2, 8.5, false, 0.42, 0.47, 0.54);

  if (subtitle) {
    drawCenteredText(subtitle, 141, 9.2, false, 0.35, 0.41, 0.49);
  }

  // Tarjeta interna tipo comprobante Bemovil
  const boxTopY = headerSectionH + 4;
  ops.push('0.976 0.980 0.988 rg');
  ops.push('0.886 0.910 0.941 RG 0.8 w');
  ops.push(roundedRectPath(cardX, pdfY(boxTopY + ticketBoxH), cardW, ticketBoxH, 14));
  ops.push('B');

  // Encabezado de tarjeta: Nombre de la Oficina (Opción 2A)
  let cursorY = boxTopY + 24;
  drawCenteredText((receipt.companyName || 'Kredia').toUpperCase(), cursorY, 11.5, true, 0.06, 0.09, 0.16);
  if (receipt.routeName) {
    cursorY += 13;
    drawCenteredText(receipt.routeName, cursorY, 8.5, false, 0.42, 0.47, 0.54);
  }

  // Línea punteada 1
  cursorY += 12;
  ops.push('q 0.82 0.85 0.89 RG 0.8 w [3 3] 0 d');
  ops.push(`${(cardX + innerPad).toFixed(2)} ${pdfY(cursorY).toFixed(2)} m ${(cardX + cardW - innerPad).toFixed(2)} ${pdfY(cursorY).toFixed(2)} l S Q`);

  // Filas de detalle
  cursorY += 18;
  for (const row of wrappedRows) {
    drawText(row.label, cardX + innerPad, cursorY, 9.2, false, 0.45, 0.50, 0.58);
    const valR = row.danger ? 0.82 : row.highlight ? 0.02 : 0.08;
    const valG = row.danger ? 0.15 : row.highlight ? 0.45 : 0.12;
    const valB = row.danger ? 0.15 : row.highlight ? 0.34 : 0.20;
    const isBold = Boolean(row.highlight || row.danger);
    for (let li = 0; li < row.valueLines.length; li++) {
      drawRightText(
        row.valueLines[li],
        cardX + cardW - innerPad,
        cursorY + li * 13,
        9.4,
        isBold,
        valR,
        valG,
        valB
      );
    }
    cursorY += Math.max(20, row.valueLines.length * 13 + 7);
  }

  // Línea punteada 2
  cursorY += 2;
  ops.push('q 0.82 0.85 0.89 RG 0.8 w [3 3] 0 d');
  ops.push(`${(cardX + innerPad).toFixed(2)} ${pdfY(cursorY).toFixed(2)} m ${(cardX + cardW - innerPad).toFixed(2)} ${pdfY(cursorY).toFixed(2)} l S Q`);

  // Footer con logo real de Kredia (Opción 2A)
  cursorY += 15;
  drawCenteredText('Comprobante oficial verificado por', cursorY, 8.0, false, 0.45, 0.50, 0.58);

  const logoDrawW = 76;
  const logoDrawH = logoDrawW * (KREDIA_LOGO_JPEG_HEIGHT / KREDIA_LOGO_JPEG_WIDTH);
  const logoX = (pageW - logoDrawW) / 2;
  const logoTopY = cursorY + 7;
  // Fondo blanco suave detrás del logo JPEG para empate limpio
  ops.push('1 1 1 rg');
  ops.push(roundedRectPath(logoX - 8, pdfY(logoTopY + logoDrawH + 5), logoDrawW + 16, logoDrawH + 10, 6));
  ops.push('f');
  ops.push('q');
  ops.push(`${logoDrawW.toFixed(2)} 0 0 ${logoDrawH.toFixed(2)} ${logoX.toFixed(2)} ${pdfY(logoTopY + logoDrawH).toFixed(2)} cm`);
  ops.push('/Im1 Do');
  ops.push('Q');

  if (footerMsgLines.length > 0) {
    let fy = logoTopY + logoDrawH + 16;
    for (const fl of footerMsgLines) {
      drawCenteredText(fl, fy, 7.8, false, 0.42, 0.47, 0.54);
      fy += 10.5;
    }
  }

  const contentBytes = stringToAsciiBytes(ops.join('\n') + '\n');
  const logoBytes = decodeBase64ToBytes(KREDIA_LOGO_JPEG_BASE64);

  // Ensamblar objetos PDF 1.4
  const objects: Uint8Array[] = [];
  const addObj = (body: Uint8Array | string) => {
    objects.push(typeof body === 'string' ? stringToAsciiBytes(body) : body);
  };

  // 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  // 3: Page
  addObj(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH.toFixed(2)}] ` +
      `/Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> ` +
      `/Contents 7 0 R >>`
  );
  // 4: Helvetica Regular (WinAnsiEncoding para acentos españoles)
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // 5: Helvetica Bold
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  // 6: Kredia Logo JPEG XObject
  addObj(
    concatBytes([
      stringToAsciiBytes(
        `<< /Type /XObject /Subtype /Image /Width ${KREDIA_LOGO_JPEG_WIDTH} /Height ${KREDIA_LOGO_JPEG_HEIGHT} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`
      ),
      logoBytes,
      stringToAsciiBytes('\nendstream'),
    ])
  );
  // 7: Page Content Stream
  addObj(
    concatBytes([
      stringToAsciiBytes(`<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      stringToAsciiBytes('endstream'),
    ])
  );

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    totalLen += b.length;
  };
  let totalLen = 0;

  pushBytes(stringToAsciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));

  for (let i = 0; i < objects.length; i++) {
    offsets.push(totalLen);
    pushBytes(stringToAsciiBytes(`${i + 1} 0 obj\n`));
    pushBytes(objects[i]);
    pushBytes(stringToAsciiBytes('\nendobj\n'));
  }

  const xrefOffset = totalLen;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  pushBytes(stringToAsciiBytes(xref));

  return concatBytes(chunks);
}

/**
 * Descarga (en Web) o abre/comparte (en Android/iOS) el Ticket PDF oficial con logo de Kredia.
 */
export async function downloadOrShareReceiptPdf(
  receipt: OfficialReceiptData
): Promise<{ ok: boolean; mode: 'download' | 'share' | 'error'; error?: string }> {
  try {
    const pdfBytes = generateOfficialReceiptPdfBytes(receipt);
    const safeCode = (receipt.receiptCode || 'KREDIA').replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `Comprobante-${safeCode}.pdf`;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const pdfCopy = new Uint8Array(pdfBytes.byteLength);
      pdfCopy.set(pdfBytes);
      const blob = new Blob([pdfCopy.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return { ok: true, mode: 'download' };
    }

    // Native Android / iOS usando expo-file-system + Share / IntentLauncher (ya incluidos en APK 1.2.2)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system');
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
    const fileUri = `${baseDir}${fileName}`;
    const base64 = encodeBytesToBase64(pdfBytes);

    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType?.Base64 || 'base64',
    });

    if (Platform.OS === 'android') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const IntentLauncher = require('expo-intent-launcher');
        const contentUri = await FileSystem.getContentUriAsync(fileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'application/pdf',
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
        return { ok: true, mode: 'share' };
      } catch {
        // Fallback a Share nativo
      }
    }

    await Share.share({
      title: fileName,
      url: fileUri,
      message: `Comprobante oficial Kredia (${receipt.receiptCode})`,
    });
    return { ok: true, mode: 'share' };
  } catch (err: any) {
    return {
      ok: false,
      mode: 'error',
      error: err?.message || 'No se pudo generar el PDF.',
    };
  }
}
