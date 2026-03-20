#!/usr/bin/env python3
# scripts/fetch_trending.py
# Fetches trending topics using Google News RSS + Reddit + YouTube RSS
# No API keys needed — all public feeds, never breaks

import sys
import random
import urllib.request
import xml.etree.ElementTree as ET
import json
import re

# ─── AI/Tech focused RSS feeds — always working ──────────────────────────────
RSS_FEEDS = [
    # Google News AI topics — real trending news
    "https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=AI+tools+free&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=make+money+online+AI&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=ChatGPT+alternative&hl=en-US&gl=US&ceid=US:en",
    # Google Trends Daily RSS — actual trending searches
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US",
    # Tech news RSS
    "https://feeds.feedburner.com/TechCrunch",
    "https://www.theverge.com/rss/index.xml",
]

# YouTube-style topic templates
TEMPLATES = [
    "How to Use {} for Free in 2026",
    "Why Everyone is Talking About {} Right Now",
    "Top 5 Ways {} is Changing Everything",
    "{} - Complete Beginner's Guide 2026",
    "How {} Can Make You Money in 2026",
    "The Truth About {} Nobody Tells You",
    "I Tried {} for 30 Days - Here's What Happened",
    "{} vs ChatGPT - Which is Better?",
    "How to Get Started with {} Today for Free",
    "Is {} Worth It in 2026? Honest Review",
]

# Curated smart fallbacks — proven viral YouTube topics
SMART_FALLBACKS = [
    "Best Free AI Tools You Need Right Now in 2026",
    "How to Make $500 a Month Using Free AI Tools",
    "Top 5 ChatGPT Alternatives That Are Completely Free",
    "How to Automate Your Entire Workflow with AI for Free",
    "I Used AI to Run My Business for 30 Days - Results",
    "Free AI Tools That Are Better Than Paid Ones in 2026",
    "How to Use Google Gemini for Free - Full Tutorial",
    "Top AI Tools for Students That Are 100% Free",
    "How to Create YouTube Videos with AI for Free",
    "The Best Free AI Image Generators in 2026 Ranked",
    "How AI is Making People $10,000 a Month Passively",
    "5 Free AI Tools That Will Replace Your Entire Toolkit",
    "How to Write Better with AI - Free Tools Only",
    "Best Free AI Coding Assistants for Beginners 2026",
    "How to Start a Blog Using AI for Completely Free",
]

def fetch_rss(url, timeout=10):
    """Fetch and parse RSS feed"""
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; RSS reader/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8', errors='ignore')

def parse_rss_titles(xml_content):
    """Extract titles from RSS XML"""
    titles = []
    try:
        root = ET.fromstring(xml_content)
        # Handle both RSS and Atom formats
        ns = {'atom': 'http://www.w3.org/2005/Atom'}

        # RSS format
        for item in root.findall('.//item'):
            title = item.find('title')
            if title is not None and title.text:
                titles.append(title.text.strip())

        # Atom format
        for entry in root.findall('.//atom:entry', ns):
            title = entry.find('atom:title', ns)
            if title is not None and title.text:
                titles.append(title.text.strip())

        # Google Trends RSS specific
        for title in root.findall('.//{http://www.w3.org/2005/Atom}title'):
            if title.text:
                titles.append(title.text.strip())

    except ET.ParseError:
        # Try regex fallback for malformed XML
        matches = re.findall(r'<title[^>]*><!\[CDATA\[(.*?)\]\]>', xml_content)
        if not matches:
            matches = re.findall(r'<title[^>]*>(.*?)</title>', xml_content)
        titles = [m.strip() for m in matches if m.strip()]

    return titles

def clean_title(title):
    """Clean RSS title for use as YouTube topic"""
    # Remove HTML tags
    title = re.sub(r'<[^>]+>', '', title)
    # Remove source attribution like "- TechCrunch"
    title = re.sub(r'\s*[-|]\s*(TechCrunch|The Verge|Wired|BBC|CNN|Reuters|AP).*$', '', title)
    # Remove CDATA artifacts
    title = title.replace(']]>', '').replace('<![CDATA[', '')
    # Decode HTML entities
    title = title.replace('&amp;', '&').replace('&quot;', '"').replace('&#39;', "'")
    return title.strip()

def is_good_topic(title):
    """Filter for AI/Tech/Money topics good for YouTube"""
    title_lower = title.lower()
    good_keywords = [
        'ai', 'artificial intelligence', 'chatgpt', 'gpt', 'gemini', 'llm',
        'machine learning', 'automation', 'robot', 'tool', 'app', 'software',
        'free', 'money', 'income', 'business', 'startup', 'tech', 'google',
        'youtube', 'productivity', 'hack', 'trick', 'guide', 'tutorial',
        'how to', 'best', 'top', 'review', 'vs', 'alternative'
    ]
    bad_keywords = ['murder', 'death', 'war', 'crash', 'killed', 'attack',
                   'hurricane', 'flood', 'shooting', 'arrested', 'scandal']

    has_good = any(kw in title_lower for kw in good_keywords)
    has_bad = any(kw in title_lower for kw in bad_keywords)
    too_short = len(title) < 15
    too_long = len(title) > 100

    return has_good and not has_bad and not too_short and not too_long

def title_to_youtube_topic(title):
    """Convert news headline to YouTube video topic"""
    clean = clean_title(title)
    if not clean or len(clean) < 10:
        return None

    # Extract the main subject (first few words)
    words = clean.split()
    subject = ' '.join(words[:6]) if len(words) > 6 else clean

    # Apply a random YouTube-style template
    template = random.choice(TEMPLATES)
    return template.format(subject)

def fetch_google_trends_rss():
    """Fetch real trending searches from Google Trends RSS"""
    url = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US"
    print("🔍 Fetching Google Trends RSS...", file=sys.stderr)

    try:
        xml = fetch_rss(url)
        titles = parse_rss_titles(xml)
        print(f"  📊 Got {len(titles)} trending searches", file=sys.stderr)

        good = [t for t in titles if is_good_topic(t)]
        if good:
            chosen = random.choice(good[:10])
            topic = title_to_youtube_topic(chosen)
            if topic:
                print(f"  ✅ Trend: '{chosen}' → '{topic}'", file=sys.stderr)
                return topic
    except Exception as e:
        print(f"  ⚠️ Google Trends RSS failed: {e}", file=sys.stderr)
    return None

def fetch_google_news_rss():
    """Fetch AI trending topics from Google News RSS"""
    feed = random.choice(RSS_FEEDS[:4])  # Pick random AI-focused feed
    print(f"📰 Fetching Google News RSS...", file=sys.stderr)

    try:
        xml = fetch_rss(feed)
        titles = parse_rss_titles(xml)
        print(f"  📊 Got {len(titles)} news items", file=sys.stderr)

        good = [t for t in titles if is_good_topic(t)]
        if good:
            chosen = random.choice(good[:8])
            clean = clean_title(chosen)
            topic = title_to_youtube_topic(clean)
            if topic:
                print(f"  ✅ News: '{clean[:50]}' → '{topic}'", file=sys.stderr)
                return topic
    except Exception as e:
        print(f"  ⚠️ Google News RSS failed: {e}", file=sys.stderr)
    return None

def fetch_reddit_trending():
    """Fetch trending from Reddit r/technology and r/artificial"""
    subreddits = ['technology', 'artificial', 'MachineLearning', 'ChatGPT', 'singularity']
    sub = random.choice(subreddits)
    url = f"https://www.reddit.com/r/{sub}/hot.json?limit=10"
    print(f"🤖 Fetching Reddit r/{sub}...", file=sys.stderr)

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; YouTubeBot/1.0)'
        })
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode())

        posts = data.get('data', {}).get('children', [])
        titles = [p['data']['title'] for p in posts
                  if p['data'].get('score', 0) > 100]

        good = [t for t in titles if is_good_topic(t)]
        if good:
            chosen = random.choice(good[:5])
            topic = title_to_youtube_topic(chosen)
            if topic:
                print(f"  ✅ Reddit: '{chosen[:50]}' → '{topic}'", file=sys.stderr)
                return topic
    except Exception as e:
        print(f"  ⚠️ Reddit failed: {e}", file=sys.stderr)
    return None

def main():
    print("🔥 Fetching trending topic...", file=sys.stderr)

    # Try multiple sources in order
    topic = None

    # 1. Google Trends RSS (most relevant — actual trending searches)
    topic = fetch_google_trends_rss()

    # 2. Google News RSS (AI/tech news)
    if not topic:
        topic = fetch_google_news_rss()

    # 3. Reddit trending (community-driven)
    if not topic:
        topic = fetch_reddit_trending()

    # 4. Smart curated fallback (always good YouTube topics)
    if not topic:
        topic = random.choice(SMART_FALLBACKS)
        print(f"⚠️ All feeds failed — using curated fallback: {topic}", file=sys.stderr)

    # Output topic to stdout (captured by GitHub Actions)
    print(topic)

if __name__ == '__main__':
    main()
