"""Used phone price scraper - fetches real market prices from Swappa.com.

Swappa is a US-based used device marketplace with reliable pricing data.
Prices are fetched in USD and converted to EUR.
Falls back to eBay.de scraping if Swappa fails (eBay may not work from all environments).
"""
import httpx
from bs4 import BeautifulSoup
import re
import json
import logging
import statistics
from typing import Optional

logger = logging.getLogger(__name__)

USD_TO_EUR = 0.92  # Approximate conversion rate

# Known Samsung model number to Swappa URL slug mappings
SAMSUNG_MODEL_MAP = {
    "SM-S938B": ("Samsung Galaxy S24 Ultra", "samsung-galaxy-s24-ultra"),
    "SM-S928B": ("Samsung Galaxy S24+", "samsung-galaxy-s24-plus"),
    "SM-S921B": ("Samsung Galaxy S24", "samsung-galaxy-s24"),
    "SM-S918B": ("Samsung Galaxy S23 Ultra", "samsung-galaxy-s23-ultra"),
    "SM-S916B": ("Samsung Galaxy S23+", "samsung-galaxy-s23-plus"),
    "SM-S911B": ("Samsung Galaxy S23", "samsung-galaxy-s23"),
    "SM-S908B": ("Samsung Galaxy S22 Ultra", "samsung-galaxy-s22-ultra"),
    "SM-S906B": ("Samsung Galaxy S22+", "samsung-galaxy-s22-plus"),
    "SM-S901B": ("Samsung Galaxy S22", "samsung-galaxy-s22"),
    "SM-F956B": ("Samsung Galaxy Z Fold6", "samsung-galaxy-z-fold6"),
    "SM-F946B": ("Samsung Galaxy Z Fold5", "samsung-galaxy-z-fold5"),
    "SM-F936B": ("Samsung Galaxy Z Fold4", "samsung-galaxy-z-fold4"),
    "SM-F731B": ("Samsung Galaxy Z Flip5", "samsung-galaxy-z-flip5"),
    "SM-F721B": ("Samsung Galaxy Z Flip4", "samsung-galaxy-z-flip4"),
    "SM-A556B": ("Samsung Galaxy A55", "samsung-galaxy-a55-5g"),
    "SM-A546B": ("Samsung Galaxy A54", "samsung-galaxy-a54-5g"),
    "SM-A536B": ("Samsung Galaxy A53", "samsung-galaxy-a53-5g"),
    "SM-A346B": ("Samsung Galaxy A34", "samsung-galaxy-a34-5g"),
    "SM-A326B": ("Samsung Galaxy A32", "samsung-galaxy-a32-5g"),
    "SM-A256B": ("Samsung Galaxy A25", "samsung-galaxy-a25-5g"),
    "SM-A156B": ("Samsung Galaxy A15", "samsung-galaxy-a15-5g"),
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def normalize_model(device_model: str, device_make: str = ""):
    """Convert raw device model to (display_name, swappa_slug)."""
    model = device_model.strip()

    # Check Samsung model map
    for code, (name, slug) in SAMSUNG_MODEL_MAP.items():
        if code.lower() in model.lower():
            return name, slug

    # Generic: build slug from model name
    cleaned = model
    make = device_make.strip().lower()
    if make and cleaned.lower().startswith(make):
        cleaned = cleaned[len(make):].strip()

    # Build slug: "Samsung Galaxy S24" -> "samsung-galaxy-s24"
    full_name = f"{make} {cleaned}".strip() if make else cleaned
    slug = re.sub(r'[^a-z0-9]+', '-', full_name.lower()).strip('-')
    return full_name, slug


def scrape_swappa(slug: str, display_name: str) -> dict:
    """Scrape Swappa product page for used phone prices."""
    url = f"https://swappa.com/buy/{slug}"

    try:
        logger.info(f"Scraping Swappa: {url}")
        with httpx.Client(follow_redirects=True, timeout=15) as client:
            response = client.get(url, headers=HEADERS)

        if response.status_code != 200:
            logger.warning(f"Swappa returned {response.status_code} for {slug}")
            return {"success": False, "message": f"Swappa returned {response.status_code}"}

        soup = BeautifulSoup(response.text, "lxml")

        # Parse JSON-LD for structured price data
        low_price = None
        high_price = None
        scripts = soup.select('script[type="application/ld+json"]')
        for s in scripts:
            try:
                data = json.loads(s.string)
                if isinstance(data, dict) and "offers" in data:
                    offers = data.get("offers", {})
                    if isinstance(offers, dict):
                        low_price = float(offers.get("lowPrice", 0))
                        high_price = float(offers.get("highPrice", 0))
                        display_name = data.get("name", display_name)
            except (json.JSONDecodeError, ValueError):
                continue

        # Parse individual listing prices from the page
        listing_prices = []
        price_divs = soup.select('.fs-6.fw-bold.color-green, span.float-end.color-green')
        for el in price_divs:
            text = el.get_text(strip=True)
            match = re.search(r'\$(\d+)', text)
            if match:
                price = float(match.group(1))
                if 10 < price < 5000:
                    listing_prices.append(price)

        # Also get from strong tags with $ sign
        for strong in soup.find_all('strong'):
            text = strong.get_text(strip=True)
            match = re.match(r'^\$(\d+)$', text)
            if match:
                price = float(match.group(1))
                if 10 < price < 5000:
                    listing_prices.append(price)

        # Deduplicate prices
        listing_prices = list(set(listing_prices))

        if not listing_prices and not low_price:
            return {"success": False, "message": "No prices found on page"}

        # Calculate stats
        if listing_prices:
            median_usd = statistics.median(listing_prices)
            avg_usd = statistics.mean(listing_prices)
            min_usd = min(listing_prices)
            max_usd = max(listing_prices)
        elif low_price and high_price:
            median_usd = (low_price + high_price) / 2
            avg_usd = median_usd
            min_usd = low_price
            max_usd = high_price
            listing_prices = [low_price, high_price]
        else:
            return {"success": False, "message": "Unable to parse prices"}

        # Convert to EUR
        result = {
            "success": True,
            "display_name": display_name,
            "median_price_eur": round(median_usd * USD_TO_EUR, 2),
            "avg_price_eur": round(avg_usd * USD_TO_EUR, 2),
            "min_price_eur": round(min_usd * USD_TO_EUR, 2),
            "max_price_eur": round(max_usd * USD_TO_EUR, 2),
            "listing_count": len(listing_prices),
            "source": "swappa.com",
            "source_url": str(response.url),
            "sample_listings": [
                {"title": display_name, "price": round(p * USD_TO_EUR, 2)}
                for p in sorted(listing_prices)[:5]
            ],
        }

        logger.info(f"Swappa prices for '{display_name}': median={result['median_price_eur']}€, "
                     f"{len(listing_prices)} listings")
        return result

    except httpx.TimeoutException:
        logger.error(f"Swappa timeout for: {slug}")
        return {"success": False, "message": "Request timed out"}
    except Exception as e:
        logger.error(f"Swappa error for '{slug}': {e}")
        return {"success": False, "message": str(e)}


def scrape_ebay_de(display_name: str) -> dict:
    """Scrape eBay.de sold listings for used phone prices in EUR.
    Uses regex extraction since eBay.de's HTML structure varies."""
    query = f"{display_name} gebraucht"
    url = "https://www.ebay.de/sch/i.html"
    params = {
        "_nkw": query,
        "_sacat": "9355",   # Cell Phones & Smartphones
        "LH_Sold": "1",     # Sold listings for accurate market prices
        "LH_Complete": "1",
    }
    try:
        logger.info(f"Scraping eBay.de: {query}")
        with httpx.Client(follow_redirects=True, timeout=15) as client:
            response = client.get(url, params=params, headers={
                **HEADERS,
                "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
            })

        if response.status_code != 200:
            logger.warning(f"eBay.de returned {response.status_code}")
            return {"success": False, "message": f"eBay.de returned {response.status_code}"}

        # Extract EUR prices from raw HTML using regex (reliable across layout changes)
        prices = []
        for m in re.finditer(r'EUR\s*([\d]+[.,][\d]+|[\d]+)', response.text):
            txt = m.group(1).replace('.', '').replace(',', '.')
            try:
                price = float(txt)
                if 50 < price < 5000:
                    prices.append(price)
            except ValueError:
                continue

        if not prices:
            return {"success": False, "message": "No sold listings found on eBay.de"}

        # Remove outliers (keep middle 80%)
        prices.sort()
        if len(prices) > 5:
            trim = max(1, len(prices) // 10)
            prices = prices[trim:-trim]

        result = {
            "success": True,
            "display_name": display_name,
            "median_price_eur": round(statistics.median(prices), 2),
            "avg_price_eur": round(statistics.mean(prices), 2),
            "min_price_eur": round(min(prices), 2),
            "max_price_eur": round(max(prices), 2),
            "listing_count": len(prices),
            "source": "ebay.de",
            "source_url": str(response.url),
            "sample_listings": [
                {"title": display_name, "price": round(p, 2)}
                for p in sorted(prices)[:5]
            ],
        }
        logger.info(f"eBay.de prices for '{display_name}': median={result['median_price_eur']}EUR, {len(prices)} sold listings")
        return result

    except httpx.TimeoutException:
        logger.error(f"eBay.de timeout for: {display_name}")
        return {"success": False, "message": "Request timed out"}
    except Exception as e:
        logger.error(f"eBay.de error for '{display_name}': {e}")
        return {"success": False, "message": str(e)}


def fetch_used_phone_price(device_model: str, device_make: str = "") -> dict:
    """
    Main entry point: fetch used phone price.
    Tries Swappa first, falls back to eBay.de.
    Returns price data with source info.
    """
    display_name, slug = normalize_model(device_model, device_make)
    logger.info(f"Fetching price for: {device_model} -> {display_name} (slug: {slug})")

    # Try Swappa first
    result = scrape_swappa(slug, display_name)

    if result["success"]:
        return {
            "price_eur": result["median_price_eur"],
            "avg_price_eur": result["avg_price_eur"],
            "min_price_eur": result["min_price_eur"],
            "max_price_eur": result["max_price_eur"],
            "listing_count": result["listing_count"],
            "search_query": display_name,
            "source": result["source"],
            "source_url": result.get("source_url", ""),
            "sample_listings": result.get("sample_listings", []),
        }

    # Fallback: try eBay.de
    logger.info(f"Swappa failed, trying eBay.de for: {display_name}")
    ebay_result = scrape_ebay_de(display_name)

    if ebay_result["success"]:
        return {
            "price_eur": ebay_result["median_price_eur"],
            "avg_price_eur": ebay_result["avg_price_eur"],
            "min_price_eur": ebay_result["min_price_eur"],
            "max_price_eur": ebay_result["max_price_eur"],
            "listing_count": ebay_result["listing_count"],
            "search_query": display_name,
            "source": ebay_result["source"],
            "source_url": ebay_result.get("source_url", ""),
            "sample_listings": ebay_result.get("sample_listings", []),
        }

    # Retry Swappa with raw slug
    if slug != re.sub(r'[^a-z0-9]+', '-', device_model.lower()).strip('-'):
        raw_slug = re.sub(r'[^a-z0-9]+', '-', device_model.lower()).strip('-')
        logger.info(f"Retrying with raw slug: {raw_slug}")
        result = scrape_swappa(raw_slug, device_model)
        if result["success"]:
            return {
                "price_eur": result["median_price_eur"],
                "avg_price_eur": result["avg_price_eur"],
                "min_price_eur": result["min_price_eur"],
                "max_price_eur": result["max_price_eur"],
                "listing_count": result["listing_count"],
                "search_query": device_model,
                "source": result["source"],
                "source_url": result.get("source_url", ""),
                "sample_listings": result.get("sample_listings", []),
            }

    return {
        "price_eur": None,
        "listing_count": 0,
        "search_query": display_name,
        "source": "swappa.com/ebay.de",
        "error": result.get("message", "No listings found"),
    }
