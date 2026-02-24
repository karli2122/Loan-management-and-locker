"""eBay web scraper for fetching used phone prices in EUR."""
import requests
from bs4 import BeautifulSoup
import re
import logging
import statistics
from typing import Optional

logger = logging.getLogger(__name__)

# Known Samsung model number to name mappings
SAMSUNG_MODEL_MAP = {
    "SM-S938B": "Samsung Galaxy S24 Ultra",
    "SM-S928B": "Samsung Galaxy S24+",
    "SM-S921B": "Samsung Galaxy S24",
    "SM-S918B": "Samsung Galaxy S23 Ultra",
    "SM-S916B": "Samsung Galaxy S23+",
    "SM-S911B": "Samsung Galaxy S23",
    "SM-S908B": "Samsung Galaxy S22 Ultra",
    "SM-S906B": "Samsung Galaxy S22+",
    "SM-S901B": "Samsung Galaxy S22",
    "SM-F956B": "Samsung Galaxy Z Fold6",
    "SM-F946B": "Samsung Galaxy Z Fold5",
    "SM-F936B": "Samsung Galaxy Z Fold4",
    "SM-F731B": "Samsung Galaxy Z Flip5",
    "SM-F721B": "Samsung Galaxy Z Flip4",
    "SM-A556B": "Samsung Galaxy A55",
    "SM-A546B": "Samsung Galaxy A54",
    "SM-A536B": "Samsung Galaxy A53",
    "SM-A346B": "Samsung Galaxy A34",
    "SM-A326B": "Samsung Galaxy A32",
    "SM-A256B": "Samsung Galaxy A25",
    "SM-A156B": "Samsung Galaxy A15",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def normalize_model_name(device_model: str, device_make: str = "") -> str:
    """Convert raw device model (e.g., 'samsung SM-F956B') into a search-friendly name."""
    model = device_model.strip()
    make = device_make.strip().lower()

    # Check Samsung model map first
    for code, name in SAMSUNG_MODEL_MAP.items():
        if code.lower() in model.lower():
            return name

    # Generic cleanup: strip make prefix if present
    cleaned = model
    if make and cleaned.lower().startswith(make):
        cleaned = cleaned[len(make):].strip()

    # If still looks like a model code, prepend the make
    if re.match(r'^[A-Z]{2}-', cleaned):
        brand = make.capitalize() if make else ""
        return f"{brand} {cleaned}".strip()

    return cleaned


def parse_eur_price(price_text: str) -> Optional[float]:
    """Parse EUR price from text like 'EUR 123,45' or '123.45 €'."""
    if not price_text:
        return None

    text = price_text.strip()

    # Skip price ranges like "EUR 10,00 bis EUR 500,00"
    if "bis" in text.lower() or " to " in text.lower():
        return None

    # Remove currency symbols and labels
    text = text.replace("EUR", "").replace("€", "").strip()

    # Handle German format: 1.234,56 -> 1234.56
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")

    # Extract first number
    match = re.search(r'(\d+\.?\d*)', text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def scrape_ebay_prices(query: str, max_results: int = 40) -> dict:
    """
    Scrape eBay.de for used phone prices.
    Returns dict with prices list, median, average, and listing count.
    """
    # Use eBay.de for EUR prices
    url = "https://www.ebay.de/sch/i.html"
    params = {
        "_nkw": f"{query} gebraucht",  # "gebraucht" = used in German
        "_sacat": "9355",               # Cell Phones & Smartphones category
        "LH_ItemCondition": "4",        # Used condition
        "LH_PrefLoc": "1",              # Located in EU
        "_ipg": "60",
        "rt": "nc",
        "LH_BIN": "1",                  # Buy It Now only (skip auctions)
    }

    try:
        logger.info(f"Scraping eBay.de for: {query}")
        response = requests.get(url, headers=HEADERS, params=params, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        items = soup.select(".s-item")

        prices = []
        listings = []

        for item in items[:max_results]:
            title_el = item.select_one(".s-item__title")
            price_el = item.select_one(".s-item__price")

            if not title_el or not price_el:
                continue

            title = title_el.get_text(strip=True)
            price_text = price_el.get_text(strip=True)

            # Skip irrelevant results (accessories, cases, screen protectors)
            skip_keywords = [
                "hülle", "case", "folie", "schutz", "kabel", "charger",
                "ladegerät", "adapter", "kopfhörer", "earphone", "shop on ebay",
                "glass", "screen protector", "tempered", "cover", "tasche",
            ]
            title_lower = title.lower()
            if any(kw in title_lower for kw in skip_keywords):
                continue

            price = parse_eur_price(price_text)
            if price and 20 < price < 3000:  # reasonable phone price range
                prices.append(price)
                listings.append({
                    "title": title[:100],
                    "price": price,
                })

        if not prices:
            logger.warning(f"No valid prices found for: {query}")
            return {
                "success": False,
                "query": query,
                "message": "No listings found",
                "prices": [],
                "listing_count": 0,
            }

        # Remove outliers using IQR method
        if len(prices) >= 4:
            sorted_prices = sorted(prices)
            q1 = sorted_prices[len(sorted_prices) // 4]
            q3 = sorted_prices[3 * len(sorted_prices) // 4]
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            filtered = [p for p in prices if lower <= p <= upper]
            if filtered:
                prices = filtered

        median_price = round(statistics.median(prices), 2)
        avg_price = round(statistics.mean(prices), 2)
        min_price = round(min(prices), 2)
        max_price = round(max(prices), 2)

        logger.info(f"eBay scrape results for '{query}': {len(prices)} prices, median={median_price}€")

        return {
            "success": True,
            "query": query,
            "listing_count": len(prices),
            "median_price": median_price,
            "average_price": avg_price,
            "min_price": min_price,
            "max_price": max_price,
            "sample_listings": listings[:5],
        }

    except requests.Timeout:
        logger.error(f"eBay scrape timeout for: {query}")
        return {"success": False, "query": query, "message": "Request timed out"}
    except requests.RequestException as e:
        logger.error(f"eBay scrape error for '{query}': {e}")
        return {"success": False, "query": query, "message": str(e)}
    except Exception as e:
        logger.error(f"eBay scrape unexpected error: {e}")
        return {"success": False, "query": query, "message": f"Unexpected error: {e}"}


def fetch_used_phone_price(device_model: str, device_make: str = "") -> dict:
    """
    Main entry point: fetch used phone price from eBay.
    Returns price data with source info.
    """
    search_name = normalize_model_name(device_model, device_make)
    result = scrape_ebay_prices(search_name)

    if result["success"]:
        return {
            "price_eur": result["median_price"],
            "avg_price_eur": result["average_price"],
            "min_price_eur": result["min_price"],
            "max_price_eur": result["max_price"],
            "listing_count": result["listing_count"],
            "search_query": search_name,
            "source": "ebay.de",
            "sample_listings": result.get("sample_listings", []),
        }

    # Fallback: try with just the model code if full name didn't work
    if device_model != search_name:
        logger.info(f"Retrying with raw model: {device_model}")
        result = scrape_ebay_prices(device_model)
        if result["success"]:
            return {
                "price_eur": result["median_price"],
                "avg_price_eur": result["average_price"],
                "min_price_eur": result["min_price"],
                "max_price_eur": result["max_price"],
                "listing_count": result["listing_count"],
                "search_query": device_model,
                "source": "ebay.de",
                "sample_listings": result.get("sample_listings", []),
            }

    return {
        "price_eur": None,
        "listing_count": 0,
        "search_query": search_name,
        "source": "ebay.de",
        "error": result.get("message", "No listings found"),
    }
