(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const client = () => window.pw53GetClient?.() || null;
  const status = message => { if ($('team-status')) $('team-status').textContent = message; };
  let user = null;
  let companies = [];
  let activeCompany = null;
  let members = [];

  async function call(action, args = {}) {
    const c = client();
    if (!c) throw new Error('Połączenie z kontem staging nie jest gotowe.');
    const { data, error } = await c.functions.invoke('pw-api', { body: { action, ...args } });
    if (error) {
      let message = error.message || 'Błąd połączenia.';
      try {
        const body = await error.context?.json?.();
        if (body?.error) message = body.error;
      } catch (_) {}
      throw new Error(message);
    }
    return data || {};
  }

  function setVisible(id, value) {
    const node = $(id);
    if (node) node.hidden = !value;
  }

  function clear(node) {
    if (node) node.replaceChildren();
  }

  function card(title, body, meta) {
    const element = document.createElement('article');
    element.className = 'team-card';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const text = document.createElement('p');
    text.textContent = body || '';
    element.append(heading);
    if (body) element.append(text);
    if (meta) {
      const small = document.createElement('small');
      small.textContent = meta;
      element.append(small);
    }
    return element;
  }

  async function loadPendingInvites() {
    const result = await call('pending-invites');
    const host = $('team-pending-list');
    clear(host);
    const invites = result.invitations || [];
    setVisible('team-pending-invites', invites.length > 0);
    invites.forEach(invite => {
      const row = card(invite.companyName, 'Zaproszenie do zespołu PoliczUsługę.');
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'primary';
      accept.textContent = 'Przyjmij zaproszenie';
      accept.addEventListener('click', async () => {
        accept.disabled = true;
        try {
          await call('accept-invite', { companyId: invite.companyId });
          status('Zaproszenie przyjęte. Dostęp do przydzielonych wycen jest aktywny.');
          await refresh();
        } catch (error) {
          status('Nie udało się przyjąć zaproszenia: ' + error.message);
          accept.disabled = false;
        }
      });
      row.append(accept);
      host.append(row);
    });
  }

  function fillEstimateOptions() {
    const select = $('team-estimate-select');
    clear(select);
    let records = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('pw55_local_pewnawycena_saved_estimates_v1') || '[]');
      if (Array.isArray(parsed)) records = parsed.filter(item => item && item.fields && Array.isArray(item.items));
    } catch (_) {}
    records.forEach(record => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = String(record.fields['estimate-number'] || 'Wycena bez numeru') +
        ' · ' + String(record.fields['client-name'] || 'bez klienta');
      select.append(option);
    });
    return records;
  }

  function totalInGrosze(record) {
    const fields = record.fields || {};
    return window.pwQuoteTotals(
      record.items,
      fields.extra,
      fields.margin,
      fields['vat-mode'] || 'exempt',
      fields['vat-rate'] || 0
    ).grossGrosze;
  }

  function scopeFor(record) {
    const description = String(record.fields.description || '').trim();
    const rows = record.items.slice(0, 40).map(item =>
      '• ' + String(item.name || 'Pozycja') + ' — ' +
      String(item.quantity ?? 0) + ' ' + String(item.unit || 'szt.') +
      ' × ' + String(item.rate ?? 0) + ' zł netto'
    );
    const fields = record.fields || {};
    const totals = window.pwQuoteTotals(record.items, fields.extra, fields.margin,
      fields['vat-mode'] || 'exempt', fields['vat-rate'] || 0);
    const money = amount => (amount / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
    const taxLines = [
      'Wartość netto: ' + money(totals.netGrosze),
      totals.vatMode === 'active' ? 'VAT ' + totals.vatRate + '%: ' + money(totals.vatGrosze) : 'VAT: zwolnienie'
    ];
    return [description, ...rows, ...taxLines].filter(Boolean).join('\n').slice(0, 3900);
  }

  function renderTeam(result) {
    activeCompany = result.company;
    members = result.members || [];
    $('team-company-label').textContent = result.company.name + ' · dostęp właściciela';
    const memberHost = $('team-member-list');
    clear(memberHost);
    const active = members.filter(member => member.active);
    if (!active.length) memberHost.append(card('Brak aktywnych pracowników', 'Wyślij zaproszenie na adres e-mail pracownika.'));
    active.forEach(member => {
      const row = card(member.email || member.userId, 'Aktywny dostęp do przydzielonych wycen.');
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'neutral';
      revoke.textContent = 'Cofnij dostęp';
      revoke.addEventListener('click', async () => {
        if (!confirm('Cofnąć dostęp temu pracownikowi?')) return;
        revoke.disabled = true;
        try {
          await call('worker-access', { companyId: activeCompany.id, workerId: member.userId, enabled: false });
          status('Dostęp pracownika cofnięty.');
          await refresh();
        } catch (error) {
          status('Nie udało się cofnąć dostępu: ' + error.message);
          revoke.disabled = false;
        }
      });
      row.append(revoke);
      memberHost.append(row);
    });

    const invitations = result.invitations || [];
    const inviteHost = $('team-invites');
    const inviteSummary = $('team-member-list');
    invitations.filter(item => item.status === 'pending').forEach(invite => {
      const row = card('Zaproszenie: ' + invite.email, 'Oczekuje na zalogowanie i przyjęcie zaproszenia.');
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'neutral';
      revoke.textContent = 'Wycofaj zaproszenie';
      revoke.addEventListener('click', async () => {
        try {
          await call('revoke-invite', { companyId: activeCompany.id, email: invite.email });
          status('Zaproszenie wycofane.');
          await refresh();
        } catch (error) { status('Błąd: ' + error.message); }
      });
      row.append(revoke);
      inviteSummary.append(row);
    });

    const workerSelect = $('team-worker-select');
    clear(workerSelect);
    active.forEach(member => {
      const option = document.createElement('option');
      option.value = member.userId;
      option.textContent = member.email || member.userId;
      workerSelect.append(option);
    });
    fillEstimateOptions();
    setVisible('team-company-panel', true);
    setVisible('team-company-create', false);
    setVisible('team-invites', true);
    setVisible('team-members', true);
    setVisible('team-assignment-form', active.length > 0 && $('team-estimate-select').options.length > 0);
    setVisible('team-worker-view', false);
  }

  async function renderAssignments(company) {
    const result = await call('worker-assignments', { companyId: company.id });
    const host = $('team-assignment-list');
    clear(host);
    const assignments = result.assignments || [];
    if (!assignments.length) host.append(card('Brak przydzielonych wycen', 'Gdy właściciel firmy przydzieli Ci wycenę, pojawi się tutaj.'));
    assignments.forEach(item => {
      const body = [item.scope || '', 'Wartość brutto z VAT: ' + (Number(item.totalGr || 0) / 100).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })].filter(Boolean).join('\n');
      host.append(card(item.title || 'Wycena', body, 'Wersja ' + item.revision));
    });
    $('team-company-label').textContent = company.name + ' · widok pracownika';
    setVisible('team-company-panel', true);
    setVisible('team-company-create', false);
    setVisible('team-invites', false);
    setVisible('team-members', false);
    setVisible('team-assignment-form', false);
    setVisible('team-worker-view', true);
  }

  async function refresh() {
    if (!client() || !user) {
      $('team-auth-message').textContent = 'Zaloguj się na konto staging, aby otworzyć funkcje zespołu.';
      setVisible('team-auth-message', true);
      setVisible('team-company-panel', false);
      setVisible('team-company-create', false);
      return;
    }
    $('team-auth-message').textContent = 'Połączono konto staging.';
    setVisible('team-auth-message', true);
    try {
      const [companyResult] = await Promise.all([call('my-companies')]);
      companies = companyResult.companies || [];
      await loadPendingInvites();
      const owned = companies.find(company => company.role === 'owner');
      if (owned) {
        const result = await call('team-list', { companyId: owned.id });
        renderTeam(result);
        status('Dane zespołu odświeżone.');
        return;
      }
      const worker = companies.find(company => company.role === 'worker');
      if (worker) {
        await renderAssignments(worker);
        status('Przydzielone wyceny odświeżone.');
        return;
      }
      setVisible('team-company-panel', false);
      setVisible('team-company-create', true);
      $('team-company-name').value = '';
      status(companies.length ? 'Wybierz zespół, aby wyświetlić przydzielone wyceny.' : 'Utwórz profil firmy albo przyjmij zaproszenie do zespołu.');
    } catch (error) {
      status('Nie udało się odświeżyć zespołu: ' + error.message);
    }
  }

  $('team-refresh')?.addEventListener('click', refresh);
  $('team-create-company')?.addEventListener('click', async () => {
    const name = $('team-company-name').value.trim();
    if (!name) { status('Wpisz nazwę firmy.'); return; }
    try {
      const companyId = crypto.randomUUID();
      await call('company-create', { companyId, name });
      status('Firma utworzona.');
      await refresh();
    } catch (error) { status('Nie udało się utworzyć firmy: ' + error.message); }
  });
  $('team-send-invite')?.addEventListener('click', async () => {
    const email = $('team-invite-email').value.trim();
    if (!activeCompany || !email) { status('Wpisz adres e-mail pracownika.'); return; }
    const redirect = new URL(location.href);
    redirect.hash = '';
    redirect.search = '';
    try {
      const result = await call('company-invite', { companyId: activeCompany.id, email, redirectTo: redirect.toString() });
      $('team-invite-email').value = '';
      status(result.sent ? 'Zaproszenie wysłane. Pracownik może zalogować się na konto i przyjąć je w zakładce Zespół.' : 'To konto już istnieje. Użytkownik może zalogować się i przyjąć zaproszenie w zakładce Zespół.');
      await refresh();
    } catch (error) { status('Nie udało się wysłać zaproszenia: ' + error.message); }
  });
  $('team-assign')?.addEventListener('click', async () => {
    if (!activeCompany) return;
    const estimateId = $('team-estimate-select').value;
    const workerId = $('team-worker-select').value;
    let records = [];
    try { records = JSON.parse(localStorage.getItem('pw55_local_pewnawycena_saved_estimates_v1') || '[]'); } catch (_) {}
    const record = Array.isArray(records) ? records.find(item => item?.id === estimateId) : null;
    if (!record) { status('Nie znaleziono lokalnej wyceny. Odśwież listę i spróbuj ponownie.'); return; }
    const button = $('team-assign');
    button.disabled = true;
    try {
      const key = 'pw55_local_quote_revision_v1';
      const revisions = JSON.parse(localStorage.getItem(key) || '{}');
      const revision = Math.max(0, Number(revisions[estimateId]) || 0) + 1;
      const totalGr = totalInGrosze(record);
      const offer = await call('create', {
        estimateId, revision, title: String(record.fields['estimate-number'] || 'Wycena'),
        totalGr, scope: scopeFor(record), expiresAt: Date.now() + 14 * 86400000,
        portalUrl: new URL('./klient.html', location.href).toString()
      });
      revisions[estimateId] = revision;
      localStorage.setItem(key, JSON.stringify(revisions));
      await call('worker-assignment', { companyId: activeCompany.id, workerId, estimateId, revision });
      status('Wycena przydzielona. Pracownik widzi wyłącznie tytuł, zakres i kwotę.');
      const link = new URL(offer.url);
      if (link.origin === location.origin && link.pathname.endsWith('/klient.html')) {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'secondary';
        copy.textContent = 'Kopiuj link dla klienta';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(link.toString());
            status('Skopiowano link klienta do schowka.');
          } catch (_) {
            status('Nie udało się skopiować linku. Link: ' + link.toString());
          }
        });
        $('team-status').append(copy);
      }
      await refresh();
    } catch (error) {
      status('Nie udało się przydzielić wyceny: ' + error.message);
    } finally { button.disabled = false; }
  });

  function authChanged(event) {
    user = event?.detail?.id ? { id: event.detail.id, email: event.detail.email || '' } : null;
    if (user) refresh();
    else {
      setVisible('team-company-panel', false);
      setVisible('team-company-create', false);
      setVisible('team-pending-invites', false);
      status('Zaloguj się, aby zarządzać zespołem.');
    }
  }

  window.addEventListener('pw-beta-auth', authChanged);
  if (window.pwBetaAuthState?.id) authChanged({ detail: window.pwBetaAuthState });

  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceStatus = $('voice-status');
  if (!Speech) {
    if (voiceStatus) voiceStatus.textContent = 'Ta przeglądarka nie udostępnia dyktowania. Możesz wpisać opis ręcznie i użyć bezpłatnego kalkulatora.';
  } else {
    const recognition = new Speech();
    recognition.lang = 'pl-PL';
    recognition.interimResults = true;
    recognition.continuous = true;
    let transcript = '';
    recognition.onstart = () => {
      $('voice-start').disabled = true;
      $('voice-stop').disabled = false;
      if (voiceStatus) voiceStatus.textContent = 'Słucham. Podyktuj opis prac.';
    };
    recognition.onresult = event => {
      let current = '';
      for (let i = event.resultIndex; i < event.results.length; i++) current += event.results[i][0].transcript;
      transcript += ' ' + current;
      $('description').value = transcript.trim();
    };
    recognition.onerror = event => {
      if (voiceStatus) voiceStatus.textContent = 'Dyktowanie: ' + (event.error || 'wystąpił błąd') + '. Możesz wpisać opis ręcznie.';
    };
    recognition.onend = () => {
      $('voice-start').disabled = false;
      $('voice-stop').disabled = true;
      if (voiceStatus && transcript.trim()) voiceStatus.textContent = 'Opis zapisany w formularzu. Sprawdź tekst i wybierz „Ułóż kosztorys z opisu”.';
    };
    $('voice-start')?.addEventListener('click', () => {
      transcript = $('description').value.trim() ? $('description').value.trim() + ' ' : '';
      try { recognition.start(); } catch (_) {}
    });
    $('voice-stop')?.addEventListener('click', () => recognition.stop());
    $('voice-generate')?.addEventListener('click', () => {
      if (!$('description').value.trim()) { if (voiceStatus) voiceStatus.textContent = 'Najpierw podyktuj lub wpisz opis prac.'; return; }
      $('generate').click();
      if (voiceStatus) voiceStatus.textContent = 'Utworzono orientacyjne pozycje. Sprawdź ilości i ceny przed zapisaniem lub wysłaniem.';
    });
  }
})();
