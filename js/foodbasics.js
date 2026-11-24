// Grundnahrungsmittel mit Durchschnittswerten pro 100 g (gerundet, nach gängigen Nährwerttabellen, roh/zubereitet wie angegeben).
// Erscheinen bei der Suche zuerst – die Produktdatenbank kennt vor allem Markenprodukte.
// [Name, kcal, Eiweiß, Kohlenhydrate, davon Zucker, Fett, davon gesättigt, Ballaststoffe, Salz, Portion g, Suchwörter]

const RAW = [
  ['Banane', 93, 1.2, 20, 17, 0.2, 0.1, 2, 0, 120, 'bananen'],
  ['Apfel', 54, 0.3, 11.4, 10.3, 0.2, 0, 2, 0, 150, 'äpfel'],
  ['Birne', 55, 0.5, 12.4, 10, 0.3, 0, 3.3, 0, 160, ''],
  ['Orange', 47, 1, 9, 8.5, 0.2, 0, 2.2, 0, 180, 'apfelsine'],
  ['Mandarine', 50, 0.7, 10, 10, 0.3, 0, 1.8, 0, 70, 'clementine'],
  ['Erdbeeren', 32, 0.8, 5.5, 5.4, 0.4, 0, 2, 0, 150, 'erdbeere'],
  ['Heidelbeeren', 57, 0.7, 12, 10, 0.3, 0, 2.4, 0, 125, 'blaubeeren'],
  ['Weintrauben', 70, 0.7, 15.6, 15.5, 0.3, 0.1, 1.5, 0, 125, 'trauben'],
  ['Kiwi', 61, 1, 10.8, 9, 0.6, 0, 3, 0, 75, ''],
  ['Mango', 60, 0.8, 13, 13, 0.4, 0.1, 1.6, 0, 200, ''],
  ['Ananas', 55, 0.5, 12, 10, 0.2, 0, 1.4, 0, 150, ''],
  ['Wassermelone', 30, 0.6, 7.5, 6.2, 0.2, 0, 0.4, 0, 250, 'melone'],
  ['Avocado', 160, 2, 0.4, 0.2, 14.7, 2.1, 6.7, 0, 80, ''],
  ['Tomate', 18, 0.9, 2.6, 2.6, 0.2, 0, 1.2, 0, 100, 'tomaten'],
  ['Gurke', 12, 0.6, 1.8, 1.7, 0.2, 0, 0.5, 0, 100, 'salatgurke'],
  ['Paprika rot', 31, 1, 6, 4.2, 0.3, 0, 2.1, 0, 150, 'paprika'],
  ['Karotte', 36, 0.9, 7.6, 4.7, 0.2, 0, 2.8, 0.1, 80, 'möhre karotten möhren'],
  ['Brokkoli', 34, 2.8, 4, 1.7, 0.4, 0, 2.6, 0, 150, 'broccoli'],
  ['Blumenkohl', 25, 1.9, 3, 1.9, 0.3, 0, 2, 0, 150, ''],
  ['Zucchini', 17, 1.2, 2.2, 1.7, 0.3, 0.1, 1, 0, 150, ''],
  ['Spinat', 23, 2.9, 1.4, 0.4, 0.4, 0.1, 2.2, 0.2, 100, 'blattspinat'],
  ['Kopfsalat', 14, 1.2, 1.1, 1, 0.2, 0, 1.4, 0, 50, 'salat eisbergsalat'],
  ['Zwiebel', 40, 1.1, 8, 4.2, 0.1, 0, 1.7, 0, 60, 'zwiebeln'],
  ['Kartoffeln gekocht', 77, 2, 16, 0.8, 0.1, 0, 1.8, 0, 200, 'kartoffel'],
  ['Süßkartoffel gekocht', 86, 1.6, 20, 4.2, 0.1, 0, 3, 0.1, 200, 'süßkartoffeln'],
  ['Pommes frites', 290, 3.4, 36, 0.3, 15, 2.3, 3.8, 0.5, 150, 'pommes'],
  ['Reis gekocht', 130, 2.7, 28, 0.1, 0.3, 0.1, 0.4, 0, 180, 'reis'],
  ['Reis roh', 350, 7, 77, 0.2, 0.6, 0.2, 1.4, 0, 70, ''],
  ['Nudeln gekocht', 150, 5.5, 30, 0.6, 0.9, 0.2, 1.8, 0, 220, 'pasta spaghetti'],
  ['Nudeln roh', 355, 12.5, 70, 3, 1.5, 0.3, 3, 0, 100, 'pasta spaghetti'],
  ['Haferflocken', 372, 13.5, 58.7, 0.7, 7, 1.3, 10, 0, 50, 'hafer porridge'],
  ['Müsli ungesüßt', 360, 10, 60, 13, 7, 1.2, 8, 0.1, 60, 'muesli'],
  ['Vollkornbrot', 220, 7.5, 39, 3, 1.5, 0.3, 7, 1.1, 50, 'brot'],
  ['Mischbrot', 230, 7, 45, 2.5, 1.2, 0.2, 5, 1.2, 50, 'brot'],
  ['Brötchen', 270, 9, 53, 3, 1.5, 0.3, 3, 1.3, 55, 'semmel weizenbrötchen'],
  ['Toastbrot', 265, 8, 48, 5, 3.5, 0.6, 3, 1.1, 28, 'toast'],
  ['Laugenbrezel', 270, 8, 55, 1, 1.5, 0.3, 2.5, 2.5, 80, 'brezel breze'],
  ['Ei', 155, 12.6, 1.1, 1.1, 10.6, 3.3, 0, 0.3, 60, 'eier hühnerei'],
  ['Hähnchenbrust', 110, 23, 0, 0, 1.5, 0.4, 0, 0.2, 150, 'hähnchen huhn hühnerbrust'],
  ['Putenbrust', 105, 24, 0, 0, 1, 0.3, 0, 0.2, 150, 'pute truthahn'],
  ['Rinderhack', 250, 18, 0, 0, 20, 8.5, 0, 0.2, 125, 'hackfleisch hack'],
  ['Rindersteak', 160, 22, 0, 0, 7.5, 3, 0, 0.2, 200, 'steak rind'],
  ['Schweineschnitzel', 120, 22, 0, 0, 3, 1, 0, 0.2, 150, 'schnitzel schwein'],
  ['Lachs', 200, 20, 0, 0, 13, 3, 0, 0.1, 125, 'lachsfilet'],
  ['Thunfisch im eigenen Saft', 110, 25, 0, 0, 1, 0.3, 0, 0.9, 80, 'thunfisch'],
  ['Garnelen', 85, 18, 0.9, 0, 0.9, 0.2, 0, 0.6, 100, 'shrimps krabben'],
  ['Tofu natur', 125, 13, 1.5, 0.6, 7.5, 1.1, 1, 0, 100, 'tofu'],
  ['Linsen gekocht', 115, 9, 17, 1.8, 0.4, 0.1, 8, 0, 150, 'linsen'],
  ['Kichererbsen gekocht', 140, 8, 20, 4, 2.5, 0.3, 7.5, 0.3, 120, 'kichererbsen'],
  ['Kidneybohnen', 105, 7, 15, 1, 0.6, 0.1, 6.5, 0.6, 120, 'bohnen'],
  ['Milch 1,5 %', 47, 3.4, 4.8, 4.8, 1.5, 1, 0, 0.1, 250, 'milch'],
  ['Milch 3,5 %', 64, 3.3, 4.8, 4.8, 3.5, 2.3, 0, 0.1, 250, 'vollmilch milch'],
  ['Hafermilch', 46, 1, 6.5, 4, 1.5, 0.2, 0.8, 0.1, 250, 'haferdrink'],
  ['Joghurt natur 3,5 %', 66, 3.8, 4.7, 4.7, 3.5, 2.3, 0, 0.1, 150, 'joghurt jogurt'],
  ['Griechischer Joghurt', 120, 5.5, 4, 4, 9.5, 6.5, 0, 0.1, 150, 'joghurt griechisch'],
  ['Magerquark', 67, 12, 4, 4, 0.2, 0.1, 0, 0.1, 250, 'quark'],
  ['Skyr natur', 63, 11, 4, 4, 0.2, 0.1, 0, 0.1, 150, 'skyr'],
  ['Hüttenkäse', 100, 12, 3, 2.5, 4.5, 2.8, 0, 0.8, 200, 'körniger frischkäse cottage'],
  ['Gouda', 360, 25, 0, 0, 28, 19, 0, 2, 30, 'käse'],
  ['Mozzarella', 255, 18, 1, 1, 20, 13, 0, 0.6, 60, 'käse'],
  ['Feta', 265, 16, 0.5, 0.5, 21, 15, 0, 3, 50, 'schafskäse käse'],
  ['Butter', 740, 0.7, 0.6, 0.6, 83, 55, 0, 0, 10, ''],
  ['Olivenöl', 884, 0, 0, 0, 100, 14, 0, 0, 10, 'öl'],
  ['Erdnussbutter', 600, 25, 15, 6, 50, 9, 6, 0.6, 20, 'erdnussmus'],
  ['Mandeln', 600, 21, 7, 4, 52, 4, 12.5, 0, 30, 'nüsse'],
  ['Walnüsse', 680, 15, 7, 2.6, 65, 6, 6.7, 0, 30, 'nüsse'],
  ['Erdnüsse geröstet', 590, 25, 12, 4, 49, 7, 8, 0.8, 30, 'nüsse'],
  ['Honig', 310, 0.3, 76, 75, 0, 0, 0, 0, 20, ''],
  ['Marmelade', 250, 0.4, 60, 55, 0.1, 0, 1, 0, 20, 'konfitüre'],
  ['Zucker', 400, 0, 100, 100, 0, 0, 0, 0, 10, ''],
  ['Zartbitterschokolade 70 %', 580, 8, 33, 28, 43, 26, 11, 0, 20, 'schokolade'],
  ['Vollmilchschokolade', 540, 7, 57, 55, 31, 19, 2, 0.2, 20, 'schokolade'],
  ['Pizza Margherita', 240, 10, 30, 3, 8.5, 3.5, 2, 1.2, 350, 'pizza'],
  ['Döner Kebab', 215, 12, 20, 2, 10, 3.5, 1.5, 1.2, 400, 'döner'],
  ['Burger', 255, 13, 26, 5, 11, 4, 1.5, 1.2, 220, 'hamburger'],
  ['Wurst (Salami)', 400, 22, 1, 1, 34, 13, 0, 4, 30, 'salami wurst'],
  ['Kochschinken', 110, 19, 1, 1, 3.5, 1.2, 0, 2.3, 30, 'schinken'],
  ['Proteinpulver (Whey)', 380, 75, 8, 5, 6, 3, 1, 0.5, 30, 'whey protein eiweißpulver shake'],
  ['Proteinriegel', 360, 30, 35, 5, 12, 6, 8, 0.5, 60, 'protein riegel'],
  ['Cola', 42, 0, 10.6, 10.6, 0, 0, 0, 0, 330, 'limonade softdrink'],
  ['Orangensaft', 45, 0.7, 10, 9, 0.2, 0, 0.2, 0, 250, 'saft o-saft'],
  ['Bier', 43, 0.5, 3.6, 0, 0, 0, 0, 0, 500, 'pils'],
  ['Weißweinschorle', 40, 0.1, 1.3, 1.3, 0, 0, 0, 0, 250, 'schorle weinschorle wein'],
  ['Kaffee schwarz', 2, 0.1, 0, 0, 0, 0, 0, 0, 200, 'kaffee espresso'],
  ['Cappuccino', 40, 2.2, 3.4, 3.4, 2, 1.3, 0, 0.1, 200, 'latte milchkaffee'],
];

export const BASICS = RAW.map(([name, kcal, protein, carbs, sugar, fat, satfat, fiber, salt, serving, tags], i) => ({
  id: `basic-${i}`, basic: true, name, brand: 'Durchschnittswert', serving, tags: `${name} ${tags}`.toLowerCase(),
  per100: { kcal, protein, carbs, sugar, fat, satfat, fiber, salt },
}));

// Treffer nach Relevanz: ganzer Name, Wortanfang, irgendwo enthalten
export function searchBasics(q) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const short = s.length <= 2; // „ei“ soll nicht Eisbergsalat oder Eiweißpulver finden
  const score = (b) => {
    const n = b.name.toLowerCase();
    if (n === s) return 100;
    if (short) return n.split(/\s+/)[0] === s ? 90 : 0;
    return n.startsWith(s) ? 80 : b.tags.split(' ').some((w) => w.startsWith(s)) ? 60 : b.tags.includes(s) ? 30 : 0;
  };
  return BASICS.map((b) => [score(b), b]).filter(([x]) => x > 0).sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length).map(([, b]) => b).slice(0, 6);
}
