// eval/vapi-key-check.ts
// Verify your VAPI keys are wired correctly. Runs three probes:
//   1. PRIVATE key — list one assistant (must return JSON).
//   2. PUBLIC key  — POST /call/web (must return 200 with webCallUrl).
//   3. Asserts the two keys are different (the common mistake).
//
// Run after editing .env.local:
//   set -a && . ./.env.local && set +a && deno run --allow-env --allow-net eval/vapi-key-check.ts

const PUBLIC = Deno.env.get('VITE_VAPI_PUBLIC_KEY');
const PRIVATE = Deno.env.get('VAPI_API_KEY');
const ASSISTANT_HI = Deno.env.get('VITE_VAPI_ASSISTANT_ID_HI');

if (!PUBLIC || !PRIVATE || !ASSISTANT_HI) {
  console.error('Missing VITE_VAPI_PUBLIC_KEY / VAPI_API_KEY / VITE_VAPI_ASSISTANT_ID_HI');
  Deno.exit(2);
}

if (PUBLIC === PRIVATE) {
  console.log('❌ VITE_VAPI_PUBLIC_KEY and VAPI_API_KEY are IDENTICAL.');
  console.log('   One of them is wrong. Grab the OTHER key from VAPI dashboard');
  console.log('   (https://dashboard.vapi.ai/account) and paste it into .env.local.');
  Deno.exit(1);
}

console.log('Probe 1: PRIVATE key → list assistant');
{
  const r = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_HI}`, {
    headers: { Authorization: `Bearer ${PRIVATE}` },
  });
  const body = await r.text();
  if (r.ok) {
    const name = JSON.parse(body).name;
    console.log(`  ✓ ${r.status} — assistant name: ${name}`);
  } else {
    console.log(`  ❌ ${r.status} — ${body.slice(0, 200)}`);
    Deno.exit(1);
  }
}

console.log('Probe 2: PUBLIC key  → POST /call/web');
{
  const r = await fetch('https://api.vapi.ai/call/web', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PUBLIC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assistantId: ASSISTANT_HI }),
  });
  const body = await r.text();
  if (r.ok) {
    const json = JSON.parse(body);
    console.log(`  ✓ ${r.status} — webCallUrl: ${(json.webCallUrl ?? '').slice(0, 60)}…`);
    console.log('\n🎉 Both keys are correctly wired. Frontend mic button will work.');
  } else {
    console.log(`  ❌ ${r.status} — ${body.slice(0, 200)}`);
    console.log('\nThis is the bug. VITE_VAPI_PUBLIC_KEY is wrong — grab the PUBLIC key');
    console.log('from VAPI dashboard (https://dashboard.vapi.ai/account) and replace it.');
    Deno.exit(1);
  }
}
