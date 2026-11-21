// Regress cancellation, retained-session reuse and identity boundaries without real accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadPlugin, ok } from './harness.js';

const old = { uid: '12345', token: 'old-fixture' };
const next = { id: '67890', token: 'next-fixture', userInfo: { id: '67890', nickname: '新账号' } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const pathOf = url => url.pathname.replace('/api/', '');

for (const platform of ['darwin', 'ios', 'android']) {
  test(`${platform}: logout retains data, anonymous requests omit tokens and explicit login validates reuse`, async () => {
    const fixture = await loadPlugin({ storage: { session: old }, handler: (url, init) => {
      if (pathOf(url) === 'ucenter/users/login') {
        assert.equal(init.method, 'GET');
        assert.equal(url.searchParams.get('token'), old.token);
        const q = new URLSearchParams(url.search); const sign = q.get('sign'); q.delete('sign');
        const seed = 'kuwotest' + [...q.toString()].filter(char => /[a-z0-9]/i.test(char)).sort().join('') + '/api/ucenter/users/login';
        assert.equal(sign, createHash('md5').update(seed).digest('hex'));
        return ok({ id: old.uid, token: old.token, userInfo: { id: old.uid } });
      }
      if (pathOf(url).startsWith('ucenter/users/pub/')) return ok({ userInfo: { id: old.uid, nickname: '原账号' } });
      return ok({ resultList: [] });
    } });
    globalThis.host.platform = platform;
    fixture.mod.signOut();
    assert.deepEqual(fixture.storage.get('session'), old);
    assert.equal(await fixture.mod.account(), null);
    await fixture.mod.search({ query: 'fixture' });
    assert.equal(fixture.calls[0].headers.token, undefined);
    assert.equal(fixture.calls[0].url.searchParams.has('token'), false);
    assert.equal((await fixture.mod.signIn()).id, old.uid);
    assert.equal(fixture.prompts.length, 0);
    assert.equal(fixture.storage.get('session.active'), true);
  });
}

for (const stage of ['headers', 'body', 'timer', 'exchange', 'profile']) {
  test(`cancel at ${stage} leaves the old account disabled and ignores delayed replies`, async () => {
    const entered = deferred(), late = deferred();
    let signal;
    const fixture = await loadPlugin({ storage: { session: old, 'session.active': false }, handler: async (url, init) => {
      const path = pathOf(url);
      if (path === 'ucenter/users/login' && init.method === 'GET') return { code: 11012 };
      const target = stage === 'exchange' ? 'ucenter/users/login' : stage === 'profile' ? 'ucenter/users/pub/67890' : 'ucenter/login/qrCode';
      if (path === target && stage !== 'timer') {
        signal = init.signal;
        entered.resolve();
        if (stage === 'body') return { __response: { status: 200, body: 'placeholder' } };
        return late.promise;
      }
      if (path === 'ucenter/login/qrCode') return ok({ qrCode: 'fixture' });
      if (path === 'ucenter/login/qrCodeStatus') return ok({ status: 3 });
      if (path === 'ucenter/users/login') return ok(next);
      if (path === 'ucenter/users/pub/67890') return ok({ userInfo: next.userInfo });
      throw Error('Unexpected route');
    } });
    if (stage === 'timer') globalThis.host.signInPrompt = prompt => { if (prompt.qr) entered.resolve(); };
    if (stage === 'body') {
      const fetch = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        const response = await fetch(...args);
        if (String(args[0]).includes('/qrCode?') || String(args[0]).endsWith('/qrCode')) return { ...response, json: () => { entered.resolve(); return late.promise; } };
        return response;
      };
    }
    const pending = assert.rejects(fixture.mod.signIn(), error => error.code === 'canceled');
    await entered.promise;
    await new Promise(resolve => setImmediate(resolve));
    fixture.mod.cancelSignIn();
    await pending;
    if (signal) assert.equal(signal.aborted, true);
    assert.deepEqual(fixture.storage.get('session'), old);
    assert.equal(fixture.storage.get('session.active'), false);
    const count = fixture.calls.length;
    late.resolve(ok(stage === 'exchange' ? next : stage === 'profile' ? { userInfo: next.userInfo } : { qrCode: 'late' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.calls.length, count);
    assert.deepEqual(fixture.storage.get('session'), old);
  });
}

test('a mismatched QR account cannot overwrite the saved account', async () => {
  const fixture = await loadPlugin({ storage: { session: old, 'session.active': false }, handler: (url, init) => {
    const path = pathOf(url);
    if (path === 'ucenter/users/login' && init.method === 'GET') return { code: 11012 };
    if (path === 'ucenter/login/qrCode') return ok({ qrCode: 'fixture' });
    if (path === 'ucenter/login/qrCodeStatus') return ok({ status: 3 });
    if (path === 'ucenter/users/login') return ok({ ...next, userInfo: { id: '123' } });
    throw Error('Unexpected request');
  } });
  await assert.rejects(fixture.mod.signIn(), error => error.code === 'invalid');
  assert.deepEqual(fixture.storage.get('session'), old);
  assert.equal(fixture.storage.get('session.active'), false);
});

test('a public profile cannot validate a saved token when credential validation fails', async () => {
  const fixture = await loadPlugin({ storage: { session: old, 'session.active': false }, handler: url => {
    if (pathOf(url) === 'ucenter/users/login') return { __response: { status: 500, body: '{}' } };
    if (pathOf(url) === 'ucenter/login/qrCode') return ok({ qrCode: 'fixture' });
    assert.fail('Public profile must not be used as token validation');
  } });
  const shown = deferred(); globalThis.host.signInPrompt = value => { if (value.qr) shown.resolve(); };
  const pending = assert.rejects(fixture.mod.signIn(), error => error.code === 'canceled');
  await shown.promise; fixture.mod.cancelSignIn(); await pending;
  assert.deepEqual(fixture.storage.get('session'), old);
});

test('a late account profile after logout cannot restore the visible account', async () => {
  const entered = deferred(), late = deferred();
  const fixture = await loadPlugin({ storage: { session: old }, handler: () => { entered.resolve(); return late.promise; } });
  const pending = fixture.mod.account(); await entered.promise; fixture.mod.signOut();
  late.resolve(ok({ userInfo: { id: old.uid, nickname: 'late' } }));
  assert.equal(await pending, null);
  assert.deepEqual(fixture.storage.get('session'), old);
});
