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
