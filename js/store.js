// Opslaglaag: Supabase (REST) of demo-modus (localStorage).
// Zelfde functies in beide gevallen: all, insert, update, remove, removeWhere.
(function (root) {
  const TABELLEN = ['instellingen', 'medewerkers', 'cafetaria_diensten', 'sluitingsdagen',
    'zalen_events', 'roosters', 'diensten', 'verlof', 'beschikbaarheid', 'ruilverzoeken',
    'berichten', 'meldingen', 'event_reacties', 'ziekmeldingen'];

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  // ---------- Supabase ----------
  // opties.rest = true: altijd rechtstreeks (alleen voor het automatische rooster met de service_role-sleutel)
  function supabaseStore(url, key, opties) {
    opties = opties || {};
    const base = url.replace(/\/$/, '') + '/rest/v1/';
    const headers = {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    };
    async function req(method, path, body) {
      const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        const t = await res.text();
        throw new Error('Database-fout (' + res.status + '): ' + t);
      }
      const txt = await res.text();
      return txt ? JSON.parse(txt) : [];
    }
    // Nieuwe kolom nog niet in de database (SQL-update nog niet gedraaid)? Dan zonder die kolom opslaan
    // en onthouden, zodat het beheer kan laten zien dat er een update uitgevoerd moet worden.
    const ontbrekend = new Set();
    async function zonderOntbrekend(t, body, doe) {
      for (let poging = 0; ; poging++) {
        try { return await doe(body); }
        catch (e) {
          const m = /Could not find the '([^']+)' column/.exec(e.message);
          if (!m || poging > 8) throw e;
          const kol = m[1];
          console.warn('Kolom ontbreekt in de database, overgeslagen:', t + '.' + kol);
          ontbrekend.add(t + '.' + kol);
          const weg = r => { const c = { ...r }; delete c[kol]; return c; };
          body = Array.isArray(body) ? body.map(weg) : weg(body);
        }
      }
    }
    function filterQs(f) {
      return Object.entries(f).map(([k, v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    }
    // ---------- Beveiligde ingang (supabase/beveiliging.sql) ----------
    // Bestaat de functie rooster_api, dan gaat alles daarlangs met naam + PIN.
    // Bestaat hij nog niet (SQL nog niet uitgevoerd), dan werkt de app zoals vroeger.
    let veilig = opties.rest ? false : null, publiekCache = null, auth = null;
    async function api(body, metAuth) {
      const res = await fetch(base + 'rpc/rooster_api', { method: 'POST', headers, body: JSON.stringify({ p: { ...body, auth: metAuth || auth || {} } }) });
      const txt = await res.text();
      if (!res.ok) {
        if (res.status === 404 || /PGRST202/.test(txt)) { const e = new Error('rooster_api ontbreekt'); e.geenApi = true; throw e; }
        let m = txt; try { m = JSON.parse(txt).message || txt; } catch (x) { }
        throw new Error(/Dat mag niet/.test(m) ? 'Dat mag niet: ' + m : 'Database-fout (' + res.status + '): ' + m);
      }
      const uit = txt ? JSON.parse(txt) : null;
      if (uit && !Array.isArray(uit) && uit.fout) { const e = new Error(uit.fout); e.auth = true; throw e; }
      return uit;
    }
    async function isVeilig() {
      if (veilig !== null) return veilig;
      try { publiekCache = await api({ actie: 'publiek' }); veilig = true; }
      catch (e) { if (e.geenApi) veilig = false; else throw e; }
      return veilig;
    }
    return {
      modus: 'supabase', ontbrekend,
      isVeilig,
      // Namen en bedrijfsnaam voor het inlogscherm (zonder in te loggen)
      async publiek() { if (!await isVeilig()) return null; if (!publiekCache) publiekCache = await api({ actie: 'publiek' }); return publiekCache; },
      // Code controleren op de server. Geeft true/false; null = oude modus, zelf controleren
      async login(a) {
        if (!await isVeilig()) return null;
        try { await api({ actie: 'login' }, a); auth = a; return true; }
        catch (e) { if (e.auth && /Onjuiste/.test(e.message)) return false; throw e; }
      },
      zetAuth(a) { auth = a; },
      // Eén keer de code controleren vóór alles tegelijk wordt opgehaald
      // (anders telt een verouderde code 14 keer als foute poging en volgt meteen een blokkade)
      async controleer() { if (await isVeilig()) await api({ actie: 'login' }); },
      async all(t) {
        if (await isVeilig()) return api({ actie: 'all', tabel: t });
        // PostgREST geeft max 1000 rijen per keer; pagineren
        let out = [], from = 0;
        while (true) {
          const res = await fetch(base + t + '?select=*', { headers: { ...headers, Range: from + '-' + (from + 999) } });
          if (!res.ok) throw new Error('Database-fout (' + res.status + '): ' + await res.text());
          const rows = await res.json();
          out = out.concat(rows);
          if (rows.length < 1000) break;
          from += 1000;
        }
        return out;
      },
      async insert(t, rows) {
        let arr = (Array.isArray(rows) ? rows : [rows]).map(r => (r.id || t === 'instellingen') ? r : { ...r, id: uuid() });
        if (!arr.length) return [];
        const out = [];
        const v = await isVeilig();
        for (let i = 0; i < arr.length; i += 500) out.push(...await zonderOntbrekend(t, arr.slice(i, i + 500),
          deel => v ? api({ actie: 'insert', tabel: t, rows: deel }) : req('POST', t, deel)));
        return out;
      },
      async update(t, id, patch) {
        const v = await isVeilig();
        return (await zonderOntbrekend(t, patch, p => v ? api({ actie: 'update', tabel: t, id: String(id), patch: p }) : req('PATCH', t + '?id=eq.' + encodeURIComponent(id), p)))[0];
      },
      async remove(t, id) { if (await isVeilig()) return void await api({ actie: 'remove', tabel: t, id: String(id) }); await req('DELETE', t + '?id=eq.' + encodeURIComponent(id)); },
      async removeWhere(t, f) { if (await isVeilig()) return void await api({ actie: 'removeWhere', tabel: t, filter: f }); await req('DELETE', t + '?' + filterQs(f)); }
    };
  }

  // ---------- Demo (localStorage) ----------
  function demoStore() {
    const PREFIX = 'roosterdemo_';
    const mem = {};
    function load(t) {
      if (mem[t]) return mem[t];
      try { mem[t] = JSON.parse(localStorage.getItem(PREFIX + t) || '[]'); } catch (e) { mem[t] = []; }
      return mem[t];
    }
    function save(t) { try { localStorage.setItem(PREFIX + t, JSON.stringify(mem[t])); } catch (e) { } }
    const clone = x => JSON.parse(JSON.stringify(x));
    return {
      modus: 'demo',
      async isVeilig() { return false; }, async publiek() { return null; }, async login() { return null; }, zetAuth() { },
      async all(t) { return clone(load(t)); },
      async insert(t, rows) {
        const arr = (Array.isArray(rows) ? rows : [rows]).map(r => ({ ...r, id: r.id || uuid() }));
        load(t).push(...clone(arr)); save(t); return arr;
      },
      async update(t, id, patch) {
        const r = load(t).find(x => x.id == id); if (r) Object.assign(r, clone(patch)); save(t); return r && clone(r);
      },
      async remove(t, id) { mem[t] = load(t).filter(x => x.id != id); save(t); },
      async removeWhere(t, f) {
        mem[t] = load(t).filter(x => !Object.entries(f).every(([k, v]) => String(x[k]) === String(v))); save(t);
      },
      reset() { TABELLEN.forEach(t => { localStorage.removeItem(PREFIX + t); delete mem[t]; }); }
    };
  }

  const cfg = root.ROOSTER_CONFIG || {};
  const store = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY)
    ? supabaseStore(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : demoStore();
  store.uuid = uuid;
  store.ontbrekend = store.ontbrekend || new Set();
  store.TABELLEN = TABELLEN;

  // Alles in één keer laden
  store.loadAll = async function () {
    if (store.controleer) await store.controleer();
    const res = await Promise.all(TABELLEN.map(t => store.all(t).catch(e => { console.error(t, e); throw e; })));
    const d = {};
    TABELLEN.forEach((t, i) => d[t] = res[i]);
    d.instellingen = d.instellingen[0] || null;
    return d;
  };

  root.Store = store;
  if (typeof module !== 'undefined') module.exports = { supabaseStore, demoStore, uuid };
})(typeof window !== 'undefined' ? window : globalThis);
