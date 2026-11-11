(() => {
  'use strict';
  const PROJECT = 'https://deecwhxxlyswhwtswkyy.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_mEEYlQeIN9w3W4-vnJIUqQ_QGkVfjFs';
  const $ = id => document.getElementById(id);
  const status = message => { $('status').textContent = message; };
  const token = location.hash.slice(1);
  let current = null;
  const money = grosze => (Number(grosze) / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' });

  async function api(body) {
    const response = await fetch(PROJECT + '/functions/v1/pw-api', {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: 'Bearer ' + PUBLISHABLE_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Oferta jest niedostępna.');
    return result;
  }

  function render(offer) {
    current = offer;
    $('title').textContent = offer.title || 'Kosztorys';
    $('scope').textContent = offer.scope || 'Zakres do uzgodnienia z wykonawcą.';
    $('total').textContent = money(offer.totalGr);
    $('expires').textContent = 'Oferta ważna do: ' + new Date(offer.expiresAt).toLocaleString('pl-PL');
    $('offer').classList.remove('hidden');
    if (offer.decision) {
      $('decision').textContent = offer.decision === 'accepted' ? 'Oferta została już zaakceptowana.' : 'Oferta została już odrzucona.';
      $('actions').classList.add('hidden');
    }
  }

  async function decide(value) {
    if (!current) return;
    $('accept').disabled = true;
    $('decline').disabled = true;
    status('Zapisuję Twoją odpowiedź…');
    try {
      const result = await api({ action: 'decide', token, revision: current.revision, value });
      if (result.status === 'recorded' || result.status === 'unchanged') {
        $('decision').textContent = result.decision?.value === 'accepted' ? 'Dziękujemy. Oferta została zaakceptowana.' : 'Zapisaliśmy odmowę przyjęcia oferty.';
        $('actions').classList.add('hidden');
        status('Decyzja zapisana.');
      } else if (result.status === 'already_decided') {
        $('actions').classList.add('hidden');
        status('Ta oferta ma już zapisaną decyzję.');
      } else if (result.status === 'stale' || result.status === 'unavailable') {
        $('actions').classList.add('hidden');
        status('Link wygasł, został wycofany albo dotyczy wcześniejszej wersji. Poproś wykonawcę o aktualną ofertę.');
      } else {
        status('Nie udało się zapisać decyzji. Spróbuj ponownie później.');
        $('accept').disabled = false;
        $('decline').disabled = false;
      }
    } catch (_) {
      status('Nie udało się zapisać decyzji. Sprawdź połączenie i spróbuj ponownie.');
      $('accept').disabled = false;
      $('decline').disabled = false;
    }
  }

  $('accept').addEventListener('click', () => decide('accepted'));
  $('decline').addEventListener('click', () => decide('declined'));

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    status('Link do oferty jest nieprawidłowy. Poproś wykonawcę o nowy link.');
    return;
  }
  api({ action: 'read', token })
    .then(offer => { render(offer); status('Oferta jest dostępna.'); })
    .catch(() => status('Oferta jest niedostępna. Poproś wykonawcę o nowy link.'));
})();
