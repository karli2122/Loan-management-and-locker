"""Generate translations for all 14 languages using Emergent LLM."""
import asyncio
import json
import re
import os

from emergentintegrations.llm.chat import LlmChat, UserMessage

API_KEY = os.environ.get('EMERGENT_LLM_KEY', 'sk-emergent-d65DdCbA42465B7188')

LANG_NAMES = {
    'no': 'Norwegian (Bokmål)',
    'sv': 'Swedish',
    'da': 'Danish',
    'fi': 'Finnish',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'cs': 'Czech',
    'pl': 'Polish',
    'es': 'Spanish',
    'de': 'German',
    'fr': 'French',
    'it': 'Italian',
}

def extract_translations(filepath):
    """Extract all translation keys and their English values from the TSX file."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Find the translations object
    match = re.search(r'const translations:.*?= \{(.*?)\n\};', content, re.DOTALL)
    if not match:
        raise ValueError("Could not find translations object")
    
    translations_block = match.group(1)
    
    # Extract each key and its translations
    keys_data = {}
    # Match pattern: key: { en: 'text', ... }
    pattern = r"(\w+):\s*\{([^}]+)\}"
    for m in re.finditer(pattern, translations_block):
        key = m.group(1)
        props = m.group(2)
        
        # Extract the English value
        en_match = re.search(r"en:\s*['\"](.+?)['\"](?:\s*,|\s*$)", props)
        if en_match:
            en_text = en_match.group(1)
            
            # Extract existing translations for each language
            existing = {}
            for lang in list(LANG_NAMES.keys()) + ['et', 'en']:
                lang_match = re.search(rf"{lang}:\s*['\"](.+?)['\"]", props)
                if lang_match:
                    existing[lang] = lang_match.group(1)
            
            keys_data[key] = {
                'en': en_text,
                'existing': existing,
            }
    
    return keys_data

async def translate_batch(keys_with_english, target_lang, lang_name):
    """Translate a batch of English strings to target language."""
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"translate-{target_lang}-{len(keys_with_english)}",
        system_message=f"""You are a professional translator. Translate the following UI strings from English to {lang_name}. 
Rules:
- Keep translations concise and natural for UI elements
- Preserve any template variables like ${{variable}} exactly as-is
- Preserve special characters like \\n
- Do not translate proper nouns like "EMI", "PDF", "QR", "SEB", "OCR", "Google Drive", "Device Admin", "ROI"
- Keep technical terms as-is when no natural translation exists
- Return ONLY a valid JSON object mapping the key to the translated string
- Do not include any explanation, markdown, or code blocks - just the raw JSON"""
    )
    chat.with_model("openai", "gpt-4o-mini")
    
    # Build the prompt
    items = {}
    for key, en_text in keys_with_english:
        items[key] = en_text
    
    prompt = f"Translate these UI strings to {lang_name}. Return only JSON mapping key->translation:\n{json.dumps(items, ensure_ascii=False)}"
    
    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)
    
    # Parse the response
    try:
        # Clean up response - remove markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith('```'):
            cleaned = re.sub(r'^```\w*\n?', '', cleaned)
            cleaned = re.sub(r'\n?```$', '', cleaned)
        result = json.loads(cleaned)
        return result
    except json.JSONDecodeError:
        print(f"  WARNING: Failed to parse JSON for {target_lang}, batch size {len(keys_with_english)}")
        print(f"  Response: {response[:200]}")
        return {}

async def main():
    filepath = '/app/frontend/src/context/LanguageContext.tsx'
    keys_data = extract_translations(filepath)
    
    print(f"Extracted {len(keys_data)} translation keys")
    
    # For each language, find missing translations and generate them
    all_translations = {}  # key -> {lang: translation}
    
    for lang, lang_name in LANG_NAMES.items():
        print(f"\n--- Translating to {lang_name} ({lang}) ---")
        
        # Find keys missing this language
        missing = []
        for key, data in keys_data.items():
            if lang not in data['existing']:
                missing.append((key, data['en']))
        
        print(f"  {len(missing)} keys need translation")
        
        if not missing:
            continue
        
        # Batch translate (100 keys per batch for efficiency)
        BATCH_SIZE = 100
        translated = {}
        
        for i in range(0, len(missing), BATCH_SIZE):
            batch = missing[i:i + BATCH_SIZE]
            print(f"  Translating batch {i // BATCH_SIZE + 1}/{(len(missing) + BATCH_SIZE - 1) // BATCH_SIZE} ({len(batch)} keys)")
            
            try:
                result = await translate_batch(batch, lang, lang_name)
                translated.update(result)
                print(f"    Got {len(result)} translations")
            except Exception as e:
                print(f"    ERROR: {e}")
        
        # Store translations
        for key, translation in translated.items():
            if key not in all_translations:
                all_translations[key] = {}
            all_translations[key][lang] = translation
    
    # Now also copy de translations to de_at and de_ch
    for key in all_translations:
        if 'de' in all_translations[key]:
            if 'de_at' not in keys_data.get(key, {}).get('existing', {}):
                if key not in all_translations:
                    all_translations[key] = {}
                all_translations[key]['de_at'] = all_translations[key]['de']
            if 'de_ch' not in keys_data.get(key, {}).get('existing', {}):
                all_translations[key]['de_ch'] = all_translations[key]['de']
    
    # Write output as JSON for processing
    output = {}
    for key, data in keys_data.items():
        output[key] = dict(data['existing'])
        if key in all_translations:
            output[key].update(all_translations[key])
    
    with open('/app/translations_output.json', 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n=== Done! Written {len(output)} keys to /app/translations_output.json ===")
    
    # Count completion
    total_needed = len(keys_data) * (len(LANG_NAMES) + 2)  # +2 for en, et
    total_have = sum(len(v) for v in output.values())
    print(f"Translation coverage: {total_have}/{total_needed} ({100*total_have/total_needed:.1f}%)")

if __name__ == '__main__':
    asyncio.run(main())
