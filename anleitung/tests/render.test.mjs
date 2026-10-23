// Laeuft mit dem eingebauten Runner: `node --test anleitung/tests/`.
// Kein Test-Framework, aus demselben Grund wie beim Renderer selbst.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baueDokument, toWinAnsi, breite, umbrechen, datumDeutsch, punkteLesen, hexFarbe, slug,
} from '../scripts/render.mjs';

const punkt = {
  titel: 'Bestellungen lassen sich duplizieren',
  was_ist_neu: 'Es gibt eine neue Schaltfläche.',
  warum: 'Spart das Neuanlegen.',
  schritte: ['Menü Lager öffnen', 'Auf Kopie anlegen klicken'],
  hinweise: ['Die Kopie ist zunächst ein Entwurf.'],
};

test('Umlaute und Sonderzeichen landen auf ihren WinAnsi-Plätzen', () => {
  assert.deepEqual(toWinAnsi('äöüß'), [0xe4, 0xf6, 0xfc, 0xdf]);
  assert.deepEqual(toWinAnsi('„x”'), [0x84, 0x78, 0x94]);
  assert.deepEqual(toWinAnsi('—'), [0x97]);
  assert.deepEqual(toWinAnsi('→'), [0x9b]);
});

test('Zeichen ausserhalb von WinAnsi werden ersetzt, nicht verschluckt', () => {
  const bytes = toWinAnsi('a中b');
  assert.equal(bytes.length, 3);
  assert.equal(bytes[1], 0x3f);
});

test('Fettschrift ist breiter als Normalschrift', () => {
  assert.ok(breite('Hallo Welt', true, 10) > breite('Hallo Welt', false, 10));
});

test('Umbruch haelt die Maximalbreite ein', () => {
  const text = 'Dies ist ein laengerer Satz, der sicher umbrechen muss, weil er nicht passt.';
  const zeilen = umbrechen(text, false, 10.5, 150);
  assert.ok(zeilen.length > 1);
  for (const z of zeilen) assert.ok(breite(z, false, 10.5) <= 150);
});

test('Ein einzelnes zu langes Wort bleibt stehen statt zu verschwinden', () => {
  const zeilen = umbrechen('Donaudampfschifffahrtsgesellschaftskapitaen', false, 10.5, 40);
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /^Donaudampf/);
});

test('ISO-Datum wird deutsch, Freitext bleibt, leer wird heute', () => {
  assert.equal(datumDeutsch('2026-10-23'), '23.10.2026');
  assert.equal(datumDeutsch('Stand: KW 43'), 'Stand: KW 43');
  assert.match(datumDeutsch(null), /^\d{2}\.\d{2}\.\d{4}$/);
});

test('Punkte ohne Titel werden verworfen und neu nummeriert', () => {
  const punkte = punkteLesen([{ was_ist_neu: 'ohne Titel' }, punkt, 'kaputt', null]);
  assert.equal(punkte.length, 1);
  assert.equal(punkte[0].nr, 1);
});

test('Schritte duerfen auch ein einzelner String sein', () => {
  const punkte = punkteLesen([{ titel: 'X', schritte: 'Nur ein Schritt' }]);
  assert.deepEqual(punkte[0].schritte, ['Nur ein Schritt']);
});

test('baueDokument scheitert, wenn kein Punkt einen Titel hat', () => {
  assert.throws(() => baueDokument({ punkte: [{ warum: 'ohne Titel' }] }), /Keine verwertbaren Punkte/);
  assert.throws(() => baueDokument({}), /Keine verwertbaren Punkte/);
});

test('Ein Punkt mit nur einem Titel ergibt ein gueltiges PDF', () => {
  const bytes = baueDokument({ punkte: [{ titel: 'Nur eine Überschrift' }] }).bytes();
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(bytes.subarray(-6).toString('latin1').includes('%%EOF'));
});

test('Das PDF enthaelt eine xref-Tabelle und einen Katalog', () => {
  const pdf = baueDokument({ punkte: [punkt] }).bytes().toString('latin1');
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\nxref\n/);
  assert.match(pdf, /startxref\n\d+\n%%EOF/);
});

test('Viele Punkte erzeugen mehrere Seiten', () => {
  const viele = Array.from({ length: 12 }, (_, i) => ({ ...punkt, titel: `Punkt ${i + 1}` }));
  const doc = baueDokument({ titel: 'Lang', punkte: viele });
  assert.ok(doc.blaetter.length > 1);
  assert.match(doc.bytes().toString('latin1'), /\/Count \d+/);
});

test('Klammern und Backslash werden im Inhaltsstrom maskiert', () => {
  const pdf = baueDokument({
    punkte: [{ titel: 'Maskierung', was_ist_neu: 'Ein (geklammerter) Text mit \\ Backslash.' }],
  }).bytes().toString('latin1');
  assert.match(pdf, /\\\(geklammerter\\\)/);
  assert.match(pdf, /mit \\\\ Backslash/);
});

test('Akzentfarbe wird aus Hex gelesen, Unsinn faellt auf null', () => {
  assert.deepEqual(hexFarbe('#000000'), [0, 0, 0]);
  assert.deepEqual(hexFarbe('FFFFFF'), [1, 1, 1]);
  assert.equal(hexFarbe('rot'), null);
  assert.equal(hexFarbe(null), null);
});

test('Dateiname-Slug macht aus Umlauten lesbare Paare', () => {
  assert.equal(slug('Änderungen im Lager'), 'aenderungen-im-lager');
  assert.equal(slug('!!!'), 'anleitung');
});
