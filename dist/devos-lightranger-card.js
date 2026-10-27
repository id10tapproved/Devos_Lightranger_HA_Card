/* Built from src/view.js, src/ha-card.js; edit src/, not dist/. */
/* Framework-independent presentation component: no Home Assistant or ESPHome imports. */
(() => {
  const COLORS = {White:'#f4f3df', Amber:'#ffb83e', Red:'#fa5555'};
  const INITIAL = {connected:false, bluetooth:null, battery:null, power:false, color:'White', brightness:50, panels:[true,true,true,true], synchronized:null};
  const clamp = (v, a, b) => Math.min(b, Math.max(a,v));
  class DevosLightRangerView extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this._state = {...INITIAL};
      this._busy = false;
      this._dragging = false;
    }
    connectedCallback() {
      if (!this._created) this._build();
      this._renderState();
    }
    set state(value) {
      this._state = {...INITIAL,...(value || {})};
      this._renderState();
    }
    get state() {return this._state;}
    _emit(type,value) {
      if (!this._state.connected) return;
      this.dispatchEvent(new CustomEvent('lightranger-command', {
        detail:{type,value}, bubbles:true, composed:true
      }));
    }
    _build() {
      this._created = true;
      this.shadowRoot.innerHTML = `
      <style>
        :host {display:block;font-family:var(--primary-font-family, system-ui, sans-serif);color:var(--primary-text-color, #e9edf2);min-width:0}
        * {box-sizing:border-box}
        .shell {background:var(--card-background-color, #222a36);border-radius:var(--ha-card-border-radius,20px);padding:20px 18px 18px;box-shadow:var(--ha-card-box-shadow,0 8px 26px rgba(0,0,0,.13));border:1px solid var(--divider-color,rgba(150,160,180,.15));overflow:hidden;max-width:460px;margin:0 auto}
        .top {display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
        .eyebrow {font-size:10px;letter-spacing:.16em;font-weight:750;color:var(--secondary-text-color,#aeb9c8);text-transform:uppercase}
        h2 {font-size:21px;line-height:1.25;letter-spacing:-.035em;margin:5px 0 7px;font-weight:750}
        .device-line {display:flex;align-items:center;gap:6px;font-size:12px;color:var(--secondary-text-color,#aeb9c8)}
        .dot {height:7px;width:7px;border-radius:50%;background:#94a3b8;display:inline-block;flex:none}
        .dot.good {background:#4edda0;box-shadow:0 0 8px #4edda04d}
        .battery {display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;min-width:76px}
        .battery strong {font-size:15px;line-height:1}
        .battery-body {width:56px;height:24px;border:2px solid var(--battery-color,#94a3b8);border-radius:5px;padding:3px;position:relative}
        .battery-body:after {content:'';position:absolute;right:-6px;top:6px;height:8px;width:4px;background:var(--battery-color,#94a3b8);border-radius:0 2px 2px 0}
        .battery-level {height:100%;border-radius:2px;background:var(--battery-color,#94a3b8);width:0;transition:width .2s ease}
        .lantern-wrap {position:relative;max-width:332px;margin:12px auto 18px;aspect-ratio:1.2;display:grid;place-items:center}
        .halo {width:73%;aspect-ratio:1;position:absolute;border-radius:50%;background:radial-gradient(circle,var(--beam,#fff4bc17) 0,transparent 72%);pointer-events:none}
        .lantern {position:relative;width:min(100%,285px);height:245px;filter:drop-shadow(0 7px 16px rgba(0,0,0,.16))}
        .panel {position:absolute;border:2px solid var(--panel-outline,rgba(130,145,170,.43));padding:0;background:var(--panel-off,rgba(140,157,181,.13));cursor:pointer;transition:background-color .18s,border-color .18s,filter .18s,opacity .18s;touch-action:manipulation}
        .panel:disabled {cursor:not-allowed;opacity:.45}
        .panel.selected {border-color:var(--select-outline,#8ca6bd);background:var(--panel-selected,#7281944a)}
        .panel.lit {border-color:var(--light-edge,#ffffffcc);background:var(--light-color,#f4f3df);filter:drop-shadow(0 0 11px var(--light-glow,#f4f3df80))}
        .panel:focus-visible {outline:3px solid var(--primary-color,#57aefa);outline-offset:4px;z-index:4}
        .panel.top {top:0;left:19%;width:62%;height:25%;clip-path:polygon(5% 0,95% 0,77% 100%,23% 100%);border-radius:10px}
        .panel.right {top:22%;right:0;width:31%;height:56%;clip-path:polygon(0 17%,100% 0,100% 100%,0 83%);border-radius:12px}
        .panel.bottom {bottom:0;left:19%;width:62%;height:25%;clip-path:polygon(23% 0,77% 0,95% 100%,5% 100%);border-radius:10px}
        .panel.left {top:22%;left:0;width:31%;height:56%;clip-path:polygon(0 0,100% 17%,100% 83%,0 100%);border-radius:12px}
        .middle {width:44%;height:51%;border-radius:26px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;flex-direction:column;background:var(--secondary-background-color,#303c4b);border:1px solid var(--divider-color,#475569);z-index:2;box-shadow:0 8px 23px #0004;text-align:center;gap:5px;pointer-events:none}
        .middle svg {opacity:.85}
        .middle b {font-size:10px;letter-spacing:.1em}
        .middle small {font-size:10px;color:var(--secondary-text-color,#aeb9c8)}
        .hint {text-align:center;font-size:11px;color:var(--secondary-text-color,#aeb9c8);margin:-5px 0 18px}
        .fields {display:grid;grid-template-columns:1fr;gap:17px}
        .field-top {display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
        label,.field-top label {font-size:12px;font-weight:700;letter-spacing:.025em}
        select {width:100%;appearance:none;border-radius:10px;padding:11px 40px 11px 12px;font:inherit;font-size:14px;color:var(--primary-text-color,#ecf0f6);border:1px solid var(--divider-color,#485365);background:var(--secondary-background-color,#303b48);cursor:pointer}
        .select-wrap {position:relative}
        .select-wrap:after {content:'⌄';position:absolute;right:15px;top:5px;font-size:23px;pointer-events:none;color:var(--secondary-text-color,#aeb9c8)}
        select:disabled {opacity:.45;cursor:not-allowed}
        input[type=range] {width:100%;accent-color:var(--primary-color,#6cabe5);cursor:pointer;touch-action:pan-y;margin:6px 0}
        input:disabled {opacity:.4;cursor:not-allowed}
        .brightness-value {font-size:12px;color:var(--secondary-text-color,#aeb9c8);font-variant-numeric:tabular-nums}
        .power {display:flex;align-items:center;justify-content:center;gap:11px;width:100%;border:1px solid var(--divider-color,#485365);border-radius:13px;font:inherit;font-weight:750;font-size:15px;padding:14px;background:var(--secondary-background-color,#303b48);color:var(--primary-text-color,#ecf0f6);cursor:pointer;margin-top:17px;touch-action:manipulation;min-height:52px}
        .power.on {background:color-mix(in srgb, var(--primary-color,#6cabe5) 21%,var(--secondary-background-color,#303b48));border-color:var(--primary-color,#6cabe5)}
        .power:disabled {opacity:.55;cursor:not-allowed}
        .power:focus-visible,select:focus-visible,input:focus-visible {outline:2px solid var(--primary-color,#57aefa);outline-offset:3px}
        .power-symbol {font-size:23px;font-family:system-ui}
        .message {margin-top:12px;font-size:11px;line-height:1.4;text-align:center;color:var(--secondary-text-color,#aeb9c8);min-height:16px}
        @media(prefers-color-scheme:light) {:host(:not([dark])) .shell {background:var(--card-background-color,#fff)} }
        @media(max-width:360px) {.shell{padding:15px 12px}.lantern {transform:scale(.93)}}
      </style>
      <section class="shell" aria-label="Devos LightRanger 2000 controls">
        <header class="top"><div><div class="eyebrow">DEVOS · LIGHTRANGER SERIES</div>
          <h2>LightRanger 2000</h2><div class="device-line"><span class="dot"></span><span class="status">Connecting…</span></div></div>
          <div class="battery" aria-label="Battery"><strong class="battery-value">—</strong><div class="battery-body"><div class="battery-level"></div></div></div>
        </header>
        <div class="lantern-wrap"><div class="halo"></div><div class="lantern" role="group" aria-label="Tap individual lantern panels">
            <button class="panel top" data-index="0" aria-label="Toggle top panel" type="button"></button>
            <button class="panel right" data-index="1" aria-label="Toggle right panel" type="button"></button>
            <button class="panel bottom" data-index="2" aria-label="Toggle bottom panel" type="button"></button>
            <button class="panel left" data-index="3" aria-label="Toggle left panel" type="button"></button>
            <div class="middle"><svg width="34" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M7 7V4h10v3M7 17v3h10v-3M5 9h14v6H5z"/><path d="M10 3h4" /></svg><b class="power-label">OFF</b><small class="panel-count">0 / 4 panels</small></div>
          </div></div>
        <div class="hint">Tap a panel to select or deselect it</div>
        <div class="fields"><div><div class="field-top"><label for="color">Light color</label></div><div class="select-wrap"><select id="color" aria-label="Light color"><option value="White">White</option><option value="Amber">Amber</option><option value="Red">Red</option></select></div></div>
        <div><div class="field-top"><label for="brightness">Brightness</label><span class="brightness-value">50%</span></div><input type="range" id="brightness" min="1" max="100" step="1" value="50" aria-label="Brightness" /></div></div>
        <button class="power" type="button"><span class="power-symbol" aria-hidden="true">⏻</span><span class="power-text">Turn On</span></button>
        <div class="message" role="status" aria-live="polite"></div>
      </section>`;
      this._els = {
        panels:[...this.shadowRoot.querySelectorAll('.panel')],
        status:this.shadowRoot.querySelector('.status'),dot:this.shadowRoot.querySelector('.dot'),
        battery:this.shadowRoot.querySelector('.battery'),batteryValue:this.shadowRoot.querySelector('.battery-value'),
        batteryLevel:this.shadowRoot.querySelector('.battery-level'),middle:this.shadowRoot.querySelector('.power-label'),
        count:this.shadowRoot.querySelector('.panel-count'),color:this.shadowRoot.querySelector('#color'),
        slider:this.shadowRoot.querySelector('#brightness'),brightness:this.shadowRoot.querySelector('.brightness-value'),
        button:this.shadowRoot.querySelector('.power'),buttonText:this.shadowRoot.querySelector('.power-text'),
        message:this.shadowRoot.querySelector('.message'),halo:this.shadowRoot.querySelector('.halo')
      };
      for(const btn of this._els.panels) btn.addEventListener('click',()=>{
        const i = Number(btn.dataset.index);
        this._emit('panel',{index:i,on:!Boolean(this._state.panels?.[i])});
      });
      this._els.color.addEventListener('change', e=>this._emit('color',e.target.value));
      this._els.slider.addEventListener('pointerdown',()=>{this._dragging=true;});
      this._els.slider.addEventListener('input',e=>{this._dragging=true;this._els.brightness.textContent=e.target.value+'%';});
      this._els.slider.addEventListener('change',e=>{this._dragging=false;this._emit('brightness',Number(e.target.value));});
      this._els.slider.addEventListener('blur',()=>{this._dragging=false;});
      this._els.button.addEventListener('click',()=>this._emit('power',!this._state.power));
    }
    _renderState() {
      if (!this._created) return;
      const s=this._state, e=this._els;
      const connected=Boolean(s.connected);
      const bt=s.bluetooth===true?'Bluetooth connected':s.bluetooth===false?'Bluetooth disconnected':'Bluetooth status unknown';
      e.status.textContent=connected?bt:'ESP32 unavailable';
      e.dot.classList.toggle('good',connected && s.bluetooth===true);
      const pct=(typeof s.battery==='number' && Number.isFinite(s.battery))?clamp(Math.round(s.battery),0,100):null;
      const batColor=pct===null?'#94a3b8':pct<=20?'#ef5656':pct<=50?'#f2b440':'#40c88c';
      e.battery.style.setProperty('--battery-color',batColor);
      e.batteryValue.textContent=pct===null?'—':pct+'%';
      e.batteryLevel.style.width=(pct??0)+'%';
      e.battery.setAttribute('aria-label',pct===null?'Battery level unavailable':'Battery '+pct+' percent');
      const c=COLORS[s.color]||COLORS.White;
      const bright=clamp(Math.round(Number(s.brightness)||1),1,100);
      const selected=Array.isArray(s.panels)?s.panels:[true,true,true,true];
      const count=selected.filter(Boolean).length;
      this.style.setProperty('--light-color',c);
      this.style.setProperty('--light-glow', c+'aa');
      const currentLevel=s.power ? .15+bright/100*.52 : 0;
      e.halo.style.setProperty('--beam', `color-mix(in srgb, ${c} ${Math.round(currentLevel*100)}%, transparent)`);
      e.middle.textContent=s.power?'ON':'OFF';
      e.count.textContent=`${count} / 4 panels`;
      e.panels.forEach((el,i)=>{
        const isSelected=Boolean(selected[i]);
        el.classList.toggle('selected',isSelected);
        el.classList.toggle('lit',Boolean(s.power && isSelected));
        el.disabled=!connected;
        el.setAttribute('aria-pressed',String(isSelected));
        el.title=`${['Top','Right','Bottom','Left'][i]} panel: ${isSelected?'selected':'not selected'}`;
      });
      if(this.shadowRoot.activeElement!==e.color) e.color.value=COLORS[s.color]?s.color:'White';
      e.color.disabled=!connected;
      if(!this._dragging){e.slider.value=String(bright);e.brightness.textContent=bright+'%';}
      e.slider.disabled=!connected;
      e.button.disabled=!connected;
      e.button.classList.toggle('on',Boolean(s.power));
      e.buttonText.textContent=s.power?'Turn Off':'Turn On';
      e.message.textContent=!connected?'Connect to the ESP32 to enable controls':
        s.bluetooth===false?'ESP32 online · lantern Bluetooth disconnected':
        s.synchronized===false?'Connected · waiting for lantern state':
        s.error||'';
    }
  }
  if (!customElements.get('devos-lightranger-view')) customElements.define('devos-lightranger-view',DevosLightRangerView);
})();

/* Home Assistant adapter; all view markup is shared with the Pi version. */
(() => {
  const DEFAULTS = {
    battery:'sensor.devos_lightranger_lightranger_battery',
    connection:'binary_sensor.devos_lightranger_bluetooth_connected',
    synchronized:'binary_sensor.devos_lightranger_light_state_synchronized',
    light:'light.devos_lightranger_lightranger',
    color:'select.devos_lightranger_light_color',
    brightness:'number.devos_lightranger_brightness',
    panels:[
      'switch.devos_lightranger_panel_1_selected',
      'switch.devos_lightranger_panel_2_selected',
      'switch.devos_lightranger_panel_3_selected',
      'switch.devos_lightranger_panel_4_selected'
    ]
  };
  class DevosLightRangerCard extends HTMLElement {
    constructor() {super();this.attachShadow({mode:'open'});}
    static getStubConfig() {return {...DEFAULTS,type:'custom:devos-lightranger-card'};}
    setConfig(config) {
      if(config.panels && (!Array.isArray(config.panels)||config.panels.length!==4))
        throw new Error('panels must be a list of exactly four switch entity IDs (top, right, bottom, left).');
      this._config={...DEFAULTS,...config,panels:config.panels||DEFAULTS.panels};
      if(!this._view){
        this.shadowRoot.innerHTML='<devos-lightranger-view></devos-lightranger-view>';
        this._view=this.shadowRoot.querySelector('devos-lightranger-view');
        this._view.addEventListener('lightranger-command', e=>this._command(e.detail).catch(err=>{
          this._error=err?.message||String(err); this._update();
        }));
      }
      this._update();
    }
    set hass(value){this._hass=value;this._update();}
    getCardSize(){return 8;}
    getGridOptions(){return {columns:6,min_columns:3,rows:7,min_rows:6};}
    _entity(id) {return id?this._hass?.states?.[id]:undefined;}
    _exists(id) {return Boolean(this._entity(id));}
    _valid(entity) {return entity && !['unknown','unavailable'].includes(entity.state);}
    _readState() {
      const cfg=this._config;
      const light=this._entity(cfg.light);
      const battery=this._entity(cfg.battery);
      const connection=this._entity(cfg.connection);
      const color=this._entity(cfg.color);
      const brightness=this._entity(cfg.brightness);
      const powered=this._entity(cfg.power||cfg.light);
      const colorValue=this._valid(color)?color.state:this._colorFromRgb(light);
      const level=this._valid(brightness)?Number(brightness.state):
        light?.attributes?.brightness!=null?Math.round(Number(light.attributes.brightness)*100/255):50;
      return {
        connected:this._valid(light),
        bluetooth:this._valid(connection)?connection.state==='on':null,
        synchronized:this._valid(this._entity(cfg.synchronized))?this._entity(cfg.synchronized).state==='on':null,
        battery:this._valid(battery)?Number(battery.state):null,
        power:this._valid(powered)?powered.state==='on':false,
        color:colorValue,
        brightness:level,
        panels:cfg.panels.map(id=>this._entity(id)?.state==='on'),
        error:this._error
      };
    }
    _colorFromRgb(light) {
      const rgb=light?.attributes?.rgb_color;
      if(!Array.isArray(rgb))return 'White';
      if(rgb[0]>rgb[1]*2.4 && rgb[0]>rgb[2]*2.4)return 'Red';
      if(rgb[0]>rgb[2]*2 && rgb[1]>rgb[2]*2)return 'Amber';
      return 'White';
    }
    _update(){if(this._view&&this._hass&&this._config) this._view.state=this._readState();}
    async _command({type,value}) {
      if(!this._hass||!this._config)return;
      this._error='';
      const c=this._config;
      const call=(domain,service,id,data={})=>{
        if(!this._exists(id))throw Error(`Missing entity: ${id}. Check Developer Tools → States or edit the card YAML.`);
        return this._hass.callService(domain,service,{entity_id:id,...data});
      };
      if(type==='panel')return call('switch',value.on?'turn_on':'turn_off',c.panels[value.index]);
      if(type==='power'){
        const id=c.power||c.light;
        const domain=id?.split('.')[0];
        if(domain!=='switch'&&domain!=='light')throw Error('power must be a light or switch entity');
        return call(domain,value?'turn_on':'turn_off',id);
      }
      if(type==='color'){
        if(this._exists(c.color))return call('select','select_option',c.color,{option:value});
        if(!this._exists(c.light))throw Error('No color select or light entity configured');
        const rgb={White:[255,255,255],Amber:[255,153,0],Red:[255,0,0]};
        return call('light','turn_on',c.light,{rgb_color:rgb[value]||rgb.White});
      }
      if(type==='brightness'){
        if(this._exists(c.brightness))return call('number','set_value',c.brightness,{value:Number(value)});
        return call('light','turn_on',c.light,{brightness_pct:Number(value)});
      }
    }
  }
  if(!customElements.get('devos-lightranger-card'))customElements.define('devos-lightranger-card',DevosLightRangerCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(x=>x.type==='devos-lightranger-card'))window.customCards.push({
    type:'devos-lightranger-card',name:'Devos LightRanger 2000',description:'Four-panel controls, color, brightness, battery and power',preview:true
  });
})();
