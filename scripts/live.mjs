// Anonymous read-only API smoke checks; no account credentials or music writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as plugin from '../index.js';

const network = globalThis.fetch;
globalThis.fetch = (url, options = {}) => network(url, {
  ...options,
  signal: AbortSignal.any([options.signal, AbortSignal.timeout(20000)].filter(Boolean)),
});
const state = new Map();
let qrReady = false;
globalThis.host = {
  platform: 'android', t: text => text, setting: () => '',
  storage: { get: key => state.get(key), set: (key, value) => state.set(key, value) },
  crypto: { md5: text => createHash('md5').update(text).digest('hex') },
  signInPrompt: prompt => {
    if (prompt.qr) { qrReady = true; queueMicrotask(() => plugin.cancelSignIn()); }
  },
};
const check = async (name, run) => { await run(); console.log('PASS', name); };

try {
  const results = {};
  for (const kind of ['tracks', 'artists', 'albums', 'playlists']) {
    await check(`search ${kind}`, async () => {
      results[kind] = await plugin.search({ query: '周杰伦', kind });
      assert.ok(results[kind][kind].length > 0);
      assert.ok(results[kind][kind].every(item => item.id && item.name));
    });
  }
  await check('search pagination', async () => {
    const next = await plugin.search({ query: '周杰伦', kind: 'tracks', offset: 30 });
    assert.ok(next.tracks.length > 0);
    assert.notEqual(next.tracks[0].id, results.tracks.tracks[0].id);
  });
  await check('search suggestions', async () => assert.ok((await plugin.suggest({ query: '周' })).length));
  await check('home sections', async () => {
    const page = await plugin.home();
    assert.ok(page.sections.length);
    assert.ok(page.sections.some(section => section.tracks?.length || section.playlists?.length));
  });
  await check('charts and chart tracks', async () => {
    const page = await plugin.browse({ page: 'charts' });
    const chart = page.sections.flatMap(section => section.playlists || [])[0];
    assert.ok(chart?.id);
    assert.ok((await plugin.playlist({ id: chart.id })).tracks.length);
  });
  await check('public playlist', async () => assert.ok((await plugin.playlist({ id: results.playlists.playlists[0].id })).tracks.length));
  await check('album', async () => assert.ok((await plugin.album({ id: results.albums.albums[0].id })).tracks.length));
  await check('artist', async () => assert.ok((await plugin.artist({ id: results.artists.artists[0].id })).artist.name));
  const track = results.tracks.tracks[0];
  await check('UTF-8 lyrics', async () => assert.match((await plugin.lyrics({ id: track.id })).lrc, /\[\d{2}:\d{2}/));
  await check('comments', async () => assert.ok(Array.isArray((await plugin.comments({ trackId: track.id })).comments)));
  await check('free standard MP3 bytes', async () => {
    // This song has an anonymous stream; paid catalog entries are not bypassed.
    const stream = await plugin.stream({ id: '6678670', quality: 'standard' });
    assert.equal(stream.type, 'mp3');
    const response = await fetch(stream.url, { headers: { ...stream.headers, Range: 'bytes=0-8191' } });
    assert.ok(response.ok);
    const reader = response.body.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    assert.ok(value?.length > 0);
    const mp3 = value[0] === 0x49 && value[1] === 0x44 && value[2] === 0x33
      || value[0] === 0xff && (value[1] & 0xe0) === 0xe0;
    assert.ok(mp3, 'Expected ID3 or MP3 frame bytes');
  });
  await check('official QR preparation and cancellation', async () => {
    await assert.rejects(plugin.signIn(), error => qrReady && error.code === 'canceled');
    assert.equal(state.has('session'), false);
  });
} catch (error) {
  console.error('FAIL', String(error.message).replace(/https?:\/\/\S+/g, '[URL]'));
  process.exitCode = 1;
}
