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
  function supabaseStore(url, key) {
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
    function filterQs(f) {
      return Object.entries(f).map(([k, v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
    }
    return {
      modus: 'supabase',
      async all(t) {
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
        const arr = (Array.isArray(rows) ? rows : [rows]).map(r => (r.id || t === 'instellingen') ? r : { ...r, id: uuid() });
        if (!arr.length) return [];
        const out = [];
        for (let i = 0; i < arr.length; i += 500) out.push(...await req('POST', t, arr.slice(i, i + 500)));
        return out;
      },
      async update(t, id, patch) { return (await req('PATCH', t + '?id=eq.' + encodeURIComponent(id), patch))[0]; },
      async remove(t, id) { await req('DELETE', t + '?id=eq.' + encodeURIComponent(id)); },
      async removeWhere(t, f) { await req('DELETE', t + '?' + filterQs(f)); }
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
  store.TABELLEN = TABELLEN;

  // Alles in één keer laden
  store.loadAll = async function () {
    const res = await Promise.all(TABELLEN.map(t => store.all(t).catch(e => { console.error(t, e); throw e; })));
    const d = {};
    TABELLEN.forEach((t, i) => d[t] = res[i]);
    d.instellingen = d.instellingen[0] || null;
    return d;
  };

  root.Store = store;
  if (typeof module !== 'undefined') module.exports = { supabaseStore, demoStore, uuid };
})(typeof window !== 'undefined' ? window : globalThis);
