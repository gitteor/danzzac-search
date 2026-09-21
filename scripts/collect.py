"""Search indexed public links; never scrape the source platforms."""
import hashlib
import html
import json
import os
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site/data/posts.json'

def now():
    return datetime.now(timezone.utc).isoformat()

def clean(value):
    return html.unescape(re.sub(r'<[^>]*>', '', str(value or ''))).strip()

def canonical(url):
    p = urlsplit(url)
    if p.scheme not in ('https', 'http') or not p.hostname:
        raise ValueError('Invalid result URL')
    params = [(k, v) for k, v in parse_qsl(p.query) if not k.startswith('utm_') and k not in ('ref', 'source')]
    scheme = 'https' if p.hostname and p.hostname.endswith('heykorean.com') else p.scheme
    return urlunsplit((scheme, p.netloc.lower(), p.path.rstrip('/'), urlencode(params), ''))

def belongs(url, domain):
    p, d = urlsplit(url), urlsplit('https://' + domain)
    host = (p.hostname or '').lower()
    path = p.path.lower().rstrip('/')
    base = d.path.lower().rstrip('/')
    return (host == d.hostname or host.endswith('.' + d.hostname)) and (not base or path == base or path.startswith(base + '/'))

def score(text, keyword, excludes):
    t = text.casefold()
    if any(e.casefold() in t for e in excludes):
        return 0, []
    groups = [
        (25, '한국 상품 관련', ['korea', 'korean', '한국', 'k-pop', 'kpop', 'olive young', 'weverse']),
        (30, '배송·구매대행 필요', ['proxy', 'forwarding', 'kaddy', 'k-addy', '구매대행', '배송대행', '한국 주소', 'only ship', 'doesn’t ship', "doesn't ship", '해외배송']),
        (25, '질문·추천 요청', ['?', 'looking for', 'recommend', 'how can', 'how do', 'where can', 'help', '추천', '어떻게', '구할']),
        (20, '구매·배송 맥락', ['buy', 'purchase', 'shipping', 'ship to', 'order', '구매', '배송'])
    ]
    reasons, total = [], 0
    for points, label, words in groups:
        if any(w in t for w in words):
            total += points
            reasons.append(label)
    if keyword.casefold() in t and not total:
        return 35, ['설정 검색어 일치']
    return total, reasons

def validate(c):
    for field in ('keywords', 'exclude'):
        if not isinstance(c.get(field), list) or any(not isinstance(v, str) or not v.strip() or len(v) > 200 for v in c[field]):
            raise ValueError('Invalid ' + field)
    if not 1 <= len(c['keywords']) <= 30:
        raise ValueError('Use 1–30 keywords')
    if not c.get('sources') or len(c['sources']) > 20:
        raise ValueError('Use 1–20 sources')
    for s in c['sources']:
        if not re.fullmatch(r'[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[a-zA-Z0-9_/-]+)?', s['domain']):
            raise ValueError('Invalid source domain')
    if c['freshness'] not in ('pd', 'pw', 'pm', 'py'):
        raise ValueError('Invalid freshness')
    for key, lo, hi in [('min_score', 0, 100), ('retention_days', 1, 365), ('max_queries', 1, 600)]:
        if type(c[key]) is not int or not lo <= c[key] <= hi:
            raise ValueError('Invalid ' + key)

class BudgetExhausted(Exception):
    pass

def consume_budget(usage, stamp):
    if usage.get('month') != stamp[:7]:
        usage.update(month=stamp[:7], monthly=0)
    if usage.get('day') != stamp[:10]:
        usage.update(day=stamp[:10], daily=0)
    if usage['monthly'] >= 1000 or usage['daily'] >= 32:
        raise BudgetExhausted()
    usage['monthly'] += 1
    usage['daily'] += 1

def search(query, key, freshness, before_request=lambda: None):
    params = {'q': query, 'count': 20}
    if freshness:
        params['freshness'] = freshness
    url = 'https://api.search.brave.com/res/v1/web/search?' + urlencode(params)
    for attempt in range(3):
        try:
            req = Request(url, headers={'Accept': 'application/json', 'X-Subscription-Token': key})
            before_request()
            with urlopen(req, timeout=30) as res:
                return json.load(res).get('web', {}).get('results', [])
        except HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))

def main():
    c = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
    validate(c)
    previous = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'posts': []}
    stamp = now()
    result = {**previous, 'last_attempt': stamp, 'errors': [], 'queries': 0}
    usage = result.setdefault('usage', {})
    limited = False
    def before_request():
        consume_budget(usage, now())
    key = os.getenv('BRAVE_SEARCH_API_KEY')
    if not key:
        result.update(status='not_configured', errors=['검색 API 키 설정이 필요합니다.'])
    else:
        posts = {p['id']: p for p in previous['posts']}
        successes = 0
        tasks = [(s, k) for k in c['keywords'] for s in c['sources'] if s.get('enabled')]
        # Rotate the capped budget so later queries are never permanently starved.
        start = previous.get('next_query', 0) % max(1, len(tasks))
        tasks = (tasks[start:] + tasks[:start])[:c['max_queries']]
        for source, keyword in tasks:
            result['queries'] += 1
            try:
                rows = search(f"site:{source['domain']} {keyword}", key, c['freshness'], before_request)
                expanded = False
                if not rows:
                    rows = search(f"site:{source['domain']} {keyword}", key, None, before_request)
                    expanded = True
                successes += 1
                for row in rows:
                    url = canonical(row['url'])
                    if not belongs(url, source['domain']):
                        continue
                    title, excerpt = clean(row.get('title')), clean(row.get('description'))
                    rank, reasons = score(title + ' ' + excerpt, keyword, c['exclude'])
                    if rank < c['min_score']:
                        continue
                    uid = hashlib.sha256(url.encode()).hexdigest()[:20]
                    old = posts.get(uid, {})
                    posts[uid] = dict(id=uid, url=url, title=title, excerpt=excerpt[:700], source=source['name'], score=rank,
                        reasons=reasons, keywords=sorted(set(old.get('keywords', []) + [keyword])),
                        first_seen=old.get('first_seen', stamp), last_seen=stamp,
                        expanded_search=expanded,
                        source_date=row.get('page_age') or None,
                        content_updated=stamp if old.get('title') != title or old.get('excerpt') != excerpt[:700] else old.get('content_updated', stamp))
            except BudgetExhausted:
                result['queries'] -= 1
                limited = True
                break
            except Exception as e:
                result['errors'].append({'source': source['name'], 'keyword': keyword, 'error': type(e).__name__})
            time.sleep(1.1)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=c['retention_days'])).isoformat()
        result['posts'] = sorted([p for p in posts.values() if p['last_seen'] >= cutoff], key=lambda p: p['first_seen'], reverse=True)
        result['next_query'] = start + result['queries']
        result['status'] = 'ok' if successes and not result['errors'] else 'partial' if successes else 'error'
        if limited:
            result['status'] = 'budget_limited'
        if successes:
            result['last_success'] = stamp
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(OUT)
    print(f"Collection status: {result['status']}; queries: {result['queries']}; results: {len(result['posts'])}")

if __name__ == '__main__':
    main()
