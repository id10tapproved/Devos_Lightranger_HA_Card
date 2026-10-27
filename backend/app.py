"""Local, same-origin ESPHome Native API bridge for a Pi-hosted LightRanger card.

Run: uvicorn backend.app:app --host 127.0.0.1 --port 8765
Must be protected by the Pi dashboard's authenticating reverse proxy if exposed.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import re
from urllib.parse import urlsplit
from typing import Any, Literal

from aioesphomeapi import APIClient, ReconnectLogic
from aioesphomeapi.model import (
    BinarySensorInfo, LightInfo, NumberInfo, SelectInfo, SensorInfo, SwitchInfo,
    BinarySensorState, LightState, NumberState, SelectState, SensorState, SwitchState,
)
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

LOGGER = logging.getLogger('lightranger')
ROOT = Path(__file__).resolve().parents[1]


def norm(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def infer_role(entity: Any) -> str | None:
    """Bind to ESPHome entity names/keys, not Home Assistant entity IDs."""
    n = norm(entity.name or entity.object_id)
    if isinstance(entity, SensorInfo) and 'lightrangerbattery' in n and 'raw' not in n:
        return 'battery'
    if isinstance(entity, BinarySensorInfo) and 'bluetoothconnected' in n:
        return 'bluetooth'
    if isinstance(entity, BinarySensorInfo) and 'lightstatesynchronized' in n:
        return 'synchronized'
    if isinstance(entity, SwitchInfo):
        panel = re.search(r'panel([1-4])',n)
        if panel:
            return f'panel{panel.group(1)}'
        if n == 'lightpower' or n.endswith('lightpower'):
            return 'power_switch'
    if isinstance(entity, SelectInfo) and ('lightcolor' in n or n=='color'):
        return 'color_select'
    if isinstance(entity, NumberInfo) and 'brightness' in n:
        return 'brightness_number'
    if isinstance(entity, LightInfo) and ('lightranger' in n or n=='light'):
        return 'light'
    return None


class Command(BaseModel):
    type: Literal['power', 'color', 'brightness', 'panel']
    value: Any


class Bridge:
    def __init__(self, client: APIClient):
        self.client=client
        self.logic: ReconnectLogic | None=None
        self.info: dict[str, Any]={}
        self.values: dict[str, Any]={}
        self.keys: dict[tuple[int,int], str]={}
        self.connected=False
        self.listeners: set[WebSocket]=set()
        self.error: str | None=None

    def snapshot(self)->dict[str,Any]:
        v=self.values
        light=v.get('light')
        light_state=light.state if isinstance(light,LightState) else False
        power=v.get('power_switch')
        powered=power.state if isinstance(power,SwitchState) else light_state
        c=v.get('color_select')
        color=c.state if isinstance(c,SelectState) else self._color_from_light(light)
        bn=v.get('brightness_number')
        brightness=bn.state if isinstance(bn,NumberState) else (
            round(light.brightness*100) if isinstance(light,LightState) else 50
        )
        battery=v.get('battery')
        battery_num=battery.state if isinstance(battery,SensorState) and not battery.missing_state else None
        bluetooth=v.get('bluetooth')
        synced=v.get('synchronized')
        return {
            'connected':self.connected,
            'bluetooth':bluetooth.state if isinstance(bluetooth,BinarySensorState) else None,
            'synchronized':synced.state if isinstance(synced,BinarySensorState) else None,
            'battery':battery_num,
            'power':powered,
            'color':color,
            'brightness':round(float(brightness)),
            'panels':[getattr(v.get(f'panel{i}'),'state',False) for i in range(1,5)],
            'error':self.error,
        }

    @staticmethod
    def _color_from_light(state: Any)->str:
        if not isinstance(state,LightState): return 'White'
        r,g,b=state.red,state.green,state.blue
        if r>g*2.4 and r>b*2.4:return 'Red'
        if r>b*2 and g>b*2:return 'Amber'
        return 'White'

    def _state(self, state: Any)->None:
        role=self.keys.get((state.key,getattr(state,'device_id',0)))
        if role is None or getattr(state,'missing_state',False):return
        self.values[role]=state
        asyncio.create_task(self.broadcast())

    async def _on_connect(self)->None:
        entities,_=await self.client.list_entities_services()
        self.info={}
        self.keys={}
        self.values={}
        for info in entities:
            role=infer_role(info)
            if role:
                self.info[role]=info
                self.keys[(info.key,info.device_id)]=role
        LOGGER.info('ESPHome connected; discovered roles: %s',sorted(self.info))
        self.connected=True
        self.error=None
        self.client.subscribe_states(self._state)
        await self.broadcast()

    async def _on_disconnect(self, expected:bool)->None:
        self.connected=False
        self.values={}
        await self.broadcast()
        LOGGER.warning('ESPHome disconnected (expected=%s)',expected)

    async def _on_error(self,err:Exception)->None:
        self.error=f'ESPHome connection failed: {type(err).__name__}'
        LOGGER.warning('%s: %s',self.error,err)
        await self.broadcast()

    async def start(self)->None:
        self.logic=ReconnectLogic(client=self.client,
            on_connect=self._on_connect,on_disconnect=self._on_disconnect,
            on_connect_error=self._on_error)
        await self.logic.start()

    async def stop(self)->None:
        if self.logic:await self.logic.stop()
        await self.client.disconnect()

    async def broadcast(self)->None:
        if not self.listeners:return
        payload=self.snapshot()
        for ws in list(self.listeners):
            try:await ws.send_json(payload)
            except Exception:self.listeners.discard(ws)

    def _key(self,role:str,expected:type)->tuple[int,int]:
        info=self.info.get(role)
        if not isinstance(info,expected):
            raise HTTPException(409, f'ESPHome entity {role} not present; available roles: {", ".join(sorted(self.info))}')
        return (info.key,info.device_id)

    def command(self,command:Command)->None:
        if not self.connected:
            raise HTTPException(503,'ESPHome unavailable')
        kind,value=command.type,command.value
        if kind=='panel':
            if not isinstance(value,dict) or type(value.get('index')) is not int or not 0<=value['index']<=3 or type(value.get('on')) is not bool:
                raise HTTPException(422,'panel expects {index: 0..3, on: boolean}')
            key,device=self._key(f'panel{value["index"]+1}',SwitchInfo)
            self.client.switch_command(key,value['on'],device_id=device)
        elif kind=='power':
            if type(value) is not bool:raise HTTPException(422,'power expects boolean')
            if 'power_switch' in self.info:
                key,device=self._key('power_switch',SwitchInfo)
                self.client.switch_command(key,value,device_id=device)
            else:
                key,device=self._key('light',LightInfo)
                self.client.light_command(key,state=value,device_id=device)
        elif kind=='color':
            if value not in ('White','Amber','Red'):raise HTTPException(422,'Unsupported color')
            if 'color_select' in self.info:
                key,device=self._key('color_select',SelectInfo)
                self.client.select_command(key,value,device_id=device)
            else:
                key,device=self._key('light',LightInfo)
                rgb={'White':(1.,1.,1.),'Amber':(1.,0.6,0.),'Red':(1.,0.,0.)}
                # Older RGB firmware interprets color only while power is ON.
                self.client.light_command(key,state=True,rgb=rgb[value],device_id=device)
        elif kind=='brightness':
            if type(value) not in (int,float) or not 1<=value<=100:
                raise HTTPException(422,'brightness expects 1..100')
            if 'brightness_number' in self.info:
                key,device=self._key('brightness_number',NumberInfo)
                self.client.number_command(key,float(value),device_id=device)
            else:
                key,device=self._key('light',LightInfo)
                # RGB fallback may turn on the light when brightness changes.
                self.client.light_command(key,brightness=float(value)/100.,device_id=device)


HOST=os.getenv('LIGHTRANGER_HOST','devos-lightranger.local')
PORT=int(os.getenv('LIGHTRANGER_PORT','6053'))
PSK=os.getenv('LIGHTRANGER_ENCRYPTION_KEY')
client=APIClient(HOST,PORT,noise_psk=PSK)
bridge=Bridge(client)

@asynccontextmanager
async def lifespan(_app:FastAPI):
    await bridge.start()
    yield
    await bridge.stop()

app=FastAPI(title='Devos LightRanger Local Bridge',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
app.mount('/assets',StaticFiles(directory=ROOT/'dist'),name='assets')

@app.get('/')
async def home():
    return FileResponse(ROOT/'demo/pi.html')

@app.get('/api/lightranger/state')
async def state():
    return JSONResponse(bridge.snapshot(),headers={'Cache-Control':'no-store'})

@app.post('/api/lightranger/command')
async def command(cmd:Command):
    bridge.command(cmd)
    return {'accepted':True}  # ESPHome Native API commands are fire-and-forget.

@app.websocket('/api/lightranger/ws')
async def ws_state(ws:WebSocket):
    # Browsers use same-origin websocket. Refuse cross-origin browser connections.
    origin=ws.headers.get('origin')
    if origin and urlsplit(origin).netloc!=ws.headers.get('host'):
        await ws.close(code=1008)
        return
    await ws.accept()
    bridge.listeners.add(ws)
    try:
        await ws.send_json(bridge.snapshot())
        while True: await ws.receive_text()  # connection lifecycle; server sends state
    except WebSocketDisconnect:
        pass
    finally:
        bridge.listeners.discard(ws)
