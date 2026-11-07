"""Conservative recipe classification from explicit Mealie metadata."""
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Berlin')


def key(text):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', str(text)).encode('ascii', 'ignore').decode().lower()).strip('-')


def duration_minutes(value):
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip().lower().replace(',', '.')
    iso = re.fullmatch(r'pt(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?', value)
    if iso and any(iso.groups()):
        minutes = float(iso[1] or 0) * 60 + float(iso[2] or 0) + float(iso[3] or 0) / 60
    elif re.fullmatch(r'\d+(?:\.\d+)?', value):
        minutes = float(value)
    elif re.fullmatch(r'\d{1,3}:\d{2}(?::\d{2})?', value):
        parts = [int(x) for x in value.split(':')]
        if any(x >= 60 for x in parts[1:]):
            return None
        minutes = parts[0] * 60 + parts[1] + (parts[2] / 60 if len(parts) == 3 else 0)
    else:
        tokens = re.findall(r'(\d+(?:\.\d+)?)\s*(stunden?|std\.?|hours?|hrs?\.?|h|minuten?|minutes?|mins?\.?|min\.?|m)(?![a-z])', value)
        remainder = re.sub(r'(\d+(?:\.\d+)?)\s*(stunden?|std\.?|hours?|hrs?\.?|h|minuten?|minutes?|mins?\.?|min\.?|m)(?![a-z])', '', value).strip()
        if not tokens or remainder:
            return None
        minutes = sum(float(n) * (60 if unit.startswith(('st', 'h')) else 1) for n, unit in tokens)
    return round(minutes, 3) if 0 < minutes <= 10080 else None


def metadata(raw):
    labels = set()
    for entry in (raw.get('tags') or []) + (raw.get('categories') or []):
        if isinstance(entry, dict):
            labels.update(key(entry.get(field) or '') for field in ('name', 'slug'))
    vegetarian = bool(labels & {'vegetarisch', 'vegetarische-gerichte', 'vegetarian', 'veggie', 'vegan', 'vegane-gerichte'})
    favorite = bool(labels & {'familienfavorit', 'familienfavoriten', 'family-favorite', 'family-favourite'})
    total = duration_minutes(raw.get('total_time'))
    # Prep time alone is not a reliable total duration.
    if total is None and not raw.get('total_time'):
        prep, cook = duration_minutes(raw.get('prep_time')), duration_minutes(raw.get('perform_time'))
        if prep is not None and cook is not None:
            total = round(prep + cook, 3)
    last = None
    if raw.get('last_made'):
        try:
            stamp = datetime.fromisoformat(str(raw['last_made']).replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=TZ)
            last = stamp.astimezone(TZ).date().isoformat()
        except (ValueError, TypeError):
            pass
    return {'favorite': favorite, 'vegetarian': vegetarian, 'minutes': total, 'lastMade': last}
