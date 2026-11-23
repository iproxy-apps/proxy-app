// Maestro JS (runScript). Wipes the local DB and seeds one user through the api test hooks.
// Env: API, EMAIL, PASSWORD, USER_TYPE ('CLIENT' | 'PROXY'), READY ('1' = Stripe account ready).
// Throws on any unexpected status so the flow fails instead of signing in with a stale user.
// Maestro injects `http` and the env values as globals.
/* global http, API, EMAIL, PASSWORD, USER_TYPE, READY */
const api = API
const json = { 'Content-Type': 'application/json' }

const reset = http.post(api + '/__test/reset', { headers: json, body: '{}' })
if (reset.status !== 204) throw new Error('reset failed: ' + reset.status + ' ' + reset.body)

const res = http.post(api + '/__test/seed-user', {
  headers: json,
  body: JSON.stringify({
    email: EMAIL,
    password: PASSWORD,
    userType: USER_TYPE,
    name: USER_TYPE === 'PROXY' ? 'Proxy Baseline' : 'Cliente Baseline',
    stripeAccountReady: READY === '1',
  }),
})
if (res.status !== 201) throw new Error('seed-user failed: ' + res.status + ' ' + res.body)
console.log('seeded ' + USER_TYPE + ' ' + EMAIL)
