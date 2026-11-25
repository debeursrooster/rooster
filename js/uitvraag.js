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
    data.zalen_events = (data.zalen_events || []).filter(e => e.status !== 'geannuleerd');
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
      // Bevestigde plekken die iemand al had aangeboden: wordt nu een gewoon ruilaanbod van de echte dienst
      for (const r of reacties.filter(r => ids.has(r.event_id) && r.aangeboden && r.bevestigd_functie)) {
        const d = res.diensten.find(d => d.event_id === r.event_id && d.medewerker_id === r.medewerker_id);
        if (d) await store.insert('ruilverzoeken', { dienst_id: d.id, van_id: r.medewerker_id, naar_id: r.overname_door || null, terug_dienst_id: null, status: r.overname_door ? 'overgenomen' : 'open', bericht: '', aangemaakt_op: nu });
        await store.update('event_reacties', r.id, { aangeboden: false, overname_door: null });
        r.aangeboden = false; r.overname_door = null;
      }
      const ins = data.instellingen || {};
      for (const e of klaar) {
        // wie er gevraagd was, bewaren voor de reactiestatistiek (als dat bij de start nog niet gebeurd is)
        const upd = { status: 'concept' };
        if (!(e.uitvraag_gevraagd || []).length) upd.uitvraag_gevraagd = G.uitvraagGroep(e, data).map(m => m.id);
        await store.update('zalen_events', e.id, upd); Object.assign(e, upd);
      }
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

  // =====================================================================
  //  Maandrooster cafetaria in stappen (D = dag van het definitieve rooster)
  //  Ronde 1 (D-21): voorlopig rooster met vaste krachten (contracturen of vaste werkdagen).
  //                  Zij zien hun diensten (grijs) en kunnen bij Beschikbaar extra diensten kiezen.
  //  Ronde 2 (D-14): extra diensten naar vaste krachten die 'Ik kan' zeiden; wat open blijft
  //                  gaat ook naar de oproepkrachten.
  //  Ronde 3 (D-2) : oproepkrachten die 'Ik kan' zeiden inplannen; herinnering aan beide groepen
  //                  met de diensten die dan nog open staan.
  //  Definitief (D): laatste reacties verwerken; vaste krachten en oproepkrachten tellen dan gelijk.
  // =====================================================================
  const getal = (v, std) => (v === 0 || v === '0') ? 0 : (+v || std);
  U.cafDagen = data => getal((data.instellingen || {}).caf_uitvraag_dagen, 14);
  U.maandPlanning = function (data, maand) {
    const ins = data.instellingen || {};
    const D = G.generatieDatum(maand, ins.dagen_voor_einde);
    const d2 = U.cafDagen(data);
    if (!d2) return { definitief: D, aan: false };
    const d1 = Math.max(getal(ins.caf_ronde1_dagen, 21), d2), d3 = Math.min(getal(ins.caf_ronde3_dagen, 2), d2);
    return { aan: true, definitief: D, ronde1: G.addDays(D, -d1), ronde2: G.addDays(D, -d2), ronde3: d3 ? G.addDays(D, -d3) : null, reagerenTot: G.addDays(D, -1),
      voorlopig: G.addDays(D, -d1) };
  };
  U.cafOpen = (data, maand) => (data.diensten || []).filter(d => d.maand === maand && d.locatie === 'cafetaria' && !d.medewerker_id);
  U.cafVast = data => (data.medewerkers || []).filter(m => m.actief !== false && !G.isCafOproep(m) && (m.locaties || []).includes('cafetaria'));
  // Wie mag in deze ronde reageren op open cafetariadiensten?
  U.cafMagReageren = (m, r) => !!r && r.status === 'voorlopig' && (m.locaties || []).includes('cafetaria') && (!G.isCafOproep(m) || (+r.ronde || 1) >= 2);

  const rondeMelding = (tijd, tekst, extra) => ({ medewerker_id: null, tekst, gelezen: false, tijd, ...(extra || {}) });
  const urenVan = ds => uren(ds.reduce((t, d) => t + G.hours(d.start, d.eind), 0));
  const zetRooster = async (store, r, upd) => { await store.update('roosters', r.id, upd); Object.assign(r, upd); };

  // open diensten aan wie 'Ik kan' zei geven (in data én in de database)
  async function verdeel(store, data, maand, fase, opties) {
    const res = G.cafVerdeel(maand, data, fase, opties && opties.planner);
    const gekregen = res.diensten.filter(d => d.medewerker_id);
    for (const d of gekregen) {
      await store.update('diensten', d.id, { medewerker_id: d.medewerker_id });
      const oud = (data.diensten || []).find(x => x.id === d.id); if (oud) oud.medewerker_id = d.medewerker_id;
    }
    return { gekregen, meldingen: (res.meldingen || []).filter(x => x.startsWith('Geen geschikte')) };
  }
  // persoonlijke melding: 'je bent voorlopig ingepland voor deze extra diensten'
  function kregenMeldingen(gekregen, maand, tijd, soort) {
    const per = {};
    for (const d of gekregen) (per[d.medewerker_id] = per[d.medewerker_id] || []).push(d);
    return Object.entries(per).map(([mid, ds]) => ({ medewerker_id: mid, gelezen: false, tijd, titel: 'Voorlopig ingepland',
      tekst: `✅ Je bent voorlopig ingepland voor ${ds.length} ${soort ? soort + ' ' : ''}cafetariadienst(en) in ${maandNaam(maand)}: ` + ds.sort((a, b) => a.datum.localeCompare(b.datum)).map(d => `${datumTekst(d.datum)} ${d.start}–${d.eind}`).join('; ') + '. Het rooster wordt nog definitief gemaakt.' }));
  }
  // herinnering/oproep: per persoon het aantal open diensten dat bij hem past en waar hij nog niet op reageerde
  function openMeldingen(data, maand, mensen, tijd, tekst) {
    const open = U.cafOpen(data, maand), rows = [];
    for (const m of mensen) {
      const passend = open.filter(d => G.cafPast(m, d));
      const zonder = passend.filter(d => !(data.event_reacties || []).some(x => x.dienst_id === d.id && x.medewerker_id === m.id));
      if (zonder.length) rows.push({ medewerker_id: m.id, gelezen: false, tijd, titel: 'Open diensten ' + maandNaam(maand), tekst: tekst(zonder.length, passend.length) });
    }
    return rows;
  }

  // Ronde 1: voorlopig rooster met de vaste krachten
  U.cafVoorlopig = async function (store, data, maand, opties) {
    opties = opties || {};
    const tijd = new Date().toISOString(), plan = U.maandPlanning(data, maand);
    const res = G.generateVoorlopig(maand, data, opties.planner);
    await store.insert('diensten', res.diensten);
    data.diensten = (data.diensten || []).concat(res.diensten);
    const rec = { maand, status: 'voorlopig', ronde: 1, gegenereerd_op: tijd, gepubliceerd_op: null, meldingen: res.meldingen, uitvraag_tot: plan.reagerenTot, herinnerd: false, ronde1_op: tijd };
    const [opgeslagen] = await store.insert('roosters', rec);
    if (opgeslagen && opgeslagen.id) rec.id = opgeslagen.id;   // nodig voor de volgende stap in dezelfde run
    (data.roosters = data.roosters || []).push(rec);
    const open = U.cafOpen(data, maand);
    const rows = [rondeMelding(tijd, `Voorlopig rooster ${maandNaam(maand)} gemaakt: de vaste krachten zijn ingepland en zien hun diensten al (grijs). ${open.length} cafetariadienst(en) staan open; vaste krachten kunnen nu extra diensten kiezen, vanaf ${datumTekst(plan.ronde2)} ook de oproepkrachten.`, { titel: 'Voorlopig rooster ' + maandNaam(maand), link: '#rooster' })];
    for (const m of U.cafVast(data)) {
      const mijn = res.diensten.filter(d => d.medewerker_id === m.id && d.locatie === 'cafetaria');
      const extra = open.filter(d => G.cafPast(m, d)).length;
      if (!mijn.length && !extra) continue;
      rows.push({ medewerker_id: m.id, gelezen: false, tijd, titel: 'Voorlopig rooster ' + maandNaam(maand),
        tekst: `📅 Voorlopig rooster ${maandNaam(maand)}: ${mijn.length ? `je staat ${mijn.length}× ingepland (${urenVan(mijn)} uur), zie Mijn diensten.` : 'je staat nog niet ingepland.'}${extra ? ` Wil je extra werken? Er staan ${extra} open dienst(en) bij Beschikbaar; kies vóór ${datumTekst(plan.ronde2)}.` : ''}` });
    }
    await store.insert('meldingen', rows);
    return { open: open.length };
  };

  // Ronde 2: extra diensten naar vaste krachten, daarna uitvraag oproepkrachten
  U.cafRonde2 = async function (store, data, maand, opties) {
    const tijd = new Date().toISOString(), r = (data.roosters || []).find(r => r.maand === maand), plan = U.maandPlanning(data, maand);
    const v = await verdeel(store, data, maand, 'extra', opties);
    // wie er gevraagd is en wanneer: voor de reactiestatistiek per medewerker
    const gevraagd = G.cafOproepGroep(data).filter(m => U.cafOpen(data, maand).some(d => G.cafPast(m, d))).map(m => m.id);
    await zetRooster(store, r, { ronde: 2, ronde2_op: tijd, caf_gevraagd: gevraagd });
    const open = U.cafOpen(data, maand);
    const rows = kregenMeldingen(v.gekregen, maand, tijd, 'extra');
    rows.push(rondeMelding(tijd, `Rooster ${maandNaam(maand)}: ${v.gekregen.length} extra dienst(en) naar vaste krachten. ${open.length} cafetariadienst(en) staan nog open en zijn nu ook uitgezet bij de oproepkrachten (reageren t/m ${datumTekst(r.uitvraag_tot || plan.reagerenTot)}).`, { titel: 'Rooster ' + maandNaam(maand) + ': oproepkrachten', link: '#rooster' }));
    rows.push(...openMeldingen(data, maand, G.cafOproepGroep(data), tijd, n => `☕ Er staan ${n} open cafetariadienst(en) voor ${maandNaam(maand)}. Geef bij Beschikbaar aan welke je kunt, uiterlijk ${datumTekst(r.uitvraag_tot || plan.reagerenTot)}.`));
    await store.insert('meldingen', rows);
    return { gekregen: v.gekregen.length, open: open.length };
  };

  // Ronde 3: oproepkrachten inplannen, herinnering aan iedereen voor wat nog open is
  U.cafRonde3 = async function (store, data, maand, opties) {
    const tijd = new Date().toISOString(), r = (data.roosters || []).find(r => r.maand === maand), plan = U.maandPlanning(data, maand);
    const a = await verdeel(store, data, maand, 'oproep', opties);
    const b = await verdeel(store, data, maand, 'extra', opties);
    await zetRooster(store, r, { ronde: 3, herinnerd: true });
    const open = U.cafOpen(data, maand), tot = r.uitvraag_tot || plan.reagerenTot;
    const rows = kregenMeldingen(a.gekregen.concat(b.gekregen), maand, tijd, '');
    rows.push(rondeMelding(tijd, `Rooster ${maandNaam(maand)}: ${a.gekregen.length + b.gekregen.length} dienst(en) voorlopig ingevuld. ${open.length ? `Nog ${open.length} open; iedereen heeft een herinnering gekregen.` : 'Alles is ingevuld.'} Op ${datumTekst(plan.definitief)} wordt het definitief.`, { titel: 'Rooster ' + maandNaam(maand) + ': bijna definitief', link: '#rooster' }));
    if (open.length) rows.push(...openMeldingen(data, maand, G.cafOproepGroep(data).concat(U.cafVast(data)), tijd, n => `⏰ Er staan nog ${n} open cafetariadienst(en) voor ${maandNaam(maand)} waar jij nog niet op hebt gereageerd. Kun je er nog één? Kies bij Beschikbaar, uiterlijk ${datumTekst(tot)}.`));
    await store.insert('meldingen', rows);
    return { gekregen: a.gekregen.length + b.gekregen.length, open: open.length };
  };

  // Definitief: laatste reacties (vaste krachten en oproepkrachten gelijk) en versturen
  U.cafDefinitief = async function (store, data, maand, opties) {
    const tijd = new Date().toISOString(), r = (data.roosters || []).find(r => r.maand === maand);
    const a = { gekregen: [] };
    const b = await verdeel(store, data, maand, 'alle', opties);
    const ins = data.instellingen || {};
    const status = ins.auto_publiceren ? 'gepubliceerd' : 'concept';
    const meld = (r && r.meldingen || []).filter(x => !x.startsWith('Geen geschikte')).concat(b.meldingen);
    if (r) await zetRooster(store, r, { status, gepubliceerd_op: status === 'gepubliceerd' ? tijd : null, meldingen: meld });
    const nogOpen = U.cafOpen(data, maand).length, gevuld = a.gekregen.length + b.gekregen.length;
    const rows = [rondeMelding(tijd, `Rooster ${maandNaam(maand)} is definitief gemaakt${gevuld ? ` (${gevuld} dienst(en) nog verdeeld)` : ''}${nogOpen ? `; ${nogOpen} dienst(en) nog open` : ''}.` + (status === 'concept' ? ' Het staat klaar om te controleren en te versturen.' : ' Het is verstuurd.'), { titel: 'Rooster ' + maandNaam(maand) + ' definitief', link: '#rooster' })];
    if (status === 'gepubliceerd') {
      rows.push(...U.roosterMeldingen(data, maand, tijd));
      const kreeg = new Set((data.diensten || []).filter(d => d.maand === maand && d.medewerker_id).map(d => d.medewerker_id));
      const ids = new Set((data.diensten || []).filter(d => d.maand === maand && d.locatie === 'cafetaria').map(d => d.id));
      const zeiKan = new Set((data.event_reacties || []).filter(x => x.dienst_id && ids.has(x.dienst_id) && x.kan).map(x => x.medewerker_id));
      for (const mid of zeiKan) if (!kreeg.has(mid)) rows.push({ medewerker_id: mid, gelezen: false, tijd, tekst: `Bedankt voor je reactie! Voor ${maandNaam(maand)} ben je in de cafetaria deze keer niet nodig.` });
    }
    await store.insert('meldingen', rows);
    return { gevuld, open: nogOpen, status };
  };

  // Volgende stap uitvoeren als die aan de beurt is (meerdere stappen achter elkaar mag, bv. bij een late start)
  U.cafStap = async function (store, data, maand, vandaag, opties) {
    const plan = U.maandPlanning(data, maand), r = (data.roosters || []).find(r => r.maand === maand);
    if (!r || r.status !== 'voorlopig') return null;
    const ronde = +r.ronde || 1;
    if (vandaag >= plan.definitief) { await U.cafDefinitief(store, data, maand, opties); return 'definitief'; }
    if (ronde < 2 && vandaag >= plan.ronde2) { await U.cafRonde2(store, data, maand, opties); return 'ronde 2'; }
    if (ronde < 3 && ronde >= 2 && plan.ronde3 && vandaag >= plan.ronde3) { await U.cafRonde3(store, data, maand, opties); return 'ronde 3'; }
    return null;
  };

  // Automatisch: kijk voor de komende twee maanden of er iets te doen is
  U.maandAuto = async function (store, data, vandaag, opties) {
    vandaag = vandaag || G.today();
    const uit = [];
    const eerste = G.nextMonth(G.monthOf(vandaag));
    for (const maand of [eerste, G.nextMonth(eerste)]) {
      const plan = U.maandPlanning(data, maand);
      let r = (data.roosters || []).find(r => r.maand === maand);
      if (!r) {
        if (plan.aan && vandaag >= plan.ronde1 && vandaag < plan.definitief) {
          await U.cafVoorlopig(store, data, maand, opties);
          uit.push({ maand, actie: 'voorlopig' });
        } else if (vandaag >= plan.definitief) {
          // geen tijd (meer) voor de rondes: in één keer het hele rooster maken
          const res = G.generateMonth(maand, data, opties && opties.planner);
          await store.insert('diensten', res.diensten);
          data.diensten = (data.diensten || []).concat(res.diensten);
          const tijd = new Date().toISOString(), ins = data.instellingen || {};
          const status = ins.auto_publiceren ? 'gepubliceerd' : 'concept';
          const rec = { maand, status, gegenereerd_op: tijd, gepubliceerd_op: status === 'gepubliceerd' ? tijd : null, meldingen: res.meldingen };
          const [opgeslagen] = await store.insert('roosters', rec); if (opgeslagen && opgeslagen.id) rec.id = opgeslagen.id;
          (data.roosters = data.roosters || []).push(rec);
          const rows = [rondeMelding(tijd, `Het rooster voor ${maandNaam(maand)} is automatisch gemaakt${status === 'concept' ? ' en staat klaar om te controleren en te versturen.' : ' en verstuurd.'}`, { titel: 'Nieuw rooster ' + maandNaam(maand), link: '#rooster' })];
          if (status === 'gepubliceerd') rows.push(...U.roosterMeldingen(data, maand, tijd));
          await store.insert('meldingen', rows);
          uit.push({ maand, actie: 'gemaakt' });
        }
      }
      // daarna eventueel meteen door naar de volgende stap(pen)
      for (let i = 0; i < 3; i++) {
        const stap = await U.cafStap(store, data, maand, vandaag, opties);
        if (!stap) break;
        uit.push({ maand, actie: stap });
      }
    }
    return uit;
  };

  root.Uitvraag = U;
  if (typeof module !== 'undefined') module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
