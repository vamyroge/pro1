// Data access layer. Tries Supabase first; if it errors, falls back to in-memory mock store.
// This allows the UI to work in environments where the DB is not yet provisioned,
// while keeping the real Supabase code path as the default.

const { supabase } = require('./supabase');
const mock = require('./mockStore');

let mode = 'supabase'; // 'supabase' or 'mock'
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  if (process.env.USE_MOCK === '1' || process.env.USE_MOCK === 'true') {
    mode = 'mock';
    await mock.seedIfEmpty();
    console.warn('[db] USE_MOCK=1 set: running with in-memory mock store.');
    return;
  }
  try {
    const { error } = await supabase.from('books').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      console.warn('[db] Supabase unavailable, using in-memory mock store:', error.message);
      mode = 'mock';
      await mock.seedIfEmpty();
    }
  } catch (e) {
    console.warn('[db] Supabase connection failed, using in-memory mock store:', e.message);
    mode = 'mock';
    await mock.seedIfEmpty();
  }
  if (mode === 'mock') {
    console.warn('[db] Running with MOCK data. Set up Supabase to persist real data.');
  }
}

function isMock() { return mode === 'mock'; }
function useMock() { mode = 'mock'; if (!initialized) { initialized = true; mock.seedIfEmpty(); } }

module.exports = { supabase, mock, init, isMock, useMock };
