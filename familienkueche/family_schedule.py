"""Calendar-based task schedules. Legacy weekday definitions retain their meaning."""
import calendar
from datetime import date, timedelta


def rule(item):
    return item.get('repeat') or dict(kind='weekly' if item['weekdays'] else 'once', interval=1, monthDay=date.fromisoformat(item['startDate']).day)


def validate(data, previous, kind, days, start):
    raw = data.get('repeat')
    old = (previous or {}).get('repeat')
    if raw is None and old and (old['kind']=='monthly' or old['interval']>1):
        raw = old
    if raw is None:
        raw = dict(kind='weekly' if days else 'once', interval=1, monthDay=start.day)
    if not isinstance(raw, dict) or raw.get('kind') not in ('once', 'weekly', 'monthly'):
        raise ValueError('Bitte eine gültige Wiederholung wählen.')
    interval = raw.get('interval', 1)
    month_day = raw.get('monthDay', start.day)
    if type(interval) is not int or not 1 <= interval <= 12 or type(month_day) is not int or not 0 <= month_day <= 31:
        raise ValueError('Intervall 1–12 und einen gültigen Monatstag wählen.')
    if raw['kind'] == 'weekly' and not days:
        raise ValueError('Mindestens einen Wochentag wählen.')
    if kind == 'routine' and raw['kind'] == 'once':
        raise ValueError('Für eine Routine eine Wiederholung wählen.')
    return dict(kind=raw['kind'], interval=interval, monthDay=month_day)


def month_date(start, offset, chosen):
    index = start.year * 12 + start.month - 1 + offset
    year, month = divmod(index, 12)
    month += 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(chosen or last, last))


def scheduled(item, day):
    start = date.fromisoformat(item['startDate'])
    if day < start:
        return False
    repeat = rule(item)
    if repeat['kind'] == 'once':
        return True
    if repeat['kind'] == 'monthly':
        offset = (day.year-start.year)*12 + day.month-start.month
        return offset % repeat['interval'] == 0 and day == month_date(start, offset, repeat['monthDay'])
    weeks = ((day-timedelta(days=day.weekday()))-(start-timedelta(days=start.weekday()))).days//7
    return weeks % repeat['interval'] == 0 and day.weekday() in item['weekdays']


def index(item, day):
    """Zero-based occurrence rank, bounded work even for decades-old schedules."""
    repeat = rule(item)
    start = date.fromisoformat(item['startDate'])
    if day < start or repeat['kind'] == 'once':
        return 0
    if repeat['kind'] == 'monthly':
        offset = (day.year-start.year)*12+day.month-start.month
        return max(0, offset//repeat['interval']-(month_date(start, 0, repeat['monthDay']) < start))
    count = 0
    for weekday in item['weekdays']:
        first = start+timedelta(days=(weekday-start.weekday()) % 7)
        weeks = ((first-timedelta(days=first.weekday()))-(start-timedelta(days=start.weekday()))).days//7
        first += timedelta(weeks=(-weeks) % repeat['interval'])
        if day >= first:
            count += (day-first).days//(7*repeat['interval'])+1
    return max(0, count-1)


def occurrence(item, day):
    return 'once' if rule(item)['kind'] == 'once' else day.isoformat()


def signature(item):
    return [item['startDate'], item['weekdays'], rule(item), item.get('rotation', False)]
