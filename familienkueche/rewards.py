"""Local points and reviewable reward redemptions; no money or external service calls."""
import hashlib
import json
import uuid
import secrets
from datetime import datetime
from aiohttp import web
from server import TZ

PEOPLE = ('tina', 'joern', 'felix')


def balance(db, person):
    earned = db.execute('SELECT coalesce(sum(amount),0) FROM family_point_awards WHERE person=? AND active=1', (person,)).fetchone()[0]
    spent = db.execute('SELECT coalesce(sum(cost),0) FROM family_redemptions WHERE person=? AND reversed=0', (person,)).fetchone()[0]
    return earned-spent


def completion(db, ident, occurrence, item, before, after):
    """A frozen amount per person and occurrence; undo changes the net credit."""
    credits = {}
    for person, done in after.items():
        if done == before.get(person, False):
            continue
        row = db.execute('SELECT amount,active FROM family_point_awards WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person)).fetchone()
        if not done:
            db.execute('UPDATE family_point_awards SET active=0 WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person))
        elif row:
            if not row[1]:
                credits[person] = row[0]
            db.execute('UPDATE family_point_awards SET active=1 WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person))
        elif item.get('points', 0):
            credits[person] = item['points']
            db.execute('INSERT INTO family_point_awards VALUES (?, ?, ?, ?, ?, 1)', (ident,occurrence,person,item['points'],item['title']))
    return credits


def state(app):
    db=app['db']
    rewards=[dict(id=i,title=t,cost=c,revision=r) for i,t,c,r in db.execute('SELECT id,title,cost,revision FROM family_rewards ORDER BY title,id')]
    tiers = dict(db.execute("SELECT reward_id,cost FROM chest_pool"))
    for reward in rewards:
        reward["tier"] = tiers.get(reward["id"], 0)
    prizes = [dict(id=i, title=t, person=p, cost=c) for i,t,p,c in db.execute(
        "SELECT r.id,r.title,r.person,r.cost FROM family_redemptions r JOIN chest_prizes p ON p.id=r.id "
        "WHERE p.fulfilled=0 AND r.reversed=0 ORDER BY r.created DESC")]
    history=[dict(id=i,rewardId=reward,person=p,cost=c,title=t,created=stamp,reversed=bool(reversed)) for i,reward,p,c,t,stamp,reversed in db.execute('SELECT * FROM family_redemptions ORDER BY created DESC,id DESC LIMIT 40')]
    return dict(balances={p:balance(db,p) for p in PEOPLE},rewards=rewards,history=history,prizes=prizes)


async def get_state(request):
    return web.json_response(state(request.app))


async def write(request):
    from family import receipt_key, saved_response, save_response
    try:
        data=await request.json()
        if not isinstance(data,dict):raise ValueError('Ungültige Anfrage.')
        key=receipt_key(request,'rewards')
        digest=hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
    except (ValueError,TypeError) as exc:
        return web.json_response({'error':str(exc)},status=400)
    if data.get('action') not in ('redeem', 'open-chest'):
        denied = request.app['parent_guard'].check(request)
        if denied is not None:
            return denied
    async with request.app['write_lock']:
        db=request.app['db'];saved=saved_response(db,key,digest)
        if saved is not None:return saved
        try:
            action=data.get('action');ident=data.get('id');person=data.get('person')
            if action in ('create','edit'):
                title=data.get('title');cost=data.get('cost')
                if not isinstance(title,str) or not title.strip() or len(title)>100 or type(cost) is not int or not 1<=cost<=10000:
                    raise ValueError('Name und einen Preis von 1 bis 10000 Punkten wählen.')
                if action=='create' and db.execute('SELECT count(*) FROM family_rewards').fetchone()[0]>=100:raise ValueError('Höchstens 100 Belohnungen.')
                tier = data.get('tier')
                if tier is not None and (type(tier) is not int or tier not in (0, 10, 30, 100)):
                    raise ValueError('Bitte eine gültige Truhe wählen.')
            if action == 'open-chest':
                price = data.get('cost')
                if person not in PEOPLE or type(price) is not int or price not in (10, 30, 100):
                    raise ValueError('Bitte Profil und Truhe wählen.')
                pool = db.execute('SELECT r.id,r.title FROM family_rewards r JOIN chest_pool p '
                                  'ON p.reward_id=r.id WHERE p.cost=?', (price,)).fetchall()
                if not pool or balance(db,person) < price:
                    raise ValueError('Truhe leer oder zu wenig Münzen. Bitte aktualisieren.')
                reward_id, prize_title = secrets.choice(pool)
            if action == 'fulfill':
                if not isinstance(ident, str):
                    raise ValueError('Bitte einen Schatz wählen.')
                prize = db.execute('SELECT fulfilled,reversed FROM chest_prizes JOIN family_redemptions USING(id) WHERE id=?',(ident,)).fetchone()
                if prize != (0, 0):
                    raise ValueError('Dieser Schatz ist nicht mehr offen.')
            if action in ('edit','remove','redeem'):
                if not isinstance(ident,str):raise ValueError('Belohnung wählen.')
                reward=db.execute('SELECT title,cost,revision FROM family_rewards WHERE id=?',(ident,)).fetchone()
                if not reward or type(data.get('revision')) is not int or data['revision']!=reward[2]:
                    return web.json_response({'error':'Belohnung wurde geändert. Bitte neu laden.','conflict':True},status=409)
            if action=='redeem':
                if person not in PEOPLE:raise ValueError('Eine Person wählen.')
                if balance(db,person)<reward[1]:raise ValueError('Für diese Belohnung sind nicht genug Punkte vorhanden.')
            if action=='reverse':
                if not isinstance(ident,str):raise ValueError('Einlösung wählen.')
                entry=db.execute('SELECT reversed FROM family_redemptions WHERE id=?',(ident,)).fetchone()
                if not entry or entry[0]:return web.json_response({'error':'Einlösung bereits zurückgenommen oder nicht vorhanden.','conflict':True},status=409)
            if action not in ('create','edit','remove','redeem','reverse','open-chest','fulfill'):raise ValueError('Unbekannte Aktion.')
            with db:
                if action=='create':
                    ident=uuid.uuid4().hex;db.execute('INSERT INTO family_rewards VALUES (?, ?, ?, 1)',(ident,title.strip(),cost))
                elif action=='edit':db.execute('UPDATE family_rewards SET title=?,cost=?,revision=revision+1 WHERE id=?',(title.strip(),cost,ident))
                elif action=='remove':db.execute('DELETE FROM family_rewards WHERE id=?',(ident,))
                elif action=='redeem':
                    db.execute('INSERT INTO family_redemptions VALUES (?, ?, ?, ?, ?, ?, 0)',(uuid.uuid4().hex,ident,person,reward[1],reward[0],datetime.now(TZ).isoformat()))
                elif action=='reverse':db.execute('UPDATE family_redemptions SET reversed=1 WHERE id=?',(ident,))
                result = dict(success=True)
                if action in ('create','edit') and tier is not None:
                    db.execute('DELETE FROM chest_pool WHERE reward_id=?',(ident,))
                    if tier:
                        db.execute('INSERT INTO chest_pool VALUES (?,?)',(ident,tier))
                elif action == 'remove':
                    db.execute('DELETE FROM chest_pool WHERE reward_id=?',(ident,))
                elif action == 'open-chest':
                    entry = uuid.uuid4().hex
                    db.execute('INSERT INTO family_redemptions VALUES (?,?,?,?,?,?,0)',
                               (entry,reward_id,person,price,prize_title,datetime.now(TZ).isoformat()))
                    db.execute('INSERT INTO chest_prizes VALUES (?,0)',(entry,))
                    result.update(title=prize_title, cost=price, person=person)
                elif action == 'fulfill':
                    db.execute('UPDATE chest_prizes SET fulfilled=1 WHERE id=?',(ident,))
                save_response(db,key,digest,result)
            return web.json_response(result)
        except (ValueError,TypeError,KeyError) as exc:
            return web.json_response({'error':str(exc)},status=400)


def setup(app):
    db=app['db']
    db.execute('CREATE TABLE IF NOT EXISTS family_point_awards (item_id TEXT,occurrence TEXT,person TEXT,amount INTEGER,title TEXT,active INTEGER,PRIMARY KEY(item_id,occurrence,person))')
    db.execute('CREATE TABLE IF NOT EXISTS family_rewards (id TEXT PRIMARY KEY,title TEXT,cost INTEGER,revision INTEGER)')
    db.execute('CREATE TABLE IF NOT EXISTS family_redemptions (id TEXT PRIMARY KEY,reward_id TEXT,person TEXT,cost INTEGER,title TEXT,created TEXT,reversed INTEGER)')
    db.execute('CREATE TABLE IF NOT EXISTS chest_pool (reward_id TEXT PRIMARY KEY,cost INTEGER NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS chest_prizes (id TEXT PRIMARY KEY,fulfilled INTEGER NOT NULL)')
    db.commit()
    app.router.add_get('/api/rewards',get_state)
    app.router.add_post('/api/rewards/actions',write)
