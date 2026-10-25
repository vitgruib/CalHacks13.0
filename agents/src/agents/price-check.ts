// The price check (T69): the request's price against a public list price for
// lab supplies, reagents and equipment. Since T117 Ask's item check runs it
// (agents/item-check.ts) and a price far above list flags the item; it was
// first written for the purchasing agent, cut in T108.
//
// It looks in the saved price lists first: every item checked before, found
// or not, matched by its words and numbers, so a repeat or a reworded request
// costs nothing and takes no time. Only a miss asks Claude (Haiku, with web
// search), and what it finds is added to the worker's own list.
//
// Two lists: agents/cache/prices.json is committed (the demo's items, looked
// up ahead of time) and only read; new finds go to agents/.state/prices.json,
// which git ignores, so a running worker never changes a tracked file (the
// hosted worker's deploy pulls into its checkout). Copy entries across to
// commit them. GG_PRICE_CATALOG names one file used for both instead. With Claude off or offline and nothing saved,
// there is no price to compare and the purchase goes ahead as before.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Anthropic from '@anthropic-ai/sdk';

import { ask, type AskOptions } from '../claude.ts';
import { PRICE_MODEL, PRICE_SYSTEM, PRICE_TASK, PriceAnswer } from '../prompts/price-check.ts';

const COMMITTED_LIST = fileURLToPath(new URL('../../cache/prices.json', import.meta.url));
const WORKER_LIST = fileURLToPath(new URL('../../.state/prices.json', import.meta.url));

// Goods with a public list price; services, core facility time and fees have none.
export const CHECKED_CATEGORIES: ReadonlySet<string> = new Set(['lab supplies', 'reagents', 'equipment']);
// "Far above": more than twice the list price and at least $100 over it, so
// shipping, tax and small packs never trip it.
export const TOO_HIGH_RATIO = 2;
export const TOO_HIGH_MIN_OVER = 100;

const SEARCH: Anthropic.ToolUnion[] = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];

export interface PriceEntry {
  item: string;
  category: string;
  found: boolean;
  vendor: string;
  product: string;
  listPrice: number; // for the requested quantity
  sameQuantity: boolean;
  url: string;
  // From T117 on: what the page sells and the counts listPrice was worked out
  // from (packPrice × packs needed). Older saved entries don't have them.
  packPrice?: number;
  unit?: string;
  perPack?: number;
  requested?: number;
  checkedOn: string; // the real day it was looked up
  by: string; // the model that found it
}

export interface PriceCheck {
  entry: PriceEntry;
  from: 'list' | 'claude';
  tooHigh: boolean;
}

const STOPWORDS = new Set(['a', 'an', 'and', 'for', 'of', 'the', 'with', 'x']);
function words(item: string): { words: Set<string>; numbers: Set<string> } {
  // "1,000" is 1000, and "200uL" is "200 uL".
  const text = item.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/(\d)(?=\p{L})/gu, '$1 ');
  const tokens = text.match(/[\p{L}\p{N}]+(?:\.\d+)?/gu) ?? [];
  return {
    words: new Set(tokens.filter((t) => !/^\d/.test(t) && !STOPWORDS.has(t))),
    numbers: new Set(tokens.filter((t) => /^\d/.test(t))),
  };
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const overlap = (a: Set<string>, b: Set<string>) => {
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / (a.size + b.size - shared || 1);
};

/**
 * The saved entry for this item: same category, the same numbers (pack size,
 * count) and mostly the same words. "Nitrile gloves, 10 cases" finds
 * "nitrile gloves 10 cases" but never "Nitrile gloves, 4 cases".
 */
export function findPrice(item: string, category: string, entries: PriceEntry[]): PriceEntry | undefined {
  const mine = words(item);
  let best: { entry: PriceEntry; score: number } | undefined;
  for (const entry of entries) {
    if (entry.category !== category) continue;
    const theirs = words(entry.item);
    if (!sameSet(mine.numbers, theirs.numbers)) continue;
    const score = overlap(mine.words, theirs.words);
    if (score >= 0.75 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry;
}

/** More than twice the list price for the same quantity, and at least $100 over it. */
export function isTooHigh(price: number, entry: PriceEntry): boolean {
  return entry.found && entry.sameQuantity && entry.listPrice > 0
    && price > entry.listPrice * TOO_HIGH_RATIO && price - entry.listPrice >= TOO_HIGH_MIN_OVER;
}

// undefined: the file is there but can't be read as a list (a merge left
// conflict markers in it, say), so it is never written over.
function readEntries(path: string): PriceEntry[] | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export const readCatalog = (path: string): PriceEntry[] => readEntries(path) ?? [];

function addToCatalog(path: string, entry: PriceEntry): void {
  const saved = readEntries(path);
  if (!saved) {
    console.warn(`price check: ${path} is not a price list, so ${entry.item} was not saved to it`);
    return;
  }
  const entries = saved.filter((e) => !(e.item === entry.item && e.category === entry.category));
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify([...entries, entry], null, 2)}\n`);
  } catch (error) {
    // Still good for this purchase; only the saved copy is missing.
    console.warn(`price check: ${entry.item} not saved (${error instanceof Error ? error.message : error})`);
  }
}

// The links in the reply's own search results. A link Claude gives that isn't
// one of them was written, not found.
function searchedUrls(message: unknown): Set<string> {
  const content = (message as { content?: unknown[] })?.content ?? [];
  const urls = new Set<string>();
  for (const block of content as Array<{ type?: string; content?: unknown }>) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const result of block.content as Array<{ url?: unknown }>) if (typeof result.url === 'string') urls.add(result.url);
  }
  return urls;
}

// Whose prices count as list prices: the makers and the big lab suppliers.
// Resellers, used-equipment dealers and marketplaces often don't say a unit
// is refurbished, so a price from anyone else is never compared (T117).
export const LIST_PRICE_SITES = [
  'fishersci.com', 'thermofisher.com', 'sigmaaldrich.com', 'emdmillipore.com', 'vwr.com', 'avantorsciences.com',
  'bio-rad.com', 'neb.com', 'corning.com', 'eppendorf.com', 'qiagen.com', 'agilent.com', 'promega.com',
  'idtdna.com', 'coleparmer.com', 'grainger.com', 'mcmaster.com', 'stemcell.com', 'gilson.com', 'mt.com',
];
function fromListPriceSite(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return LIST_PRICE_SITES.some((site) => host === site || host.endsWith(`.${site}`));
}

type Found = Pick<PriceEntry, 'found' | 'vendor' | 'product' | 'listPrice' | 'sameQuantity' | 'url'>;
const NOT_FOUND: Found = { found: false, vendor: '', product: '', listPrice: 0, sameQuantity: false, url: '' };
const NO_ANSWER: PriceAnswer = { found: false, vendor: '', product: '', condition: 'unknown', packPrice: 0, unit: '', perPack: 0, requested: 0, url: '' };

/**
 * The list price for the requested quantity, worked out in code: the page's
 * price for one listing times the listings needed. Only a maker's or major
 * supplier's new price is a list price, and unclear counts give no comparison.
 */
export function listPriceFrom(answer: PriceAnswer): Found & Pick<PriceEntry, 'packPrice' | 'unit' | 'perPack' | 'requested'> {
  if (!answer.found || answer.condition === 'used' || !fromListPriceSite(answer.url)) return NOT_FOUND;
  const counts = { packPrice: answer.packPrice, unit: answer.unit, perPack: answer.perPack, requested: answer.requested };
  const known = answer.packPrice > 0 && answer.perPack > 0 && answer.requested > 0;
  const packs = known ? Math.ceil(answer.requested / answer.perPack) : 0;
  return {
    found: true,
    vendor: answer.vendor,
    product: answer.product,
    listPrice: known ? Math.round(answer.packPrice * packs * 100) / 100 : answer.packPrice,
    sameQuantity: known,
    url: answer.url,
    ...counts,
  };
}

/**
 * The list price for a request, from the saved list or a fresh lookup. None
 * for a category with no list price, or when nothing could be looked up.
 */
export async function checkPrice(
  request: { item: string; category: string; price: number },
  options: { catalog?: string } & Pick<AskOptions<PriceAnswer>, 'mode' | 'client' | 'cacheDir'> = {},
): Promise<PriceCheck | undefined> {
  if (!CHECKED_CATEGORIES.has(request.category)) return undefined;
  const only = options.catalog ?? process.env.GG_PRICE_CATALOG;
  const path = only ?? WORKER_LIST;
  const lists = only ? [only] : [WORKER_LIST, COMMITTED_LIST];
  const saved = findPrice(request.item, request.category, lists.flatMap(readCatalog));
  if (saved) return { entry: saved, from: 'list', tooHigh: isTooHigh(request.price, saved) };

  // The price isn't sent: Claude reports the list price, it doesn't judge this one.
  const { value, by, model } = await ask({
    task: PRICE_TASK,
    system: PRICE_SYSTEM,
    input: { item: request.item, category: request.category },
    schema: PriceAnswer,
    fallback: () => NO_ANSWER,
    model: PRICE_MODEL,
    tools: SEARCH,
    accept: (answer, message) => !answer.found || (answer.packPrice > 0 && searchedUrls(message).has(answer.url)),
    effort: 'low',
    maxTokens: 2_000,
    mode: options.mode,
    client: options.client,
    cacheDir: options.cacheDir,
  });
  if (by === 'fallback') return undefined;
  const entry: PriceEntry = {
    item: request.item,
    category: request.category,
    ...listPriceFrom(value),
    checkedOn: new Date().toISOString().slice(0, 10),
    by: model ?? PRICE_MODEL,
  };
  addToCatalog(path, entry);
  return { entry, from: 'claude', tooHigh: isTooHigh(request.price, entry) };
}
