// =====================================================================
//  Uitvraag zalencentrum – werkt in de browser én in Node (GitHub Actions)
//  1. Herinnering sturen aan oproepkrachten die nog niet gereageerd hebben
//  2. Na de termijn: alle feesten waarvan de uitvraag is verlopen in één keer
//     inplannen, melding naar iedereen die het raakt.
// =====================================================================
(function (root) {
  const G = root.Gen || (typeof require !== 'undefined' ? require('./generator.js') : null);
  const U = {};
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const datumTekst = s => { const d = G.parse(s); return DAGEN[G.weekday(s)] + ' ' + d.getUTCDate() + ' ' + MAANDEN[d.getUTCMonth()]; };
  U.datumTekst = datumTekst;
  const maandNaam = m => MAANDEN[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
  U.maandNaam = maandNaam;
  const uren = n => String(Math.round(n * 4) / 4).replace('.', ',');

  // Persoonlijke meldingen bij het versturen van een maandrooster: alleen wie is ingeroosterd
  U.roosterMeldingen = function (data, maand, tijd) {
    const perMw = {};
    for (const d of (data.diensten || []).filter(d => d.maand === maand && d.medewerker_id)) {
      const e = d.event_id && (data.zalen_events || []).find(e => e.id === d.event_id);
      if (e && e.status) continue;   // feesten via de uitvraag worden apart verstuurd
      (perMw[d.medewerker_id] = perMw[d.medewerker_id] || []).push(d);
    }
    return Object.entries(perMw).filter(([mid]) => (data.medewerkers || []).some(m => m.id === mid && m.actief !== false)).map(([mid, ds]) => ({
      medewerker_id: mid, gelezen: false, tijd: tijd || new Date().toISOString(), titel: 'Rooster ' + maandNaam(maand) + ' staat online',
      tekst: `📅 Het rooster voor ${maandNaam(maand)} staat online. Je bent ${ds.length}× ingeroosterd (${uren(ds.reduce((t, d) => t + G.hours(d.start, d.eind), 0))} uur). Eerste dienst: ${datumTekst(ds.sort((a, b) => a.datum.localeCompare(b.datum))[0].datum)}.`
    }));
  };

  // Ingeplande feesten (status 'concept') versturen naar het personeel
  U.publiceerEvents = async function (store, data, events) {
    const nu = new Date().toISOString();
    const rows = [];
    for (const e of events) {
      await store.update('zalen_events', e.id, { status: 'ingepland' });
      e.status = 'ingepland';
    }
    const ids = new Set(events.map(e => e.id));
    const ds = (data.diensten || []).filter(d => ids.has(d.event_id));
    const perMw = {};
    for (const d of ds.filter(d => d.medewerker_id)) (perMw[d.medewerker_id] = perMw[d.medewerker_id] || []).push(d);
    const evNaam = id => (events.find(e => e.id === id) || {}).naam || 'feest';
    for (const [mid, lijst] of Object.entries(perMw))
      rows.push({ medewerker_id: mid, gelezen: false, tijd: nu, titel: 'Ingeroosterd in het zalencentrum', tekst: '🎉 Je bent ingeroosterd: ' + lijst.sort((a, b) => a.datum.localeCompare(b.datum)).map(d => `${datumTekst(d.datum)} ${d.start}–${d.eind} (${evNaam(d.event_id)}, ${d.functie})`).join('; ') + '.' });
    for (const e of events) {
      const ingedeeld = new Set(ds.filter(d => d.event_id === e.id && d.medewerker_id).map(d => d.medewerker_id));
      for (const r of (data.event_reacties || []).filter(r => r.event_id === e.id && r.kan && !ingedeeld.has(r.medewerker_id)))
        rows.push({ medewerker_id: r.medewerker_id, gelezen: false, tijd: nu, tekst: `Bedankt voor je reactie! Voor ${e.naam} op ${datumTekst(e.datum)} ben je deze keer niet nodig.` });
    }
    if (rows.length) await store.insert('meldingen', rows);
    return rows.length;
  };

  // Standaard-termijn voor een nieuw feest: X dagen, maar uiterlijk 2 dagen voor het feest
  U.standaardTermijn = function (datumFeest, dagen, vandaag) {
    vandaag = vandaag || G.today();
    let t = G.addDays(vandaag, dagen || 7);
    const uiterlijk = G.addDays(datumFeest, -2);
    if (t > uiterlijk) t = uiterlijk;
    if (t < vandaag) t = vandaag;
    return t;
  };

  // Moet deze uitvraag nu worden afgesloten?
  U.isVerlopen = (e, vandaag) => e.status === 'open' && (vandaag > e.uitvraag_tot || vandaag >= G.addDays(e.datum, -1));

  // opties.forceer: [event_id] die direct ingepland moeten worden ("Nu inplannen")
  U.verwerk = async function (store, data, vandaag, opties) {
    opties = opties || {};
    vandaag = vandaag || G.today();
    const nu = new Date().toISOString();
    const melding = (mid, tekst, extra) => ({ medewerker_id: mid || null, tekst, gelezen: false, tijd: nu, ...(extra || {}) });
    const reacties = data.event_reacties || [];
    const uit = { herinnerd: 0, ingepland: [], open: 0 };
    const nieuweMeldingen = [];

    // 1. Herinneringen (2 dagen voor het einde van de termijn)
    for (const e of (data.zalen_events || []).filter(e => e.status === 'open' && !e.herinnerd && e.uitvraag_tot && vandaag >= G.addDays(e.uitvraag_tot, -2) && vandaag <= e.uitvraag_tot)) {
      const gereageerd = new Set(reacties.filter(r => r.event_id === e.id).map(r => r.medewerker_id));
      for (const m of G.uitvraagGroep(e, data).filter(m => !gereageerd.has(m.id))) {
        nieuweMeldingen.push(melding(m.id, `⏰ Nog even: kun je op ${datumTekst(e.datum)} werken bij ${e.naam}? Reageer vóór ${datumTekst(e.uitvraag_tot)} einde dag.`));
        uit.herinnerd++;
      }
      await store.update('zalen_events', e.id, { herinnerd: true });
      e.herinnerd = true;
    }

    // 2. Verlopen uitvragen inplannen
    const forceer = new Set(opties.forceer || []);
    const klaar = (data.zalen_events || []).filter(e => e.status === 'open' && (U.isVerlopen(e, vandaag) || forceer.has(e.id)));
    if (klaar.length) {
      klaar.sort((a, b) => a.datum.localeCompare(b.datum));
      // eventuele oude diensten van deze feesten weghalen
      const ids = new Set(klaar.map(e => e.id));
      for (const d of (data.diensten || []).filter(d => ids.has(d.event_id))) await store.remove('diensten', d.id);
      data.diensten = (data.diensten || []).filter(d => !ids.has(d.event_id));
      const res = G.planEvents(klaar, data);
      await store.insert('diensten', res.diensten);
      data.diensten.push(...res.diensten);
      const ins = data.instellingen || {};
      for (const e of klaar) { await store.update('zalen_events', e.id, { status: 'concept' }); e.status = 'concept'; }
      const open = res.diensten.filter(d => !d.medewerker_id);
      uit.open = open.length;
      uit.ingepland = klaar.map(e => e.naam);
      const lijst = klaar.map(e => e.naam + ' (' + datumTekst(e.datum) + ')').join(', ');
      if (ins.auto_publiceren) {
        await U.publiceerEvents(store, data, klaar);
        nieuweMeldingen.push(melding(null, `Uitvraag afgerond, ingepland en verstuurd: ${lijst}.` + (open.length ? ` Let op: ${open.length} dienst(en) nog open.` : ''), { titel: 'Feesten ingepland', link: '#zalen' }));
      } else {
        nieuweMeldingen.push(melding(null, `Uitvraag afgerond: ${lijst} ${klaar.length > 1 ? 'zijn' : 'is'} ingepland en ${klaar.length > 1 ? 'staan' : 'staat'} klaar om te controleren en te versturen.` + (open.length ? ` Let op: ${open.length} dienst(en) nog open.` : ''), { titel: 'Feesten ingepland', link: '#zalen' }));
        uit.teControleren = true;
      }
    }
    if (nieuweMeldingen.length) await store.insert('meldingen', nieuweMeldingen);
    return uit;
  };

  root.Uitvraag = U;
  if (typeof module !== 'undefined') module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
