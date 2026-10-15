import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('native Terms never advertise review-only placeholder status',()=>{
  const view=readFileSync(new URL('../DARCiMobile/Features/Profile/UserSettingsLegalContentView.swift',import.meta.url),'utf8');
  assert(!/Interface copy for review|Final legal terms should be approved/i.test(view));
  assert(view.includes('Link(destination: MobileEnvironment.termsURL())'));
  assert(!view.includes('private let termsSections'));
});

test('SMS consent uses the environment-scoped Terms route, not a redirected old domain',()=>{
  const auth=readFileSync(new URL('../DARCiMobile/Features/Authentication/AuthenticationSignInView.swift',import.meta.url),'utf8');
  assert(auth.includes('MobileEnvironment.termsURL().absoluteString'));
  assert(!auth.includes('https://darciregistry.com/terms'));
});
