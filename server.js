import{WebSocketServer}from"ws";import pty from"node-pty";import http from"http";import{exec}from"child_process";
const PORT=process.env.PTY_PORT||3099,TOKEN=process.env.PTY_AUTH_TOKEN||"";
const SHELL=process.env.SHELL||"/bin/bash";
const CWD=process.env.HOME||process.env.PWD||"/";
const ENV={...process.env,PATH:process.env.PATH||"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME||CWD,TERM:"xterm-256color",PS1:"[ sam@iam \\W ]\\$ "};
const s=http.createServer((q,r)=>{
  if(q.url==="/health"){r.writeHead(200);r.end("ok");return;}
  if(q.url==="/exec"&&q.method==="POST"){
    const auth=q.headers["authorization"]||"";
    if(auth!=="Bearer "+TOKEN){r.writeHead(401,{"Content-Type":"application/json"});r.end(JSON.stringify({error:"Unauthorized"}));return;}
    let body="";
    q.on("data",d=>body+=d);
    q.on("end",()=>{
      let cmd;try{cmd=JSON.parse(body).command;}catch(_){r.writeHead(400,{"Content-Type":"application/json"});r.end(JSON.stringify({error:"Invalid JSON"}));return;}
      if(!cmd){r.writeHead(400,{"Content-Type":"application/json"});r.end(JSON.stringify({error:"command required"}));return;}
      exec(cmd,{cwd:CWD,env:ENV,timeout:30000},(err,stdout,stderr)=>{
        r.writeHead(200,{"Content-Type":"application/json"});
        r.end(JSON.stringify({stdout:stdout||"",stderr:stderr||"",exit_code:err?.code||0}));
      });
    });
    return;
  }
  r.writeHead(404);r.end();
});
const wss=new WebSocketServer({server:s});
wss.on("connection",(ws,req)=>{
  const t=new URL(req.url,"http://x").searchParams.get("token");
  if(t!==TOKEN){ws.close(4001,"Unauthorized");return;}
  let term;try{term=pty.spawn(SHELL,[],{name:"xterm-256color",cols:220,rows:50,cwd:CWD,env:ENV});}catch(err){try{ws.send(JSON.stringify({type:"error",data:String(err.message)}));}catch(_){}ws.close(4002,"Spawn failed");return;}
  term.onData(d=>ws.readyState===1&&ws.send(d));
  term.onExit(({exitCode:c})=>{ws.readyState===1&&ws.send("\r\n[exit "+c+"]\r\n");ws.close();});
  ws.on("message",raw=>{try{const m=JSON.parse(raw);m.type==="input"?term.write(m.data):m.type==="resize"?term.resize(m.cols,m.rows):m.type==="run"&&term.write((m.command||"")+"\n");}catch{term.write(raw.toString());}});
  ws.on("close",()=>term.kill());
});
s.listen(PORT,"127.0.0.1",()=>console.log("[PTY] ready on "+PORT));
