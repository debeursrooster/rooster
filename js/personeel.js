// =====================================================================
//  Personeelspagina
// =====================================================================
(function () {
  const G = window.Gen, A = window.App, esc = A.esc;
  const $ = s => document.querySelector(s);
  let ik = null, tab = 'mijn', weekStart = G.weekStart(G.today()), roosterLoc = 'alle', gekozenMw = null;

  async function start() {
    try { await A.reload(); }
    catch (e) { document.body.innerHTML = `<div class="login"><div class="login-kaart"><h2>Even geen verbinding</h2><p class="zacht">${esc(e.message)}</p><button class="knop primair" onclick="location.reload()">Opnieuw proberen</button></div></div>`; return; }
    if (Store.modus === 'demo') $('#demoBand').classList.remove('verborgen');
    const bedrijf = A.data.instellingen.bedrijfsnaam || 'Rooster';
    $('#loginBedrijf').textContent = bedrijf; $('#kopBedrijf').textContent = bedrijf;
    const id = localStorage.getItem('rooster_mw');
    ik = id && A.mw(id);
    if (ik && ik.actief !== false) return toonApp();
    toonLogin();
  }

  // ---------------- inloggen ----------------
  function toonLogin() {
    $('#login').classList.remove('verborgen'); $('#app').classList.add('verborgen');
    const mws = A.data.medewerkers.filter(m => m.actief !== false).sort((a, b) => a.naam.localeCompare(b.naam));
    $('#namen').innerHTML = mws.map(m => `<button data-id="${m.id}"><span class="avatar" style="background:${esc(m.kleur)}">${esc(m.naam[0])}</span>${esc(m.naam)}</button>`).join('') || '<p class="zacht">Er staat nog geen personeel in het systeem.</p>';
    $('#namen').querySelectorAll('button').forEach(b => b.onclick = () => {
      gekozenMw = A.mw(b.dataset.id);
      $('#pinNaam').textContent = gekozenMw.naam;
      $('#stapNaam').classList.add('verborgen'); $('#stapPin').classList.remove('verborgen');
      $('#pin').value = ''; $('#pin').focus();
    });
  }
  $('#terugNaam').onclick = e => { e.preventDefault(); $('#stapPin').classList.add('verborgen'); $('#stapNaam').classList.remove('verborgen'); };
  $('#stapPin').onsubmit = e => {
    e.preventDefault();
    if ($('#pin').value === String(gekozenMw.pin)) {
      ik = gekozenMw; localStorage.setItem('rooster_mw', ik.id);
      $('#login').classList.add('verborgen'); toonApp();
    } else { A.toast('Code klopt niet', 'fout'); $('#pin').value = ''; }
  };
  $('#uitKnop').onclick = async () => { if (await A.bevestig('Uitloggen', 'Wil je uitloggen op dit apparaat? Je krijgt hier dan ook geen meldingen meer.', 'Uitloggen')) { await Push.uitzetten('personeel'); localStorage.removeItem('rooster_mw'); location.reload(); } };

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
  async function ververs() { try { await A.reload(); ik = A.mw(ik.id); if (!ik || ik.actief === false) { localStorage.removeItem('rooster_mw'); return location.reload(); } teken(); } catch (e) { } }

  const zichtbaar = d => A.dienstZichtbaar(d);
  // Lopende uitvragen waar ik op mag reageren
  const mijnUitvragen = () => A.data.zalen_events.filter(e => e.status === 'open' && e.datum >= G.today() && G.uitvraagGroep(e, A.data).some(m => m.id === ik.id))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  const mijnReactie = e => A.data.event_reacties.find(r => r.event_id === e.id && r.medewerker_id === ik.id);
  const mijnDiensten = () => A.data.diensten.filter(d => d.medewerker_id === ik.id && zichtbaar(d)).sort((a, b) => a.datum.localeCompare(b.datum) || G.min(a.start) - G.min(b.start));
  const tijd = d => esc(d.start) + '–' + esc(d.eind);
  const ACTIEF = ['open', 'gevraagd', 'overgenomen'];
  const actieveRuil = dienstId => A.data.ruilverzoeken.find(r => (r.dienst_id === dienstId || r.terug_dienst_id === dienstId) && ACTIEF.includes(r.status));
  const verzoekenAanMij = () => A.data.ruilverzoeken.filter(r => r.status === 'gevraagd' && r.naar_id === ik.id && A.data.diensten.some(d => d.id === r.dienst_id));

  // kan ik deze dienst doen?
  function kanIk(dienst) {
    const ctx = G.context(A.data, A.data.diensten.filter(x => x.id !== dienst.id));
    return G.beoordeel(ctx, ik, { ...dienst, medewerker_id: null }, { negeerUitvraag: true, alleenOk: true });
  }
  const ruilAanbod = () => A.data.ruilverzoeken.filter(r => r.status === 'open' && r.van_id !== ik.id).map(r => ({ r, d: A.data.diensten.find(x => x.id === r.dienst_id) }))
    .filter(x => x.d && x.d.datum >= G.today() && zichtbaar(x.d) && kanIk(x.d).ok);
  const openVoorMij = () => A.data.diensten.filter(d => !d.medewerker_id && d.datum >= G.today() && zichtbaar(d) && kanIk(d).ok).sort((a, b) => a.datum.localeCompare(b.datum));

  function teken() {
    $('#onderbalk').querySelectorAll('button').forEach(b => b.classList.toggle('actief', b.dataset.t === tab));
    // kop
    const nu = G.today(), mijn = mijnDiensten(), komend = mijn.filter(d => d.datum >= nu);
    const v = komend[0];
    $('#volgendeDienst').innerHTML = v ? `<div class="volgende"><div class="datumblok ${v.locatie}" style="background:rgba(255,255,255,.95)"><b>${G.parse(v.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(v.datum)]}</small></div>
      <div><small style="color:#bfb3a2">Volgende dienst${v.datum === nu ? ' – vandaag!' : v.datum === G.addDays(nu, 1) ? ' – morgen' : ''}</small><div class="groot">${tijd(v)}</div><div style="color:#d8cebf;font-size:.88rem">${A.LOC[v.locatie]} · ${esc(v.functie)}${v.event_id && A.event(v.event_id) ? ' · ' + esc(A.event(v.event_id).naam) : ''}</div></div></div>`
      : `<div class="volgende"><div>Je hebt nog geen diensten ingepland.</div></div>`;
    const maand = G.monthOf(nu);
    const uren = mijn.filter(d => d.maand === maand).reduce((s, d) => s + G.hours(d.start, d.eind), 0);
    const doel = G.doelUren(ik, maand);
    $('#urenBalk').innerHTML = `${A.uren(uren)} uur ingepland in ${A.MAANDEN[+maand.slice(5) - 1]}${doel ? ` <span style="opacity:.7">van ~${Math.round(doel)}</span>` : ''}${doel ? `<div class="balk"><i style="width:${Math.min(100, uren / doel * 100)}%"></i></div>` : ''}`;
    const ongelezen = A.data.meldingen.filter(m => m.medewerker_id === ik.id && !m.gelezen).length;
    $('#belBadge').textContent = ongelezen; $('#belBadge').classList.toggle('verborgen', !ongelezen);
    const nUit = mijnUitvragen().filter(e => !mijnReactie(e)).length;
    const mijnKnop = document.querySelector('#onderbalk button[data-t=mijn]');
    let mb = mijnKnop.querySelector('.badge'); if (!mb) { mb = document.createElement('span'); mb.className = 'badge'; mijnKnop.appendChild(mb); }
    mb.textContent = nUit; mb.classList.toggle('verborgen', !nUit);
    const nRuil = ruilAanbod().length + verzoekenAanMij().length;
    $('#ruilBadge').textContent = nRuil; $('#ruilBadge').classList.toggle('verborgen', !nRuil);
    ({ mijn: tMijn, rooster: tRooster, vrij: tVrij, ruil: tRuil })[tab]();
  }

  // ---------------- tab: mijn diensten ----------------
  function dienstItem(d, knoppen) {
    const ev = d.event_id && A.event(d.event_id);
    const ruil = actieveRuil(d.id);
    const collegas = A.data.diensten.filter(x => x.datum === d.datum && x.id !== d.id && x.medewerker_id && x.locatie === d.locatie && G.overlap(x, d)).map(x => A.mwNaam(x.medewerker_id));
    return `<div class="item"><div class="datumblok ${d.locatie}"><b>${G.parse(d.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(d.datum)]}</small></div>
      <div style="min-width:0"><div class="wie">${tijd(d)} <span class="label ${d.locatie === 'zalen' ? 'zaal' : 'caf'}">${A.LOC[d.locatie]}</span></div>
      <div class="meta">${esc(A.datumLang(d.datum))} · ${esc(d.functie)}${ev ? ' · 🎉 ' + esc(ev.naam) : ''}</div>
      ${collegas.length ? `<div class="meta">Met: ${collegas.map(esc).join(', ')}</div>` : ''}
      ${d.notitie ? `<div class="meta">📝 ${esc(d.notitie)}</div>` : ''}
      ${ruil ? `<div class="meta" style="color:var(--let)">🔁 ${ruil.terug_dienst_id === d.id ? 'Onderdeel van een ruil met ' + esc(A.mwNaam(ruil.van_id)) + (ruil.status === 'overgenomen' ? ' – wacht op goedkeuring' : '') : ruil.status === 'open' ? 'Aangeboden om te ruilen' : ruil.status === 'gevraagd' ? 'Gevraagd aan ' + esc(A.mwNaam(ruil.naar_id)) + ' – wacht op bevestiging' : esc(A.mwNaam(ruil.naar_id)) + ' neemt over – wacht op goedkeuring baas'}</div>` : ''}</div>
      <div class="rechts">${knoppen || ''}</div></div>`;
  }

  function tMijn() {
    const nu = G.today(), komend = mijnDiensten().filter(d => d.datum >= nu);
    const berichten = A.data.berichten.slice().sort((a, b) => (b.belangrijk - a.belangrijk) || (b.geplaatst || '').localeCompare(a.geplaatst || '')).slice(0, 3);
    const open = openVoorMij();
    const concept = A.data.roosters.find(r => r.status === 'concept' && r.maand > G.monthOf(nu));
    const perMaand = {};
    komend.forEach(d => (perMaand[d.maand] = perMaand[d.maand] || []).push(d));
    const uitvragen = mijnUitvragen();
    const uitvraagItem = e => { const r = mijnReactie(e); const fns = [...new Set((e.bezetting || []).map(b => b.functie))].filter(f => (ik.functies || []).includes(f));
      return `<div class="item" style="flex-wrap:wrap"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(e.datum)]}</small></div>
        <div style="flex:1;min-width:150px"><div class="wie">${esc(e.naam)}</div><div class="meta">${esc(A.datumLang(e.datum))} · ${esc(e.start)}–${esc(e.eind)}${fns.length ? ' · ' + fns.map(esc).join('/') : ''}</div>
        <div class="meta">Reageren t/m ${esc(A.datumKort(e.uitvraag_tot))}</div></div>
        <div class="rechts" style="gap:.3em"><button class="knop klein ${r && r.kan ? 'ok' : ''}" data-reac="${e.id}" data-kan="1">${r && r.kan ? '✓ ' : ''}Ik kan</button><button class="knop klein ${r && !r.kan ? 'primair' : ''}" data-reac="${e.id}" data-kan="0">${r && !r.kan ? '✕ ' : ''}Kan niet</button></div></div>`; };
    const ziek = mijnZiek();
    $('#inhoud').innerHTML = `
      <div id="mPush"></div>
      ${ziek ? `<div class="paneel" style="border:2px solid var(--fout-licht)"><div class="paneel-kop"><h3>🤒 Je bent ziek gemeld</h3><button class="knop klein ok" id="beterKnop">Ik ben weer beter</button></div>
        <p class="zacht" style="margin:0">Sinds ${esc(A.datumLang(ziek.van))}${ziek.status === 'gemeld' ? ` · nog niet bevestigd door ${esc(A.data.instellingen.beheer_naam || 'de baas')}` : ''}. Beterschap!</p></div>`
        : `<button class="knop" id="ziekKnop" style="width:100%;justify-content:center;margin-bottom:1em;border-color:var(--fout);color:var(--fout);background:#fff">🤒 Ziek melden</button>`}
      ${uitvragen.length ? `<div class="paneel" style="border:2px solid var(--zaal-licht)"><div class="paneel-kop"><h3>🎉 Kun jij op deze feesten?</h3></div>
        <p class="zacht" style="font-size:.88rem;margin-top:-.3em">Geef per feest aan of je kunt. Na de termijn wordt het rooster gemaakt en het werk eerlijk verdeeld. Wie het eerst reageert, krijgt geen voorrang. Je reactie kun je tot de termijn nog wijzigen.</p>
        ${uitvragen.map(uitvraagItem).join('')}</div>` : ''}
      ${berichten.length ? `<div class="paneel"><div class="paneel-kop"><h3>📌 Prikbord</h3></div>${berichten.map(b => `<div class="bericht ${b.belangrijk ? 'belangrijk' : ''}"><h4>${esc(b.titel)}</h4><p style="white-space:pre-wrap;margin:0">${esc(b.tekst)}</p><small class="zacht">${A.tijdGeleden(b.geplaatst)}</small></div>`).join('')}</div>` : ''}
      ${open.length ? `<div class="paneel" style="border:2px solid var(--accent-licht)"><div class="paneel-kop"><h3>🙋 Open diensten die jij kunt doen</h3></div>${open.slice(0, 5).map(d => dienstItem(d, `<button class="knop klein primair" data-pak="${d.id}">Oppakken</button>`)).join('')}</div>` : ''}
      <div class="paneel"><div class="paneel-kop"><h3>Mijn diensten</h3>${komend.length ? '<button class="knop klein" id="agenda">📲 In mijn agenda</button>' : ''}</div>
        ${concept ? `<p class="zacht" style="font-size:.88rem">Het rooster voor ${esc(A.maandNaam(concept.maand))} wordt nog gemaakt.</p>` : ''}
        ${komend.length ? Object.keys(perMaand).map(m => `<h4 style="text-transform:capitalize;margin:.8em 0 0;color:var(--zacht);font-size:.85rem">${esc(A.maandNaam(m))}</h4>${perMaand[m].map(d => { const r = actieveRuil(d.id); return dienstItem(d, r ? (r.van_id === ik.id ? `<button class="knop klein" data-intrek="${r.id}">Intrekken</button>` : '') : `<button class="knop klein" data-ruil="${d.id}">Kan niet</button>`); }).join('')}`).join('')
          : '<div class="leeg"><span class="groot">🛋️</span>Geen diensten gepland</div>'}
      </div>`;
    koppelActies();
    tekenPush();
    if ($('#ziekKnop')) $('#ziekKnop').onclick = ziekMelden;
    if ($('#beterKnop')) $('#beterKnop').onclick = beterMelden;
    const ag = $('#agenda');
    if (ag) ag.onclick = () => {
      A.download('mijn-diensten.ics', A.ics(komend, A.data.instellingen.bedrijfsnaam), 'text/calendar');
      A.toast('Open het bestand om je diensten in je agenda te zetten');
    };
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
    document.querySelectorAll('[data-reac]').forEach(b => b.onclick = () => A.bezig(b, async () => {
      const e = A.event(b.dataset.reac), kan = b.dataset.kan === '1';
      await A.reload();
      const ev = A.event(e.id);
      if (!ev || ev.status !== 'open') { A.toast('De termijn voor dit feest is al voorbij', 'fout'); return ververs(); }
      const bestaand = mijnReactie(ev);
      if (bestaand) await Store.update('event_reacties', bestaand.id, { kan, tijd: new Date().toISOString() });
      else await Store.insert('event_reacties', { event_id: ev.id, medewerker_id: ik.id, kan, opmerking: '', tijd: new Date().toISOString() });
      await ververs(); A.toast(kan ? 'Genoteerd: je kunt' : 'Genoteerd: je kunt niet', 'ok');
    }));
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
      if (!nu || nu.medewerker_id) { A.toast('Deze dienst is al door iemand opgepakt', 'fout'); return ververs(); }
      await Store.update('diensten', d.id, { medewerker_id: ik.id });
      await A.melding(null, `${ik.naam} heeft de open dienst van ${A.datumLang(d.datum)} ${d.start}–${d.eind} (${d.functie}) opgepakt.`);
      await ververs(); A.toast('Top, je staat erop!', 'ok');
    });
  }

  // ---------------- tab: rooster (week) ----------------
  function tRooster() {
    const nu = G.today();
    const dagen = [...Array(7)].map((_, i) => G.addDays(weekStart, i));
    const dicht = new Map(A.data.sluitingsdagen.map(s => [s.datum, s.reden]));
    $('#inhoud').innerHTML = `
      <div class="weekkeuze"><button class="knop klein" id="wVorige">◀</button><div style="text-align:center"><b>Week ${G.isoWeek(weekStart)}</b><br><small class="zacht">${esc(A.datumKort(dagen[0]))} – ${esc(A.datumKort(dagen[6]))}</small></div><button class="knop klein" id="wVolgende">▶</button></div>
      <div style="display:flex;justify-content:center;margin-bottom:.8em"><div class="tabs" id="rLoc"><button data-v="alle">Alles</button><button data-v="cafetaria">Cafetaria</button><button data-v="zalen">Zalencentrum</button></div></div>
      ${weekStart !== G.weekStart(nu) ? '<p style="text-align:center;margin-top:-.4em"><a href="#" id="naarNu">Naar deze week</a></p>' : ''}
      ${dagen.map(dag => {
        const pub = A.isGepubliceerd(G.monthOf(dag));
        const ds = A.data.diensten.filter(x => x.datum === dag && zichtbaar(x) && (roosterLoc === 'alle' || x.locatie === roosterLoc)).sort((a, b) => (a.locatie === b.locatie ? 0 : a.locatie === 'cafetaria' ? -1 : 1) || G.min(a.start) - G.min(b.start));
        const evs = A.data.zalen_events.filter(e => e.datum === dag && roosterLoc !== 'cafetaria');
        return `<div class="dagrij ${dag === nu ? 'vandaag' : ''}"><div class="dk"><span style="text-transform:capitalize">${esc(A.datumLang(dag))}</span><span>${dag === nu ? 'vandaag' : ''}</span></div>
          ${!pub && !ds.length ? '<div class="regel zacht">Rooster nog niet bekend</div>' : ''}
          ${pub && dicht.has(dag) && roosterLoc !== 'zalen' ? `<div class="regel zacht">Cafetaria gesloten${dicht.get(dag) ? ' – ' + esc(dicht.get(dag)) : ''}</div>` : ''}
          ${evs.filter(e => A.eventZichtbaar(e)).map(e => `<div class="ev">🎉 ${esc(e.naam)} · ${esc(e.start)}–${esc(e.eind)}</div>`).join('')}
          ${ds.map(x => { const m = A.mw(x.medewerker_id); return `<div class="regel ${x.medewerker_id === ik.id ? 'mijn' : ''}"><span class="t">${tijd(x)}</span>${m ? `<span class="stip" style="background:${esc(m.kleur)}"></span>` : ''}<span style="flex:1">${m ? esc(m.naam) : '<b style="color:var(--fout)">Open</b>'}</span><span class="zacht" style="font-size:.8rem">${esc(x.functie)}</span><span class="label ${x.locatie === 'zalen' ? 'zaal' : 'caf'}" style="font-size:.65rem">${x.locatie === 'zalen' ? 'Zaal' : 'Caf'}</span></div>`; }).join('')}
          ${pub && !ds.length && !dicht.has(dag) ? '<div class="regel zacht">Geen diensten</div>' : ''}</div>`;
      }).join('')}`;
    $('#wVorige').onclick = () => { weekStart = G.addDays(weekStart, -7); tRooster(); };
    $('#wVolgende').onclick = () => { weekStart = G.addDays(weekStart, 7); tRooster(); };
    const nn = $('#naarNu'); if (nn) nn.onclick = e => { e.preventDefault(); weekStart = G.weekStart(nu); tRooster(); };
    document.querySelectorAll('#rLoc button').forEach(b => { b.classList.toggle('actief', b.dataset.v === roosterLoc); b.onclick = () => { roosterLoc = b.dataset.v; tRooster(); }; });
  }

  // ---------------- tab: vrij vragen ----------------
  function tVrij() {
    const nu = G.today(), ins = A.data.instellingen;
    const mijnVerlof = A.data.verlof.filter(v => v.medewerker_id === ik.id && v.tot >= G.addDays(nu, -30)).sort((a, b) => b.van.localeCompare(a.van));
    const mijnNb = A.data.beschikbaarheid.filter(b => b.medewerker_id === ik.id && b.datum >= nu).sort((a, b) => a.datum.localeCompare(b.datum));
    const volgende = G.nextMonth(G.monthOf(nu));
    const slotDatum = G.prevMonth(volgende) + '-' + G.pad(Math.min(+ins.beschikbaarheid_slot || 25, G.daysInMonth(G.prevMonth(volgende))));
    const gemaakt = !!A.rooster(volgende);
    $('#inhoud').innerHTML = `
      <div class="paneel"><div class="paneel-kop"><h3>🌴 Vrij vragen</h3></div>
        <div class="rij"><div class="veld"><label>Van</label><input type="date" id="vVan" min="${nu}"></div><div class="veld"><label>Tot en met</label><input type="date" id="vTot" min="${nu}"></div></div>
        <div class="veld"><label>Reden <small>(optioneel)</small></label><input id="vReden" placeholder="bv. vakantie, bruiloft vriendin"></div>
        <button class="knop primair" id="vAanvragen">Aanvragen</button>
        ${mijnVerlof.length ? `<h4 style="margin:1.2em 0 .2em">Mijn aanvragen</h4>${mijnVerlof.map(v => `<div class="item"><div><div class="wie">${esc(A.datumKort(v.van))}${v.tot !== v.van ? ' t/m ' + esc(A.datumKort(v.tot)) : ''}</div>
          <div class="meta">${esc(v.reden || '')}${v.reactie ? ' · 💬 ' + esc(v.reactie) : ''}</div></div>
          <div class="rechts"><span class="label ${v.status === 'goedgekeurd' ? 'ok' : v.status === 'afgewezen' ? 'fout' : 'let'}">${v.status === 'aangevraagd' ? 'in behandeling' : v.status}</span>${v.status === 'aangevraagd' ? `<button class="icoon" data-vweg="${v.id}" title="Intrekken">✕</button>` : ''}</div></div>`).join('')}` : ''}
      </div>
      <div class="paneel"><div class="paneel-kop"><h3>🚫 Ik kan niet op…</h3></div>
        <p class="zacht" style="font-size:.9rem">Geen echt vrij nodig, maar kun je een keer niet? Geef het op tijd door, dan houdt het rooster er rekening mee. ${!gemaakt ? `Voor <b>${esc(A.maandNaam(volgende))}</b> graag vóór <b>${esc(A.datumLang(slotDatum))}</b>.` : ''}</p>
        <div class="rij"><div class="veld"><label>Datum</label><input type="date" id="bDatum" min="${nu}"></div>
          <div class="veld"><label>Wanneer</label><select id="bDeel"><option>hele dag</option><option>overdag</option><option>avond</option></select></div></div>
        <div class="veld"><label>Opmerking <small>(optioneel)</small></label><input id="bOpm"></div>
        <button class="knop" id="bToevoegen">Doorgeven</button>
        ${mijnNb.length ? `<div style="margin-top:1em">${mijnNb.map(b => { const ingepland = A.data.diensten.some(d => d.medewerker_id === ik.id && d.datum === b.datum && zichtbaar(d)); return `<div class="item"><div><div class="wie">${esc(A.datumLang(b.datum))}</div><div class="meta">${esc(b.deel)}${b.opmerking ? ' · ' + esc(b.opmerking) : ''}</div>${ingepland ? '<div class="meta" style="color:var(--let)">⚠️ Je staat al ingepland. Ruil de dienst of vraag vrij.</div>' : ''}</div><div class="rechts"><button class="icoon" data-bweg="${b.id}">✕</button></div></div>`; }).join('')}</div>` : ''}
      </div>`;
    $('#vVan').onchange = () => { if (!$('#vTot').value || $('#vTot').value < $('#vVan').value) $('#vTot').value = $('#vVan').value; };
    $('#vAanvragen').onclick = e => A.bezig(e.target, async () => {
      const van = $('#vVan').value, tot = $('#vTot').value || van;
      if (!van) return A.toast('Kies een datum', 'fout');
      if (tot < van) return A.toast('De einddatum ligt voor de begindatum', 'fout');
      await Store.insert('verlof', { medewerker_id: ik.id, van, tot, reden: $('#vReden').value, status: 'aangevraagd', reactie: '', aangevraagd_op: new Date().toISOString() });
      await A.melding(null, `${ik.naam} vraagt vrij: ${A.datumKort(van)}${tot !== van ? ' t/m ' + A.datumKort(tot) : ''}${$('#vReden').value ? ' (' + $('#vReden').value + ')' : ''}.`, { titel: 'Vrij-aanvraag ' + ik.naam, link: '#aanvragen/verlof' });
      await ververs(); A.toast('Aanvraag verstuurd', 'ok');
    });
    $('#bToevoegen').onclick = e => A.bezig(e.target, async () => {
      if (!$('#bDatum').value) return A.toast('Kies een datum', 'fout');
      await Store.insert('beschikbaarheid', { medewerker_id: ik.id, datum: $('#bDatum').value, deel: $('#bDeel').value, opmerking: $('#bOpm').value });
      await ververs(); A.toast('Doorgegeven', 'ok');
    });
    document.querySelectorAll('[data-vweg]').forEach(b => b.onclick = async () => { if (await A.bevestig('Intrekken', 'Wil je deze aanvraag intrekken?', 'Intrekken')) { await Store.remove('verlof', b.dataset.vweg); await ververs(); } });
    document.querySelectorAll('[data-bweg]').forEach(b => b.onclick = async () => { await Store.remove('beschikbaarheid', b.dataset.bweg); await ververs(); });
  }

  // ---------------- tab: ruilen ----------------
  function tRuil() {
    const aanbod = ruilAanbod();
    const aanMij = verzoekenAanMij();
    const mijn = A.data.ruilverzoeken.filter(r => r.van_id === ik.id || r.naar_id === ik.id).sort((a, b) => (b.aangemaakt_op || '').localeCompare(a.aangemaakt_op || '')).slice(0, 12);
    const mijnKomend = mijnDiensten().filter(d => d.datum >= G.today() && !actieveRuil(d.id));
    const statusTekst = r => ({ open: 'zoekt nog iemand', gevraagd: 'wacht op ' + A.mwNaam(r.naar_id), overgenomen: 'wacht op de baas', goedgekeurd: 'geruild', afgewezen: 'afgewezen door baas', geweigerd: 'afgeslagen', ingetrokken: 'ingetrokken' }[r.status]);
    const terugTekst = r => { const t = r.terug_dienst_id && A.data.diensten.find(x => x.id === r.terug_dienst_id); return t ? `<div class="meta">↔ in ruil voor ${r.naar_id === ik.id ? 'jouw' : 'de'} dienst van ${esc(A.datumKort(t.datum))} ${tijd(t)}</div>` : ''; };
    const metNaam = (r, d, knoppen) => dienstItem(d, knoppen).replace('<div class="meta">', `<div class="meta"><b>${esc(A.mwNaam(r.van_id))}</b>${r.bericht ? ': “' + esc(r.bericht) + '”' : ''}</div>${terugTekst(r)}<div class="meta">`);
    $('#inhoud').innerHTML = `
      ${aanMij.length ? `<div class="paneel" style="border:2px solid var(--accent-licht)"><div class="paneel-kop"><h3>📩 Verzoeken aan jou</h3></div>
        ${aanMij.map(r => metNaam(r, A.data.diensten.find(x => x.id === r.dienst_id), `<button class="knop klein" data-weiger="${r.id}">Nee</button><button class="knop klein primair" data-neem="${r.id}">Ja, akkoord</button>`)).join('')}</div>` : ''}
      <div class="paneel"><div class="paneel-kop"><h3>🙋 Collega's zoeken iemand</h3></div>
        ${aanbod.length ? aanbod.map(({ r, d }) => metNaam(r, d, `<button class="knop klein primair" data-neem="${r.id}">Overnemen</button>`)).join('')
        : '<div class="leeg">Er wordt nu niemand gezocht voor een dienst die jij kunt doen</div>'}</div>
      <div class="paneel"><div class="paneel-kop"><h3>Kan je zelf een dienst niet?</h3></div>
        <p class="zacht" style="font-size:.88rem;margin-top:-.3em">Al iets afgesproken met een collega? Kies diegene dan meteen. Je kunt ook een dienst van die collega terugnemen.</p>
        ${mijnKomend.length ? `<div class="veld"><label>Kies de dienst</label><select id="ruilKeuze">${mijnKomend.map(d => `<option value="${d.id}">${esc(A.datumKort(d.datum))} · ${d.start}–${d.eind} · ${esc(d.functie)}</option>`).join('')}</select></div><button class="knop" id="ruilStart">Ruilen of aanbieden…</button>` : '<p class="zacht">Je hebt geen diensten die je kunt aanbieden.</p>'}
      </div>
      ${mijn.length ? `<div class="paneel"><div class="paneel-kop"><h3>Mijn ruilingen</h3></div>${mijn.map(r => { const d = A.data.diensten.find(x => x.id === r.dienst_id); if (!d) return ''; return `<div class="item"><div><div class="wie">${esc(A.datumKort(d.datum))} · ${tijd(d)}</div><div class="meta">${r.van_id === ik.id ? 'Van jou' + (r.naar_id ? ' → ' + esc(A.mwNaam(r.naar_id)) : '') : 'Van ' + esc(A.mwNaam(r.van_id)) + ' → jij'}</div>${terugTekst(r)}</div><div class="rechts"><span class="label ${r.status === 'goedgekeurd' ? 'ok' : ['afgewezen', 'ingetrokken', 'geweigerd'].includes(r.status) ? 'fout' : 'let'}">${statusTekst(r)}</span>${r.van_id === ik.id && ACTIEF.includes(r.status) ? `<button class="icoon" data-intrek="${r.id}" title="Intrekken">✕</button>` : ''}</div></div>`; }).join('')}</div>` : ''}`;
    const rs = $('#ruilStart'); if (rs) rs.onclick = () => ruilAanbieden(A.data.diensten.find(d => d.id === $('#ruilKeuze').value));
    koppelActies();
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
