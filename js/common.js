// Gedeelde hulpfuncties voor beheer en personeel
(function () {
  const G = window.Gen;
  const App = window.App = { data: null };

  App.DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  App.DAG_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  App.MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  App.LOC = { cafetaria: 'Cafetaria', zalen: 'Zalencentrum' };

  App.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.maandNaam = m => { const [y, mm] = m.split('-').map(Number); return App.MAANDEN[mm - 1] + ' ' + y; };
  App.datumKort = s => { const d = G.parse(s); return App.DAG_KORT[G.weekday(s)] + ' ' + d.getUTCDate() + ' ' + App.MAANDEN[d.getUTCMonth()].slice(0, 3); };
  App.datumLang = s => { const d = G.parse(s); return App.DAGEN[G.weekday(s)] + ' ' + d.getUTCDate() + ' ' + App.MAANDEN[d.getUTCMonth()]; };
  App.uren = n => (Math.round(n * 4) / 4).toString().replace('.', ',');
  App.tijdGeleden = iso => {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'zojuist'; if (s < 3600) return Math.floor(s / 60) + ' min geleden';
    if (s < 86400) return Math.floor(s / 3600) + ' uur geleden';
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  App.mw = id => (App.data.medewerkers || []).find(m => m.id === id);
  App.mwNaam = id => { const m = App.mw(id); return m ? m.naam : 'Open'; };
  App.event = id => (App.data.zalen_events || []).find(e => e.id === id);
  App.rooster = maand => (App.data.roosters || []).find(r => r.maand === maand);
  App.isGepubliceerd = maand => { const r = App.rooster(maand); return r && r.status === 'gepubliceerd'; };
  // Mag het personeel deze dienst zien?
  App.dienstZichtbaar = d => {
    const e = d.event_id && App.event(d.event_id);
    if (e && (e.status === 'open' || e.status === 'concept')) return false;   // feest wacht nog op controle
    if (e && e.status === 'ingepland') return true;                         // feest is verstuurd
    return App.isGepubliceerd(d.maand);
  };
  App.eventZichtbaar = e => !!e && (e.status === 'ingepland' || (!e.status && App.isGepubliceerd(e.datum.slice(0, 7))));
  // Rooster versturen: persoonlijke melding voor wie is ingeroosterd
  App.meldRooster = async maand => {
    const rows = Uitvraag.roosterMeldingen(App.data, maand);
    if (rows.length) await Store.insert('meldingen', rows);
    return rows.length;
  };

  App.reload = async function () {
    App.data = await Store.loadAll();
    if (!App.data.instellingen) {
      if (Store.modus === 'demo') { await App.seedDemo(); App.data = await Store.loadAll(); }
      else { await Store.insert('instellingen', { id: 1 }); App.data = await Store.loadAll(); }
    }
    return App.data;
  };

  // Bevestigde feestplek overzetten naar een collega (direct, of na goedkeuring door beheer)
  App.feestOvernameUitvoeren = async (r, naarId) => {
    const e = App.event(r.event_id), f = r.bevestigd_functie, tijd = new Date().toISOString();
    const eigen = App.data.event_reacties.find(x => x.event_id === e.id && x.medewerker_id === naarId);
    if (eigen) await Store.update('event_reacties', eigen.id, { kan: true, bevestigd_functie: f, aangeboden: false, overname_door: null, tijd });
    else await Store.insert('event_reacties', { event_id: e.id, medewerker_id: naarId, kan: true, opmerking: '', tijd, bevestigd_functie: f, aangeboden: false });
    await Store.update('event_reacties', r.id, { kan: false, bevestigd_functie: null, aangeboden: false, overname_door: null });
  };
  App.feestOmschr = (e, f) => `${e.naam} op ${App.datumLang(e.datum)} (${e.start}–${e.eind}${f && f !== 'bevestigd' ? ', ' + f : ''})`;

  // Elke melding gaat ook als pushbericht naar de telefoon (via Supabase). extra = { titel, link }
  App.melding = (medewerker_id, tekst, extra) => {
    const rij = { medewerker_id: medewerker_id || null, tekst, gelezen: false, tijd: new Date().toISOString() };
    if (extra && extra.titel) rij.titel = extra.titel;
    if (extra && extra.link) rij.link = extra.link;
    return Store.insert('meldingen', rij);
  };

  // ---------- UI ----------
  App.toast = function (tekst, soort) {
    let wrap = document.getElementById('toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast ' + (soort || '');
    t.textContent = tekst;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('weg'), 3200);
    setTimeout(() => t.remove(), 3700);
  };

  // modal(titel, html, knoppen) → Promise met waarde van gekozen knop (of null)
  App.modal = function (titel, html, knoppen, onOpen) {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <div class="modal-kop"><h3>${App.esc(titel)}</h3><button class="icoon sluit" aria-label="Sluiten">✕</button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-voet"></div></div>`;
      const voet = bg.querySelector('.modal-voet');
      (knoppen || [{ label: 'Sluiten', waarde: null }]).forEach(k => {
        const b = document.createElement('button');
        b.className = 'knop ' + (k.soort || '');
        b.textContent = k.label;
        b.onclick = async () => {
          if (k.controle) { const fout = k.controle(bg); if (fout) { App.toast(fout, 'fout'); return; } }
          const w = typeof k.waarde === 'function' ? k.waarde(bg) : k.waarde;
          sluit(w);
        };
        voet.appendChild(b);
      });
      function sluit(w) { bg.remove(); document.removeEventListener('keydown', esc); resolve(w); }
      function esc(e) { if (e.key === 'Escape') sluit(null); }
      bg.querySelector('.sluit').onclick = () => sluit(null);
      bg.addEventListener('mousedown', e => { if (e.target === bg) sluit(null); });
      document.addEventListener('keydown', esc);
      document.body.appendChild(bg);
      if (onOpen) onOpen(bg);
      const f = bg.querySelector('input:not([type=hidden]),select,textarea');
      if (f) setTimeout(() => f.focus(), 30);
    });
  };
  App.bevestig = (titel, tekst, label) => App.modal(titel, `<p>${App.esc(tekst)}</p>`,
    [{ label: 'Annuleren', waarde: false }, { label: label || 'Ja', waarde: true, soort: 'primair' }]);

  App.bezig = async function (knop, fn) {
    const oud = knop && knop.innerHTML;
    if (knop) { knop.disabled = true; knop.innerHTML = '<span class="spinner"></span>'; }
    try { return await fn(); }
    catch (e) { console.error(e); App.toast(e.message || 'Er ging iets mis', 'fout'); }
    finally { if (knop) { knop.disabled = false; knop.innerHTML = oud; } }
  };

  // Ruil uitvoeren: dienst gaat naar 'naar_id'; bij een echte ruil gaat de terug-dienst naar 'van_id'
  App.voerRuilUit = async function (r) {
    await Store.update('diensten', r.dienst_id, { medewerker_id: r.naar_id });
    if (r.terug_dienst_id) await Store.update('diensten', r.terug_dienst_id, { medewerker_id: r.van_id });
    await Store.update('ruilverzoeken', r.id, { status: 'goedgekeurd', naar_id: r.naar_id });
  };

  // ---------- agenda-export (.ics) ----------
  App.ics = function (diensten, bedrijf) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dt = (datum, tijd, plus) => {
      let d = datum; if (plus) d = G.addDays(datum, 1);
      return d.replace(/-/g, '') + 'T' + tijd.replace(':', '') + '00';
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roosterplanner//NL', 'CALSCALE:GREGORIAN',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Amsterdam', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
      'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
    for (const d of diensten) {
      const ev = d.event_id ? App.event(d.event_id) : null;
      const overnacht = G.min(d.eind) <= G.min(d.start);
      lines.push('BEGIN:VEVENT', 'UID:' + d.id + '@roosterplanner', 'DTSTAMP:' + stamp,
        'DTSTART;TZID=Europe/Amsterdam:' + dt(d.datum, d.start), 'DTEND;TZID=Europe/Amsterdam:' + dt(d.datum, d.eind, overnacht),
        'SUMMARY:' + ('Werken ' + App.LOC[d.locatie] + ' – ' + d.functie).replace(/[,;]/g, ' '),
        'DESCRIPTION:' + ((ev ? ev.naam + ' ' : '') + (d.notitie || '')).replace(/[,;\n]/g, ' '),
        'LOCATION:' + (bedrijf || '').replace(/[,;]/g, ' '), 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  };
  App.download = function (naam, inhoud, type) {
    const blob = new Blob([inhoud], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = naam;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ---------- automatisch rooster ----------
  // Maakt het rooster voor volgende maand als de datum bereikt is en het nog niet bestaat.
  // Uitvragen zalencentrum afhandelen (herinneringen + inplannen na de termijn)
  App.verwerkUitvragen = async function (forceer) {
    const res = await Uitvraag.verwerk(Store, App.data, G.today(), { forceer });
    if (res.herinnerd || res.ingepland.length) await App.reload();
    return res;
  };

  // Maandrooster automatisch: voorlopig (cafetaria-uitvraag), herinnering, definitief – zie Uitvraag.maandAuto
  App.autoRooster = async function () {
    const res = await Uitvraag.maandAuto(Store, App.data, G.today());
    if (res.length) await App.reload();
    return res;
  };

  // ---------- demo-gegevens ----------
  App.seedDemo = async function () {
    const G = window.Gen;
    await Store.insert('instellingen', {
      id: 1, bedrijfsnaam: 'Cafetaria & Zalencentrum De Beurs', admin_pin: '0000',
      functies: ['Bediening', 'Frituur', 'Keuken', 'Bar', 'Afwas'], dagen_voor_einde: 21,
      auto_publiceren: false, ruil_goedkeuring: true, beschikbaarheid_slot: 25, site_url: '', uitvraag_dagen: 7, ntfy_topic: '', beheer_naam: 'Ricardo', beheer_telefoon: '06-12345678'
    });
    const mk = (naam, pin, functies, locaties, uren, vast, vrij, max, kleur) => ({
      id: Store.uuid(), naam, pin, telefoon: '06-' + String(10000000 + Math.floor(Math.random() * 89999999)), email: '',
      functies, locaties, contracturen: uren, vaste_dagen: vast, vrije_dagen: vrij, max_dagen_week: max, kleur, actief: true, in_dienst_sinds: null, notitie: ''
    });
    const mws = [
      mk('Sandra', '1111', ['Bediening', 'Frituur', 'Bar'], ['cafetaria', 'zalen'], 32, [1, 2, 3, 4], [6], 5, '#e07a2f'),
      mk('Mark', '2222', ['Frituur', 'Keuken'], ['cafetaria', 'zalen'], 36, [0, 1, 4, 5], [], 5, '#2f7ae0'),
      mk('Lisa', '3333', ['Bediening', 'Bar'], ['cafetaria', 'zalen'], 24, [2, 5, 6], [0], 4, '#c0398a'),
      mk('Kevin', '4444', ['Frituur', 'Afwas'], ['cafetaria'], 20, [3, 4], [], 4, '#2e9e6a'),
      mk('Anouk', '5555', ['Bediening', 'Bar'], ['zalen', 'cafetaria'], 16, [5], [1], 3, '#8a5cd6'),
      mk('Daan', '6666', ['Bediening', 'Afwas', 'Bar'], ['zalen'], 12, [5, 6], [], 3, '#d6a01e'),
      mk('Fatima', '7777', ['Keuken', 'Frituur', 'Bediening'], ['cafetaria', 'zalen'], 28, [0, 1, 2], [], 5, '#1ea7b8'),
      mk('Joost', '8888', ['Bar', 'Bediening'], ['zalen'], 0, [], [], 3, '#7a6a58'),
      mk('Emma', '9999', ['Bediening', 'Afwas'], ['cafetaria', 'zalen'], 0, [], [0, 1, 2], 3, '#d64545'),
      mk('Ruben', '1234', ['Keuken', 'Afwas'], ['zalen', 'cafetaria'], 20, [4, 5], [], 4, '#4b7f2a'),
      mk('Noor', '2468', ['Bediening', 'Bar'], ['zalen'], 0, [], [], 3, '#b5651d'),
      mk('Bram', '1357', ['Bediening', 'Afwas', 'Bar'], ['zalen'], 0, [], [0, 1], 3, '#3d5a80')
    ];
    await Store.insert('medewerkers', mws);
    // Cafetaria: maandag dicht, di-zo open
    const caf = [];
    for (let wd = 1; wd <= 6; wd++) {
      const weekend = wd >= 4;
      caf.push({ weekdag: wd, start: '11:00', eind: '16:00', functie: 'Bediening', aantal: 1 });
      caf.push({ weekdag: wd, start: '11:00', eind: '16:00', functie: 'Frituur', aantal: 1 });
      caf.push({ weekdag: wd, start: '16:00', eind: '21:00', functie: 'Bediening', aantal: weekend ? 2 : 1 });
      caf.push({ weekdag: wd, start: '16:00', eind: '21:00', functie: 'Frituur', aantal: weekend ? 2 : 1 });
    }
    await Store.insert('cafetaria_diensten', caf);
    const deze = G.monthOf(G.today()), volgende = G.nextMonth(deze);
    const sl = [];
    if (volgende.endsWith('-12')) sl.push({ datum: volgende + '-25', reden: 'Eerste Kerstdag' }, { datum: volgende + '-26', reden: 'Tweede Kerstdag' });
    await Store.insert('sluitingsdagen', sl);
    // Zalencentrum-agenda
    const ev = (datum, naam, zaal, start, eind, gasten, bez) => ({ id: Store.uuid(), datum, naam, zaal, start, eind, gasten, bezetting: bez, notitie: '' });
    const zaterdagen = m => G.monthDays(m).filter(d => G.weekday(d) === 5);
    const vrijdagen = m => G.monthDays(m).filter(d => G.weekday(d) === 4);
    const events = [];
    zaterdagen(deze).forEach((d, i) => { if (i % 2 === 0) events.push(ev(d, i === 0 ? 'Bruiloft Jansen' : '50 jaar getrouwd Pietersen', 'Grote zaal', '18:00', '01:00', 120, [{ functie: 'Bediening', aantal: 3 }, { functie: 'Bar', aantal: 2 }, { functie: 'Keuken', aantal: 1, start: '16:00', eind: '21:00' }, { functie: 'Afwas', aantal: 1, start: '20:00', eind: '01:00' }])); });
    vrijdagen(deze).slice(1, 2).forEach(d => events.push(ev(d, 'Bedrijfsborrel Bouwbedrijf Van Dijk', 'Kleine zaal', '16:00', '20:00', 45, [{ functie: 'Bediening', aantal: 1 }, { functie: 'Bar', aantal: 1 }])));
    const nuDag = G.today();
    zaterdagen(volgende).forEach((d, i) => events.push(ev(d, ['Verjaardag Henk (60)', 'Kerstborrel Voetbalclub', 'Bruiloft De Vries', 'Oudejaarsfeest', 'Verjaardag Ineke'][i % 5], i % 2 ? 'Kleine zaal' : 'Grote zaal', '19:00', '00:30', i % 2 ? 60 : 140,
      i % 2 ? [{ functie: 'Bediening', aantal: 1 }, { functie: 'Bar', aantal: 1 }] : [{ functie: 'Bediening', aantal: 3 }, { functie: 'Bar', aantal: 2 }, { functie: 'Afwas', aantal: 1 }])));
    // Zaterdagfeesten volgende maand via de uitvraag: de eerste is net verlopen (wordt bij openen beheer ingepland), de rest loopt nog
    const zatEvents = events.slice(-zaterdagen(volgende).length);
    zatEvents.forEach((e, i) => Object.assign(e, { uitvraag: true, status: 'open', herinnerd: false, uitvraag_tot: i === 0 ? G.addDays(nuDag, -1) : G.addDays(nuDag, 5) }));
    vrijdagen(volgende).slice(0, 2).forEach((d, i) => events.push(ev(d, i ? 'Uitvaart-koffietafel' : 'Personeelsfeest Gemeente', 'Kleine zaal', i ? '13:00' : '18:00', i ? '16:00' : '23:00', 80, [{ functie: 'Bediening', aantal: 2 }, { functie: 'Bar', aantal: 1 }])));
    await Store.insert('zalen_events', events);
    // reacties van oproepkrachten (Joost, Emma, Noor, Bram)
    const opr = { joost: mws[7], emma: mws[8], noor: mws[10], bram: mws[11] };
    const reac = [];
    const r = (e, m, kan, uurGeleden) => reac.push({ event_id: e.id, medewerker_id: m.id, kan, opmerking: '', tijd: new Date(Date.now() - uurGeleden * 3600e3).toISOString() });
    if (zatEvents[0]) { r(zatEvents[0], opr.joost, true, 100); r(zatEvents[0], opr.noor, true, 20); r(zatEvents[0], opr.bram, true, 50); r(zatEvents[0], opr.emma, false, 70); }
    if (zatEvents[1]) { r(zatEvents[1], opr.noor, true, 30); r(zatEvents[1], opr.emma, true, 5); }
    if (zatEvents[2]) { r(zatEvents[2], opr.joost, true, 10); r(zatEvents[2], opr.bram, false, 2); }
    await Store.insert('event_reacties', reac);
    // Rooster van deze maand: gegenereerd en gepubliceerd
    const data = await Store.loadAll(); data.instellingen = data.instellingen || {};
    // verlof en onbeschikbaarheid
    const lisa = mws[2], kevin = mws[3], emma = mws[8], mark = mws[1];
    const vl = [
      { medewerker_id: lisa.id, van: volgende + '-10', tot: volgende + '-14', reden: 'Weekje weg met vriendinnen', status: 'goedgekeurd', reactie: 'Veel plezier!', aangevraagd_op: new Date(Date.now() - 6 * 864e5).toISOString() },
      { medewerker_id: kevin.id, van: volgende + '-20', tot: volgende + '-21', reden: 'Verjaardag oma', status: 'aangevraagd', reactie: '', aangevraagd_op: new Date(Date.now() - 864e5).toISOString() },
      { medewerker_id: emma.id, van: volgende + '-05', tot: volgende + '-05', reden: 'Tentamen', status: 'aangevraagd', reactie: '', aangevraagd_op: new Date(Date.now() - 3 * 3600e3).toISOString() }
    ];
    await Store.insert('verlof', vl);
    await Store.insert('beschikbaarheid', [
      { medewerker_id: mark.id, datum: volgende + '-03', deel: 'avond', opmerking: 'Ouderavond school' },
      { medewerker_id: emma.id, datum: volgende + '-12', deel: 'hele dag', opmerking: '' }
    ]);
    const d2 = await Store.loadAll();
    const res = G.generateMonth(deze, d2);
    await Store.insert('diensten', res.diensten);
    await Store.insert('roosters', { maand: deze, status: 'gepubliceerd', gegenereerd_op: new Date(Date.now() - 30 * 864e5).toISOString(), gepubliceerd_op: new Date(Date.now() - 29 * 864e5).toISOString(), meldingen: res.meldingen });
    // Een open ruilverzoek van Sandra
    const sandraDienst = res.diensten.find(d => d.medewerker_id === mws[0].id && d.datum > G.today());
    if (sandraDienst) await Store.insert('ruilverzoeken', { dienst_id: sandraDienst.id, van_id: mws[0].id, naar_id: null, status: 'open', bericht: 'Tandarts, kan iemand overnemen?', aangemaakt_op: new Date(Date.now() - 5 * 3600e3).toISOString() });
    // Wat ziekmeldingen uit het verleden, zodat het verzuimoverzicht iets laat zien
    const dag = n => G.addDays(G.today(), n);
    const zm = (m, van, tot, min, opm) => ({ medewerker_id: m.id, gemeld_op: new Date(G.parse(van).getTime() + 8 * 3600e3).toISOString(), van, tot, dienst_ids: [], minuten_voor_dienst: min, status: 'bevestigd', opmerking: '', notitie_beheer: opm || '' });
    await Store.insert('ziekmeldingen', [
      zm(kevin, dag(-150), dag(-149), 45), zm(kevin, dag(-95), dag(-95), 30, 'Zondag na stapavond'), zm(kevin, dag(-40), dag(-39), 60), zm(kevin, dag(-12), dag(-12), 20),
      zm(mws[5], dag(-70), dag(-69), 90), zm(mws[5], dag(-21), dag(-20), 120),
      zm(mws[0], dag(-200), dag(-196), 600, 'Griep')
    ]);
    await Store.insert('berichten', [
      { titel: 'Welkom in het nieuwe roostersysteem!', tekst: 'Vanaf nu staat het rooster hier en niet meer in de WhatsApp-groep. Vrij vragen en ruilen gaat ook via deze app.', belangrijk: true, geplaatst: new Date(Date.now() - 2 * 864e5).toISOString() },
      { titel: 'Kerstdagen', tekst: 'De cafetaria is op 1e en 2e kerstdag gesloten. Het zalencentrum is wel open voor feesten.', belangrijk: false, geplaatst: new Date(Date.now() - 864e5).toISOString() }
    ]);
  };
})();
