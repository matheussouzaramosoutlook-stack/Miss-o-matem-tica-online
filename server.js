const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const app=express();const server=http.createServer(app);const io=new Server(server);
app.use(express.static('public'));
const rooms=new Map();
const questions=[
['Quanto é -8 + 15?', '7'],['Resolva: 3x + 5 = 20. Qual é x?', '5'],['Quanto é 25% de 80?', '20'],['Um produto de R$ 50 teve 10% de desconto. Novo preço?', '45'],['Qual é a média de 4, 6 e 8?', '6'],['Quanto é 2/3 de 30?', '20'],['Quanto é (-4) × (-6)?', '24'],['Resolva: x/4 = 7. Qual é x?', '28'],['Um quadrado tem lado 6 cm. Qual é o perímetro?', '24'],['Qual a probabilidade, em %, de tirar cara numa moeda justa?', '50'],['Se 3 cadernos custam R$ 18, quanto custam 5?', '30'],['Quanto é 0,75 + 1,25?', '2'],['Qual é o suplemento de um ângulo de 120°?', '60'],['Qual é a moda de 2, 3, 3, 5?', '3'],['Quanto é 15% de 200?', '30'],['Resolva: 2x - 6 = 10. Qual é x?', '8'],['Quanto é 7²?', '49'],['Um retângulo mede 8 cm por 3 cm. Qual é a área?', '24'],['Qual é a mediana de 3, 7 e 9?', '7'],['Se 4 pessoas fazem uma tarefa em 6 h, 8 pessoas fazem em quantas horas, no mesmo ritmo?', '3'],['Quanto é 5/10 em decimal?', '0,5'],['Quanto é -12 - (-5)?', '-7'],['Qual é o valor de 3 × (4 + 2)?', '18'],['Uma volta completa tem quantos graus?', '360']
];
function clean(s,n){return String(s||'').trim().slice(0,n)}
function code(){let c;do{c=Math.random().toString(36).slice(2,7).toUpperCase()}while(rooms.has(c));return c}
function publicRoom(r){return {code:r.code,players:r.players.map(({id,name,pos,color})=>({id,name,pos,color})),turn:r.turn,phase:r.phase,question:r.question?{text:questions[r.question.index][0],playerId:r.question.playerId}:null,last:r.last,winner:r.winner,started:r.started}}
function emit(r){io.to(r.code).emit('state',publicRoom(r))}
function next(r){r.question=null;r.phase='roll';r.turn=(r.turn+1)%r.players.length}
function remove(s){const c=s.data.room;if(!c)return;const r=rooms.get(c);if(!r)return;const i=r.players.findIndex(p=>p.id===s.id);if(i<0)return;r.players.splice(i,1);s.leave(c);s.data.room=null;if(!r.players.length){rooms.delete(c);return}if(r.winner===s.id){r.winner=null;r.started=false;r.phase='lobby'}if(r.question?.playerId===s.id){r.question=null;r.phase='roll'}if(i<r.turn)r.turn--;if(r.turn>=r.players.length)r.turn=0;r.last='Um jogador saiu da sala.';emit(r)}
function join(s,c,name,ack){if(typeof ack!=='function')ack=()=>{};name=clean(name,22);if(!name)return ack({error:'Digite seu nome.'});const r=rooms.get(c);if(!r)return ack({error:'Sala não encontrada.'});if(r.started)return ack({error:'A partida já começou. Aguarde a próxima.'});if(r.players.length>=6)return ack({error:'Sala cheia (máximo 6).'});remove(s);const colors=['#f97373','#6bc8ff','#facc6b','#a78bfa','#5ee6b3','#fb9fe0'];r.players.push({id:s.id,name,pos:0,color:colors[r.players.length]});s.join(c);s.data.room=c;r.last=name+' entrou na sala.';emit(r);ack({ok:true,code:c})}
io.on('connection',s=>{
s.on('create',({name}={},ack)=>{const c=code();rooms.set(c,{code:c,players:[],turn:0,phase:'lobby',question:null,last:'Sala criada!',winner:null,started:false});join(s,c,name,ack)});
s.on('join',({code:c,name}={},ack)=>join(s,clean(c,5).toUpperCase(),name,ack));
s.on('start',(_,ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||r.players[0]?.id!==s.id)return ack({error:'Só quem criou a sala pode começar.'});if(r.players.length<2)return ack({error:'Entre com pelo menos 2 jogadores.'});r.started=true;r.phase='roll';r.turn=0;r.last='Partida iniciada!';emit(r);ack({ok:true})});
s.on('roll',(_,ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||!r.started||r.phase!=='roll'||r.players[r.turn]?.id!==s.id)return ack({error:'Não é sua vez de jogar o dado.'});const p=r.players[r.turn],die=1+Math.floor(Math.random()*6);p.pos=Math.min(29,p.pos+die);r.last=`${p.name} tirou ${die} no dado e foi para a casa ${p.pos+1}.`;r.phase='answer';r.question={playerId:p.id,index:Math.floor(Math.random()*questions.length)};emit(r);ack({ok:true})});
s.on('answer',({answer}={},ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||r.phase!=='answer'||r.question?.playerId!==s.id)return ack({error:'Esta pergunta não é sua.'});const p=r.players[r.turn];const norm=x=>String(x).trim().toLowerCase().replace(/\s/g,'').replace(',','.');const good=norm(answer)===norm(questions[r.question.index][1]);if(good){r.last=`✅ ${p.name} acertou!`;if(p.pos===29){r.winner=p.id;r.phase='won';r.question=null;r.last=`🏆 ${p.name} encontrou o tesouro!`;emit(r);return ack({ok:true,correct:true})}}else{p.pos=Math.max(0,p.pos-2);r.last=`❌ ${p.name} errou e voltou 2 casas. Resposta: ${questions[r.question.index][1]}.`}next(r);emit(r);ack({ok:true,correct:good})});
s.on('restart',(_,ack=()=>{})=>{const r=rooms.get(s.data.room);if(!r||r.players[0]?.id!==s.id)return ack({error:'Somente o criador pode reiniciar.'});r.players.forEach(p=>p.pos=0);r.turn=0;r.phase='lobby';r.started=false;r.winner=null;r.question=null;r.last='Nova partida!';emit(r);ack({ok:true})});
s.on('disconnect',()=>remove(s));
});
server.listen(process.env.PORT||3000,()=>console.log('Missão Matemática online pronta'));
