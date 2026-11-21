const C={A:'var(--c)',H:'var(--h)',W:'#fff',K:'#1a1530',B:'var(--c)',F:'#1a1530',D:'var(--d)'};
const maps={
stand:["...A....",".HHHHHH.","HHHHHHHH","HWKHHWKH","HHHHHHHH",".HHHHHH.","..BBBB..",".BBBBBB.","..F..F.."],
walk:["....A...",".HHHHHH.","HHHHHHHH","HWKHHWKH","HHHHHHHH",".HHHHHH.","..BBBB..",".BBBBBB.","...FF..."],
sleep:["...A....",".HHHHHH.","HHHHHHHH","HKKHHKKH","HHHHHHHH",".HHHHHH.","..BBBB..",".BBBBBB.","..F..F.."],
};
for(const [n,m] of Object.entries(maps)){const o=[];m.forEach((r,y)=>[...r].forEach((ch,x)=>{if(ch!=='.')o.push(`${x}em ${y}em ${C[ch]}`)}));console.log(n+': '+o.join(',')+'\n');}
