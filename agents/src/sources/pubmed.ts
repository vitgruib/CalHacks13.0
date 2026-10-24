// PubMed side of a paper lookup: DOI → PMID and PMCID (PMC's ID converter,
// or a PubMed search when the paper isn't in PMC, since the converter only
// knows PMC papers), then the PubMed record for the grant numbers the paper
// acknowledges and its errata, retraction and concern links.
//
// efetch only speaks XML. pubmedXmlAsJson turns the answer into a small JSON
// shape below fetchJson, so caching, saved copies and offline mode work the
// same as for every other source, and author names and affiliations are
// dropped before anything is saved.

import type { Get, PaperUpdate, UpdateKind } from './papers.ts';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const IDCONV = 'https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/';
const TOOL = 'grantguard'; // NCBI asks every caller to name its tool

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const asId = (value: unknown): string | null => (typeof value === 'number' ? String(value) : asText(value));

// PubMed's CommentsCorrections types that mean the paper itself changed.
// CommentIn, Cites and the like are ignored.
const LINK_KINDS: Record<string, UpdateKind> = {
  ErratumIn: 'correction',
  CorrectedandRepublishedIn: 'correction',
  RetractionIn: 'retraction',
  PartialRetractionIn: 'retraction',
  ExpressionOfConcernIn: 'expression_of_concern',
  UpdateIn: 'other',
  RepublishedIn: 'other',
};

export interface PubmedArticle {
  pmid: string | null;
  title: string | null;
  doi: string | null;
  pmcid: string | null;
  date: string | null;
  publicationTypes: string[];
  grantIds: string[];
  links: Array<{ type: string; pmid: string | null; source: string | null }>;
}

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function first(xml: string, pattern: RegExp): string | null {
  const match = pattern.exec(xml);
  return match ? decode(match[1]) || null : null;
}

function ymd(xml: string, element: RegExp): string | null {
  const block = element.exec(xml)?.[0];
  if (!block) return null;
  const year = /<Year>(\d{4})<\/Year>/.exec(block)?.[1];
  const month = /<Month>(\d{1,2})<\/Month>/.exec(block)?.[1];
  const day = /<Day>(\d{1,2})<\/Day>/.exec(block)?.[1];
  if (!year) return null;
  return [year, month, month && day ? day : undefined].filter(Boolean).map((part) => part!.padStart(2, '0')).join('-');
}

// PubMed XML is regular enough to read with patterns, and it keeps this
// package free of an XML dependency. Only the article's own ArticleIdList
// (the first one in PubmedData) counts: the reference list repeats the
// element for every cited paper.
export function parsePubmedXml(xml: string): PubmedArticle[] {
  return xml
    .split(/<PubmedArticle(?:\s[^>]*)?>/)
    .slice(1)
    .map((chunk) => {
      const ownIds = /<PubmedData>[\s\S]*?<ArticleIdList>([\s\S]*?)<\/ArticleIdList>/.exec(chunk)?.[1] ?? '';
      const grantList = /<GrantList[^>]*>([\s\S]*?)<\/GrantList>/.exec(chunk)?.[1] ?? '';
      const links = [...chunk.matchAll(/<CommentsCorrections RefType="([^"]+)"[^>]*>([\s\S]*?)<\/CommentsCorrections>/g)]
        .filter((match) => match[1] in LINK_KINDS)
        .map((match) => ({
          type: match[1],
          pmid: first(match[2], /<PMID[^>]*>(\d+)<\/PMID>/),
          source: first(match[2], /<RefSource>([\s\S]*?)<\/RefSource>/),
        }));
      return {
        pmid: first(chunk, /<PMID[^>]*>(\d+)<\/PMID>/),
        title: first(chunk, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/),
        doi: first(ownIds, /<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.toLowerCase() ?? null,
        pmcid: first(ownIds, /<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/),
        date: ymd(chunk, /<ArticleDate[^>]*>[\s\S]*?<\/ArticleDate>/) ?? ymd(chunk, /<PubMedPubDate PubStatus="pubmed">[\s\S]*?<\/PubMedPubDate>/),
        publicationTypes: [...chunk.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)].map((match) => decode(match[1])),
        grantIds: [...grantList.matchAll(/<GrantID>([^<]+)<\/GrantID>/g)].map((match) => decode(match[1])).filter(Boolean),
        links,
      };
    });
}

export function pubmedXmlAsJson(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await inner(input, init);
    if (!response.ok) return response;
    return Response.json({ articles: parsePubmedXml(await response.text()) });
  };
}

function readArticles(answer: unknown): PubmedArticle[] {
  return asArray(asObject(answer).articles).map((entry) => {
    const article = asObject(entry);
    return {
      pmid: asText(article.pmid),
      title: asText(article.title),
      doi: asText(article.doi),
      pmcid: asText(article.pmcid),
      date: asText(article.date),
      publicationTypes: asArray(article.publicationTypes).map(asText).filter((type) => type !== null),
      grantIds: asArray(article.grantIds).map(asText).filter((id) => id !== null),
      links: asArray(article.links).map((link) => ({
        type: asText(asObject(link).type) ?? '',
        pmid: asText(asObject(link).pmid),
        source: asText(asObject(link).source),
      })),
    };
  });
}

function efetchUrl(pmids: string[]): string {
  return `${EUTILS}/efetch.fcgi?${new URLSearchParams({ db: 'pubmed', retmode: 'xml', tool: TOOL, id: pmids.join(',') })}`;
}

async function findIds(get: Get, doi: string, about: string): Promise<{ pmid: string | null; pmcid: string | null; urls: string[] }> {
  const idconvUrl = `${IDCONV}?${new URLSearchParams({ ids: doi, format: 'json', tool: TOOL })}`;
  // The converter echoes the request (and any email) back: keep the records only.
  const converted = await get(idconvUrl, about, {
    select: (raw) => ({
      records: asArray(asObject(raw).records).map((entry) => {
        const record = asObject(entry);
        return { doi: record.doi ?? null, pmid: record.pmid ?? null, pmcid: record.pmcid ?? null, errmsg: record.errmsg ?? null };
      }),
    }),
  });
  const record = asArray(asObject(converted).records)
    .map(asObject)
    .find((entry) => asText(entry.doi)?.toLowerCase() === doi);
  const pmcid = asText(record?.pmcid);
  const pmid = asId(record?.pmid);
  if (pmid !== null) return { pmid, pmcid, urls: [idconvUrl] };

  const searchUrl = `${EUTILS}/esearch.fcgi?${new URLSearchParams({ db: 'pubmed', retmode: 'json', tool: TOOL, term: `"${doi}"[doi]` })}`;
  const searched = await get(searchUrl, about, {
    select: (raw) => {
      const result = asObject(asObject(raw).esearchresult);
      return { esearchresult: { count: result.count ?? null, idlist: asArray(result.idlist) } };
    },
  });
  const ids = asArray(asObject(asObject(searched).esearchresult).idlist).map(asId).filter((id) => id !== null);
  // More than one hit means the DOI is ambiguous in PubMed: better no PMID than the wrong paper.
  return { pmid: ids.length === 1 ? ids[0] : null, pmcid, urls: [idconvUrl, searchUrl] };
}

export interface PubmedSide {
  pmid: string | null;
  pmcid: string | null;
  title: string | null;
  grantIds: string[];
  updates: PaperUpdate[];
  urls: string[];
}

export async function readPubmed(get: Get, doi: string, about: string): Promise<PubmedSide> {
  const ids = await findIds(get, doi, about);
  if (ids.pmid === null) return { pmid: null, pmcid: ids.pmcid, title: null, grantIds: [], updates: [], urls: ids.urls };

  const articleUrl = efetchUrl([ids.pmid]);
  const article = readArticles(await get(articleUrl, about, { wrap: pubmedXmlAsJson })).find((entry) => entry.pmid === ids.pmid);
  if (article === undefined) {
    throw new Error(`papers: ${about}: PubMed has no record for PMID ${ids.pmid} at ${articleUrl}`);
  }

  const urls = [...ids.urls, articleUrl];
  const noticePmids = [...new Set(article.links.map((link) => link.pmid).filter((pmid) => pmid !== null))].sort(
    (a, b) => Number(a) - Number(b),
  );
  const notices = new Map<string, PubmedArticle>();
  if (noticePmids.length > 0) {
    const noticesUrl = efetchUrl(noticePmids);
    for (const notice of readArticles(await get(noticesUrl, `${about} (notices)`, { wrap: pubmedXmlAsJson }))) {
      if (notice.pmid) notices.set(notice.pmid, notice);
    }
    urls.push(noticesUrl);
  }

  const updates: PaperUpdate[] = article.links.map((link) => {
    const notice = link.pmid ? notices.get(link.pmid) : undefined;
    const doiInSource = link.source ? /doi:\s*(10\.\S+)/i.exec(link.source)?.[1].replace(/\.$/, '').toLowerCase() : undefined;
    return {
      kind: LINK_KINDS[link.type] ?? 'other',
      noticeDoi: notice?.doi ?? doiInSource ?? null,
      noticePmid: link.pmid,
      title: notice?.title ?? null,
      date: notice?.date ?? null,
      source: 'PubMed',
      via: null,
    };
  });
  // The publication type and the RetractionIn link are recorded separately;
  // either one is enough to call the paper retracted.
  if (article.publicationTypes.includes('Retracted Publication') && !updates.some((update) => update.kind === 'retraction')) {
    updates.push({ kind: 'retraction', noticeDoi: null, noticePmid: null, title: null, date: null, source: 'PubMed', via: null });
  }

  return {
    pmid: ids.pmid,
    pmcid: ids.pmcid ?? article.pmcid,
    title: article.title,
    grantIds: article.grantIds,
    updates,
    urls,
  };
}
