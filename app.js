import { config } from './config.js';

const { createClient } = window.supabase;

const els = {
  configBanner: document.getElementById('configBanner'),
  authCard: document.getElementById('authCard'),
  app: document.getElementById('app'),
  authStatus: document.getElementById('authStatus'),
  signInBtn: document.getElementById('signInBtn'),
  signOutBtn: document.getElementById('signOutBtn'),
  emailInput: document.getElementById('emailInput'),
  sendMagicLinkBtn: document.getElementById('sendMagicLinkBtn'),
  scheduleInput: document.getElementById('scheduleInput'),
  parseBtn: document.getElementById('parseBtn'),
  loadSampleBtn: document.getElementById('loadSampleBtn'),
  reviewTableBody: document.getElementById('reviewTableBody'),
  saveScheduleBtn: document.getElementById('saveScheduleBtn'),
  addRowBtn: document.getElementById('addRowBtn'),
  displayNameInput: document.getElementById('displayNameInput'),
  gradYearInput: document.getElementById('gradYearInput'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  mySchedule: document.getElementById('mySchedule'),
  overlapSummary: document.getElementById('overlapSummary'),
  classBlockView: document.getElementById('classBlockView'),
  toast: document.getElementById('toast'),
};

const SAMPLE = `OG_ 8300 1-2a__OBGYN Clerkship...................4/13-5/10/26..... Assigned .... 3/4/2026
PYC 8300 1-2b__Psychiatry Clerkship..............5/11-6/7/26...... Assigned .... 3/4/2026
NRL 8300 1-2c__Neurology Clerkship...............6/8-7/2/26....... Assigned .... 3/4/2026
DME 8300 3_____IM Subs Plus Placeholder..........7/7-8/16/26...... Assigned .... 3/4/2026
FMD 8300 4_____Family Medicine Clerkship.........8/17-9/27/26..... Assigned .... 3/4/2026
DME 8386 5_____DME 6 wk Placeholder..............9/28-11/8/26..... Assigned .... 3/4/2026
SUR 8300 6_____Surgery Clerkship.................11/9-12/20/26.... Assigned .... 3/4/2026
MED 8300 7_____Medicine Clerkship................1/4-2/14/27...... Assigned .... 3/4/2026
PED 8300 8_____Pediatrics Clerkship..............2/15-3/28/27..... Assigned .... 3/4/2026`;

let supabase;
let currentUser = null;
let draftRows = [];

init();

async function init() {
  if (!config.supabaseUrl.startsWith('http') || config.supabaseAnonKey.includes('YOUR_SUPABASE')) {
    els.configBanner.classList.remove('hidden');
    els.configBanner.innerHTML = `<strong>Setup needed:</strong> add your Supabase URL and anon key in <code>src/config.js</code>, then redeploy.`;
  }

  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  wireEvents();

  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user ?? null;
  await handleAuthState(currentUser);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    await handleAuthState(currentUser);
  });
}

function wireEvents() {
  els.sendMagicLinkBtn.addEventListener('click', sendMagicLink);
  els.signInBtn.addEventListener('click', () => {
    els.authCard.scrollIntoView({ behavior: 'smooth' });
    els.emailInput.focus();
  });
  els.signOutBtn.addEventListener('click', signOut);
  els.parseBtn.addEventListener('click', parseScheduleFromTextarea);
  els.loadSampleBtn.addEventListener('click', () => {
    els.scheduleInput.value = SAMPLE;
  });
  els.addRowBtn.addEventListener('click', () => {
    draftRows.push(emptyRow());
    renderDraftTable();
  });
  els.saveScheduleBtn.addEventListener('click', saveSchedule);
  els.saveProfileBtn.addEventListener('click', saveProfile);
}

async function handleAuthState(user) {
  const signedIn = Boolean(user);
  els.authStatus.textContent = signedIn ? user.email : 'Signed out';
  els.signOutBtn.classList.toggle('hidden', !signedIn);
  els.app.classList.toggle('hidden', !signedIn);
  els.authCard.classList.toggle('hidden', signedIn);

  if (!signedIn) {
    return;
  }

  if (!isAllowedDomain(user.email)) {
    toast('That email domain is not allowed.');
    await signOut();
    return;
  }

  await ensureProfile(user);
  await loadProfile();
  await loadMySchedule();
  await loadOverlaps();
}

function isAllowedDomain(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  return config.allowedEmailDomains.some((d) => d.toLowerCase() === domain);
}

async function sendMagicLink() {
  const email = els.emailInput.value.trim().toLowerCase();
  if (!email) return toast('Enter your school email.');
  if (!isAllowedDomain(email)) return toast(`Use an approved school email: ${config.allowedEmailDomains.join(', ')}`);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: config.redirectTo },
  });

  if (error) return toast(error.message);
  toast('Check your email for the sign-in link.');
}

async function signOut() {
  await supabase.auth.signOut();
  draftRows = [];
  renderDraftTable();
}

async function ensureProfile(user) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return toast(error.message);

  if (!data) {
    const defaultName = user.email.split('@')[0].replace(/[._]/g, ' ');
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email,
      display_name: toTitle(defaultName),
    });
    if (insertError) toast(insertError.message);
  }
}

async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
  if (error) return toast(error.message);
  els.displayNameInput.value = data.display_name || '';
  els.gradYearInput.value = data.grad_year || '';
}

async function saveProfile() {
  const payload = {
    id: currentUser.id,
    email: currentUser.email,
    display_name: els.displayNameInput.value.trim(),
    grad_year: parseNullableInt(els.gradYearInput.value),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('profiles').upsert(payload);
  if (error) return toast(error.message);
  toast('Profile saved.');
  await loadOverlaps();
}

function parseScheduleFromTextarea() {
  const raw = els.scheduleInput.value.trim();
  if (!raw) return toast('Paste your schedule first.');
  draftRows = parseSchedule(raw);
  renderDraftTable();
  toast(`Parsed ${draftRows.length} rows.`);
}

function parseSchedule(raw) {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean);
}

function parseLine(line) {
  const cleaned = line
    .replace(/\s+Assigned\s*\.*\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/i, '')
    .replace(/\.+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (!dateMatch) return null;

  const [, startMonth, startDay, endMonth, endDay, year2] = dateMatch;
  const year = Number(year2) + 2000;
  const beforeDate = cleaned.slice(0, dateMatch.index).trim();

  const blockAndRotation = beforeDate.match(/^[A-Z_]{2,4}\s+\d{4}\s+([^_\s]+)_+(.+)$/i);
  let block = 'Unknown Block';
  let rotation = beforeDate;

  if (blockAndRotation) {
    block = blockAndRotation[1].trim();
    rotation = cleanRotationName(blockAndRotation[2].trim());
  }

  return {
    block,
    rotation,
    start_date: isoDate(year, startMonth, startDay),
    end_date: isoDate(year, endMonth, endDay),
    site: '',
  };
}

function cleanRotationName(name) {
  return name
    .replace(/\bClerkship\b/gi, 'Clerkship')
    .replace(/\bIM Subs Plus Placeholder\b/gi, 'IM Subs Plus Placeholder')
    .replace(/\bDME 6 wk Placeholder\b/gi, 'DME 6 wk Placeholder')
    .trim();
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function emptyRow() {
  return { block: '', rotation: '', start_date: '', end_date: '', site: '' };
}

function renderDraftTable() {
  if (!draftRows.length) {
    els.reviewTableBody.innerHTML = `<tr><td colspan="6" class="muted">No rows yet.</td></tr>`;
    return;
  }

  els.reviewTableBody.innerHTML = draftRows
    .map((row, index) => `
      <tr>
        <td><input data-field="block" data-index="${index}" value="${escapeHtml(row.block)}" /></td>
        <td><input data-field="rotation" data-index="${index}" value="${escapeHtml(row.rotation)}" /></td>
        <td><input data-field="start_date" data-index="${index}" type="date" value="${escapeHtml(row.start_date)}" /></td>
        <td><input data-field="end_date" data-index="${index}" type="date" value="${escapeHtml(row.end_date)}" /></td>
        <td><input data-field="site" data-index="${index}" value="${escapeHtml(row.site || '')}" placeholder="Add site later" /></td>
        <td><button class="danger" data-action="delete-row" data-index="${index}">Delete</button></td>
      </tr>
    `)
    .join('');

  els.reviewTableBody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const index = Number(e.target.dataset.index);
      const field = e.target.dataset.field;
      draftRows[index][field] = e.target.value;
    });
  });

  els.reviewTableBody.querySelectorAll('[data-action="delete-row"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = Number(e.target.dataset.index);
      draftRows.splice(index, 1);
      renderDraftTable();
    });
  });
}

async function saveSchedule() {
  if (!draftRows.length) return toast('Nothing to save.');

  const cleanedRows = draftRows
    .map((row) => ({
      user_id: currentUser.id,
      block: (row.block || '').trim(),
      rotation: (row.rotation || '').trim(),
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      site: (row.site || '').trim(),
    }))
    .filter((row) => row.block && row.rotation && row.start_date && row.end_date);

  if (!cleanedRows.length) return toast('Add at least one complete row.');

  const { error: deleteError } = await supabase.from('schedule_entries').delete().eq('user_id', currentUser.id);
  if (deleteError) return toast(deleteError.message);

  const { error } = await supabase.from('schedule_entries').insert(cleanedRows);
  if (error) return toast(error.message);

  toast('Schedule saved. You can edit and re-save later anytime.');
  await loadMySchedule();
  await loadOverlaps();
}

async function loadMySchedule() {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('start_date', { ascending: true });

  if (error) return toast(error.message);

  if (!data.length) {
    els.mySchedule.innerHTML = `<p class="muted">No saved schedule yet.</p>`;
    return;
  }

  draftRows = data.map(({ block, rotation, start_date, end_date, site }) => ({ block, rotation, start_date, end_date, site: site || '' }));
  renderDraftTable();

  els.mySchedule.innerHTML = data
    .map((row) => `
      <div class="schedule-card">
        <strong>${escapeHtml(row.block)}</strong> · ${escapeHtml(row.rotation)}<br>
        <span class="muted">${formatDate(row.start_date)} to ${formatDate(row.end_date)}</span><br>
        <span>${escapeHtml(row.site || 'Site not added yet')}</span>
      </div>
    `)
    .join('');
}

async function loadOverlaps() {
  const [{ data: myRows, error: myError }, { data: allRows, error: allError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from('schedule_entries').select('*').eq('user_id', currentUser.id).order('start_date', { ascending: true }),
    supabase.from('schedule_entries').select('*').neq('user_id', currentUser.id).order('start_date', { ascending: true }),
    supabase.from('profiles').select('id, display_name, email').order('display_name', { ascending: true }),
  ]);

  if (myError || allError || profileError) return toast(myError?.message || allError?.message || profileError?.message);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const overlaps = calculateOverlaps(myRows || [], allRows || [], profileMap);
  renderOverlapSummary(overlaps.summary);
  renderClassBlockView(overlaps.byBlock);
}

function calculateOverlaps(myRows, allRows, profileMap) {
  const summary = [];
  const byBlock = new Map();

  for (const mine of myRows) {
    const matches = allRows.filter((other) => datesOverlap(mine.start_date, mine.end_date, other.start_date, other.end_date));
    const detailed = [];

    for (const other of matches) {
      const profile = profileMap.get(other.user_id);
      const label = overlapLabel(mine, other);
      detailed.push({
        userName: profile?.display_name || profile?.email || 'Classmate',
        other,
        label,
      });

      const key = mine.block || 'Unknown Block';
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key).push({
        userName: profile?.display_name || profile?.email || 'Classmate',
        mine,
        other,
        label,
      });
    }

    summary.push({ mine, detailed });
  }

  return { summary, byBlock };
}

function overlapLabel(a, b) {
  const sameBlock = normalize(a.block) === normalize(b.block);
  const sameRotation = normalize(a.rotation) === normalize(b.rotation);
  const sameSite = normalize(a.site) && normalize(a.site) === normalize(b.site);

  if (sameBlock && sameRotation && sameSite) return 'Same block, rotation, and site';
  if (sameBlock && sameRotation) return 'Same block and rotation';
  if (sameBlock && sameSite) return 'Same block and site';
  if (sameBlock) return 'Same block';
  if (sameRotation) return 'Same rotation dates overlap';
  return 'Dates overlap';
}

function renderOverlapSummary(summary) {
  if (!summary.length) {
    els.overlapSummary.innerHTML = `<p class="muted">Save your schedule to see overlaps.</p>`;
    return;
  }

  els.overlapSummary.innerHTML = summary
    .map(({ mine, detailed }) => {
      const inner = detailed.length
        ? detailed
            .map((d) => `<div class="badge">${escapeHtml(d.userName)} — ${escapeHtml(d.label)}</div>`)
            .join('')
        : '<span class="muted">No overlaps found for this block yet.</span>';

      return `
        <div class="overlap-card">
          <strong>${escapeHtml(mine.block)}</strong> · ${escapeHtml(mine.rotation)}<br>
          <span class="muted">${formatDate(mine.start_date)} to ${formatDate(mine.end_date)}</span>
          <div style="margin-top:10px">${inner}</div>
        </div>
      `;
    })
    .join('');
}

function renderClassBlockView(byBlock) {
  if (!byBlock.size) {
    els.classBlockView.innerHTML = `<p class="muted">No class overlap data yet.</p>`;
    return;
  }

  els.classBlockView.innerHTML = Array.from(byBlock.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([block, items]) => `
      <div class="block-card">
        <h3>${escapeHtml(block)}</h3>
        ${items.map((item) => `
          <div style="margin-bottom:10px">
            <strong>${escapeHtml(item.userName)}</strong> — ${escapeHtml(item.other.rotation)}
            <span class="muted">(${formatDate(item.other.start_date)} to ${formatDate(item.other.end_date)})</span>
            <div>${escapeHtml(item.label)}${item.other.site ? ` · ${escapeHtml(item.other.site)}` : ''}</div>
          </div>
        `).join('')}
      </div>
    `)
    .join('');
}

function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

function normalize(value) {
  return (value || '').trim().toLowerCase();
}

function parseNullableInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Unknown date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function toTitle(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}
