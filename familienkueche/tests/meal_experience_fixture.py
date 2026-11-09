"""Loopback-only recipe workflow fixture; no real credentials or remote services."""
import asyncio
import io
import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
import sys
from aiohttp import web
from PIL import Image
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_app, TZ
from family_fixture import FixtureHA


class RecipesHA(FixtureHA):
    def __init__(self):
        super().__init__(); self.plan=[]; self.writes=0; self.photos=0; self.ai=0
        buffer=io.BytesIO();Image.new('RGB',(800,450),'#b39161').save(buffer,'JPEG');self.photo=buffer.getvalue()
        owner=self
        class Response:
            status=200;content_type='image/jpeg'
            async def __aenter__(self):return self
            async def __aexit__(self,*args):return None
            async def iter_chunked(self,size):yield owner.photo
            @property
            def content(self):return self
        self.session=SimpleNamespace(get=lambda *args,**kwargs:Response())
        self.recipes=[]
        for i, (name, minutes, foods) in enumerate([
                ('Hähnchen-Pasta',25,['Tomaten','Hähnchen']),('Linsen-Eintopf',90,['Tomaten','Linsen']),
                ('Pizza',60,['Tomaten','Mehl']),('Gurkensalat',20,['Gurke','Sahne'])]):
            self.recipes.append(dict(recipe_id=f'a1234567-1234-4234-9234-{i:012d}',name=name,total_time=f'PT{minutes}M',
                                     tags=[{'name':'Familienfavorit'}],original_url=f'https://www.chefkoch.de/rezepte/{10000+i}/Rezept.html',
                                     ingredients=[{'food':{'name':f},'display':f} for f in foods],instructions=[],image='fixture'))

    async def events(self,entity,start,end):
        if entity!='calendar.tina':return []
        begin=datetime.now(TZ).replace(hour=16,minute=0,second=0,microsecond=0)
        return [dict(start={'dateTime':begin.isoformat()},end={'dateTime':(begin+timedelta(hours=2)).isoformat()},summary='Private title never sent to AI')]

    async def features(self,entity):return 1

    async def service(self,domain,name,payload,**kwargs):
        if domain!='mealie':return await super().service(domain,name,payload,**kwargs)
        if name=='get_recipes':return {'recipes':{'items':self.recipes}}
        if name=='get_recipe':return {'recipe':next(r for r in self.recipes if r['recipe_id']==payload['recipe_id'])}
        if name=='get_mealplan':return {'mealplan':[r for r in self.plan if payload['start_date']<=r['mealplan_date']<=payload['end_date']]}
        if name=='set_mealplan':
            self.writes+=1
            self.plan.append(dict(mealplan_id=self.writes,entry_type='dinner',mealplan_date=payload['date'],recipe=next(r for r in self.recipes if r['recipe_id']==payload['recipe_id'])))
            return {}
        raise RuntimeError('Unmocked recipe write')


async def main():
    with tempfile.TemporaryDirectory(prefix='family-meal-workflows-') as root:
        ha=RecipesHA();app=make_app(ha,str(Path(root)/'fixture.sqlite'),{'mealie_entry_id':'fixture'})
        app['meal_ai_enabled']=True;app['meal_ai_key']='sk-fixture-only-not-real'
        async def no_ai(*args):ha.ai+=1;raise RuntimeError('No paid calls in this fixture')
        app['meal_ai_call']=no_ai
        output=io.BytesIO();Image.new('RGB',(800,450),'#b39161').save(output,'JPEG');photo=output.getvalue()
        async def image(url):
            ha.photos+=1
            if '/10001/' in url:raise ValueError('No original photo')
            return photo
        app['meal_image_fetch']=image
        day=datetime.now(TZ).date().isoformat()
        result=dict(shop='Aldi Nord',start=day,end=day,created=day,searchVersion=5,targetCount=8,mode='mixed',offers=['Tomaten','Hähnchen'],warnings=[],
                    recipes=[dict(title=r['name'],url=r['original_url'],minutes=[25,90,60,20][i],activeMinutes=15,matches=['Tomaten'],ingredients=['Tomaten']) for i,r in enumerate(ha.recipes)])
        with app['db']:
            app['db'].execute('INSERT INTO meal_ai_runs VALUES (?, ?, ?, ?, ?, ?, ?)',('fixture-run','fixture',day[:7],'done',day,json.dumps(result),'{}'))
        async def counters(request):return web.json_response(dict(writes=ha.writes,photos=ha.photos,ai=ha.ai))
        app.router.add_get('/fixture/counters',counters)
        app.middlewares.clear()
        runner=web.AppRunner(app,access_log=None);await runner.setup();site=web.TCPSite(runner,'127.0.0.1',0);await site.start()
        print(json.dumps({'port':site._server.sockets[0].getsockname()[1]}),flush=True)
        try:await asyncio.Event().wait()
        finally:await runner.cleanup()

if __name__=='__main__':asyncio.run(main())
