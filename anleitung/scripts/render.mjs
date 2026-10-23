#!/usr/bin/env node
// Rendert eine Anleitungs-JSON in ein PDF — ohne jede Abhaengigkeit.
//
// Warum von Hand statt mit einer PDF-Bibliothek: der Mod soll in jedem
// Projekt laufen, auch in einer frischen Cloud-Session ohne npm install.
// Ein Handout ist Text in Bloecken, ein paar Linien und Flaechen — dafuer
// reichen die 14 Standard-Schriften, die jeder PDF-Betrachter mitbringt.
// Damit braucht die Datei keine eingebettete Schrift, bleibt klein und
// kommt ohne Toolchain aus.
//
// Grenzen, bewusst: Helvetica statt der Hausschrift (Standard-Schriften
// sind der Preis fuer "keine Abhaengigkeiten"), WinAnsi-Zeichensatz (Umlaute,
// deutsche Anfuehrungszeichen, Gedankenstrich, Euro — kein Kyrillisch, kein
// Emoji), und als Logo nur JPEG (PNG muesste neu kodiert werden).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';

// ---------------------------------------------------------------- Metrik

const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556,
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667,
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611,
  611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

const HIGH_REG = {
  0x80: 556, 0x82: 222, 0x84: 333, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333,
  0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa0: 278, 0xb0: 400, 0xc4: 667,
  0xd6: 778, 0xdc: 722, 0xdf: 611, 0xe4: 556, 0xf6: 556, 0xfc: 556,
};

const HIGH_BOLD = {
  0x80: 556, 0x82: 278, 0x84: 500, 0x85: 1000, 0x91: 278, 0x92: 278, 0x93: 500,
  0x94: 500, 0x95: 350, 0x96: 556, 0x97: 1000, 0xa0: 278, 0xb0: 400, 0xc4: 722,
  0xd6: 778, 0xdc: 722, 0xdf: 611, 0xe4: 556, 0xf6: 611, 0xfc: 611,
};

/** Unicode-Punkte, die WinAnsi an einer anderen Stelle fuehrt als Latin-1. */
const WINANSI = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x201e, 0x84], [0x2026, 0x85],
  [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94],
  [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x2192, 0x9b],
]);

/** JS-String -> WinAnsi-Bytes. Unbekanntes wird zu '?', nie zu einem Absturz. */
export function toWinAnsi(text) {
  const bytes = [];
  for (const zeichen of String(text)) {
    const cp = zeichen.codePointAt(0);
    if (WINANSI.has(cp)) bytes.push(WINANSI.get(cp));
    else if (cp >= 0x20 && cp <= 0xff) bytes.push(cp);
    else if (cp === 0x9) bytes.push(0x20);
    else bytes.push(0x3f);
  }
  return bytes;
}

export function breite(text, bold, size) {
  const hoch = bold ? HIGH_BOLD : HIGH_REG;
  const tabelle = bold ? W_BOLD : W_REG;
  let summe = 0;
  for (const b of toWinAnsi(text)) {
    if (b >= 32 && b <= 126) summe += tabelle[b - 32];
    else summe += hoch[b] ?? (bold ? 611 : 556);
  }
  return (summe * size) / 1000;
}

/** Bricht auf maxBreite um. Ein Wort, das allein zu lang ist, bleibt lang. */
export function umbrechen(text, bold, size, maxBreite) {
  const zeilen = [];
  for (const absatz of String(text).split('\n')) {
    let aktuell = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const versuch = aktuell ? `${aktuell} ${wort}` : wort;
      if (breite(versuch, bold, size) <= maxBreite || !aktuell) aktuell = versuch;
      else {
        zeilen.push(aktuell);
        aktuell = wort;
      }
    }
    zeilen.push(aktuell);
  }
  return zeilen.length ? zeilen : [''];
}

// ------------------------------------------------------------ PDF-Gerüst

const SEITE = { b: 595.28, h: 841.89 };
const RAND = { links: 56, rechts: 56, oben: 54, unten: 68 };
const INHALT_B = SEITE.b - RAND.links - RAND.rechts;

const FARBE = {
  rot: [0.922, 0.255, 0.216],   // #EB4137
  dunkel: [0.157, 0.157, 0.157], // #282828
  grau: [0.392, 0.392, 0.392],   // #646464
  hell: [0.941, 0.941, 0.941],   // #F0F0F0
  linie: [0.894, 0.894, 0.894],
};

function pdfText(text) {
  const bytes = toWinAnsi(text);
  let raus = '';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) raus += `\\${String.fromCharCode(b)}`;
    else raus += String.fromCharCode(b);
  }
  return raus;
}

class Blatt {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
    this.bilder = new Set();
  }

  text(str, x, yOben, { size = 10.5, bold = false, farbe = FARBE.dunkel } = {}) {
    const y = SEITE.h - yOben - size;
    this.ops.push(
      'BT',
      `/${bold ? 'FB' : 'FR'} ${size} Tf`,
      `${farbe[0]} ${farbe[1]} ${farbe[2]} rg`,
      `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
      `(${pdfText(str)}) Tj`,
      'ET',
    );
  }

  flaeche(x, yOben, b, h, farbe) {
    const y = SEITE.h - yOben - h;
    this.ops.push(
      `${farbe[0]} ${farbe[1]} ${farbe[2]} rg`,
      `${x.toFixed(2)} ${y.toFixed(2)} ${b.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  bild(name, x, yOben, b, h) {
    const y = SEITE.h - yOben - h;
    this.bilder.add(name);
    this.ops.push(
      'q',
      `${b.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
      `/${name} Do`,
      'Q',
    );
  }

  strom() {
    return this.ops.join('\n');
  }
}

// ----------------------------------------------------------- JPEG-Einbettung

/** Liest Groesse und Komponentenzahl aus den SOF-Markern. null, wenn es kein
 *  verwertbares JPEG ist — der Aufrufer laesst das Logo dann einfach weg. */
export function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const laenge = buf.readUInt16BE(i + 2);
    const istSof = marker >= 0xc0 && marker <= 0xcf
      && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (istSof) {
      return {
        hoehe: buf.readUInt16BE(i + 5),
        breite: buf.readUInt16BE(i + 7),
        komponenten: buf[i + 9],
      };
    }
    i += 2 + laenge;
  }
  return null;
}

// ----------------------------------------------------------------- Dokument

class Dokument {
  constructor() {
    this.blaetter = [];
    this.logo = null;
    this.neuesBlatt();
  }

  neuesBlatt() {
    this.aktuell = new Blatt(this);
    this.blaetter.push(this.aktuell);
    this.y = RAND.oben;
    return this.aktuell;
  }

  platz(hoehe) {
    return this.y + hoehe <= SEITE.h - RAND.unten;
  }

  sicherstellen(hoehe) {
    if (!this.platz(hoehe)) this.neuesBlatt();
  }

  absatz(text, { size = 10.5, bold = false, farbe = FARBE.dunkel, zeile = 1.45, x = RAND.links, breiteMax = INHALT_B, abstand = 0 } = {}) {
    const zeilen = umbrechen(text, bold, size, breiteMax);
    const zh = size * zeile;
    for (const z of zeilen) {
      this.sicherstellen(zh);
      this.aktuell.text(z, x, this.y, { size, bold, farbe });
      this.y += zh;
    }
    this.y += abstand;
  }

  linie(farbe = FARBE.linie, dicke = 0.7, abstand = 0) {
    this.sicherstellen(dicke + abstand);
    this.aktuell.flaeche(RAND.links, this.y, INHALT_B, dicke, farbe);
    this.y += dicke + abstand;
  }

  /** Misst einen Kasten vor, damit er nie ueber den Seitenrand gerissen wird. */
  kasten(zeilenBloecke, { hintergrund = FARBE.hell, kante = FARBE.grau, polsterX = 12, polsterY = 9 } = {}) {
    const innen = INHALT_B - polsterX * 2 - 3;
    const gemessen = [];
    let hoehe = polsterY * 2;
    for (const block of zeilenBloecke) {
      const haengend = block.marke ? (block.haengend ?? 12) : 0;
      const zeilen = umbrechen(block.text, block.bold ?? false, block.size ?? 10.5, innen - haengend);
      const zh = (block.size ?? 10.5) * (block.zeile ?? 1.45);
      gemessen.push({ ...block, zeilen, zh, haengend });
      hoehe += zeilen.length * zh + (block.abstand ?? 0);
    }

    this.sicherstellen(hoehe);
    const oben = this.y;
    this.aktuell.flaeche(RAND.links, oben, INHALT_B, hoehe, hintergrund);
    this.aktuell.flaeche(RAND.links, oben, 3, hoehe, kante);

    let y = oben + polsterY;
    for (const block of gemessen) {
      const x = RAND.links + 3 + polsterX;
      block.zeilen.forEach((z, i) => {
        if (i === 0 && block.marke) {
          this.aktuell.text(block.marke, x, y, {
            size: block.size ?? 10.5,
            farbe: block.farbe ?? FARBE.dunkel,
          });
        }
        this.aktuell.text(z, x + block.haengend, y, {
          size: block.size ?? 10.5,
          bold: block.bold ?? false,
          farbe: block.farbe ?? FARBE.dunkel,
        });
        y += block.zh;
      });
      y += block.abstand ?? 0;
    }
    this.y = oben + hoehe;
  }

  fussnoten(titel) {
    this.blaetter.forEach((blatt, i) => {
      const y = SEITE.h - RAND.unten + 22;
      blatt.flaeche(RAND.links, y, INHALT_B, 0.7, FARBE.linie);
      blatt.text(titel, RAND.links, y + 6, { size: 7.5, farbe: FARBE.grau });
      const nr = `Seite ${i + 1}`;
      blatt.text(nr, SEITE.b - RAND.rechts - breite(nr, false, 7.5), y + 6, {
        size: 7.5, farbe: FARBE.grau,
      });
    });
  }

  bytes() {
    const objekte = [];
    const add = (inhalt) => { objekte.push(inhalt); return objekte.length; };

    const schriftR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const schriftB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    let logoNr = null;
    if (this.logo) {
      const { daten, info } = this.logo;
      logoNr = add({
        dict: `<< /Type /XObject /Subtype /Image /Width ${info.breite} /Height ${info.hoehe} `
          + `/ColorSpace /${info.komponenten === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 `
          + `/Filter /DCTDecode /Length ${daten.length} >>`,
        roh: daten,
      });
    }

    const seitenNr = objekte.length + 1 + this.blaetter.length * 2;
    const seitenIds = [];

    for (const blatt of this.blaetter) {
      const strom = Buffer.from(blatt.strom(), 'latin1');
      const stromNr = add({ dict: `<< /Length ${strom.length} >>`, roh: strom });
      const xobj = logoNr && blatt.bilder.size
        ? ` /XObject << /Logo ${logoNr} 0 R >>`
        : '';
      seitenIds.push(add(
        `<< /Type /Page /Parent ${seitenNr} 0 R /MediaBox [0 0 ${SEITE.b} ${SEITE.h}] `
        + `/Resources << /Font << /FR ${schriftR} 0 R /FB ${schriftB} 0 R >>${xobj} >> `
        + `/Contents ${stromNr} 0 R >>`,
      ));
    }

    const pages = add(
      `<< /Type /Pages /Count ${seitenIds.length} /Kids [${seitenIds.map((n) => `${n} 0 R`).join(' ')}] >>`,
    );
    const katalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);

    const teile = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let offset = teile[0].length;
    const offsets = [];

    objekte.forEach((obj, i) => {
      offsets.push(offset);
      let buf;
      if (typeof obj === 'string') {
        buf = Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1');
      } else {
        buf = Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n${obj.dict}\nstream\n`, 'latin1'),
          obj.roh,
          Buffer.from('\nendstream\nendobj\n', 'latin1'),
        ]);
      }
      teile.push(buf);
      offset += buf.length;
    });

    let xref = `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    teile.push(Buffer.from(xref, 'latin1'));

    return Buffer.concat(teile);
  }
}

// ------------------------------------------------------------------- Inhalt

const text = (wert) => {
  if (typeof wert !== 'string' && typeof wert !== 'number') return null;
  const t = String(wert).trim();
  return t === '' ? null : t;
};

const liste = (wert) => {
  const roh = typeof wert === 'string' ? [wert] : Array.isArray(wert) ? wert : [];
  return roh.map(text).filter(Boolean);
};

export function datumDeutsch(wert) {
  const t = text(wert);
  if (!t) {
    const heute = new Date();
    return `${String(heute.getDate()).padStart(2, '0')}.${String(heute.getMonth() + 1).padStart(2, '0')}.${heute.getFullYear()}`;
  }
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : t;
}

export function punkteLesen(roh) {
  if (!Array.isArray(roh)) return [];
  const punkte = [];
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== 'object') continue;
    const titel = text(eintrag.titel);
    if (!titel) continue;
    punkte.push({
      nr: punkte.length + 1,
      titel,
      was_ist_neu: text(eintrag.was_ist_neu),
      warum: text(eintrag.warum),
      schritte: liste(eintrag.schritte),
      hinweise: liste(eintrag.hinweise),
    });
  }
  return punkte;
}

export function baueDokument(daten, { titel, logoPfad } = {}) {
  const punkte = punkteLesen(daten.punkte);
  if (punkte.length === 0) {
    throw new Error('Keine verwertbaren Punkte — `punkte` ist leer oder kein Eintrag hat einen `titel`.');
  }

  const doc = new Dokument();
  const docTitel = titel ?? text(daten.titel) ?? 'Anleitung';
  const akzent = hexFarbe(text(daten.akzentfarbe)) ?? FARBE.rot;

  if (logoPfad && existsSync(logoPfad)) {
    const daten_ = readFileSync(logoPfad);
    const info = jpegInfo(daten_);
    if (info) {
      doc.logo = { daten: daten_, info };
      const h = Math.min(44, (info.hoehe / info.breite) * INHALT_B);
      const b = (info.breite / info.hoehe) * h;
      doc.aktuell.bild('Logo', SEITE.b - RAND.rechts - b, doc.y, b, h);
      doc.y += h + 14;
    }
  }

  doc.aktuell.flaeche(RAND.links, doc.y, INHALT_B, 4, akzent);
  doc.y += 18;

  doc.absatz(docTitel.toUpperCase(), { size: 22, bold: true, zeile: 1.18, abstand: 4 });
  const untertitel = text(daten.untertitel);
  if (untertitel) doc.absatz(untertitel, { size: 12, farbe: FARBE.grau, abstand: 4 });
  doc.absatz(`STAND: ${datumDeutsch(daten.datum)}`, { size: 8, farbe: FARBE.grau, abstand: 18 });

  const einleitung = text(daten.einleitung);
  if (einleitung) {
    doc.kasten([{ text: einleitung }], { kante: akzent });
    doc.y += 20;
  }

  if (punkte.length > 1) {
    doc.absatz('INHALT', { size: 8, bold: true, farbe: FARBE.grau, abstand: 3 });
    doc.linie(FARBE.linie, 0.7, 6);
    for (const p of punkte) {
      doc.sicherstellen(15);
      doc.aktuell.text(String(p.nr), RAND.links, doc.y, { size: 10, bold: true, farbe: akzent });
      doc.aktuell.text(p.titel, RAND.links + 22, doc.y, { size: 10 });
      doc.y += 15;
    }
    doc.y += 16;
  }

  punkte.forEach((p, i) => {
    if (i > 0) {
      doc.y += 8;
      doc.linie(FARBE.linie, 0.7, 20);
    }

    // Ueberschrift nur setzen, wenn darunter noch etwas aufs Blatt passt —
    // eine allein am Seitenende stehende Nummer sieht nach Fehler aus.
    doc.sicherstellen(58);
    const kopf = doc.y;
    doc.aktuell.text(String(p.nr), RAND.links, kopf - 2, { size: 17, bold: true, farbe: akzent });
    const titelZeilen = umbrechen(p.titel.toUpperCase(), true, 13, INHALT_B - 30);
    titelZeilen.forEach((z, k) => {
      doc.aktuell.text(z, RAND.links + 30, kopf + k * 16.5, { size: 13, bold: true });
    });
    doc.y = kopf + titelZeilen.length * 16.5 + 11;

    const einzug = RAND.links + 30;
    const innen = INHALT_B - 30;

    const block = (label, inhalt) => {
      if (!inhalt) return;
      doc.sicherstellen(26);
      doc.absatz(label, { size: 7.5, bold: true, farbe: akzent, x: einzug, breiteMax: innen, abstand: 2 });
      doc.absatz(inhalt, { x: einzug, breiteMax: innen, abstand: 7 });
    };

    block('WAS IST NEU', p.was_ist_neu);
    block('WARUM', p.warum);

    if (p.schritte.length) {
      doc.sicherstellen(26);
      doc.absatz('SO GEHEN SIE VOR', { size: 7.5, bold: true, farbe: akzent, x: einzug, breiteMax: innen, abstand: 3 });
      p.schritte.forEach((schritt, k) => {
        const marke = `${k + 1}.`;
        const markeB = 18;
        const zeilen = umbrechen(schritt, false, 10.5, innen - markeB);
        doc.sicherstellen(zeilen.length * 15.2);
        zeilen.forEach((z, zi) => {
          if (zi === 0) doc.aktuell.text(marke, einzug, doc.y, { size: 10.5, farbe: FARBE.grau });
          doc.aktuell.text(z, einzug + markeB, doc.y, { size: 10.5 });
          doc.y += 15.2;
        });
        doc.y += 2;
      });
      doc.y += 5;
    }

    if (p.hinweise.length) {
      const bloecke = [{ text: 'BITTE BEACHTEN', size: 7.5, bold: true, farbe: FARBE.grau, abstand: 3 }];
      for (const h of p.hinweise) bloecke.push({ marke: '•', text: h, abstand: 2 });
      doc.kasten(bloecke);
      doc.y += 6;
    }
  });

  const glossar = Array.isArray(daten.glossar) ? daten.glossar : [];
  const eintraege = glossar
    .filter((g) => g && typeof g === 'object')
    .map((g) => ({ begriff: text(g.begriff), erklaerung: text(g.erklaerung) }))
    .filter((g) => g.begriff && g.erklaerung);

  if (eintraege.length) {
    doc.y += 18;
    doc.sicherstellen(60);
    doc.absatz('KURZ ERKLÄRT', { size: 13, bold: true, abstand: 5 });
    doc.linie(akzent, 1.6, 10);
    const spalte = 150;
    for (const g of eintraege) {
      const zeilen = umbrechen(g.erklaerung, false, 10, INHALT_B - spalte);
      doc.sicherstellen(zeilen.length * 14.5 + 8);
      const oben = doc.y;
      doc.aktuell.text(g.begriff, RAND.links, oben, { size: 10, bold: true });
      zeilen.forEach((z, k) => {
        doc.aktuell.text(z, RAND.links + spalte, oben + k * 14.5, { size: 10 });
      });
      doc.y = oben + zeilen.length * 14.5 + 5;
      doc.linie(FARBE.linie, 0.5, 5);
    }
  }

  doc.fussnoten(docTitel);
  return doc;
}

export function hexFarbe(hex) {
  if (!hex) return null;
  const t = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!t) return null;
  const n = parseInt(t[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------------- CLI

function argument(name) {
  const treffer = process.argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : null;
}

export function slug(text_) {
  return String(text_)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'anleitung';
}

function main() {
  const jsonPfad = argument('json');
  if (!jsonPfad) {
    console.error('--json ist Pflicht: Pfad zur JSON-Datei mit dem Anleitungs-Inhalt.');
    process.exit(1);
  }
  if (!existsSync(jsonPfad)) {
    console.error(`JSON-Datei nicht gefunden: ${jsonPfad}`);
    process.exit(1);
  }

  let daten;
  try {
    daten = JSON.parse(readFileSync(jsonPfad, 'utf8'));
  } catch (fehler) {
    console.error(`JSON ist ungültig: ${fehler.message}`);
    process.exit(1);
  }
  if (!daten || typeof daten !== 'object' || Array.isArray(daten)) {
    console.error('JSON-Wurzel muss ein Objekt sein.');
    process.exit(1);
  }

  const titel = argument('titel') || text(daten.titel) || 'Anleitung';

  let doc;
  try {
    doc = baueDokument(daten, { titel, logoPfad: argument('logo') || text(daten.logo) });
  } catch (fehler) {
    console.error(fehler.message);
    process.exit(1);
  }

  const jetzt = new Date();
  const stempel = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}-${String(jetzt.getHours()).padStart(2, '0')}${String(jetzt.getMinutes()).padStart(2, '0')}`;
  const ziel = resolve(argument('out') || `anleitungen/anleitung-${slug(titel)}-${stempel}.pdf`);

  mkdirSync(dirname(ziel), { recursive: true });
  const bytes = doc.bytes();
  writeFileSync(ziel, bytes);

  const anzahl = punkteLesen(daten.punkte).length;
  console.log('Anleitungs-PDF erstellt:');
  console.log(`  ${ziel}`);
  console.log(`  ${anzahl} ${anzahl === 1 ? 'Punkt' : 'Punkte'}, ${doc.blaetter.length} ${doc.blaetter.length === 1 ? 'Seite' : 'Seiten'}, ${Math.round(bytes.length / 1024)} KB`);
}

if (import.meta.url === `file://${process.argv[1]}` || basename(process.argv[1] || '') === 'render.mjs') {
  main();
}
