"""Local points and reviewable reward redemptions; no money or external service calls."""
import hashlib
import json
import uuid
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
    for person, done in after.items():
        if done == before.get(person, False):
            continue
        row = db.execute('SELECT amount FROM family_point_awards WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person)).fetchone()
        if not done:
            db.execute('UPDATE family_point_awards SET active=0 WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person))
        elif row:
            db.execute('UPDATE family_point_awards SET active=1 WHERE item_id=? AND occurrence=? AND person=?', (ident,occurrence,person))
        elif item.get('points', 0):
            db.execute('INSERT INTO family_point_awards VALUES (?, ?, ?, ?, ?, 1)', (ident,occurrence,person,item['points'],item['title']))


def state(app):
    db=app['db']
    rewards=[dict(id=i,title=t,cost=c,revision=r) for i,t,c,r in db.execute('SELECT id,title,cost,revision FROM family_rewards ORDER BY title,id')]
    history=[dict(id=i,rewardId=reward,person=p,cost=c,title=t,created=stamp,reversed=bool(reversed)) for i,reward,p,c,t,stamp,reversed in db.execute('SELECT * FROM family_redemptions ORDER BY created DESC,id DESC LIMIT 40')]
    return dict(balances={p:balance(db,p) for p in PEOPLE},rewards=rewards,history=history)


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
            if action not in ('create','edit','remove','redeem','reverse'):raise ValueError('Unbekannte Aktion.')
            with db:
                if action=='create':
                    ident=uuid.uuid4().hex;db.execute('INSERT INTO family_rewards VALUES (?, ?, ?, 1)',(ident,title.strip(),cost))
                elif action=='edit':db.execute('UPDATE family_rewards SET title=?,cost=?,revision=revision+1 WHERE id=?',(title.strip(),cost,ident))
                elif action=='remove':db.execute('DELETE FROM family_rewards WHERE id=?',(ident,))
                elif action=='redeem':
                    db.execute('INSERT INTO family_redemptions VALUES (?, ?, ?, ?, ?, ?, 0)',(uuid.uuid4().hex,ident,person,reward[1],reward[0],datetime.now(TZ).isoformat()))
                elif action=='reverse':db.execute('UPDATE family_redemptions SET reversed=1 WHERE id=?',(ident,))
                result=dict(success=True);save_response(db,key,digest,result)
            return web.json_response(result)
        except (ValueError,TypeError,KeyError) as exc:
            return web.json_response({'error':str(exc)},status=400)


def setup(app):
    db=app['db']
    db.execute('CREATE TABLE IF NOT EXISTS family_point_awards (item_id TEXT,occurrence TEXT,person TEXT,amount INTEGER,title TEXT,active INTEGER,PRIMARY KEY(item_id,occurrence,person))')
    db.execute('CREATE TABLE IF NOT EXISTS family_rewards (id TEXT PRIMARY KEY,title TEXT,cost INTEGER,revision INTEGER)')
    db.execute('CREATE TABLE IF NOT EXISTS family_redemptions (id TEXT PRIMARY KEY,reward_id TEXT,person TEXT,cost INTEGER,title TEXT,created TEXT,reversed INTEGER)')
    db.commit()
    app.router.add_get('/api/rewards',get_state)
    app.router.add_post('/api/rewards/actions',write)
