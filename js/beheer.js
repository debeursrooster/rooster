// =====================================================================
//  Beheerpagina
// =====================================================================
(function () {
  const G = window.Gen, A = window.App, esc = A.esc;
  const $ = s => document.querySelector(s);
  const hoofd = $('#hoofd');
  const staat = {
    maand: null, weergave: 'kalender', loc: 'alle',
    aanvraagTab: 'verlof', zalenVerleden: false
  };

  // ---------------- opstarten ----------------
  async function start() {
    try { await A.reload(); }
    catch (e) {
      document.body.innerHTML = `<div class="login"><div class="login-kaart"><h2>Kan geen verbinding maken</h2><p class="zacht">${esc(e.message)}</p><p>Controleer de gegevens in <code>js/config.js</code> en of het schema in Supabase is geplaatst.</p></div></div>`;
      return;
    }
    if (Store.modus === 'demo') $('#demoBand').classList.remove('verborgen');
    $('#loginNaam').textContent = A.data.instellingen.bedrijfsnaam || 'Roosterbeheer';
    if (sessionStorage.getItem('rooster_admin') === 'ja') return toonBeheer();
    $('#login').classList.remove('verborgen');
    if (Store.modus === 'demo') $('#adminPin').placeholder = 'demo: 0000';
    $('#adminPin').focus();
  }

  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    if ($('#adminPin').value === String(A.data.instellingen.admin_pin)) {
      sessionStorage.setItem('rooster_admin', 'ja');
      $('#login').classList.add('verborgen');
      toonBeheer();
    } else { A.toast('Onjuiste code', 'fout'); $('#adminPin').value = ''; }
  };
  $('#uitloggen').onclick = e => { e.preventDefault(); sessionStorage.removeItem('rooster_admin'); location.reload(); };
  $('#demoReset').onclick = async () => {
    if (await A.bevestig('Demo opnieuw beginnen', 'Alle demo-gegevens worden gewist en opnieuw aangemaakt.', 'Opnieuw beginnen')) { Store.reset(); location.reload(); }
  };
  $('#menuKnop').onclick = () => $('#zijbalk').classList.toggle('open');

  // Testmelding voor de beheerder: gaat via de database, net als alle echte meldingen
  const testBeheer = () => A.melding(null, '🔔 Testmelding: meldingen voor het beheer werken op dit apparaat.', { titel: 'Test roosterapp', link: '#instellingen' });

  async function toonBeheer() {
    $('#beheer').classList.remove('verborgen');
    Push.vernieuw('beheer');
    Push.opWijziging(() => {
      if ($('#iPush')) Push.paneel($('#iPush'), { rol: 'beheer', onTest: testBeheer });
      if ($('#oPush') && !Push.later('beheer')) Push.paneel($('#oPush'), { rol: 'beheer', compact: true, onTest: testBeheer });
    });
    $('#bedrijfsnaam').textContent = A.data.instellingen.bedrijfsnaam;
    const uv = await A.verwerkUitvragen();
    if (uv.ingepland.length) A.toast('Uitvraag afgerond: ' + uv.ingepland.join(', ') + (uv.teControleren ? ' – controleer en verstuur' : ' ingepland'), 'ok');
    const acties = await A.autoRooster();
    const tekst = { gemaakt: 'automatisch gemaakt', voorlopig: 'voorlopig gemaakt – oproepkrachten kunnen nu reageren', definitief: 'definitief gemaakt' };
    for (const x of acties.filter(x => tekst[x.actie])) A.toast('Rooster ' + A.maandNaam(x.maand) + ' ' + tekst[x.actie], 'ok');
    window.addEventListener('hashchange', route);
    route();
  }

  function route() {
    const p = (location.hash || '#overzicht').slice(1).split('/')[0];
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('actief', a.dataset.p === p));
    $('#zijbalk').classList.remove('open');
    const t = document.querySelector('#nav a[data-p="' + p + '"]');
    $('#mobielTitel').textContent = t ? t.textContent.replace(/\d+$/, '').trim() : 'Roosterbeheer';
    updateTellers();
    (PAGINAS[p] || PAGINAS.overzicht)();
    window.scrollTo(0, 0);
  }
  async function herlaad() { await A.reload(); updateTellers(); }
  // Voorlopige indeling van lopende uitvragen (wordt opnieuw berekend zodra de gegevens veranderen)
  let vlCache = { sleutel: null, res: null };
  function voorlopig() {
    const d = A.data;
    const sleutel = [d.event_reacties.length, d.diensten.length, d.zalen_events.map(e => e.id + e.status + e.datum + JSON.stringify(e.bezetting || [])).join(), d.medewerkers.length, d.verlof.length, d.beschikbaarheid.length].join('|');
    if (vlCache.data !== d || vlCache.sleutel !== sleutel) vlCache = { data: d, sleutel, res: G.voorlopig(d) };
    return vlCache.res;
  }
  const vlOpen = (vanaf, maand) => voorlopig().diensten.filter(x => !x.medewerker_id && x.datum >= (vanaf || '') && (!maand || x.datum.startsWith(maand)));
  function opnieuw() { (PAGINAS[(location.hash || '#overzicht').slice(1).split('/')[0]] || PAGINAS.overzicht)(); updateTellers(); }

  const feestTeKeuren = () => A.data.event_reacties.filter(r => r.overname_door && r.aangeboden && r.bevestigd_functie && A.event(r.event_id) && A.event(r.event_id).status === 'open');
  function updateTellers() {
    const n = A.data.verlof.filter(v => v.status === 'aangevraagd').length +
      A.data.ruilverzoeken.filter(r => r.status === 'overgenomen').length +
      feestTeKeuren().length +
      A.data.ziekmeldingen.filter(z => z.status === 'gemeld').length;
    const t = $('#telAanvragen'); t.textContent = n; t.classList.toggle('verborgen', !n);
  }

  // ---------------- helpers ----------------
  const avatar = m => m ? `<span class="avatar" style="background:${esc(m.kleur || '#999')}">${esc(m.naam[0] || '?')}</span>` : `<span class="avatar" style="background:#bbb">?</span>`;
  const locLabel = l => `<span class="label ${l === 'zalen' ? 'zaal' : 'caf'}">${A.LOC[l]}</span>`;
  const tijd = d => esc(d.start) + '–' + esc(d.eind);
  const actieveMw = () => A.data.medewerkers.filter(m => m.actief !== false).sort((a, b) => a.naam.localeCompare(b.naam));
  const functieOpties = (sel) => (A.data.instellingen.functies || []).map(f => `<option ${f === sel ? 'selected' : ''}>${esc(f)}</option>`).join('');
  const urenVan = (mwId, maand) => A.data.diensten.filter(d => d.medewerker_id === mwId && d.maand === maand).reduce((s, d) => s + G.hours(d.start, d.eind), 0);

  async function meldAlsGepubliceerd(maand, mwId, tekst) {
    if (mwId && A.isGepubliceerd(maand)) await A.melding(mwId, tekst);
  }
  // Ziet het personeel deze dienst? (gepubliceerde maand, of feest dat via de uitvraag is ingepland)
  const dienstZichtbaar = d => A.dienstZichtbaar(d);
  async function meldDienst(d, mwId, tekst) { if (mwId && dienstZichtbaar(d)) await A.melding(mwId, tekst); }

  // =====================================================================
  //  OVERZICHT
  // =====================================================================
  function pOverzicht() {
    const d = A.data, nu = G.today(), deze = G.monthOf(nu), volgende = G.nextMonth(deze);
    const verlofOpen = d.verlof.filter(v => v.status === 'aangevraagd');
    const ruilOpen = d.ruilverzoeken.filter(r => r.status === 'overgenomen');
    const openDiensten = d.diensten.filter(x => !x.medewerker_id && x.datum >= nu);
    const vlOpenNu = vlOpen(nu);
    const rv = A.rooster(volgende);
    const genDatum = G.generatieDatum(volgende, d.instellingen.dagen_voor_einde);
    let roosterTekst, roosterSub;
    const pl = Uitvraag.maandPlanning(d, volgende);
    if (!rv) { roosterTekst = 'Nog niet'; roosterSub = pl.voorlopig && pl.voorlopig >= nu ? 'voorlopig op ' + A.datumKort(pl.voorlopig) : 'wordt gemaakt op ' + A.datumKort(genDatum); }
    else if (rv.status === 'voorlopig') { roosterTekst = 'Voorlopig'; roosterSub = 'definitief op ' + A.datumKort(pl.definitief); }
    else if (rv.status === 'concept') { roosterTekst = 'Concept'; roosterSub = 'klaar om te controleren'; }
    else { roosterTekst = 'Online'; roosterSub = 'gepubliceerd'; }

    const vandaag = d.diensten.filter(x => x.datum === nu && x.medewerker_id).sort((a, b) => G.min(a.start) - G.min(b.start));
    const feesten = d.zalen_events.filter(e => e.datum >= nu && e.datum <= G.addDays(nu, 21)).sort((a, b) => a.datum.localeCompare(b.datum));
    const meldingen = d.meldingen.filter(m => !m.medewerker_id).sort((a, b) => (b.tijd || '').localeCompare(a.tijd || '')).slice(0, 8);

    const teControleren = [];
    for (const r of d.roosters.filter(r => r.status === 'concept')) teControleren.push(`<a class="knop ok" href="#rooster" data-maand="${r.maand}">📅 Rooster ${esc(A.maandNaam(r.maand))}</a>`);
    const zGemeld = d.ziekmeldingen.filter(z => z.status === 'gemeld');
    if (zGemeld.length) teControleren.unshift(`<a class="knop gevaar" style="background:#fff" href="#aanvragen/ziek">🤒 ${zGemeld.length} ziekmelding${zGemeld.length > 1 ? 'en' : ''}</a>`);
    const evConcept = d.zalen_events.filter(e => e.status === 'concept');
    if (evConcept.length) teControleren.push(`<a class="knop ok" href="#zalen">🎉 ${evConcept.length} feest${evConcept.length > 1 ? 'en' : ''}</a>`);
    hoofd.innerHTML = `
      <div id="oPush"></div>
      ${teControleren.length ? `<div class="statusbalk concept" style="margin-bottom:1.2em">🔔 <div><b>Klaar om te controleren en te versturen:</b> het personeel ziet dit pas na versturen.</div><div class="acties">${teControleren.join('')}</div></div>` : ''}
      <div class="kop"><div><h1>Goedendag 👋</h1><span class="zacht">${esc(A.datumLang(nu))}</span></div>
        <div class="acties"><button class="knop" id="oBericht" type="button">🔔 Bericht aan personeel</button><a class="knop" href="#zalen">+ Feest toevoegen</a><a class="knop primair" href="#rooster">Rooster bekijken</a></div></div>
      <div class="tegels">
        <div class="tegel klik ${verlofOpen.length ? 'aandacht' : ''}" data-ga="aanvragen/verlof"><div class="getal">${verlofOpen.length}</div><div class="wat">vrij-aanvragen</div></div>
        <div class="tegel klik ${ruilOpen.length ? 'aandacht' : ''}" data-ga="aanvragen/ruil"><div class="getal">${ruilOpen.length}</div><div class="wat">ruilingen goed te keuren</div></div>
        <div class="tegel klik ${openDiensten.length + vlOpenNu.length ? 'aandacht' : ''}" data-ga="rooster"><div class="getal">${openDiensten.length + vlOpenNu.length}</div><div class="wat">open diensten${vlOpenNu.length ? `<br><small>waarvan ${vlOpenNu.length} bij feesten met lopende uitvraag</small>` : ''}</div></div>
        <div class="tegel klik" data-ga="rooster" data-maand="${volgende}"><div class="getal" style="font-size:1.4rem">${roosterTekst}</div><div class="wat">rooster ${esc(A.maandNaam(volgende))}<br><small>${roosterSub}</small></div></div>
      </div>
      <div class="rij" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
        <div class="paneel"><div class="paneel-kop"><h3>Vandaag aan het werk</h3></div>
          ${vandaag.length ? vandaag.map(x => { const m = A.mw(x.medewerker_id); return `<div class="item">${avatar(m)}<div><div class="wie">${esc(m ? m.naam : '?')}</div><div class="meta">${tijd(x)} · ${esc(x.functie)}</div></div><div class="rechts">${locLabel(x.locatie)}</div></div>`; }).join('') : '<div class="leeg"><span class="groot">☕</span>Vandaag niemand ingepland</div>'}
        </div>
        <div class="paneel"><div class="paneel-kop"><h3>Komende feesten</h3><a class="knop klein" href="#zalen">Agenda</a></div>
          ${feesten.length ? feesten.map(e => { const ds = d.diensten.filter(x => x.event_id === e.id); const open = ds.filter(x => !x.medewerker_id).length; return `<div class="item"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.MAANDEN[G.parse(e.datum).getUTCMonth()].slice(0, 3)}</small></div><div><div class="wie">${esc(e.naam)}</div><div class="meta">${tijd(e)} · ${e.gasten || '?'} gasten ${e.zaal ? '· ' + esc(e.zaal) : ''}</div></div><div class="rechts">${e.status === 'open' ? uitvraagLabel(e) + vlLabel(e) : e.status === 'concept' ? '<span class="label let">te controleren</span>' : !ds.length ? '<span class="label">nog niet ingeroosterd</span>' : open ? `<span class="label fout">${open} open</span>` : `<span class="label ok">${ds.length} mensen</span>`}</div></div>`; }).join('') : '<div class="leeg"><span class="groot">🎉</span>Geen feesten in de komende 3 weken</div>'}
        </div>
        <div class="paneel melding-lijst"><div class="paneel-kop"><h3>Meldingen</h3>${meldingen.some(m => !m.gelezen) ? '<button class="knop klein" id="allesGelezen">Alles gelezen</button>' : ''}</div>
          ${meldingen.length ? meldingen.map(m => `<div class="item ${m.gelezen ? '' : 'ongelezen'}"><div><div class="tekst">${esc(m.tekst)}</div><div class="meta">${A.tijdGeleden(m.tijd)}</div></div></div>`).join('') : '<div class="leeg">Geen meldingen</div>'}
        </div>
      </div>`;
    hoofd.querySelectorAll('.statusbalk [data-maand]').forEach(a => a.onclick = () => { staat.maand = a.dataset.maand; });
    hoofd.querySelectorAll('[data-ga]').forEach(t => t.onclick = () => {
      const [p, sub] = t.dataset.ga.split('/');
      if (sub) staat.aanvraagTab = sub;
      if (t.dataset.maand) staat.maand = t.dataset.maand;
      location.hash = p;
    });
    const ag = $('#allesGelezen');
    if (ag) ag.onclick = () => A.bezig(ag, async () => {
      for (const m of d.meldingen.filter(m => !m.medewerker_id && !m.gelezen)) await Store.update('meldingen', m.id, { gelezen: true });
      await herlaad(); pOverzicht();
    });
    if (!Push.later('beheer')) Push.paneel($('#oPush'), { rol: 'beheer', compact: true, onTest: testBeheer });
    $('#oBericht').onclick = () => berichtAanPersoneel();
  }

  // =====================================================================
  //  ROOSTER
  // =====================================================================
  function pRooster() {
    const d = A.data, nu = G.today();
    if (!staat.maand) {
      const volgende = G.nextMonth(G.monthOf(nu));
      const rv = A.rooster(volgende);
      staat.maand = rv && rv.status === 'concept' ? volgende : G.monthOf(nu);
    }
    const maand = staat.maand, r = A.rooster(maand);
    const diensten = d.diensten.filter(x => x.maand === maand && (staat.loc === 'alle' || x.locatie === staat.loc));
    const open = diensten.filter(x => !x.medewerker_id).length;
    const vlo = staat.loc === 'cafetaria' ? 0 : vlOpen('', maand).length;
    const vlZin = vlo ? ` <b class="fout-tekst">Feesten met lopende uitvraag: voorlopig ${vlo} open.</b>` : '';

    let status;
    const pl = Uitvraag.maandPlanning(d, maand);
    if (!r) {
      const gd = pl.definitief;
      const tweeRondes = pl.aan && gd > nu;
      status = `<div class="statusbalk geen">📭 <div><b>Nog geen rooster voor ${esc(A.maandNaam(maand))}.</b> ${tweeRondes ? `Planning: <b>${esc(A.datumKort(pl.ronde1 < nu ? nu : pl.ronde1))}</b> voorlopig rooster vaste krachten (zij kunnen extra diensten kiezen) · <b>${esc(A.datumKort(pl.ronde2))}</b> extra diensten toekennen, rest naar oproepkrachten${pl.ronde3 ? ` · <b>${esc(A.datumKort(pl.ronde3))}</b> oproepkrachten inplannen + herinnering` : ''} · <b>${esc(A.datumKort(gd))}</b> definitief.` : gd >= nu ? 'Wordt automatisch gemaakt op ' + esc(A.datumLang(gd)) + '.' : ''}${vlZin}</div>
        <div class="acties">${tweeRondes ? '<button class="knop primair" id="maakVoorlopig">⏳ Voorlopig rooster nu maken</button><button class="knop klein" id="maakRooster">Meteen definitief maken</button>' : '<button class="knop primair" id="maakRooster">✨ Rooster nu maken</button>'}</div></div>`;
    } else if (r.status === 'voorlopig') {
      const cafOpen = Uitvraag.cafOpen(d, maand), ids = new Set(cafOpen.map(x => x.id));
      const groep = G.cafOproepGroep(d).filter(m => cafOpen.some(x => G.cafPast(m, x)));
      const reageerden = groep.filter(m => d.event_reacties.some(x => x.dienst_id && ids.has(x.dienst_id) && x.medewerker_id === m.id)).length;
      const ronde = +r.ronde || 1;
      const vastGroep = Uitvraag.cafVast(d).filter(m => cafOpen.some(x => G.cafPast(m, x)));
      const vastKiest = vastGroep.filter(m => d.event_reacties.some(x => x.dienst_id && ids.has(x.dienst_id) && x.medewerker_id === m.id && x.kan)).length;
      const stap = ronde < 2 ? `<b>Stap 1 van 3:</b> de vaste krachten zien hun diensten (grijs) en kunnen extra diensten kiezen (${vastKiest} hebben al iets gekozen). Op ${esc(A.datumLang(pl.ronde2))} worden die toegekend en gaan de open diensten ook naar de oproepkrachten.`
        : ronde < 3 ? `<b>Stap 2 van 3:</b> de open diensten staan uit bij de oproepkrachten (${reageerden} van ${groep.length} hebben gereageerd).${pl.ronde3 ? ` Op ${esc(A.datumLang(pl.ronde3))} worden ze ingepland en krijgt iedereen een herinnering voor wat dan nog open is.` : ''}`
        : `<b>Stap 3 van 3:</b> oproepkrachten zijn ingepland, iedereen heeft een herinnering gekregen voor de laatste open diensten. Wat nu nog binnenkomt wordt bij het definitief maken gelijk verdeeld (vast en oproep).`;
      status = `<div class="statusbalk concept">⏳ <div><b>Voorlopig</b> – ${stap} <b>${cafOpen.length} open cafetariadienst${cafOpen.length === 1 ? '' : 'en'}.</b> Op ${esc(A.datumLang(pl.definitief))} wordt het rooster definitief gemaakt en verstuurd.${vlZin}</div>
        <div class="acties">${(r.meldingen || []).length ? `<button class="knop klein" id="toonMeldingen">⚠️ ${(r.meldingen || []).length} aandachtspunten</button>` : ''}<button class="knop klein" id="opnieuwRooster">🔄 Opnieuw maken</button><button class="knop klein" id="verwijderRooster">🗑 Weggooien</button><button class="knop primair" id="maakDefinitief">✅ Nu definitief maken</button></div></div>`;
    } else if (r.status === 'concept') {
      status = `<div class="statusbalk concept">📝 <div><b>Concept</b> – controleer het rooster; het personeel ziet het pas na versturen. ${open ? `<b>${open} open dienst${open > 1 ? 'en' : ''}.</b>` : 'Alle vaste diensten zijn ingevuld.'}${vlZin}</div>
        <div class="acties">${(r.meldingen || []).length ? `<button class="knop klein" id="toonMeldingen">⚠️ ${(r.meldingen || []).length} aandachtspunten</button>` : ''}<button class="knop klein" id="opnieuwRooster">🔄 Opnieuw maken</button><button class="knop klein" id="verwijderRooster">🗑 Weggooien</button><button class="knop ok" id="publiceer">📤 Versturen naar personeel</button></div></div>`;
    } else {
      status = `<div class="statusbalk gepubliceerd">✅ <div><b>Verstuurd</b> ${r.gepubliceerd_op ? 'op ' + new Date(r.gepubliceerd_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : ''} – personeel kan dit rooster zien. ${open ? `<b>${open} open dienst${open > 1 ? 'en' : ''}.</b>` : ''}${vlZin}</div>
        <div class="acties">${(r.meldingen || []).length ? `<button class="knop klein" id="toonMeldingen">⚠️ ${(r.meldingen || []).length}</button>` : ''}<button class="knop klein" id="deelWa">💬 Deel via WhatsApp</button><button class="knop klein" id="terugConcept">↩︎ Terug naar concept</button></div></div>`;
    }

    hoofd.innerHTML = `
      <div class="kop"><h1>Rooster</h1>
        <div class="acties">
          <div class="maandkeuze"><button class="icoon" id="vorige" aria-label="Vorige maand">◀</button><b>${esc(A.maandNaam(maand))}</b><button class="icoon" id="volgende" aria-label="Volgende maand">▶</button></div>
          <div class="tabs" id="locTabs"><button data-v="alle">Alles</button><button data-v="cafetaria">Cafetaria</button><button data-v="zalen">Zalen</button></div>
          <div class="tabs" id="weergaveTabs"><button data-v="kalender">Kalender</button><button data-v="personen">Per persoon</button><button data-v="uren">Uren</button></div>
          <button class="knop" onclick="window.print()">🖨</button>
        </div></div>
      ${status}
      <div id="roosterInhoud"></div>`;
    hoofd.querySelectorAll('#locTabs button').forEach(b => { b.classList.toggle('actief', b.dataset.v === staat.loc); b.onclick = () => { staat.loc = b.dataset.v; pRooster(); }; });
    hoofd.querySelectorAll('#weergaveTabs button').forEach(b => { b.classList.toggle('actief', b.dataset.v === staat.weergave); b.onclick = () => { staat.weergave = b.dataset.v; pRooster(); }; });
    $('#vorige').onclick = () => { staat.maand = G.prevMonth(maand); pRooster(); };
    $('#volgende').onclick = () => { staat.maand = G.nextMonth(maand); pRooster(); };
    const k = id => document.getElementById(id);
    if (k('maakRooster')) k('maakRooster').onclick = e => A.bezig(e.currentTarget, () => maakRooster(maand));
    if (k('maakVoorlopig')) k('maakVoorlopig').onclick = e => A.bezig(e.currentTarget, async () => {
      await herlaad();
      const plan = Uitvraag.maandPlanning(A.data, maand);
      if (!await A.bevestig('Voorlopig rooster maken', `De vaste krachten worden nu ingepland voor ${A.maandNaam(maand)} en zien hun diensten (grijs). Daarna gaat het vanzelf verder volgens de planning (extra diensten, oproepkrachten, definitief op ${A.datumLang(plan.definitief)}).`, 'Maken')) return;
      const res = await Uitvraag.cafVoorlopig(Store, A.data, maand);
      for (let i = 0; i < 3 && await Uitvraag.cafStap(Store, A.data, maand, nu); i++);
      await herlaad(); A.toast(`Voorlopig rooster gemaakt – ${res.open} open cafetariadienst(en)`, 'ok'); pRooster();
    });
    if (k('maakDefinitief')) k('maakDefinitief').onclick = e => A.bezig(e.currentTarget, async () => {
      if (!await A.bevestig('Nu definitief maken', `De uitvraag stopt en de open cafetariadiensten worden verdeeld onder iedereen die "Ik kan" zei (vaste krachten en oproepkrachten gelijk).${d.instellingen.auto_publiceren ? ' Het rooster wordt daarna meteen verstuurd.' : ' Daarna kun je het controleren en versturen.'}`, 'Definitief maken')) return;
      await herlaad();
      const res = await Uitvraag.cafDefinitief(Store, A.data, maand);
      await herlaad(); A.toast(`${res.gevuld} dienst(en) verdeeld${res.open ? ', ' + res.open + ' nog open' : ''}`, 'ok'); pRooster();
    });
    if (k('opnieuwRooster')) k('opnieuwRooster').onclick = async e => { if (await A.bevestig('Opnieuw maken', 'Alle diensten van ' + A.maandNaam(maand) + ' worden opnieuw verdeeld. Handmatige wijzigingen gaan verloren. Feesten die via de uitvraag zijn ingepland blijven staan.', 'Opnieuw maken')) A.bezig(e.target, () => maakRooster(maand, true)); };
    if (k('verwijderRooster')) k('verwijderRooster').onclick = async () => { if (await A.bevestig('Concept weggooien', 'Het concept-rooster voor ' + A.maandNaam(maand) + ' wordt verwijderd.', 'Weggooien')) { await verwijderMaandDiensten(maand); await Store.remove('roosters', r.id); await herlaad(); pRooster(); } };
    if (k('publiceer')) k('publiceer').onclick = e => A.bezig(e.currentTarget, () => publiceer(maand));
    if (k('terugConcept')) k('terugConcept').onclick = async () => { if (await A.bevestig('Terug naar concept', 'Het personeel ziet dit rooster dan niet meer tot je opnieuw publiceert.', 'Terug naar concept')) { await Store.update('roosters', r.id, { status: 'concept' }); await herlaad(); pRooster(); } };
    if (k('deelWa')) k('deelWa').onclick = () => deelWhatsApp(maand);
    if (k('toonMeldingen')) k('toonMeldingen').onclick = () => A.modal('Aandachtspunten', `<p class="zacht">Dit kwam de planner tegen bij het maken van het rooster:</p><ul class="waarschuwingen">${(r.meldingen || []).map(m => `<li>${esc(m)}</li>`).join('')}</ul>`);

    const inh = $('#roosterInhoud');
    if (staat.weergave === 'personen') return renderPersonen(inh, maand);
    if (staat.weergave === 'uren') return renderUren(inh, maand);
    renderKalender(inh, maand, diensten);
  }

  async function verwijderMaandDiensten(maand) {
    for (const x of A.data.diensten.filter(x => x.maand === maand && !G.dienstVast(x, A.data))) await Store.remove('diensten', x.id);
  }
  async function maakRooster(maand, opnieuw) {
    if (opnieuw) await verwijderMaandDiensten(maand);
    await herlaad();
    const r0 = A.rooster(maand);
    const res = r0 && r0.status === 'voorlopig' ? G.generateVoorlopig(maand, A.data) : G.generateMonth(maand, A.data);
    await Store.insert('diensten', res.diensten);
    const r = A.rooster(maand);
    const rec = { status: r ? r.status : 'concept', gegenereerd_op: new Date().toISOString(), meldingen: res.meldingen };
    if (r) await Store.update('roosters', r.id, rec); else await Store.insert('roosters', { maand, ...rec });
    if (r && r.status === 'gepubliceerd') {
      const wie = new Set(res.diensten.filter(x => x.medewerker_id).map(x => x.medewerker_id));
      for (const id of wie) await A.melding(id, 'Het rooster van ' + A.maandNaam(maand) + ' is aangepast. Kijk even naar je diensten.');
    }
    await herlaad();
    A.toast('Rooster gemaakt: ' + res.diensten.length + ' diensten' + (res.diensten.filter(x => !x.medewerker_id).length ? ', ' + res.diensten.filter(x => !x.medewerker_id).length + ' open' : ''), 'ok');
    pRooster();
  }

  async function publiceer(maand) {
    const r = A.rooster(maand);
    const open = A.data.diensten.filter(x => x.maand === maand && !x.medewerker_id).length;
    if (open && !await A.bevestig('Er zijn nog open diensten', `Er ${open > 1 ? 'zijn' : 'is'} nog ${open} open dienst${open > 1 ? 'en' : ''}. Personeel kan open diensten zelf oppakken. Toch versturen?`, 'Versturen')) return;
    await Store.update('roosters', r.id, { status: 'gepubliceerd', gepubliceerd_op: new Date().toISOString() });
    await herlaad();
    const n = await A.meldRooster(maand);
    await herlaad();
    A.toast(n + ' medewerker(s) hebben een melding gekregen', 'ok');
    pRooster();
    deelWhatsApp(maand);
  }

  function siteUrl() {
    const ins = A.data.instellingen;
    if (ins.site_url) return ins.site_url;
    return location.href.replace(/beheer\.html.*$/, 'index.html').replace(/#.*$/, '');
  }
  function deelWhatsApp(maand) {
    const tekst = `📅 Het rooster voor ${A.maandNaam(maand)} staat online!\nBekijk je diensten, vraag vrij of ruil een dienst via:\n${siteUrl()}`;
    A.modal('Personeel laten weten', `<p>Het rooster is verstuurd: iedereen die is ingeroosterd heeft een melding in de app gekregen. Wil je het ook in de WhatsApp-groep zetten?</p><textarea id="waTekst" rows="4">${esc(tekst)}</textarea>`,
      [{ label: 'Niet nu', waarde: null }, { label: '💬 Open WhatsApp', soort: 'ok', waarde: bg => { window.open('https://wa.me/?text=' + encodeURIComponent(bg.querySelector('#waTekst').value), '_blank'); return true; } }]);
  }

  function renderKalender(el, maand, diensten) {
    const d = A.data, nu = G.today(), r = A.rooster(maand);
    const dicht = new Map(d.sluitingsdagen.map(s => [s.datum, s.reden]));
    const eerste = maand + '-01', laatste = G.lastDay(maand);
    let w = G.weekStart(eerste);
    let html = `<div class="legenda geen-print"><span><i style="background:var(--caf)"></i>Cafetaria</span><span><i style="background:var(--zaal)"></i>Zalencentrum</span><span><i style="background:var(--fout)"></i>Open dienst</span><span><i class="voorlopig-i"></i>Voorlopig (uitvraag loopt nog)</span><span>Klik op een dienst om iemand anders in te plannen</span></div>`;
    const vlPerDag = {};
    if (staat.loc !== 'cafetaria') for (const x of voorlopig().diensten) (vlPerDag[x.datum] = vlPerDag[x.datum] || []).push(x);
    const heeftRooster = !!A.rooster(maand);
    while (w <= laatste) {
      html += `<div class="weekblok"><h3>Week ${G.isoWeek(w)}</h3><div class="dagen">`;
      for (let i = 0; i < 7; i++) {
        const dag = G.addDays(w, i);
        if (G.monthOf(dag) !== maand) { html += '<div class="dag buiten"></div>'; continue; }
        const ds = diensten.filter(x => x.datum === dag).sort((a, b) => (a.locatie === b.locatie ? 0 : a.locatie === 'cafetaria' ? -1 : 1) || G.min(a.start) - G.min(b.start));
        const evs = d.zalen_events.filter(e => e.datum === dag && staat.loc !== 'cafetaria');
        const isDicht = dicht.has(dag);
        const ruilIds = new Set(d.ruilverzoeken.filter(r => ['open', 'gevraagd', 'overgenomen'].includes(r.status)).flatMap(r => [r.dienst_id, r.terug_dienst_id]));
        html += `<div class="dag ${dag === nu ? 'vandaag' : ''} ${isDicht && staat.loc !== 'zalen' ? 'dicht' : ''}" data-dag="${dag}">
          <div class="dag-kop"><span>${A.DAG_KORT[i]}</span><span class="nr">${G.parse(dag).getUTCDate()}</span></div>
          ${isDicht && staat.loc !== 'zalen' ? `<span class="label">Cafetaria dicht${dicht.get(dag) ? ' · ' + esc(dicht.get(dag)) : ''}</span>` : ''}
          ${evs.map(e => { const vl = (vlPerDag[dag] || []).filter(x => x.event_id === e.id), vo = vl.filter(x => !x.medewerker_id).length;
            const vlRijen = groepOpen(vl.sort((a, b) => !a.medewerker_id - !b.medewerker_id || G.min(a.start) - G.min(b.start)));
            return `<div class="event-kop" data-ev="${e.id}" title="${esc(e.naam)}">🎉 ${esc(e.naam)}</div>${vl.length ? `<div class="vl-kop ${vo ? 'fout' : 'ok'}" data-ev="${e.id}">⏳ voorlopig · ${vo ? vo + ' open' : 'rond'}</div>` : ''}` +
              vlRijen.map(({ x, n }) => { const m = A.mw(x.medewerker_id); return `<div class="dienst zalen voorlopig ${m ? '' : 'open'}" data-ev="${e.id}" title="Voorlopig – uitvraag loopt nog">
                ${m ? `<span class="stip" style="background:${esc(m.kleur)}"></span>` : ''}<span class="naam">${m ? esc(m.naam) : `Open${n > 1 ? ` <span class="aantal">${n}×</span>` : ''}`}<br><span class="fn">${esc(x.functie)}</span></span><span class="tijd">${esc(x.start)}<br>${esc(x.eind)}</span></div>`; }).join(''); }).join('')}
          ${groepOpen(ds).map(({ x, n, ids }) => { const m = A.mw(x.medewerker_id); const kb = !m && r && r.status === 'voorlopig' && x.locatie === 'cafetaria' ? kanBij(ids) : null; return `<div class="dienst ${x.locatie} ${m ? '' : 'open'} ${ruilIds.has(x.id) ? 'ruil' : ''}" data-id="${x.id}" title="${esc(x.functie)} ${tijd(x)}${n > 1 ? ' – ' + n + ' open plekken' : ''}${kb !== null ? ' – ' + kb + ' oproepkracht(en) kunnen' : ''}">
            ${m ? `<span class="stip" style="background:${esc(m.kleur)}"></span>` : ''}<span class="naam">${m ? esc(m.naam) : `Open${n > 1 ? ` <span class="aantal">${n}×</span>` : ''}${kb !== null ? ` <span class="kanaantal ${kb ? '' : 'nul'}">✓${kb}</span>` : ''}`}<br><span class="fn">${esc(x.functie)}</span></span><span class="tijd">${esc(x.start)}<br>${esc(x.eind)}</span></div>`; }).join('')}
          ${heeftRooster ? '<button class="plus" data-plus="' + dag + '">+ dienst</button>' : ''}
        </div>`;
      }
      html += '</div></div>';
      w = G.addDays(w, 7);
    }
    el.innerHTML = html;
    el.querySelectorAll('.dienst:not(.voorlopig)').forEach(x => x.onclick = () => dienstModal(A.data.diensten.find(y => y.id === x.dataset.id)));
    el.querySelectorAll('[data-plus]').forEach(x => x.onclick = () => dienstModal(null, x.dataset.plus));
    el.querySelectorAll('[data-ev]').forEach(x => x.onclick = () => eventModal(A.event(x.dataset.ev)));
  }

  // Open plekken met dezelfde functie en tijden samenvoegen tot één regel ("Open 3×"); ingevulde diensten blijven los
  // Overzicht van wie er op een feest is ingepland: per functie een rij, open plekken in rood
  function indelingHtml(e) {
    const ds = A.data.diensten.filter(x => x.event_id === e.id)
      .sort((a, b) => a.functie.localeCompare(b.functie) || !a.medewerker_id - !b.medewerker_id || G.min(a.start) - G.min(b.start));
    const open = ds.filter(x => !x.medewerker_id).length;
    const fns = [...new Set(ds.map(x => x.functie))];
    const wijzig = e.status === 'concept';
    const tijd = x => (x.start !== e.start || x.eind !== e.eind) ? ` <small class="zacht">${esc(x.start)}–${esc(x.eind)}</small>` : '';
    return `<div class="indeling">
      <div class="indeling-kop"><b>${e.status === 'concept' ? '📝 Ingepland, nog niet verstuurd' : '✅ Ingepland en verstuurd'}</b>
        <span class="label ${open ? 'fout' : 'ok'}">${ds.length - open} van ${ds.length} ingevuld${open ? ` · ${open} open` : ''}</span></div>
      ${fns.map(f => { const rij = ds.filter(x => x.functie === f);
        return `<div class="indeling-rij"><div class="indeling-fn">${esc(f)} <small class="zacht">${rij.filter(x => x.medewerker_id).length}/${rij.length}</small></div>
          <div class="indeling-namen">${rij.map(x => { const m = A.mw(x.medewerker_id);
            const attr = wijzig ? ` data-wissel="${x.id}" role="button" tabindex="0" title="Klik om iemand anders op deze plek te zetten"` : '';
            return m ? `<span class="indeling-naam${wijzig ? ' klik' : ''}"${attr}><span class="stip" style="background:${esc(m.kleur)}"></span>${esc(m.naam)}${tijd(x)}${wijzig ? ' <span class="potlood">✎</span>' : ''}</span>`
                     : `<span class="indeling-naam open${wijzig ? ' klik' : ''}"${attr}>Open${tijd(x)}${wijzig ? ' <span class="potlood">＋</span>' : ''}</span>`; }).join('')}</div></div>`; }).join('')}
      ${wijzig ? '<p class="zacht" style="font-size:.8rem;margin:.4em 0 0">Klik op een naam of op Open om te schuiven. Pas na "Versturen naar personeel" krijgt iedereen een melding.</p>' : ''}
    </div>`;
  }

  // Iemand anders op een plek van een (nog niet verstuurd) feest zetten, of twee mensen laten wisselen
  async function wisselPlek(dienstId) {
    const d = A.data.diensten.find(x => x.id === dienstId); if (!d) return false;
    const e = A.event(d.event_id);
    const zelfde = A.data.diensten.filter(x => x.event_id === e.id && x.id !== d.id);
    const ctx = G.context(A.data, A.data.diensten.filter(x => x.id !== d.id));
    const reactie = m => { const r = A.data.event_reacties.find(x => x.event_id === e.id && x.medewerker_id === m.id); return r ? (r.kan ? 'kan' : 'niet') : 'geen'; };
    const lbl = { kan: '<span class="label ok">✓ kan</span>', niet: '<span class="label fout">✕ kan niet</span>', geen: '<span class="label">geen reactie</span>' };
    const kand = G.kandidaten(ctx, { ...d, medewerker_id: null }, { negeerUitvraag: true })
      .filter(k => k.m.actief !== false && k.m.id !== d.medewerker_id && (k.m.locaties || []).includes('zalen') && (k.m.functies || []).includes(d.functie))
      .map(k => ({ ...k, rc: reactie(k.m), elders: zelfde.find(x => x.medewerker_id === k.m.id) }))
      .filter(k => !(k.elders && k.elders.functie === d.functie && k.elders.start === d.start && k.elders.eind === d.eind))
      .sort((a, b) => ({ kan: 0, geen: 1, niet: 2 }[a.rc] - { kan: 0, geen: 1, niet: 2 }[b.rc]) || (b.ok - a.ok) || a.m.naam.localeCompare(b.m.naam));
    const optie = (val, html, uit) => `<label class="check wissel-optie${uit ? ' uit' : ''}"><input type="radio" name="wKeuze" value="${val}"> <span>${html}</span></label>`;
    const nu = A.mw(d.medewerker_id);
    // Taak wijzigen: wie hier staat naar een andere functie bij hetzelfde feest
    const taak = [], ruilIds = new Set();
    if (nu) for (const f of [...new Set(zelfde.map(x => x.functie))].filter(f => f !== d.functie && (nu.functies || []).includes(f))) {
      const vrij = zelfde.find(x => x.functie === f && !x.medewerker_id);
      if (vrij) taak.push(optie('__naar:' + vrij.id, `<b>${esc(nu.naam)} → ${esc(f)}</b> <small class="zacht">daar is een plek vrij; ${esc(d.functie)} wordt open</small>`));
      for (const x of zelfde.filter(x => x.functie === f && x.medewerker_id)) {
        const p = A.mw(x.medewerker_id);
        if (p && (p.functies || []).includes(d.functie)) { ruilIds.add(x.id); taak.push(optie('__ruil:' + x.id, `<b>${esc(nu.naam)} → ${esc(f)}</b> <span class="zacht">en</span> <b>${esc(p.naam)} → ${esc(d.functie)}</b> <small class="zacht">(taken ruilen)</small>`)); }
      }
    }
    const html = `<p style="margin-top:0"><b>${esc(e.naam)}</b> · ${esc(A.datumLang(e.datum))} · ${esc(d.functie)} ${esc(d.start)}–${esc(d.eind)}<br><span class="zacht">Nu: ${nu ? esc(nu.naam) : 'open'}</span></p>
      ${taak.length ? `<h4 style="margin:.2em 0 .3em">🔀 Taak van ${esc(nu.naam)} wijzigen</h4><div class="wissel-lijst" style="margin-bottom:.6em">${taak.join('')}</div>
        <h4 style="margin:.2em 0 .3em">👤 Of iemand anders op ${esc(d.functie)}</h4>` : ''}
      <div class="wissel-lijst">
        ${kand.filter(k => !(k.elders && ruilIds.has(k.elders.id))).map(k => optie(k.m.id, `<span class="stip" style="background:${esc(k.m.kleur)}"></span><b>${esc(k.m.naam)}</b> ${lbl[k.rc]}${k.elders ? ` <span class="label let">${nu ? `staat op ${esc(k.elders.functie)} – wisselen met ${esc(nu.naam)}` : `staat op ${esc(k.elders.functie)} – verplaatsen (die plek wordt open)`}</span>` : ''}${!k.ok && !k.elders ? ` <small class="zacht">(${esc((k.redenen || []).join(', ') || 'past niet')})</small>` : ''}`, !k.ok && !k.elders)).join('') || '<p class="zacht">Niemand anders heeft deze functie.</p>'}
        ${nu ? optie('__open', '<b style="color:var(--fout)">Plek leeg maken (open)</b>') : ''}
      </div>
      <div class="inhuur-blok">
        ${optie('__inhuur', '<b>🧑‍🍳 Iemand inhuren / van buiten</b>')}
        <div class="rij" style="margin:.3em 0 0 1.9em">
          <div class="veld"><label>Naam</label><input id="wInhuurNaam" list="wInhuurLijst" placeholder="bv. Jan (uitzendbureau)"></div>
          <div class="veld"><label>Telefoon <small>(optioneel)</small></label><input id="wInhuurTel" type="tel"></div>
        </div>
        <datalist id="wInhuurLijst">${A.data.medewerkers.filter(m => /^inhuur/i.test(m.notitie || '')).map(m => `<option value="${esc(m.naam)}">`).join('')}</datalist>
        <small class="zacht" style="display:block;margin-left:1.9em">Staat grijs in de personeelslijst met het label "inhuur", en krijgt geen meldingen of uitvragen.</small>
      </div>`;
    let inhuur = null;
    const keuze = await A.modal('Wie op deze plek?', html, [{ label: 'Annuleren', waarde: null },
      { label: 'Opslaan', soort: 'primair',
        controle: bg => { const c = bg.querySelector('input[name=wKeuze]:checked'); if (!c) return 'Kies eerst iemand'; if (c.value === '__inhuur' && !bg.querySelector('#wInhuurNaam').value.trim()) return 'Vul de naam in van wie je inhuurt'; return null; },
        waarde: bg => { inhuur = { naam: bg.querySelector('#wInhuurNaam').value.trim(), tel: bg.querySelector('#wInhuurTel').value.trim() }; return bg.querySelector('input[name=wKeuze]:checked').value; } }],
      bg => { const n = bg.querySelector('#wInhuurNaam'); n.addEventListener('input', () => { bg.querySelector('input[name=wKeuze][value="__inhuur"]').checked = true; }); });
    if (!keuze) return false;
    if (keuze === '__inhuur') {
      // ingehuurde kracht: aparte (niet-actieve) medewerker, zodat hij niet in uitvragen, meldingen of de inlog-lijst komt
      let m = A.data.medewerkers.find(x => /^inhuur/i.test(x.notitie || '') && x.naam.toLowerCase() === inhuur.naam.toLowerCase());
      if (!m) {
        m = { id: Store.uuid(), naam: inhuur.naam, pin: '', telefoon: inhuur.tel, email: '', functies: [d.functie], locaties: ['zalen'], contracturen: 0, vaste_dagen: [], vrije_dagen: [], max_dagen_week: 7, kleur: '#8d99ae', actief: false, in_dienst_sinds: null, notitie: 'Inhuur', liever_niet_dagen: [] };
        await Store.insert('medewerkers', m);
      } else if (!(m.functies || []).includes(d.functie)) await Store.update('medewerkers', m.id, { functies: [...(m.functies || []), d.functie] });
      await Store.update('diensten', d.id, { medewerker_id: m.id });
      A.toast(m.naam + ' (inhuur) staat nu op ' + d.functie, 'ok');
      return true;
    }
    if (keuze === '__open') { await Store.update('diensten', d.id, { medewerker_id: null }); A.toast('Plek is weer open'); return true; }
    if (keuze.startsWith('__naar:') || keuze.startsWith('__ruil:')) {
      const doel = A.data.diensten.find(x => x.id === keuze.slice(7)), ander = doel.medewerker_id;
      await Store.update('diensten', doel.id, { medewerker_id: nu.id });
      await Store.update('diensten', d.id, { medewerker_id: ander || null });
      A.toast(`${nu.naam} doet nu ${doel.functie}` + (ander ? `, ${A.mwNaam(ander)} doet ${d.functie}` : ''), 'ok');
      return true;
    }
    const nieuw = A.mw(keuze), elders = zelfde.find(x => x.medewerker_id === keuze);
    const k = kand.find(x => x.m.id === keuze);
    if (k && !k.ok && !elders && !await A.bevestig('Past eigenlijk niet', `${nieuw.naam}: ${(k.redenen || []).join(', ') || 'past volgens de planner niet'}. Toch op deze plek zetten?`, 'Toch doen')) return false;
    if (elders) {
      // wisselen: wie hier stond gaat naar de andere plek (als die de functie heeft), anders wordt die plek open
      const mag = nu && (nu.functies || []).includes(elders.functie);
      if (nu && !mag && !await A.bevestig('Wisselen', `${nu.naam} kan geen ${elders.functie}. ${nieuw.naam} komt op deze plek en de plek ${elders.functie} wordt open. Doorgaan?`, 'Doorgaan')) return false;
      await Store.update('diensten', elders.id, { medewerker_id: mag ? nu.id : null });
    }
    await Store.update('diensten', d.id, { medewerker_id: keuze });
    A.toast(nieuw.naam + ' staat nu op ' + d.functie, 'ok');
    return true;
  }

  function groepOpen(lijst) {
    const uit = [], open = new Map();
    for (const x of lijst) {
      if (x.medewerker_id) { uit.push({ x, n: 1, ids: [x.id] }); continue; }
      const k = [x.event_id || '', x.locatie, x.functie, x.start, x.eind].join('|');
      if (open.has(k)) { open.get(k).n++; open.get(k).ids.push(x.id); }
      else { const g = { x, n: 1, ids: [x.id] }; open.set(k, g); uit.push(g); }
    }
    return uit;
  }
  // Hoeveel oproepkrachten zeiden 'Ik kan' bij deze open cafetariadienst(en)?
  const kanBij = ids => new Set(A.data.event_reacties.filter(r => r.dienst_id && r.kan && ids.includes(r.dienst_id)).map(r => r.medewerker_id)).size;

  function renderPersonen(el, maand) {
    const d = A.data, dagen = G.monthDays(maand);
    const mws = actieveMw();
    let html = `<div class="paneel"><div class="tabel-wrap"><table class="matrix"><thead><tr><th class="naamcel">Medewerker</th>`;
    dagen.forEach(dag => { const wd = G.weekday(dag); html += `<th class="${wd >= 5 ? 'we' : ''}">${A.DAG_KORT[wd]}<br>${G.parse(dag).getUTCDate()}</th>`; });
    html += `<th>Uren</th></tr></thead><tbody>`;
    for (const m of mws) {
      html += `<tr><td class="naamcel"><span class="stip" style="background:${esc(m.kleur)}"></span> ${esc(m.naam)}</td>`;
      for (const dag of dagen) {
        const wd = G.weekday(dag);
        const ds = d.diensten.filter(x => x.datum === dag && x.medewerker_id === m.id && (staat.loc === 'alle' || x.locatie === staat.loc));
        const vl = d.verlof.find(v => v.medewerker_id === m.id && v.status === 'goedgekeurd' && v.van <= dag && v.tot >= dag);
        const nb = d.beschikbaarheid.find(b => b.medewerker_id === m.id && b.datum === dag);
        let cel = ds.map(x => `<span class="blok ${x.locatie === 'zalen' ? 'zalen' : 'caf'}" data-id="${x.id}" title="${esc(x.functie)} ${tijd(x)}">${x.start.replace(':00', '')}-${x.eind.replace(':00', '')}</span>`).join('');
        if (!cel && vl) cel = '<span class="vrij" title="Vrij">V</span>';
        else if (!cel && nb) cel = `<span class="nb" title="Kan niet: ${esc(nb.deel)}">–</span>`;
        else if (!cel && (m.vrije_dagen || []).map(Number).includes(wd)) cel = '<span class="zacht">·</span>';
        html += `<td class="${wd >= 5 ? 'we' : ''}">${cel}</td>`;
      }
      const u = urenVan(m.id, maand), doel = G.doelUren(m, maand);
      html += `<td><b>${A.uren(u)}</b>${doel ? `<br><small>/${Math.round(doel)}</small>` : ''}</td></tr>`;
    }
    html += `</tbody></table></div><p class="zacht" style="margin:.8em 0 0;font-size:.85rem">V = vrij (goedgekeurd) · – = heeft aangegeven niet te kunnen · · = vaste vrije dag</p></div>`;
    el.innerHTML = html;
    el.querySelectorAll('.blok').forEach(x => x.onclick = () => dienstModal(A.data.diensten.find(y => y.id === x.dataset.id)));
  }

  function renderUren(el, maand) {
    const mws = actieveMw();
    const rijen = mws.map(m => {
      const ds = A.data.diensten.filter(x => x.medewerker_id === m.id && x.maand === maand);
      const u = ds.reduce((s, x) => s + G.hours(x.start, x.eind), 0);
      const doel = G.doelUren(m, maand);
      return { m, u, doel, n: ds.length, caf: ds.filter(x => x.locatie === 'cafetaria').reduce((s, x) => s + G.hours(x.start, x.eind), 0), zaal: ds.filter(x => x.locatie === 'zalen').reduce((s, x) => s + G.hours(x.start, x.eind), 0) };
    });
    el.innerHTML = `<div class="paneel"><div class="paneel-kop"><h3>Uren ${esc(A.maandNaam(maand))}</h3><button class="knop klein" id="csv">⬇ Exporteer (Excel/CSV)</button></div>
      <div class="tabel-wrap"><table class="lijst"><thead><tr><th>Medewerker</th><th>Contract p/w</th><th>Doel maand</th><th>Gepland</th><th>Cafetaria</th><th>Zalen</th><th>Diensten</th><th style="width:22%"></th></tr></thead><tbody>
      ${rijen.map(r => { const pct = r.doel ? Math.min(100, r.u / r.doel * 100) : (r.u ? 100 : 0); const kl = !r.doel ? '' : r.u > r.doel * 1.1 ? 'over' : r.u < r.doel * 0.85 ? 'onder' : ''; return `<tr>
        <td><span class="stip" style="background:${esc(r.m.kleur)}"></span> <b>${esc(r.m.naam)}</b></td><td>${r.m.contracturen ? A.uren(+r.m.contracturen) : '<span class="label">oproep</span>'}</td>
        <td>${r.doel ? A.uren(Math.round(r.doel)) : '–'}</td><td><b>${A.uren(r.u)}</b>${r.doel ? ` <small class="zacht">(${r.u - r.doel >= 0 ? '+' : ''}${A.uren(Math.round(r.u - r.doel))})</small>` : ''}</td>
        <td>${A.uren(r.caf)}</td><td>${A.uren(r.zaal)}</td><td>${r.n}</td><td><div class="balk ${kl}"><i style="width:${pct}%"></i></div></td></tr>`; }).join('')}
      </tbody></table></div><p class="zacht" style="font-size:.85rem;margin:.8em 0 0">Doel maand = contracturen per week × aantal dagen in de maand ÷ 7. Oranje = te weinig, geel = ruim boven contract.</p></div>`;
    $('#csv').onclick = () => {
      const kop = 'Medewerker;Contract per week;Doel maand;Gepland;Cafetaria;Zalen;Aantal diensten';
      const regels = rijen.map(r => [r.m.naam, r.m.contracturen || 0, Math.round(r.doel), r.u, r.caf, r.zaal, r.n].join(';').replace(/\./g, ','));
      const detail = ['', 'Datum;Dag;Medewerker;Locatie;Functie;Start;Eind;Uren'].concat(
        A.data.diensten.filter(x => x.maand === maand).sort((a, b) => a.datum.localeCompare(b.datum) || G.min(a.start) - G.min(b.start))
          .map(x => [x.datum, A.DAGEN[G.weekday(x.datum)], A.mwNaam(x.medewerker_id), A.LOC[x.locatie], x.functie, x.start, x.eind, String(G.hours(x.start, x.eind)).replace('.', ',')].join(';')));
      A.download('uren-' + maand + '.csv', '﻿' + [kop].concat(regels, detail).join('\r\n'), 'text/csv');
    };
  }

  // ---------- dienst bewerken / toevoegen ----------
  async function dienstModal(dienst, nieuweDatum) {
    const nieuw = !dienst;
    const d = dienst ? { ...dienst } : { id: Store.uuid(), maand: G.monthOf(nieuweDatum), datum: nieuweDatum, locatie: staat.loc === 'zalen' ? 'zalen' : 'cafetaria', event_id: null, start: '16:00', eind: '21:00', functie: (A.data.instellingen.functies || [])[0], medewerker_id: null, notitie: '' };
    const evs = A.data.zalen_events.filter(e => e.datum === d.datum);
    let gekozen = d.medewerker_id;
    const html = `
      <p class="zacht" style="margin-top:-.3em">${esc(A.datumLang(d.datum))}${d.event_id && A.event(d.event_id) ? ' · 🎉 ' + esc(A.event(d.event_id).naam) : ''}</p>
      <div class="rij">
        <div class="veld"><label>Locatie</label><select id="dLoc"><option value="cafetaria" ${d.locatie === 'cafetaria' ? 'selected' : ''}>Cafetaria</option><option value="zalen" ${d.locatie === 'zalen' ? 'selected' : ''}>Zalencentrum</option></select></div>
        <div class="veld"><label>Functie</label><select id="dFn">${functieOpties(d.functie)}</select></div>
      </div>
      <div class="rij">
        <div class="veld"><label>Van</label><input type="time" id="dStart" value="${esc(d.start)}"></div>
        <div class="veld"><label>Tot</label><input type="time" id="dEind" value="${esc(d.eind)}"></div>
      </div>
      <div class="veld ${evs.length ? '' : 'verborgen'}" id="dEvWrap"><label>Bij feest</label><select id="dEv"><option value="">– geen –</option>${evs.map(e => `<option value="${e.id}" ${e.id === d.event_id ? 'selected' : ''}>${esc(e.naam)}</option>`).join('')}</select></div>
      <div class="veld"><label>Wie werkt er? <small>(beste keuze bovenaan)</small></label><div class="kand-lijst" id="kandLijst"></div></div>
      <div class="veld"><label>Notitie</label><input id="dNot" value="${esc(d.notitie || '')}" placeholder="bv. sleutel ophalen bij…"></div>`;
    const lees = bg => ({ ...d, locatie: bg.querySelector('#dLoc').value, functie: bg.querySelector('#dFn').value, start: bg.querySelector('#dStart').value, eind: bg.querySelector('#dEind').value, event_id: bg.querySelector('#dEv').value || null, notitie: bg.querySelector('#dNot').value, medewerker_id: gekozen });
    const tekenKand = bg => {
      const slot = lees(bg);
      const ctx = G.context(A.data, A.data.diensten.filter(x => x.id !== d.id));
      const k = G.kandidaten(ctx, slot);
      const lijst = bg.querySelector('#kandLijst');
      lijst.innerHTML = `<div class="kand ${!gekozen ? 'gekozen' : ''}" data-k=""><span class="avatar" style="background:#d9cfc0;width:30px;height:30px">–</span><div><b>Open laten</b><div class="r">personeel kan hem zelf oppakken</div></div></div>` +
        k.map(x => { const u = urenVan(x.m.id, slot.maand) - (dienst && dienst.medewerker_id === x.m.id ? G.hours(dienst.start, dienst.eind) : 0); const doel = G.doelUren(x.m, slot.maand);
          return `<div class="kand ${x.ok ? '' : 'nee'} ${gekozen === x.m.id ? 'gekozen' : ''}" data-k="${x.m.id}">${avatar(x.m).replace('avatar"', 'avatar" ')}<div><b>${esc(x.m.naam)}</b><div class="r">${x.ok ? esc(x.redenen.join(' · ') || 'beschikbaar') : '⛔ ' + esc(x.redenen.join(', '))}</div></div><span class="sc">${A.uren(u)}${doel ? '/' + Math.round(doel) : ''} u</span></div>`; }).join('');
      lijst.querySelectorAll('.kand').forEach(el => el.onclick = async () => {
        const id = el.dataset.k || null;
        if (id && el.classList.contains('nee') && !await A.bevestig('Toch inplannen?', 'Deze medewerker is eigenlijk niet beschikbaar (' + el.querySelector('.r').textContent.replace('⛔ ', '') + '). Toch inplannen?', 'Toch inplannen')) return;
        gekozen = id; tekenKand(bg);
      });
    };
    const knoppen = [];
    if (!nieuw) knoppen.push({ label: 'Verwijderen', soort: 'gevaar', waarde: 'weg' });
    knoppen.push({ label: 'Annuleren', waarde: null }, { label: 'Opslaan', soort: 'primair', waarde: bg => lees(bg), controle: bg => (!bg.querySelector('#dStart').value || !bg.querySelector('#dEind').value) ? 'Vul begin- en eindtijd in' : null });
    const res = await A.modal(nieuw ? 'Dienst toevoegen' : 'Dienst aanpassen', html, knoppen, bg => {
      tekenKand(bg);
      ['#dLoc', '#dFn', '#dStart', '#dEind'].forEach(s => bg.querySelector(s).addEventListener('change', () => tekenKand(bg)));
    });
    if (!res) return;
    const pub = dienstZichtbaar(d);
    if (res === 'weg') {
      await Store.remove('diensten', d.id);
      await meldDienst(d, d.medewerker_id, `Je dienst op ${A.datumLang(d.datum)} (${d.start}–${d.eind}) is vervallen.`);
      for (const r of A.data.ruilverzoeken.filter(r => r.dienst_id === d.id)) await Store.remove('ruilverzoeken', r.id);
    } else if (nieuw) {
      await Store.insert('diensten', res);
      await meldDienst(res, res.medewerker_id, `Je bent ingepland op ${A.datumLang(res.datum)} van ${res.start} tot ${res.eind} (${A.LOC[res.locatie]}, ${res.functie}).`);
    } else {
      const { id, ...patch } = res;
      await Store.update('diensten', d.id, patch);
      if (pub && dienst.medewerker_id !== res.medewerker_id) {
        if (dienst.medewerker_id) await A.melding(dienst.medewerker_id, `Je dienst op ${A.datumLang(d.datum)} (${dienst.start}–${dienst.eind}) is aan iemand anders gegeven.`);
        if (res.medewerker_id) await A.melding(res.medewerker_id, `Je bent ingepland op ${A.datumLang(res.datum)} van ${res.start} tot ${res.eind} (${A.LOC[res.locatie]}, ${res.functie}).`);
      } else if (pub && res.medewerker_id && (dienst.start !== res.start || dienst.eind !== res.eind)) {
        await A.melding(res.medewerker_id, `Je dienst op ${A.datumLang(res.datum)} is gewijzigd naar ${res.start}–${res.eind}.`);
      }
    }
    await herlaad(); pRooster();
    A.toast('Opgeslagen', 'ok');
  }

  // =====================================================================
  //  AANVRAGEN
  // =====================================================================
  function pAanvragen() {
    const sub = (location.hash.split('/')[1]) || staat.aanvraagTab;
    staat.aanvraagTab = sub;
    const d = A.data, nu = G.today();
    const vOpen = d.verlof.filter(v => v.status === 'aangevraagd').sort((a, b) => a.van.localeCompare(b.van));
    const vRest = d.verlof.filter(v => v.status !== 'aangevraagd' && v.tot >= G.addDays(nu, -60)).sort((a, b) => b.van.localeCompare(a.van));
    const rTeKeuren = d.ruilverzoeken.filter(r => r.status === 'overgenomen');
    const fTeKeuren = feestTeKeuren();
    const feestRuilItem = r => { const e = A.event(r.event_id);
      return `<div class="item"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.MAANDEN[G.parse(e.datum).getUTCMonth()].slice(0, 3)}</small></div>
        <div><div class="wie">${esc(A.mwNaam(r.medewerker_id))} → ${esc(A.mwNaam(r.overname_door))}</div>
        <div class="meta">${esc(A.datumLang(e.datum))} · ${esc(e.start)}–${esc(e.eind)} · 🎉 ${esc(e.naam)} · ${esc(r.bevestigd_functie)}</div>
        <div class="meta">Bevestigde plek, feest nog niet ingepland</div></div>
        <div class="rechts"><button class="knop klein gevaar" data-fraf="${r.id}">Afwijzen</button><button class="knop klein ok" data-frgoed="${r.id}">Goedkeuren</button></div></div>`; };
    const rOpen = d.ruilverzoeken.filter(r => r.status === 'open' || r.status === 'gevraagd');
    const rRest = d.ruilverzoeken.filter(r => ['goedgekeurd', 'afgewezen', 'geweigerd'].includes(r.status)).sort((a, b) => (b.aangemaakt_op || '').localeCompare(a.aangemaakt_op || '')).slice(0, 15);
    const nb = d.beschikbaarheid.filter(b => b.datum >= nu).sort((a, b) => a.datum.localeCompare(b.datum));

    const verlofItem = v => { const m = A.mw(v.medewerker_id); const dagen = Math.round((G.parse(v.tot) - G.parse(v.van)) / 864e5) + 1;
      const conflict = d.diensten.filter(x => x.medewerker_id === v.medewerker_id && x.datum >= v.van && x.datum <= v.tot).length;
      return `<div class="item">${avatar(m)}<div><div class="wie">${esc(m ? m.naam : '?')} <span class="zacht" style="font-weight:500">· ${dagen} dag${dagen > 1 ? 'en' : ''}</span></div>
        <div class="meta">${esc(A.datumKort(v.van))}${v.tot !== v.van ? ' t/m ' + esc(A.datumKort(v.tot)) : ''}${v.reden ? ' · “' + esc(v.reden) + '”' : ''}</div>
        ${v.status === 'aangevraagd' && conflict ? `<div class="meta" style="color:var(--let)">⚠️ staat ${conflict}× ingepland in deze periode</div>` : ''}
        ${v.reactie && v.status !== 'aangevraagd' ? `<div class="meta">Reactie: ${esc(v.reactie)}</div>` : ''}<div class="meta">${A.tijdGeleden(v.aangevraagd_op)}</div></div>
        <div class="rechts">${v.status === 'aangevraagd' ? `<button class="knop klein gevaar" data-af="${v.id}">Afwijzen</button><button class="knop klein ok" data-goed="${v.id}">Goedkeuren</button>` : `<span class="label ${v.status === 'goedgekeurd' ? 'ok' : 'fout'}">${v.status}</span>`}</div></div>`; };
    const ruilItem = r => { const x = d.diensten.find(y => y.id === r.dienst_id); const van = A.mw(r.van_id), naar = A.mw(r.naar_id);
      if (!x) return '';
      return `<div class="item"><div class="datumblok ${x.locatie}"><b>${G.parse(x.datum).getUTCDate()}</b><small>${A.MAANDEN[G.parse(x.datum).getUTCMonth()].slice(0, 3)}</small></div>
        <div><div class="wie">${esc(van ? van.naam : '?')} → ${naar ? esc(naar.naam) : '<span class="zacht">nog niemand</span>'}</div>
        <div class="meta">${esc(A.datumLang(x.datum))} · ${tijd(x)} · ${esc(x.functie)} · ${A.LOC[x.locatie]}</div>
        ${(() => { const t = r.terug_dienst_id && d.diensten.find(y => y.id === r.terug_dienst_id); return t ? `<div class="meta">↔ in ruil daarvoor neemt ${esc(van ? van.naam : '?')} de dienst van ${esc(naar ? naar.naam : '?')} op ${esc(A.datumLang(t.datum))} · ${tijd(t)} over</div>` : ''; })()}
        ${r.bericht ? `<div class="meta">“${esc(r.bericht)}”</div>` : ''}${r.status === 'gevraagd' ? `<div class="meta" style="color:var(--let)">Wacht nog op bevestiging van ${esc(naar ? naar.naam : '?')}</div>` : ''}${r.status === 'overgenomen' ? '<div class="meta" style="color:var(--ok)">✓ Beide collega\'s zijn akkoord</div>' : ''}</div>
        <div class="rechts">${r.status === 'overgenomen' ? `<button class="knop klein gevaar" data-raf="${r.id}">Afwijzen</button><button class="knop klein ok" data-rgoed="${r.id}">Goedkeuren</button>` : r.status === 'open' ? `<button class="knop klein" data-rtoewijs="${r.id}">Zelf iemand kiezen</button>` : r.status === 'gevraagd' ? '<span class="label let">wacht op collega</span>' : `<span class="label ${r.status === 'goedgekeurd' ? 'ok' : 'fout'}">${{ goedgekeurd: 'geruild', afgewezen: 'afgewezen', geweigerd: 'collega zei nee' }[r.status] || r.status}</span>`}</div></div>`; };

    hoofd.innerHTML = `<div class="kop"><h1>Aanvragen</h1><div class="tabs" id="aTabs">
        <button data-v="verlof">Vrij vragen ${vOpen.length ? `(${vOpen.length})` : ''}</button><button data-v="ruil">Ruilen ${rTeKeuren.length + fTeKeuren.length ? `(${rTeKeuren.length + fTeKeuren.length})` : ''}</button><button data-v="beschikbaar">Kan niet</button><button data-v="ziek">Ziek ${d.ziekmeldingen.filter(z => z.status === 'gemeld').length ? `(${d.ziekmeldingen.filter(z => z.status === 'gemeld').length})` : ''}</button></div></div>
      <div id="aInh"></div>`;
    hoofd.querySelectorAll('#aTabs button').forEach(b => { b.classList.toggle('actief', b.dataset.v === sub); b.onclick = () => { location.hash = 'aanvragen/' + b.dataset.v; }; });
    const inh = $('#aInh');
    if (sub === 'ziek') {
      const gemeld = d.ziekmeldingen.filter(z => z.status === 'gemeld').sort((a, b) => (a.gemeld_op || '').localeCompare(b.gemeld_op || ''));
      const nuZiek = d.ziekmeldingen.filter(z => z.status === 'bevestigd' && (!z.tot || z.tot >= nu));
      const item = (z, knoppen) => { const m = A.mw(z.medewerker_id); const ds = (z.dienst_ids || []).map(id => d.diensten.find(x => x.id === id)).filter(Boolean);
        return `<div class="item">${avatar(m)}<div><div class="wie">${esc(m ? m.naam : '?')} <span class="zacht" style="font-weight:500">· ziek vanaf ${esc(A.datumKort(z.van))}</span></div>
          <div class="meta">Gemeld ${A.tijdGeleden(z.gemeld_op)}${z.minuten_voor_dienst != null ? ' · ' + meldtijdTekst(z.minuten_voor_dienst) + ' voor de dienst' : ''}${z.opmerking ? ' · “' + esc(z.opmerking) + '”' : ''}</div>
          ${ds.length ? `<div class="meta">Vervalt: ${ds.map(x => esc(A.datumKort(x.datum)) + ' ' + tijd(x) + (x.medewerker_id && x.medewerker_id !== z.medewerker_id ? ' → ' + esc(A.mwNaam(x.medewerker_id)) : x.medewerker_id ? '' : ' <b style="color:var(--fout)">(open)</b>')).join(' · ')}</div>` : ''}</div>
          <div class="rechts">${knoppen}</div></div>`; };
      inh.innerHTML = `<div class="paneel"><div class="paneel-kop"><h3>Te bevestigen</h3></div><p class="zacht" style="margin-top:-.4em">Bevestig een ziekmelding als de medewerker je heeft gebeld. Je regelt dan meteen vervanging.</p>
          ${gemeld.length ? gemeld.map(z => item(z, `<button class="knop klein" data-zaf="${z.id}">Afwijzen</button><button class="knop klein ok" data-zok="${z.id}">Bevestigen</button>`)).join('') : '<div class="leeg">Geen nieuwe ziekmeldingen</div>'}</div>
        <div class="paneel"><div class="paneel-kop"><h3>Nu ziek</h3><a class="knop klein" href="#verzuim">Verzuimoverzicht</a></div>
          ${nuZiek.length ? nuZiek.map(z => item(z, `<button class="knop klein" data-zbeter="${z.id}">Beter melden</button>`)).join('') : '<div class="leeg"><span class="groot">💪</span>Niemand is ziek</div>'}</div>`;
      inh.querySelectorAll('[data-zok]').forEach(b => b.onclick = () => ziekBevestigen(b.dataset.zok));
      inh.querySelectorAll('[data-zaf]').forEach(b => b.onclick = () => ziekAfwijzen(b.dataset.zaf));
      inh.querySelectorAll('[data-zbeter]').forEach(b => b.onclick = () => ziekBeter(b.dataset.zbeter));
      return;
    }
    if (sub === 'ruil') {
      inh.innerHTML = `<div class="paneel"><div class="paneel-kop"><h3>Goed te keuren</h3></div>${rTeKeuren.length || fTeKeuren.length ? fTeKeuren.map(feestRuilItem).join('') + rTeKeuren.map(ruilItem).join('') : '<div class="leeg">Niets goed te keuren</div>'}</div>
        <div class="paneel"><div class="paneel-kop"><h3>Lopend (nog geen collega akkoord)</h3></div>${rOpen.length ? rOpen.map(ruilItem).join('') : '<div class="leeg">Geen openstaande ruilverzoeken</div>'}</div>
        <div class="paneel"><div class="paneel-kop"><h3>Afgehandeld</h3></div>${rRest.length ? rRest.map(ruilItem).join('') : '<div class="leeg">Nog niets</div>'}</div>`;
    } else if (sub === 'beschikbaar') {
      inh.innerHTML = `<div class="paneel"><div class="paneel-kop"><h3>Personeel kan niet op…</h3></div><p class="zacht">Dit geven medewerkers zelf door. De planner houdt hier rekening mee bij het maken van een nieuw rooster.</p>
        ${nb.length ? `<table class="lijst"><thead><tr><th>Datum</th><th>Wie</th><th>Wanneer</th><th>Opmerking</th></tr></thead><tbody>${nb.map(b => `<tr><td>${esc(A.datumKort(b.datum))}</td><td>${esc(A.mwNaam(b.medewerker_id))}</td><td>${esc(b.deel)}</td><td>${esc(b.opmerking || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="leeg">Niemand heeft iets doorgegeven</div>'}</div>`;
    } else {
      inh.innerHTML = `<div class="paneel"><div class="paneel-kop"><h3>Nieuwe aanvragen</h3><button class="knop klein" id="verlofInvoeren">+ Vrij invoeren</button></div>${vOpen.length ? vOpen.map(verlofItem).join('') : '<div class="leeg"><span class="groot">🎉</span>Geen openstaande aanvragen</div>'}</div>
        <div class="paneel"><div class="paneel-kop"><h3>Afgehandeld</h3></div>${vRest.length ? vRest.map(verlofItem).join('') : '<div class="leeg">Nog niets</div>'}</div>`;
      $('#verlofInvoeren').onclick = verlofInvoeren;
    }
    inh.querySelectorAll('[data-goed]').forEach(b => b.onclick = () => verlofBeslissen(b.dataset.goed, true));
    inh.querySelectorAll('[data-af]').forEach(b => b.onclick = () => verlofBeslissen(b.dataset.af, false));
    inh.querySelectorAll('[data-frgoed]').forEach(b => b.onclick = () => A.bezig(b, () => feestRuilBeslissen(b.dataset.frgoed, true)));
    inh.querySelectorAll('[data-fraf]').forEach(b => b.onclick = () => A.bezig(b, () => feestRuilBeslissen(b.dataset.fraf, false)));
    inh.querySelectorAll('[data-rgoed]').forEach(b => b.onclick = () => A.bezig(b, () => ruilBeslissen(b.dataset.rgoed, true)));
    inh.querySelectorAll('[data-raf]').forEach(b => b.onclick = () => A.bezig(b, () => ruilBeslissen(b.dataset.raf, false)));
    inh.querySelectorAll('[data-rtoewijs]').forEach(b => b.onclick = () => { const r = d.ruilverzoeken.find(x => x.id === b.dataset.rtoewijs); const x = d.diensten.find(y => y.id === r.dienst_id); staat.maand = x.maand; dienstModal(x); });
  }

  async function feestRuilBeslissen(id, goed) {
    await A.reload();
    const r = A.data.event_reacties.find(x => x.id === id);
    if (!r || !r.overname_door) { A.toast('Dit verzoek is al afgehandeld of ingetrokken', 'fout'); await herlaad(); return opnieuw(); }
    const e = A.event(r.event_id), naar = r.overname_door, van = r.medewerker_id, om = A.feestOmschr(e, r.bevestigd_functie);
    if (goed) {
      await A.feestOvernameUitvoeren(r, naar);
      await A.melding(naar, `✅ Goedgekeurd: je bent nu bevestigd voor ${om}.`, { titel: 'Ruil goedgekeurd' });
      await A.melding(van, `✅ Goedgekeurd: ${A.mwNaam(naar)} neemt jouw plek over bij ${om}. Je staat er niet meer op.`, { titel: 'Ruil goedgekeurd' });
      A.toast('Goedgekeurd', 'ok');
    } else {
      await Store.update('event_reacties', r.id, { overname_door: null });
      await A.melding(naar, `Je overname van de plek bij ${om} is niet goedgekeurd. ${A.mwNaam(van)} blijft ingepland.`);
      await A.melding(van, `De overname door ${A.mwNaam(naar)} bij ${om} is niet goedgekeurd. Je staat er nog op; je plek blijft aangeboden.`);
      A.toast('Afgewezen');
    }
    await herlaad(); opnieuw();
  }

  // ---------------- ziekmeldingen ----------------
  const meldtijdTekst = min => min == null ? '–' : min < 0 ? 'tijdens de dienst' : min < 60 ? min + ' min' : min < 1440 ? (Math.round(min / 6) / 10).toString().replace('.', ',') + ' uur' : Math.round(min / 1440) + ' dag(en)';

  async function ziekBevestigen(id) {
    const z = A.data.ziekmeldingen.find(x => x.id === id), m = A.mw(z.medewerker_id);
    // diensten die vervallen: gekozen diensten + alle diensten vanaf 'van' t/m de komende 3 dagen
    const ids = new Set(z.dienst_ids || []);
    A.data.diensten.filter(x => x.medewerker_id === z.medewerker_id && x.datum >= z.van && x.datum <= G.addDays(G.today(), 3)).forEach(x => ids.add(x.id));
    const ds = [...ids].map(i => A.data.diensten.find(x => x.id === i)).filter(x => x && x.medewerker_id === z.medewerker_id).sort((a, b) => a.datum.localeCompare(b.datum) || G.min(a.start) - G.min(b.start));
    const tmp = JSON.parse(JSON.stringify(A.data));
    tmp.ziekmeldingen = tmp.ziekmeldingen.map(x => x.id === id ? { ...x, status: 'bevestigd' } : x);
    const rij = x => {
      const ctx = G.context(tmp, tmp.diensten.filter(y => y.id !== x.id));
      const k = G.kandidaten(ctx, { ...x, medewerker_id: null }, { negeerUitvraag: true }).filter(k => k.ok && k.m.id !== z.medewerker_id).slice(0, 8);
      return `<tr><td>${esc(A.datumKort(x.datum))}<br><small class="zacht">${tijd(x)} · ${esc(x.functie)}</small></td><td><select class="zVerv" data-d="${x.id}" style="min-width:170px">
        <option value="">Open laten – collega's krijgen bericht</option>${k.map((c, i) => `<option value="${c.m.id}" ${i === 0 ? 'selected' : ''}>${esc(c.m.naam)}${c.redenen[0] ? ' (' + esc(c.redenen[0]) + ')' : ''}</option>`).join('')}</select></td></tr>`;
    };
    const res = await A.modal('Ziekmelding bevestigen', `<p><b>${esc(m.naam)}</b> is ziek vanaf ${esc(A.datumLang(z.van))}. Gemeld ${A.tijdGeleden(z.gemeld_op)}${z.minuten_voor_dienst != null ? ', ' + meldtijdTekst(z.minuten_voor_dienst) + ' voor de dienst' : ''}.</p>
      ${ds.length ? `<p>Wie neemt deze diensten over?</p><table class="lijst"><tbody>${ds.map(rij).join('')}</tbody></table>` : '<p class="zacht">Er vallen geen diensten uit.</p>'}
      <div class="veld" style="margin-top:1em"><label>Notitie (alleen voor jou)</label><input id="zNot" placeholder="bv. belde om 7:15"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Bevestigen', soort: 'ok', waarde: bg => ({ not: bg.querySelector('#zNot').value, verv: [...bg.querySelectorAll('.zVerv')].map(s => ({ d: s.dataset.d, m: s.value || null })) }) }]);
    if (!res) return;
    await Store.update('ziekmeldingen', id, { status: 'bevestigd', notitie_beheer: res.not, dienst_ids: [...new Set([...(z.dienst_ids || []), ...ds.map(x => x.id)])] });
    let open = 0;
    for (const v of res.verv) {
      const x = A.data.diensten.find(y => y.id === v.d);
      await Store.update('diensten', x.id, { medewerker_id: v.m });
      const om = `${A.datumLang(x.datum)} van ${x.start} tot ${x.eind} (${A.LOC[x.locatie]}, ${x.functie})`;
      if (v.m) await A.melding(v.m, `🙏 Je bent extra ingepland op ${om}, als vervanging.`);
      else {
        open++;
        const ctx = G.context(tmp, tmp.diensten.filter(y => y.id !== x.id));
        for (const k of G.kandidaten(ctx, { ...x, medewerker_id: null }, { negeerUitvraag: true }).filter(k => k.ok && k.m.id !== z.medewerker_id))
          await A.melding(k.m.id, `🆘 Er is een open dienst door ziekte: ${om}. Kun jij? Pak hem op bij Beschikbaar.`);
      }
    }
    await A.melding(z.medewerker_id, `Je ziekmelding is bevestigd. Beterschap! Meld je beter in de app zodra je weer kunt werken.`);
    await herlaad(); opnieuw();
    A.toast('Bevestigd' + (open ? ` – ${open} dienst(en) open, collega's hebben bericht gekregen` : ''), 'ok');
  }

  async function ziekAfwijzen(id) {
    const z = A.data.ziekmeldingen.find(x => x.id === id), m = A.mw(z.medewerker_id);
    const res = await A.modal('Ziekmelding afwijzen', `<p>Wijs de ziekmelding van <b>${esc(m.naam)}</b> af, bijvoorbeeld als die per ongeluk is gedaan. De diensten blijven dan staan.</p><div class="veld"><label>Reden (ziet de medewerker)</label><input id="zR" placeholder="bv. Je hebt niet gebeld, bel me even"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Afwijzen', soort: 'primair', waarde: bg => bg.querySelector('#zR').value }]);
    if (res === null) return;
    await Store.update('ziekmeldingen', id, { status: 'afgewezen', notitie_beheer: res });
    await A.melding(z.medewerker_id, `Je ziekmelding is niet bevestigd${res ? ': ' + res : ''}. Je diensten blijven staan.`);
    await herlaad(); opnieuw();
  }

  async function ziekBeter(id) {
    const z = A.data.ziekmeldingen.find(x => x.id === id), m = A.mw(z.medewerker_id);
    const res = await A.modal('Beter melden', `<p>Vanaf wanneer kan <b>${esc(m.naam)}</b> weer werken?</p><div class="veld"><input type="date" id="zB" value="${G.today()}" min="${z.van}"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Beter melden', soort: 'ok', waarde: bg => bg.querySelector('#zB').value || G.today() }]);
    if (!res) return;
    await Store.update('ziekmeldingen', id, { tot: G.addDays(res, -1) < z.van ? z.van : G.addDays(res, -1) });
    await A.melding(z.medewerker_id, `Je bent beter gemeld. Welkom terug vanaf ${A.datumLang(res)}!`);
    await herlaad(); opnieuw();
  }

  // ---------------- verzuimoverzicht ----------------
  function verzuimStats(mid) {
    const nu = G.today(), jaar = G.addDays(nu, -365), kwart = G.addDays(nu, -91);
    const zs = A.data.ziekmeldingen.filter(z => z.medewerker_id === mid && z.status !== 'afgewezen' && z.van >= jaar).sort((a, b) => b.van.localeCompare(a.van));
    const dagen = zs.reduce((t, z) => { const eind = !z.tot || z.tot > nu ? nu : z.tot; return t + Math.max(1, Math.round((G.parse(eind) - G.parse(z.van)) / 864e5) + 1); }, 0);
    const met = zs.filter(z => z.minuten_voor_dienst != null);
    const gem = met.length ? met.reduce((t, z) => t + z.minuten_voor_dienst, 0) / met.length : null;
    const kort = met.filter(z => z.minuten_voor_dienst < 120).length;
    const kwartN = zs.filter(z => z.van >= kwart).length;
    const perDag = {}; zs.forEach(z => { const w = G.weekday(z.van); perDag[w] = (perDag[w] || 0) + 1; });
    const vaakDag = Object.entries(perDag).find(([w, n]) => n >= 2 && zs.length >= 3 && n / zs.length >= .5);
    const signalen = [];
    if (zs.length >= 3 || kwartN >= 2) signalen.push('<span class="label fout">gesprek aanbevolen</span>');
    if (kort >= 2) signalen.push('<span class="label let">vaak kort van tevoren</span>');
    if (vaakDag) signalen.push(`<span class="label let">vaak op ${A.DAGEN[vaakDag[0]]}</span>`);
    return { zs, n: zs.length, kwartN, dagen, gem, kort, diensten: zs.reduce((t, z) => t + (z.dienst_ids || []).length, 0), signalen };
  }

  function pVerzuim() {
    const rijen = A.data.medewerkers.filter(m => m.actief !== false).map(m => ({ m, ...verzuimStats(m.id) })).sort((a, b) => b.n - a.n || b.dagen - a.dagen || a.m.naam.localeCompare(b.m.naam));
    const totaal = rijen.reduce((t, r) => t + r.n, 0);
    hoofd.innerHTML = `<div class="kop"><h1>Verzuim</h1><a class="knop" href="#aanvragen/ziek">Ziekmeldingen</a></div>
      <p class="zacht">Overzicht van de afgelopen 12 maanden. Zo zie je snel wie zich vaak ziek meldt, of vaak kort voor de dienst. Klik op een naam voor de details en om een gesprek vast te leggen.</p>
      <div class="tegels"><div class="tegel"><div class="getal">${totaal}</div><div class="wat">ziekmeldingen (12 mnd)</div></div>
        <div class="tegel"><div class="getal">${A.data.ziekmeldingen.filter(z => z.status === 'bevestigd' && (!z.tot || z.tot >= G.today())).length}</div><div class="wat">nu ziek</div></div>
        <div class="tegel ${rijen.some(r => r.signalen.length) ? 'aandacht' : ''}"><div class="getal">${rijen.filter(r => r.signalen.length).length}</div><div class="wat">medewerkers met een signaal</div></div></div>
      <div class="paneel"><div class="tabel-wrap"><table class="lijst"><thead><tr><th>Medewerker</th><th>Meldingen</th><th>Laatste 3 mnd</th><th>Ziektedagen</th><th>Gemiste diensten</th><th>Gem. gemeld vooraf</th><th>Laatste melding</th><th>Signaal</th></tr></thead><tbody>
      ${rijen.map(r => `<tr class="klik" data-vz="${r.m.id}"><td><span class="stip" style="background:${esc(r.m.kleur)}"></span> <b>${esc(r.m.naam)}</b></td><td>${r.n || '<span class="zacht">0</span>'}</td><td>${r.kwartN || '<span class="zacht">0</span>'}</td><td>${r.dagen || '<span class="zacht">0</span>'}</td><td>${r.diensten || '<span class="zacht">0</span>'}</td>
        <td>${r.gem == null ? '<span class="zacht">–</span>' : meldtijdTekst(Math.round(r.gem))}${r.kort ? ` <small class="zacht">(${r.kort}× &lt; 2 uur)</small>` : ''}</td><td>${r.zs[0] ? esc(A.datumKort(r.zs[0].van)) : '<span class="zacht">–</span>'}</td><td>${r.signalen.join(' ')}</td></tr>`).join('')}
      </tbody></table></div><p class="zacht" style="font-size:.85rem;margin:.8em 0 0">Signalen: <b>gesprek aanbevolen</b> bij 3 of meer meldingen in een jaar, of 2 in drie maanden. <b>Vaak kort van tevoren</b> bij 2 of meer meldingen minder dan 2 uur voor de dienst. De app legt bewust géén ziekteoorzaak vast; dat mag een werkgever niet registreren.</p></div>`;
    hoofd.querySelectorAll('[data-vz]').forEach(r => r.onclick = () => verzuimDetail(r.dataset.vz));
  }

  async function verzuimDetail(mid) {
    const m = A.mw(mid), st = verzuimStats(mid);
    const alle = A.data.ziekmeldingen.filter(z => z.medewerker_id === mid).sort((a, b) => b.van.localeCompare(a.van));
    const res = await A.modal('Verzuim ' + m.naam, `
      <div class="rij" style="margin-bottom:.8em"><div><div style="font-size:1.5rem;font-weight:800">${st.n}</div><small class="zacht">meldingen (12 mnd)</small></div><div><div style="font-size:1.5rem;font-weight:800">${st.dagen}</div><small class="zacht">ziektedagen</small></div><div><div style="font-size:1.5rem;font-weight:800">${st.gem == null ? '–' : meldtijdTekst(Math.round(st.gem))}</div><small class="zacht">gem. vooraf gemeld</small></div></div>
      ${st.signalen.length ? `<p>${st.signalen.join(' ')}</p>` : ''}
      ${alle.length ? `<table class="lijst"><thead><tr><th>Datum</th><th>Duur</th><th>Gemeld vooraf</th><th>Status</th></tr></thead><tbody>${alle.map(z => { const eind = !z.tot || z.tot > G.today() ? null : z.tot; const d = eind ? Math.round((G.parse(eind) - G.parse(z.van)) / 864e5) + 1 : null;
        return `<tr><td>${esc(A.datumKort(z.van))}${z.notitie_beheer ? `<br><small class="zacht">${esc(z.notitie_beheer)}</small>` : ''}</td><td>${d ? d + ' dag' + (d > 1 ? 'en' : '') : '<span class="label fout">nog ziek</span>'}</td><td>${meldtijdTekst(z.minuten_voor_dienst)}</td><td><span class="label ${z.status === 'bevestigd' ? 'ok' : z.status === 'gemeld' ? 'let' : 'fout'}">${z.status}</span></td></tr>`; }).join('')}</tbody></table>` : '<p class="zacht">Nog nooit ziek gemeld.</p>'}
      <div class="veld" style="margin-top:1em"><label>Gesprekken en afspraken <small>(alleen voor jou)</small></label><textarea id="vzNot" rows="5" placeholder="bv. 12-11: gesprek gehad over vaak ziek op zondag. Afspraak: …">${esc(m.notitie || '')}</textarea>
        <button class="knop klein plat" id="vzDatum" type="button" style="margin-top:.3em">+ Gesprek van vandaag toevoegen</button></div>`,
      [{ label: 'Sluiten', waarde: null }, { label: 'Opslaan', soort: 'primair', waarde: bg => bg.querySelector('#vzNot').value }],
      bg => { bg.querySelector('#vzDatum').onclick = () => { const t = bg.querySelector('#vzNot'); const d = new Date(); t.value = (t.value ? t.value.replace(/\s*$/, '') + '\n' : '') + d.getDate() + '-' + (d.getMonth() + 1) + '-' + d.getFullYear() + ': gesprek gehad over verzuim. Afspraak: '; t.focus(); }; });
    if (res === null || res === undefined) return;
    await Store.update('medewerkers', mid, { notitie: res });
    await herlaad(); A.toast('Opgeslagen', 'ok');
  }

  async function verlofInvoeren() {
    const res = await A.modal('Vrij invoeren', `
      <div class="veld"><label>Medewerker</label><select id="vMw">${actieveMw().map(m => `<option value="${m.id}">${esc(m.naam)}</option>`).join('')}</select></div>
      <div class="rij"><div class="veld"><label>Van</label><input type="date" id="vVan" value="${G.today()}"></div><div class="veld"><label>Tot en met</label><input type="date" id="vTot" value="${G.today()}"></div></div>
      <div class="veld"><label>Reden</label><input id="vReden" placeholder="bv. vakantie"></div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Opslaan als goedgekeurd', soort: 'primair', controle: bg => bg.querySelector('#vTot').value < bg.querySelector('#vVan').value ? 'Einddatum ligt voor begindatum' : null, waarde: bg => ({ medewerker_id: bg.querySelector('#vMw').value, van: bg.querySelector('#vVan').value, tot: bg.querySelector('#vTot').value, reden: bg.querySelector('#vReden').value }) }]);
    if (!res) return;
    const [v] = await Store.insert('verlof', { ...res, status: 'aangevraagd', reactie: '', aangevraagd_op: new Date().toISOString() });
    await herlaad();
    await verlofBeslissen(v.id, true, true);
  }

  async function verlofBeslissen(id, goed, stil) {
    const v = A.data.verlof.find(x => x.id === id), m = A.mw(v.medewerker_id);
    const conflicten = A.data.diensten.filter(x => x.medewerker_id === v.medewerker_id && x.datum >= v.van && x.datum <= v.tot).sort((a, b) => a.datum.localeCompare(b.datum));
    let html = `<p><b>${esc(m.naam)}</b>: ${esc(A.datumLang(v.van))}${v.tot !== v.van ? ' t/m ' + esc(A.datumLang(v.tot)) : ''}</p>`;
    let plan = [];
    if (goed && conflicten.length) {
      // vervangers zoeken, rekening houdend met elkaar
      const tmp = JSON.parse(JSON.stringify(A.data));
      tmp.verlof = tmp.verlof.map(x => x.id === id ? { ...x, status: 'goedgekeurd' } : x);
      for (const c of conflicten) {
        const dd = tmp.diensten.find(x => x.id === c.id); dd.medewerker_id = null;
        const verv = G.vervanger(dd, tmp, [v.medewerker_id]);
        if (verv) dd.medewerker_id = verv.id;
        plan.push({ dienst: c, verv });
      }
      html += `<p>${esc(m.naam)} staat in deze periode ${conflicten.length}× ingepland. Deze diensten worden automatisch opnieuw ingevuld:</p>
        <table class="lijst"><tbody>${plan.map(p => `<tr><td>${esc(A.datumKort(p.dienst.datum))}</td><td>${tijd(p.dienst)}</td><td>${esc(p.dienst.functie)}</td><td>${p.verv ? '→ <b>' + esc(p.verv.naam) + '</b>' : '<span class="label fout">open</span>'}</td></tr>`).join('')}</tbody></table>`;
    }
    html += `<div class="veld" style="margin-top:1em"><label>Bericht aan ${esc(m.naam)} (optioneel)</label><input id="vReactie" placeholder="${goed ? 'Veel plezier!' : 'Helaas, het is die dag erg druk…'}"></div>`;
    const res = stil && !conflicten.length ? { reactie: '' } : await A.modal(goed ? 'Vrij goedkeuren' : 'Vrij afwijzen', html, [{ label: 'Annuleren', waarde: null }, { label: goed ? 'Goedkeuren' : 'Afwijzen', soort: goed ? 'ok' : 'primair', waarde: bg => ({ reactie: bg.querySelector('#vReactie').value }) }]);
    if (!res) { if (stil) { await Store.update('verlof', id, { status: 'goedgekeurd' }); await herlaad(); opnieuw(); } return; }
    await Store.update('verlof', id, { status: goed ? 'goedgekeurd' : 'afgewezen', reactie: res.reactie });
    if (!stil) await A.melding(v.medewerker_id, `Je vrij-aanvraag voor ${A.datumKort(v.van)}${v.tot !== v.van ? ' t/m ' + A.datumKort(v.tot) : ''} is ${goed ? 'goedgekeurd ✅' : 'afgewezen ❌'}${res.reactie ? ': ' + res.reactie : ''}`);
    for (const p of plan) {
      await Store.update('diensten', p.dienst.id, { medewerker_id: p.verv ? p.verv.id : null });
      if (p.verv) await meldDienst(p.dienst, p.verv.id, `Je bent extra ingepland op ${A.datumLang(p.dienst.datum)} van ${p.dienst.start} tot ${p.dienst.eind} (${A.LOC[p.dienst.locatie]}, ${p.dienst.functie}).`);
    }
    await herlaad(); opnieuw();
    A.toast(goed ? 'Goedgekeurd' : 'Afgewezen', 'ok');
  }

  async function ruilBeslissen(id, goed) {
    const r = A.data.ruilverzoeken.find(x => x.id === id), x = A.data.diensten.find(y => y.id === r.dienst_id);
    const t = r.terug_dienst_id && A.data.diensten.find(y => y.id === r.terug_dienst_id);
    const omschr = `${A.datumLang(x.datum)} (${x.start}–${x.eind})`;
    if (goed) {
      await A.voerRuilUit(r);
      const tOm = t ? `${A.datumLang(t.datum)} (${t.start}–${t.eind})` : '';
      await A.melding(r.van_id, `✅ Je ruil is goedgekeurd: ${A.mwNaam(r.naar_id)} neemt je dienst op ${omschr} over.` + (t ? ` Jij werkt nu op ${tOm}.` : ''));
      await A.melding(r.naar_id, `✅ Goedgekeurd: je werkt op ${omschr} in plaats van ${A.mwNaam(r.van_id)}.` + (t ? ` Je dienst op ${tOm} is nu van ${A.mwNaam(r.van_id)}.` : ''));
    } else {
      await Store.update('ruilverzoeken', id, { status: 'afgewezen' });
      await A.melding(r.van_id, `Je ruil voor ${omschr} is niet goedgekeurd door de baas. Je dienst blijft staan.`);
      await A.melding(r.naar_id, `De ruil voor ${omschr} is niet goedgekeurd door de baas. Er verandert niets aan jouw diensten.`);
    }
    await herlaad(); pAanvragen();
  }

  // =====================================================================
  //  ZALENCENTRUM
  // =====================================================================
  // ---------- uitvraag-hulpjes ----------
  function uitvraagStand(e) {
    const groep = G.uitvraagGroep(e, A.data);
    const reac = A.data.event_reacties.filter(r => r.event_id === e.id);
    const kan = reac.filter(r => r.kan).length, kanNiet = reac.filter(r => !r.kan).length;
    return { groep, reac, kan, kanNiet, geen: groep.filter(m => !reac.some(r => r.medewerker_id === m.id)).length };
  }
  function vlLabel(e) {
    const ds = voorlopig().perEvent[e.id] || [], open = ds.filter(x => !x.medewerker_id).length;
    return ds.length ? (open ? ` <span class="label fout">voorlopig ${open} open</span>` : ' <span class="label ok">voorlopig rond</span>') : '';
  }
  function uitvraagLabel(e) {
    if (e.status !== 'open') return '';
    const st = uitvraagStand(e);
    return `<span class="label let" title="Reacties oproepkrachten">⏳ uitvraag t/m ${esc(A.datumKort(e.uitvraag_tot))} · ${st.kan} kan, ${st.kanNiet} niet, ${st.geen} geen reactie</span>`;
  }
  // Duidelijk overzicht van een lopende uitvraag: kleur, balk "kan / nodig", per functie en wie wat zei.
  function uitvraagOverzicht(e) {
    const st = uitvraagStand(e);
    const nodig = (e.bezetting || []).reduce((s, b) => s + (+b.aantal || 0), 0);
    const kanMw = st.reac.filter(r => r.kan).map(r => { const m = A.mw(r.medewerker_id); return m && (r.bevestigd_functie ? { ...m, naam: '🔒 ' + m.naam } : m); }).filter(Boolean);
    const nietMw = st.reac.filter(r => !r.kan).map(r => A.mw(r.medewerker_id)).filter(Boolean);
    const wachtMw = st.groep.filter(m => !st.reac.some(r => r.medewerker_id === m.id));
    // per functie: hoeveel van de 'kan'-mensen kunnen die functie doen
    // Voorlopige indeling met de reacties van nu (vast personeel telt ook mee)
    const vl = voorlopig().perEvent[e.id] || [];
    const gevuld = vl.filter(x => x.medewerker_id).length, nogOpen = Math.max(0, nodig - gevuld);
    const perFn = (e.bezetting || []).filter(b => +b.aantal > 0).map(b => ({ f: b.functie, nodig: +b.aantal, kan: vl.filter(x => x.functie === b.functie && x.medewerker_id).length }));
    const toestand = nodig && !nogOpen ? 'goed' : gevuld > 0 ? 'bijna' : wachtMw.length ? 'wacht' : 'slecht';
    const kleur = { goed: 'var(--ok)', bijna: 'var(--let)', wacht: '#b3a898', slecht: 'var(--fout)' }[toestand];
    const titel = { goed: '✓ Voorlopig rond', bijna: 'Voorlopig nog ' + nogOpen + ' open', wacht: 'Wacht op reacties · ' + nogOpen + ' open', slecht: 'Niemand kan · ' + nogOpen + ' open' }[toestand];
    const pct = nodig ? Math.min(100, Math.round(gevuld / nodig * 100)) : 0;
    const vlTekst = vl.length ? `<div class="uv-voorlopig"><b>Voorlopig:</b> ${vl.slice().sort((a, b) => !a.medewerker_id - !b.medewerker_id || a.functie.localeCompare(b.functie)).map(x => x.medewerker_id ? `${esc((A.mw(x.medewerker_id) || {}).naam || '?')} <small>(${esc(x.functie)})</small>` : `<span class="fout">open (${esc(x.functie)})</span>`).join(', ')}</div>` : '';
    const namen = (lijst, cls, teken) => lijst.length ? `<span class="uv-namen ${cls}">${teken} ${lijst.map(m => esc(m.naam)).join(', ')}</span>` : '';
    return {
      toestand,
      meta: `<div class="uv-fns">${perFn.map(x => `<span class="uv-fn ${x.kan >= x.nodig ? 'ok' : x.kan ? 'let' : 'fout'}">${esc(x.f)} <b>${x.kan}/${x.nodig}</b></span>`).join('')}</div>
        <div class="uv-wie">${namen(kanMw, 'ok', '✓')}${namen(nietMw, 'fout', '✕')}${namen(wachtMw, 'wacht', '…')}</div>${vlTekst}`,
      rechts: `<div class="uv-blok ${toestand}">
        <div class="uv-titel" style="color:${kleur}">${titel}</div>
        <div class="uv-balk" title="voorlopig ${gevuld} van ${nodig} ingevuld"><i style="width:${pct}%;background:${kleur}"></i></div>
        <div class="uv-tel"><span class="ok">✓ ${st.kan} kan</span><span class="fout">✕ ${st.kanNiet} niet</span><span class="wacht">… ${st.geen} wacht</span></div>
        <div class="uv-tot">⏳ reageren t/m ${esc(A.datumKort(e.uitvraag_tot))}</div></div>`
    };
  }

  function deelUitvraagWhatsApp(events) {
    const lijst = events.sort((a, b) => a.datum.localeCompare(b.datum)).map(e => `• ${Uitvraag.datumTekst(e.datum)} ${e.start}–${e.eind}: ${e.naam}`).join('\n');
    const tot = events.map(e => e.uitvraag_tot).sort()[0];
    const tekst = `🎉 Nieuwe feesten in het zalencentrum!\n${lijst}\n\nOproepkrachten: geef vóór ${Uitvraag.datumTekst(tot)} in de app aan op welke datums je kunt:\n${siteUrl()}\n\nHet maakt niet uit wie het eerst reageert, het werk wordt eerlijk verdeeld.`;
    // Wie krijgt een pushmelding? Per oproepkracht de feesten waarvoor hij of zij gevraagd is.
    const ontvangers = alleenGeen => {
      const perMw = {};
      for (const e of events) for (const m of G.uitvraagGroep(e, A.data)) {
        if (alleenGeen && A.data.event_reacties.some(r => r.event_id === e.id && r.medewerker_id === m.id)) continue;
        (perMw[m.id] = perMw[m.id] || []).push(e);
      }
      return perMw;
    };
    const nGeen = Object.keys(ontvangers(true)).length, nAlle = Object.keys(ontvangers(false)).length;
    const pushHtml = `<div class="push-opnieuw">
        <b>🔔 Nog een pushmelding sturen</b>
        <label class="check"><input type="radio" name="pushWie" value="geen" ${nGeen ? 'checked' : 'disabled'}> Alleen wie nog niet heeft gereageerd <span class="zacht">(${nGeen})</span></label>
        <label class="check"><input type="radio" name="pushWie" value="alle" ${nGeen ? '' : 'checked'}> Alle oproepkrachten die gevraagd zijn <span class="zacht">(${nAlle})</span></label>
        <button class="knop primair" type="button" id="pushOpnieuw" ${nAlle ? '' : 'disabled'}>🔔 Pushmelding sturen</button></div>`;
    return A.modal('Uitvraag delen', `${pushHtml}<p style="margin-top:1em">Of zet het in de WhatsApp-groep:</p><textarea id="waTekst" rows="8">${esc(tekst)}</textarea>`,
      [{ label: 'Sluiten', waarde: null }, { label: '💬 Open WhatsApp', soort: 'ok', waarde: bg => { window.open('https://wa.me/?text=' + encodeURIComponent(bg.querySelector('#waTekst').value), '_blank'); return true; } }],
      bg => {
        const knop = bg.querySelector('#pushOpnieuw');
        knop.onclick = () => A.bezig(knop, async () => {
          const alleenGeen = bg.querySelector('input[name=pushWie]:checked').value === 'geen';
          const perMw = ontvangers(alleenGeen);
          for (const [mid, lijst] of Object.entries(perMw)) {
            const eerste = lijst.map(x => x.uitvraag_tot).sort()[0];
            const open = alleenGeen ? lijst : lijst.filter(x => !A.data.event_reacties.some(r => r.event_id === x.id && r.medewerker_id === mid));
            await A.melding(mid, `⏰ ${open.length ? 'Kun jij werken? Je hebt nog niet gereageerd op' : 'Herinnering feesten in het zalencentrum:'} ` + (open.length ? open : lijst).map(x => `${A.datumKort(x.datum)} ${x.start}–${x.eind} (${x.naam})`).join('; ') + `. Geef het in de app aan bij "Kun jij op deze feesten?", graag vóór ${A.datumLang(eerste)}.`, { titel: 'Kun jij werken in het zalencentrum?' });
          }
          A.toast(`Pushmelding verstuurd naar ${Object.keys(perMw).length} oproepkracht(en)`, 'ok');
        }).then(() => { knop.disabled = true; knop.textContent = '✓ Verstuurd'; });
      });
  }

  // ---------- meerdere feesten in één keer, één bericht per oproepkracht ----------
  async function meerdereFeesten() {
    const nu = G.today(), dagenUit = +A.data.instellingen.uitvraag_dagen || 7;
    const bezTekst = bez => bez.filter(b => b.aantal > 0).map(b => b.aantal + '× ' + b.functie).join(', ') || 'nog niemand – klik op Aanpassen';
    const fns = A.data.instellingen.functies || [];
    const bezVelden = bez => fns.map(f => { const b = bez.find(x => x.functie === f); return `<label class="mf-fn"><span>${esc(f)}</span><input type="number" min="0" max="50" data-fn="${esc(f)}" value="${b ? b.aantal : 0}"></label>`; }).join('');
    const rij = (r) => `<div class="mf-rij" style="border:1px solid var(--lijn);border-radius:10px;padding:.6em .7em .4em;margin-bottom:.5em;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:.4em .5em;align-items:end">
        <div><label>Datum</label><input type="date" class="mDatum" value="${esc(r.datum)}" min="${nu}"></div>
        <div style="grid-column:span 2"><label>Naam</label><input class="mNaam" value="${esc(r.naam || '')}" placeholder="bv. Bruiloft Jansen"></div>
        <button class="icoon mWeg" type="button" title="Verwijderen" style="margin-bottom:.3em">✕</button>
        <div><label>Van</label><input type="time" class="mStart" value="${esc(r.start)}"></div>
        <div><label>Tot</label><input type="time" class="mEind" value="${esc(r.eind)}"></div>
        <div><label>Gasten</label><input type="number" class="mGasten" value="${esc(r.gasten)}" min="0"></div><span></span>
        <div class="mf-bez" style="grid-column:1/-1"><small class="zacht mBez">👥 ${esc(bezTekst(r.bezetting || standaardBezetting(r.gasten)))}</small>
          <button class="knop klein plat mBezKnop" type="button">✏️ Aanpassen</button>
          <div class="mf-fns verborgen">${bezVelden(r.bezetting || standaardBezetting(r.gasten))}</div></div></div>`;
    const zat = (() => { let d = G.addDays(nu, 14); while (G.weekday(d) !== 5) d = G.addDays(d, 1); return d; })();
    const html = `<p class="zacht" style="margin-top:-.3em">Zet alle nieuwe feesten in één keer in. De oproepkrachten krijgen <b>één bericht</b> met alle datums waarop ze kunnen werken.</p>
      <div id="mRijen">${rij({ datum: zat, start: '19:00', eind: '00:30', gasten: 80 })}</div>
      <button class="knop klein" id="mRij" type="button">+ Nog een feest</button>
      <p class="zacht" style="font-size:.82rem">De bezetting wordt voorgesteld op basis van het aantal gasten (in te stellen bij Instellingen). Met <b>✏️ Aanpassen</b> zet je per feest zelf hoeveel mensen er per functie nodig zijn.</p>
      <div class="veld" style="background:var(--zaal-licht);border-radius:10px;padding:.7em .9em;margin-top:.6em">
        <label class="check"><input type="checkbox" id="mUit" checked> Oproepkrachten laten reageren (uitvraag)</label>
        <div id="mUitWrap" style="margin-top:.5em"><label>Reageren kan tot en met</label><input type="date" id="mUitTot" value="${esc(G.addDays(nu, dagenUit))}" style="max-width:200px">
        <small class="zacht" style="display:block;margin-top:.3em">Ligt een feest eerder, dan stopt de termijn voor dat feest vanzelf 2 dagen ervoor.</small></div></div>`;
    const leesBezRij = r => [...r.querySelectorAll('.mf-fns input')].map(i => ({ functie: i.dataset.fn, aantal: +i.value || 0 })).filter(b => b.aantal > 0);
    const lees = bg => [...bg.querySelectorAll('.mf-rij')].map(r => ({ datum: r.querySelector('.mDatum').value, naam: r.querySelector('.mNaam').value.trim(), start: r.querySelector('.mStart').value, eind: r.querySelector('.mEind').value, gasten: +r.querySelector('.mGasten').value || 0, bezetting: leesBezRij(r) }));
    const res = await A.modal('Meerdere feesten toevoegen', html, [{ label: 'Annuleren', waarde: null }, {
      label: 'Opslaan', soort: 'primair',
      controle: bg => { const rs = lees(bg); if (!rs.length) return 'Voeg minstens één feest toe'; if (rs.some(r => !r.datum || !r.naam)) return 'Vul bij elk feest een datum en naam in'; if (rs.some(r => r.datum < nu)) return 'Er staat een datum in het verleden'; if (rs.some(r => !r.bezetting.length)) return 'Geef bij elk feest aan hoeveel mensen er nodig zijn (✏️ Aanpassen)'; return null; },
      waarde: bg => ({ rijen: lees(bg), uitvraag: bg.querySelector('#mUit').checked, tot: bg.querySelector('#mUitTot').value })
    }], bg => {
      const koppel = () => bg.querySelectorAll('.mf-rij').forEach(r => {
        r.querySelector('.mWeg').onclick = () => r.remove();
        const toon = () => { r.querySelector('.mBez').textContent = '👥 ' + bezTekst(leesBezRij(r)); };
        r.querySelector('.mGasten').oninput = () => {
          if (r.dataset.handmatig) return;   // zelf aangepast: niet meer automatisch overschrijven
          const voorstel = standaardBezetting(r.querySelector('.mGasten').value);
          r.querySelectorAll('.mf-fns input').forEach(i => { const b = voorstel.find(x => x.functie === i.dataset.fn); i.value = b ? b.aantal : 0; });
          toon();
        };
        r.querySelectorAll('.mf-fns input').forEach(i => i.oninput = () => { r.dataset.handmatig = '1'; toon(); });
        r.querySelector('.mBezKnop').onclick = () => { const f = r.querySelector('.mf-fns'); f.classList.toggle('verborgen'); r.querySelector('.mBezKnop').textContent = f.classList.contains('verborgen') ? '✏️ Aanpassen' : '✓ Klaar'; };
      });
      koppel();
      bg.querySelector('#mRij').onclick = () => {
        const rs = lees(bg), laatst = rs[rs.length - 1] || { datum: zat, start: '19:00', eind: '00:30', gasten: 80 };
        if (laatst.bezetting && !laatst.bezetting.length) delete laatst.bezetting;
        bg.querySelector('#mRijen').insertAdjacentHTML('beforeend', rij({ ...laatst, naam: '', datum: laatst.datum ? G.addDays(laatst.datum, 7) : zat }));
        koppel(); const n = bg.querySelectorAll('.mNaam'); n[n.length - 1].focus();
      };
      bg.querySelector('#mUit').onchange = e => { bg.querySelector('#mUitWrap').style.display = e.target.checked ? '' : 'none'; };
    });
    if (!res) return;
    const events = res.rijen.map(r => {
      let tot = null;
      if (res.uitvraag) { tot = res.tot || G.addDays(nu, dagenUit); const max = G.addDays(r.datum, -2); if (tot > max) tot = max < nu ? nu : max; }
      return { id: Store.uuid(), datum: r.datum, naam: r.naam, zaal: '', start: r.start || '19:00', eind: r.eind || '00:30', gasten: r.gasten, bezetting: r.bezetting.length ? r.bezetting : standaardBezetting(r.gasten), notitie: '',
        uitvraag: res.uitvraag, uitvraag_tot: tot, status: res.uitvraag ? 'open' : null, herinnerd: false };
    }).sort((a, b) => a.datum.localeCompare(b.datum));
    await Store.insert('zalen_events', events);
    await herlaad();
    if (res.uitvraag) {
      // één bericht per oproepkracht met alle feesten waarvoor hij of zij in aanmerking komt
      const perMw = {};
      for (const e of events) for (const m of G.uitvraagGroep(e, A.data)) (perMw[m.id] = perMw[m.id] || []).push(e);
      for (const [mid, lijst] of Object.entries(perMw)) {
        const eerste = lijst.map(e => e.uitvraag_tot).sort()[0];
        await A.melding(mid, `🎉 ${lijst.length > 1 ? lijst.length + ' nieuwe feesten' : 'Nieuw feest'} in het zalencentrum: ` + lijst.map(e => `${A.datumKort(e.datum)} ${e.start}–${e.eind} (${e.naam})`).join('; ') + `. Geef bij "Kun jij op deze feesten?" aan op welke datums je kunt, graag vóór ${A.datumLang(eerste)}.`);
      }
      await herlaad(); opnieuw();
      A.toast(`${events.length} feesten opgeslagen – ${Object.keys(perMw).length} oproepkracht(en) kregen één bericht`, 'ok');
      deelUitvraagWhatsApp(events);
    } else {
      // zonder uitvraag: inplannen als er al een maandrooster is
      let n = 0;
      for (const e of events) if (A.rooster(G.monthOf(e.datum))) { await herplanEvent(A.event(e.id), []); n++; }
      await herlaad(); opnieuw();
      A.toast(`${events.length} feesten opgeslagen${n ? ', ' + n + ' meteen ingepland' : ''}`, 'ok');
    }
  }

  // Gecontroleerde feesten versturen naar het personeel
  async function verstuurEvents(events) {
    const html = `<p>Deze feesten zijn ingepland en wachten op jouw controle. Na versturen krijgt iedereen die is ingeroosterd een melding. Oproepkrachten die "kan" zeiden maar niet nodig zijn, krijgen ook bericht.</p>
      ${events.map(e => { const ds = A.data.diensten.filter(x => x.event_id === e.id).sort((a, b) => a.functie.localeCompare(b.functie));
        return `<label class="check" style="align-items:flex-start;margin:.7em 0"><input type="checkbox" value="${e.id}" checked style="margin-top:.3em"><span><b>${esc(e.naam)}</b> · ${esc(A.datumKort(e.datum))}<br><small class="zacht">${ds.map(x => esc(x.functie) + ': ' + (x.medewerker_id ? esc(A.mwNaam(x.medewerker_id)) : '<b style="color:var(--fout)">open</b>')).join(' · ')}</small></span></label>`; }).join('')}
      <p class="zacht" style="font-size:.85rem">Iets aanpassen? Sluit dit venster en klik in het rooster op een dienst.</p>`;
    const ids = await A.modal('Feesten versturen', html, [{ label: 'Annuleren', waarde: null }, { label: '📤 Versturen', soort: 'ok', waarde: bg => [...bg.querySelectorAll('input:checked')].map(i => i.value) }]);
    if (!ids || !ids.length) return;
    const n = await Uitvraag.publiceerEvents(Store, A.data, A.data.zalen_events.filter(e => ids.includes(e.id)));
    await herlaad(); opnieuw();
    A.toast(`Verstuurd – ${n} melding(en) naar het personeel`, 'ok');
  }

  function pZalen() {
    const nu = G.today();
    const evs = A.data.zalen_events.filter(e => staat.zalenVerleden ? e.datum < nu : e.datum >= nu)
      .sort((a, b) => staat.zalenVerleden ? b.datum.localeCompare(a.datum) : a.datum.localeCompare(b.datum));
    const perMaand = {};
    evs.forEach(e => (perMaand[G.monthOf(e.datum)] = perMaand[G.monthOf(e.datum)] || []).push(e));
    const lopend = A.data.zalen_events.filter(e => e.status === 'open');
    const concepten = A.data.zalen_events.filter(e => e.status === 'concept').sort((a, b) => a.datum.localeCompare(b.datum));
    // verdeling oproepkrachten (afgelopen 3 maanden t/m alles wat gepland staat)
    const van = G.addDays(nu, -90);
    const oproep = A.data.medewerkers.filter(m => m.actief !== false && G.isOproep(m) && (m.locaties || []).includes('zalen'));
    const verdeling = oproep.map(m => { const ds = A.data.diensten.filter(d => d.medewerker_id === m.id && d.datum >= van);
      return { m, n: ds.length, u: ds.reduce((t, d) => t + G.hours(d.start, d.eind), 0), kan: A.data.event_reacties.filter(r => r.event_id && r.medewerker_id === m.id && r.kan).length, gereageerd: A.data.event_reacties.filter(r => r.event_id && r.medewerker_id === m.id).length }; })
      .sort((a, b) => b.u - a.u);
    const maxU = Math.max(1, ...verdeling.map(v => v.u));

    hoofd.innerHTML = `<div class="kop"><h1>Zalencentrum</h1><div class="acties">
        <label class="check"><input type="checkbox" id="verleden" ${staat.zalenVerleden ? 'checked' : ''}> Afgelopen feesten</label>
        ${lopend.length ? '<button class="knop" id="deelUitvraag">💬 Uitvraag delen</button>' : ''}
        ${concepten.length ? `<button class="knop ok" id="verstuurEvents">📤 Versturen (${concepten.length})</button>` : ''}
        <button class="knop" id="nieuwEvs">+ Meerdere feesten</button>
        <button class="knop primair" id="nieuwEv">+ Feest toevoegen</button></div></div>
      <p class="zacht">Zet hier alle feesten in. Met <b>uitvraag</b> krijgen de oproepkrachten een melding en ${esc(A.data.instellingen.uitvraag_dagen || 7)} dagen om te laten weten of ze kunnen. Daarna wordt het feest automatisch ingepland: eerst vast personeel (tot hun contracturen), daarna de oproepkrachten eerlijk verdeeld.</p>
      <p class="zacht uv-legenda"><span class="uv-fn ok">groen</span> genoeg oproepkrachten kunnen · <span class="uv-fn let">oranje</span> nog mensen nodig · <span class="uv-fn fout">rood</span> niemand kan · grijs: nog geen reacties. <span style="opacity:.8">(Vast personeel komt daar bij het inplannen nog bij.)</span></p>
      ${Object.keys(perMaand).length ? Object.keys(perMaand).map(m => `<div class="paneel"><div class="paneel-kop"><h3 style="text-transform:capitalize">${esc(A.maandNaam(m))}</h3>${A.rooster(m) ? `<span class="label ${A.isGepubliceerd(m) ? 'ok' : 'let'}">rooster ${A.isGepubliceerd(m) ? "verstuurd" : "concept"}</span>` : '<span class="label">nog geen maandrooster</span>'}</div>
        ${perMaand[m].map(e => { const ds = A.data.diensten.filter(x => x.event_id === e.id); const open = ds.filter(x => !x.medewerker_id).length; const nodig = (e.bezetting || []).reduce((s, b) => s + (+b.aantal || 0), 0);
          const uv = e.status === 'open' ? uitvraagOverzicht(e) : null;
          const status = uv ? uv.rechts : e.status === 'concept' ? `<span class="label let">✓ ingepland · nog niet verstuurd${open ? ' · ' + open + ' open' : ''}</span>` : ds.length ? (open ? `<span class="label fout">${open} open</span>` : nodig ? '<span class="label ok">compleet</span>' : '') : '<span class="label">wordt ingepland met maandrooster</span>';
          const kleur = uv ? 'uv uv-' + uv.toestand : ds.length && open ? 'uv ' + (open === ds.length ? 'uv-slecht' : 'uv-bijna') : '';
          return `<div class="item klik ${kleur}" data-ev="${e.id}" style="cursor:pointer"><div class="datumblok zalen"><b>${G.parse(e.datum).getUTCDate()}</b><small>${A.DAG_KORT[G.weekday(e.datum)]}</small></div>
          <div><div class="wie">${esc(e.naam)}</div><div class="meta">${tijd(e)} · ${e.gasten || '?'} gasten${e.zaal ? ' · ' + esc(e.zaal) : ''} · ${(e.bezetting || []).map(b => b.aantal + '× ' + esc(b.functie)).join(', ') || '<span style="color:var(--fout)">geen bezetting opgegeven</span>'}</div>
          ${uv ? uv.meta : ''}
          ${ds.filter(x => x.medewerker_id).length ? `<div class="meta">👥 ${ds.filter(x => x.medewerker_id).map(x => esc(A.mwNaam(x.medewerker_id))).join(', ')}</div>` : ''}</div>
          <div class="rechts">${status}</div></div>`; }).join('')}</div>`).join('')
        : `<div class="paneel"><div class="leeg"><span class="groot">🎉</span>${staat.zalenVerleden ? 'Geen afgelopen feesten' : 'Nog geen feesten gepland'}</div></div>`}
      ${verdeling.length ? `<div class="paneel"><div class="paneel-kop"><h3>Verdeling oproepkrachten</h3><small class="zacht">afgelopen 3 maanden + wat al gepland staat</small></div>
        <table class="lijst"><thead><tr><th>Oproepkracht</th><th>Diensten</th><th>Uren</th><th style="width:35%"></th><th>Zei 'kan'</th></tr></thead><tbody>
        ${verdeling.map(v => `<tr><td><span class="stip" style="background:${esc(v.m.kleur)}"></span> <b>${esc(v.m.naam)}</b></td><td>${v.n}</td><td>${A.uren(v.u)}</td><td><div class="balk"><i style="width:${v.u / maxU * 100}%;background:var(--zaal)"></i></div></td><td>${v.kan}×</td></tr>`).join('')}
        </tbody></table><p class="zacht" style="font-size:.85rem;margin:.6em 0 0">Wie minder heeft gewerkt, krijgt bij de volgende feesten voorrang, mits hij of zij heeft aangegeven te kunnen.</p></div>` : ''}`;
    $('#nieuwEv').onclick = () => eventModal(null);
    $('#nieuwEvs').onclick = () => meerdereFeesten();
    $('#verleden').onchange = e => { staat.zalenVerleden = e.target.checked; pZalen(); };
    if ($('#deelUitvraag')) $('#deelUitvraag').onclick = () => deelUitvraagWhatsApp(lopend);
    if ($('#verstuurEvents')) $('#verstuurEvents').onclick = () => verstuurEvents(concepten);
    hoofd.querySelectorAll('[data-ev]').forEach(x => x.onclick = () => eventModal(A.event(x.dataset.ev)));
  }

  // Standaardbezetting op basis van gasten. De regels stel je in bij Instellingen → Standaard bezetting feesten.
  // Regel: { functie, per: 1 persoon per X gasten (0 = vast aantal), min, max (0 = geen maximum) }
  const OUDE_REGELS = [{ functie: 'Bediening', per: 40, min: 1, max: 0 }, { functie: 'Bar', per: 80, min: 1, max: 0 }, { functie: 'Afwas', per: 0, min: 1, max: 0, vanaf: 50 }];
  const bezettingRegels = () => (Array.isArray(A.data.instellingen.bezetting_regels) && A.data.instellingen.bezetting_regels.length) ? A.data.instellingen.bezetting_regels : OUDE_REGELS;
  function aantalVolgensRegel(r, g) {
    if (r.vanaf && g < r.vanaf) return 0;
    let n = +r.per > 0 ? Math.ceil(g / +r.per) : 0;
    n = Math.max(n, +r.min || 0);
    if (+r.max > 0) n = Math.min(n, +r.max);
    return n;
  }
  function standaardBezetting(gasten) {
    const g = +gasten || 0, fns = A.data.instellingen.functies || [];
    return bezettingRegels().filter(r => fns.includes(r.functie)).map(r => ({ functie: r.functie, aantal: aantalVolgensRegel(r, g) })).filter(b => b.aantal > 0);
  }

  async function eventModal(ev) {
    const nieuw = !ev;
    const nu = G.today(), dagenUit = +A.data.instellingen.uitvraag_dagen || 7;
    const e = ev ? JSON.parse(JSON.stringify(ev)) : { id: Store.uuid(), datum: G.addDays(nu, 14), naam: '', zaal: '', start: '19:00', eind: '00:30', gasten: '', bezetting: [], notitie: '', uitvraag: true, uitvraag_tot: null, status: null, herinnerd: false };
    const rijHtml = (b, i) => `<div class="rij bez-rij" data-i="${i}" style="grid-template-columns:1.4fr .6fr .8fr .8fr auto;align-items:end;gap:.4em">
        <div class="veld" style="margin:0 0 .5em"><select class="bFn">${functieOpties(b.functie)}</select></div>
        <div class="veld" style="margin:0 0 .5em"><input type="number" min="0" class="bAantal" value="${esc(b.aantal || 1)}" title="aantal"></div>
        <div class="veld" style="margin:0 0 .5em"><input type="time" class="bStart" value="${esc(b.start || '')}" title="afwijkende begintijd"></div>
        <div class="veld" style="margin:0 0 .5em"><input type="time" class="bEind" value="${esc(b.eind || '')}" title="afwijkende eindtijd"></div>
        <button class="icoon bWeg" style="margin-bottom:.5em" title="verwijderen">✕</button></div>`;
    // reacties-overzicht bij bestaande uitvraag
    let reactieHtml = '';
    if (!nieuw && e.uitvraag) {
      const st = uitvraagStand(e);
      const regel = m => { const r = st.reac.find(r => r.medewerker_id === m.id);
        const bev = r && r.kan && r.bevestigd_functie;
        const knop = r && r.kan && e.status === 'open' ? (bev ? `<button class="knop klein plat" type="button" data-bev-weg="${r.id}">Intrekken</button>` : `<button class="knop klein ok" type="button" data-bev="${r.id}">Bevestigen</button>`) : '';
        return `<div class="item" style="padding:.35em 0;flex-wrap:wrap"><span class="stip" style="background:${esc(m.kleur)}"></span><b>${esc(m.naam)}</b><span class="rechts">${r ? (bev ? `<span class="label ok">🔒 bevestigd · ${esc(r.bevestigd_functie)}</span>${r.aangeboden ? ` <span class="label let">🔁 ${r.overname_door ? esc(A.mwNaam(r.overname_door)) + ' wil overnemen' : 'aangeboden'}</span>` : ''}` : r.kan ? '<span class="label ok">✓ kan</span>' : '<span class="label fout">✕ kan niet</span>') + ` <small class="zacht">${A.tijdGeleden(r.tijd)}</small>` : '<span class="label">geen reactie</span>'}${knop}</span></div>`; };
      reactieHtml = `<div class="paneel" style="background:#faf6ef;box-shadow:none;padding:.8em 1em">
        <div class="paneel-kop" style="margin-bottom:.3em"><b>Reacties oproepkrachten</b>${e.status === 'open' ? '<button class="knop klein primair" id="eNuPlannen" type="button">Nu inplannen</button>' : e.status === 'concept' ? '<button class="knop klein ok" id="eVersturen" type="button">📤 Versturen naar personeel</button>' : '<span class="label ok">verstuurd</span>'}</div>
        ${e.status === 'concept' || e.status === 'ingepland' ? indelingHtml(e) : ''}
        ${st.groep.length ? st.groep.map(regel).join('') : '<p class="zacht">Er zijn geen oproepkrachten met de gevraagde functies.</p>'}
        ${e.status === 'concept' || e.status === 'ingepland' ? '<div style="margin-top:.6em"><button class="knop klein" id="eTerug" type="button">↩ Inplannen ongedaan maken</button><small class="zacht" style="display:block;margin-top:.3em">De indeling vervalt en de uitvraag gaat weer open. Reacties blijven staan.</small></div>' : ''}
        ${e.status === 'open' ? '<p class="zacht" style="font-size:.82rem;margin:.4em 0 0">Met "Bevestigen" zet je iemand alvast vast op dit feest; die krijgt meteen een melding en kan het zelf niet meer uitzetten. "Nu inplannen" sluit de uitvraag meteen af. Wie dan nog niet heeft gereageerd, wordt niet ingepland.</p>' : ''}</div>`;
    }
    const uitvraagHtml = (nieuw || e.status === 'open' || !e.status) ? `
      <div class="veld" style="background:var(--zaal-licht);border-radius:10px;padding:.7em .9em">
        <label class="check"><input type="checkbox" id="eUitvraag" ${e.uitvraag ? 'checked' : ''} ${!nieuw && e.status === 'open' ? 'disabled' : ''}> Oproepkrachten laten reageren (uitvraag)</label>
        <div id="eUitWrap" style="margin-top:.5em;${e.uitvraag ? '' : 'display:none'}"><label>Reageren kan tot en met</label><input type="date" id="eUitTot" value="${esc(e.uitvraag_tot || U_standaard(e.datum))}" style="max-width:200px">
        <small class="zacht" style="display:block;margin-top:.3em">Daarna wordt het feest automatisch ingepland. Zet je meerdere feesten tegelijk in, dan worden ze samen verdeeld.</small></div></div>` : '';
    function U_standaard(datum) { return Uitvraag.standaardTermijn(datum, dagenUit, nu); }
    const html = `
      <div class="veld"><label>Naam van het feest</label><input id="eNaam" value="${esc(e.naam)}" placeholder="bv. Bruiloft Jansen"></div>
      <div class="rij"><div class="veld"><label>Datum</label><input type="date" id="eDatum" value="${esc(e.datum)}"></div>
        <div class="veld"><label>Van</label><input type="time" id="eStart" value="${esc(e.start)}"></div><div class="veld"><label>Tot</label><input type="time" id="eEind" value="${esc(e.eind)}"></div></div>
      <div class="rij"><div class="veld"><label>Aantal gasten</label><input type="number" id="eGasten" value="${esc(e.gasten)}"></div><div class="veld"><label>Zaal</label><input id="eZaal" value="${esc(e.zaal || '')}" placeholder="bv. Grote zaal"></div></div>
      <div class="veld"><label style="display:flex;justify-content:space-between;align-items:center">Benodigd personeel <button class="knop klein plat" id="eStandaard" type="button">✨ Voorstel op basis van gasten</button></label>
        <div class="rij" style="grid-template-columns:1.4fr .6fr .8fr .8fr auto;gap:.4em;font-size:.75rem;color:var(--zacht);font-weight:700"><span>Functie</span><span>Aantal</span><span>Begin*</span><span>Eind*</span><span></span></div>
        <div id="bezRijen">${(e.bezetting || []).map(rijHtml).join('')}</div>
        <button class="knop klein" id="eRij" type="button">+ Functie</button> <small class="zacht">* alleen invullen als het afwijkt van de feesttijden</small></div>
      ${uitvraagHtml}
      ${reactieHtml}
      <div class="veld"><label>Notitie</label><textarea id="eNot" placeholder="Bijzonderheden, menu, contactpersoon…">${esc(e.notitie || '')}</textarea></div>`;
    const leesBez = bg => [...bg.querySelectorAll('.bez-rij')].map(r => ({ functie: r.querySelector('.bFn').value, aantal: +r.querySelector('.bAantal').value || 0, start: r.querySelector('.bStart').value || undefined, eind: r.querySelector('.bEind').value || undefined })).filter(b => b.aantal > 0);
    const knoppen = [];
    if (!nieuw) knoppen.push({ label: 'Verwijderen', soort: 'gevaar', waarde: 'weg' });
    knoppen.push({ label: 'Annuleren', waarde: null }, {
      label: 'Opslaan', soort: 'primair',
      controle: bg => {
        if (!bg.querySelector('#eNaam').value.trim()) return 'Geef het feest een naam';
        if (!bg.querySelector('#eDatum').value) return 'Kies een datum';
        const u = bg.querySelector('#eUitvraag');
        if (u && u.checked && (!bg.querySelector('#eUitTot').value || bg.querySelector('#eUitTot').value >= bg.querySelector('#eDatum').value)) return 'De reactietermijn moet vóór de feestdatum eindigen';
        return null;
      },
      waarde: bg => {
        const u = bg.querySelector('#eUitvraag');
        const r = { ...e, naam: bg.querySelector('#eNaam').value.trim(), datum: bg.querySelector('#eDatum').value, start: bg.querySelector('#eStart').value, eind: bg.querySelector('#eEind').value, gasten: +bg.querySelector('#eGasten').value || 0, zaal: bg.querySelector('#eZaal').value, notitie: bg.querySelector('#eNot').value, bezetting: leesBez(bg) };
        if (u) { r.uitvraag = u.checked; r.uitvraag_tot = u.checked ? bg.querySelector('#eUitTot').value : null; }
        return r;
      }
    });
    const res = await A.modal(nieuw ? 'Feest toevoegen' : 'Feest bewerken', html, knoppen, bg => {
      const koppel = () => bg.querySelectorAll('.bWeg').forEach(b => b.onclick = ev2 => { ev2.preventDefault(); b.closest('.bez-rij').remove(); });
      koppel();
      bg.querySelector('#eRij').onclick = () => { bg.querySelector('#bezRijen').insertAdjacentHTML('beforeend', rijHtml({ functie: 'Bediening', aantal: 1 }, 0)); koppel(); };
      bg.querySelector('#eStandaard').onclick = () => { bg.querySelector('#bezRijen').innerHTML = standaardBezetting(bg.querySelector('#eGasten').value).map(rijHtml).join(''); koppel(); };
      if (nieuw) bg.querySelector('#eGasten').addEventListener('change', () => { if (!bg.querySelectorAll('.bez-rij').length) bg.querySelector('#eStandaard').click(); });
      const u = bg.querySelector('#eUitvraag');
      if (u) {
        u.onchange = () => { bg.querySelector('#eUitWrap').style.display = u.checked ? '' : 'none'; };
        if (nieuw) bg.querySelector('#eDatum').addEventListener('change', () => { bg.querySelector('#eUitTot').value = U_standaard(bg.querySelector('#eDatum').value); });
      }
      const ve = bg.querySelector('#eVersturen');
      if (ve) ve.onclick = () => A.bezig(ve, async () => {
        const n = await Uitvraag.publiceerEvents(Store, A.data, [A.event(e.id)]);
        bg.querySelector('.sluit').click(); await herlaad(); opnieuw();
        A.toast(`${e.naam} verstuurd – ${n} melding(en)`, 'ok');
      });
      // iemand alvast bevestigen / bevestiging intrekken
      const omschr = ev0 => `${ev0.naam} op ${A.datumLang(ev0.datum)} (${ev0.start}–${ev0.eind})`;
      bg.querySelectorAll('[data-bev]').forEach(k => k.onclick = () => A.bezig(k, async () => {
        const r = A.data.event_reacties.find(x => x.id === k.dataset.bev), m = A.mw(r.medewerker_id), ev0 = A.event(e.id);
        const alle = [...new Set((ev0.bezetting || []).filter(b => +b.aantal > 0).map(b => b.functie))];
        const eigen = alle.filter(f => (m.functies || []).includes(f));
        const keuze = eigen.length ? eigen : alle;
        let functie = keuze[0] || '';
        if (keuze.length > 1) {
          functie = await A.modal('Bevestigen: ' + m.naam, `<p>Voor welke functie bevestig je ${esc(m.naam)} bij ${esc(omschr(ev0))}?</p>
            <div class="veld"><select id="bevFn">${keuze.map(f => `<option>${esc(f)}</option>`).join('')}</select></div>`,
            [{ label: 'Annuleren', waarde: null }, { label: 'Bevestigen', soort: 'ok', waarde: b2 => b2.querySelector('#bevFn').value }]);
          if (!functie) return;
        } else if (!await A.bevestig('Bevestigen', `${m.naam} alvast bevestigen voor ${omschr(ev0)}${functie ? ' als ' + functie : ''}? ${m.naam} krijgt meteen een melding en kan het daarna zelf niet meer uitzetten.`, 'Bevestigen')) return;
        await Store.update('event_reacties', r.id, { bevestigd_functie: functie || 'bevestigd' });
        await A.melding(m.id, `✅ Je bent bevestigd voor ${omschr(ev0)}${functie ? ' als ' + functie : ''}. Kun je toch niet? Neem contact op met ${A.data.instellingen.beheer_naam || 'de baas'} of regel zelf een vervanger.`, { titel: 'Dienst bevestigd' });
        bg.querySelector('.sluit').click(); await herlaad(); opnieuw(); eventModal(A.event(e.id));
        A.toast(m.naam + ' is bevestigd', 'ok');
      }));
      bg.querySelectorAll('[data-bev-weg]').forEach(k => k.onclick = () => A.bezig(k, async () => {
        const r = A.data.event_reacties.find(x => x.id === k.dataset.bevWeg), m = A.mw(r.medewerker_id), ev0 = A.event(e.id);
        if (!await A.bevestig('Bevestiging intrekken', `De bevestiging van ${m.naam} voor ${omschr(ev0)} intrekken? ${m.naam} krijgt hier een melding van. De opgave "Ik kan" blijft staan.`, 'Intrekken')) return;
        await Store.update('event_reacties', r.id, { bevestigd_functie: null });
        await A.melding(m.id, `De bevestiging voor ${omschr(ev0)} is ingetrokken. Je opgave "Ik kan" blijft staan; na de termijn wordt het werk verdeeld.`);
        bg.querySelector('.sluit').click(); await herlaad(); opnieuw(); eventModal(A.event(e.id));
      }));
      bg.querySelectorAll('[data-wissel]').forEach(k => {
        const doe = async () => { if (await wisselPlek(k.dataset.wissel)) { bg.querySelector('.sluit').click(); await herlaad(); opnieuw(); eventModal(A.event(e.id)); } };
        k.onclick = doe; k.onkeydown = ev2 => { if (ev2.key === 'Enter') doe(); };
      });
      const et = bg.querySelector('#eTerug');
      if (et) et.onclick = () => A.bezig(et, async () => {
        const ev0 = A.event(e.id), vandaag = G.today();
        if (vandaag >= G.addDays(ev0.datum, -1)) return A.toast('Dit feest is te dichtbij om de uitvraag weer te openen. Pas de indeling aan via het rooster.', 'fout');
        let tot = ev0.uitvraag_tot && ev0.uitvraag_tot >= vandaag ? ev0.uitvraag_tot : Uitvraag.standaardTermijn(ev0.datum, dagenUit, vandaag);
        if (!tot || tot < vandaag) tot = vandaag;
        if (tot >= G.addDays(ev0.datum, -1)) tot = G.addDays(ev0.datum, -2) >= vandaag ? G.addDays(ev0.datum, -2) : vandaag;
        const ds = A.data.diensten.filter(x => x.event_id === ev0.id), mensen = ds.filter(x => x.medewerker_id);
        const verstuurd = ev0.status === 'ingepland';
        if (!await A.bevestig('Inplannen ongedaan maken', `De indeling van ${ev0.naam} vervalt${verstuurd && mensen.length ? ` en ${mensen.length} ${mensen.length === 1 ? 'persoon krijgt' : 'mensen krijgen'} daar een melding van` : ''}. De uitvraag gaat weer open t/m ${A.datumLang(tot)}. Wie al heeft gereageerd, hoeft dat niet opnieuw te doen.`, 'Ongedaan maken')) return;
        for (const x of ds) {
          await Store.remove('diensten', x.id);
          if (verstuurd && x.medewerker_id) await A.melding(x.medewerker_id, `↩ De indeling van ${ev0.naam} (${A.datumLang(ev0.datum)}) is teruggedraaid. Je dienst staat nog niet vast; de uitvraag loopt weer t/m ${A.datumLang(tot)}. Je reactie blijft staan.`);
        }
        await Store.update('zalen_events', ev0.id, { status: 'open', uitvraag: true, uitvraag_tot: tot, herinnerd: false });
        bg.querySelector('.sluit').click(); await herlaad(); opnieuw();
        A.toast(ev0.naam + ': uitvraag staat weer open', 'ok');
      });
      const np = bg.querySelector('#eNuPlannen');
      if (np) np.onclick = () => A.bezig(np, async () => {
        const st = uitvraagStand(e);
        if (st.geen && !await A.bevestig('Nu inplannen?', `${st.geen} oproepkracht(en) hebben nog niet gereageerd. Toch nu inplannen?`, 'Nu inplannen')) return;
        await A.verwerkUitvragen([e.id]);
        bg.querySelector('.sluit').click(); await herlaad(); opnieuw();
        A.toast(e.naam + (A.data.instellingen.auto_publiceren ? ' is ingepland en verstuurd' : ' is ingepland – controleer en verstuur'), 'ok');
      });
    });
    if (!res) return;
    const oudeDiensten = A.data.diensten.filter(x => x.event_id === e.id);
    if (res === 'weg') {
      if (!await A.bevestig('Feest verwijderen', 'Het feest en ' + oudeDiensten.length + ' bijbehorende dienst(en) worden verwijderd.', 'Verwijderen')) return;
      for (const x of oudeDiensten) { await Store.remove('diensten', x.id); await meldVoorEvent(ev, x.medewerker_id, `Je dienst op ${A.datumLang(x.datum)} (${ev.naam}) is vervallen.`); }
      for (const r of A.data.event_reacties.filter(r => r.event_id === e.id)) await Store.remove('event_reacties', r.id);
      await Store.remove('zalen_events', e.id);
      await herlaad(); opnieuw(); A.toast('Feest verwijderd'); return;
    }
    // Nieuwe uitvraag starten?
    const startUitvraag = res.uitvraag && (nieuw || !ev.uitvraag || !ev.status) && !['ingepland', 'concept'].includes(res.status);
    if (startUitvraag) { res.status = 'open'; res.herinnerd = false; }
    if (!res.uitvraag && res.status === 'open') res.status = null;
    const { id, ...patch } = res;
    if (nieuw) await Store.insert('zalen_events', res); else await Store.update('zalen_events', e.id, patch);
    await herlaad();
    if (startUitvraag) {
      for (const x of oudeDiensten) await Store.remove('diensten', x.id);
      const groep = G.uitvraagGroep(res, A.data);
      for (const m of groep) await A.melding(m.id, `🎉 Nieuw feest: ${res.naam} op ${A.datumLang(res.datum)} (${res.start}–${res.eind}). Kun je werken? Laat het weten vóór ${A.datumLang(res.uitvraag_tot)}.`);
      await herlaad(); opnieuw();
      A.toast(`Opgeslagen – ${groep.length} oproepkracht(en) hebben een melding gekregen`, 'ok');
      deelUitvraagWhatsApp(A.data.zalen_events.filter(x => x.status === 'open'));
      return;
    }
    if (res.status === 'open') {
      // uitvraag loopt nog: termijn of gegevens aangepast, verder niets plannen
      if (ev.uitvraag_tot !== res.uitvraag_tot) for (const m of G.uitvraagGroep(res, A.data).filter(m => !A.data.event_reacties.some(r => r.event_id === e.id && r.medewerker_id === m.id)))
        await A.melding(m.id, `De reactietermijn voor ${res.naam} (${A.datumLang(res.datum)}) is nu t/m ${A.datumLang(res.uitvraag_tot)}.`);
      await herlaad(); opnieuw(); A.toast('Opgeslagen', 'ok'); return;
    }
    const moetHerplannen = nieuw || ev.datum !== res.datum || ev.start !== res.start || ev.eind !== res.eind || JSON.stringify(ev.bezetting) !== JSON.stringify(res.bezetting);
    const maand = G.monthOf(res.datum);
    if (moetHerplannen && (A.rooster(maand) || oudeDiensten.length || ['ingepland', 'concept'].includes(res.status))) {
      const res2 = await herplanEvent(A.event(res.id), oudeDiensten);
      A.toast(`Opgeslagen – ${res2.n} dienst(en) ingepland${res2.open ? ', ' + res2.open + ' open' : ''}`, res2.open ? '' : 'ok');
    } else A.toast('Opgeslagen', 'ok');
    opnieuw();
  }

  // Ziet het personeel de diensten van dit feest al?
  const eventZichtbaar = ev => A.eventZichtbaar(ev);
  async function meldVoorEvent(ev, mwId, tekst) { if (mwId && eventZichtbaar(ev)) await A.melding(mwId, tekst); }

  // Plant de diensten voor één feest opnieuw; probeert dezelfde mensen te houden
  async function herplanEvent(ev, oude) {
    for (const x of oude) await Store.remove('diensten', x.id);
    await herlaad();
    const maand = G.monthOf(ev.datum);
    if (!A.rooster(maand) && !['ingepland', 'concept'].includes(ev.status)) {
      for (const x of oude) await meldVoorEvent(ev, x.medewerker_id, `Je dienst op ${A.datumLang(x.datum)} (${ev.naam}) is vervallen.`);
      return { n: 0, open: 0 };
    }
    const slots = G.eventSlots(ev);
    const ctx = G.context(A.data, A.data.diensten);
    const nieuw = [];
    const vrijeOude = oude.filter(x => x.medewerker_id);
    for (const s of slots) {
      const dienst = { id: Store.uuid(), maand, datum: s.datum, locatie: 'zalen', event_id: ev.id, start: s.start, eind: s.eind, functie: s.functie, medewerker_id: null, notitie: '' };
      const kand = G.kandidaten(ctx, dienst).filter(k => k.ok);
      // eerst iemand die er al stond met dezelfde functie
      const idx = vrijeOude.findIndex(o => o.functie === s.functie && kand.some(k => k.m.id === o.medewerker_id));
      if (idx >= 0) { dienst.medewerker_id = vrijeOude[idx].medewerker_id; vrijeOude.splice(idx, 1); }
      else if (kand.length) dienst.medewerker_id = kand[0].m.id;
      if (dienst.medewerker_id) G.registreer(ctx, dienst);
      nieuw.push(dienst);
    }
    await Store.insert('diensten', nieuw);
    const pub = eventZichtbaar(ev);
    if (pub) {
      const oudSet = new Set(oude.map(x => x.medewerker_id + x.start + x.eind));
      for (const x of nieuw.filter(x => x.medewerker_id && !oudSet.has(x.medewerker_id + x.start + x.eind)))
        await A.melding(x.medewerker_id, `Je bent ingepland voor ${ev.naam} op ${A.datumLang(x.datum)} van ${x.start} tot ${x.eind} (${x.functie}).`);
      for (const o of vrijeOude) await A.melding(o.medewerker_id, `Je dienst bij ${ev.naam} op ${A.datumLang(o.datum)} is vervallen.`);
    }
    await herlaad();
    return { n: nieuw.length, open: nieuw.filter(x => !x.medewerker_id).length };
  }

  // =====================================================================
  //  CAFETARIA
  // =====================================================================
  function pCafetaria() {
    const d = A.data, nu = G.today();
    const sl = d.sluitingsdagen.filter(s => s.datum >= G.addDays(nu, -1)).sort((a, b) => a.datum.localeCompare(b.datum));
    hoofd.innerHTML = `<div class="kop"><h1>Cafetaria</h1></div>
      <p class="zacht">Vaste diensten per weekdag. Dit is de basis voor elk nieuw rooster. Wijzigingen gelden voor roosters die je hierna maakt.</p>
      <div class="rij" style="grid-template-columns:repeat(auto-fill,minmax(270px,1fr));align-items:start">
      ${A.DAGEN.map((dag, wd) => { const ds = d.cafetaria_diensten.filter(c => +c.weekdag === wd).sort((a, b) => G.min(a.start) - G.min(b.start) || a.functie.localeCompare(b.functie));
        const uren = ds.reduce((s, c) => s + G.hours(c.start, c.eind) * c.aantal, 0);
        return `<div class="paneel" style="margin:0"><div class="paneel-kop"><h3 style="text-transform:capitalize">${dag}</h3><span class="zacht" style="font-size:.85rem">${ds.length ? A.uren(uren) + ' uur' : 'gesloten'}</span></div>
          ${ds.map(c => `<div class="item klik" data-c="${c.id}" style="cursor:pointer;padding:.5em 0"><b style="font-variant-numeric:tabular-nums">${esc(c.start)}–${esc(c.eind)}</b><span>${esc(c.functie)}</span><span class="rechts"><span class="label caf">${c.aantal}×</span></span></div>`).join('') || '<div class="zacht" style="padding:.5em 0">Gesloten</div>'}
          <div style="margin-top:.6em;display:flex;gap:.4em"><button class="knop klein" data-nieuw="${wd}">+ Dienst</button>${ds.length ? `<button class="knop klein plat" data-kopie="${wd}">Kopiëren naar…</button>` : ''}</div></div>`; }).join('')}
      </div>
      <div class="paneel" style="margin-top:1em"><div class="paneel-kop"><h3>Sluitingsdagen</h3><button class="knop klein" id="nieuwSluit">+ Dag toevoegen</button></div>
        <p class="zacht">Op deze dagen worden er geen cafetaria-diensten ingepland (feestdagen, vakantie, verbouwing).</p>
        ${sl.length ? sl.map(s => `<div class="item"><b>${esc(A.datumLang(s.datum))}</b><span class="zacht">${esc(s.reden || '')}</span><span class="rechts"><button class="icoon" data-sweg="${s.id}" title="Verwijderen">🗑</button></span></div>`).join('') : '<div class="leeg">Geen sluitingsdagen gepland</div>'}</div>`;
    hoofd.querySelectorAll('[data-c]').forEach(x => x.onclick = () => cafModal(d.cafetaria_diensten.find(c => c.id === x.dataset.c)));
    hoofd.querySelectorAll('[data-nieuw]').forEach(x => x.onclick = () => cafModal(null, +x.dataset.nieuw));
    hoofd.querySelectorAll('[data-kopie]').forEach(x => x.onclick = () => kopieerDag(+x.dataset.kopie));
    hoofd.querySelectorAll('[data-sweg]').forEach(x => x.onclick = async () => { await Store.remove('sluitingsdagen', x.dataset.sweg); await herlaad(); pCafetaria(); });
    $('#nieuwSluit').onclick = async () => {
      const res = await A.modal('Sluitingsdag toevoegen', `<div class="rij"><div class="veld"><label>Van</label><input type="date" id="sVan" value="${nu}"></div><div class="veld"><label>Tot en met</label><input type="date" id="sTot" value="${nu}"></div></div><div class="veld"><label>Reden</label><input id="sReden" placeholder="bv. Tweede Paasdag"></div>`,
        [{ label: 'Annuleren', waarde: null }, { label: 'Toevoegen', soort: 'primair', waarde: bg => ({ van: bg.querySelector('#sVan').value, tot: bg.querySelector('#sTot').value || bg.querySelector('#sVan').value, reden: bg.querySelector('#sReden').value }) }]);
      if (!res || !res.van) return;
      const rows = []; for (let x = res.van; x <= res.tot && rows.length < 120; x = G.addDays(x, 1)) rows.push({ datum: x, reden: res.reden });
      await Store.insert('sluitingsdagen', rows);
      // bestaande cafetaria-diensten op die dagen?
      const raak = A.data.diensten.filter(x => x.locatie === 'cafetaria' && x.datum >= res.van && x.datum <= res.tot);
      if (raak.length && await A.bevestig('Diensten verwijderen?', `Er staan al ${raak.length} cafetaria-diensten in het rooster op deze dag(en). Wil je die verwijderen?`, 'Verwijderen')) {
        for (const x of raak) { await Store.remove('diensten', x.id); await meldAlsGepubliceerd(x.maand, x.medewerker_id, `Je dienst op ${A.datumLang(x.datum)} vervalt: de cafetaria is gesloten${res.reden ? ' (' + res.reden + ')' : ''}.`); }
      }
      await herlaad(); pCafetaria();
    };
  }

  async function cafModal(c, wd) {
    const nieuw = !c;
    c = c || { weekdag: wd, start: '16:00', eind: '21:00', functie: (A.data.instellingen.functies || [])[0], aantal: 1 };
    const knoppen = [];
    if (!nieuw) knoppen.push({ label: 'Verwijderen', soort: 'gevaar', waarde: 'weg' });
    knoppen.push({ label: 'Annuleren', waarde: null }, { label: 'Opslaan', soort: 'primair', waarde: bg => ({ weekdag: +bg.querySelector('#cDag').value, start: bg.querySelector('#cStart').value, eind: bg.querySelector('#cEind').value, functie: bg.querySelector('#cFn').value, aantal: +bg.querySelector('#cAantal').value || 1 }) });
    const res = await A.modal(nieuw ? 'Vaste dienst toevoegen' : 'Vaste dienst', `
      <div class="rij"><div class="veld"><label>Dag</label><select id="cDag">${A.DAGEN.map((d, i) => `<option value="${i}" ${i === +c.weekdag ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="veld"><label>Functie</label><select id="cFn">${functieOpties(c.functie)}</select></div></div>
      <div class="rij"><div class="veld"><label>Van</label><input type="time" id="cStart" value="${esc(c.start)}"></div><div class="veld"><label>Tot</label><input type="time" id="cEind" value="${esc(c.eind)}"></div>
        <div class="veld"><label>Aantal mensen</label><input type="number" min="1" id="cAantal" value="${esc(c.aantal)}"></div></div>`, knoppen);
    if (!res) return;
    if (res === 'weg') await Store.remove('cafetaria_diensten', c.id);
    else if (nieuw) await Store.insert('cafetaria_diensten', res);
    else await Store.update('cafetaria_diensten', c.id, res);
    await herlaad(); pCafetaria(); hintOpnieuw();
  }

  async function kopieerDag(wd) {
    const res = await A.modal('Kopiëren naar andere dagen', `<p>De diensten van <b>${A.DAGEN[wd]}</b> kopiëren naar (bestaande diensten op die dagen worden vervangen):</p>
      <div class="chips">${A.DAGEN.map((d, i) => i === wd ? '' : `<label class="chip-keuze"><input type="checkbox" value="${i}"><span>${d}</span></label>`).join('')}</div>`,
      [{ label: 'Annuleren', waarde: null }, { label: 'Kopiëren', soort: 'primair', waarde: bg => [...bg.querySelectorAll('input:checked')].map(i => +i.value) }]);
    if (!res || !res.length) return;
    const bron = A.data.cafetaria_diensten.filter(c => +c.weekdag === wd);
    for (const doel of res) {
      for (const c of A.data.cafetaria_diensten.filter(c => +c.weekdag === doel)) await Store.remove('cafetaria_diensten', c.id);
      await Store.insert('cafetaria_diensten', bron.map(c => ({ weekdag: doel, start: c.start, eind: c.eind, functie: c.functie, aantal: c.aantal })));
    }
    await herlaad(); pCafetaria(); hintOpnieuw();
  }
  function hintOpnieuw() {
    const concept = A.data.roosters.find(r => r.status === 'concept');
    A.toast(concept ? 'Opgeslagen. Maak het concept van ' + A.maandNaam(concept.maand) + ' opnieuw om dit mee te nemen.' : 'Opgeslagen', 'ok');
  }

  // =====================================================================
  //  PERSONEEL
  // =====================================================================
  function pPersoneel() {
    const alle = A.data.medewerkers.slice().sort((a, b) => (b.actief !== false) - (a.actief !== false) || a.naam.localeCompare(b.naam));
    const maand = G.monthOf(G.today());
    hoofd.innerHTML = `<div class="kop"><h1>Personeel</h1><div class="acties"><button class="knop" id="mwPoster" type="button">🖨 QR-poster</button><button class="knop" id="mwBericht" type="button">🔔 Bericht aan personeel</button><button class="knop primair" id="nieuwMw">+ Medewerker</button></div></div>
      <div class="paneel"><div class="tabel-wrap"><table class="lijst"><thead><tr><th>Naam</th><th>Functies</th><th>Werkt in</th><th>Uren p/w</th><th>Vaste dagen</th><th>Nooit op</th><th>Deze maand</th><th></th></tr></thead><tbody>
      ${alle.map(m => `<tr class="klik" data-mw="${m.id}" style="${m.actief === false ? 'opacity:.5' : ''}">
        <td><div style="display:flex;align-items:center;gap:.6em">${avatar(m)}<div><b>${esc(m.naam)}</b>${m.actief === false ? (/^inhuur/i.test(m.notitie || '') ? ' <span class="label let">inhuur</span>' : ' <span class="label">uit dienst</span>') : ''}<br><small class="zacht">${esc(m.telefoon || '')}</small></div></div></td>
        <td>${(m.functies || []).map(f => `<span class="label">${esc(f)}</span>`).join(' ')}</td>
        <td>${(m.locaties || []).map(locLabel).join(' ')}</td>
        <td>${+m.contracturen ? A.uren(+m.contracturen) : '<span class="label">oproep</span>'}</td>
        <td>${(m.vaste_dagen || []).map(i => A.DAG_KORT[i]).join(', ') || '–'}</td>
        <td>${(m.vrije_dagen || []).map(i => A.DAG_KORT[i]).join(', ') || '–'}</td>
        <td>${A.uren(urenVan(m.id, maand))} u</td>
        <td>${m.actief !== false ? `<button class="knop klein" type="button" data-uitnodig="${m.id}">📲 Uitnodigen</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${alle.length ? '' : '<div class="leeg"><span class="groot">👥</span>Nog geen personeel. Voeg je eerste medewerker toe.</div>'}</div>`;
    $('#nieuwMw').onclick = () => mwModal(null);
    $('#mwBericht').onclick = () => berichtAanPersoneel();
    $('#mwPoster').onclick = () => posterPrinten();
    hoofd.querySelectorAll('[data-uitnodig]').forEach(b => b.onclick = e => { e.stopPropagation(); uitnodigen(A.mw(b.dataset.uitnodig)); });
    hoofd.querySelectorAll('[data-mw]').forEach(r => r.onclick = () => mwModal(A.mw(r.dataset.mw)));
  }


  // =====================================================================
  //  Uitnodigen: WhatsApp, QR-code, persoonlijk kaartje en poster
  // =====================================================================
  const bedrijfNaam = () => A.data.instellingen.bedrijfsnaam || 'ons bedrijf';
  // Persoonlijke link: op de personeelspagina staat de naam dan al klaar, alleen de PIN nog invullen
  const persoonlijkeLink = m => { const u = siteUrl(); return u + (u.includes('?') ? '&' : '?') + 'm=' + encodeURIComponent(m.id); };
  const basisUrl = () => siteUrl().replace(/[^/]*([?#].*)?$/, '');
  function qrSvg(tekst, px) {
    const q = qrcode(0, 'M'); q.addData(tekst); q.make();
    const n = q.getModuleCount(), r = 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + r} ${y + r}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * r} ${n + 2 * r}" width="${px}" height="${px}" shape-rendering="crispEdges" style="display:block;max-width:100%;height:auto"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  const waNummer = tel => { let t = (tel || '').replace(/\D/g, ''); if (t.startsWith('00')) t = t.slice(2); else if (t.startsWith('0')) t = '31' + t.slice(1); return t; };
  const uitnodigingTekst = m => `Hoi ${m.naam}! 👋\nVanaf nu staat het rooster van ${bedrijfNaam()} in een app.\n\n1️⃣ Open deze link: ${persoonlijkeLink(m)}\n2️⃣ Log in met je code: *${m.pin}*\n3️⃣ Zet de app op je beginscherm en zet de meldingen aan, dan mis je niets.\n\n📱 iPhone: open de link in Safari, tik op Deel (vierkantje met pijltje) en kies "Zet op beginscherm".\n📱 Android: tik op "App installeren" in de app.\n\nHier zie je je diensten, vraag je vrij en kun je ruilen.`;

  async function kopieer(tekst) {
    try { await navigator.clipboard.writeText(tekst); }
    catch (e) { const t = document.createElement('textarea'); t.value = tekst; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    A.toast('Gekopieerd', 'ok');
  }

  function uitnodigen(m, nieuw) {
    const nr = waNummer(m.telefoon);
    const html = `${nieuw ? `<p><b>${esc(m.naam)}</b> is toegevoegd. Stuur nu de uitnodiging, of laat de QR-code scannen.</p>` : ''}
      <div class="uitnodig">
        <div class="uitnodig-qr">${qrSvg(persoonlijkeLink(m), 220)}<small class="zacht">Scannen met de camera van de telefoon</small></div>
        <div class="uitnodig-info">
          <div class="zacht" style="font-size:.85rem">Inlogcode van ${esc(m.naam)}</div>
          <div class="uitnodig-pin">${esc(m.pin)}</div>
          <p class="zacht" style="font-size:.85rem;margin:.2em 0 1em">Via de QR-code of de link staat de naam al klaar; alleen de code nog invullen.</p>
          <div class="uitnodig-knoppen">
            <button class="knop ok" type="button" id="uWa">💬 WhatsApp${nr ? ' naar ' + esc(m.naam) : ''}</button>
            <button class="knop" type="button" id="uKopieer">📋 Tekst kopiëren</button>
            <button class="knop" type="button" id="uPrint">🖨 Kaartje printen</button>
          </div>
          ${nr ? '' : '<p class="zacht" style="font-size:.8rem;margin:.6em 0 0">Geen telefoonnummer ingevuld: in WhatsApp kies je zelf naar wie.</p>'}
        </div>
      </div>`;
    A.modal('Uitnodigen: ' + m.naam, html, [{ label: 'Sluiten', waarde: null }], bg => {
      bg.querySelector('#uWa').onclick = () => window.open(`https://wa.me/${nr}?text=` + encodeURIComponent(uitnodigingTekst(m)), '_blank');
      bg.querySelector('#uKopieer').onclick = () => kopieer(uitnodigingTekst(m));
      bg.querySelector('#uPrint').onclick = () => kaartjePrinten(m);
    });
  }

  function printVenster(titel, inhoud) {
    const w = window.open('', '_blank');
    if (!w) return A.toast('Pop-up geblokkeerd: sta pop-ups toe voor deze pagina', 'fout');
    w.document.write(`<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>${esc(titel)}</title><base href="${esc(basisUrl())}">
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #2a2118; margin: 0; text-align: center; }
        .logo { height: 34mm; margin: 4mm auto 6mm; display: block; }
        h1 { font-size: 30pt; margin: 0 0 3mm; }
        .sub { font-size: 15pt; color: #6b5e50; margin: 0 0 8mm; }
        .qr { width: 95mm; margin: 0 auto 8mm; padding: 4mm; border: 2px solid #e8dccb; border-radius: 6mm; }
        .stappen { text-align: left; max-width: 150mm; margin: 0 auto; font-size: 14pt; line-height: 1.45; padding: 0; list-style: none; counter-reset: s; }
        .stappen li { counter-increment: s; position: relative; padding-left: 13mm; margin-bottom: 4mm; }
        .stappen li::before { content: counter(s); position: absolute; left: 0; top: -1mm; width: 9mm; height: 9mm; border-radius: 50%; background: #e07a2f; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .klein { font-size: 11pt; color: #6b5e50; }
        .kaart { width: 120mm; margin: 10mm auto; border: 2px dashed #c9b8a2; border-radius: 6mm; padding: 8mm; }
        .kaart .logo { height: 20mm; margin: 0 auto 4mm; }
        .kaart .qr { width: 60mm; margin-bottom: 5mm; }
        .pin { font-size: 30pt; font-weight: 800; letter-spacing: .15em; margin: 1mm 0 4mm; }
        .url { font-size: 9.5pt; color: #6b5e50; word-break: break-all; }
        .knop { margin: 6mm; padding: 3mm 7mm; font-size: 12pt; border-radius: 3mm; border: 0; background: #e07a2f; color: #fff; cursor: pointer; }
        @media print { .knop { display: none; } }
      </style></head><body>${inhoud}<button class="knop" onclick="print()">🖨 Printen</button>
      <script>window.onload = () => setTimeout(() => print(), 300);<\/script></body></html>`);
    w.document.close();
  }

  function kaartjePrinten(m) {
    printVenster('Uitnodiging ' + m.naam, `<div class="kaart">
      <img class="logo" src="logo-licht.svg" alt="">
      <h1 style="font-size:20pt">Hoi ${esc(m.naam)}!</h1>
      <p class="klein" style="margin:0 0 5mm">Je rooster staat vanaf nu in de app. Scan de code met de camera van je telefoon.</p>
      <div class="qr">${qrSvg(persoonlijkeLink(m), 400)}</div>
      <div class="klein">Jouw inlogcode</div>
      <div class="pin">${esc(m.pin)}</div>
      <p class="klein" style="margin:0 0 3mm">Zet de app daarna op je beginscherm en zet de meldingen aan.<br>Bewaar je code goed en deel hem met niemand.</p>
      <div class="url">${esc(siteUrl())}</div></div>`);
  }

  function posterPrinten() {
    const baas = A.data.instellingen.beheer_naam || 'de baas';
    printVenster('QR-poster rooster', `
      <img class="logo" src="logo-licht.svg" alt="">
      <h1>📅 Ons rooster staat online</h1>
      <p class="sub">Je diensten bekijken, vrij vragen en ruilen: alles in de app</p>
      <div class="qr">${qrSvg(siteUrl(), 600)}</div>
      <ol class="stappen">
        <li><b>Scan de code</b> met de camera van je telefoon.</li>
        <li><b>Tik op je naam</b> en vul je inlogcode in. Geen code? Vraag hem aan ${esc(baas)}.</li>
        <li><b>Zet de app op je beginscherm.</b><br><span class="klein">iPhone: in Safari op Deel (vierkantje met pijltje) → "Zet op beginscherm". Android: tik op "App installeren".</span></li>
        <li><b>Zet de meldingen aan</b>, dan hoor je het meteen als het rooster klaar is of als iemand wil ruilen.</li>
      </ol>
      <p class="url" style="margin-top:6mm">${esc(siteUrl())}</p>`);
  }

  // Opslaan; bestaat de kolom liever_niet_dagen nog niet in Supabase, dan zonder die kolom
  async function mwOpslaan(id, rij) {
    const doe = r => id ? Store.update('medewerkers', id, r) : Store.insert('medewerkers', r);
    try { return await doe(rij); }
    catch (x) {
      if (!/liever_niet_dagen/.test(x.message)) throw x;
      const r = { ...rij }; delete r.liever_niet_dagen;
      A.toast('Opgeslagen, behalve "liever niet": voer eerst 4-planner.sql uit in Supabase', 'fout');
      return await doe(r);
    }
  }

  async function mwModal(m) {
    const nieuw = !m;
    const kleuren = ['#e07a2f', '#2f7ae0', '#c0398a', '#2e9e6a', '#8a5cd6', '#d6a01e', '#1ea7b8', '#d64545', '#4b7f2a', '#7a6a58'];
    m = m || { naam: '', pin: String(Math.floor(1000 + Math.random() * 9000)), telefoon: '', email: '', functies: [], locaties: ['cafetaria', 'zalen'], contracturen: 0, vaste_dagen: [], vrije_dagen: [], max_dagen_week: 5, kleur: kleuren[A.data.medewerkers.length % kleuren.length], actief: true, notitie: '' };
    const chips = (naam, opties, geselecteerd, rood) => `<div class="chips">${opties.map(([v, l]) => `<label class="chip-keuze ${rood ? 'rood' : ''}"><input type="checkbox" name="${naam}" value="${esc(v)}" ${(geselecteerd || []).map(String).includes(String(v)) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
    const dagOpties = A.DAG_KORT.map((d, i) => [i, d]);
    const html = `
      <div class="rij"><div class="veld"><label>Naam</label><input id="mNaam" value="${esc(m.naam)}"></div><div class="veld"><label>Inlogcode (PIN)</label><input id="mPin" value="${esc(m.pin)}" inputmode="numeric" maxlength="6"></div></div>
      <div class="rij"><div class="veld"><label>Telefoon</label><input id="mTel" value="${esc(m.telefoon || '')}"></div><div class="veld"><label>E-mail</label><input id="mMail" value="${esc(m.email || '')}"></div></div>
      <div class="veld"><label>Functies</label>${chips('fn', (A.data.instellingen.functies || []).map(f => [f, f]), m.functies)}</div>
      <div class="veld"><label>Werkt in</label>${chips('loc', [['cafetaria', 'Cafetaria'], ['zalen', 'Zalencentrum']], m.locaties)}</div>
      <div class="rij"><div class="veld"><label>Contracturen per week <small>(0 = oproepkracht)</small></label><input type="number" min="0" step="0.5" id="mUren" value="${esc(m.contracturen)}"></div>
        <div class="veld"><label>Max. dagen per week</label><input type="number" min="1" max="7" id="mMax" value="${esc(m.max_dagen_week || 5)}"></div></div>
      <div class="veld"><label>Vaste werkdagen <small>(krijgt voorrang op deze dagen)</small></label>${chips('vast', dagOpties, m.vaste_dagen)}</div>
      <div class="veld"><label>Liever niet op <small>(alleen als het echt nodig is)</small></label>${chips('liever', dagOpties, m.liever_niet_dagen)}</div>
      <div class="veld"><label>Kan nooit op <small>(wordt dan nooit ingepland)</small></label>${chips('vrij', dagOpties, m.vrije_dagen, true)}</div>
      <div class="rij"><div class="veld"><label>Kleur in rooster</label><input type="color" id="mKleur" value="${esc(m.kleur)}" style="height:40px;padding:2px"></div>
        <div class="veld"><label>&nbsp;</label><label class="check"><input type="checkbox" id="mActief" ${m.actief !== false ? 'checked' : ''}> In dienst</label></div></div>
      <div class="veld"><label>Notitie <small>(alleen zichtbaar voor beheer)</small></label><textarea id="mNot">${esc(m.notitie || '')}</textarea></div>`;
    const knoppen = [];
    if (!nieuw) knoppen.push({ label: 'Verwijderen', soort: 'gevaar', waarde: 'weg' }, { label: '📲 Uitnodigen', waarde: 'uitnodigen' });
    knoppen.push({ label: 'Annuleren', waarde: null }, {
      label: 'Opslaan', soort: 'primair',
      controle: bg => {
        if (!bg.querySelector('#mNaam').value.trim()) return 'Vul een naam in';
        const pin = bg.querySelector('#mPin').value.trim();
        if (!/^\d{4,6}$/.test(pin)) return 'PIN moet 4 tot 6 cijfers zijn';
        if (A.data.medewerkers.some(x => x.id !== m.id && x.pin === pin && x.naam.toLowerCase() === bg.querySelector('#mNaam').value.trim().toLowerCase())) return 'Deze naam met deze PIN bestaat al';
        if (!bg.querySelectorAll('input[name=fn]:checked').length) return 'Kies minstens één functie';
        return null;
      },
      waarde: bg => {
        const val = n => [...bg.querySelectorAll(`input[name=${n}]:checked`)].map(i => i.value);
        return { naam: bg.querySelector('#mNaam').value.trim(), pin: bg.querySelector('#mPin').value.trim(), telefoon: bg.querySelector('#mTel').value, email: bg.querySelector('#mMail').value, functies: val('fn'), locaties: val('loc'), contracturen: +bg.querySelector('#mUren').value || 0, max_dagen_week: +bg.querySelector('#mMax').value || 5, vaste_dagen: val('vast').map(Number), liever_niet_dagen: val('liever').map(Number), vrije_dagen: val('vrij').map(Number), kleur: bg.querySelector('#mKleur').value, actief: bg.querySelector('#mActief').checked, notitie: bg.querySelector('#mNot').value };
      }
    });
    const res = await A.modal(nieuw ? 'Nieuwe medewerker' : m.naam, html, knoppen);
    if (!res) return;
    if (res === 'uitnodigen') return uitnodigen(m);
    if (res === 'weg') {
      const toekomst = A.data.diensten.filter(x => x.medewerker_id === m.id && x.datum >= G.today());
      if (!await A.bevestig('Verwijderen', `${m.naam} wordt verwijderd.${toekomst.length ? ` ${toekomst.length} toekomstige dienst(en) worden open gezet.` : ''} Tip: zet iemand liever op "uit dienst", dan blijft de geschiedenis bewaard.`, 'Verwijderen')) return;
      for (const x of toekomst) await Store.update('diensten', x.id, { medewerker_id: null });
      await Store.remove('medewerkers', m.id);
    } else if (nieuw) {
      const opgeslagen = await mwOpslaan(null, res);
      await herlaad();
      const nw = A.mw((opgeslagen && opgeslagen[0] && opgeslagen[0].id) || res.id) || A.data.medewerkers.find(x => x.naam === res.naam && x.pin === res.pin);
      if (nw) uitnodigen(nw, true);
    } else {
      await mwOpslaan(m.id, res);
      if (m.actief !== false && res.actief === false) {
        const toekomst = A.data.diensten.filter(x => x.medewerker_id === m.id && x.datum >= G.today());
        if (toekomst.length && await A.bevestig('Toekomstige diensten', `${m.naam} staat nog ${toekomst.length}× ingepland. Die diensten open zetten?`, 'Open zetten'))
          for (const x of toekomst) await Store.update('diensten', x.id, { medewerker_id: null });
      }
    }
    await herlaad(); pPersoneel();
  }

  // =====================================================================
  //  PRIKBORD
  // =====================================================================
  // =====================================================================
  //  BERICHT AAN PERSONEEL (pushmelding naar een gekozen groep)
  // =====================================================================
  async function berichtAanPersoneel() {
    const mws = actieveMw(), fns = A.data.instellingen.functies || [], nu = G.today();
    const chip = (naam, v, l, aan) => `<label class="chip-keuze"><input type="checkbox" name="${naam}" value="${esc(v)}" ${aan ? 'checked' : ''}><span>${esc(l)}</span></label>`;
    const html = `
      <div class="veld"><label>Naar wie?</label>
        <select id="bWie">
          <option value="alle">Iedereen in dienst</option>
          <option value="oproep">Alleen oproepkrachten</option>
          <option value="vast">Alleen vast personeel (met contracturen)</option>
          <option value="functie">Per functie…</option>
          <option value="locatie">Per locatie…</option>
          <option value="dag">Wie werkt op een bepaalde dag…</option>
          <option value="zelf">Zelf kiezen…</option>
        </select></div>
      <div class="veld b-extra" data-voor="functie"><div class="chips">${fns.map(f => chip('bFn', f, f)).join('')}</div></div>
      <div class="veld b-extra" data-voor="locatie"><div class="chips">${chip('bLoc', 'cafetaria', 'Cafetaria')}${chip('bLoc', 'zalen', 'Zalencentrum')}</div></div>
      <div class="veld b-extra" data-voor="dag"><input type="date" id="bDag" value="${nu}" style="max-width:200px"></div>
      <div class="veld b-extra" data-voor="zelf"><div class="chips">${mws.map(m => chip('bMw', m.id, m.naam)).join('')}</div></div>
      <div class="b-ontvangers" id="bOntv"></div>
      <div class="veld"><label>Titel <small>(vet bovenaan de melding)</small></label><input id="bTitel" maxlength="60" placeholder="${esc(A.data.instellingen.bedrijfsnaam || 'Rooster')}"></div>
      <div class="veld"><label>Bericht</label><textarea id="bTekst" rows="4" maxlength="500" placeholder="bv. Zaterdag beginnen we een half uur eerder i.v.m. de bruiloft."></textarea><small class="zacht" id="bTeller">0 / 500</small></div>
      <label class="check"><input type="checkbox" id="bPrik"> Ook op het prikbord zetten</label>`;
    const ontvangers = bg => {
      const wie = bg.querySelector('#bWie').value;
      const aan = n => [...bg.querySelectorAll(`input[name=${n}]:checked`)].map(i => i.value);
      if (wie === 'alle') return mws;
      if (wie === 'oproep') return mws.filter(G.isOproep);
      if (wie === 'vast') return mws.filter(m => !G.isOproep(m));
      if (wie === 'functie') { const f = aan('bFn'); return mws.filter(m => (m.functies || []).some(x => f.includes(x))); }
      if (wie === 'locatie') { const l = aan('bLoc'); return mws.filter(m => (m.locaties || []).some(x => l.includes(x))); }
      if (wie === 'dag') { const d = bg.querySelector('#bDag').value; const ids = new Set(A.data.diensten.filter(x => x.datum === d && x.medewerker_id && A.dienstZichtbaar(x)).map(x => x.medewerker_id)); return mws.filter(m => ids.has(m.id)); }
      const ids = aan('bMw'); return mws.filter(m => ids.includes(m.id));
    };
    const res = await A.modal('🔔 Bericht aan personeel', html, [{ label: 'Annuleren', waarde: null }, {
      label: 'Versturen', soort: 'primair',
      controle: bg => !bg.querySelector('#bTekst').value.trim() ? 'Schrijf eerst een bericht' : !ontvangers(bg).length ? 'Er is niemand gekozen' : null,
      waarde: bg => ({ naar: ontvangers(bg), titel: bg.querySelector('#bTitel').value.trim(), tekst: bg.querySelector('#bTekst').value.trim(), prik: bg.querySelector('#bPrik').checked })
    }], bg => {
      const ververs = () => {
        const wie = bg.querySelector('#bWie').value;
        bg.querySelectorAll('.b-extra').forEach(x => x.style.display = x.dataset.voor === wie ? '' : 'none');
        const lijst = ontvangers(bg);
        bg.querySelector('#bOntv').innerHTML = lijst.length
          ? `<b>Gaat naar ${lijst.length} ${lijst.length === 1 ? 'persoon' : 'mensen'}:</b> <span class="zacht">${lijst.map(m => esc(m.naam)).join(', ')}</span>`
          : '<span style="color:var(--fout)">Nog niemand gekozen</span>';
      };
      bg.querySelectorAll('#bWie, input[name], #bDag').forEach(i => i.addEventListener('change', ververs));
      bg.querySelector('#bTekst').addEventListener('input', e => { bg.querySelector('#bTeller').textContent = e.target.value.length + ' / 500'; });
      ververs();
    });
    if (!res) return;
    const ok = await A.bezig(null, async () => {
      for (const m of res.naar) await A.melding(m.id, res.tekst, { titel: res.titel || undefined });
      if (res.prik) await Store.insert('berichten', { titel: res.titel || 'Mededeling', tekst: res.tekst, belangrijk: false, geplaatst: new Date().toISOString() });
      await herlaad();
      return true;
    });
    if (!ok) return;
    A.toast(`Bericht verstuurd naar ${res.naar.length} ${res.naar.length === 1 ? 'persoon' : 'mensen'}`, 'ok');
    if (res.prik && (location.hash || '').startsWith('#prikbord')) pPrikbord();
  }

  function pPrikbord() {
    const b = A.data.berichten.slice().sort((a, b) => (b.geplaatst || '').localeCompare(a.geplaatst || ''));
    hoofd.innerHTML = `<div class="kop"><h1>Prikbord</h1><div class="acties"><button class="knop" id="pbPush" type="button">🔔 Pushbericht sturen</button><button class="knop primair" id="nieuwBericht">+ Bericht</button></div></div>
      <p class="zacht">Mededelingen die het personeel bovenaan hun pagina ziet.</p>
      <div class="paneel">${b.length ? b.map(x => `<div class="bericht ${x.belangrijk ? 'belangrijk' : ''}"><div style="display:flex;gap:.5em;align-items:start"><div style="flex:1"><h4>${x.belangrijk ? '📣 ' : ''}${esc(x.titel)}</h4><p style="white-space:pre-wrap;margin:0 0 .2em">${esc(x.tekst)}</p><small class="zacht">${A.tijdGeleden(x.geplaatst)}</small></div><button class="icoon" data-bw="${x.id}">✏️</button></div></div>`).join('') : '<div class="leeg"><span class="groot">📌</span>Nog geen berichten</div>'}</div>`;
    $('#nieuwBericht').onclick = () => berichtModal(null);
    $('#pbPush').onclick = () => berichtAanPersoneel();
    hoofd.querySelectorAll('[data-bw]').forEach(x => x.onclick = () => berichtModal(A.data.berichten.find(y => y.id === x.dataset.bw)));
  }
  async function berichtModal(b) {
    const nieuw = !b; b = b || { titel: '', tekst: '', belangrijk: false };
    const knoppen = nieuw ? [] : [{ label: 'Verwijderen', soort: 'gevaar', waarde: 'weg' }];
    knoppen.push({ label: 'Annuleren', waarde: null }, { label: nieuw ? 'Plaatsen' : 'Opslaan', soort: 'primair', controle: bg => !bg.querySelector('#bTitel').value.trim() ? 'Vul een titel in' : null, waarde: bg => ({ titel: bg.querySelector('#bTitel').value.trim(), tekst: bg.querySelector('#bTekst').value, belangrijk: bg.querySelector('#bBel').checked }) });
    const res = await A.modal(nieuw ? 'Nieuw bericht' : 'Bericht bewerken', `<div class="veld"><label>Titel</label><input id="bTitel" value="${esc(b.titel)}"></div><div class="veld"><label>Tekst</label><textarea id="bTekst" rows="5">${esc(b.tekst)}</textarea></div><label class="check"><input type="checkbox" id="bBel" ${b.belangrijk ? 'checked' : ''}> Belangrijk (valt extra op)</label>`, knoppen);
    if (!res) return;
    if (res === 'weg') await Store.remove('berichten', b.id);
    else if (nieuw) { await Store.insert('berichten', { ...res, geplaatst: new Date().toISOString() }); for (const m of actieveMw()) await A.melding(m.id, '📌 Nieuw op het prikbord: ' + res.titel); }
    else await Store.update('berichten', b.id, res);
    await herlaad(); pPrikbord();
  }

  // =====================================================================
  //  INSTELLINGEN
  // =====================================================================
  const regelRij = r => `<div class="regel-rij"><select class="rFn">${functieOpties(r.functie)}</select>
      <input type="number" class="rPer" min="0" value="${esc(+r.per || 0)}" title="1 persoon per zoveel gasten (0 = vast aantal)">
      <input type="number" class="rMin" min="0" value="${esc(+r.min || 0)}" title="minimaal">
      <input type="number" class="rMax" min="0" value="${esc(+r.max || 0)}" title="maximaal (0 = geen maximum)">
      <button class="icoon rWeg" type="button" title="Verwijderen">✕</button></div>`;
  const leesRegels = () => [...hoofd.querySelectorAll('.regel-rij')].map(r => ({ functie: r.querySelector('.rFn').value, per: +r.querySelector('.rPer').value || 0, min: +r.querySelector('.rMin').value || 0, max: +r.querySelector('.rMax').value || 0 })).filter(r => r.functie && (r.per || r.min));

  // ---------- slim plannen ----------
  const GEWICHT_OPTIES = [[0, 'Uit'], [0.5, 'Minder belangrijk'], [1, 'Normaal'], [2, 'Belangrijk'], [4, 'Heel belangrijk']];
  function plannerPaneel(s) {
    const P = G.plannerInst({ instellingen: s });
    const sel = (k, w) => `<select data-gewicht="${k}">${GEWICHT_OPTIES.map(([v, l]) => `<option value="${v}" ${+w === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="paneel"><h3>🧠 Slim plannen</h3>
      <p class="zacht" style="font-size:.9rem">De planner probeert duizenden roosters en kiest het rooster dat het best scoort op de punten hieronder.
        Wat nooit mag (verkeerde functie, vrij, ziek, "kan niet", al aan het werk, max. dagen per week) gebeurt nooit, wat je hier ook kiest.</p>
      <div class="rij"><div class="veld"><label>Liefst niet meer dan … dagen achter elkaar</label><input type="number" min="2" max="14" id="iReeks" value="${esc(P.max_achter_elkaar)}"></div>
        <div class="veld"><label>Minimaal … uur rust tussen twee diensten</label><input type="number" min="0" max="24" step="0.5" id="iRust" value="${esc(P.min_rust)}"></div></div>
      <div class="planner-punten">${G.PLANNER_PUNTEN.map(([k, l]) => `<div class="planner-punt"><span>${esc(l)}</span>${sel(k, P.w[k])}</div>`).join('')}</div>
      <button class="knop klein" type="button" id="iPlannerStd" style="margin-top:.8em">Alles op normaal</button></div>`;
  }
  function leesPlanner() {
    const gewichten = {};
    hoofd.querySelectorAll('[data-gewicht]').forEach(x => gewichten[x.dataset.gewicht] = +x.value);
    return { max_achter_elkaar: +$('#iReeks').value || 5, min_rust: $('#iRust').value === '' ? 11 : +$('#iRust').value, gewichten };
  }

  function pInstellingen() {
    const s = A.data.instellingen;
    hoofd.innerHTML = `<div class="kop"><h1>Instellingen</h1></div>
      <div class="paneel"><h3>Algemeen</h3>
        <div class="rij"><div class="veld"><label>Naam bedrijf</label><input id="iNaam" value="${esc(s.bedrijfsnaam)}"></div><div class="veld"><label>Beheercode</label><input id="iPin" value="${esc(s.admin_pin)}"></div></div>
        <div class="rij"><div class="veld"><label>Wie belt personeel bij ziekte?</label><input id="iBNaam" value="${esc(s.beheer_naam || '')}" placeholder="bv. Ricardo"></div><div class="veld"><label>Telefoonnummer voor ziekmeldingen</label><input id="iBTel" value="${esc(s.beheer_telefoon || '')}" placeholder="06-…" inputmode="tel"></div></div>
        <div class="veld"><label>Adres van de personeelspagina <small>(voor WhatsApp-berichten; leeg = automatisch)</small></label><input id="iUrl" value="${esc(s.site_url || '')}" placeholder="${esc(siteUrl())}"></div>
      </div>
      <div class="paneel"><h3>Functies</h3><p class="zacht">De taken die mensen kunnen doen.</p>
        <div class="chips" id="iFuncties">${(s.functies || []).map(f => `<span class="label" style="font-size:.88rem;padding:.35em .5em .35em .8em">${esc(f)} <button class="icoon" data-fweg="${esc(f)}" style="font-size:.8rem;padding:0 .3em">✕</button></span>`).join('')}</div>
        <div style="display:flex;gap:.5em;margin-top:.8em;max-width:360px"><input id="iNieuwFn" placeholder="Nieuwe functie, bv. Gastvrouw"><button class="knop" id="iFnToev">Toevoegen</button></div></div>
      <div class="paneel"><h3>Automatisch rooster</h3>
        <div class="rij"><div class="veld"><label>Nieuw rooster maken … dagen voor het einde van de maand</label><input type="number" min="1" max="28" id="iDagen" value="${esc(s.dagen_voor_einde)}"></div>
          <div class="veld"><label>Personeel kan tot dag … van de maand doorgeven wanneer ze volgende maand niet kunnen</label><input type="number" min="1" max="31" id="iSlot" value="${esc(s.beschikbaarheid_slot || 25)}"></div></div>
        <div class="rij"><div class="veld"><label>Oproepkrachten krijgen … dagen om te reageren op nieuwe feesten</label><input type="number" min="1" max="30" id="iUitvraag" value="${esc(s.uitvraag_dagen || 7)}"></div>
          <div class="veld"></div></div>
        <h4 style="margin:.6em 0 .3em">Cafetaria in stappen <small class="zacht">(aantal dagen vóór het definitieve rooster)</small></h4>
        <div class="rij">
          <div class="veld"><label>1. Voorlopig rooster vaste krachten</label><input type="number" min="1" max="40" id="iCafR1" value="${esc(s.caf_ronde1_dagen != null && s.caf_ronde1_dagen !== '' ? s.caf_ronde1_dagen : 21)}"></div>
          <div class="veld"><label>2. Extra's toekennen, rest naar oproepkrachten <small>(0 = stappen uit)</small></label><input type="number" min="0" max="28" id="iCafDagen" value="${esc(Uitvraag.cafDagen({ instellingen: s }))}"></div>
          <div class="veld"><label>3. Oproepkrachten inplannen + herinnering</label><input type="number" min="0" max="14" id="iCafR3" value="${esc(s.caf_ronde3_dagen != null && s.caf_ronde3_dagen !== '' ? s.caf_ronde3_dagen : 2)}"></div></div>
        <p class="zacht" style="font-size:.85rem;margin-top:-.2em">Stap 1: mensen met contracturen of vaste werkdagen worden ingepland en zien hun diensten (grijs); bij Beschikbaar kunnen ze extra diensten kiezen. Stap 2: die extra's worden toegekend en de open diensten gaan ook naar de oproepkrachten met cafetaria. Stap 3: oproepkrachten die "Ik kan" zeiden worden ingepland en iedereen krijgt een herinnering voor wat nog open is. De reacties van de laatste dagen (na de herinnering) worden op de dag van het nieuwe rooster verdeeld; vaste krachten en oproepkrachten tellen dan gelijk.</p>
        <label class="check" style="margin-bottom:.6em"><input type="checkbox" id="iAuto" ${s.auto_publiceren ? 'checked' : ''}> Automatisch gemaakt rooster meteen versturen naar personeel (anders eerst zelf controleren)</label>
        <label class="check" style="margin-bottom:.6em"><input type="checkbox" id="iRuil" ${s.ruil_goedkeuring ? 'checked' : ''}> Ruilen van diensten eerst laten goedkeuren door beheer</label>
        <label class="check"><input type="checkbox" id="iFeestRuil" ${s.feest_ruil_goedkeuring ? 'checked' : ''}> Overnemen van een bevestigde feestplek (nog vóór het inplannen) eerst laten goedkeuren door beheer</label>
        <p class="zacht" style="margin-top:.8em;font-size:.88rem">Volgende automatische rooster: <b>${esc(A.maandNaam(G.nextMonth(G.monthOf(G.today()))))}</b> op <b>${esc(A.datumLang(G.generatieDatum(G.nextMonth(G.monthOf(G.today())), s.dagen_voor_einde)))}</b>. ${Store.modus === 'demo' ? 'In demo-modus gebeurt dit als je beheer opent.' : 'Dit gebeurt elke ochtend via GitHub Actions, en ook als je beheer opent.'}</p></div>
      ${plannerPaneel(s)}
      <div class="paneel"><h3>🎉 Standaard bezetting feesten</h3>
        <p class="zacht" style="font-size:.9rem">Hiermee wordt bij een nieuw feest voorgesteld hoeveel mensen er nodig zijn. Per feest kun je het daarna altijd nog aanpassen.
          Laat "1 per … gasten" op <b>0</b> staan voor een vast aantal.</p>
        <div class="regel-kop"><span>Functie</span><span>1 per … gasten</span><span>Minimaal</span><span>Maximaal</span><span></span></div>
        <div id="iRegels">${bezettingRegels().map(regelRij).join('')}</div>
        <button class="knop klein" id="iRegelToev" type="button">+ Functie</button>
        <p class="zacht" style="font-size:.88rem;margin:.8em 0 0" id="iRegelVb"></p></div>
      <div class="paneel" style="padding:0;border:0;background:none;box-shadow:none"><h3 style="margin:.2em 0 .6em">📲 App en meldingen op je telefoon</h3><div id="iPush"></div>
        <p class="zacht" style="font-size:.85rem;margin:.4em 0 0">Zet dit aan op elk apparaat waarop je meldingen wilt krijgen. Het personeel zet het zelf aan op hun eigen telefoon (knop op de personeelspagina en onder het belletje).</p></div>
      <div style="display:flex;gap:.5em;flex-wrap:wrap"><button class="knop primair" id="iOpslaan">Opslaan</button><button class="knop" id="iBackup">⬇ Back-up downloaden</button></div>`;
    hoofd.querySelectorAll('[data-fweg]').forEach(b => b.onclick = async () => {
      const f = b.dataset.fweg;
      const gebruikt = A.data.medewerkers.filter(m => (m.functies || []).includes(f)).length + A.data.cafetaria_diensten.filter(c => c.functie === f).length;
      if (gebruikt && !await A.bevestig('Functie verwijderen', `"${f}" wordt nog gebruikt bij ${gebruikt} medewerker(s)/diensten. Toch verwijderen?`, 'Verwijderen')) return;
      await Store.update('instellingen', 1, { functies: s.functies.filter(x => x !== f) }); await herlaad(); pInstellingen();
    });
    $('#iFnToev').onclick = async () => {
      const f = $('#iNieuwFn').value.trim(); if (!f || s.functies.includes(f)) return;
      await Store.update('instellingen', 1, { functies: [...s.functies, f] }); await herlaad(); pInstellingen();
    };
    $('#iOpslaan').onclick = e => A.bezig(e.target, async () => {
      if (!$('#iPin').value.trim()) return A.toast('Beheercode mag niet leeg zijn', 'fout');
      const wijz = { bedrijfsnaam: $('#iNaam').value, admin_pin: $('#iPin').value.trim(), site_url: $('#iUrl').value.trim(), dagen_voor_einde: +$('#iDagen').value || 21, beschikbaarheid_slot: +$('#iSlot').value || 25, auto_publiceren: $('#iAuto').checked, ruil_goedkeuring: $('#iRuil').checked, feest_ruil_goedkeuring: $('#iFeestRuil').checked, caf_uitvraag_dagen: $('#iCafDagen').value === '' ? 14 : +$('#iCafDagen').value, caf_ronde1_dagen: +$('#iCafR1').value || 21, caf_ronde3_dagen: $('#iCafR3').value === '' ? 2 : +$('#iCafR3').value, bezetting_regels: leesRegels(), uitvraag_dagen: +$('#iUitvraag').value || 7, beheer_naam: $('#iBNaam').value.trim(), beheer_telefoon: $('#iBTel').value.trim(), planner: leesPlanner() };
      // Kolommen die nog niet in Supabase bestaan overslaan, met uitleg welk SQL-bestand nodig is
      const nodig = { bezetting_regels: ['de standaard bezetting', 'bezetting.sql'], planner: ['slim plannen', '4-planner.sql'], feest_ruil_goedkeuring: ['goedkeuren van feestplekken', 'ruilen-feest.sql'], caf_uitvraag_dagen: ['het voorlopige cafetariarooster', 'cafetaria-ronde.sql'], caf_ronde1_dagen: ['de cafetaria-stappen', 'cafetaria-ronde.sql'], caf_ronde3_dagen: ['de cafetaria-stappen', 'cafetaria-ronde.sql'] };
      const gemist = [];
      for (let poging = 0; ; poging++) {
        try { await Store.update('instellingen', 1, wijz); break; }
        catch (x) {
          const k = Object.keys(nodig).find(k => k in wijz && new RegExp(k).test(x.message));
          if (!k || poging > 3) throw x;
          delete wijz[k]; gemist.push(nodig[k]);
        }
      }
      if (gemist.length) A.toast('Opgeslagen, behalve ' + gemist.map(g => g[0]).join(' en ') + ': voer eerst ' + gemist.map(g => g[1]).join(' en ') + ' uit in Supabase', 'fout');
      await herlaad(); $('#bedrijfsnaam').textContent = A.data.instellingen.bedrijfsnaam; A.toast('Instellingen opgeslagen', 'ok'); pInstellingen();
    });
    Push.paneel($('#iPush'), { rol: 'beheer', onTest: testBeheer });
    $('#iPlannerStd').onclick = () => { hoofd.querySelectorAll('[data-gewicht]').forEach(x => x.value = '1'); $('#iReeks').value = 5; $('#iRust').value = 11; };
    // standaard bezetting
    const vbRegels = () => {
      const r = leesRegels(), fnsAan = A.data.instellingen.functies || [];
      const vb = g => r.filter(x => fnsAan.includes(x.functie)).map(x => ({ f: x.functie, n: aantalVolgensRegel(x, g) })).filter(x => x.n).map(x => x.n + '× ' + x.f).join(', ') || 'niemand';
      $('#iRegelVb').innerHTML = `<b>Voorbeeld:</b> 80 gasten → ${esc(vb(80))}<br><b>Voorbeeld:</b> 150 gasten → ${esc(vb(150))}<br><b>Voorbeeld:</b> 250 gasten → ${esc(vb(250))}`;
    };
    const koppelRegels = () => {
      hoofd.querySelectorAll('.regel-rij .rWeg').forEach(b => b.onclick = () => { b.closest('.regel-rij').remove(); vbRegels(); });
      hoofd.querySelectorAll('.regel-rij input, .regel-rij select').forEach(i => i.oninput = vbRegels);
    };
    $('#iRegelToev').onclick = () => { $('#iRegels').insertAdjacentHTML('beforeend', regelRij({ functie: (A.data.instellingen.functies || [])[0], per: 0, min: 1, max: 0 })); koppelRegels(); vbRegels(); };
    koppelRegels(); vbRegels();
    $('#iBackup').onclick = () => A.download('rooster-backup-' + G.today() + '.json', JSON.stringify(A.data, null, 2), 'application/json');
  }

  const PAGINAS = { overzicht: pOverzicht, rooster: pRooster, aanvragen: pAanvragen, zalen: pZalen, cafetaria: pCafetaria, personeel: pPersoneel, prikbord: pPrikbord, instellingen: pInstellingen, verzuim: pVerzuim };
  start();
})();
