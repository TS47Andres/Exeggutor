// Self-contained terminal HTML page for the React Native WebView.
// Embeds xterm.js via CDN and communicates with the RN host via postMessage.

export function getTerminalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<title>Exeggutor Terminal</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css" />
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000}
#terminal-container{width:100%;height:100%;padding:4px}
.xterm-viewport{scrollbar-width:thin}
</style>
</head>
<body>
<div id="terminal-container"></div>
<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
<script>
var terminal=null,fitAddon=null,ws=null,tabId=null,host=null,port=null,token=null,isConnected=false;
function post(t){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(t))}
function sendResize(){if(!terminal||!ws||ws.readyState!==WebSocket.OPEN)return
try{fitAddon.fit()}catch(e){}
var c=Math.max(terminal.cols,40),r=Math.max(terminal.rows,10)
ws.send(JSON.stringify({type:'resize',cols:c,rows:r}))}
function disconnect(){if(ws){ws.onopen=null;ws.onclose=null;ws.onerror=null;ws.onmessage=null
if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)ws.close();ws=null}
isConnected=false;post({type:'status',connected:false})}
function connect(h,p,t,tab){disconnect();host=h;port=p;token=t;tabId=tab
if(!terminal)initTerminal()
var u='ws://'+h+':'+p+'/ws/terminal/'+tab+'?token='+encodeURIComponent(t)
ws=new WebSocket(u)
ws.onopen=function(){isConnected=true;post({type:'status',connected:true});sendResize();if(terminal)terminal.focus()}
ws.onclose=function(){isConnected=false;post({type:'status',connected:false})}
ws.onerror=function(){isConnected=false;post({type:'status',connected:false})}
ws.onmessage=function(e){if(terminal)try{terminal.write(e.data)}catch(ex){}}}
function initTerminal(){var el=document.getElementById('terminal-container');if(!el)return
terminal=new Terminal({cursorBlink:true,cursorStyle:'block',scrollback:5000,fontSize:14,
fontFamily:'JetBrains Mono,monospace,courier-new,courier',
theme:{background:'#000000',foreground:'#f4f4f5',cursor:'#ffffff',selectionBackground:'rgba(255,255,255,0.15)',
black:'#000000',red:'#ef4444',green:'#22c55e',yellow:'#eab308',blue:'#3b82f6',magenta:'#ec4899',cyan:'#06b6d4',white:'#f4f4f5'}})
fitAddon=new FitAddon.FitAddon();terminal.loadAddon(fitAddon);terminal.open(el);fitAddon.fit()
terminal.onData(function(d){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',data:d}))})
window.addEventListener('resize',function(){try{fitAddon.fit()}catch(e){}sendResize()})
setTimeout(function(){try{fitAddon.fit()}catch(e){}sendResize();terminal.focus()},100)}
function insertText(t){if(!terminal)return;terminal.write(t)
if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',data:t}))}
function writeOutput(d){if(terminal)try{terminal.write(d)}catch(e){}}
function resize(c,r){if(terminal){terminal.resize(c,r);sendResize()}}
function resetTerminal(){if(terminal)terminal.reset()}
window.addEventListener('message',function(e){try{handleMsg(JSON.parse(e.data))}catch(ex){}})
document.addEventListener('message',function(e){try{handleMsg(JSON.parse(e.data))}catch(ex){}})
function handleMsg(m){switch(m.type){
case'connect':connect(m.host,m.port,m.token,m.tabId);break
case'disconnect':disconnect();break
case'voice-input':insertText(m.text);break
case'resize':resize(m.cols,m.rows);break
case'write':writeOutput(m.data);break
case'reset':resetTerminal();break}}
post({type:'status',connected:false})
</script>
</body>
</html>`;
}
