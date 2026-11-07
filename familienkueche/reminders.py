"""Persistent reminder preview and opt-in mobile delivery, independent of the tablet."""
import asyncio
import contextlib
import hashlib
import json
import re
from datetime import date, datetime, time, timedelta, timezone

from aiohttp import web
from server import TZ, parse_boundary
from family import receipt_key, saved_response, save_response

DEFAULTS = dict(enabled=False, waste=True, events=True, tina=True, joern=True,
                wasteTime='18:00', leadMinutes=30, quiet=True, quietStart='22:00', quietEnd='07:00', targets=[], activatedAt=None)
TARGET = re.compile(r'mobile_app_[a-z0-9_]+\Z')
CLOCK = re.compile(r'(?:[01]\d|2[0-3]):[0-5]\d\Z')


def now():
    return datetime.now(TZ)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def wall(day, value):
    """First valid minute at/after wall time; first fold during autumn DST."""
    naive = datetime.combine(day, time.fromisoformat(value))
    for offset in range(181):
        candidate = (naive + timedelta(minutes=offset)).replace(tzinfo=TZ, fold=0)
        if candidate.astimezone(timezone.utc).astimezone(TZ).replace(tzinfo=None) == candidate.replace(tzinfo=None):
            return candidate
    raise ValueError('Diese Uhrzeit kann nicht aufgelöst werden.')


def quiet_due(due, config):
    if not config['quiet'] or config['quietStart'] == config['quietEnd']:
        return due
    at = due.strftime('%H:%M')
    start, end = config['quietStart'], config['quietEnd']
    target = None
    if start > end:
        if at >= start:
            target = wall(due.date() + timedelta(days=1), end)
        elif at < end:
            target = wall(due.date(), end)
    elif start <= at < end:
        target = wall(due.date(), end)
    if target is None:
        return due
    if target.timestamp() < due.timestamp():
        target = target.replace(fold=1)
    if target.timestamp() < due.timestamp():
        target = wall(target.date() + timedelta(days=1), end)
    return target


def settings(data, previous):
    if not isinstance(data, dict):
        raise ValueError('Ungültige Einstellungen.')
    result = dict(previous)
    for key in ('enabled', 'waste', 'events', 'tina', 'joern', 'quiet'):
        if type(data.get(key)) is not bool:
            raise ValueError('Bitte die Erinnerungsregeln vollständig einstellen.')
        result[key] = data[key]
    for key in ('wasteTime', 'quietStart', 'quietEnd'):
        if not isinstance(data.get(key), str) or not CLOCK.fullmatch(data[key]):
            raise ValueError('Bitte gültige Uhrzeiten wählen.')
        result[key] = data[key]
    if type(data.get('leadMinutes')) is not int or data['leadMinutes'] not in (5, 10, 15, 30, 60, 120):
        raise ValueError('Bitte einen Vorlauf zwischen 5 und 120 Minuten wählen.')
    result['leadMinutes'] = data['leadMinutes']
    targets = data.get('targets')
    if not isinstance(targets, list) or len(targets) > 4 or any(not isinstance(t, str) or not TARGET.fullmatch(t) for t in targets) or len(set(targets)) != len(targets):
        raise ValueError('Bitte bis zu vier unterschiedliche Handy-Ziele wählen.')
    result['targets'] = sorted(targets)
    return result


def candidate(event, source, config):
    if not isinstance(event, dict):
        raise ValueError('Ungültiger Kalendereintrag.')
    if event.get('status') == 'cancelled':
        return None
    starts, all_day = parse_boundary(event['start'])
    ends, end_all_day = parse_boundary(event['end'])
    if ends.timestamp() <= starts.timestamp() or all_day != end_all_day:
        raise ValueError('Ungültige Terminzeiten.')
    kind = source['key']
    if kind == 'waste':
        if not config['waste']:
            return None
        original_due = wall(starts.date() - timedelta(days=1), config['wasteTime'])
        expires = datetime.combine(starts.date(), time.min, TZ)
    elif kind in ('tina', 'joern'):
        if all_day or not config['events'] or not config[kind]:
            return None
        original_due = datetime.fromtimestamp(starts.timestamp() - config['leadMinutes'] * 60, TZ)
        expires = starts
    else:
        return None
    title = str(event.get('summary') or 'Ohne Titel')[:200]
    # Occurrence start distinguishes recurring appointments with the same UID.
    identity = [source['entity'], event.get('uid') or title, event.get('recurrence_id'), starts.isoformat()]
    ident = digest(identity)
    due = quiet_due(original_due, config)
    return dict(id=ident, source=kind, sourceLabel=source['label'], person=source['person'],
                title=title, date=starts.date().isoformat(), allDay=all_day,
                start=starts.isoformat(), end=ends.isoformat(), originalDue=original_due.isoformat(),
                due=due.isoformat(), expires=expires.isoformat(), quietAdjusted=due.timestamp() != original_due.timestamp(),
                eventRevision=digest([title, starts.isoformat(), ends.isoformat(), source['entity']]))


class ReminderEngine:
    def __init__(self, app):
        self.app = app
        self.lock = asyncio.Lock()
        self.wake = asyncio.Event()
        self.fresh = {}
        self.sources = []
        self.targets = []
        self.target_at = 0
        self.target_error = ''
        self.loading = False
        self.fetched_at = None
        self.error = ''

    @property
    def db(self):
        return self.app['db']

    def config(self):
        row = self.db.execute('SELECT data, revision FROM reminder_config WHERE id=1').fetchone()
        return json.loads(row[0]), row[1]

    async def discover(self):
        try:
            raw = await asyncio.wait_for(self.app['ha'].request('GET', 'services'), 15)
            if not isinstance(raw, list):
                raise ValueError()
            targets = []
            for domain in raw:
                if not isinstance(domain, dict) or domain.get('domain') != 'notify':
                    continue
                services = domain.get('services')
                if not isinstance(services, dict):
                    raise ValueError()
                for name, info in services.items():
                    if TARGET.fullmatch(name):
                        label = info.get('name') if isinstance(info, dict) else ''
                        label = re.sub(r'^Mobile App\s+', '', label or name.removeprefix('mobile_app_').replace('_', ' '), flags=re.I)
                        targets.append(dict(id=name, label=label[:100]))
            self.targets = sorted(targets, key=lambda x: x['label'])
            self.target_at = now().timestamp()
            self.target_error = ''
            return True
        except Exception:
            self.target_error = 'Handy-Ziele konnten nicht neu geladen werden.'
            return False

    async def refresh(self):
        async with self.lock:
            self.loading = True
            config, revision = self.config()
            current = now()
            start, end = current.date() - timedelta(days=1), current.date() + timedelta(days=15)
            sources = [s for s in self.app['sources'] if s['key'] in ('tina', 'joern', 'waste')]
            async def one(source):
                try:
                    raw = await asyncio.wait_for(self.app['ha'].events(source['entity'], start, end), 20)
                    if not isinstance(raw, list) or len(raw) > 2000:
                        raise ValueError()
                    rows, skipped = {}, 0
                    for event in raw:
                        try:
                            item = candidate(event, source, config)
                            if item and start <= date.fromisoformat(item['date']) < end:
                                rows[item['id']] = item
                        except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
                            skipped += 1
                    return source, list(rows.values()), skipped, ''
                except Exception:
                    return source, [], 0, 'Kalender nicht erreichbar. Kein Versand aus diesem Kalender.'
            try:
                results, _ = await asyncio.gather(asyncio.gather(*(one(s) for s in sources)), self.discover())
                if self.config()[1] != revision:
                    self.wake.set()
                    return
                status = []
                with self.db:
                    for source, rows, skipped, error in results:
                        key = source['key']
                        status.append(dict(key=key, label=source['label'], ok=not error,
                                           warning=error or (str(skipped) + ' ungültige Einträge übersprungen.' if skipped else '')))
                        if error:
                            self.fresh.pop(key, None)
                            continue
                        self.fresh[key] = now().timestamp()
                        self.db.execute('UPDATE reminder_items SET active=0 WHERE source=?', (key,))
                        for item in rows:
                            row = self.db.execute('SELECT payload, config_revision FROM reminder_items WHERE id=?', (item['id'],)).fetchone()
                            raw = json.dumps(item, sort_keys=True)
                            if row:
                                self.db.execute('UPDATE reminder_items SET payload=?, config_revision=?, active=1, revision=revision+?, seen_at=? WHERE id=?',
                                                (raw, revision, int(raw != row[0] or revision != row[1]), current.timestamp(), item['id']))
                            else:
                                self.db.execute('INSERT INTO reminder_items VALUES (?, ?, ?, ?, 1, 0, NULL, 0, 1, ?)',
                                                (item['id'], key, raw, revision, current.timestamp()))
                    self.db.execute('DELETE FROM reminder_items WHERE seen_at < ?', (current.timestamp() - 7 * 86400,))
                    self.db.execute('DELETE FROM reminder_deliveries WHERE created < ?', (current.timestamp() - 90 * 86400,))
                self.sources = status
                self.fetched_at = now().isoformat()
                self.error = ''
            except Exception:
                self.fresh.clear()
                self.error = 'Erinnerungen konnten nicht aktualisiert werden. Automatischer Versand pausiert.'
            finally:
                self.loading = False

    def item(self, row, config, revision, current):
        ident, source, raw, config_revision, active, dismissed, snooze, cycle, item_revision, seen = row
        data = json.loads(raw)
        due = datetime.fromisoformat(data['due'])
        if snooze is not None:
            due = quiet_due(datetime.fromtimestamp(snooze, TZ), config)
        expires = datetime.fromisoformat(data['expires'])
        fresh = config_revision == revision and current.timestamp() - self.fresh.get(source, 0) < 120
        if not active:
            status = 'cancelled'
        elif dismissed:
            status = 'dismissed'
        elif expires.timestamp() <= current.timestamp():
            status = 'expired'
        elif not fresh:
            status = 'stale'
        elif due.timestamp() >= expires.timestamp():
            status = 'suppressed'
        elif due.timestamp() > current.timestamp():
            status = 'snoozed' if snooze is not None else 'upcoming'
        else:
            status = 'due'
        receipts = [dict(target=r[0], status=r[1]) for r in self.db.execute(
            'SELECT target, status FROM reminder_deliveries WHERE reminder_id=? AND cycle=?', (ident, cycle))]
        return dict(data, due=due.isoformat(), revision=item_revision, cycle=cycle, status=status,
                    quietAdjusted=due.timestamp() != datetime.fromisoformat(data['originalDue']).timestamp() and snooze is None,
                    preview=not config['enabled'], deliveries=receipts,
                    beforeActivation=bool(config.get('activatedAt') and due.timestamp() < config['activatedAt']))

    def snapshot(self):
        config, revision = self.config()
        current = now()
        items = [self.item(row, config, revision, current) for row in self.db.execute('SELECT * FROM reminder_items')]
        items = [r for r in items if r['status'] not in ('cancelled', 'expired')]
        items.sort(key=lambda r: datetime.fromisoformat(r['due']).timestamp())
        targets = []
        for target in self.targets:
            row = self.db.execute('SELECT test_key, accepted_at, confirmed_at FROM reminder_devices WHERE target=?', (target['id'],)).fetchone()
            targets.append(dict(target, tested=bool(row and row[1]), confirmed=bool(row and row[2]), testId=row[0] if row else None))
        history = [dict(id=r[0], target=r[1], status=r[2], created=datetime.fromtimestamp(r[3], TZ).isoformat(), error=r[4])
                   for r in self.db.execute('SELECT reminder_id, target, status, created, error FROM reminder_deliveries ORDER BY created DESC LIMIT 20')]
        return dict(config=config, revision=revision, items=items[:100], total=len(items), truncated=len(items)>100,
                    targets=targets, targetError=self.target_error, sources=self.sources, fetchedAt=self.fetched_at,
                    loading=self.loading, error=self.error, timezone='Europe/Berlin', history=history)

    async def deliver(self):
        config, revision = self.config()
        if not config['enabled']:
            return
        for row in list(self.db.execute('SELECT * FROM reminder_items')):
            for target in config['targets']:
                latest, current_revision = self.config()
                if current_revision != revision or not latest['enabled']:
                    return
                current_row = self.db.execute('SELECT * FROM reminder_items WHERE id=?', (row[0],)).fetchone()
                item = self.item(current_row, latest, revision, now())
                proof = self.db.execute('SELECT confirmed_at FROM reminder_devices WHERE target=?', (target,)).fetchone()
                if (item['status'] != 'due' or item['beforeActivation'] or not proof or not proof[0]
                        or self.target_error or now().timestamp() - self.target_at >= 120
                        or target not in {t['id'] for t in self.targets}):
                    continue
                key = 'auto:' + item['id'] + ':' + str(item['cycle']) + ':' + target
                if self.db.execute('SELECT 1 FROM reminder_deliveries WHERE key=?', (key,)).fetchone():
                    continue
                payload = notification(item)
                with self.db:
                    self.db.execute('INSERT INTO reminder_deliveries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                    (key, item['id'], item['cycle'], target, 'pending', digest(payload), now().timestamp(), '', None))
                try:
                    await asyncio.wait_for(self.app['ha'].service('notify', target, payload), 15)
                except Exception:
                    state, error = 'uncertain', 'Keine sichere Versandbestätigung. Kein automatischer Neuversuch.'
                else:
                    state, error = 'done', ''
                with self.db:
                    self.db.execute('UPDATE reminder_deliveries SET status=?, error=? WHERE key=?', (state, error, key))

    async def run(self):
        while True:
            self.wake.clear()
            try:
                await self.refresh()
                await self.deliver()
            except Exception:
                self.error = 'Erinnerungsprüfung unterbrochen. Nächster Versuch folgt automatisch.'
            try:
                await asyncio.wait_for(self.wake.wait(), 60)
            except asyncio.TimeoutError:
                pass


def notification(item):
    starts = datetime.fromisoformat(item['start'])
    ends = datetime.fromisoformat(item['end'])
    if item['source'] == 'waste':
        message = item['title'] + ' · Abholung am ' + starts.strftime('%d.%m.') + ' · Bitte am Vorabend bereitstellen.'
    else:
        person = 'Tina' if item['person'] == 'tina' else 'Jörn'
        message = item['title'] + ' · ' + starts.strftime('%d.%m. %H:%M') + ' - ' + ends.strftime('%H:%M') + ' · ' + person
    return dict(title='Familienküche · Erinnerung', message=message,
                data=dict(tag='familienkueche-' + item['id'][:24], group='familienkueche'))


async def get_reminders(request):
    return web.json_response(request.app['reminders'].snapshot())


async def manual_test(request, data, key, hashed):
    engine, db = request.app['reminders'], request.app['db']
    target = data.get('target')
    if not isinstance(target, str) or not TARGET.fullmatch(target):
        raise ValueError('Bitte ein gültiges Smartphone wählen.')
    async with request.app['write_lock']:
        previous = saved_response(db, key, hashed)
        if previous is not None:
            return previous
        record = db.execute('SELECT digest, status FROM reminder_deliveries WHERE key=?', (key,)).fetchone()
        if record:
            return web.json_response({'error': 'Testversand nicht sicher bestätigt. Bitte zuerst auf dem Gerät prüfen.', 'uncertain': True}, status=409)
    if not await engine.discover() or target not in {t['id'] for t in engine.targets}:
        return web.json_response({'error': 'Dieses Handy-Ziel ist momentan nicht verfügbar.'}, status=503)
    async with request.app['write_lock']:
        previous = saved_response(db, key, hashed)
        if previous is not None:
            return previous
        recent = db.execute("SELECT 1 FROM reminder_deliveries WHERE reminder_id='test' AND target=? AND created>?", (target, now().timestamp()-60)).fetchone()
        if recent:
            return web.json_response({'error': 'Bitte mindestens eine Minute zwischen zwei Testnachrichten warten.'}, status=429)
        with db:
            db.execute('INSERT INTO reminder_deliveries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                       (key, 'test', 0, target, 'pending', hashed, now().timestamp(), '', None))
    try:
        await asyncio.wait_for(request.app['ha'].service('notify', target, dict(title='Familienküche · Test',
            message='Die Testnachricht ist angekommen. Bitte jetzt in der Familienküche mit „Ist angekommen“ bestätigen.',
            data=dict(tag='familienkueche-test', group='familienkueche'))), 15)
    except Exception:
        with db:
            db.execute("UPDATE reminder_deliveries SET status='uncertain', error=? WHERE key=?", ('Testversand unbestätigt. Bitte Gerät prüfen.', key))
        return web.json_response({'error': 'Testversand nicht sicher bestätigt. Bitte auf dem Gerät prüfen; kein automatischer Neuversuch.', 'uncertain': True}, status=502)
    async with request.app['write_lock']:
        result = dict(success=True, testId=key, target=target)
        with db:
            db.execute("UPDATE reminder_deliveries SET status='done', result=? WHERE key=?", (json.dumps(result), key))
            db.execute('INSERT INTO reminder_devices VALUES (?, ?, ?, NULL) ON CONFLICT(target) DO UPDATE SET test_key=excluded.test_key, accepted_at=excluded.accepted_at',
                       (target, key, now().timestamp()))
            save_response(db, key, hashed, result)
    return web.json_response(result)


async def write_reminders(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('Ungültige Anfrage.')
        key = receipt_key(request, 'reminder')
        hashed = digest(data)
        action = data.get('action')
        if action == 'test':
            return await manual_test(request, data, key, hashed)
        if action == 'refresh':
            await request.app['reminders'].refresh()
            return web.json_response({'success': True})
        async with request.app['write_lock']:
            engine, db = request.app['reminders'], request.app['db']
            previous = saved_response(db, key, hashed)
            if previous is not None:
                return previous
            if action == 'settings':
                config, revision = engine.config()
                if type(data.get('revision')) is not int or data['revision'] != revision:
                    return web.json_response({'error': 'Einstellungen wurden inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
                updated = settings(data.get('config'), config)
                if updated['enabled']:
                    if not updated['targets']:
                        raise ValueError('Vor dem Aktivieren mindestens ein getestetes Handy wählen.')
                    available = {t['id'] for t in engine.targets} if not engine.target_error and now().timestamp()-engine.target_at<120 else set()
                    for target in updated['targets']:
                        proof = db.execute('SELECT confirmed_at FROM reminder_devices WHERE target=?', (target,)).fetchone()
                        if target not in available or not proof or not proof[0]:
                            raise ValueError('Bitte zuerst jedes gewählte Handy testen und den Empfang bestätigen.')
                    if not config['enabled']:
                        updated['activatedAt'] = now().timestamp()
                with db:
                    db.execute('UPDATE reminder_config SET data=?, revision=revision+1 WHERE id=1', (json.dumps(updated),))
                    save_response(db, key, hashed, {'success': True})
                engine.wake.set()
            elif action == 'confirm-test':
                target, test_id = data.get('target'), data.get('testId')
                if not isinstance(target, str) or not isinstance(test_id, str):
                    raise ValueError('Ungültige Testbestätigung.')
                row = db.execute('SELECT test_key FROM reminder_devices WHERE target=?', (target,)).fetchone()
                sent = db.execute("SELECT 1 FROM reminder_deliveries WHERE key=? AND target=? AND reminder_id='test' AND status='done'", (test_id, target)).fetchone()
                if not row or row[0] != test_id or not sent:
                    raise ValueError('Bitte zuerst eine bestätigte Testnachricht an dieses Gerät senden.')
                with db:
                    db.execute('UPDATE reminder_devices SET confirmed_at=? WHERE target=?', (now().timestamp(), target))
                    save_response(db, key, hashed, {'success': True})
            elif action in ('dismiss', 'snooze'):
                ident = data.get('id')
                if not isinstance(ident, str):
                    raise ValueError('Ungültige Erinnerung.')
                row = db.execute('SELECT * FROM reminder_items WHERE id=?', (ident,)).fetchone()
                if not row or type(data.get('revision')) is not int or row[8] != data['revision'] or not row[4]:
                    return web.json_response({'error': 'Erinnerung wurde inzwischen geändert. Bitte aktualisieren.', 'conflict': True}, status=409)
                if action == 'snooze':
                    config, revision = engine.config()
                    mins = data.get('minutes')
                    if type(mins) is not int or mins not in (10, 30):
                        raise ValueError('Bitte 10 oder 30 Minuten wählen.')
                    current_item = engine.item(row, config, revision, now())
                    if current_item['status'] not in ('due', 'upcoming', 'snoozed'):
                        raise ValueError('Diese Erinnerung kann momentan nicht verschoben werden.')
                    base = max(now().timestamp(), datetime.fromisoformat(current_item['due']).timestamp())
                    due = datetime.fromtimestamp(base + mins * 60, TZ)
                    expires = datetime.fromisoformat(json.loads(row[2])['expires'])
                    if quiet_due(due, config).timestamp() >= expires.timestamp():
                        raise ValueError('Dann beginnt der Termin bereits oder die Erinnerung ist abgelaufen.')
                with db:
                    if action == 'dismiss':
                        db.execute('UPDATE reminder_items SET dismissed=1, revision=revision+1 WHERE id=?', (ident,))
                    else:
                        db.execute('UPDATE reminder_items SET dismissed=0, snooze=?, cycle=cycle+1, revision=revision+1 WHERE id=?', (due.timestamp(), ident))
                    save_response(db, key, hashed, {'success': True})
            else:
                raise ValueError('Unbekannte Erinnerungsaktion.')
        return web.json_response({'success': True})
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        return web.json_response({'error': str(exc)}, status=400)


async def lifecycle(app):
    with app['db']:
        app['db'].execute("UPDATE reminder_deliveries SET status='uncertain', error=? WHERE status='pending'", ('Vor dem Neustart nicht sicher bestätigt. Kein automatischer Neuversuch.',))
    task = asyncio.create_task(app['reminders'].run())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


def setup(app):
    db = app['db']
    db.execute('CREATE TABLE IF NOT EXISTS reminder_config (id INTEGER PRIMARY KEY, data TEXT, revision INTEGER)')
    db.execute('INSERT OR IGNORE INTO reminder_config VALUES (1, ?, 1)', (json.dumps(DEFAULTS),))
    db.execute('CREATE TABLE IF NOT EXISTS reminder_items (id TEXT PRIMARY KEY, source TEXT, payload TEXT, config_revision INTEGER, active INTEGER, dismissed INTEGER, snooze REAL, cycle INTEGER, revision INTEGER, seen_at REAL)')
    db.execute('CREATE TABLE IF NOT EXISTS reminder_deliveries (key TEXT PRIMARY KEY, reminder_id TEXT, cycle INTEGER, target TEXT, status TEXT, digest TEXT, created REAL, error TEXT, result TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS reminder_devices (target TEXT PRIMARY KEY, test_key TEXT, accepted_at REAL, confirmed_at REAL)')
    db.commit()
    app['reminders'] = ReminderEngine(app)
    app.cleanup_ctx.append(lifecycle)
    app.router.add_get('/api/reminders', get_reminders)
    app.router.add_post('/api/reminders/actions', write_reminders)
