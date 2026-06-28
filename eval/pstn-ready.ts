// eval/pstn-ready.ts
//
// Pre-flight check before you dial the VAPI PSTN number for the first time.
// Verifies every link in the chain — VAPI assistant config, phone number
// binding, edge function reachability — and reports a punchlist.
//
// Run with:
//   set -a && . ./.env.local && set +a && \
//   deno run --allow-env --allow-net eval/pstn-ready.ts
//
// Exit code 0 = ready to dial. Non-zero = at least one check failed.

const PRIVATE = Deno.env.get('VAPI_API_KEY');
const ASSISTANT_HI = Deno.env.get('VITE_VAPI_ASSISTANT_ID_HI');
const ASSISTANT_TA = Deno.env.get('VITE_VAPI_ASSISTANT_ID_TA');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL');
const AGENT_PHONE = Deno.env.get('AGENT_PHONE_E164');
const VITE_AGENT_DISPLAY = Deno.env.get('VITE_AGENT_PHONE_DISPLAY');

if (!PRIVATE || !ASSISTANT_HI || !SUPABASE_URL) {
  console.error('Missing env: VAPI_API_KEY / VITE_VAPI_ASSISTANT_ID_HI / SUPABASE_URL');
  Deno.exit(2);
}

let failures = 0;
const ok = (s: string) => console.log(`  ✓ ${s}`);
const warn = (s: string) => console.log(`  ⚠ ${s}`);
const bad = (s: string) => { console.log(`  ✗ ${s}`); failures++; };

console.log('\n━━━ 1. VAPI assistant config (Hindi) ━━━');
{
  const r = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_HI}`, {
    headers: { Authorization: `Bearer ${PRIVATE}` },
  });
  if (!r.ok) {
    bad(`fetch assistant: ${r.status} ${(await r.text()).slice(0, 120)}`);
  } else {
    const a = await r.json();
    ok(`name: ${a.name}`);
    if (a.model?.provider === 'custom-llm') ok(`model: custom-llm → ${a.model.url}`);
    else bad(`model.provider expected custom-llm, got ${a.model?.provider}`);
    // Voice + transcriber: report what's there but don't judge — the user's
    // VAPI config is the source of truth (we don't override it from here).
    ok(`transcriber: ${a.transcriber?.provider}${a.transcriber?.model ? ` → ${a.transcriber.model}` : ''}`);
    ok(`voice: ${a.voice?.provider}${a.voice?.voiceId ? ` → ${a.voice.voiceId}` : ''}`);
    const cm = Array.isArray(a.clientMessages) ? a.clientMessages : [];
    if (cm.includes('transcript')) ok(`clientMessages includes transcript`);
    else bad(`clientMessages missing 'transcript' — frontend will be silent`);
  }
}

console.log('\n━━━ 1b. VAPI tool wiring (data-writing tools need a server.url) ━━━');
{
  // A tool whose function writes to our DB MUST carry a tool-level server.url,
  // else VAPI has nowhere to deliver the tool call and the row is never written
  // (this is exactly how capture_consent silently produced consents=0).
  const REQUIRED: Record<string, string> = {
    capture_consent: 'consent-capture',
    escalate_to_doctor: 'red-flag-check',
  };
  const r = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_HI}`, {
    headers: { Authorization: `Bearer ${PRIVATE}` },
  });
  if (!r.ok) {
    bad(`fetch assistant for tools: ${r.status}`);
  } else {
    const a = await r.json();
    const toolIds: string[] = a.model?.toolIds ?? [];
    if (!toolIds.length) bad('assistant has no toolIds — capture_consent / escalate_to_doctor not attached');
    const seen = new Set<string>();
    for (const id of toolIds) {
      const tr = await fetch(`https://api.vapi.ai/tool/${id}`, { headers: { Authorization: `Bearer ${PRIVATE}` } });
      if (!tr.ok) { warn(`tool ${id.slice(0, 8)} fetch ${tr.status}`); continue; }
      const t = await tr.json();
      const name = t.function?.name ?? t.type ?? '(unknown)';
      seen.add(name);
      const need = REQUIRED[name];
      if (need) {
        if (t.server?.url?.includes(need)) ok(`${name} → ${need} ✓`);
        else bad(`${name} has no server.url → ${need} (tool call has nowhere to land; DB row never written)`);
      } else {
        ok(`${name} (no server.url required)`);
      }
    }
    for (const [name, need] of Object.entries(REQUIRED)) {
      if (!seen.has(name)) bad(`required tool '${name}' (→ ${need}) not attached to assistant`);
    }
  }
}

console.log('\n━━━ 2. VAPI phone numbers ━━━');
{
  const r = await fetch('https://api.vapi.ai/phone-number', {
    headers: { Authorization: `Bearer ${PRIVATE}` },
  });
  if (!r.ok) {
    bad(`fetch phone-numbers: ${r.status}`);
  } else {
    const nums = await r.json();
    if (!nums.length) {
      bad('no VAPI phone numbers — buy one at dashboard.vapi.ai/phone-numbers');
    } else {
      for (const n of nums) {
        const bound = n.assistantId === ASSISTANT_HI || n.assistantId === ASSISTANT_TA;
        const tag = n.assistantId === ASSISTANT_HI ? 'Hindi' : n.assistantId === ASSISTANT_TA ? 'Tamil' : '???';
        if (bound) ok(`${n.number} → ${tag}`);
        else warn(`${n.number} → unbound assistant ${n.assistantId ?? '(none)'} — set Hindi in dashboard`);

        if (n.server?.url) {
          if (n.server.url.includes('vapi-webhook')) ok(`  server URL → vapi-webhook ✓`);
          else warn(`  server URL → ${n.server.url} (expected vapi-webhook)`);
        } else {
          warn(`  no server URL set — webhook events will not fire`);
        }

        if (AGENT_PHONE && n.number === AGENT_PHONE) {
          ok(`  matches AGENT_PHONE_E164 ✓`);
        } else if (AGENT_PHONE) {
          warn(`  AGENT_PHONE_E164=${AGENT_PHONE} but VAPI number is ${n.number}`);
        }
      }
    }
  }
}

console.log('\n━━━ 3. Edge function reachability ━━━');
const FUNCTIONS = [
  'vapi-webhook',
  'vapi-custom-llm',
  'sarvam-stt-bridge',
  'sarvam-tts-bridge',
  'process-call-records',
  'triage-score',
  'soap-generate',
  'vaani-signoff',
  'cockpit-feed',
];
for (const fn of FUNCTIONS) {
  const url = `${SUPABASE_URL}/functions/v1/${fn}?healthcheck=1`;
  try {
    const r = await fetch(url, { method: 'GET' });
    // Reachable codes: 200 (healthcheck), 400 (missing body on POST-only),
    // 401 (auth required), 405 (method not allowed) — all confirm the
    // function is deployed and serving.
    if (r.ok || r.status === 400 || r.status === 401 || r.status === 405) ok(`${fn} reachable (${r.status})`);
    else warn(`${fn} unexpected ${r.status}`);
  } catch (e) {
    bad(`${fn} unreachable: ${String(e).slice(0, 80)}`);
  }
}

console.log('\n━━━ 4. Frontend env (Landing + Cockpit show the number) ━━━');
if (VITE_AGENT_DISPLAY) ok(`VITE_AGENT_PHONE_DISPLAY=${VITE_AGENT_DISPLAY}`);
else warn(`VITE_AGENT_PHONE_DISPLAY unset — Landing/Cockpit show "1800 ___ ____" placeholder`);
if (AGENT_PHONE) ok(`AGENT_PHONE_E164=${AGENT_PHONE} (vaani-signoff caller_id)`);
else warn(`AGENT_PHONE_E164 unset — vaani-signoff caller_id will be null`);

console.log('\n━━━ Summary ━━━');
if (failures === 0) {
  console.log('🎉 PSTN dial-in is ready. Test procedure:');
  console.log('  1. Call the VAPI number from your phone');
  console.log('  2. Vaani should greet in Hindi within ~2s');
  console.log('  3. Speak a complaint (e.g. "सीने में दर्द है")');
  console.log('  4. Open /cockpit — a new card should appear within ~10s of hangup');
  console.log('  5. Click → SoapReviewDialog → Approve & Sign');
  console.log('  6. Soul callback audio plays in-cockpit (PSTN dial-out is post-pilot)');
  Deno.exit(0);
} else {
  console.log(`❌ ${failures} blocker(s). Fix above, re-run.`);
  Deno.exit(1);
}
