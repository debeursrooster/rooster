// =====================================================================
//  Pushmeldingen (web push) en "App installeren"
//  - Android/Chrome: knop "App installeren"
//  - iPhone/iPad: uitleg "Zet op beginscherm" (push werkt op iOS alleen vanaf het beginscherm)
//  Abonnementen worden in Supabase bewaard (tabel push_abonnementen via rpc).
//  Het versturen gebeurt in Supabase: elke nieuwe rij in "meldingen" gaat als push naar de telefoon.
// =====================================================================
(function () {
  const cfg = window.ROOSTER_CONFIG || {};
  const P = window.Push = {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  P.isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  P.isAndroid = () => /Android/i.test(navigator.userAgent);
  P.standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  P.ondersteund = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // ---------- installeren ----------
  let installPrompt = null;
  const luisteraars = [];
  const meld = () => luisteraars.forEach(f => { try { f(); } catch (e) { } });
  P.opWijziging = f => luisteraars.push(f);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; meld(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; meld(); });
  P.kanInstalleren = () => !!installPrompt;
  P.installeren = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const keuze = await installPrompt.userChoice.catch(() => ({}));
    installPrompt = null; meld();
    return keuze.outcome === 'accepted';
  };

  // ---------- service worker ----------
  let regBelofte = null;
  P.registratie = () => regBelofte || (regBelofte = navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }));
  if ('serviceWorker' in navigator) P.registratie().catch(e => console.warn('Service worker', e));

  const demo = () => window.Store && Store.modus === 'demo';
  const sleutel = b64 => {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };
  async function rpc(naam, args) {
    const res = await fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + naam, {
      method: 'POST',
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    if (!res.ok) throw new Error('Database-fout (' + res.status + '): ' + await res.text());
  }

  // 'aan' | 'uit' | 'geblokkeerd' | 'ios-beginscherm' | 'niet-ondersteund' | 'demo' | 'geen-sleutel'
  P.status = async rol => {
    if (demo()) return 'demo';
    if (!cfg.VAPID_PUBLIC_KEY) return 'geen-sleutel';
    if (P.isIOS() && !P.standalone()) return 'ios-beginscherm';
    if (!P.ondersteund()) return 'niet-ondersteund';
    if (Notification.permission === 'denied') return 'geblokkeerd';
    try {
      const reg = await P.registratie();
      const sub = await reg.pushManager.getSubscription();
      return sub && Notification.permission === 'granted' && localStorage.getItem('push_' + rol) === 'aan' ? 'aan' : 'uit';
    } catch (e) { return 'uit'; }
  };

  P.aanzetten = async (rol, medewerkerId) => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'geblokkeerd' : 'geweigerd');
    const reg = await P.registratie();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutel(cfg.VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const args = { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_rol: rol, p_medewerker: medewerkerId || null };
    // Sinds beveiliging.sql controleert de database ook hier de code; vóór die update bestaat p_pin nog niet
    const pin = rol === 'beheer' ? sessionStorage.getItem('rooster_admin_pin') : localStorage.getItem('rooster_pin');
    try { await rpc('push_aanmelden', pin ? { ...args, p_pin: pin } : args); }
    catch (e) { if (pin && /PGRST202|\(404\)/.test(e.message)) await rpc('push_aanmelden', args); else throw e; }
    localStorage.setItem('push_' + rol, 'aan');
    localStorage.removeItem('push_uit_' + rol);
  };

  P.uitzetten = async rol => {
    localStorage.removeItem('push_' + rol);
    if (demo() || !('serviceWorker' in navigator)) return;
    try {
      const reg = await P.registratie();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await rpc('push_afmelden', { p_endpoint: sub.endpoint, p_rol: rol });
      if (!localStorage.getItem('push_beheer') && !localStorage.getItem('push_personeel')) await sub.unsubscribe();
    } catch (e) { console.warn(e); }
  };

  // Bij het openen en na inloggen: abonnement opnieuw doorgeven (bv. andere medewerker op dit toestel, of nieuwe sleutels).
  // Heeft dit toestel al toestemming gegeven en zijn de meldingen niet bewust uitgezet, dan gaan ze vanzelf weer aan.
  P.vernieuw = async (rol, medewerkerId) => {
    const st = await P.status(rol);
    const weerAan = st === 'uit' && Notification.permission === 'granted' && localStorage.getItem('push_uit_' + rol) !== '1';
    if (st === 'aan' || weerAan) { try { await P.aanzetten(rol, medewerkerId); } catch (e) { console.warn(e); } }
    if (weerAan) meld();
  };

  // ---------- het instelpaneel ----------
  // opties: { rol: 'personeel'|'beheer', medewerkerId, onTest: async () => {}, compact: bool, onSluit: () => {} }
  P.paneel = async function (el, opties) {
    if (!el) return;
    const o = opties || {};
    const status = await P.status(o.rol);
    const sa = P.standalone(), ios = P.isIOS();
    const naamApp = o.rol === 'beheer' ? 'Beheer' : 'Rooster';

    let install = '';
    if (!sa && ios) {
      install = `<div class="push-blok">
        <b>📲 App op je iPhone zetten</b>
        <ol class="push-stappen">
          <li>Open deze pagina in <b>Safari</b>.</li>
          <li>Tik onderaan op de <b>Deel-knop</b> <span class="push-ic" aria-hidden="true">⬆︎</span> (vierkantje met pijl omhoog).</li>
          <li>Scroll naar beneden en kies <b>Zet op beginscherm</b>, en tik op <b>Voeg toe</b>.</li>
          <li>Open de app <b>${naamApp}</b> vanaf je beginscherm en zet daar de meldingen aan.</li>
        </ol>
        <small class="zacht">Op een iPhone werken meldingen alleen in de app op het beginscherm (iOS 16.4 of nieuwer).</small></div>`;
    } else if (!sa && P.kanInstalleren()) {
      install = `<div class="push-blok"><b>📲 App installeren</b><p class="zacht">Zet ${o.rol === 'beheer' ? 'het beheer' : 'het rooster'} als app op je telefoon, dan heb je het altijd bij de hand.</p>
        <button class="knop primair" data-push="installeer">📲 App installeren</button></div>`;
    } else if (!sa && P.isAndroid()) {
      install = `<div class="push-blok"><b>📲 App installeren</b><p class="zacht" style="margin:0">Tik in Chrome rechtsboven op <b>⋮</b> en kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</p></div>`;
    }

    let push = '';
    if (status === 'aan') push = `<div class="push-blok aan"><b>🔔 Meldingen staan aan</b> <span class="zacht">op dit apparaat</span>
        <div class="push-knoppen">${o.onTest ? '<button class="knop klein" data-push="test">Testmelding</button>' : ''}<button class="knop klein plat" data-push="uit">Uitzetten</button></div></div>`;
    else if (status === 'uit') push = `<div class="push-blok"><b>🔔 Meldingen op je telefoon</b><p class="zacht">${o.rol === 'beheer'
        ? 'Krijg direct een bericht bij een vrij-aanvraag, ruil, ziekmelding of een rooster dat klaarstaat.'
        : 'Krijg direct een bericht als het rooster klaarstaat, iemand met je wil ruilen of er een feest is waarvoor je gevraagd wordt.'}</p>
        <button class="knop primair" data-push="aan">🔔 Meldingen aanzetten</button></div>`;
    else if (status === 'geblokkeerd') push = `<div class="push-blok let"><b>🔕 Meldingen zijn geblokkeerd</b><p class="zacht" style="margin:0">Je hebt eerder "Niet toestaan" gekozen. ${ios
        ? 'Ga naar <b>Instellingen → Meldingen → ' + naamApp + '</b> en zet <b>Sta meldingen toe</b> aan.'
        : 'Tik op het slotje of ⓘ naast het webadres (of houd het app-icoon ingedrukt → <b>App-info</b>), kies <b>Meldingen</b> en zet ze aan. Kom daarna terug en ververs de pagina.'}</p></div>`;
    else if (status === 'ios-beginscherm') push = install ? '' : `<div class="push-blok"><b>🔔 Meldingen</b><p class="zacht" style="margin:0">Zet de app eerst op je beginscherm.</p></div>`;
    else if (status === 'niet-ondersteund') push = `<div class="push-blok"><b>🔔 Meldingen</b><p class="zacht" style="margin:0">Deze browser kan geen meldingen ontvangen. Gebruik <b>Chrome</b> op Android of <b>Safari</b> op de iPhone.</p></div>`;
    else if (status === 'demo') push = `<div class="push-blok"><b>🔔 Meldingen</b><p class="zacht" style="margin:0">Werkt pas als de app aan de database gekoppeld is (niet in demo-modus).</p></div>`;
    else if (status === 'geen-sleutel') push = `<div class="push-blok"><b>🔔 Meldingen</b><p class="zacht" style="margin:0">Vul <code>VAPID_PUBLIC_KEY</code> in bij <code>js/config.js</code>.</p></div>`;

    if (o.verbergAlsAan && status === 'aan') push = '';
    if ((o.compact || o.verbergAlsAan) && !install && (status === 'aan' || !push)) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="paneel push-paneel">${o.compact ? '<button class="icoon push-weg" data-push="later" aria-label="Later">✕</button>' : ''}${install}${push}</div>`;

    const knop = n => el.querySelector('[data-push="' + n + '"]');
    const opnieuw = () => P.paneel(el, o);
    if (knop('installeer')) knop('installeer').onclick = async () => { await P.installeren(); opnieuw(); };
    if (knop('aan')) knop('aan').onclick = async e => {
      e.target.disabled = true; e.target.textContent = 'Even geduld…';
      try {
        await P.aanzetten(o.rol, o.medewerkerId);
        toast('Meldingen staan aan', 'ok');
        if (o.onTest) await o.onTest();
      } catch (x) {
        console.warn(x);
        toast(x.message === 'geblokkeerd' || x.message === 'geweigerd' ? 'Geen toestemming voor meldingen' : 'Aanzetten lukte niet: ' + x.message, 'fout');
      }
      opnieuw();
    };
    if (knop('uit')) knop('uit').onclick = async () => { await P.uitzetten(o.rol); localStorage.setItem('push_uit_' + o.rol, '1'); toast('Meldingen staan uit op dit apparaat'); opnieuw(); };
    if (knop('test')) knop('test').onclick = async e => {
      e.target.disabled = true;
      try { await o.onTest(); toast('Testmelding verstuurd – kijk over een paar seconden op je telefoon', 'ok'); }
      catch (x) { toast('Versturen mislukt: ' + x.message, 'fout'); }
      e.target.disabled = false;
    };
    if (knop('later')) knop('later').onclick = () => { localStorage.setItem('push_later_' + o.rol, String(Date.now())); el.innerHTML = ''; if (o.onSluit) o.onSluit(); };
  };
  // Is de herinnering "later" nog geldig? (14 dagen)
  P.later = rol => Date.now() - (+localStorage.getItem('push_later_' + rol) || 0) < 14 * 864e5;

  function toast(t, s) { if (window.App && App.toast) App.toast(t, s); }
  P.esc = esc;
})();
