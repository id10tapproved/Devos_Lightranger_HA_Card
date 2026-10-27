/* Pi dashboard adapter: same component, different transport. Same-origin backend. */
(() => {
  class DevosLightRangerPi extends HTMLElement {
    constructor(){super();this.attachShadow({mode:'open'});this._reconnect=null;}
    connectedCallback(){
      this.shadowRoot.innerHTML='<devos-lightranger-view></devos-lightranger-view>';
      this._view=this.shadowRoot.querySelector('devos-lightranger-view');
      this._view.addEventListener('lightranger-command',e=>this._send(e.detail));
      this._stopped=false;this._load();this._connect();
    }
    disconnectedCallback(){this._stopped=true;this._socket?.close();clearTimeout(this._reconnect);}
    get endpoint(){return (this.getAttribute('api-path')||'/api/lightranger').replace(/\/$/,'');}
    async _load(){
      try{const response=await fetch(`${this.endpoint}/state`,{credentials:'same-origin',cache:'no-store'});
        if(!response.ok)throw Error('API returned '+response.status);
        this._view.state=await response.json();
      }catch(err){this._view.state={connected:false,error:String(err)};}
    }
    _connect(){
      if(this._stopped)return;
      const url=new URL(`${this.endpoint}/ws`,window.location.href);
      url.protocol=url.protocol==='https:'?'wss:':'ws:';
      this._socket=new WebSocket(url);
      this._socket.onmessage=e=>{
        try{this._view.state=JSON.parse(e.data);}catch(err){console.warn('Invalid LightRanger state',err);}
      };
      this._socket.onclose=()=>{
        if(this._stopped)return;
        this._view.state={...this._view.state,connected:false,error:'Reconnecting to Pi server…'};
        this._reconnect=setTimeout(()=>{this._load();this._connect();},2500);
      };
      this._socket.onerror=()=>this._socket.close();
    }
    async _send({type,value}){
      try{
        const response=await fetch(`${this.endpoint}/command`,{
          method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({type,value})
        });
        if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.detail||`HTTP ${response.status}`);}
      }catch(err){this._view.state={...this._view.state,error:String(err)};}
    }
  }
  if(!customElements.get('devos-lightranger-pi'))customElements.define('devos-lightranger-pi',DevosLightRangerPi);
})();
