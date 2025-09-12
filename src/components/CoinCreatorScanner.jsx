// src/components/CoinCreatorScanner.jsx
import React, { useMemo, useState } from 'react';
import axios from 'axios';
import './CoinCreatorScanner.css';

const DEFAULT_SUI_RPC = 'https://fullnode.mainnet.sui.io:443';

// Canonical coin creation event
const COIN_CREATED_PREFIX = '0x2::coin::CoinCreated';
// Heuristic “creation-ish” names we see in the wild
const CREATION_NAME_HINTS = ['New', 'Create', 'Init', 'Launch'];

/* ---------- helpers ---------- */
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function parseGeneric(typeStr) {
  if (!typeStr || typeof typeStr !== 'string') return '';
  const i = typeStr.indexOf('<');
  const j = typeStr.lastIndexOf('>');
  return (i >= 0 && j > i) ? typeStr.slice(i + 1, j) : '';
}

const shortAddr = (addr='') => {
  const s = String(addr);
  return s.length <= 7 ? s : `${s.slice(0,3)}..${s.slice(-4)}`;
};

function symbolFromCoinType(coinType='') {
  const parts = String(coinType).split('::');
  return parts[2] || '';
}

function extractCreatedCoinType(ev) {
  const evType = String(ev?.type || '');
  const pj = ev?.parsedJson || {};

  // 1) Canonical
  if (evType.startsWith(COIN_CREATED_PREFIX)) {
    const coinType = parseGeneric(evType);
    if (coinType) return coinType;
  }

  // 2) Heuristic wrappers
  if (CREATION_NAME_HINTS.some(h => evType.endsWith(`::${h}`) || evType.includes(`::${h}<`))) {
    const direct = pj?.name && (pj.name.name || pj.name);
    if (typeof direct === 'string' && direct.includes('::')) return direct;

    const meme = pj?.pos0?.meme?.name; // e.g. memez wrapper
    if (typeof meme === 'string' && meme.includes('::')) return meme;

    const ct = pj?.coinType || pj?.coin_type;
    if (typeof ct === 'string' && ct.includes('::')) return ct;
  }
  return '';
}

/* ---------- component ---------- */
export default function CoinCreatorScanner({ addresses, rpcUrl = DEFAULT_SUI_RPC, onDone }) {
  const [status, setStatus] = useState('idle'); // idle | scanning | done
  const [progress, setProgress] = useState(0);

  // live results for the inline panel
  const [foundCreators, setFoundCreators] = useState({});
  const [foundCoinsBy, setFoundCoinsBy]   = useState({});
  const [showResults, setShowResults]     = useState(true);
  const [expandedRows, setExpandedRows]   = useState({});

  // distinct, lowercased addresses
  const distinct = useMemo(() => {
    const set = new Set((addresses || []).map(a => String(a).toLowerCase()).filter(Boolean));
    return Array.from(set);
  }, [addresses]);

  async function scanOneAddress(addrLower) {
    let cursor = null;
    let pages = 0;
    const coins = [];

    while (pages < 8) {
      const payload = {
        jsonrpc: '2.0',
        method: 'suix_queryEvents',
        params: [
          { Sender: addrLower }, // robust filter; post-filter locally
          cursor,
          50,
          true
        ],
        id: Math.floor(Math.random() * 1e9),
      };

      try {
        const resp = await axios.post(rpcUrl, payload, { timeout: 15000 });
        const res = resp?.data?.result;
        const data = Array.isArray(res?.data) ? res.data : [];

        for (const ev of data) {
          const coinType = extractCreatedCoinType(ev);
          if (coinType) {
            coins.push({
              coinType,
              symbol: symbolFromCoinType(coinType),
              name: symbolFromCoinType(coinType),
              txDigest: ev?.id?.txDigest,
            });
          }
        }

        if (!res?.hasNextPage) break;
        cursor = res?.nextCursor || null;
        pages += 1;
      } catch {
        break;
      }
      await sleep(10);
    }

    // de-dup by coinType
    const seen = new Set();
    const uniq = [];
    for (const c of coins) {
      const key = (c.coinType || '').toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); uniq.push(c); }
    }
    return uniq;
  }

  async function runScan() {
    if (!distinct.length || status === 'scanning') return;
    setStatus('scanning');
    setProgress(0);
    setShowResults(true);
    setFoundCreators({});
    setFoundCoinsBy({});
    setExpandedRows({});

    const outCreators = {};
    const coinsBy = {};

    const CONC = 4;
    let idx = 0;

    const workers = Array.from({ length: CONC }, () => (async () => {
      while (true) {
        const i = idx++;
        if (i >= distinct.length) break;
        const addrLower = distinct[i];
        try {
          const coins = await scanOneAddress(addrLower);
          if (coins.length > 0) {
            outCreators[addrLower] = true;
            coinsBy[addrLower] = coins;

            // live UI update
            setFoundCreators(prev => ({ ...prev, [addrLower]: true }));
            setFoundCoinsBy(prev => ({ ...prev, [addrLower]: coins }));
          }
        } catch {}
        setProgress(prev => Math.min(distinct.length, prev + 1));
        await sleep(5);
      }
    })());

    await Promise.all(workers);

    setStatus('done');
    onDone && onDone({ creatorSet: outCreators, coinsByCreator: coinsBy });
  }

  const creatorsList = useMemo(() => {
    const entries = Object.entries(foundCoinsBy);
    entries.sort((a,b) => (b[1]?.length || 0) - (a[1]?.length || 0) || a[0].localeCompare(b[0]));
    return entries;
  }, [foundCoinsBy]);

  const toggleRow = (addrLower) =>
    setExpandedRows(prev => ({ ...prev, [addrLower]: !prev[addrLower] }));

  const clearResults = () => {
    setFoundCreators({});
    setFoundCoinsBy({});
    setExpandedRows({});
    setStatus('idle');
    setProgress(0);
  };

  return (
    <div className="creator-scan">
      <button
        className="apply-btn scan-btn"
        disabled={!distinct.length || status === 'scanning'}
        onClick={runScan}
        title={!distinct.length ? 'no nodes to scan' : 'check all nodes for coin creation events'}
      >
        check coin creators
      </button>

      <div className="scan-status">
        {status === 'idle' && <span className="muted">ready</span>}
        {status === 'scanning' && (
          <>
            <span className="spinner" aria-hidden />
            <span>scanning {progress}/{distinct.length}</span>
          </>
        )}
        {status === 'done' && (
          <>
            <span className="checkmark" aria-hidden>✓</span>
            <span>done &nbsp;·&nbsp; creators: {Object.keys(foundCoinsBy).length}</span>
          </>
        )}
        {(status === 'scanning' || status === 'done') && (
          <button className="toggle-results" onClick={() => setShowResults(v => !v)}>
            {showResults ? 'hide results' : 'show results'}
          </button>
        )}
        {(status === 'done' || status === 'idle') && (Object.keys(foundCoinsBy).length > 0) && (
          <button className="clear-results" onClick={clearResults} title="clear inline results">
            clear
          </button>
        )}
      </div>

      {showResults && (status === 'scanning' || status === 'done') && (
        <div className="scan-results" role="region" aria-label="coin creator scan results">
          <div className="results-head">
            <div className="title">scan results (live)</div>
            <div className="meta">
              creators: {Object.keys(foundCoinsBy).length} &nbsp;·&nbsp; scanned: {progress}/{distinct.length}
            </div>
          </div>

          {creatorsList.length === 0 && (
            <div className="no-creators">no coin creators found yet.</div>
          )}

          {creatorsList.length > 0 && (
            <div className="creators-list">
              {creatorsList.map(([addrLower, coins]) => {
                const expanded = !!expandedRows[addrLower];
                const shown = expanded ? coins : coins.slice(0, 6);
                return (
                  <div className="creator-row" key={addrLower}>
                    <div className="creator-addr" title={addrLower}>{shortAddr(addrLower)}</div>
                    <div className="creator-coins">
                      {shown.map((c, idx) => (
                        <div
                          className="coin-chip"
                          key={`${addrLower}-${c.coinType}-${idx}`}
                          title={c.coinType}
                        >
                          <span className="pill">{c.symbol || 'coin'}</span>
                          <span className="ctype">{c.coinType}</span>
                        </div>
                      ))}
                      {coins.length > shown.length && (
                        <button className="show-more" onClick={() => toggleRow(addrLower)}>
                          {expanded ? 'show less' : `show ${coins.length - shown.length} more`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
