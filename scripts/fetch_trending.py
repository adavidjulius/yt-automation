#!/usr/bin/env python3
# scripts/fetch_trending.py
# Fetches trending topics from Google Trends + filters for AI/Tech topics
# Uses pytrends — free, no API key needed

import sys
import random
import time

# AI/Tech seed keywords to find trending topics around
AI_SEEDS = [
    'artificial intelligence', 'ChatGPT', 'AI tools',
    'machine learning', 'automation', 'productivity',
    'make money online', 'passive income', 'digital marketing',
    'YouTube growth', 'side hustle', 'freelancing'
]

# Fallback topics if trends fetch fails
FALLBACK_TOPICS = [
    "Best Free AI Tools You Need in 2026",
    "How to Make Money with AI in 2026",
    "Top AI Tools Replacing Jobs Right Now",
    "Free Alternatives to ChatGPT That Are Better",
    "How to Automate Your Work with AI for Free",
    "AI Tools That Will Make You $1000 a Month",
    "Top 5 AI Image Generators That Are Free",
    "How to Build a YouTube Channel Using AI",
    "Best AI Productivity Tools for Students",
    "How to Use AI to Write Better Content",
    "Free AI Coding Tools Every Developer Needs",
    "How to Start a Blog with AI Help for Free",
]

def fetch_google_trends():
    """Fetch trending searches from Google Trends using pytrends"""
    try:
        from pytrends.request import TrendReq
        import pandas as pd

        print("🔍 Connecting to Google Trends...", file=sys.stderr)
        pytrends = TrendReq(hl='en-US', tz=360, timeout=(10, 25))

        # Get real-time trending searches
        trending_df = pytrends.trending_searches(pn='united_states')
        trending_topics = trending_df[0].tolist()[:20]

        print(f"📊 Got {len(trending_topics)} trending topics", file=sys.stderr)

        # Also get related queries for AI seeds
        ai_related = []
        seed = random.choice(AI_SEEDS)
        time.sleep(2)  # Avoid rate limiting

        pytrends.build_payload([seed], timeframe='now 1-d', geo='US')
        related = pytrends.related_queries()

        if related.get(seed) and related[seed].get('rising') is not None:
            rising = related[seed]['rising']
            if not rising.empty:
                ai_related = rising['query'].tolist()[:5]
                print(f"🚀 Rising queries for '{seed}': {ai_related}", file=sys.stderr)

        # Combine and build YouTube video topics
        all_terms = ai_related + trending_topics[:10]

        if all_terms:
            # Pick a term and turn it into a YouTube topic
            term = random.choice(all_terms[:8])
            topics = [
                f"Everything About {term} in 2026",
                f"How to Use {term} for Free",
                f"Why Everyone is Talking About {term}",
                f"Top 5 Ways to Use {term}",
                f"{term} - Complete Beginner's Guide",
            ]
            chosen = random.choice(topics)
            print(f"✅ Generated topic from trend '{term}': {chosen}", file=sys.stderr)
            return chosen

    except Exception as e:
        print(f"⚠️ Google Trends fetch failed: {e}", file=sys.stderr)

    return None

def fetch_youtube_trends():
    """Scrape YouTube trending page for video ideas"""
    try:
        import urllib.request
        import json
        import re

        print("📺 Checking YouTube trends...", file=sys.stderr)

        url = "https://trends.google.com/trends/api/dailytrends?hl=en-US&geo=US&ns=15"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)'
        })

        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read().decode('utf-8')
            # Google wraps response with ")]}',\n"
            clean = raw[raw.index('{'):]
            data = json.loads(clean)

            stories = data.get('default', {}).get('trendingStories', [])
            if stories:
                titles = [s.get('title', '') for s in stories[:10] if s.get('title')]
                if titles:
                    term = random.choice(titles)
                    topic = f"How {term} is Changing Everything in 2026"
                    print(f"✅ YouTube trend topic: {topic}", file=sys.stderr)
                    return topic

    except Exception as e:
        print(f"⚠️ YouTube trends fetch failed: {e}", file=sys.stderr)

    return None

def main():
    # Try Google Trends first
    topic = fetch_google_trends()

    # Try YouTube trends as backup
    if not topic:
        topic = fetch_youtube_trends()

    # Use smart fallback if both fail
    if not topic:
        print("⚠️ Using fallback topic list", file=sys.stderr)
        topic = random.choice(FALLBACK_TOPICS)

    # Print topic to stdout (this is what the workflow captures)
    print(topic)

if __name__ == '__main__':
    main()
