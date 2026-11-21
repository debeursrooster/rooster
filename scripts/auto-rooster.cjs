// =====================================================================
//  Maakt automatisch het rooster voor volgende maand en handelt de
//  uitvragen van het zalencentrum af (herinnering + inplannen na de termijn).
//  Draait elke ochtend via GitHub Actions (.github/workflows/auto-rooster.yml)
//  Het rekenwerk gebeurt vroeg; de meldingen gaan pas om WACHT_TOT (bv. 09:00)
//  de deur uit, zodat niemand om 6 uur 's ochtends een melding krijgt.
//  Nodig: secrets SUPABASE_URL en SUPABASE_SERVICE_KEY (of SUPABASE_ANON_KEY)
// =====================================================================
const path = require('path');
globalThis.window = undefined;
const G = require(path.join(__dirname, '..', 'js', 'generator.js'));
const { supabaseStore } = require(path.join(__dirname, '..', 'js', 'store.js'));
const Uitvraag = require(path.join(__dirname, '..', 'js', 'uitvraag.js'));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('SUPABASE_URL en SUPABASE_SERVICE_KEY ontbreken'); process.exit(1); }

const TABELLEN = ['instellingen', 'medewerkers', 'cafetaria_diensten', 'sluitingsdagen', 'zalen_events',
  'roosters', 'diensten', 'verlof', 'beschikbaarheid', 'event_reacties'];

function vandaagNL() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Tijd in Nederland als minuten sinds middernacht
function minutenNL() {
  const [u, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number);
  return (u % 24) * 60 + m;
}

(async () => {
  const echt = supabaseStore(URL, KEY);
  // Meldingen worden eerst verzameld en pas later in één keer verstuurd
  const wachtrij = [];
  const store = Object.assign(Object.create(echt), {
    insert: async (t, rows) => {
      if (t === 'meldingen') { wachtrij.push(...(Array.isArray(rows) ? rows : [rows])); return rows; }
      return echt.insert(t, rows);
    }
  });
  await maakRooster(store);

  if (!wachtrij.length) return console.log('Geen meldingen te versturen.');
  const wacht = process.env.WACHT_TOT || '';
  if (/^\d{1,2}:\d{2}$/.test(wacht)) {
    const [u, m] = wacht.split(':').map(Number);
    const minuten = u * 60 + m - minutenNL();
    if (minuten > 0) {
      console.log(`${wachtrij.length} melding(en) klaar. Wachten tot ${wacht} (${minuten} minuten)…`);
      await new Promise(r => setTimeout(r, minuten * 60000));
    }
  }
  const tijd = new Date().toISOString();
  await echt.insert('meldingen', wachtrij.map(r => ({ ...r, tijd })));
  console.log(`${wachtrij.length} melding(en) verstuurd.`);
})().catch(e => { console.error(e); process.exit(1); });

async function maakRooster(store) {
  const data = {};
  for (const t of TABELLEN) data[t] = await store.all(t);
  const ins = data.instellingen[0] || { dagen_voor_einde: 21, auto_publiceren: false };
  data.instellingen = ins;

  const nu = process.env.DATUM || vandaagNL();

  // 1. Uitvragen zalencentrum: herinneringen en inplannen na de termijn
  const uv = await Uitvraag.verwerk(store, data, nu);
  if (uv.herinnerd) console.log(`Herinnering gestuurd aan ${uv.herinnerd} oproepkracht(en).`);
  if (uv.ingepland.length) console.log(`Uitvraag ingepland: ${uv.ingepland.join(', ')} (${uv.open} open).`);

  // 2. Maandrooster (in twee rondes: voorlopig met vaste krachten, daarna uitvraag cafetaria en definitief)
  const acties = await Uitvraag.maandAuto(store, data, nu, { planner: { tijd: 30000, iteraties: 400000 } });
  if (!acties.length) console.log('Maandrooster: niets te doen.');
  for (const a of acties) console.log(`Maandrooster ${a.maand}: ${a.actie}.`);
}
