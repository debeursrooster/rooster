// =====================================================================
//  Roostergenerator – werkt in de browser én in Node (GitHub Actions)
//  Harde regels (nooit): verkeerde functie/locatie, vaste vrije dag,
//  goedgekeurd verlof, ziek, opgegeven 'kan niet', al aan het werk,
//  max. dagen per week, sluitingsdagen.
//  Daarna weegt de planner een reeks punten (zie G.PLANNER_PUNTEN) en
//  zoekt hij het rooster met de laagste 'kosten'.
// =====================================================================
(function (root) {
  const G = {};

  // ---------- datum-hulpjes ----------
  const pad = n => String(n).padStart(2, '0');
  G.pad = pad;
  G.parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  G.fmt = dt => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  G.addDays = (s, n) => { const d = G.parse(s); d.setUTCDate(d.getUTCDate() + n); return G.fmt(d); };
  G.weekday = s => (G.parse(s).getUTCDay() + 6) % 7;           // 0 = maandag
  G.today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  G.monthOf = s => s.slice(0, 7);
  G.nextMonth = m => { let [y, mm] = m.split('-').map(Number); mm++; if (mm > 12) { mm = 1; y++; } return y + '-' + pad(mm); };
  G.prevMonth = m => { let [y, mm] = m.split('-').map(Number); mm--; if (mm < 1) { mm = 12; y--; } return y + '-' + pad(mm); };
  G.daysInMonth = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).getUTCDate(); };
  G.monthDays = m => { const n = G.daysInMonth(m); const out = []; for (let i = 1; i <= n; i++) out.push(m + '-' + pad(i)); return out; };
  G.lastDay = m => m + '-' + pad(G.daysInMonth(m));
  G.weekStart = s => G.addDays(s, -G.weekday(s));
  G.isoWeek = s => {
    const d = G.parse(s); const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  };
  G.min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  G.hours = (start, eind) => { let a = G.min(start), b = G.min(eind); if (b <= a) b += 1440; return (b - a) / 60; };
  G.overlap = (a, b) => {
    if (a.datum !== b.datum) return false;
    let a1 = G.min(a.start), a2 = G.min(a.eind), b1 = G.min(b.start), b2 = G.min(b.eind);
    if (a2 <= a1) a2 += 1440; if (b2 <= b1) b2 += 1440;
    return a1 < b2 && b1 < a2;
  };

  // Wanneer moet het rooster voor 'volgendeMaand' klaar zijn?
  G.generatieDatum = (maand, dagenVoorEinde) => G.addDays(G.lastDay(G.prevMonth(maand)), -(dagenVoorEinde || 21));

  // ---------- benodigde diensten opbouwen ----------
  G.buildSlots = function (maand, data, opties) {
    opties = opties || {};
    const slots = [];
    const dicht = new Set((data.sluitingsdagen || []).map(s => s.datum));
    if (opties.cafetaria !== false) {
      for (const datum of G.monthDays(maand)) {
        if (dicht.has(datum)) continue;
        const wd = G.weekday(datum);
        for (const c of (data.cafetaria_diensten || []).filter(c => +c.weekdag === wd)) {
          for (let i = 0; i < (+c.aantal || 1); i++)
            slots.push({ datum, locatie: 'cafetaria', event_id: null, start: c.start, eind: c.eind, functie: c.functie });
        }
      }
    }
    if (opties.zalen !== false) {
      // Feesten met een lopende uitvraag ('open') of al vastgezet ('ingepland') worden hier overgeslagen
      const events = (data.zalen_events || []).filter(e => e.status !== 'geannuleerd' && G.monthOf(e.datum) === maand && (!opties.eventId || e.id === opties.eventId) && (opties.eventId || !G.eventVast(e)));
      for (const e of events) slots.push(...G.eventSlots(e));
    }
    return slots;
  };

  G.eventSlots = function (e) {
    const out = [];
    for (const b of (e.bezetting || [])) {
      // baas = zoveel plekken van deze rij doet de baas zelf (vooraf ingedeeld)
      // inhuur = ids van ingehuurde krachten die vooraf zijn afgesproken (staan daarna vast)
      const baas = Math.min(+b.baas || 0, +b.aantal || 0), inh = (b.inhuur || []).slice(0, Math.max(0, (+b.aantal || 0) - baas));
      for (let i = 0; i < (+b.aantal || 0); i++)
        out.push({ datum: e.datum, locatie: 'zalen', event_id: e.id, start: b.start || e.start, eind: b.eind || e.eind, functie: b.functie, baas: i < baas, inhuur: i >= baas ? inh[i - baas] || null : null });
    }
    return out;
  };

  // Een feest met lopende uitvraag of al ingeplande uitvraag wordt niet door het maandrooster aangeraakt
  // De baas zelf: niet-actieve medewerker met notitie 'Beheer'
  G.isBeheer = m => !!m && /^beheer/i.test(m.notitie || '');
  G.isInhuur = m => !!m && /^inhuur/i.test(m.notitie || '');
  // Wie er nu ingehuurd op een feest staat, weer in de bezetting zetten (zodat herplannen of terugdraaien ze niet kwijtraakt)
  G.inhuurInBezetting = function (bezetting, diensten, data) {
    const per = {};
    for (const d of diensten) { const m = (data.medewerkers || []).find(x => x.id === d.medewerker_id); if (G.isInhuur(m)) (per[d.functie] = per[d.functie] || []).push(m.id); }
    return (bezetting || []).map(b => {
      const c = { ...b }; delete c.inhuur;
      const lijst = per[b.functie] || [], ruimte = Math.max(0, (+b.aantal || 0) - (+b.baas || 0));
      if (lijst.length && ruimte) c.inhuur = lijst.splice(0, ruimte);
      return c;
    });
  };
  G.beheerMw = data => (data.medewerkers || []).find(G.isBeheer) || null;
  // Mag het personeel een plek van de baas overnemen? (per functie in te stellen bij het feest; standaard ja)
  G.baasOverneembaar = (d, e) => !(e && (e.bezetting || []).some(b => b.functie === d.functie && b.baas_overname === false));
  G.eventVast = e => !!e && ['open', 'concept', 'ingepland'].includes(e.status);
  // "Wie X kan, kan ook Y" (Instellingen → Functies). Vult bij het laden de functies van iedereen aan,
  // zodat de planner, oproepen en het oppakken van diensten het vanzelf meenemen.
  // Wat bij de medewerker zelf is aangevinkt, blijft bewaard in m.eigen_functies (wordt niet opgeslagen).
  G.functieOok = data => { const o = (data && data.instellingen && data.instellingen.functie_ook) || {}; return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; };
  G.metAfgeleid = (fns, ook) => {
    const uit = [...(fns || [])];
    for (let i = 0; i < uit.length; i++) for (const f of (ook[uit[i]] || [])) if (!uit.includes(f)) uit.push(f);
    return uit;
  };
  G.pasFunctiesToe = function (data) {
    const ook = G.functieOok(data);
    for (const m of (data.medewerkers || [])) {
      const eigen = m.eigen_functies || (m.functies || []).slice();
      Object.defineProperty(m, 'eigen_functies', { value: eigen, enumerable: false, configurable: true, writable: true });
      m.functies = G.metAfgeleid(eigen, ook);
    }
    return data;
  };
  G.isOproep = m => !(+m.contracturen > 0);
  // Cafetaria: wie geen contracturen én geen vaste werkdagen heeft, kiest zelf uit de open diensten (uitvraag)
  G.isCafOproep = m => !(+m.contracturen > 0) && !((m.vaste_dagen || []).length);
  G.cafOproepGroep = data => (data.medewerkers || []).filter(m => m.actief !== false && G.isCafOproep(m) && (m.locaties || []).includes('cafetaria'));
  // Mag deze oproepkracht reageren op deze open cafetariadienst?
  G.cafPast = (m, d) => (m.functies || []).includes(d.functie) && !(m.vrije_dagen || []).map(Number).includes(G.weekday(d.datum));
  // Is deze dienst 'vastgezet' (hoort bij een feest dat via de uitvraag is ingepland)?
  G.dienstVast = (d, data) => !!d.event_id && (data.zalen_events || []).some(e => e.id === d.event_id && (e.status === 'ingepland' || e.status === 'concept'));

  // Wie moet er reageren op een uitvraag? Oproepkrachten die in de zalen werken en een gevraagde functie hebben
  G.uitvraagGroep = function (e, data) {
    const fns = new Set((e.bezetting || []).map(b => b.functie));
    return (data.medewerkers || []).filter(m => m.actief !== false && !m.langdurig_ziek && G.isOproep(m) && (m.locaties || []).includes('zalen') && (m.functies || []).some(f => fns.has(f)));
  };

  // ---------- instellingen van de planner ----------
  // Gewicht per punt: 0 = uit, 0.5 = minder belangrijk, 1 = normaal, 2 = belangrijk, 4 = heel belangrijk
  G.PLANNER_PUNTEN = [
    ['uren', 'Iedereen zo dicht mogelijk bij de contracturen'],
    ['vaste_dag', 'Vaste werkdagen aanhouden'],
    ['oproep', 'Oproepkrachten alleen als het nodig is, en eerlijk verdeeld'],
    ['verlof', 'Wie vrij heeft aangevraagd (nog niet goedgekeurd) ontzien'],
    ['liever_niet', '"Liever niet"-dagen ontzien'],
    ['rust', 'Genoeg rust tussen twee diensten'],
    ['reeks', 'Niet te veel dagen achter elkaar'],
    ['weekend', 'Weekenddiensten (za/zo) eerlijk verdelen'],
    ['laat', 'Late diensten (na 22:00) eerlijk verdelen'],
    ['wisselend', 'Zelfde begintijden binnen een week'],
    ['ervaring', 'Nieuwe of jonge mensen niet zonder ervaren collega (18+) in een dienst'],
    ['niveau', 'Sterke en minder sterke mensen mengen (niveau 1–5)']
  ];
  G.plannerInst = function (data) {
    const p = (data && data.instellingen && data.instellingen.planner) || {};
    const w = {};
    for (const [k] of G.PLANNER_PUNTEN) w[k] = (p.gewichten && p.gewichten[k] != null && p.gewichten[k] !== '') ? +p.gewichten[k] : 1;
    return {
      max_achter_elkaar: +p.max_achter_elkaar || 5,
      min_rust: (p.min_rust != null && p.min_rust !== '') ? +p.min_rust : 11,
      jongeren: p.jongeren !== false,                  // wettelijke werktijden onder 18
      min_leeftijd: p.min_leeftijd || {},             // per functie, bv. { Bar: 18 }
      w
    };
  };

  // ---------- leeftijd en ervaring ----------
  // ervaring: 'nieuw' | 'ervaren' | 'leiding' (leeg = ervaren, zodat bestaand personeel niets verandert)
  G.leeftijd = (m, op) => {
    if (!m || !m.geboortedatum) return null;
    const g = String(m.geboortedatum).slice(0, 10), d = op || G.today();
    let j = +d.slice(0, 4) - +g.slice(0, 4); if (d.slice(5) < g.slice(5)) j--;
    return j;
  };
  G.ervaring = m => (m && m.ervaring) || 'ervaren';
  // niveau: snelheid en kwaliteit, 1 (leert nog) t/m 5 (heel sterk); leeg = 3
  G.niveau = m => { const n = +(m && m.niveau); return n >= 1 && n <= 5 ? n : 3; };
  // Telt iemand als 'ervaren collega' voor de ploeg? Ervaren of leiding, en (als bekend) 18 of ouder.
  G.isSenior = (m, op) => !!m && G.ervaring(m) !== 'nieuw' && !(G.leeftijd(m, op) != null && G.leeftijd(m, op) < 18);
  G.isJunior = (m, op) => !!m && !G.isSenior(m, op);
  // Diensten die tegelijk op dezelfde plek zijn (zelfde feest, of zelfde dag + locatie en overlappende tijd)
  G.samen = (a, b) => a !== b && a.datum === b.datum && (a.event_id || b.event_id ? a.event_id === b.event_id : a.locatie === b.locatie) && G.overlap(a, b);
  // Ploegen zonder ervaren collega: [{ datum, locatie, event_id, mensen:[naam], diensten:[...] }]
  G.ploegZonderErvaren = function (diensten, data) {
    const mw = {}; for (const m of data.medewerkers || []) mw[m.id] = m;
    const bezet = diensten.filter(d => d.medewerker_id && mw[d.medewerker_id]);
    const gezien = new Set(), uit = [];
    for (const d of bezet) {
      if (gezien.has(d)) continue;
      // hele groep die (via elkaar) tegelijk werkt
      const groep = [d], rij = [d]; gezien.add(d);
      while (rij.length) { const x = rij.pop(); for (const y of bezet) if (!gezien.has(y) && G.samen(x, y)) { gezien.add(y); groep.push(y); rij.push(y); } }
      if (!groep.some(x => G.isJunior(mw[x.medewerker_id], x.datum))) continue;
      // per dienst kijken: werkt er op enig moment een junior zonder senior ernaast?
      const fout = groep.filter(x => G.isJunior(mw[x.medewerker_id], x.datum) && !groep.some(y => y !== x && G.overlap(x, y) && G.isSenior(mw[y.medewerker_id], y.datum)));
      if (fout.length) uit.push({ datum: d.datum, locatie: d.locatie, event_id: d.event_id || null, diensten: fout, mensen: [...new Set(fout.map(x => mw[x.medewerker_id].naam))] });
    }
    return uit.sort((a, b) => a.datum.localeCompare(b.datum));
  };
  // Mag iemand van deze leeftijd deze dienst doen? (wettelijke werktijden jongeren + minimumleeftijd per functie)
  function leeftijdOk(P, m, slot) {
    const lft = G.leeftijd(m, slot.datum);
    if (lft == null) return null;
    const min = +(P.min_leeftijd || {})[slot.functie] || 0;
    if (min && lft < min) return 'te jong voor ' + slot.functie + ' (' + min + '+)';
    if (P.jongeren && lft < 18) {
      let e = G.min(slot.eind); const st = G.min(slot.start); if (e <= st) e += 1440;
      const grens = lft < 16 ? 19 * 60 : 23 * 60;
      if (e > grens) return (lft < 16 ? 'onder 16: niet na 19:00' : 'onder 18: niet na 23:00');
    }
    return null;
  }

  // ---------- beschikbaarheid ----------
  function onbeschikbaarDeel(deel, slot) {
    if (!deel || deel === 'hele dag') return true;
    const s = G.min(slot.start); let e = G.min(slot.eind); if (e <= s) e += 1440;
    if (deel === 'overdag') return s < 17 * 60;          // dienst begint overdag
    if (deel === 'avond') return e > 17 * 60;            // dienst loopt de avond in
    return true;
  }

  // Context opbouwen zodat de controle snel gaat
  G.context = function (data, bestaande) {
    const ctx = { data, perMw: {}, alle: bestaande || [], cache: {} };
    for (const m of data.medewerkers || []) ctx.perMw[m.id] = { diensten: [], uren: {}, dagenWeek: {} };
    for (const d of bestaande || []) G.registreer(ctx, d);
    ctx.verlof = (data.verlof || []).filter(v => v.status !== 'afgewezen');
    ctx.onbeschikbaar = data.beschikbaarheid || [];
    ctx.events = {};
    for (const e of data.zalen_events || []) ctx.events[e.id] = e;
    ctx.reacties = {};
    ctx.dReac = {};   // reacties op open cafetariadiensten (event_reacties met dienst_id)
    for (const r of data.event_reacties || []) {
      if (r.dienst_id) (ctx.dReac[r.dienst_id] = ctx.dReac[r.dienst_id] || {})[r.medewerker_id] = r.kan;
      else if (r.event_id) (ctx.reacties[r.event_id] = ctx.reacties[r.event_id] || {})[r.medewerker_id] = r.kan;
    }
    // al bevestigd voor een feest waarvan de uitvraag nog loopt (nog geen echte dienst): telt als bezet
    ctx.bevestigd = {};
    for (const r of data.event_reacties || []) {
      const e = r.event_id && r.kan && r.bevestigd_functie && ctx.events[r.event_id];
      if (e && e.status === 'open') (ctx.bevestigd[r.medewerker_id] = ctx.bevestigd[r.medewerker_id] || []).push(e);
    }
    ctx.vandaag = G.today();
    ctx.ziek = (data.ziekmeldingen || []).filter(z => z.status !== 'afgewezen');
    ctx.P = G.plannerInst(data);
    return ctx;
  };

  G.registreer = function (ctx, d) {
    if (!d.medewerker_id || !ctx.perMw[d.medewerker_id]) return;
    const p = ctx.perMw[d.medewerker_id];
    p.diensten.push(d);
    const m = G.monthOf(d.datum);
    p.uren[m] = (p.uren[m] || 0) + G.hours(d.start, d.eind);
    const wk = G.weekStart(d.datum);
    p.dagenWeek[wk] = p.dagenWeek[wk] || new Set();
    p.dagenWeek[wk].add(d.datum);
  };

  G.doelUren = (m, maand) => (+m.contracturen || 0) * G.daysInMonth(maand) / 7;

  // ---------- tijden van een dienst (in minuten vanaf 1970), gecachet ----------
  const tijdCache = new WeakMap();
  const dagNr = s => Math.round(G.parse(s) / 864e5);
  function tijd(d) {
    let t = tijdCache.get(d);
    if (t && t.k === d.datum + d.start + d.eind) return t;
    const dag = dagNr(d.datum), a = dag * 1440 + G.min(d.start);
    let b = dag * 1440 + G.min(d.eind); if (b <= a) b += 1440;
    const wd = G.weekday(d.datum);
    t = { k: d.datum + d.start + d.eind, dag, a, b, uren: (b - a) / 60, maand: G.monthOf(d.datum), week: G.weekStart(d.datum), wd,
      weekend: wd >= 5, laat: b > dag * 1440 + 22 * 60 };
    tijdCache.set(d, t);
    return t;
  }
  G.tijd = tijd;

  // ---------- harde regels die niet van de rest van het rooster afhangen ----------
  function vastOk(ctx, m, slot, opties) {
    opties = opties || {};
    if (m.actief === false) return { ok: false, reden: 'niet actief' };
    if (!(m.functies || []).includes(slot.functie)) return { ok: false, reden: 'heeft functie ' + slot.functie + ' niet' };
    if (!(m.locaties || []).includes(slot.locatie)) return { ok: false, reden: 'werkt niet in ' + slot.locatie };
    const wd = G.weekday(slot.datum);
    if ((m.vrije_dagen || []).map(Number).includes(wd)) return { ok: false, reden: 'vaste vrije dag' };
    const vl = ctx.verlof.find(v => v.medewerker_id === m.id && v.van <= slot.datum && v.tot >= slot.datum && v.status === 'goedgekeurd');
    if (vl) return { ok: false, reden: 'vrij (goedgekeurd)' };
    if (m.langdurig_ziek) return { ok: false, reden: 'langdurig ziek' };
    const lft = leeftijdOk(ctx.P || G.plannerInst(ctx.data), m, slot);
    if (lft) return { ok: false, reden: lft };
    // Een ziekmelding zonder einddatum geldt tot het eind van de maand (van de melding, of van nu als die al loopt).
    // De maand erna wordt iemand gewoon weer ingepland; wie langer ziek is, zet de baas op 'langdurig ziek'.
    if (ctx.ziek.some(z => z.medewerker_id === m.id && z.van <= slot.datum && slot.datum <= (z.tot || G.lastDay(G.monthOf(z.van > G.today() ? z.van : G.today())))))
      return { ok: false, reden: 'ziek gemeld' };
    const ob = ctx.onbeschikbaar.find(b => b.medewerker_id === m.id && b.datum === slot.datum && onbeschikbaarDeel(b.deel, slot));
    if (ob) return { ok: false, reden: 'heeft aangegeven niet te kunnen' };
    // Cafetaria in twee rondes: eerst alleen vaste krachten, daarna oproepkrachten die 'Ik kan' zeiden
    // (wie geen uren maar wel vaste werkdagen heeft, staat in ronde 1 alleen op die vaste dagen)
    //   fase 'vast'  : alleen vaste krachten (contracturen of vaste werkdagen), niet boven hun uren
    //   fase 'extra' : open diensten naar vaste krachten die 'Ik kan' zeiden (extra werken)
    //   fase 'oproep': open diensten naar oproepkrachten die 'Ik kan' zeiden
    //   fase 'alle'  : laatste ronde – vaste krachten en oproepkrachten gelijk, wie 'Ik kan' zei
    if (slot.locatie === 'cafetaria' && ctx.cafFase) {
      const oproep = G.isCafOproep(m);
      if (ctx.cafFase === 'vast') {
        if (oproep) return { ok: false, reden: 'oproepkracht – kiest zelf in de uitvraag' };
        if (!(+m.contracturen > 0) && !(m.vaste_dagen || []).map(Number).includes(wd)) return { ok: false, reden: 'geen vaste werkdag – kan zelf extra kiezen' };
      } else {
        if (ctx.cafFase !== 'alle' && (ctx.cafFase === 'extra') === oproep) return { ok: false, reden: oproep ? 'oproepkracht – komt later aan de beurt' : 'vaste kracht – alleen als er niemand anders is' };
        const r = (ctx.dReac[slot.id] || {})[m.id];
        if (r !== true) return { ok: false, reden: r === false ? 'heeft gezegd niet te kunnen' : 'heeft niet gereageerd' };
        return { ok: true, reactieKan: true };
      }
    }
    const ev = slot.event_id && ctx.events[slot.event_id];
    let reactieKan = false;
    if (ev && ev.uitvraag) {
      const r = (ctx.reacties[ev.id] || {})[m.id];
      // (bij Beschikbaar mag wie eerder 'kan niet' zei een open plek toch nog oppakken: negeerReactie)
      if (r === false && !opties.negeerReactie) return { ok: false, reden: 'heeft gezegd niet te kunnen' };
      if (G.isOproep(m) && r !== true && !opties.negeerUitvraag) return { ok: false, reden: r === undefined ? 'heeft niet gereageerd' : 'niet beschikbaar' };
      reactieKan = r === true;
    }
    return { ok: true, reactieKan };
  }
  G.vastOk = vastOk;

  // ---------- harde regels die wel van de rest afhangen: overlap en max. dagen per week ----------
  function pastErbij(m, slot, lijst) {
    const t = tijd(slot);
    let zelfdeDag = false;
    const dagen = new Set();
    for (const d of lijst) {
      if (d === slot || (slot.id && d.id === slot.id)) continue;
      const u = tijd(d);
      if (u.a < t.b && t.a < u.b) return 'werkt dan al';
      if (u.week === t.week) { dagen.add(d.datum); if (d.datum === slot.datum) zelfdeDag = true; }
    }
    if (!zelfdeDag && dagen.size >= (+m.max_dagen_week || 7)) return 'max. dagen per week bereikt';
    return null;
  }

  // Welk deel van de diensten waarvoor iemand in aanmerking komt, valt in het weekend / is laat?
  // Zo wordt iemand die alleen in het weekend kan niet 'gestraft'.
  function verwachting(ctx, m, maanden) {
    const key = 'v' + m.id + maanden.join();
    if (ctx.cache[key]) return ctx.cache[key];
    const bron = (ctx.bron || ctx.alle).filter(d => maanden.includes(G.monthOf(d.datum)));
    let n = 0, wk = 0, lt = 0, N = 0, WK = 0, LT = 0;
    for (const d of bron) {
      const t = tijd(d); N++; if (t.weekend) WK++; if (t.laat) LT++;
      if (vastOk(ctx, m, d, { negeerUitvraag: true }).ok) { n++; if (t.weekend) wk++; if (t.laat) lt++; }
    }
    const r = n >= 4 ? { weekend: wk / n, laat: lt / n } : { weekend: N ? WK / N : 0.3, laat: N ? LT / N : 0.3 };
    ctx.cache[key] = r;
    return r;
  }

  // ---------- kosten van het rooster van één medewerker (lager = beter) ----------
  // Het hele rooster is goed als de som van deze kosten zo laag mogelijk is.
  function kosten(ctx, m, lijst, maanden) {
    const P = ctx.P, W = P.w;
    const k = { uren: 0, oproep: 0, vaste_dag: 0, verlof: 0, liever_niet: 0, dubbel: 0, rust: 0, reeks: 0, weekend: 0, laat: 0, wisselend: 0 };
    const eerste = maanden[0] + '-01', laatste = G.lastDay(maanden[maanden.length - 1]);
    const dVan = dagNr(eerste) - 7, dTot = dagNr(laatste) + 7;
    const raam = [];       // diensten rond de maand(en): voor rust en reeksen
    const inM = [];        // diensten in de maand(en)
    for (const d of lijst) {
      const t = tijd(d);
      if (t.dag >= dVan && t.dag <= dTot) raam.push(d);
      if (maanden.includes(t.maand)) inM.push(d);
    }
    // 1. uren
    if (+m.contracturen > 0) {
      for (const mnd of maanden) {
        let gepland = 0; for (const d of inM) { const t = tijd(d); if (t.maand === mnd) gepland += t.uren; }
        const doel = G.doelUren(m, mnd), v = gepland - doel;
        if (v < 0) k.uren += 0.15 * v * v;
        else k.uren += 0.3 * v * v + (v > doel * 0.1 ? 3 * (v - doel * 0.1) ** 2 : 0);
        // ronde 1 cafetaria: vaste krachten niet (veel) boven hun uren; de rest is voor de oproepkrachten
        if (ctx.cafFase === 'vast' && v > 3) k.uren += 2500 * (v - 3);
      }
      k.uren *= W.uren;
    } else {
      // oproepkracht: elk uur kost iets (vast personeel gaat voor) en wie de laatste/komende 3 maanden al veel werkte, komt later aan de beurt
      let h = 0; for (const d of inM) h += tijd(d).uren;
      const r1 = dagNr(eerste) - 90, r2 = dagNr(laatste) + 90;
      let wh = 0; for (const d of lijst) { const t = tijd(d); if (t.dag >= r1 && t.dag <= r2) wh += t.uren; }
      k.oproep = W.oproep * (6 * h + 0.02 * wh * wh);
    }
    // 2. per dag: vaste werkdag, aangevraagd vrij, liever niet, twee diensten op één dag
    const vast = new Set((m.vaste_dagen || []).map(Number)), liever = new Set((m.liever_niet_dagen || []).map(Number));
    const aanvr = ctx.verlof.filter(v => v.medewerker_id === m.id && v.status === 'aangevraagd');
    const datums = new Map();
    for (const d of inM) datums.set(d.datum, (datums.get(d.datum) || 0) + 1);
    for (const [datum, n] of datums) {
      const wd = G.weekday(datum);
      if (vast.has(wd)) k.vaste_dag -= 40 * W.vaste_dag;
      if (liever.has(wd)) k.liever_niet += 30 * W.liever_niet;
      if (aanvr.some(v => v.van <= datum && v.tot >= datum)) k.verlof += 90 * W.verlof * n;
      if (n > 1) k.dubbel += 50 * (n - 1) * Math.max(W.rust, 0.5);
    }
    // 3. rust tussen diensten en reeksen
    raam.sort((x, y) => tijd(x).a - tijd(y).a);
    for (let i = 1; i < raam.length; i++) {
      const a = tijd(raam[i - 1]), b = tijd(raam[i]);
      if (a.dag === b.dag) continue;                 // zelfde dag: telt al als 'twee diensten'
      const rust = (b.a - a.b) / 60;
      if (rust < P.min_rust) k.rust += 8 * (P.min_rust - rust) * W.rust;
    }
    let reeks = 0, vorige = null;
    const dagen = [...new Set(raam.map(d => tijd(d).dag))].sort((x, y) => x - y);
    for (const dg of dagen) {
      reeks = (vorige !== null && dg === vorige + 1) ? reeks + 1 : 1;
      if (reeks > P.max_achter_elkaar) k.reeks += 40 * (reeks - P.max_achter_elkaar) * W.reeks;
      vorige = dg;
    }
    // 4. eerlijk verdelen van weekend- en late diensten
    if (inM.length && (W.weekend || W.laat)) {
      const v = verwachting(ctx, m, maanden);
      let wk = 0, lt = 0; for (const d of inM) { const t = tijd(d); if (t.weekend) wk++; if (t.laat) lt++; }
      k.weekend = 6 * W.weekend * (wk - v.weekend * inM.length) ** 2;
      k.laat = 6 * W.laat * (lt - v.laat * inM.length) ** 2;
    }
    // 5. zo min mogelijk verschillende begintijden in een week
    if (W.wisselend) {
      const perWeek = {};
      for (const d of inM) { const t = tijd(d); (perWeek[t.week] = perWeek[t.week] || new Set()).add(d.start); }
      for (const w in perWeek) k.wisselend += 5 * W.wisselend * (perWeek[w].size - 1);
    }
    let totaal = 0; for (const x in k) totaal += k[x];
    return { totaal, k };
  }
  G.kosten = kosten;

  // Geeft {ok, score, redenen[]} terug (hoger = beter)
  // opties.negeerUitvraag: bij zelf oppakken van een open dienst hoeft een oproepkracht niet vooraf 'kan' te hebben gezegd
  // opties.alleenOk: alleen kijken óf iemand kan (sneller)
  // Voor het handmatig kiezen: helpt deze persoon de ploeg (ervaren collega), of staat er nog niemand ervarens?
  function P_ploeg(ctx, m, slot, redenen) {
    if (!ctx.P) return 0;
    let extra = 0;
    if (ctx.P.w.niveau && (ctx.data.medewerkers || []).some(x => G.niveau(x) !== 3)) {
      const mw0 = {}; for (const x of ctx.data.medewerkers || []) mw0[x.id] = x;
      const pl = (ctx.alle || []).filter(d => d.medewerker_id && d.medewerker_id !== m.id && d.id !== slot.id && G.samen(slot, d)).map(d => G.niveau(mw0[d.medewerker_id]));
      const nv = G.niveau(m);
      if (pl.length) { const gem = pl.reduce((a, b) => a + b, 0) / pl.length;
        if (gem < 3 && nv >= 4) { redenen.unshift('sterk (' + nv + '★) – ploeg is nu zwak'); extra += ctx.P.w.niveau * 60; }
        else if (gem < 3 && nv <= 2) { redenen.push(nv + '★ · ploeg is al zwak'); extra -= ctx.P.w.niveau * 60; } }
    }
    if (!ctx.P.w.ervaring) return extra;
    const mw = {}; for (const x of ctx.data.medewerkers || []) mw[x.id] = x;
    const ploeg = (ctx.alle || []).filter(d => d.medewerker_id && d.medewerker_id !== m.id && d.id !== slot.id && G.samen(slot, d));
    const senior = ploeg.some(d => G.isSenior(mw[d.medewerker_id], d.datum));
    const lft = G.leeftijd(m, slot.datum);
    const W = ctx.P.w.ervaring * 150;
    if (G.isSenior(m, slot.datum)) { if (ploeg.length && !senior) { redenen.unshift('ervaren – nodig in deze ploeg'); return extra + W; } return extra; }
    redenen.push((G.ervaring(m) === 'nieuw' ? 'nieuw' : lft + ' jaar') + (senior ? '' : ' · nog geen ervaren collega erbij'));
    return extra + (senior ? 0 : -W);
  }
  G.beoordeel = function (ctx, m, slot, opties) {
    opties = opties || {};
    const v = vastOk(ctx, m, slot, opties);
    if (!v.ok) return { ok: false, redenen: [v.reden] };
    const p = ctx.perMw[m.id] || { diensten: [] };
    const lijst = p.diensten.filter(d => d !== slot && !(slot.id && d.id === slot.id));
    const nee = pastErbij(m, slot, lijst);
    if (nee) return { ok: false, redenen: [nee] };
    const feest = ((ctx.bevestigd || {})[m.id] || []).find(e => e.id !== slot.event_id && G.overlap(e, slot));
    if (feest) return { ok: false, redenen: ['bevestigd voor ' + (feest.naam || 'een feest')] };
    if (opties.alleenOk) return { ok: true, score: 0, redenen: [] };

    const maanden = [G.monthOf(slot.datum)];
    const voor = kosten(ctx, m, lijst, maanden), na = kosten(ctx, m, lijst.concat([slot]), maanden);
    const delta = x => na.k[x] - voor.k[x];
    const redenen = [];
    if (delta('vaste_dag') < 0) redenen.push('vaste werkdag');
    if (v.reactieKan) redenen.push('heeft gezegd te kunnen');
    const maand = maanden[0], t = tijd(slot);
    if (+m.contracturen > 0) {
      const doel = G.doelUren(m, maand);
      const gepland = lijst.reduce((s, d) => s + (tijd(d).maand === maand ? tijd(d).uren : 0), 0);
      if (gepland + t.uren > doel * 1.1) redenen.push('komt boven contracturen');
      else if (doel - gepland >= 4) redenen.push('nog ' + Math.round(doel - gepland) + ' u tekort');
    } else {
      const van = G.addDays(slot.datum, -90), tot = G.addDays(slot.datum, 90);
      const recent = lijst.filter(d => d.datum >= van && d.datum <= tot).reduce((s, d) => s + tijd(d).uren, 0);
      redenen.push('oproepkracht · ' + Math.round(recent) + ' u in 3 mnd');
    }
    if (delta('verlof') > 0) redenen.push('heeft vrij aangevraagd');
    if (delta('liever_niet') > 0) redenen.push('liever niet op ' + ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'][t.wd]);
    if (delta('dubbel') > 0) redenen.push('tweede dienst die dag');
    if (delta('rust') > 0) {
      let kort = Infinity;
      for (const d of lijst) { const u = tijd(d); if (u.dag === t.dag) continue; const r = u.b <= t.a ? t.a - u.b : u.a >= t.b ? u.a - t.b : Infinity; if (r < kort) kort = r; }
      redenen.push(kort < Infinity ? 'maar ' + String(Math.round(kort / 30) / 2).replace('.', ',') + ' u rust' : 'korte rust');
    }
    if (delta('reeks') > 0) {
      const dagen = new Set(lijst.map(d => tijd(d).dag)); dagen.add(t.dag);
      let a = t.dag, b = t.dag; while (dagen.has(a - 1)) a--; while (dagen.has(b + 1)) b++;
      redenen.push((b - a + 1) + ' dagen achter elkaar');
    }
    const ploegScore = P_ploeg(ctx, m, slot, redenen);
    if (delta('weekend') > 12) redenen.push('al veel weekenddiensten');
    if (delta('laat') > 12) redenen.push('al veel late diensten');
    return { ok: true, score: Math.round(-(na.totaal - voor.totaal) + ploegScore), redenen };
  };

  // Kandidatenlijst voor een dienst (ook voor de keuzelijst in beheer)
  G.kandidaten = function (ctx, slot, opties) {
    return (ctx.data.medewerkers || []).map(m => ({ m, ...G.beoordeel(ctx, m, slot, opties) }))
      .sort((a, b) => (b.ok - a.ok) || ((b.score || 0) - (a.score || 0)) || a.m.naam.localeCompare(b.m.naam));
  };

  // Voorspelbaar toeval: met dezelfde gegevens komt er hetzelfde rooster uit
  function rng(tekst) {
    let h = 1779033703 ^ tekst.length;
    for (let i = 0; i < tekst.length; i++) { h = Math.imul(h ^ tekst.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const nu = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const DAG_KORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const MND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const uurTekst = u => String(Math.round(u * 2) / 2).replace('.', ',');
  const kortDatum = s => DAG_KORT[G.weekday(s)] + ' ' + (+s.slice(8)) + ' ' + MND_KORT[+s.slice(5, 7) - 1];

  // Slots verdelen:
  //  1. eerst de diensten waarvoor de minste mensen kunnen;
  //  2. per dienst wie het rooster het minst 'duur' maakt;
  //  3. daarna duizenden keren proberen of het beter kan door een dienst aan iemand anders te geven
  //     of twee mensen te laten ruilen. Alleen wat het totaal beter maakt blijft staan.
  G.plan = function (slots, data, bestaande, opties) {
    opties = opties || {};
    const ctx = G.context(data, bestaande);
    ctx.cafFase = opties.cafFase || null;
    const meldingen = [];
    const mws = (data.medewerkers || []).filter(m => m.actief !== false);
    const maanden = [...new Set(slots.map(s => G.monthOf(s.datum)))].sort();
    const OPEN = 2000;
    const diensten = slots.map(s => ({ id: s.id || G.uuid(), maand: G.monthOf(s.datum), datum: s.datum, locatie: s.locatie, event_id: s.event_id || null, start: s.start, eind: s.eind, functie: s.functie, medewerker_id: null, notitie: '' }));
    const n = diensten.length;
    if (!n || !maanden.length) return { diensten, meldingen, info: { geprobeerd: 0, verbeterd: 0 } };
    ctx.bron = diensten.concat((bestaande || []).filter(d => maanden.includes(G.monthOf(d.datum))));

    const kand = diensten.map(d => mws.filter(m => vastOk(ctx, m, d).ok));
    const kandSet = kand.map(l => new Set(l.map(m => m.id)));
    const perId = {}; mws.forEach(m => perId[m.id] = m);
    const lijst = {}, kost = {};
    for (const m of mws) { lijst[m.id] = (ctx.perMw[m.id] ? ctx.perMw[m.id].diensten : []).slice(); kost[m.id] = kosten(ctx, m, lijst[m.id], maanden).totaal; }
    const wie = new Array(n).fill(null);
    const zonder = (l, d) => { const i = l.indexOf(d); const c = l.slice(); if (i >= 0) c.splice(i, 1); return c; };

    // 0: door de baas bevestigde mensen staan vast op hun feest (en worden daarna niet meer verschoven)
    const vast = new Array(n).fill(false);
    // plekken die de baas vooraf zelf heeft genomen
    const baas = G.beheerMw(data);
    if (baas) slots.forEach((s, i) => { if (s.baas) { wie[i] = baas.id; diensten[i].medewerker_id = baas.id; vast[i] = true; } });
    // en ingehuurde krachten die al zijn afgesproken
    slots.forEach((s, i) => { if (!wie[i] && s.inhuur && (data.medewerkers || []).some(m => m.id === s.inhuur)) { wie[i] = s.inhuur; diensten[i].medewerker_id = s.inhuur; vast[i] = true; } });
    for (const r of (data.event_reacties || []).filter(r => r.kan && r.bevestigd_functie && r.event_id)) {
      const m = perId[r.medewerker_id]; if (!m) continue;
      let i = diensten.findIndex((d, k) => !wie[k] && d.event_id === r.event_id && d.functie === r.bevestigd_functie);
      if (i < 0) i = diensten.findIndex((d, k) => !wie[k] && d.event_id === r.event_id && (m.functies || []).includes(d.functie));
      if (i < 0) i = diensten.findIndex((d, k) => !wie[k] && d.event_id === r.event_id);
      if (i < 0) continue;
      const d = diensten[i];
      wie[i] = m.id; d.medewerker_id = m.id; lijst[m.id].push(d); kost[m.id] = kosten(ctx, m, lijst[m.id], maanden).totaal; vast[i] = true;
    }

    // Ploeg: nieuwe/jonge mensen liever niet zonder ervaren collega (18+) die tegelijk werkt
    const W_ERV = (ctx.P.w.ervaring || 0) * 150, W_NIV = (ctx.P.w.niveau || 0) * 40;
    const ervAan = W_ERV > 0 && mws.some(m => G.isJunior(m)), nivAan = W_NIV > 0 && mws.some(m => G.niveau(m) !== 3);
    const ploegAan = ervAan || nivAan;
    const buren = diensten.map(() => []), burenVast = diensten.map(() => false);
    if (ploegAan) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (G.samen(diensten[i], diensten[j])) { buren[i].push(j); buren[j].push(i); }
      const vaste = (ctx.bron || []).filter(d => d.medewerker_id && !diensten.includes(d));
      diensten.forEach((d, i) => { burenVast[i] = vaste.some(x => G.samen(d, x) && G.isSenior(perId[x.medewerker_id] || (data.medewerkers || []).find(m => m.id === x.medewerker_id), x.datum)); });
    }
    // niveau van vaste collega's (al ingepland buiten deze planning) die tegelijk werken
    const nivVast = diensten.map(() => []);
    if (nivAan) { const vaste = (ctx.bron || []).filter(d => d.medewerker_id && !diensten.includes(d));
      diensten.forEach((d, i) => { for (const x of vaste) if (G.samen(d, x)) { const m = perId[x.medewerker_id] || (data.medewerkers || []).find(y => y.id === x.medewerker_id); if (m) nivVast[i].push(G.niveau(m)); } }); }
    const ploegKost = i => {
      const id = wie[i]; if (!id) return 0;
      const d = diensten[i]; let k = 0;
      if (ervAan && !G.isSenior(perId[id], d.datum) && !burenVast[i] && !buren[i].some(j => wie[j] && G.isSenior(perId[wie[j]], diensten[j].datum))) k += W_ERV;
      if (nivAan) {
        // gemiddeld niveau van de ploeg rond deze dienst; onder de 3 kost het (steeds meer)
        let som = G.niveau(perId[id]), n = 1;
        for (const j of buren[i]) if (wie[j]) { som += G.niveau(perId[wie[j]]); n++; }
        for (const v of nivVast[i]) { som += v; n++; }
        const tekort = Math.max(0, 3 - som / n); k += W_NIV * tekort * tekort * 4;
      }
      return k;
    };
    // verschil in ploegkosten als de diensten in 'wijz' ({index: medewerker_id|null}) veranderen
    const ploegDelta = wijz => {
      if (!ploegAan) return 0;
      const raak = new Set();
      for (const k in wijz) { raak.add(+k); for (const j of buren[+k]) raak.add(j); }
      let voor = 0, na = 0; const oud = {};
      for (const i of raak) voor += ploegKost(i);
      for (const k in wijz) { oud[k] = wie[+k]; wie[+k] = wijz[k]; }
      for (const i of raak) na += ploegKost(i);
      for (const k in oud) wie[+k] = oud[k];
      return na - voor;
    };

    // 1 + 2: opbouwen
    const volgorde = diensten.map((d, i) => i).filter(i => !vast[i]).sort((a, b) => kand[a].length - kand[b].length || tijd(diensten[a]).a - tijd(diensten[b]).a);
    for (const i of volgorde) {
      const d = diensten[i];
      let beste = null, besteK = Infinity, besteDelta = Infinity;
      for (const m of kand[i]) {
        if (pastErbij(m, d, lijst[m.id])) continue;
        const nk = kosten(ctx, m, lijst[m.id].concat([d]), maanden).totaal;
        const dl = nk - kost[m.id] + ploegDelta({ [i]: m.id });
        if (dl < besteDelta) { besteDelta = dl; beste = m; besteK = nk; }
      }
      if (beste && besteDelta < OPEN) { wie[i] = beste.id; d.medewerker_id = beste.id; lijst[beste.id].push(d); kost[beste.id] = besteK; }
    }

    // 3: verbeteren (simulated annealing)
    const toeval = rng(maanden.join() + ':' + n + ':' + mws.length);
    const maxIt = opties.iteraties || Math.min(250000, n * 800);
    const maxTijd = opties.tijd || 2500;
    const t0 = nu();
    let totaal = 0; for (const id in kost) totaal += kost[id]; totaal += OPEN * wie.filter(x => !x).length;
    if (ploegAan) for (let i = 0; i < n; i++) totaal += ploegKost(i);
    let beste = totaal, besteWie = wie.slice(), verbeterd = 0, it = 0;
    const T0 = 40, T1 = 0.3;
    for (; it < maxIt; it++) {
      if ((it & 1023) === 0 && nu() - t0 > maxTijd) break;
      const T = T0 * Math.pow(T1 / T0, it / maxIt);
      const i = Math.floor(toeval() * n), d = diensten[i], a = wie[i];
      if (!kand[i].length || vast[i]) continue;
      let delta, toepassen;
      if (a && ctx.cafFase && toeval() < 0.08) {
        // (alleen bij de cafetaria-rondes) dienst weer open zetten als dat goedkoper is
        const la = zonder(lijst[a], d), ka = kosten(ctx, perId[a], la, maanden).totaal;
        delta = (ka - kost[a]) + OPEN + ploegDelta({ [i]: null });
        toepassen = () => { lijst[a] = la; kost[a] = ka; wie[i] = null; };
      } else if (toeval() < 0.5 || !a) {
        // dienst aan iemand anders geven
        const m = kand[i][Math.floor(toeval() * kand[i].length)];
        if (m.id === a) continue;
        if (pastErbij(m, d, lijst[m.id])) continue;
        const lm = lijst[m.id].concat([d]), km = kosten(ctx, m, lm, maanden).totaal;
        let la = null, ka = 0;
        if (a) { la = zonder(lijst[a], d); ka = kosten(ctx, perId[a], la, maanden).totaal; }
        delta = (km - kost[m.id]) + (a ? ka - kost[a] : -OPEN) + ploegDelta({ [i]: m.id });
        toepassen = () => { lijst[m.id] = lm; kost[m.id] = km; if (a) { lijst[a] = la; kost[a] = ka; } wie[i] = m.id; };
      } else {
        // twee mensen laten ruilen
        const j = Math.floor(toeval() * n), b = wie[j], e = diensten[j];
        if (!b || b === a || vast[j] || !kandSet[j].has(a) || !kandSet[i].has(b)) continue;
        const la = zonder(lijst[a], d), lb = zonder(lijst[b], e);
        if (pastErbij(perId[a], e, la) || pastErbij(perId[b], d, lb)) continue;
        la.push(e); lb.push(d);
        const ka = kosten(ctx, perId[a], la, maanden).totaal, kb = kosten(ctx, perId[b], lb, maanden).totaal;
        delta = (ka - kost[a]) + (kb - kost[b]) + ploegDelta({ [i]: b, [j]: a });
        toepassen = () => { lijst[a] = la; kost[a] = ka; lijst[b] = lb; kost[b] = kb; wie[i] = b; wie[j] = a; };
      }
      if (delta < 0 || toeval() < Math.exp(-delta / T)) {
        toepassen(); totaal += delta;
        if (totaal < beste - 1e-6) { beste = totaal; besteWie = wie.slice(); verbeterd++; }
      }
    }

    // beste oplossing terugzetten
    const eind = {}; for (const m of mws) eind[m.id] = (ctx.perMw[m.id] ? ctx.perMw[m.id].diensten : []).slice();
    diensten.forEach((d, i) => { d.medewerker_id = besteWie[i]; if (besteWie[i] && eind[besteWie[i]]) eind[besteWie[i]].push(d); });

    const result = diensten.slice().sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || G.min(a.start) - G.min(b.start) || a.locatie.localeCompare(b.locatie));
    for (const d of result) if (!d.medewerker_id && !(ctx.cafFase === 'vast' && d.locatie === 'cafetaria')) meldingen.push('Geen geschikte medewerker voor ' + d.functie + ' op ' + d.datum + ' (' + d.start + '-' + d.eind + ', ' + d.locatie + ')');

    // wat er niet helemaal gelukt is
    const P = ctx.P;
    if (ervAan) {
      const alle = diensten.concat((ctx.bron || []).filter(d => !diensten.includes(d)));
      for (const pl of G.ploegZonderErvaren(alle, data).filter(pl => pl.diensten.some(d => diensten.includes(d))))
        meldingen.push('Geen ervaren collega (18+) bij ' + pl.mensen.join(', ') + ' op ' + kortDatum(pl.datum) + ' (' + (pl.event_id && ctx.events[pl.event_id] ? ctx.events[pl.event_id].naam : pl.locatie) + ', ' + pl.diensten.map(d => d.start + '-' + d.eind).join(', ') + ')');
    }
    for (const m of mws) {
      const eigen = eind[m.id].filter(d => maanden.includes(G.monthOf(d.datum)));
      if (!eigen.some(d => diensten.includes(d))) continue;
      const dagen = [...new Set(eind[m.id].map(d => tijd(d).dag))].sort((x, y) => x - y);
      for (let i = 0; i < dagen.length;) {
        let j = i; while (j + 1 < dagen.length && dagen[j + 1] === dagen[j] + 1) j++;
        if (j - i + 1 > P.max_achter_elkaar && P.w.reeks) {
          const van = G.fmt(new Date(dagen[i] * 864e5)), tot = G.fmt(new Date(dagen[j] * 864e5));
          if (maanden.includes(G.monthOf(van)) || maanden.includes(G.monthOf(tot))) meldingen.push(m.naam + ' werkt ' + (j - i + 1) + ' dagen achter elkaar (' + kortDatum(van) + ' t/m ' + kortDatum(tot) + ')');
        }
        i = j + 1;
      }
      if (P.w.rust) {
        const s = eind[m.id].slice().sort((x, y) => tijd(x).a - tijd(y).a);
        for (let i = 1; i < s.length; i++) {
          const a = tijd(s[i - 1]), b = tijd(s[i]);
          if (a.dag === b.dag || !maanden.includes(b.maand)) continue;
          const r = (b.a - a.b) / 60;
          if (r < P.min_rust) meldingen.push(m.naam + ' heeft maar ' + uurTekst(r) + ' uur rust voor ' + kortDatum(s[i].datum) + ' (' + s[i].start + ')');
        }
      }
    }
    // urencheck
    const urenMaanden = opties.geenUrencheck ? [] : maanden;
    for (const maand of urenMaanden) for (const m of mws.filter(m => +m.contracturen > 0)) {
      const doel = G.doelUren(m, maand), gepland = eind[m.id].filter(d => d.datum.startsWith(maand)).reduce((s, d) => s + tijd(d).uren, 0);
      if (gepland < doel * 0.85) meldingen.push(m.naam + ': ' + Math.round(gepland) + ' van ~' + Math.round(doel) + ' uur ingepland in ' + maand);
    }
    return { diensten: result, meldingen, info: { geprobeerd: it, verbeterd, ms: Math.round(nu() - t0) } };
  };

  // Complete maand maken. Bestaande diensten uit andere maanden tellen mee voor overlap.
  G.generateMonth = function (maand, data, opties) {
    const slots = G.buildSlots(maand, data);
    // andere maanden + diensten van feesten die al via de uitvraag zijn vastgezet tellen mee
    const elders = (data.diensten || []).filter(d => d.maand !== maand || G.dienstVast(d, data));
    // Cafetaria: oproepkrachten (geen contracturen en geen vaste werkdagen) worden nooit vanzelf ingepland.
    // Zij kiezen zelf: via de uitvraag ("Ik kan") of door een open dienst op te pakken.
    return G.plan(slots, data, elders, { cafFase: 'vast', ...(opties || {}) });
  };

  // Ronde 1: voorlopig rooster – cafetaria alleen met vaste krachten (contracturen of vaste werkdagen)
  G.generateVoorlopig = (maand, data, opties) => G.generateMonth(maand, data, { ...(opties || {}), cafFase: 'vast' });

  // Open cafetariadiensten verdelen onder wie 'Ik kan' zei (eerlijk, geen voorrang voor wie eerst reageerde)
  // fase 'oproep' = oproepkrachten, fase 'extra' = vaste krachten die extra willen werken
  G.cafVerdeel = function (maand, data, fase, opties) {
    const open = (data.diensten || []).filter(d => d.maand === maand && d.locatie === 'cafetaria' && !d.medewerker_id);
    const ids = new Set(open.map(d => d.id));
    const rest = (data.diensten || []).filter(d => !ids.has(d.id));
    return G.plan(open.map(d => ({ ...d })), data, rest, { ...(opties || {}), cafFase: fase });
  };
  G.cafDefinitief = (maand, data, opties) => G.cafVerdeel(maand, data, 'oproep', opties);

  // Uitvraag afsluiten: alle feesten in één keer verdelen (eerlijk over de datums heen)
  G.planEvents = function (events, data, opties) {
    const ids = new Set(events.map(e => e.id));
    const slots = [];
    for (const e of events) slots.push(...G.eventSlots(e));
    const bestaande = (data.diensten || []).filter(d => !ids.has(d.event_id));
    return G.plan(slots, data, bestaande, { geenUrencheck: true, ...(opties || {}) });
  };

  // Voorlopige indeling van feesten waarvan de uitvraag nog loopt, met de reacties die er nu zijn.
  // Wordt niet opgeslagen: alleen om te laten zien hoe het er nu voor staat.
  G.voorlopig = function (data) {
    const nu = G.today();
    const lopend = (data.zalen_events || []).filter(e => e.status === 'open' && e.datum >= nu);
    if (!lopend.length) return { diensten: [], perEvent: {} };
    const res = G.planEvents(lopend, data, { tijd: 400, iteraties: 30000 });
    const perEvent = {};
    for (const d of res.diensten) { d.voorlopig = true; (perEvent[d.event_id] = perEvent[d.event_id] || []).push(d); }
    return { diensten: res.diensten, perEvent };
  };

  // Eén vervanger zoeken voor een dienst (bij goedgekeurd verlof)
  G.vervanger = function (dienst, data, uitsluiten) {
    const andere = (data.diensten || []).filter(d => d.id !== dienst.id);
    const ctx = G.context(data, andere);
    const slot = { ...dienst, medewerker_id: null };
    const k = G.kandidaten(ctx, slot).filter(k => k.ok && !(uitsluiten || []).includes(k.m.id));
    return k.length ? k[0].m : null;
  };

  G.uuid = function () {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  };

  root.Gen = G;
  if (typeof module !== 'undefined') module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
