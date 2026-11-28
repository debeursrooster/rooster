// =====================================================================
//  Personeelspagina
// =====================================================================
(function () {
  const G = window.Gen, A = window.App, esc = A.esc;
  const $ = s => document.querySelector(s);
  let ik = null, tab = 'mijn', weekStart = G.weekStart(G.today()), roosterLoc = 'alle', gekozenMw = null, roosterView = 'maand', roosterDag = G.today();

  // Veilige modus (supabase/beveiliging.sql): de app krijgt pas gegevens na het inloggen,
  // en alleen wat de medewerker mag zien. Code wordt op de server gecontroleerd.
  let veilig = false, publiek = null;
  const geenVerbinding = e => { document.body.innerHTML = `<div class="login"><div class="login-kaart"><h2>Even geen verbinding</h2><p class="zacht">${esc(e.message)}</p><button class="knop primair" onclick="location.reload()">Opnieuw proberen</button></div></div>`; };
  async function start() {
    try {
      veilig = await Store.isVeilig();
      if (veilig) {
        publiek = await Store.publiek();
        const id = localStorage.getItem('rooster_mw'), pin = localStorage.getItem('rooster_pin');
        if (id && pin) {
          Store.zetAuth({ rol: 'personeel', id, pin });
          try { await A.reload(); }
          catch (e) { if (!e.auth) throw e; localStorage.removeItem('rooster_pin'); Store.zetAuth(null); }
        }
      } else await A.reload();
    } catch (e) { return geenVerbinding(e); }
    if (Store.modus === 'demo') $('#demoBand').classList.remove('verborgen');
    const bedrijf = (A.data && A.data.instellingen.bedrijfsnaam) || (publiek && publiek.bedrijfsnaam) || 'Rooster';
    $('#loginBedrijf').textContent = bedrijf; $('#kopBedrijf').textContent = bedrijf;
    const id = localStorage.getItem('rooster_mw');
    ik = id && A.data && A.mw(id);
    if (ik && ik.actief !== false) return toonApp();
    toonLogin();
  }

  // ---------------- inloggen ----------------
  function toonLogin() {
    $('#login').classList.remove('verborgen'); $('#app').classList.add('verborgen');
    const mws = (veilig ? publiek.medewerkers : A.data.medewerkers.filter(m => m.actief !== false)).slice().sort((a, b) => a.naam.localeCompare(b.naam));
    $('#namen').innerHTML = mws.map(m => `<button data-id="${m.id}"><span class="avatar" style="background:${esc(m.kleur)}">${esc(m.naam[0])}</span>${esc(m.naam)}</button>`).join('') || '<p class="zacht">Er staat nog geen personeel in het systeem.</p>';
    $('#namen').querySelectorAll('button').forEach(b => b.onclick = () => {
      gekozenMw = mws.find(m => m.id === b.dataset.id);
      $('#pinNaam').textContent = gekozenMw.naam;
      $('#stapNaam').classList.add('verborgen'); $('#stapPin').classList.remove('verborgen');
      $('#pin').value = ''; $('#pin').focus();
    });
    // Persoonlijke uitnodigingslink (…?m=<id>), of eerder ingelogd: naam staat al klaar
    const uitn = new URLSearchParams(location.search).get('m') || localStorage.getItem('rooster_mw');
    const knop = uitn && $('#namen').querySelector(`button[data-id="${CSS.escape(uitn)}"]`);
    if (knop) knop.click();
  }
  $('#terugNaam').onclick = e => { e.preventDefault(); $('#stapPin').classList.add('verborgen'); $('#stapNaam').classList.remove('verborgen'); };
  $('#stapPin').onsubmit = async e => {
    e.preventDefault();
    const pin = $('#pin').value, knop = $('#stapPin button');
    let goed;
    try {
      knop.disabled = true;
      const auth = { rol: 'personeel', id: gekozenMw.id, pin };
      goed = await Store.login(auth);
      if (goed === null) goed = pin === String(gekozenMw.pin);   // oude modus / demo: zelf controleren
      if (goed) {
        if (veilig) { localStorage.setItem('rooster_pin', pin); await A.reload(); }
        ik = A.mw(gekozenMw.id); localStorage.setItem('rooster_mw', ik.id);
        $('#login').classList.add('verborgen'); return toonApp();
      }
    } catch (x) { A.toast(x.message || 'Inloggen lukte niet', 'fout'); $('#pin').value = ''; return; }
    finally { knop.disabled = false; }
    A.toast('Code klopt niet', 'fout'); $('#pin').value = '';
  };
  $('#uitKnop').onclick = async () => { if (await A.bevestig('Uitloggen', 'Wil je uitloggen op dit apparaat? Zolang je uitgelogd bent, krijg je hier geen meldingen. Log je weer in, dan gaan ze vanzelf weer aan.', 'Uitloggen')) { await Push.uitzetten('personeel'); localStorage.removeItem('rooster_mw'); localStorage.removeItem('rooster_pin'); location.reload(); } };

  // ---------------- app & pushmeldingen ----------------
  const testPush = () => A.melding(ik.id, '🔔 Meldingen staan aan! Je krijgt hier voortaan bericht over je rooster, ruilverzoeken en feesten.', { titel: 'Meldingen werken' });
  const pushOpties = compact => ({ rol: 'personeel', medewerkerId: ik.id, compact, onTest: testPush });
  function tekenPush() {
    const md = $('#mdPush'); if (md) Push.paneel(md, { ...pushOpties(false), verbergAlsAan: true });   // staat het aan: niets tonen, dan kan niemand het per ongeluk uitzetten
    const mp = $('#mPush'); if (mp && !Push.later('personeel')) Push.paneel(mp, pushOpties(true));
  }

  // ---------------- app ----------------
  function toonApp() {
    $('#app').classList.remove('verborgen');
    $('#kopNaam').textContent = 'Hoi ' + ik.naam + '!';
    $('#onderbalk').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.t; teken(); window.scrollTo(0, 0); });
    $('#belKnop').onclick = toonMeldingen;
    Push.vernieuw('personeel', ik.id);
    Push.opWijziging(tekenPush);
    teken();
    // regelmatig verversen
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ververs(); });
    setInterval(() => { if (!document.hidden && !document.querySelector('.modal-bg')) ververs(); }, 60000);
  }
  async function ververs() {
    try { await A.reload(); ik = A.mw(ik.id); if (!ik || ik.actief === false) { localStorage.removeItem('rooster_mw'); return location.reload(); } teken(); }
    catch (e) { if (e.auth) { localStorage.removeItem('rooster_pin'); location.reload(); } }   // code gewijzigd: opnieuw inloggen
  }

  const zichtbaar = d => A.dienstZichtbaar(d);
  // Lopende uitvragen waar ik op mag reageren
  const mijnUitvragen = () => A.data.zalen_events.filter(e => e.status === 'open' && e.datum >= G.today() && G.uitvraagGroep(e, A.data).some(m => m.id === ik.id))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const gezienSleutel = () => 'rooster_gezien_' + ik.id;
  const gezien = () => { try { return JSON.parse(localStorage.getItem(gezienSleutel()) || '[]'); } catch (x) { return []; } };
  const zetGezien = evs => { try { localStorage.setItem(gezienSleutel(), JSON.stringify([...new Set([...gezien(), ...evs.map(e => e.id)])].slice(-200))); } catch (x) { } };
  const nieuweUitvragen = () => mijnUitvragen().filter(e => !mijnReactie(e)).concat(G.isCafOproep(ik) ? cafGroepen().filter(g => g.kan === null) : []);
  // eigen diensten uit een voorlopig rooster (nog niet definitief): grijs tonen
  const mijnVoorlopig = () => A.data.diensten.filter(d => d.medewerker_id === ik.id && !zichtbaar(d) && !d.event_id && (A.rooster(d.maand) || {}).status === 'voorlopig' && d.datum >= G.today());
  // Bevestigde feestplekken (nog geen echte dienst) die je kunt aanbieden of overnemen
  const evOpen = e => e && e.status === 'open' && e.datum >= G.today();
  const mijnBevestigd = () => A.data.event_reacties.filter(r => r.medewerker_id === ik.id && r.kan && r.bevestigd_functie && evOpen(A.event(r.event_id)))
    .map(r => ({ r, e: A.event(r.event_id) })).sort((a, b) => a.e.datum.localeCompare(b.e.datum));
  const feestAanbod = () => A.data.event_reacties.filter(r => r.aangeboden && r.kan && r.bevestigd_functie && r.medewerker_id !== ik.id && evOpen(A.event(r.event_id)) && (!r.overname_door || r.overname_door === ik.id))
    .map(r => ({ r, e: A.event(r.event_id) }))
    .filter(({ r, e }) => (ik.functies || []).includes(r.bevestigd_functie) && G.uitvraagGroep(e, A.data).some(m => m.id === ik.id) && !(mijnReactie(e) || {}).bevestigd_functie)
    .sort((a, b) => a.e.datum.localeCompare(b.e.datum));
  const feestOmschr = (e, f) => A.feestOmschr(e, f);
  // ---- uitvraag cafetaria (voorlopig maandrooster) ----
  const knopSchuif = (attr, st, label) => `<div class="keuze3-wrap"><div class="keuze3 st-${st}" ${attr} role="group" aria-label="${label}">
      <button type="button" class="k3-tekst nee" data-kan="0">Kan niet</button>
      <span class="k3-baan"><button type="button" class="k3-helft" data-kan="0" aria-label="Kan niet"></button><button type="button" class="k3-helft" data-kan="1" aria-label="Ik kan"></button><i></i></span>
      <button type="button" class="k3-tekst ja" data-kan="1">Ik kan</button></div>
      ${st === 'leeg' ? '<small class="k3-hint">Nog niet gekozen</small>' : ''}</div>`;
  // open cafetariadiensten waar ik op kan reageren, samengevoegd per dag/tijd/functie
  function cafGroepen() {
    if (!ik || !(ik.locaties || []).includes('cafetaria')) return [];
    const nu = G.today();
    const rs = A.data.roosters.filter(r => Uitvraag.cafMagReageren(ik, r) && (!r.uitvraag_tot || r.uitvraag_tot >= nu));
    const uit = [], per = new Map();
    for (const r of rs) for (const d of Uitvraag.cafOpen(A.data, r.maand).filter(d => d.datum >= nu && G.cafPast(ik, d))) {
      const k = [d.datum, d.start, d.eind, d.functie].join('|');
      if (!per.has(k)) {
        // vaste krachten in ronde 1 kiezen vóór ronde 2; daarna geldt voor iedereen de gewone termijn
        const pl = Uitvraag.maandPlanning(A.data, r.maand);
        const tot = !G.isCafOproep(ik) && (+r.ronde || 1) < 2 && pl.ronde2 ? G.addDays(pl.ronde2, -1) : r.uitvraag_tot;
        const g = { d, ids: [], tot, maand: r.maand, extra: !G.isCafOproep(ik) }; per.set(k, g); uit.push(g);
      }
      per.get(k).ids.push(d.id);
    }
    uit.sort((a, b) => a.d.datum.localeCompare(b.d.datum) || G.min(a.d.start) - G.min(b.d.start));
    for (const g of uit) { const r = A.data.event_reacties.find(x => x.dienst_id && g.ids.includes(x.dienst_id) && x.medewerker_id === ik.id); g.kan = r ? r.kan : null; }
    return uit;
  }
  const mijnReactie = e => A.data.event_reacties.find(r => r.event_id === e.id && r.medewerker_id === ik.id);
  const mijnDiensten = () => A.data.diensten.filter(d => d.medewerker_id === ik.id && zichtbaar(d)).sort((a, b) => a.datum.localeCompare(b.datum) || G.min(a.start) - G.min(b.start));
  const tijd = d => esc(d.start) + '–' + esc(d.eind);
  const ACTIEF = ['open', 'gevraagd', 'overgenomen'];
  const actieveRuil = dienstId => A.data.ruilverzoeken.find(r => (r.dienst_id === dienstId || r.terug_dienst_id === dienstId) && ACTIEF.includes(r.status));
  const verzoekenAanMij = () => A.data.ruilverzoeken.filter(r => r.status === 'gevraagd' && r.naar_id === ik.id && A.data.diensten.some(d => d.id === r.dienst_id));

  // kan ik deze dienst doen?
  function kanIk(dienst) {
    const ctx = G.context(A.data, A.data.diensten.filter(x => x.id !== dienst.id));
    return G.beoordeel(ctx, ik, { ...dienst, medewerker_id: null }, { negeerUitvraag: true, negeerReactie: true, alleenOk: true });
  }
  const ruilAanbod = () => A.data.ruilverzoeken.filter(r => r.status === 'open' && r.van_id !== ik.id).map(r => ({ r, d: A.data.diensten.find(x => x.id === r.dienst_id) }))
    .filter(x => x.d && x.d.datum >= G.today() && zichtbaar(x.d) && kanIk(x.d).ok);
  // feest is ingepland maar nog niet verstuurd: open plekken (en plekken die de baas laat overnemen) mag het personeel al wel oppakken
  const evConcept = d => { const e = d.event_id && A.event(d.event_id); return !!e && e.status === 'concept'; };
  const oppakbaar = d => (!d.medewerker_id || A.baasOverneembaar(d)) && (zichtbaar(d) || evConcept(d));
  const openVoorMij = () => A.data.diensten.filter(d => oppakbaar(d) && d.datum >= G.today() && kanIk(d).ok).sort((a, b) => a.datum.localeCompare(b.datum));

  function teken() {
    $('#onderbalk').querySelectorAll('button').forEach(b => b.classList.toggle('actief', b.dataset.t === tab));
    // kop
    const nu = G.today(), mijn = mijnDiensten(), komend = mijn.filter(d => d.datum >= nu);
    const v = komend[0];
    $('#volgendeDienst').innerHTML = v ? `<div class="volgende"><div class="datumblok ${v.locatie}" style="background:rgba(255,255,255,.95)"><b>${G.parse(v.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(v.datum)]}</small></div>
      <div><small style="color:#bfb3a2">Volgende dienst${v.datum === nu ? ' – vandaag!' : v.datum === G.addDays(nu, 1) ? ' – morgen' : ''}</small><div class="groot">${tijd(v)}</div><div style="color:#d8cebf;font-size:.88rem">${A.LOC[v.locatie]} · ${esc(v.functie)}${v.event_id && A.event(v.event_id) ? ' · ' + esc(A.event(v.event_id).naam) : ''}</div></div></div>`
      : `<div class="volgende"><div>Je hebt nog geen diensten ingepland.</div></div>`;
    // Ziek melden altijd in één tik bereikbaar (staat ook onder Vrij / ziek)
    const zk = mijnZiek();
    $('#volgendeDienst').insertAdjacentHTML('beforeend', zk
      ? `<div class="ziek-kop">🤒 Je bent ziek gemeld${zk.status === 'gemeld' ? ' (nog niet bevestigd)' : ''} <button class="knop klein ok" type="button" id="kopBeter">Ik ben weer beter</button></div>`
      : `<button class="knop ziek-knop" type="button" id="kopZiek">🤒 Ziek melden</button>`);
    const kz = $('#kopZiek'); if (kz) kz.onclick = ziekMelden;
    const kb = $('#kopBeter'); if (kb) kb.onclick = beterMelden;
    const maand = G.monthOf(nu);
    const uren = mijn.filter(d => d.maand === maand).reduce((s, d) => s + G.hours(d.start, d.eind), 0);
    const doel = G.doelUren(ik, maand);
    $('#urenBalk').innerHTML = `${A.uren(uren)} uur ingepland in ${A.MAANDEN[+maand.slice(5) - 1]}${doel ? ` <span style="opacity:.7">van ~${Math.round(doel)}</span>` : ''}${doel ? `<div class="balk"><i style="width:${Math.min(100, uren / doel * 100)}%"></i></div>` : ''}`;
    const ongelezen = A.data.meldingen.filter(m => m.medewerker_id === ik.id && !m.gelezen).length;
    $('#belBadge').textContent = ongelezen; $('#belBadge').classList.toggle('verborgen', !ongelezen);
    const nUit = nieuweUitvragen().length + openVoorMij().length;
    const mijnKnop = document.querySelector('#onderbalk button[data-t=beschikbaar]');
    let mb = mijnKnop.querySelector('.badge'); if (!mb) { mb = document.createElement('span'); mb.className = 'badge'; mijnKnop.appendChild(mb); }
    mb.textContent = nUit; mb.classList.toggle('verborgen', !nUit);
    const nRuil = ruilAanbod().length + verzoekenAanMij().length + feestAanbod().length;
    $('#ruilBadge').textContent = nRuil; $('#ruilBadge').classList.toggle('verborgen', !nRuil);
    ({ mijn: tMijn, beschikbaar: tBeschikbaar, rooster: tRooster, vrij: tVrij, ruil: tRuil })[tab]();
  }

  // ---------------- tab: mijn diensten ----------------
  function dienstItem(d, knoppen, klasse, status) {
    const ev = d.event_id && A.event(d.event_id);
    const ruil = actieveRuil(d.id);
    const collegas = A.data.diensten.filter(x => x.datum === d.datum && x.id !== d.id && x.medewerker_id && x.locatie === d.locatie && G.overlap(x, d)).map(x => A.mwNaam(x.medewerker_id)).filter((n, i, l) => l.indexOf(n) === i);
    return `<div class="item ${klasse || ''}"><div class="datumblok ${d.locatie}"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
      <div style="min-width:0"><div class="wie">${tijd(d)} <span class="label ${d.locatie === 'zalen' ? 'zaal' : 'caf'}">${A.LOC[d.locatie]}</span></div>
      <div class="meta">${esc(A.datumLang(d.datum))} · ${esc(d.functie)}${ev ? ' · 🎉 ' + esc(ev.naam) : ''}</div>
      ${collegas.length ? `<div class="meta">Met: ${collegas.map(esc).join(', ')}</div>` : ''}
      ${d.notitie ? `<div class="meta">📝 ${esc(d.notitie)}</div>` : ''}
      ${status || ''}
      ${ruil ? `<div class="meta" style="color:var(--let)">🔁 ${ruil.terug_dienst_id === d.id ? 'Onderdeel van een ruil met ' + esc(A.mwNaam(ruil.van_id)) + (ruil.status === 'overgenomen' ? ' – wacht op goedkeuring' : '') : ruil.status === 'open' ? 'Aangeboden om te ruilen' : ruil.status === 'gevraagd' ? 'Gevraagd aan ' + esc(A.mwNaam(ruil.naar_id)) + ' – wacht op bevestiging' : esc(A.mwNaam(ruil.naar_id)) + ' neemt over – wacht op goedkeuring baas'}</div>` : ''}</div>
      <div class="rechts">${knoppen || ''}</div></div>`;
  }

  // Feesten waarvoor ik "Ik kan" heb gezegd en die nog niet definitief zijn ingepland
  const mijnOpgegeven = () => A.data.zalen_events.filter(e => e.datum >= G.today() && e.status !== 'ingepland' && e.status !== 'geannuleerd' && (mijnReactie(e) || {}).kan === true);

  function tMijn() {
    const komend = mijnDiensten().filter(d => d.datum >= G.today());
    $('#inhoud').innerHTML = `<div id="mPush"></div><div id="mijnInhoud"></div>`;
    tMijnLijst(komend);
    koppelActies();
    tekenPush();
    const ag = $('#agenda');
    if (ag) ag.onclick = () => {
      A.download('mijn-diensten.ics', A.ics(komend, A.data.instellingen.bedrijfsnaam), 'text/calendar');
      A.toast('Open het bestand om je diensten in je agenda te zetten');
    };
  }

  // Alles wat ik moet of misschien ga werken: groen = bevestigd, geel = opgegeven, wacht op bevestiging
  function tMijnLijst(komend) {
    const nu = G.today();
    const berichten = A.data.berichten.slice().sort((a, b) => (b.belangrijk - a.belangrijk) || (b.geplaatst || '').localeCompare(a.geplaatst || '')).slice(0, 3);
    const concept = A.data.roosters.find(r => r.status === 'concept' && r.maand > G.monthOf(nu));
    const regels = [
      ...komend.map(d => ({ datum: d.datum, start: d.start, html: (() => { const r = actieveRuil(d.id);
        return dienstItem(d, r ? (r.van_id === ik.id ? `<button class="knop klein" data-intrek="${r.id}">Intrekken</button>` : '') : '',
          ); })() })),
      ...mijnOpgegeven().map(e => { const bev = (mijnReactie(e) || {}).bevestigd_functie; return { datum: e.datum, start: e.start, html: `<div class="item ${bev ? '' : 'onbevestigd'}"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(e.datum)]}</small></div>
        <div style="min-width:0"><div class="wie">${esc(e.start)}–${esc(e.eind)} <span class="label zaal">${A.LOC.zalen}</span></div>
        <div class="meta">${esc(A.datumLang(e.datum))} · 🎉 ${esc(e.naam)}</div>
        <div class="meta">${bev ? `<b style="color:var(--ok)">✓ Bevestigd</b>${bev !== 'bevestigd' ? ' · ' + esc(bev) : ''}` : '⏳ Jij kunt – nog niet bevestigd'}</div>
        ${bev && (mijnReactie(e) || {}).aangeboden ? '<div class="meta" style="color:var(--let)">🔁 Aangeboden om te ruilen</div>' : ''}</div></div>` }; })
      ,...mijnVoorlopig().map(d => ({ datum: d.datum, start: d.start, html: `<div class="item onbevestigd"><div class="datumblok ${d.locatie === 'zalen' ? 'zalen' : 'cafetaria'}"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
        <div style="min-width:0"><div class="wie">${esc(d.start)}–${esc(d.eind)} <span class="label ${d.locatie === 'zalen' ? 'zaal' : 'caf'}">${A.LOC[d.locatie]}</span></div>
        <div class="meta">${esc(A.datumLang(d.datum))} · ${esc(d.functie)}</div>
        <div class="meta">⏳ Voorlopig ingepland – rooster nog niet definitief</div></div></div>` }))
      ,...cafGroepen().filter(g => g.kan === true).map(({ d }) => ({ datum: d.datum, start: d.start, html: `<div class="item onbevestigd"><div class="datumblok cafetaria"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
        <div style="min-width:0"><div class="wie">${esc(d.start)}–${esc(d.eind)} <span class="label caf">${A.LOC.cafetaria}</span></div>
        <div class="meta">${esc(A.datumLang(d.datum))} · ${esc(d.functie)}</div>
        <div class="meta">⏳ Jij kunt – nog niet bevestigd</div></div></div>` }))
    ].sort((a, b) => a.datum.localeCompare(b.datum) || G.min(a.start) - G.min(b.start));
    const perMaand = {};
    regels.forEach(r => (perMaand[r.datum.slice(0, 7)] = perMaand[r.datum.slice(0, 7)] || []).push(r.html));
    $('#mijnInhoud').innerHTML = `
      ${berichten.length ? `<div class="paneel"><div class="paneel-kop"><h3>📌 Prikbord</h3></div>${berichten.map(b => `<div class="bericht ${b.belangrijk ? 'belangrijk' : ''}"><h4>${esc(b.titel)}</h4><p style="white-space:pre-wrap;margin:0">${esc(b.tekst)}</p><small class="zacht">${A.tijdGeleden(b.geplaatst)}</small></div>`).join('')}</div>` : ''}
      <div class="paneel"><div class="paneel-kop"><h3>Mijn diensten</h3>${komend.length ? '<button class="knop klein" id="agenda">📲 In mijn agenda</button>' : ''}</div>
        ${regels.some(r => r.html.includes('onbevestigd')) ? '<p class="zacht" style="font-size:.82rem;margin:-.2em 0 .3em">Grijs = voorlopig of door jou opgegeven, nog niet definitief.</p>' : ''}
        ${concept ? `<p class="zacht" style="font-size:.88rem">Het rooster voor ${esc(A.maandNaam(concept.maand))} wordt nog gemaakt.</p>` : ''}
        ${regels.length ? Object.keys(perMaand).sort().map(m => `<h4 style="text-transform:capitalize;margin:.8em 0 .3em;color:var(--zacht);font-size:.85rem">${esc(A.maandNaam(m))}</h4>${perMaand[m].join('')}`).join('')
          : '<div class="leeg"><span class="groot">🛋️</span>Geen diensten gepland<br><a href="#" id="naarBeschikbaar">Bekijk de beschikbare diensten</a></div>'}
      </div>
      <p style="text-align:center;font-size:.9rem;margin:1.2em 0 .4em"><a href="handleiding/personeel.html">📖 Hoe werkt de app?</a></p>`;
    const nb = $('#naarBeschikbaar'); if (nb) nb.onclick = e => { e.preventDefault(); tab = 'beschikbaar'; teken(); window.scrollTo(0, 0); };
  }

  // Feesten waarvoor gevraagd wordt wie kan + open diensten die ik kan oppakken
  function tBeschikbaar() {
    const open = openVoorMij(), uitvragen = mijnUitvragen(), caf = cafGroepen();
    const cafItem = g => { const d = g.d;
      return `<div class="item" style="flex-wrap:wrap"><div class="datumblok cafetaria"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
        <div style="flex:1;min-width:150px"><div class="wie">${esc(d.start)}–${esc(d.eind)} · ${esc(d.functie)}</div><div class="meta">${esc(A.datumLang(d.datum))}${g.ids.length > 1 ? ` · ${g.ids.length} plekken` : ''}</div></div>
        ${knopSchuif(`data-dreac="${g.ids.join(',')}"`, g.kan === null ? 'leeg' : g.kan ? 'ja' : 'nee', 'Kun je op ' + esc(A.datumKort(d.datum)) + ' ' + esc(d.start))}</div>`; };
    const cafMaanden = [...new Set(caf.map(g => g.maand))];
    const uitvraagItem = e => { const r = mijnReactie(e); const fns = [...new Set((e.bezetting || []).map(b => b.functie))].filter(f => (ik.functies || []).includes(f));
      return `<div class="item" style="flex-wrap:wrap"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(e.datum)]}</small></div>
        <div style="flex:1;min-width:150px"><div class="wie">${esc(e.naam)}</div><div class="meta">${esc(A.datumLang(e.datum))} · ${esc(e.start)}–${esc(e.eind)}${fns.length ? ' · ' + fns.map(esc).join('/') : ''}</div>
        ${(() => { // plekken met een andere tijd dan het feest (bv. Bar 19:30) apart laten zien
          const afw = (e.bezetting || []).filter(b => fns.includes(b.functie) && ((b.start && b.start !== e.start) || (b.eind && b.eind !== e.eind)));
          return afw.length ? `<div class="meta">⏱ Ook later/eerder: ${afw.map(b => `${esc(b.functie)} ${esc(b.start || e.start)}–${esc(b.eind || e.eind)}`).join(' · ')}</div>` : ''; })()}
        <div class="meta">Reageren t/m ${esc(A.datumKort(e.uitvraag_tot))}</div></div>
        ${r && r.kan && r.bevestigd_functie
          ? `<div style="flex-basis:100%;display:flex;align-items:center;gap:.6em;justify-content:flex-end;flex-wrap:wrap"><label class="schuif" title="Bevestigd"><input type="checkbox" checked disabled><span class="baan"><i></i></span><span class="schuif-tekst">🔒 Bevestigd</span></label>
             <small class="zacht" style="flex-basis:100%;text-align:right">Kun je toch niet? Bied je plek aan bij <b>Ruilen</b> of neem contact op met ${esc(beheerNaam())}.</small></div>`
          : (() => { const st = !r ? 'leeg' : r.kan ? 'ja' : 'nee';
              return `<div class="keuze3-wrap"><div class="keuze3 st-${st}" data-reac="${e.id}" role="group" aria-label="Kun je op ${esc(e.naam)}?">
                <button type="button" class="k3-tekst nee" data-kan="0">Kan niet</button>
                <span class="k3-baan"><button type="button" class="k3-helft" data-kan="0" aria-label="Kan niet"></button><button type="button" class="k3-helft" data-kan="1" aria-label="Ik kan"></button><i></i></span>
                <button type="button" class="k3-tekst ja" data-kan="1">Ik kan</button></div>
                ${st === 'leeg' ? '<small class="k3-hint">Nog niet gekozen</small>' : ''}</div>`; })()}</div>`; };
    zetGezien(uitvragen);
    // Open diensten compact: één blok per feest (of per dag in de cafetaria), daarin per functie + tijd één regel
    const openBlokken = []; { const per = new Map();
      for (const d of open) { const k = d.event_id || d.datum + '|' + d.locatie;
        if (!per.has(k)) { const b = { d, regels: new Map() }; per.set(k, b); openBlokken.push(b); }
        const rk = [d.functie, d.start, d.eind, A.beheerPlek(d) ? d.medewerker_id : ''].join('|'), rg = per.get(k).regels;
        if (!rg.has(rk)) rg.set(rk, []); rg.get(rk).push(d); } }
    const openBlok = ({ d, regels }) => { const ev = d.event_id && A.event(d.event_id);
      const zeiNee = ev && (mijnReactie(ev) || {}).kan === false;
      const tijden = [...new Set([...regels.values()].map(l => tijd(l[0])))];
      return `<div class="item open-blok"><div class="datumblok ${d.locatie}"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
        <div style="min-width:0;flex:1"><div class="wie">${ev ? '🎉 ' + esc(ev.naam) : A.LOC[d.locatie]}</div>
          <div class="meta">${esc(A.datumLang(d.datum))}${tijden.length === 1 ? ' · ' + tijden[0] : ''}${zeiNee ? ' · <b>je zei "kan niet", maar kun je toch? Pak hem op</b>' : ''}</div>
          ${[...regels.values()].map(l => { const x = l[0]; return `<div class="open-regel"><span><b>${l.length > 1 ? l.length + '× ' : ''}${esc(x.functie)}</b>${tijden.length > 1 ? ' <small>' + tijd(x) + '</small>' : ''}${A.beheerPlek(x) ? `<small class="ster">⭐ nu doet ${esc(A.mwNaam(x.medewerker_id))} dit</small>` : ''}</span><button class="knop klein primair" data-pak="${x.id}">Oppakken</button></div>`; }).join('')}</div></div>`; };
    const nKies = uitvragen.filter(e => !mijnReactie(e)).length;
    const spring = [uitvragen.length && ['spFeesten', `🎉 Kun jij? ${nKies ? `<b class="sp-n">${nKies}</b>` : '✓'}`],
      open.length && ['spOpen', `🙋 Open diensten <b class="sp-n">${open.length}</b>`],
      caf.length && ['spCaf', `☕ Cafetaria <b class="sp-n">${caf.length}</b>`]].filter(Boolean);
    const openHtml = open.length ? `<div class="paneel" id="spOpen" style="border:2px solid var(--accent-licht)"><div class="paneel-kop"><h3>🙋 Open diensten die jij kunt doen</h3></div>${openBlokken.map(openBlok).join('')}</div>` : '';
    $('#inhoud').innerHTML = `
      ${spring.length > 1 ? `<div class="spring">${spring.map(([id, t]) => `<button type="button" data-spring="${id}">${t}</button>`).join('')}</div>` : ''}
      ${nKies ? '' : openHtml}
      ${uitvragen.length ? `<div class="paneel" id="spFeesten" style="border:2px solid var(--zaal-licht)"><div class="paneel-kop"><h3>🎉 Kun jij op deze feesten?</h3></div>
        <div class="zacht" style="font-size:.88rem;margin:-.3em 0 .6em">Schuif naar rechts als je kunt, naar links als je niet kunt. <details class="uitleg-klein"><summary>Meer uitleg</summary>Kun je, dan zie je het feest grijs bij Mijn diensten tot het bevestigd is. Wie het eerst reageert, krijgt geen voorrang. Je reactie kun je tot de datum nog wijzigen.</details></div>
        ${uitvragen.map(uitvraagItem).join('')}</div>` : ''}
      ${nKies ? openHtml : ''}
      ${cafMaanden.map((mnd, i) => { const gs = caf.filter(g => g.maand === mnd); return `<div class="paneel" ${i ? '' : 'id="spCaf"'} style="border:2px solid var(--accent-licht)"><div class="paneel-kop"><h3>☕ ${gs[0].extra ? 'Extra werken? ' : ''}Open cafetariadiensten ${esc(A.maandNaam(mnd))}</h3></div>
        <p class="zacht" style="font-size:.88rem;margin-top:-.3em">${gs[0].extra ? 'Je vaste diensten staan (grijs) bij Mijn diensten. Wil je extra werken? Zet de schuif naar rechts bij de diensten die je erbij wilt; laat hem staan als je geen extra wilt.' : 'Het voorlopige rooster is gemaakt. Deze diensten zijn nog open. Schuif naar rechts als je kunt, naar links als je niet kunt.'} Kiezen kan t/m <b>${esc(A.datumLang(gs[0].tot))}</b>; daarna wordt het werk eerlijk verdeeld (wie het eerst reageert, krijgt geen voorrang).</p>
        ${gs.map(cafItem).join('')}</div>`; }).join('')}
      ${!uitvragen.length && !open.length && !caf.length ? '<div class="paneel"><div class="leeg"><span class="groot">👌</span>Er zijn nu geen beschikbare diensten</div></div>' : ''}`;
    koppelActies();
    document.querySelectorAll('[data-spring]').forEach(k => k.onclick = () => { const el = document.getElementById(k.dataset.spring); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' }); });
    const mb = document.querySelector('#onderbalk button[data-t=beschikbaar] .badge');
    if (mb) { const n = open.length + nieuweUitvragen().length; mb.textContent = n; mb.classList.toggle('verborgen', !n); }
  }

  // ---------------- ziek melden ----------------
  const mijnZiek = () => A.data.ziekmeldingen.filter(z => z.medewerker_id === ik.id && z.status !== 'afgewezen' && (!z.tot || z.tot >= G.today()))
    .sort((a, b) => b.van.localeCompare(a.van))[0];
  const beheerNaam = () => A.data.instellingen.beheer_naam || 'de baas';
  const dienstStart = d => new Date(d.datum + 'T' + d.start + ':00');

  async function ziekMelden() {
    const nu = G.today();
    const komend = mijnDiensten().filter(d => d.datum >= nu && d.datum <= G.addDays(nu, 7) && dienstStart(d) > new Date(Date.now() - 4 * 3600e3));
    const res = await A.modal('Ziek melden', `
      <p>Vervelend dat je ziek bent! Geef hier aan welke diensten je niet kunt doen. Daarna bel je ${esc(beheerNaam())} even.</p>
      ${komend.length ? `<div class="veld"><label>Welke diensten vervallen?</label>${komend.map((d, i) => `<label class="check" style="margin:.4em 0"><input type="checkbox" class="zDienst" value="${d.id}" ${i === 0 ? 'checked' : ''}> ${esc(A.datumKort(d.datum))} · ${tijd(d)} · ${esc(d.functie)}</label>`).join('')}</div>`
        : '<p class="zacht">Je hebt de komende week geen diensten.</p>'}
      <div class="veld"><label>Ziek vanaf</label><input type="date" id="zVan" value="${nu}" max="${G.addDays(nu, 7)}"></div>
      <div class="veld"><label>Opmerking <small>(optioneel)</small></label><input id="zOpm" placeholder="bv. denk dat ik morgen weer kan"></div>
      <p class="zacht" style="font-size:.85rem">🔒 Je hoeft niet te vertellen wat je hebt.</p>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Ziek melden', soort: 'primair', waarde: bg => ({ ids: [...bg.querySelectorAll('.zDienst:checked')].map(i => i.value), van: bg.querySelector('#zVan').value || nu, opm: bg.querySelector('#zOpm').value }) }]);
    if (!res) return;
    const ds = res.ids.map(id => A.data.diensten.find(d => d.id === id)).filter(Boolean).sort((a, b) => dienstStart(a) - dienstStart(b));
    const eerste = ds[0];
    const minuten = eerste ? Math.round((dienstStart(eerste) - Date.now()) / 60000) : null;
    const van = eerste && eerste.datum < res.van ? eerste.datum : res.van;
    await Store.insert('ziekmeldingen', { medewerker_id: ik.id, gemeld_op: new Date().toISOString(), van, tot: null, dienst_ids: res.ids, minuten_voor_dienst: minuten, status: 'gemeld', opmerking: res.opm, notitie_beheer: '' });
    const wanneer = eerste ? ` Eerste dienst: ${A.datumKort(eerste.datum)} ${eerste.start} (${minuten < 60 ? minuten + ' min' : Math.round(minuten / 6) / 10 + ' uur'} van tevoren).` : '';
    await A.melding(null, `🤒 ${ik.naam} heeft zich ziek gemeld.${wanneer} Bevestig het bij Aanvragen → Ziek.`, { titel: 'Ziekmelding ' + ik.naam, link: '#aanvragen/ziek' });
    await ververs();
    belModal();
  }

  function belModal() {
    const tel = A.data.instellingen.beheer_telefoon || '';
    A.modal('Bel nu even ' + beheerNaam(), `
      <p>Je ziekmelding is genoteerd. Bel ${esc(beheerNaam())} nu nog even om het door te geven, zodat er op tijd vervanging geregeld kan worden.</p>
      ${tel ? `<a class="knop primair" href="tel:${esc(tel.replace(/[^\d+]/g, ''))}" style="width:100%;justify-content:center;font-size:1.15rem;padding:.8em">📞 Bel ${esc(beheerNaam())}</a>
        <p style="text-align:center;font-size:1.3rem;font-weight:800;margin:.6em 0 0;letter-spacing:.03em">${esc(tel)}</p>` : '<p style="color:var(--fout)">Er is nog geen telefoonnummer ingesteld. Bel je leidinggevende.</p>'}`,
      [{ label: 'Ik heb gebeld', soort: 'ok', waarde: true }]);
  }

  async function beterMelden() {
    const z = mijnZiek();
    const res = await A.modal('Weer beter', `<p>Fijn dat je weer beter bent! Vanaf wanneer kun je weer werken?</p><div class="veld"><input type="date" id="bVan" value="${G.today()}" min="${z.van}"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Beter melden', soort: 'ok', waarde: bg => bg.querySelector('#bVan').value || G.today() }]);
    if (!res) return;
    const tot = G.addDays(res, -1) < z.van ? z.van : G.addDays(res, -1);
    await Store.update('ziekmeldingen', z.id, { tot });
    await A.melding(null, `💪 ${ik.naam} heeft zich beter gemeld en kan weer werken vanaf ${A.datumLang(res)}.`, { titel: 'Betermelding ' + ik.naam, link: '#verzuim' });
    await ververs(); A.toast('Beter gemeld. Welkom terug!', 'ok');
  }

  function koppelActies() {
    document.querySelectorAll('[data-ruil]').forEach(b => b.onclick = () => ruilAanbieden(A.data.diensten.find(d => d.id === b.dataset.ruil)));
    document.querySelectorAll('[data-intrek]').forEach(b => b.onclick = () => A.bezig(b, async () => {
      const r = A.data.ruilverzoeken.find(x => x.id === b.dataset.intrek);
      await Store.update('ruilverzoeken', r.id, { status: 'ingetrokken' });
      if (r.naar_id) await A.melding(r.naar_id, `${ik.naam} heeft het ruilverzoek ingetrokken. Er verandert niets aan jouw diensten.`);
      await ververs(); A.toast('Ruilverzoek ingetrokken');
    }));
    // schuif: tikken op een kant, of het bolletje naar links/rechts vegen
    document.querySelectorAll('.keuze3[data-reac], .keuze3[data-dreac]').forEach(b => {
      const baan = b.querySelector('.k3-baan'), bol = baan.querySelector('i');
      let startX = null, startLeft = 0, gesleept = false;
      baan.addEventListener('pointerdown', ev => { startX = ev.clientX; startLeft = bol.offsetLeft; gesleept = false; try { baan.setPointerCapture(ev.pointerId); } catch (x) { } });
      baan.addEventListener('pointermove', ev => {
        if (startX === null) return;
        const dx = ev.clientX - startX;
        if (!gesleept && Math.abs(dx) < 6) return;
        gesleept = true; bol.style.transition = 'none';
        bol.style.left = Math.max(3, Math.min(baan.clientWidth - bol.offsetWidth - 3, startLeft + dx)) + 'px';
      });
      const los = ev => {
        if (startX === null) return;
        const dx = ev.clientX - startX; startX = null;
        bol.style.transition = ''; 
        if (!gesleept) return;                       // gewoon getikt: dat regelt de klik
        bol.style.left = '';
        baan.dataset.negeerKlik = '1'; setTimeout(() => delete baan.dataset.negeerKlik, 350);
        if (Math.abs(dx) >= 12) kies(b, dx > 0);
      };
      baan.addEventListener('pointerup', los);
      baan.addEventListener('pointercancel', () => { startX = null; bol.style.transition = ''; bol.style.left = ''; });
    });
    document.querySelectorAll('.keuze3[data-reac] [data-kan], .keuze3[data-dreac] [data-kan]').forEach(k => k.onclick = () => {
      const b = k.closest('.keuze3');
      if (b.querySelector('.k3-baan').dataset.negeerKlik) return;
      kies(b, k.dataset.kan === '1');
    });
    async function kies(b, kan) {
      if (b.dataset.dreac) return cafKies(b, kan);
      const e = A.event(b.dataset.reac);
      const huidig = mijnReactie(e);
      if (huidig && huidig.kan === kan) return;
      b.className = 'keuze3 bezig st-' + (kan ? 'ja' : 'nee');
      const hint = b.parentNode.querySelector('.k3-hint'); if (hint) hint.remove();
      try {
      await A.reload();
      const ev = A.event(e.id);
      if (!ev || ev.status !== 'open') { A.toast('De termijn voor dit feest is al voorbij', 'fout'); return ververs(); }
      if ((mijnReactie(ev) || {}).bevestigd_functie) { A.toast('Je bent al bevestigd. Neem contact op met ' + beheerNaam() + ' als je toch niet kunt.', 'fout'); return ververs(); }
      const bestaand = mijnReactie(ev);
      if (bestaand) await Store.update('event_reacties', bestaand.id, { kan, tijd: new Date().toISOString() });
      else { const t = new Date().toISOString(); await Store.insert('event_reacties', { event_id: ev.id, medewerker_id: ik.id, kan, opmerking: '', tijd: t, eerste_tijd: t }); }
      await ververs(); A.toast(kan ? 'Genoteerd: je kunt' : 'Genoteerd: je kunt niet', 'ok');
      } catch (x) { A.toast('Opslaan lukte niet, probeer het opnieuw', 'fout'); ververs(); }
    }
    async function cafKies(b, kan) {
      const ids = b.dataset.dreac.split(',');
      b.className = 'keuze3 bezig st-' + (kan ? 'ja' : 'nee');
      const hint = b.parentNode.querySelector('.k3-hint'); if (hint) hint.remove();
      try {
        await A.reload();
        const r = A.data.roosters.find(r => r.status === 'voorlopig' && Uitvraag.cafOpen(A.data, r.maand).some(d => ids.includes(d.id)));
        if (!r || (r.uitvraag_tot && r.uitvraag_tot < G.today())) { A.toast('De termijn is al voorbij', 'fout'); return ververs(); }
        const tijdNu = new Date().toISOString();
        for (const id of ids) {
          const bestaand = A.data.event_reacties.find(x => x.dienst_id === id && x.medewerker_id === ik.id);
          if (bestaand) { if (bestaand.kan !== kan) await Store.update('event_reacties', bestaand.id, { kan, tijd: tijdNu }); }
          else await Store.insert('event_reacties', { event_id: null, dienst_id: id, medewerker_id: ik.id, kan, opmerking: '', tijd: tijdNu, eerste_tijd: tijdNu });
        }
        await ververs(); A.toast(kan ? 'Genoteerd: je kunt' : 'Genoteerd: je kunt niet', 'ok');
      } catch (x) { console.error(x); A.toast('Opslaan lukte niet, probeer het opnieuw', 'fout'); ververs(); }
    }
    document.querySelectorAll('[data-pak]').forEach(b => b.onclick = () => pakOpen(A.data.diensten.find(d => d.id === b.dataset.pak), b));
    document.querySelectorAll('[data-neem]').forEach(b => b.onclick = () => neemOver(A.data.ruilverzoeken.find(r => r.id === b.dataset.neem), b));
    document.querySelectorAll('[data-weiger]').forEach(b => b.onclick = () => weigerRuil(A.data.ruilverzoeken.find(r => r.id === b.dataset.weiger), b));
  }

  async function ruilAanbieden(d) {
    const ctx = G.context(A.data, A.data.diensten.filter(x => x.id !== d.id));
    const kunnen = A.data.medewerkers.filter(m => m.id !== ik.id && G.beoordeel(ctx, m, { ...d, medewerker_id: null }, { negeerUitvraag: true, alleenOk: true }).ok);
    const anderen = A.data.medewerkers.filter(m => m.id !== ik.id && m.actief !== false && !kunnen.includes(m)).sort((a, b) => a.naam.localeCompare(b.naam));
    const goedk = A.data.instellingen.ruil_goedkeuring;
    // diensten van de gekozen collega die ik terug zou kunnen nemen
    const terugOpties = mid => {
      const ctx2 = G.context(A.data, A.data.diensten.filter(x => x.id !== d.id));
      return A.data.diensten.filter(x => x.medewerker_id === mid && x.datum >= G.today() && zichtbaar(x) && !actieveRuil(x.id))
        .filter(x => { const c = G.context(A.data, A.data.diensten.filter(y => y.id !== x.id && y.id !== d.id)); return G.beoordeel(c, ik, { ...x, medewerker_id: null }, { negeerUitvraag: true, alleenOk: true }).ok; })
        .sort((a, b) => a.datum.localeCompare(b.datum));
    };
    const res = await A.modal('Dienst ruilen', `<p><b>${esc(A.datumLang(d.datum))}</b>, ${tijd(d)} (${A.LOC[d.locatie]}, ${esc(d.functie)})</p>
      <div class="veld"><label>Aan wie?</label><select id="rAan">
        <option value="">Iedereen die kan${kunnen.length ? ' (' + kunnen.length + ')' : ''}</option>
        ${kunnen.length ? `<optgroup label="Al afgesproken met…">${kunnen.map(m => `<option value="${m.id}">${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}
        ${anderen.length ? `<optgroup label="Kan deze dienst eigenlijk niet">${anderen.map(m => `<option value="${m.id}" data-nee="1">${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}
      </select></div>
      <div class="veld verborgen" id="rTerugWrap"><label>In ruil voor een dienst van <span id="rTerugNaam"></span>? <small>(optioneel)</small></label><select id="rTerug"></select></div>
      <p class="zacht" id="rUitleg" style="font-size:.88rem"></p>
      <div class="veld"><label>Bericht</label><input id="rBericht" placeholder="bv. Ik moet naar de tandarts"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Versturen', soort: 'primair', waarde: bg => ({ naar: bg.querySelector('#rAan').value || null, terug: bg.querySelector('#rTerug').value || null, bericht: bg.querySelector('#rBericht').value }) }],
      bg => {
        const aan = bg.querySelector('#rAan'), terug = bg.querySelector('#rTerug'), uitleg = bg.querySelector('#rUitleg');
        const update = () => {
          const mid = aan.value, m = mid && A.mw(mid);
          bg.querySelector('#rTerugWrap').classList.toggle('verborgen', !mid);
          if (m) {
            bg.querySelector('#rTerugNaam').textContent = m.naam;
            const opts = terugOpties(mid);
            terug.innerHTML = `<option value="">Nee, ${esc(m.naam)} neemt alleen mijn dienst over</option>` + opts.map(x => `<option value="${x.id}">${esc(A.datumKort(x.datum))} · ${x.start}–${x.eind} · ${esc(x.functie)}</option>`).join('');
            const nee = aan.selectedOptions[0].dataset.nee;
            uitleg.innerHTML = (nee ? `<span style="color:var(--fout)">⚠️ Volgens het systeem kan ${esc(m.naam)} deze dienst niet doen (andere functie, al ingepland of vrij). De baas beslist.</span><br>` : '') +
              `${esc(m.naam)} krijgt een verzoek en moet eerst bevestigen.${goedk ? ' Daarna keurt de baas het goed.' : ''} Pas dan is de dienst geruild. Tot die tijd blijft hij gewoon van jou.`;
          } else {
            uitleg.innerHTML = kunnen.length ? `Je dienst wordt aangeboden aan iedereen die hem kan doen. Wie hem als eerste overneemt, krijgt hem${goedk ? ' (na goedkeuring van de baas)' : ''}. Tot die tijd blijft hij van jou.`
              : '<span style="color:var(--fout)">Op dit moment kan niemand deze dienst doen. Kies iemand met wie je het hebt afgesproken, of bel de baas.</span>';
          }
        };
        aan.onchange = update; update();
      });
    if (!res) return;
    const omschr = `${A.datumLang(d.datum)} ${d.start}–${d.eind} (${d.functie})`;
    await Store.insert('ruilverzoeken', { dienst_id: d.id, van_id: ik.id, naar_id: res.naar, terug_dienst_id: res.terug, status: res.naar ? 'gevraagd' : 'open', bericht: res.bericht, aangemaakt_op: new Date().toISOString() });
    if (res.naar) {
      const t = res.terug && A.data.diensten.find(x => x.id === res.terug);
      await A.melding(res.naar, `🔁 ${ik.naam} vraagt of jij de dienst van ${omschr} wilt overnemen${t ? `, in ruil voor jouw dienst van ${A.datumLang(t.datum)} ${t.start}–${t.eind}` : ''}. Bevestig het bij Ruilen.`);
      A.toast(A.mwNaam(res.naar) + ' moet het nu bevestigen', 'ok');
    } else {
      for (const m of kunnen) await A.melding(m.id, `🔁 ${ik.naam} zoekt iemand voor ${omschr}. Kijk bij Ruilen.`);
      await A.melding(null, `${ik.naam} biedt de dienst van ${omschr} aan om te ruilen.`);
      A.toast('Je dienst is aangeboden', 'ok');
    }
    await ververs();
  }

  // Overnemen: zowel een open aanbod als een verzoek dat aan mij is gericht
  async function neemOver(r, knop) {
    const d = A.data.diensten.find(x => x.id === r.dienst_id);
    const t = r.terug_dienst_id && A.data.diensten.find(x => x.id === r.terug_dienst_id);
    const vraag = `Wil je de dienst van ${A.mwNaam(r.van_id)} overnemen op ${A.datumLang(d.datum)}, ${d.start}–${d.eind}?` + (t ? ` ${A.mwNaam(r.van_id)} neemt dan jouw dienst van ${A.datumLang(t.datum)} ${t.start}–${t.eind} over.` : '');
    if (!await A.bevestig(t ? 'Diensten ruilen' : 'Dienst overnemen', vraag, t ? 'Ja, we ruilen' : 'Ja, ik neem hem')) return;
    await A.bezig(knop, async () => {
      await A.reload();
      const nu = A.data.ruilverzoeken.find(x => x.id === r.id);
      if (!nu || !(nu.status === 'open' || (nu.status === 'gevraagd' && nu.naar_id === ik.id))) { A.toast(nu && nu.status === 'ingetrokken' ? 'Het verzoek is ingetrokken' : 'Iemand anders was je net voor', 'fout'); return ververs(); }
      const omschr = `${A.datumLang(d.datum)} (${d.start}–${d.eind})`;
      if (A.data.instellingen.ruil_goedkeuring) {
        await Store.update('ruilverzoeken', r.id, { status: 'overgenomen', naar_id: ik.id });
        await A.melding(r.van_id, `👍 ${ik.naam} heeft de ruil voor ${omschr} bevestigd. Nu wacht het nog op goedkeuring van de baas.`);
        await A.melding(null, `Ruil goed te keuren: ${ik.naam} neemt ${omschr} over van ${A.mwNaam(r.van_id)}${t ? ' (en geeft ' + A.datumLang(t.datum) + ' terug)' : ''}.`, { titel: 'Ruil goedkeuren', link: '#aanvragen/ruil' });
        A.toast('Bevestigd! De baas moet het nog goedkeuren.', 'ok');
      } else {
        await A.voerRuilUit({ ...nu, naar_id: ik.id });
        await A.melding(r.van_id, `✅ Geruild: ${ik.naam} neemt je dienst op ${omschr} over${t ? ', jij werkt op ' + A.datumLang(t.datum) + ' ' + t.start + '–' + t.eind : ''}.`);
        await A.melding(null, `${ik.naam} en ${A.mwNaam(r.van_id)} hebben geruild: ${omschr}${t ? ' ↔ ' + A.datumLang(t.datum) : ''}.`);
        A.toast('Geruild!', 'ok');
      }
      await ververs();
    });
  }

  async function weigerRuil(r, knop) {
    await A.bezig(knop, async () => {
      const d = A.data.diensten.find(x => x.id === r.dienst_id);
      await Store.update('ruilverzoeken', r.id, { status: 'geweigerd' });
      await A.melding(r.van_id, `${ik.naam} kan je dienst van ${A.datumLang(d.datum)} (${d.start}–${d.eind}) helaas niet overnemen. Je kunt hem aan iemand anders aanbieden.`);
      await ververs(); A.toast('Je hebt het verzoek afgeslagen');
    });
  }

  async function pakOpen(d, knop) {
    if (!await A.bevestig('Dienst oppakken', `Wil je werken op ${A.datumLang(d.datum)}, ${d.start}–${d.eind} (${A.LOC[d.locatie]}, ${d.functie})?`, 'Ja, ik werk')) return;
    await A.bezig(knop, async () => {
      await A.reload();
      const nu = A.data.diensten.find(x => x.id === d.id);
      if (!nu || !oppakbaar(nu)) { A.toast('Deze dienst is al door iemand opgepakt', 'fout'); return ververs(); }
      const vanBaas = !!nu.medewerker_id;
      await Store.update('diensten', d.id, { medewerker_id: ik.id, opgepakt_door: ik.id, opgepakt_op: new Date().toISOString() });
      if (evConcept(nu)) {
        // nog niet verstuurd: als 'Ik kan' vastleggen, zodat hij grijs bij Mijn diensten staat tot het verstuurd is
        const e = A.event(nu.event_id), r = mijnReactie(e), tijd = new Date().toISOString();
        if (r) await Store.update('event_reacties', r.id, { kan: true, tijd });
        else await Store.insert('event_reacties', { event_id: e.id, medewerker_id: ik.id, kan: true, opmerking: '', tijd, eerste_tijd: tijd, bevestigd_functie: null, aangeboden: false });
      }
      await A.melding(null, `${ik.naam} heeft de ${vanBaas ? 'plek van ' + A.mwNaam(nu.medewerker_id) : 'open dienst'} van ${A.datumLang(d.datum)} ${d.start}–${d.eind} (${d.functie}) opgepakt.`);
      await ververs(); A.toast('Top, je staat erop!', 'ok');
    });
  }

  // ---------------- tab: rooster (week) ----------------
  // Rooster bekijken als maand, week of dag
  function roosterDienstenOp(dag) {
    return A.data.diensten.filter(x => x.datum === dag && zichtbaar(x) && (roosterLoc === 'alle' || x.locatie === roosterLoc))
      .sort((a, b) => (a.locatie === b.locatie ? 0 : a.locatie === 'cafetaria' ? -1 : 1) || G.min(a.start) - G.min(b.start));
  }
  function dagBlok(dag, dicht) {
    const nu = G.today(), pub = A.isGepubliceerd(G.monthOf(dag));
    const ds = roosterDienstenOp(dag);
    const evs = A.data.zalen_events.filter(e => e.datum === dag && roosterLoc !== 'cafetaria');
    // open plekken met dezelfde functie en tijd samenvoegen
    const rijen = [], open = new Map();
    for (const x of ds) {
      if (x.medewerker_id) { rijen.push({ x, n: 1 }); continue; }
      const k = [x.event_id || '', x.locatie, x.functie, x.start, x.eind].join('|');
      if (open.has(k)) open.get(k).n++; else { const g = { x, n: 1 }; open.set(k, g); rijen.push(g); }
    }
    return `<div class="dagrij ${dag === nu ? 'vandaag' : ''}"><div class="dk"><span style="text-transform:capitalize">${esc(A.datumLang(dag))}</span><span>${dag === nu ? 'vandaag' : ''}</span></div>
      ${!pub && !ds.length ? '<div class="regel zacht">Rooster nog niet bekend</div>' : ''}
      ${pub && dicht.has(dag) && roosterLoc !== 'zalen' ? `<div class="regel zacht">Cafetaria gesloten${dicht.get(dag) ? ' – ' + esc(dicht.get(dag)) : ''}</div>` : ''}
      ${evs.filter(e => A.eventZichtbaar(e)).map(e => `<div class="ev">🎉 ${esc(e.naam)} · ${esc(e.start)}–${esc(e.eind)}</div>`).join('')}
      ${rijen.map(({ x, n }) => { const m = A.mw(x.medewerker_id); return `<div class="regel ${x.medewerker_id === ik.id ? 'mijn' : ''}"><span class="t">${tijd(x)}</span>${m ? `<span class="stip" style="background:${esc(m.kleur)}"></span>` : ''}<span style="flex:1">${m ? esc(m.naam) : `<b style="color:var(--fout)">Open${n > 1 ? ' ' + n + '×' : ''}</b>`}</span><span class="zacht" style="font-size:.8rem">${esc(x.functie)}</span><span class="label ${x.locatie === 'zalen' ? 'zaal' : 'caf'}" style="font-size:.65rem">${x.locatie === 'zalen' ? 'Zaal' : 'Caf'}</span></div>`; }).join('')}
      ${pub && !ds.length && !dicht.has(dag) ? '<div class="regel zacht">Geen diensten</div>' : ''}</div>`;
  }

  function tRooster() {
    const nu = G.today();
    const dicht = new Map(A.data.sluitingsdagen.map(s => [s.datum, s.reden]));
    const maand = G.monthOf(roosterDag), ws = G.weekStart(roosterDag);
    let kop, inhoud, isNu;
    if (roosterView === 'maand') {
      kop = `<b style="text-transform:capitalize">${esc(A.maandNaam(maand))}</b>`;
      isNu = maand === G.monthOf(nu);
      const dagen = G.monthDays(maand), eerste = G.weekday(dagen[0]);
      const cellen = [...Array(eerste)].map(() => '<div class="mk-dag leeg"></div>').concat(dagen.map(dag => {
        const ds = roosterDienstenOp(dag), mijn = ds.filter(x => x.medewerker_id === ik.id);
        const ev = A.data.zalen_events.some(e => e.datum === dag && roosterLoc !== 'cafetaria' && A.eventZichtbaar(e));
        const opgegeven = mijnOpgegeven().some(e => e.datum === dag);
        const openN = ds.filter(x => !x.medewerker_id).length;
        return `<button class="mk-dag ${dag === nu ? 'vandaag' : ''} ${dag < nu ? 'voorbij' : ''} ${mijn.length ? 'werk' : ''}" data-dag="${dag}">
          <span class="nr">${G.parse(dag).getUTCDate()}</span>
          ${mijn.length ? `<span class="mk-tijd">${mijn[0].start.replace(/:00$/, '')}–${mijn[0].eind.replace(/:00$/, '')}${mijn.length > 1 ? ' +' + (mijn.length - 1) : ''}</span>` : opgegeven ? '<span class="mk-tijd grijs">?</span>' : ''}
          <span class="mk-stippen">${ev ? '<i class="st-ev"></i>' : ''}${openN ? '<i class="st-open"></i>' : ''}${dicht.has(dag) && roosterLoc !== 'zalen' ? '<i class="st-dicht"></i>' : ''}</span></button>`;
      }));
      inhoud = `<div class="paneel" style="padding:.7em"><div class="mk">${A.DAG_KORT.map(d => `<div class="mk-kop">${d}</div>`).join('')}${cellen.join('')}</div>
        <div class="mk-legenda"><span><i class="st-werk"></i>Jij werkt</span><span><i class="st-ev"></i>Feest</span><span><i class="st-open"></i>Open plek</span><span><i class="st-dicht"></i>Gesloten</span></div>
        ${A.isGepubliceerd(maand) ? '' : '<p class="zacht" style="font-size:.85rem;margin:.6em 0 0;text-align:center">Het rooster voor deze maand is nog niet bekend.</p>'}
        <p class="zacht" style="font-size:.8rem;margin:.4em 0 0;text-align:center">Tik op een dag om die dag te bekijken.</p></div>`;
    } else if (roosterView === 'week') {
      const dagen = [...Array(7)].map((_, i) => G.addDays(ws, i));
      kop = `<b>Week ${G.isoWeek(ws)}</b><br><small class="zacht">${esc(A.datumKort(dagen[0]))} – ${esc(A.datumKort(dagen[6]))}</small>`;
      isNu = ws === G.weekStart(nu);
      inhoud = dagen.map(dag => dagBlok(dag, dicht)).join('');
    } else {
      kop = `<b style="text-transform:capitalize">${esc(A.datumLang(roosterDag))}</b>${roosterDag === nu ? '<br><small class="zacht">vandaag</small>' : ''}`;
      isNu = roosterDag === nu;
      inhoud = dagBlok(roosterDag, dicht);
    }
    $('#inhoud').innerHTML = `
      <div style="display:flex;justify-content:center;margin-bottom:.7em"><div class="tabs" id="rView"><button data-v="maand">Maand</button><button data-v="week">Week</button><button data-v="dag">Dag</button></div></div>
      <div class="weekkeuze"><button class="knop klein" id="wVorige">◀</button><div style="text-align:center">${kop}</div><button class="knop klein" id="wVolgende">▶</button></div>
      <div style="display:flex;justify-content:center;margin-bottom:.8em"><div class="tabs" id="rLoc"><button data-v="alle">Alles</button><button data-v="cafetaria">Cafetaria</button><button data-v="zalen">Zalencentrum</button></div></div>
      ${isNu ? '' : `<p style="text-align:center;margin-top:-.4em"><a href="#" id="naarNu">Naar vandaag</a></p>`}
      ${inhoud}`;
    const stap = r => roosterView === 'maand' ? (r > 0 ? G.nextMonth(maand) : G.prevMonth(maand)) + '-01' : G.addDays(roosterDag, roosterView === 'week' ? 7 * r : r);
    $('#wVorige').onclick = () => { roosterDag = stap(-1); tRooster(); };
    $('#wVolgende').onclick = () => { roosterDag = stap(1); tRooster(); };
    const nn = $('#naarNu'); if (nn) nn.onclick = e => { e.preventDefault(); roosterDag = nu; tRooster(); };
    document.querySelectorAll('#rView button').forEach(b => { b.classList.toggle('actief', b.dataset.v === roosterView); b.onclick = () => { roosterView = b.dataset.v; tRooster(); }; });
    document.querySelectorAll('#rLoc button').forEach(b => { b.classList.toggle('actief', b.dataset.v === roosterLoc); b.onclick = () => { roosterLoc = b.dataset.v; tRooster(); }; });
    document.querySelectorAll('.mk-dag[data-dag]').forEach(b => b.onclick = () => { roosterDag = b.dataset.dag; roosterView = 'dag'; tRooster(); window.scrollTo(0, 0); });
  }

  // ---------------- tab: vrij vragen ----------------
  function tVrij() {
    const nu = G.today();
    const mijnVerlof = A.data.verlof.filter(v => v.medewerker_id === ik.id && v.tot >= G.addDays(nu, -30)).sort((a, b) => b.van.localeCompare(a.van));
    const ziek = mijnZiek();
    $('#inhoud').innerHTML = `
      <div class="paneel"><div class="paneel-kop"><h3>🌴 Vrij vragen</h3></div>
        <div class="rij"><div class="veld"><label>Van</label><input type="date" id="vVan" min="${nu}"></div><div class="veld"><label>Tot en met</label><input type="date" id="vTot" min="${nu}"></div></div>
        <div class="veld"><label>Reden <small>(optioneel)</small></label><input id="vReden" placeholder="bv. vakantie, bruiloft vriendin"></div>
        <button class="knop primair" id="vAanvragen">Aanvragen</button>
        ${mijnVerlof.length ? `<h4 style="margin:1.2em 0 .2em">Mijn aanvragen</h4>${mijnVerlof.map(v => `<div class="item"><div><div class="wie">${esc(A.datumKort(v.van))}${v.tot !== v.van ? ' t/m ' + esc(A.datumKort(v.tot)) : ''}</div>
          <div class="meta">${esc(v.reden || '')}${v.reactie ? ' · 💬 ' + esc(v.reactie) : ''}</div></div>
          <div class="rechts"><span class="label ${v.status === 'goedgekeurd' ? 'ok' : v.status === 'afgewezen' ? 'fout' : 'let'}">${v.status === 'aangevraagd' ? 'in behandeling' : v.status}</span>${v.status === 'aangevraagd' ? `<button class="icoon" data-vweg="${v.id}" title="Intrekken">✕</button>` : ''}</div></div>`).join('')}` : ''}
      </div>
      ${ziek ? `<div class="paneel" style="border:2px solid var(--fout-licht)"><div class="paneel-kop"><h3>🤒 Je bent ziek gemeld</h3><button class="knop klein ok" id="beterKnop">Ik ben weer beter</button></div>
        <p class="zacht" style="margin:0">Sinds ${esc(A.datumLang(ziek.van))}${ziek.status === 'gemeld' ? ` · nog niet bevestigd door ${esc(beheerNaam())}` : ''}. Beterschap!</p></div>`
        : `<div class="paneel"><div class="paneel-kop"><h3>🤒 Ziek melden</h3></div>
        <p class="zacht" style="font-size:.9rem">Ben je ziek? Meld je hier af voor je diensten en bel daarna even ${esc(beheerNaam())}.</p>
        <button class="knop" id="ziekKnop" style="width:100%;justify-content:center;border-color:var(--fout);color:var(--fout);background:#fff">🤒 Ik ben ziek</button></div>`}`;
    if ($('#ziekKnop')) $('#ziekKnop').onclick = ziekMelden;
    if ($('#beterKnop')) $('#beterKnop').onclick = beterMelden;
    $('#vVan').onchange = () => { if (!$('#vTot').value || $('#vTot').value < $('#vVan').value) $('#vTot').value = $('#vVan').value; };
    $('#vAanvragen').onclick = e => A.bezig(e.target, async () => {
      const van = $('#vVan').value, tot = $('#vTot').value || van;
      if (!van) return A.toast('Kies een datum', 'fout');
      if (tot < van) return A.toast('De einddatum ligt voor de begindatum', 'fout');
      await Store.insert('verlof', { medewerker_id: ik.id, van, tot, reden: $('#vReden').value, status: 'aangevraagd', reactie: '', aangevraagd_op: new Date().toISOString() });
      await A.melding(null, `${ik.naam} vraagt vrij: ${A.datumKort(van)}${tot !== van ? ' t/m ' + A.datumKort(tot) : ''}${$('#vReden').value ? ' (' + $('#vReden').value + ')' : ''}.`, { titel: 'Vrij-aanvraag ' + ik.naam, link: '#aanvragen/verlof' });
      await ververs(); A.toast('Aanvraag verstuurd', 'ok');
    });
    document.querySelectorAll('[data-vweg]').forEach(b => b.onclick = async () => { if (await A.bevestig('Intrekken', 'Wil je deze aanvraag intrekken?', 'Intrekken')) { await Store.remove('verlof', b.dataset.vweg); await ververs(); } });
  }

  // ---------------- tab: ruilen ----------------
  function tRuil() {
    const aanbod = ruilAanbod();
    const aanMij = verzoekenAanMij();
    const fAanbod = feestAanbod(), mijnBev = mijnBevestigd();
    const feestItem = (e, regel, knop) => `<div class="item"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(e.datum)]}</small></div>
      <div style="min-width:0"><div class="wie">${esc(e.start)}–${esc(e.eind)} <span class="label zaal">${A.LOC.zalen}</span></div><div class="meta">${esc(A.datumLang(e.datum))} · 🎉 ${esc(e.naam)}</div>${regel}</div><div class="rechts">${knop}</div></div>`;
    const mijn = A.data.ruilverzoeken.filter(r => r.van_id === ik.id || r.naar_id === ik.id).sort((a, b) => (b.aangemaakt_op || '').localeCompare(a.aangemaakt_op || '')).slice(0, 12);
    const mijnKomend = mijnDiensten().filter(d => d.datum >= G.today() && !actieveRuil(d.id));
    const statusTekst = r => ({ open: 'zoekt nog iemand', gevraagd: 'wacht op ' + A.mwNaam(r.naar_id), overgenomen: 'wacht op de baas', goedgekeurd: 'geruild', afgewezen: 'afgewezen door baas', geweigerd: 'afgeslagen', ingetrokken: 'ingetrokken' }[r.status]);
    const terugTekst = r => { const t = r.terug_dienst_id && A.data.diensten.find(x => x.id === r.terug_dienst_id); return t ? `<div class="meta">↔ in ruil voor ${r.naar_id === ik.id ? 'jouw' : 'de'} dienst van ${esc(A.datumKort(t.datum))} ${tijd(t)}</div>` : ''; };
    const metNaam = (r, d, knoppen) => dienstItem(d, knoppen).replace('<div class="meta">', `<div class="meta"><b>${esc(A.mwNaam(r.van_id))}</b>${r.bericht ? ': “' + esc(r.bericht) + '”' : ''}</div>${terugTekst(r)}<div class="meta">`);
    $('#inhoud').innerHTML = `
      ${aanMij.length ? `<div class="paneel" style="border:2px solid var(--accent-licht)"><div class="paneel-kop"><h3>📩 Verzoeken aan jou</h3></div>
        ${aanMij.map(r => metNaam(r, A.data.diensten.find(x => x.id === r.dienst_id), `<button class="knop klein" data-weiger="${r.id}">Nee</button><button class="knop klein primair" data-neem="${r.id}">Ja, akkoord</button>`)).join('')}</div>` : ''}
      <div class="paneel"><div class="paneel-kop"><h3>🙋 Collega's zoeken iemand</h3></div>
        ${fAanbod.map(({ r, e }) => feestItem(e, `<div class="meta"><b>${esc(A.mwNaam(r.medewerker_id))}</b> kan niet · ${esc(r.bevestigd_functie)}</div>${r.overname_door === ik.id ? `<div class="meta" style="color:var(--let)">⏳ Jij neemt over – wacht op goedkeuring van ${esc(beheerNaam())}</div>` : ''}`,
          r.overname_door === ik.id ? '' : `<button class="knop klein primair" data-fneem="${r.id}">Overnemen</button>`)).join('')}
        ${aanbod.length ? aanbod.map(({ r, d }) => metNaam(r, d, `<button class="knop klein primair" data-neem="${r.id}">Overnemen</button>`)).join('') : ''}
        ${!aanbod.length && !fAanbod.length ? '<div class="leeg">Er wordt nu niemand gezocht voor een dienst die jij kunt doen</div>' : ''}</div>
      <div class="paneel"><div class="paneel-kop"><h3>Kan je zelf een dienst niet?</h3></div>
        <p class="zacht" style="font-size:.88rem;margin-top:-.3em">Al iets afgesproken met een collega? Kies diegene dan meteen. Je kunt ook een dienst van die collega terugnemen.</p>
        ${mijnKomend.length ? `<div class="veld"><label>Kies de dienst</label><select id="ruilKeuze">${mijnKomend.map(d => `<option value="${d.id}">${esc(A.datumKort(d.datum))} · ${d.start}–${d.eind} · ${esc(d.functie)}</option>`).join('')}</select></div><button class="knop" id="ruilStart">Ruilen of aanbieden…</button>` : ''}
        ${mijnBev.length ? `<h4 style="margin:1em 0 .2em;font-size:.9rem">Bevestigde feesten</h4>${mijnBev.map(({ r, e }) => feestItem(e,
            `<div class="meta">✓ Bevestigd${r.bevestigd_functie !== 'bevestigd' ? ' · ' + esc(r.bevestigd_functie) : ''}</div>${r.aangeboden ? `<div class="meta" style="color:var(--let)">🔁 ${r.overname_door ? esc(A.mwNaam(r.overname_door)) + ' neemt over – wacht op goedkeuring van ' + esc(beheerNaam()) : 'Aangeboden – wacht tot een collega het overneemt'}</div>` : ''}`,
            r.aangeboden ? `<button class="knop klein" data-fintrek="${r.id}">Intrekken</button>` : `<button class="knop klein" data-faanbied="${r.id}">Aanbieden</button>`)).join('')}` : ''}
        ${!mijnKomend.length && !mijnBev.length ? '<p class="zacht">Je hebt geen diensten die je kunt aanbieden.</p>' : ''}
      </div>
      ${mijn.length ? `<div class="paneel"><div class="paneel-kop"><h3>Mijn ruilingen</h3></div>${mijn.map(r => { const d = A.data.diensten.find(x => x.id === r.dienst_id); if (!d) return ''; return `<div class="item"><div><div class="wie">${esc(A.datumKort(d.datum))} · ${tijd(d)}</div><div class="meta">${r.van_id === ik.id ? 'Van jou' + (r.naar_id ? ' → ' + esc(A.mwNaam(r.naar_id)) : '') : 'Van ' + esc(A.mwNaam(r.van_id)) + ' → jij'}</div>${terugTekst(r)}</div><div class="rechts"><span class="label ${r.status === 'goedgekeurd' ? 'ok' : ['afgewezen', 'ingetrokken', 'geweigerd'].includes(r.status) ? 'fout' : 'let'}">${statusTekst(r)}</span>${r.van_id === ik.id && ACTIEF.includes(r.status) ? `<button class="icoon" data-intrek="${r.id}" title="Intrekken">✕</button>` : ''}</div></div>`; }).join('')}</div>` : ''}`;
    const rs = $('#ruilStart'); if (rs) rs.onclick = () => ruilAanbieden(A.data.diensten.find(d => d.id === $('#ruilKeuze').value));
    koppelActies();
    document.querySelectorAll('[data-faanbied]').forEach(b => b.onclick = () => feestAanbieden(A.data.event_reacties.find(r => r.id === b.dataset.faanbied)));
    document.querySelectorAll('[data-fintrek]').forEach(b => b.onclick = () => A.bezig(b, async () => {
      const r = A.data.event_reacties.find(x => x.id === b.dataset.fintrek);
      await Store.update('event_reacties', r.id, { aangeboden: false, overname_door: null });
      if (r.overname_door) { const e = A.event(r.event_id); await A.melding(r.overname_door, `${ik.naam} heeft het aanbod voor ${feestOmschr(e, r.bevestigd_functie)} ingetrokken. Je hoeft niet over te nemen.`); }
      await ververs(); A.toast('Aanbod ingetrokken – je staat er gewoon weer op');
    }));
    document.querySelectorAll('[data-fneem]').forEach(b => b.onclick = () => feestOvernemen(b.dataset.fneem, b));
  }

  // Bevestigde feestplek aanbieden aan collega's (er is nog geen echte dienst, want de uitvraag loopt nog)
  async function feestAanbieden(r) {
    const e = A.event(r.event_id), f = r.bevestigd_functie;
    const kunnen = G.uitvraagGroep(e, A.data).filter(m => m.id !== ik.id && (m.functies || []).includes(f) && !(A.data.event_reacties.find(x => x.event_id === e.id && x.medewerker_id === m.id) || {}).bevestigd_functie);
    const res = await A.modal('Plek aanbieden', `<p>Je bent bevestigd voor <b>${esc(feestOmschr(e, f))}</b>.</p>
      <p>${kunnen.length ? `Je plek wordt aangeboden aan ${kunnen.length} collega('s) die ${esc(f)} kunnen doen. Wie hem als eerste overneemt${A.data.instellingen.feest_ruil_goedkeuring ? ` (en ${esc(beheerNaam())} keurt het goed)` : ''}, staat erop en jij niet meer. Tot die tijd blijf je zelf ingepland.` : `<span style="color:var(--fout)">Er is op dit moment geen collega die deze plek kan overnemen. Bel ${esc(beheerNaam())}.</span>`}</p>
      <div class="veld"><label>Bericht <small>(optioneel)</small></label><input id="fBericht" placeholder="bv. Ik moet onverwacht weg"></div>`,
      [{ label: 'Annuleren', waarde: null }, ...(kunnen.length ? [{ label: 'Aanbieden', soort: 'primair', waarde: bg => bg.querySelector('#fBericht').value || '' }] : [])]);
    if (res === null || res === undefined) return;
    await Store.update('event_reacties', r.id, { aangeboden: true });
    const extra = res ? ` (“${res}”)` : '';
    for (const m of kunnen) await A.melding(m.id, `🔁 ${ik.naam} zoekt iemand voor ${feestOmschr(e, f)}${extra}. Kun jij? Kijk bij Ruilen.`);
    await A.melding(null, `🔁 ${ik.naam} biedt de bevestigde plek bij ${feestOmschr(e, f)} aan om te ruilen${extra}.`, { titel: 'Ruil feest ' + e.naam, link: '#zalen' });
    await ververs(); A.toast('Je plek is aangeboden', 'ok');
  }

  async function feestOvernemen(rid, knop) {
    const r0 = A.data.event_reacties.find(r => r.id === rid), e0 = A.event(r0.event_id);
    const goedk = !!A.data.instellingen.feest_ruil_goedkeuring;
    if (!await A.bevestig('Plek overnemen', `Wil je de plek van ${A.mwNaam(r0.medewerker_id)} overnemen bij ${feestOmschr(e0, r0.bevestigd_functie)}? ${goedk ? beheerNaam() + ' keurt het eerst goed. Daarna ben je bevestigd' : 'Je bent dan meteen bevestigd'} en kun je het niet meer zelf uitzetten.`, 'Ja, ik neem hem')) return;
    await A.bezig(knop, async () => {
      await A.reload();
      const r = A.data.event_reacties.find(x => x.id === rid), e = r && A.event(r.event_id);
      if (!r || !r.aangeboden || !r.bevestigd_functie || !evOpen(e) || (r.overname_door && r.overname_door !== ik.id)) { A.toast('Deze plek is al door iemand overgenomen', 'fout'); return ververs(); }
      const f = r.bevestigd_functie;
      if (A.data.instellingen.feest_ruil_goedkeuring) {
        await Store.update('event_reacties', r.id, { overname_door: ik.id });
        await A.melding(r.medewerker_id, `🔁 ${ik.naam} wil jouw plek overnemen bij ${feestOmschr(e, f)}. ${beheerNaam()} moet het nog goedkeuren; tot die tijd sta jij er nog op.`);
        await A.melding(null, `🔁 ${ik.naam} wil de bevestigde plek van ${A.mwNaam(r.medewerker_id)} overnemen bij ${feestOmschr(e, f)}. Keur het goed bij Aanvragen → Ruilen.`, { titel: 'Ruil feest goedkeuren', link: '#aanvragen/ruil' });
        await ververs(); return A.toast('Verstuurd – ' + beheerNaam() + ' keurt het nog goed', 'ok');
      }
      await A.feestOvernameUitvoeren(r, ik.id);
      await A.melding(r.medewerker_id, `✅ ${ik.naam} neemt jouw plek over bij ${feestOmschr(e, f)}. Je staat er niet meer op.`);
      await A.melding(null, `🔁 ${ik.naam} heeft de bevestigde plek van ${A.mwNaam(r.medewerker_id)} overgenomen bij ${feestOmschr(e, f)}.`, { titel: 'Ruil feest ' + e.naam, link: '#zalen' });
      await ververs(); A.toast('Top, je staat erop!', 'ok');
    });
  }

  // ---------------- meldingen ----------------
  // Naar links vegen toont een prullenbak; tikken op de prullenbak verwijdert de melding.
  function veegLijst(lijst, verwijder) {
    if (!lijst) return;
    const OPEN = -84;
    let open = null;
    const zet = (rij, x, anim) => { const i = rij.querySelector('.veeg-inhoud'); i.style.transition = anim ? 'transform .18s ease' : 'none'; i.style.transform = x ? `translateX(${x}px)` : ''; rij.classList.toggle('open', x <= OPEN); };
    lijst.querySelectorAll('.veeg').forEach(rij => {
      const inhoud = rij.querySelector('.veeg-inhoud');
      let x0 = 0, y0 = 0, dx = 0, start = 0, richting = null;
      inhoud.addEventListener('pointerdown', e => {
        if (open && open !== rij) { zet(open, 0, true); open = null; }
        x0 = e.clientX; y0 = e.clientY; dx = 0; richting = null; start = rij.classList.contains('open') ? OPEN : 0;
        inhoud.setPointerCapture && inhoud.setPointerCapture(e.pointerId);
      });
      inhoud.addEventListener('pointermove', e => {
        if (!e.buttons && e.pointerType === 'mouse') return;
        const ddx = e.clientX - x0, ddy = e.clientY - y0;
        if (!richting && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) richting = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
        if (richting !== 'x') return;
        dx = ddx; zet(rij, Math.min(0, Math.max(OPEN - 30, start + dx)), false);
      });
      const eind = () => {
        if (richting !== 'x') { if (start && !dx) { zet(rij, 0, true); open = null; } return; }
        const nieuw = start + dx < OPEN / 2 ? OPEN : 0;
        zet(rij, nieuw, true); open = nieuw ? rij : null;
      };
      inhoud.addEventListener('pointerup', eind);
      inhoud.addEventListener('pointercancel', eind);
      rij.querySelector('.veeg-weg').onclick = async () => {
        rij.classList.add('weg');
        try { await verwijder(rij.dataset.id); setTimeout(() => rij.remove(), 200); }
        catch (x) { rij.classList.remove('weg'); zet(rij, 0, true); A.toast('Verwijderen lukte niet', 'fout'); }
      };
    });
  }
  async function toonMeldingen() {
    const lijst = A.data.meldingen.filter(m => m.medewerker_id === ik.id).sort((a, b) => (b.tijd || '').localeCompare(a.tijd || '')).slice(0, 30);
    const leeg = '<div class="leeg">Geen meldingen</div>';
    A.modal('Meldingen', `<div id="mdPush"></div><div class="melding-lijst" id="mdLijst">${lijst.length ? '<p class="zacht veeg-tip">Veeg een melding naar links om te verwijderen.</p>' + lijst.map(m => `<div class="veeg" data-id="${esc(m.id)}"><button class="veeg-weg" type="button" aria-label="Verwijderen">🗑️</button>
      <div class="item veeg-inhoud ${m.gelezen ? '' : 'ongelezen'}"><div><div class="tekst">${esc(m.tekst)}</div><div class="meta">${A.tijdGeleden(m.tijd)}</div></div></div></div>`).join('') : leeg}</div>`);
    tekenPush();
    veegLijst($('#mdLijst'), async id => {
      await Store.remove('meldingen', id);
      A.data.meldingen = A.data.meldingen.filter(m => m.id !== id);
      if (!$('#mdLijst .veeg')) $('#mdLijst').innerHTML = leeg;
    });
    const ongelezen = lijst.filter(m => !m.gelezen);
    for (const m of ongelezen) await Store.update('meldingen', m.id, { gelezen: true });
    if (ongelezen.length) { await A.reload(); ik = A.mw(ik.id); $('#belBadge').classList.add('verborgen'); }
  }

  start();
})();
