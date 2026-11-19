// =====================================================================
//  Roostergenerator – werkt in de browser én in Node (GitHub Actions)
//  Houdt rekening met: functies, locaties, contracturen, vaste dagen,
//  vaste vrije dagen, goedgekeurd verlof, opgegeven onbeschikbaarheid,
//  max. dagen per week, sluitingsdagen en dubbele diensten.
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
      const events = (data.zalen_events || []).filter(e => G.monthOf(e.datum) === maand && (!opties.eventId || e.id === opties.eventId) && (opties.eventId || !G.eventVast(e)));
      for (const e of events) slots.push(...G.eventSlots(e));
    }
    return slots;
  };

  G.eventSlots = function (e) {
    const out = [];
    for (const b of (e.bezetting || [])) {
      for (let i = 0; i < (+b.aantal || 0); i++)
        out.push({ datum: e.datum, locatie: 'zalen', event_id: e.id, start: b.start || e.start, eind: b.eind || e.eind, functie: b.functie });
    }
    return out;
  };

  // Een feest met lopende uitvraag of al ingeplande uitvraag wordt niet door het maandrooster aangeraakt
  G.eventVast = e => !!e && ['open', 'concept', 'ingepland'].includes(e.status);
  G.isOproep = m => !(+m.contracturen > 0);
  // Is deze dienst 'vastgezet' (hoort bij een feest dat via de uitvraag is ingepland)?
  G.dienstVast = (d, data) => !!d.event_id && (data.zalen_events || []).some(e => e.id === d.event_id && (e.status === 'ingepland' || e.status === 'concept'));

  // Wie moet er reageren op een uitvraag? Oproepkrachten die in de zalen werken en een gevraagde functie hebben
  G.uitvraagGroep = function (e, data) {
    const fns = new Set((e.bezetting || []).map(b => b.functie));
    return (data.medewerkers || []).filter(m => m.actief !== false && G.isOproep(m) && (m.locaties || []).includes('zalen') && (m.functies || []).some(f => fns.has(f)));
  };

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
    const ctx = { data, perMw: {} };
    for (const m of data.medewerkers || []) ctx.perMw[m.id] = { diensten: [], uren: {}, dagenWeek: {} };
    for (const d of bestaande || []) G.registreer(ctx, d);
    ctx.verlof = (data.verlof || []).filter(v => v.status !== 'afgewezen');
    ctx.onbeschikbaar = data.beschikbaarheid || [];
    ctx.events = {};
    for (const e of data.zalen_events || []) ctx.events[e.id] = e;
    ctx.reacties = {};
    for (const r of data.event_reacties || []) (ctx.reacties[r.event_id] = ctx.reacties[r.event_id] || {})[r.medewerker_id] = r.kan;
    ctx.vandaag = G.today();
    ctx.ziek = (data.ziekmeldingen || []).filter(z => z.status !== 'afgewezen');
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

  // Geeft {ok, score, redenen[]} terug
  // opties.negeerUitvraag: bij zelf oppakken van een open dienst hoeft een oproepkracht niet vooraf 'kan' te hebben gezegd
  G.beoordeel = function (ctx, m, slot, opties) {
    const redenen = [];
    opties = opties || {};
    if (m.actief === false) return { ok: false, redenen: ['niet actief'] };
    if (!(m.functies || []).includes(slot.functie)) return { ok: false, redenen: ['heeft functie ' + slot.functie + ' niet'] };
    if (!(m.locaties || []).includes(slot.locatie)) return { ok: false, redenen: ['werkt niet in ' + slot.locatie] };
    const wd = G.weekday(slot.datum);
    if ((m.vrije_dagen || []).map(Number).includes(wd)) return { ok: false, redenen: ['vaste vrije dag'] };
    const vl = ctx.verlof.find(v => v.medewerker_id === m.id && v.van <= slot.datum && v.tot >= slot.datum);
    if (vl && vl.status === 'goedgekeurd') return { ok: false, redenen: ['vrij (goedgekeurd)'] };
    if (ctx.ziek.some(z => z.medewerker_id === m.id && z.van <= slot.datum && (!z.tot || z.tot >= slot.datum))) return { ok: false, redenen: ['ziek gemeld'] };
    const ob = ctx.onbeschikbaar.find(b => b.medewerker_id === m.id && b.datum === slot.datum && onbeschikbaarDeel(b.deel, slot));
    if (ob) return { ok: false, redenen: ['heeft aangegeven niet te kunnen'] };
    // Uitvraag zalencentrum
    const ev = slot.event_id && ctx.events[slot.event_id];
    let reactieKan = false;
    if (ev && ev.uitvraag) {
      const r = (ctx.reacties[ev.id] || {})[m.id];
      if (r === false) return { ok: false, redenen: ['heeft gezegd niet te kunnen'] };
      if (G.isOproep(m) && r !== true && !opties.negeerUitvraag) return { ok: false, redenen: [r === undefined ? 'heeft niet gereageerd' : 'niet beschikbaar'] };
      reactieKan = r === true;
    }
    const p = ctx.perMw[m.id] || { diensten: [], uren: {}, dagenWeek: {} };
    if (p.diensten.some(d => d !== slot && d.id !== slot.id && G.overlap(d, slot))) return { ok: false, redenen: ['werkt dan al'] };
    const wk = G.weekStart(slot.datum);
    const dagen = p.dagenWeek[wk] || new Set();
    if (!dagen.has(slot.datum) && dagen.size >= (+m.max_dagen_week || 7)) return { ok: false, redenen: ['max. dagen per week bereikt'] };

    // Score (hoger = beter)
    const maand = G.monthOf(slot.datum);
    const doel = G.doelUren(m, maand);
    const gepland = p.uren[maand] || 0;
    const uren = G.hours(slot.start, slot.eind);
    let score = 0;
    if (doel > 0) {
      const tekort = doel - gepland;
      score += Math.max(-60, Math.min(60, tekort * 1.5));            // wie nog uren tekort heeft eerst
      if (gepland + uren > doel * 1.1) { score -= 70; redenen.push('komt boven contracturen'); }
    } else {
      // Oproepkrachten pas als vast personeel aan zijn uren zit, en dan eerlijk verdeeld:
      // wie de afgelopen/komende 3 maanden het minst heeft gewerkt, gaat voor.
      const van = G.addDays(slot.datum, -90), tot = G.addDays(slot.datum, 90);
      const recent = p.diensten.filter(d => d.datum >= van && d.datum <= tot).reduce((s, d) => s + G.hours(d.start, d.eind), 0);
      score -= 75 + recent * 0.6 + Math.random() * 1.5;               // klein toeval i.p.v. alfabet of wie eerst reageerde
      redenen.push('oproepkracht · ' + Math.round(recent) + ' u in 3 mnd');
    }
    if (reactieKan) redenen.unshift('heeft gezegd te kunnen');
    if ((m.vaste_dagen || []).map(Number).includes(wd)) { score += 80; redenen.unshift('vaste werkdag'); }
    if (vl && vl.status === 'aangevraagd') { score -= 90; redenen.push('heeft vrij aangevraagd'); }
    if (dagen.has(slot.datum)) { score -= 65; redenen.push('tweede dienst die dag'); }
    // gisteren laat gewerkt en vandaag vroeg? kleine straf
    const gisteren = G.addDays(slot.datum, -1);
    if (p.diensten.some(d => d.datum === gisteren && (G.min(d.eind) <= G.min(d.start) || G.min(d.eind) >= 23 * 60)) && G.min(slot.start) < 12 * 60) {
      score -= 25; redenen.push('gisteren laat');
    }
    return { ok: true, score, redenen };
  };

  // Kandidatenlijst voor een dienst (ook voor de keuzelijst in beheer)
  G.kandidaten = function (ctx, slot, opties) {
    return (ctx.data.medewerkers || []).map(m => ({ m, ...G.beoordeel(ctx, m, slot, opties) }))
      .sort((a, b) => (b.ok - a.ok) || ((b.score || 0) - (a.score || 0)) || a.m.naam.localeCompare(b.m.naam));
  };

  // Slots verdelen
  G.plan = function (slots, data, bestaande, opties) {
    opties = opties || {};
    const ctx = G.context(data, bestaande);
    const meldingen = [];
    // Volgorde: eerst diensten met weinig kandidaten, dan op datum/tijd
    const metAantal = slots.map(s => ({ s, n: (data.medewerkers || []).filter(m => G.beoordeel(ctx, m, s).ok).length }));
    metAantal.sort((a, b) => (a.s.datum < b.s.datum ? -1 : a.s.datum > b.s.datum ? 1 : 0) || a.n - b.n || G.min(a.s.start) - G.min(b.s.start));
    // per week: schaarste eerst
    const result = [];
    const perWeek = {};
    metAantal.forEach(x => { const w = G.weekStart(x.s.datum); (perWeek[w] = perWeek[w] || []).push(x); });
    Object.keys(perWeek).sort().forEach(w => perWeek[w].sort((a, b) => a.n - b.n || (a.s.datum < b.s.datum ? -1 : 1)));
    for (const w of Object.keys(perWeek).sort()) {
      for (const { s } of perWeek[w]) {
        const dienst = { id: G.uuid(), maand: G.monthOf(s.datum), datum: s.datum, locatie: s.locatie, event_id: s.event_id || null, start: s.start, eind: s.eind, functie: s.functie, medewerker_id: null, notitie: '' };
        const kand = G.kandidaten(ctx, dienst).filter(k => k.ok);
        if (kand.length) {
          dienst.medewerker_id = kand[0].m.id;
          G.registreer(ctx, dienst);
        } else {
          meldingen.push('Geen geschikte medewerker voor ' + s.functie + ' op ' + s.datum + ' (' + s.start + '-' + s.eind + ', ' + s.locatie + ')');
        }
        result.push(dienst);
      }
    }
    result.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || G.min(a.start) - G.min(b.start) || a.locatie.localeCompare(b.locatie));
    // urencheck
    const maanden = opties.geenUrencheck ? [] : [...new Set(slots.map(s => G.monthOf(s.datum)))];
    for (const maand of maanden) for (const m of (data.medewerkers || []).filter(m => m.actief !== false && +m.contracturen > 0)) {
      const doel = G.doelUren(m, maand), gepland = (ctx.perMw[m.id] && ctx.perMw[m.id].uren[maand]) || 0;
      if (gepland < doel * 0.85) meldingen.push(m.naam + ': ' + Math.round(gepland) + ' van ~' + Math.round(doel) + ' uur ingepland in ' + maand);
    }
    return { diensten: result, meldingen };
  };

  // Complete maand maken. Bestaande diensten uit andere maanden tellen mee voor overlap.
  G.generateMonth = function (maand, data) {
    const slots = G.buildSlots(maand, data);
    // andere maanden + diensten van feesten die al via de uitvraag zijn vastgezet tellen mee
    const elders = (data.diensten || []).filter(d => d.maand !== maand || G.dienstVast(d, data));
    return G.plan(slots, data, elders);
  };

  // Uitvraag afsluiten: alle feesten in één keer verdelen (eerlijk over de datums heen)
  G.planEvents = function (events, data) {
    const ids = new Set(events.map(e => e.id));
    const slots = [];
    for (const e of events) slots.push(...G.eventSlots(e));
    const bestaande = (data.diensten || []).filter(d => !ids.has(d.event_id));
    return G.plan(slots, data, bestaande, { geenUrencheck: true });
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
