#!/usr/bin/env python3
# Fetch trending topics — all debug to stderr, only topic to stdout

import sys
import random
import urllib.request
import xml.etree.ElementTree as ET
import json
import re

RSS_FEEDS = [
    "https://trends.google.com/trends/trendingsearches/daily/rss?geo=US",
    "https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=AI+tools+free&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=make+money+online+AI&hl=en-US&gl=US&ceid=US:en",
]

TEMPLATES = [
    "How to Use {} for Free in 2026",
    "Why Everyone is Talking About {}",
    "Top 5 Ways {} is Changing Everything",
    "{} Complete Beginner Guide 2026",
    "How {} Can Make You Money in 2026",
    "The Truth About {} Nobody Tells You",
    "I Tried {} for 30 Days Here's What Happened",
    "How to Get Started with {} Today for Free",
]

FALLBACKS = [
    "Best Free AI Tools You Need Right Now",
    "How to Make Money Using Free AI Tools",
    "Top 5 ChatGPT Alternatives That Are Free",
    "How to Automate Your Work with AI for Free",
    "Free AI Tools Better Than Paid Ones in 2026",
    "How to Use Google Gemini Free Full Tutorial",
    "Top AI Tools for Students Completely Free",
    "How to Create YouTube Videos with AI Free",
    "Best Free AI Image Generators 2026 Ranked",
    "How AI is Making People Money Passively",
    "5 Free AI Tools That Replace Your Entire Toolkit",
    "How to Write Better with AI Free Tools Only",
    "Best Free AI Coding Tools for Beginners 2026",
    "How to Start a Blog Using AI Completely Free",
]

def fetch_rss(url, timeout=10):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; RSS/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='ignore')

def parse_titles(xml_content):
    titles = []
    try:
        root = ET.fromstring(xml_content)
        for item in root.findall('.//item'):
            t = item.find('title')
            if t is not None and t.text:
                titles.append(t.text.strip())
    except:
        matches = re.findall(r'<title[^>]*><!\[CDATA\[(.*?)\]\]>', xml_content)
        if not matches:
            matches = re.findall(r'<title[^>]*>(.*?)</title>', xml_content)
        titles = [m.strip() for m in matches if m.strip()]
    return titles

def clean(title):
    title = re.sub(r'<[^>]+>', '', title)
    title = re.sub(r'\s*[-|]\s*(TechCrunch|Verge|Wired|BBC|CNN|Reuters).*$', '', title)
    title = title.replace(']]>', '').replace('<![CDATA[', '')
    title = title.replace('&amp;', '&').replace('&quot;', '"').replace('&#39;', "'")
    return title.strip()

def is_good(title):
    t = title.lower()
    good = ['ai', 'chatgpt', 'gpt', 'gemini', 'tool', 'free', 'money',
            'tech', 'app', 'how to', 'best', 'top', 'tutorial', 'automation']
    bad  = ['murder', 'death', 'war', 'killed', 'attack', 'shooting', 'arrested']
    return (any(k in t for k in good) and
            not any(k in t for k in bad) and
            15 < len(title) < 100)

def to_topic(title):
    c = clean(title)
    if not c or len(c) < 10:
        return None
    words = c.split()
    subject = ' '.join(words[:6]) if len(words) > 6 else c
    return random.choice(TEMPLATES).format(subject)

def fetch_trends():
    for feed in RSS_FEEDS:
        try:
            print(f"🔍 Trying: {feed[:50]}...", file=sys.stderr)
            xml = fetch_rss(feed)
            titles = parse_titles(xml)
            good = [t for t in titles if is_good(t)]
            print(f"  📊 {len(titles)} items, {len(good)} good", file=sys.stderr)
            if good:
                chosen = random.choice(good[:8])
                topic = to_topic(chosen)
                if topic:
                    print(f"  ✅ Topic: {topic}", file=sys.stderr)
                    return topic
        except Exception as e:
            print(f"  ⚠️ Failed: {e}", file=sys.stderr)
    return None

def fetch_reddit():
    subs = ['artificial', 'ChatGPT', 'technology', 'MachineLearning']
    sub = random.choice(subs)
    print(f"🤖 Trying Reddit r/{sub}...", file=sys.stderr)
    try:
        req = urllib.request.Request(
            f"https://www.reddit.com/r/{sub}/hot.json?limit=10",
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        posts = [p['data']['title'] for p in data['data']['children']
                 if p['data'].get('score', 0) > 100]
        good = [t for t in posts if is_good(t)]
        if good:
            topic = to_topic(random.choice(good[:5]))
            if topic:
                print(f"  ✅ Reddit topic: {topic}", file=sys.stderr)
                return topic
    except Exception as e:
        print(f"  ⚠️ Reddit failed: {e}", file=sys.stderr)
    return None

def main():
    print("🔥 Fetching trending topic...", file=sys.stderr)

    topic = fetch_trends()
    if not topic:
        topic = fetch_reddit()
    if not topic:
        topic = random.choice(FALLBACKS)
        print(f"⚠️ Using fallback: {topic}", file=sys.stderr)

    # ONLY this goes to stdout — everything else uses stderr
    print(topic)

if __name__ == '__main__':
    main()
