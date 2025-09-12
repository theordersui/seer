// src/components/BubbleMaps.jsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ConnectButton, useCurrentWallet, useWallets } from '@mysten/dapp-kit';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';
import {
  FiHome, FiMap, FiShield, FiImage, FiMessageCircle, FiBell,
  FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import Logo from '../assets/seer.png';

import '../pages/LandingPage.css';
import '../pages/Dashboard.css';
import './BubbleMaps.css';
import CoinCreatorScanner from './CoinCreatorScanner';

/* ========= Helpers / constants ========= */
const BRAND_RED   = '#c02b2b';
const ELECTRIC_BLUE = '#00c8ff';           // receives → root/anchors
const NAME_HIT_YELLOW = '#ffd84d';         // SuiNS nodes
const NODE_GRAY   = '#888';
const CREATOR_PURPLE = '#a461ff';          // coin creator nodes
const DEFAULT_DECIMALS = 9;

/** Exact type overrides (most precise) */
const DECIMALS_BY_TYPE = { '0x2::sui::SUI': 9 };

/** Fallback by symbol (last segment). Common 6-dec stablecoins etc. */
const DECIMALS_BY_SYMBOL = { usdc: 6, usdt: 6, usd: 6, wusdc: 6 };

const api = axios.create({ baseURL: '/api/insidex' });

/** Shinami (Sui mainnet) */
const SHINAMI_KEY = 'us1_sui_mainnet_12ba023125f94e419ae62464f131cca6';
const SHINAMI_ENDPOINT = `https://api.us1.shinami.com/sui/node/v1/${SHINAMI_KEY}`;
const SLEEP_MS = 15;

const coinTypeToSymbolLower = (coinType) => {
  const parts = String(coinType).split('::');
  return (parts[2] || coinType).toLowerCase();
};
const getDecimals = (coinType) => {
  if (DECIMALS_BY_TYPE[coinType]) return DECIMALS_BY_TYPE[coinType];
  const sym = coinTypeToSymbolLower(coinType);
  if (DECIMALS_BY_SYMBOL[sym]) return DECIMALS_BY_SYMBOL[sym];
  return DEFAULT_DECIMALS;
};
const fmtInt = (n) => Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Node footprint (match stylesheet) */
const NODE_DIAMETER = 55;
const NODE_BORDER   = 2;
const NODE_GAP      = 12;
const EFFECTIVE_DIAM = NODE_DIAMETER + NODE_BORDER;

/** how much farther the clicked node moves away from the root on each expand */
const EDGE_GROWTH_PER_CLICK = 800;

/** Radius needed so N equal circles fit around circumference */
function requiredRingRadius(count, { minRadius = 220, nodeSize = EFFECTIVE_DIAM, gap = NODE_GAP } = {}) {
  if (count <= 1) return minRadius;
  const needed = (count * (nodeSize + gap)) / (2 * Math.PI);
  return Math.max(minRadius, needed);
}

/** Place ids around center on a ring sized to avoid overlap */
function ringNoOverlap(center, ids, { minRadius = 240, nodeSize = EFFECTIVE_DIAM, gap = NODE_GAP, jitter = 0 } = {}) {
  const n = Math.max(1, ids.length);
  const R = requiredRingRadius(n, { minRadius, nodeSize, gap });
  const out = {};
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const jx = jitter ? (Math.random() - 0.5) * jitter : 0;
    const jy = jitter ? (Math.random() - 0.5) * jitter : 0;
    out[ids[i]] = { x: center.x + R * Math.cos(a) + jx, y: center.y + R * Math.sin(a) + jy };
  }
  return { positions: out, radius: R };
}

/** datetime helpers */
const toLocalDatetimeSeconds = (d) => {
  const dt = new Date(d);
  const tzAdjusted = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return tzAdjusted.toISOString().slice(0, 19);
};

/* ========= Component ========= */
export default function BubbleMaps() {
  const navigate = useNavigate();
  const { isConnected } = useCurrentWallet();
  const wallets = useWallets();

  // Start BLANK; no auto-run
  const [wallet, setWallet] = useState('');
  const [rawTx, setRawTx] = useState([]);
  const [coinOptions, setCoinOptions] = useState([]); // for global filter + per-coin rules
  const [timeRange, setTimeRange] = useState({ min: '', max: '' });

  // Global coin + date filters
  const [filters, setFilters] = useState({ coin: '', start: '', end: '' });

  // Per-coin minimums
  const [draftRules, setDraftRules] = useState([]);     // [{ coin: 'sui', min: 10 }]
  const [perCoinRules, setPerCoinRules] = useState([]); // [{ coin: 'sui', min: 10 }]

  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paneOpen, setPaneOpen] = useState(true);

  /** RIGHT: transactions pane controls */
  const [txnPaneOpen, setTxnPaneOpen] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeTx, setSelectedNodeTx] = useState([]); // filtered, sorted

  /** fixed root address (Node A) */
  const [rootId, setRootId] = useState(null);
  /** bump count per clicked node; each expand moves it farther from the root */
  const [nodeBumps, setNodeBumps] = useState({}); // { [nodeId]: number }
  /** expansion groups */
  const [expansionGroups, setExpansionGroups] = useState({}); // { [anchorId]: string[] }

  /** SuiNS cache: undefined=unknown(fetch), null=miss, string=hit */
  const [nameByAddress, setNameByAddress] = useState({});

  /** Coin creators results */
  const [creatorSet, setCreatorSet] = useState({});         // { addrLower: true }
  const [coinsByCreator, setCoinsByCreator] = useState({}); // { addrLower: [{symbol,name,coinType}] }

  /** in-flight guard & queue for SuiNS */
  const inflight = useRef(new Set());
  const resolveQueue = useRef([]);
  const queueRunning = useRef(false);

  const cyRef = useRef(null);

  // Tracks the last automatically-applied range so we only auto-update if user hasn't customized
  const autoRangeRef = useRef({ start: '', end: '' });

  useEffect(() => { if (!isConnected) navigate('/'); }, [isConnected, navigate]);

  const navItems = useMemo(() => ([
    { label: 'home',        icon: <FiHome />,           path: '/dashboard' },
    { label: 'bubble maps', icon: <FiMap />,            path: '/bubble-maps' },
    { label: 'trenches',    icon: <FiShield />,         path: '/security-check' },
    { label: 'collections', icon: <FiImage />,          path: '/nft-analysis' },
    { label: 'minerva',     icon: <FiMessageCircle />,  path: '/minerva-chat' },
    { label: 'alerts',      icon: <FiBell />,           path: '/alerts' },
  ]), []);

  /* -------- current positions from Cytoscape -------- */
  const snapshotPositions = useCallback(() => {
    const map = {};
    const cy = cyRef.current;
    if (!cy) return map;
    cy.nodes().forEach(n => { const p = n.position(); map[n.id()] = { x: p.x, y: p.y }; });
    return map;
  }, []);

  /* -------- tx filtering (date + coin/min rules) -------- */
  const txPassesFilters = useCallback((t, opts, rules) => {
    const { coin, start, end } = opts;

    const ts = new Date(t.timestampMs);
    if (start) {
      const startDt = new Date(start);
      if (ts < startDt) return false;
    }
    if (end) {
      const endDt = new Date(end);
      if (ts > endDt) return false;
    }

    const symLower = coinTypeToSymbolLower(t.coin);
    const humanAmt = t.amount / Math.pow(10, getDecimals(t.coin));

    if (rules && rules.length) {
      const rule = rules.find(r => r.coin === symLower);
      if (rule) return humanAmt >= Number(rule.min || 0);
      return !coin || symLower === coin;
    } else {
      if (coin && symLower !== coin) return false;
      return true;
    }
  }, []);

  /* -------- build elements from tx list -------- */
  const buildElements = useCallback((txs, mainAddress, expandSpec = null) => {
    const edgeCoinAgg = new Map(); // key: `${from}|${to}|${coinType}`
    const nodes = new Map();

    const shortAddr = (addr='') => {
      const s = String(addr);
      if (s.length <= 7) return s;
      return `${s.slice(0,3)}..${s.slice(-4)}`;
    };
    const truncSuiName = (name='') => `${String(name).slice(0,9)}..`;

    const nodeDatum = (addr, baseColor) => {
      const hit = nameByAddress[addr];
      const hasName = typeof hit === 'string' && hit.length > 0;

      const isCreator = !!creatorSet[String(addr).toLowerCase()];
      const color = isCreator ? CREATOR_PURPLE : (hasName ? NAME_HIT_YELLOW : baseColor);
      const textColor = isCreator ? '#000' : (hasName ? '#000' : '#fff');

      return {
        id: addr,
        label: hasName ? truncSuiName(hit) : shortAddr(addr),
        color,
        textColor
      };
    };

    if (mainAddress) nodes.set(mainAddress, nodeDatum(mainAddress, BRAND_RED));

    for (const t of txs) {
      const src = t.from;
      const tgt = t.to;
      const coinType = t.coin;
      const decimals = getDecimals(coinType);
      const converted = t.amount / Math.pow(10, decimals);

      if (!nodes.has(src)) nodes.set(src, nodeDatum(src, NODE_GRAY));
      if (!nodes.has(tgt)) nodes.set(tgt, nodeDatum(tgt, NODE_GRAY));

      const key = `${src}|${tgt}|${coinType}`;
      if (!edgeCoinAgg.has(key)) {
        edgeCoinAgg.set(key, {
          source: src, target: tgt,
          count: 0, total: 0,
          coinType, symLower: coinTypeToSymbolLower(coinType)
        });
      }
      const e = edgeCoinAgg.get(key);
      e.count += 1;
      e.total += converted;
    }

    const currentPos = snapshotPositions();
    const nodeArr = Array.from(nodes.values());
    const posOut = { ...currentPos };

    if (Object.keys(currentPos).length === 0) {
      const others = nodeArr.map(n => n.id).filter(id => id !== mainAddress);
      const { positions: placed } = ringNoOverlap({ x:0, y:0 }, others, { minRadius: 320, gap: NODE_GAP });
      if (mainAddress) posOut[mainAddress] = { x:0, y:0 };
      Object.assign(posOut, placed);
    }

    if (expandSpec && expandSpec.anchorId && expandSpec.rootId && Array.isArray(expandSpec.newIds)) {
      const anchorId = expandSpec.anchorId;
      const rootId   = expandSpec.rootId;
      const bumpLvl  = expandSpec.bumpLevel || 1;
      const rootPos  = posOut[rootId]   || { x: 0, y: 0 };
      const oldPos   = posOut[anchorId] || { x: 0, y: 0 };

      let dx = oldPos.x - rootPos.x;
      let dy = oldPos.y - rootPos.y;
      const oldDist = Math.hypot(dx, dy) || 1;
      dx /= oldDist; dy /= oldDist;

      const newDist = oldDist + bumpLvl * EDGE_GROWTH_PER_CLICK;
      const newCenter = { x: rootPos.x + dx * newDist, y: rootPos.y + dy * newDist };

      posOut[anchorId] = newCenter;

      if (expandSpec.newIds.length) {
        const { positions: placed } = ringNoOverlap(newCenter, expandSpec.newIds, { minRadius: 20, gap: NODE_GAP });
        Object.assign(posOut, placed);
      }
    }

    const receiveTargetSetLower = new Set(
      [
        ...(mainAddress ? [String(mainAddress).toLowerCase()] : []),
        ...Object.keys(expansionGroups || {}).map(id => String(id).toLowerCase()),
      ]
    );

    const nodeEls = nodeArr.map(n => ({ data: n, position: posOut[n.id] || { x: 0, y: 0 } }));

    const edgeEls = [];
    for (const [edgeKey, e] of edgeCoinAgg.entries()) {
      const label = `${e.count} tx${e.count > 1 ? 's' : ''}: ${fmtInt(e.total)} ${e.symLower}`;
      const tgtLower = String(e.target || '').toLowerCase();
      const isReceiveToAnyAnchor = receiveTargetSetLower.has(tgtLower);
      edgeEls.push({
        data: {
          id: edgeKey,
          source: e.source,
          target: e.target,
          label,
          color: isReceiveToAnyAnchor ? ELECTRIC_BLUE : BRAND_RED,
          width: 2
        }
      });
    }

    return [...nodeEls, ...edgeEls];
  }, [snapshotPositions, nameByAddress, creatorSet, expansionGroups]);

  const applyFilters = useCallback((txs, opts, rules) => {
    const filtered = txs.filter(t => txPassesFilters(t, opts, rules));
    const els = buildElements(filtered, rootId || wallet, null);
    setElements(els);
  }, [buildElements, txPassesFilters, wallet, rootId]);

  /** Compute the auto range over given txs (pads ±1s) */
  const computeRangeFor = useCallback((txs) => {
    if (!txs?.length) return { startStr: '', endStr: '' };
    const times = txs.map(t => new Date(t.timestampMs)).filter(Boolean);
    if (!times.length) return { startStr: '', endStr: '' };
    const minT = new Date(Math.min(...times.map(d => +d)));
    const maxT = new Date(Math.max(...times.map(d => +d)));
    const paddedStart = new Date(minT.getTime() - 1000);
    const paddedEnd   = new Date(maxT.getTime() + 1000);
    return { startStr: toLocalDatetimeSeconds(paddedStart), endStr: toLocalDatetimeSeconds(paddedEnd) };
  }, []);

  /* -------- fetchers (initial apply + expand) -------- */
  const fetchGraphFor = useCallback(async (address, { replace, anchorIdForNew = null } = { replace: true, anchorIdForNew: null }) => {
    if (!address) { setError('please enter an address first'); return; }
    setError('');
    if (replace) setLoading(true);

    try {
      const beforePositions = snapshotPositions();
      const existingIds = new Set(Object.keys(beforePositions));

      const [sent, recv] = await Promise.all([
        api.get('/sent',     { params: { address } }),
        api.get('/received', { params: { address } }),
        // api.get(`/coins-transfer/addresses-sent-to/${address}`),
        // api.get(`/coins-transfer/addresses-received-from/${address}`),
      ]);

      const fresh = [
        ...recv.data.map(t => ({ ...t, direction: 'recv' })),
        ...sent.data.map(t => ({ ...t, direction: 'sent' })),
      ];

      const dedupe = (arr) => {
        const seen = new Set(); const out = [];
        for (const t of arr) {
          const k = t.digest || `${t.from}-${t.to}-${t.amount}-${t.timestampMs}`;
          if (!seen.has(k)) { seen.add(k); out.push(t); }
        }
        return out;
      };

      const merged = replace ? dedupe(fresh) : dedupe(rawTx.concat(fresh));
      setRawTx(merged);

      if (replace) {
        setRootId(address);
        setNodeBumps({});
      }

      const symbols = Array.from(new Set(merged.map(t => coinTypeToSymbolLower(t.coin)))).sort((a,b)=>a.localeCompare(b));
      setCoinOptions(symbols);

      // AUTO RANGE every fetch; expand filters if user hasn't customized
      const { startStr, endStr } = computeRangeFor(merged);

      if (startStr && endStr) { setTimeRange({ min: startStr, max: endStr }); }

      const { start: autoStart, end: autoEnd } = autoRangeRef.current;
      const userHasCustom =
        (filters.start && filters.start !== autoStart) ||
        (filters.end && filters.end !== autoEnd);

      if (startStr && endStr) {
        if (replace || !userHasCustom) {
          setFilters(f => ({ ...f, start: startStr, end: endStr }));
          autoRangeRef.current = { start: startStr, end: endStr };
        } else {
          autoRangeRef.current = { start: startStr, end: endStr };
        }
      }

      const opts = {
        coin: (filters.coin || '').toLowerCase(),
        start: (replace || !userHasCustom) ? startStr : filters.start,
        end:   (replace || !userHasCustom) ? endStr   : filters.end
      };
      const filtered = merged.filter(t => txPassesFilters(t, opts, perCoinRules));

      let expandSpec = null;
      if (!replace && anchorIdForNew) {
        const bumpLevel = (nodeBumps[anchorIdForNew] || 0) + 1;
        setNodeBumps(prev => ({ ...prev, [anchorIdForNew]: bumpLevel }));

        const freshNeighborIds = new Set();
        fresh.forEach(t => {
          if (t.from?.toLowerCase() === anchorIdForNew.toLowerCase()) freshNeighborIds.add(t.to);
          if (t.to?.toLowerCase() === anchorIdForNew.toLowerCase()) freshNeighborIds.add(t.from);
        });
        const newIds = Array.from(freshNeighborIds).filter(id => !existingIds.has(id));

        setExpansionGroups(prev => {
          const existing = new Set(prev[anchorIdForNew] || []);
          newIds.forEach(id => existing.add(id));
          return { ...prev, [anchorIdForNew]: Array.from(existing) };
        });

        expandSpec = {
          rootId: rootId || address,
          anchorId: anchorIdForNew,
          newIds,
          bumpLevel
        };
      }

      if (replace) {
        const rootCounterparties = new Set();
        merged.forEach(t => {
          if (t.from?.toLowerCase() === address.toLowerCase()) rootCounterparties.add(t.to);
          if (t.to?.toLowerCase() === address.toLowerCase()) rootCounterparties.add(t.from);
        });
        setExpansionGroups({ [address]: Array.from(rootCounterparties) });
      }

      const els = buildElements(filtered, rootId || address, expandSpec);
      setElements(els);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || e?.message || 'failed to load transactions');
    } finally {
      if (replace) setLoading(false);
    }
  }, [rawTx, filters, perCoinRules, rootId, nodeBumps, buildElements, snapshotPositions, txPassesFilters, computeRangeFor]);

  /* -------- re-apply when COMMITTED rules/filters change -------- */
  useEffect(() => {
    if (rawTx.length) {
      applyFilters(rawTx, { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end }, perCoinRules);
    } else {
      setElements([]);
    }
  }, [filters, perCoinRules, rawTx, applyFilters]);

  /* -------- RIGHT PANE: derive tx list for selected node (sorted desc) -------- */
  const computeNodeTx = useCallback((nodeId) => {
    if (!nodeId) return [];
    const opts = { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end };
    return rawTx
      .filter(t => txPassesFilters(t, opts, perCoinRules))
      .filter(t =>
        String(t.from).toLowerCase() === nodeId.toLowerCase() ||
        String(t.to).toLowerCase() === nodeId.toLowerCase()
      )
      .sort((a,b) => b.timestampMs - a.timestampMs);
  }, [rawTx, filters, perCoinRules, txPassesFilters]);

  useEffect(() => {
    setSelectedNodeTx(computeNodeTx(selectedNodeId));
  }, [selectedNodeId, rawTx, filters, perCoinRules, computeNodeTx]);

  /* -------- Name resolution queue (rate-limited, non-blocking) -------- */
  const enqueueAddresses = useCallback((addresses) => {
    const unique = Array.from(new Set(addresses));
    unique.forEach(a => {
      if (typeof nameByAddress[a] !== 'undefined') return;
      if (inflight.current.has(a)) return;
      if (resolveQueue.current.includes(a)) return;
      resolveQueue.current.push(a);
    });
    if (!queueRunning.current) runQueue();
  }, [nameByAddress]);

  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  const runQueue = useCallback(async () => {
    if (queueRunning.current) return;
    queueRunning.current = true;

    try {
      while (resolveQueue.current.length) {
        const addr = resolveQueue.current.shift();
        if (!addr) break;

        if (typeof nameByAddress[addr] !== 'undefined') continue;
        if (inflight.current.has(addr)) continue;
        inflight.current.add(addr);

        try {
          const payload = {
            jsonrpc: '2.0',
            method: 'suix_resolveNameServiceNames',
            params: [addr, null, null],
            id: 1,
          };
          const resp = await axios.post(SHINAMI_ENDPOINT, payload, { timeout: 12000 });
          const raw = resp?.data?.result;

          let names = [];
          if (Array.isArray(raw)) names = raw;
          else if (raw && typeof raw === 'object') {
            for (const v of Object.values(raw)) { if (Array.isArray(v)) { names = v; break; } }
          }
          const extractName = (entry) => (entry && typeof entry === 'object') ? (entry.name || '') : (entry || '');
          const label = extractName(names[0]) || '';

          setNameByAddress(prev => {
            const nextVal = label ? label : null; // null marks miss (never refetch)
            if (prev[addr] === nextVal) return prev;
            return { ...prev, [addr]: nextVal };
          });
        } catch {
          setNameByAddress(prev => {
            if (prev[addr] === null) return prev;
            return { ...prev, [addr]: null };
          });
        } finally {
          inflight.current.delete(addr);
        }

        await sleep(SLEEP_MS);
      }
    } finally {
      queueRunning.current = false;
      if (resolveQueue.current.length) runQueue();
    }
  }, [nameByAddress]);

  // queue any new node ids for SuiNS lookup
  useEffect(() => {
    const nodeIds = elements
      .filter(el => el.data && el.data.id && !el.data.source)
      .map(el => el.data.id);
    if (nodeIds.length) enqueueAddresses(nodeIds);
  }, [elements, enqueueAddresses]);

  // When name cache updates, rebuild graph and refresh right pane labels
  useEffect(() => {
    if (!rawTx.length) return;
    applyFilters(rawTx, { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end }, perCoinRules);
    setSelectedNodeTx(computeNodeTx(selectedNodeId));
  }, [nameByAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------- refit when panes toggle -------- */
  useEffect(() => {
    const id = setTimeout(() => {
      const cy = cyRef.current;
      if (!cy) return;
      try { cy.resize(); cy.fit({ padding: 50 }); cy.center(); } catch {}
    }, 320);
    return () => clearTimeout(id);
  }, [paneOpen, txnPaneOpen]);

  /* -------- node interactions: click vs double-click (no interference) -------- */
  const bindCyHandlers = useCallback((cy) => {
    if (!cy) return;
    cy.off('tap'); cy.off('grab'); cy.off('drag'); cy.off('free');

    // click orchestrator: single vs double
    const click = { lastId: null, lastTs: 0, timer: null, threshold: 280 };

    cy.on('tap', 'node', async (evt) => {
      const node = evt.target;
      const addr = String(node.id());
      const now = Date.now();

      if (click.timer && click.lastId === addr && (now - click.lastTs) <= click.threshold) {
        // it's a double-click → cancel pending single click, EXPAND ONLY
        clearTimeout(click.timer);
        click.timer = null;
        click.lastId = null;
        click.lastTs = 0;

        await fetchGraphFor(addr, { replace: false, anchorIdForNew: addr });
        return;
      }

      // schedule single-click behavior
      click.lastId = addr;
      click.lastTs = now;
      if (click.timer) { clearTimeout(click.timer); }
      click.timer = setTimeout(() => {
        // Single click → open right pane & show txs for this node
        setSelectedNodeId(addr);
        if (!txnPaneOpen) setTxnPaneOpen(true);
        click.timer = null;
      }, click.threshold);
    });

    // Group-drag behavior unchanged
    const dragState = { anchorId: null, last: null, followers: [] };

    cy.on('grab', 'node', (evt) => {
      const n = evt.target;
      dragState.anchorId = n.id();
      const p = n.position();
      dragState.last = { x: p.x, y: p.y };

      const group = (expansionGroups[dragState.anchorId] || []).filter(id => id !== dragState.anchorId);
      dragState.followers = group;
    });

    cy.on('drag', 'node', (evt) => {
      const n = evt.target;
      if (n.id() !== dragState.anchorId || !dragState.last) return;

      const p = n.position();
      const dx = p.x - dragState.last.x;
      const dy = p.y - dragState.last.y;
      dragState.last = { x: p.x, y: p.y };

      dragState.followers.forEach(id => {
        const m = cy.$id(id);
        if (m && m.nonempty()) {
          const mp = m.position();
          m.position({ x: mp.x + dx, y: mp.y + dy });
        }
      });
    });

    cy.on('free', 'node', () => {
      dragState.anchorId = null;
      dragState.last = null;
      dragState.followers = [];
    });
  }, [fetchGraphFor, expansionGroups, txnPaneOpen]);

  /* -------- UI helpers for DRAFT rules -------- */
  const addDraftRule = () => setDraftRules(prev => [...prev, { coin: '', min: 0 }]);
  const updateDraftRule = (i, patch) =>
    setDraftRules(prev => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const removeDraftRule = (i) => {
    setDraftRules(prev => {
      const toRemove = prev[i];
      const next = prev.filter((_, idx) => idx !== i);

      if (toRemove?.coin) {
        const coin = String(toRemove.coin).toLowerCase();
        const updated = perCoinRules.filter(r => r.coin !== coin);
        setPerCoinRules(updated);
        if (rawTx.length) {
          applyFilters(rawTx, { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end }, updated);
          setSelectedNodeTx(computeNodeTx(selectedNodeId));
        }
      }
      return next;
    });
  };

  const applyDraftRules = () => {
    const normalized = draftRules
      .filter(r => r.coin)
      .map(r => ({ coin: r.coin.toLowerCase(), min: Math.max(0, Number(r.min || 0)) }));
    setPerCoinRules(normalized);
    if (rawTx.length) {
      applyFilters(rawTx, { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end }, normalized);
      setSelectedNodeTx(computeNodeTx(selectedNodeId));
    }
  };

  /* -------- helpers for right pane rendering -------- */
  const shortAddr = (addr='') => {
    const s = String(addr);
    if (s.length <= 7) return s;
    return `${s.slice(0,3)}..${s.slice(-4)}`;
  };
  const truncSuiName = (name='') => `${String(name).slice(0,9)}..`;
  const nameOrShort = (addr) => {
    const hit = nameByAddress[addr];
    if (typeof hit === 'string' && hit) return truncSuiName(hit);
    return shortAddr(addr);
  };
  const fullLabel = (addr) => nameByAddress[addr] || addr;

  const formatDateOnly = (ms) => {
    try { return new Date(ms).toLocaleDateString(undefined); }
    catch { return String(ms); }
  };
  const digestLink = (digest) => `https://suivision.xyz/txblock/${digest}`;

  const symbolOf = (coinType) => coinTypeToSymbolLower(coinType);
  const formatAmountOnly = (coinType, rawAmount) => {
    const dec = getDecimals(coinType);
    const val = Number(rawAmount) / Math.pow(10, dec);
    // whole numbers only
    return Math.round(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  /** All current node ids (for scanner) */
  const nodeIds = useMemo(() => {
    return elements
      .filter(el => el.data && el.data.id && !el.data.source)
      .map(el => el.data.id);
  }, [elements]);

  /** Scanner completion handler */
  const handleCreatorsDone = useCallback((result) => {
    // result: { creatorSet: {addrLower:true}, coinsByCreator: {addrLower:[{symbol,name,coinType}]}}
    setCreatorSet(result.creatorSet || {});
    setCoinsByCreator(result.coinsByCreator || {});
    if (rawTx.length) {
      // rebuild graph to recolor creator nodes
      applyFilters(rawTx, { coin: (filters.coin || '').toLowerCase(), start: filters.start, end: filters.end }, perCoinRules);
    }
  }, [applyFilters, rawTx, filters, perCoinRules]);

  return (
    <div className={`bubblemaps-wrapper ${paneOpen ? 'pane-open' : 'pane-closed'} ${txnPaneOpen ? 'txn-open' : 'txn-closed'}`}>
      {/* header */}
      <header className="header header--dashboard">
        <img src={Logo} alt="cloak and dagger" className="header__logo" />
        <nav className="dashboard-nav">
          {navItems.map(({ label, icon, path }, index) => (
            <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.08 }} whileHover={{ scale: 1.04 }}>
              <NavLink to={path} end className={({ isActive }) =>
                `dashboard-nav__item${isActive ? ' active' : ''}`}>
                <span className="dashboard-nav__icon">{icon}</span>
                <span className="dashboard-nav__label">{label}</span>
              </NavLink>
            </motion.div>
          ))}
        </nav>
        <div className="header__actions">
          <ConnectButton>
            {({ connect, connected, disconnect }) => (
              <motion.button
                onClick={connected ? disconnect : connect}
                className="header__btn header__btn--sm"
                whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
                {connected ? 'logout' : 'login'}
              </motion.button>
            )}
          </ConnectButton>
        </div>
      </header>

      {/* LEFT: filter pane */}
      <aside className={`filter-pane ${paneOpen ? 'open' : 'closed'}`}>
        <h2>filters</h2>

        <label>address
          <input type="text" value={wallet} onChange={e => setWallet(e.target.value.trim())} placeholder="0x..." />
        </label>

        {/* Global coin filter */}
        <label>coin (global)
          <select value={filters.coin} onChange={e => setFilters(f => ({ ...f, coin: e.target.value.toLowerCase() }))}>
            <option value="">all</option>
            {coinOptions.map(sym => (<option key={sym} value={sym}>{sym}</option>))}
          </select>
        </label>

        {/* Legend */}
        <div className="legend">
          <div className="legend-title">legend</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="swatch circle root" />
              <span>root (selected wallet)</span>
            </div>
            <div className="legend-item">
              <span className="swatch circle creator" />
              <span>coin creator</span>
            </div>
            <div className="legend-item">
              <span className="swatch circle named" />
              <span>named node (SuiNS)</span>
            </div>
            <div className="legend-item">
              <span className="swatch circle other" />
              <span>other node</span>
            </div>
            <div className="legend-item">
              <span className="swatch edge recv" />
              <span>receive → any anchor</span>
            </div>
            <div className="legend-item">
              <span className="swatch edge send" />
              <span>other flow</span>
            </div>
          </div>
        </div>

        {/* Coin Creator Scanner (runs, then applies) */}
        <CoinCreatorScanner
          addresses={nodeIds}
          rpcUrl={SHINAMI_ENDPOINT}
          onDone={handleCreatorsDone}
        />

        {/* Per-coin minimums */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.12)', paddingTop:'0.6rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.35rem' }}>
            <h2 style={{ margin:0, fontSize:'1.0rem' }}>per-coin minimums</h2>
            <button className="apply-btn" style={{ padding: '0.35rem 0.6rem', background:'#444' }} onClick={addDraftRule}>+ add</button>
          </div>

          {draftRules.length === 0 && (
            <div style={{ fontSize:'0.85rem', color:'#aaa', marginBottom:'0.35rem' }}>
              add one or more coin rules; they won’t affect the graph until you hit <em>apply</em>.
            </div>
          )}

          {draftRules.map((row, i) => (
            <div key={i} style={{ marginBottom:'0.75rem', padding:'0.5rem', background:'rgba(255,255,255,0.04)', borderRadius:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', alignItems:'end' }}>
                <label>coin
                  <select value={row.coin} onChange={e => setDraftRules(prev => prev.map((rw, idx) => idx === i ? { ...rw, coin: e.target.value.toLowerCase() } : rw))}>
                    <option value="">select…</option>
                    {coinOptions.map(sym => (<option key={sym} value={sym}>{sym}</option>))}
                  </select>
                </label>
                <label>min amount
                  <input type="number" min="0" step="1" value={row.min} onChange={e => setDraftRules(prev => prev.map((rw, idx) => idx === i ? { ...rw, min: e.target.value } : rw))}/>
                </label>
              </div>
              <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.5rem' }}>
                <button className="apply-btn" style={{ background:'#666' }} onClick={applyDraftRules}>apply</button>
                <button className="apply-btn" style={{ background:'#663' }} onClick={() => removeDraftRule(i)}>remove</button>
              </div>
            </div>
          ))}
        </div>

        <label>from
          <input
            type="datetime-local"
            step="1"
            min={timeRange.min || undefined}
            max={timeRange.max || undefined}
            value={filters.start}
            onChange={e => setFilters(f => ({ ...f, start: e.target.value }))}
          />
        </label>

        <label>to
          <input
            type="datetime-local"
            step="1"
            min={timeRange.min || undefined}
            max={timeRange.max || undefined}
            value={filters.end}
            onChange={e => setFilters(f => ({ ...f, end: e.target.value }))}
          />
        </label>

        <button
          className="apply-btn"
          onClick={() => { setElements([]); fetchGraphFor(wallet, { replace: true }); }}
          disabled={loading}
          title={!wallet ? 'enter an address first' : 'apply filters & load'}
        >
          {loading ? 'loading…' : 'apply'}
        </button>

        {error && <div className="fp-error">{error}</div>}
      </aside>

      {/* LEFT toggle */}
      <button
        className={`pane-toggle ${paneOpen ? 'open' : 'closed'}`}
        onClick={() => setPaneOpen(p => !p)}
        aria-label={paneOpen ? 'collapse filters' : 'expand filters'}
        title={paneOpen ? 'collapse filters' : 'expand filters'}
      >
        {paneOpen ? <FiChevronLeft /> : <FiChevronRight />}
      </button>

      {/* RIGHT: transactions pane */}
      <aside className={`txn-pane ${txnPaneOpen ? 'open' : 'closed'}`}>
        <h2>transactions {selectedNodeId ? `— ${nameOrShort(selectedNodeId)}` : ''}</h2>

        {/* Coins created block (only if this node is a creator) */}
        {selectedNodeId && coinsByCreator[String(selectedNodeId).toLowerCase()]?.length > 0 && (
          <div className="creator-coins">
            <div className="creator-title">coins created</div>
            <ul>
              {coinsByCreator[String(selectedNodeId).toLowerCase()].map((c, idx) => (
                <li key={`${c.coinType || c.symbol || c.name || 'coin'}-${idx}`}>
                  {c.symbol ? <span className="pill">{c.symbol}</span> : null}
                  {c.name && (!c.symbol || c.name.toLowerCase() !== c.symbol.toLowerCase()) ? <span className="pill alt">{c.name}</span> : null}
                  {c.coinType ? <span className="type">{c.coinType}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!selectedNodeId && (
          <div className="txn-empty">single-click a node to see its transactions.</div>
        )}

        {selectedNodeId && selectedNodeTx.length === 0 && (
          <div className="txn-empty">no transactions in the current filters.</div>
        )}

        {selectedNodeId && selectedNodeTx.length > 0 && (
          <div className="txn-table">
            <div className="txn-row txn-header">
              <div>date</div>
              <div>from</div>
              <div>to</div>
              <div>coin</div>
              <div>amount</div>
              <div>digest</div>
            </div>
            {selectedNodeTx.map(t => (
              <div className="txn-row" key={t.digest || `${t.from}-${t.to}-${t.timestampMs}`}>
                <div>{formatDateOnly(t.timestampMs)}</div>
                <div className="addr" title={fullLabel(t.from)}>{nameOrShort(t.from)}</div>
                <div className="addr" title={fullLabel(t.to)}>{nameOrShort(t.to)}</div>
                <div className="coin">{symbolOf(t.coin)}</div>
                <div className="amt">{formatAmountOnly(t.coin, t.amount)}</div>
                <div className="link"><a href={digestLink(t.digest)} target="_blank" rel="noreferrer">Link</a></div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* RIGHT toggle */}
      <button
        className={`txn-toggle ${txnPaneOpen ? 'open' : 'closed'}`}
        onClick={() => setTxnPaneOpen(p => !p)}
        aria-label={txnPaneOpen ? 'collapse transactions' : 'expand transactions'}
        title={txnPaneOpen ? 'collapse transactions' : 'expand transactions'}
      >
        {txnPaneOpen ? <FiChevronRight /> : <FiChevronLeft />}
      </button>

      {/* graph */}
      <main className="graph-pane">
        <CytoscapeComponent
          elements={elements}
          style={{ width: '100%', height: '100%' }}
          cy={cy => { cyRef.current = cy; bindCyHandlers(cy); }}
          layout={{ name: 'preset', fit: false }}
          stylesheet={[
            {
              selector: 'node',
              style: {
                'background-color': 'data(color)',
                label: 'data(label)',
                'font-family': 'OptimusPrinceps, sans-serif',
                'font-size': '10px',
                color: 'data(textColor)',
                'text-valign': 'center',
                'text-halign': 'center',
                width: NODE_DIAMETER,
                height: NODE_DIAMETER,
                shape: 'ellipse',
                'border-width': NODE_BORDER,
                'border-color': '#111',
                'overlay-opacity': 0
              }
            },
            {
              selector: 'edge',
              style: {
                'curve-style': 'bezier',
                'edge-distances': 'node-position',
                'line-color': 'data(color)',
                'target-arrow-color': 'data(color)',
                'target-arrow-shape': 'triangle',
                width: 'data(width)',
                label: 'data(label)',
                'font-family': 'OptimusPrinceps', // keep consistent
                'font-size': '10px',
                color: '#fff',
                'text-background-color': '#000',
                'text-background-opacity': 0.6,
                'text-wrap': 'wrap',
                'overlay-opacity': 0,
                'z-index-compare': 'manual',
                'z-index': 1
              }
            }
          ]}
        />
      </main>
    </div>
  );
}
