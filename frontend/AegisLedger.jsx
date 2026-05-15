import { useState, useEffect } from "react";
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── THEME ────────────────────────────────────────────────────────
const T = {
  bg: "#04101E", sidebar: "#060F1C", card: "#0A1828", cardHover: "#0D1F35",
  border: "#112235", accent: "#00E5B0", accentGlow: "#00E5B012",
  gold: "#F0B429", red: "#F04438", blue: "#4A8FE2",
  text: "#E2EAF4", muted: "#4A6A88", dim: "#1A3050", white: "#FFFFFF",
};

// ─── MOCK DATA ─────────────────────────────────────────────────────
const volumeData = [
  {m:"Jan",vol:12.4,tx:847},{m:"Feb",vol:18.2,tx:1204},{m:"Mar",vol:15.8,tx:1089},
  {m:"Apr",vol:24.6,tx:1567},{m:"May",vol:31.2,tx:2103},{m:"Jun",vol:28.9,tx:1897},
  {m:"Jul",vol:38.4,tx:2456},{m:"Aug",vol:44.1,tx:2891},{m:"Sep",vol:41.7,tx:2678},
  {m:"Oct",vol:52.3,tx:3241},{m:"Nov",vol:48.9,tx:3087},{m:"Dec",vol:61.8,tx:3956}
];
const rateData = [
  {t:"00:00",r:3.674},{t:"04:00",r:3.671},{t:"08:00",r:3.678},
  {t:"12:00",r:3.682},{t:"16:00",r:3.676},{t:"20:00",r:3.679},{t:"24:00",r:3.681}
];
const txList = [
  {id:"TXN-2024-0847",from:"Rosneft Trading SA",to:"Gulf Petrochem FZE",amount:"4,250,000",currency:"USDC",status:"settled",time:"2m ago",flag:false,hash:"0x7f3a...4b2c",network:"Ethereum",fee:"$0.42",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0846",from:"PhosAgro PJSC",to:"Emirates Fertilizers",amount:"1,890,000",currency:"AE Coin",status:"pending",time:"8m ago",flag:false,hash:"0x2d1e...9f4a",network:"ADX Chain",fee:"$0.08",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0845",from:"Mechel PAO",to:"Dubal Holding",amount:"7,100,000",currency:"USDT",status:"flagged",time:"14m ago",flag:true,hash:"0xb3c7...1e8d",network:"Polygon",fee:"$0.12",fatf:"⚠️",sanctions:"⚠️"},
  {id:"TXN-2024-0844",from:"NLMK Group",to:"Emirates Steel",amount:"3,420,000",currency:"USDC",status:"settled",time:"31m ago",flag:false,hash:"0x9a2f...6c3b",network:"Ethereum",fee:"$0.38",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0843",from:"Norilsk Nickel",to:"DMCC Metals Hub",amount:"12,750,000",currency:"USDC",status:"settled",time:"47m ago",flag:false,hash:"0x4e8d...2a1f",network:"Ethereum",fee:"$0.91",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0842",from:"Severstal PAO",to:"Conares Metal Group",amount:"2,180,000",currency:"USDT",status:"processing",time:"1h ago",flag:false,hash:"0x6c4b...8d9e",network:"Polygon",fee:"$0.09",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0841",from:"TMK Group",to:"Stainless Steel FZE",amount:"5,640,000",currency:"AE Coin",status:"settled",time:"2h ago",flag:false,hash:"0x1b7e...3f5a",network:"ADX Chain",fee:"$0.21",fatf:"✅",sanctions:"✅"},
  {id:"TXN-2024-0840",from:"Gazprom Neft",to:"ADNOC Trading",amount:"18,200,000",currency:"USDC",status:"settled",time:"3h ago",flag:false,hash:"0x8d3c...5e7b",network:"Ethereum",fee:"$1.24",fatf:"✅",sanctions:"✅"},
];
const wallets = [
  {currency:"USDC",network:"Ethereum",balance:"24,847,320.00",change:"+2.4%",addr:"0x4A9f...3C2E",logo:"💵",color:"#2775CA"},
  {currency:"USDT",network:"Polygon",balance:"18,234,180.50",change:"+0.8%",addr:"0x8B3d...7F1A",logo:"💲",color:"#26A17B"},
  {currency:"AE Coin",network:"ADX Blockchain",balance:"6,412,750.00",change:"+1.2%",addr:"ae1q3...9p2k",logo:"🇦🇪",color:T.accent},
];
const kybQueue = [
  {company:"Urals Energy Group",country:"🇷🇺 Russia",type:"Energy / Commodities",submitted:"2 days ago",risk:"medium",status:"review",ubo:"3 directors",revenue:"₽4.2B"},
  {company:"Trans-Caspian Logistics",country:"🇦🇪 UAE",type:"Freight / Logistics",submitted:"3 days ago",risk:"low",status:"pending",ubo:"1 director",revenue:"AED 890M"},
  {company:"Siberian Grain Holdings",country:"🇷🇺 Russia",type:"Agricultural",submitted:"5 days ago",risk:"high",status:"escalated",ubo:"7 directors",revenue:"₽1.1B"},
  {company:"Dubai Metals & Commodities",country:"🇦🇪 UAE",type:"Metals Trading",submitted:"1 week ago",risk:"low",status:"approved",ubo:"2 directors",revenue:"AED 2.4B"},
  {company:"Polyus Gold PJSC",country:"🇷🇺 Russia",type:"Mining",submitted:"2 weeks ago",risk:"medium",status:"review",ubo:"4 directors",revenue:"₽7.8B"},
];
const amlAlerts = [
  {id:"AML-0291",tx:"TXN-2024-0845",type:"Sanctions Match",severity:"critical",desc:"Entity name partial match on OFAC SDN list — Mechel PAO director screening. Manual review required before transaction release.",assigned:"Compliance Officer"},
  {id:"AML-0290",tx:"TXN-2024-0839",type:"Velocity Alert",severity:"high",desc:"3 transactions exceeding $5M within 2-hour window from same originator IP and corporate entity. Potential structuring pattern.",assigned:"Compliance Officer"},
  {id:"AML-0289",tx:"TXN-2024-0831",type:"Geographic Risk",severity:"medium",desc:"Beneficiary bank jurisdiction flagged under FATF grey-list monitoring. Enhanced due diligence required per VARA Rulebook.",assigned:"Auto-flagged"},
];
const escrows = [
  {id:"ESC-0142",buyer:"Rosneft Trading SA",seller:"Gulf Petrochem FZE",value:"4,250,000 USDC",product:"Crude Oil — Urals Grade, 50,000 bbl",condition:"Bill of Lading + Port Authority e-signature",progress:75,status:"awaiting_bol",contract:"0xA1B2...3C4D"},
  {id:"ESC-0141",buyer:"PhosAgro PJSC",seller:"Emirates Fertilizers",value:"1,890,000 AE Coin",product:"DAP Fertilizer — 5,000 MT",condition:"Commercial Invoice + Packing List OCR verification",progress:40,status:"doc_review",contract:"0xE5F6...7G8H"},
  {id:"ESC-0140",buyer:"NLMK Group",seller:"Emirates Steel",value:"3,420,000 USDC",product:"Steel Billets — Grade 60, 2,000 MT",condition:"All conditions met — releasing funds",progress:100,status:"releasing",contract:"0xI9J0...1K2L"},
];
const navMap = {
  admin:    [{id:"dashboard",icon:"⊞",l:"Dashboard"},{id:"transactions",icon:"⇄",l:"All Transactions"},{id:"wallets",icon:"◈",l:"Wallets"},{id:"compliance",icon:"⚑",l:"Compliance"},{id:"trade",icon:"☰",l:"Trade Finance"}],
  treasury: [{id:"dashboard",icon:"⊞",l:"Dashboard"},{id:"transactions",icon:"⇄",l:"Settlements"},{id:"wallets",icon:"◈",l:"Wallets"},{id:"trade",icon:"☰",l:"Trade Finance"}],
  compliance:[{id:"dashboard",icon:"⊞",l:"Dashboard"},{id:"compliance",icon:"⚑",l:"Compliance Center"},{id:"transactions",icon:"⇄",l:"Transactions"}],
  operator: [{id:"dashboard",icon:"⊞",l:"Dashboard"},{id:"transactions",icon:"⇄",l:"Payments"},{id:"trade",icon:"☰",l:"Documents"}],
  logistics: [{id:"dashboard",icon:"⊞",l:"Dashboard"},{id:"trade",icon:"☰",l:"Shipments"}],
};
const roleLabels = {admin:"Super Administrator",treasury:"Treasury Manager",compliance:"Compliance Officer",operator:"Corporate Operator",logistics:"Logistics Agent"};

// ─── SHARED COMPONENTS ─────────────────────────────────────────────
const Badge = ({s}) => {
  const map = {settled:{bg:"#00E5B015",c:"#00E5B0",t:"Settled"},pending:{bg:"#4A8FE215",c:"#4A8FE2",t:"Pending"},
    flagged:{bg:"#F0443815",c:"#F04438",t:"Flagged"},processing:{bg:"#F0B42915",c:"#F0B429",t:"Processing"},
    releasing:{bg:"#00E5B015",c:"#00E5B0",t:"Releasing"},awaiting_bol:{bg:"#F0B42915",c:"#F0B429",t:"Awaiting BoL"},
    doc_review:{bg:"#4A8FE215",c:"#4A8FE2",t:"Doc Review"},review:{bg:"#F0B42915",c:"#F0B429",t:"In Review"},
    escalated:{bg:"#F0443815",c:"#F04438",t:"Escalated"},approved:{bg:"#00E5B015",c:"#00E5B0",t:"Approved"},
    critical:{bg:"#F0443825",c:"#F04438",t:"Critical"},high:{bg:"#F0B42920",c:"#F0B429",t:"High"},
    medium:{bg:"#4A8FE215",c:"#4A8FE2",t:"Medium"},low:{bg:"#00E5B015",c:"#00E5B0",t:"Low"},
  };
  const st = map[s]||{bg:T.dim+"30",c:T.muted,t:s};
  return <span style={{background:st.bg,color:st.c,padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{st.t}</span>;
};

const Stat = ({label,value,sub,icon,pos,neg}) => (
  <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 20px",flex:1,minWidth:0}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
      <span style={{color:T.muted,fontSize:10,letterSpacing:"0.8px",textTransform:"uppercase",fontWeight:600}}>{label}</span>
      <span style={{fontSize:16}}>{icon}</span>
    </div>
    <div style={{color:T.text,fontSize:22,fontWeight:700,fontFamily:"'Courier New',monospace",letterSpacing:"-0.5px"}}>{value}</div>
    {sub && <div style={{marginTop:5,fontSize:11,color:pos?T.accent:neg?T.red:T.muted}}>{sub}</div>}
    <div style={{marginTop:10,height:2,background:`linear-gradient(90deg,${pos?T.accent:neg?T.red:T.muted}60,transparent)`,borderRadius:1}}/>
  </div>
);

// ─── SIDEBAR ──────────────────────────────────────────────────────
function Sidebar({active,setActive,role,setRole}) {
  const items = navMap[role]||navMap.admin;
  return (
    <div style={{width:210,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
      <div style={{padding:"20px 16px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,background:`linear-gradient(135deg,${T.accent},#0077BB)`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>⬡</div>
          <div><div style={{color:T.text,fontWeight:700,fontSize:14,letterSpacing:"0.3px"}}>AegisLedger</div>
          <div style={{color:T.muted,fontSize:9,letterSpacing:"1.2px",textTransform:"uppercase"}}>B2B Settlement</div></div>
        </div>
      </div>
      <div style={{padding:"10px 10px 0"}}>
        <div style={{fontSize:9,color:T.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:5,paddingLeft:8}}>Demo Role</div>
        <select value={role} onChange={e=>setRole(e.target.value)} style={{width:"100%",background:T.card,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11,cursor:"pointer",outline:"none"}}>
          {Object.entries(roleLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <nav style={{flex:1,padding:"14px 10px"}}>
        <div style={{fontSize:9,color:T.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:6,paddingLeft:8}}>Navigation</div>
        {items.map(item=>(
          <button key={item.id} onClick={()=>setActive(item.id)} style={{
            width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,
            background:active===item.id?T.accentGlow:"transparent",
            border:active===item.id?`1px solid ${T.accent}25`:"1px solid transparent",
            color:active===item.id?T.accent:T.muted,cursor:"pointer",textAlign:"left",
            fontSize:12,fontWeight:active===item.id?600:400,marginBottom:2,transition:"all 0.12s"
          }}>
            <span style={{fontSize:13,width:16,textAlign:"center"}}>{item.icon}</span>{item.l}
          </button>
        ))}
      </nav>
      <div style={{padding:"14px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${T.dim},#0A1E35)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.accent,fontWeight:700,border:`1px solid ${T.border}`,flexShrink:0}}>
            {roleLabels[role]?.charAt(0)}
          </div>
          <div style={{overflow:"hidden"}}>
            <div style={{color:T.text,fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{roleLabels[role]}</div>
            <div style={{color:T.accent,fontSize:9,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>Online
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HEADER ───────────────────────────────────────────────────────
function Header({screen}) {
  const names = {dashboard:"Platform Overview",transactions:"Settlement History",wallets:"Digital Asset Vaults",compliance:"Compliance Center",trade:"Trade Finance & Escrow"};
  const [time,setTime] = useState(new Date().toLocaleTimeString("en-US",{hour12:false}));
  useEffect(()=>{const i=setInterval(()=>setTime(new Date().toLocaleTimeString("en-US",{hour12:false})),1000);return()=>clearInterval(i);},[]);
  return (
    <div style={{background:T.sidebar,borderBottom:`1px solid ${T.border}`,padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,flexShrink:0}}>
      <div>
        <div style={{color:T.text,fontWeight:600,fontSize:14}}>{names[screen]||"AegisLedger"}</div>
        <div style={{color:T.muted,fontSize:10}}>RUB → AED Cross-Border Settlement Gateway · VARA Licensed</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,padding:"4px 10px",borderRadius:20}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:T.accent,display:"inline-block",boxShadow:`0 0 6px ${T.accent}`}}/>
          <span style={{color:T.accent,fontSize:10,fontWeight:700}}>LIVE</span>
        </div>
        <div style={{color:T.muted,fontSize:10,fontFamily:"monospace"}}>UTC+4 {time}</div>
        <div style={{position:"relative",cursor:"pointer"}}>
          <div style={{width:30,height:30,background:T.card,border:`1px solid ${T.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🔔</div>
          <div style={{position:"absolute",top:-4,right:-4,width:14,height:14,background:T.red,borderRadius:"50%",fontSize:8,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>3</div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
function Dashboard({role}) {
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20}}>
        <Stat label="Total Settled (30d)" value="$418.7M" sub="↑ 24.3% vs last month" icon="💹" pos/>
        <Stat label="Active Settlements" value="247" sub="↑ 18 in last hour" icon="⚡" pos/>
        <Stat label="Avg Settlement Time" value="18.4s" sub="↓ 3.1s faster than target" icon="⏱" pos/>
        <Stat label="Compliance Rate" value="99.97%" sub="3 flags need review" icon="🛡" pos/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:20}}>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:T.text,fontWeight:600,fontSize:12}}>Settlement Volume — RUB→AED Corridor</div>
              <div style={{color:T.muted,fontSize:10}}>Monthly USD billions · 2024</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {["1M","3M","1Y"].map(l=><button key={l} style={{background:l==="1Y"?T.accentGlow:"transparent",color:l==="1Y"?T.accent:T.muted,border:`1px solid ${l==="1Y"?T.accent+"30":T.border}`,padding:"2px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:600}}>{l}</button>)}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={volumeData}>
              <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={T.accent} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={T.accent} stopOpacity={0}/>
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.dim} strokeOpacity={0.5}/>
              <XAxis dataKey="m" tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.muted,fontSize:9}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:10}}/>
              <Area type="monotone" dataKey="vol" stroke={T.accent} strokeWidth={2} fill="url(#vg)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:12,marginBottom:2}}>Live AED / USDC Rate</div>
          <div style={{color:T.muted,fontSize:10,marginBottom:14}}>Real-time oracle · Chainlink feed</div>
          <div style={{textAlign:"center",marginBottom:10}}>
            <div style={{color:T.accent,fontSize:30,fontWeight:700,fontFamily:"monospace",letterSpacing:"-1px"}}>3.6810</div>
            <div style={{color:T.accent,fontSize:11}}>+0.0012 (+0.033%) today</div>
          </div>
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={rateData}>
              <Line type="monotone" dataKey="r" stroke={T.accent} strokeWidth={2} dot={false}/>
              <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:6,color:T.text,fontSize:9}}/>
            </LineChart>
          </ResponsiveContainer>
          <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[{l:"24h High",v:"3.6847"},{l:"24h Low",v:"3.6701"},{l:"Spread",v:"0.0012"},{l:"Slippage",v:"<0.01%"}].map(x=>(
              <div key={x.l} style={{background:T.sidebar,borderRadius:6,padding:"7px",textAlign:"center"}}>
                <div style={{color:T.muted,fontSize:9}}>{x.l}</div>
                <div style={{color:T.text,fontSize:11,fontFamily:"monospace",fontWeight:600}}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:T.text,fontWeight:600,fontSize:12}}>Recent Settlements</div>
          <span style={{color:T.accent,fontSize:11,cursor:"pointer"}}>View all →</span>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["TX ID","From","To","Amount","Asset","Status","Time"].map(h=>(
            <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",paddingBottom:8,borderBottom:`1px solid ${T.border}`,fontWeight:600}}>{h}</th>
          ))}</tr></thead>
          <tbody>{txList.slice(0,5).map(tx=>(
            <tr key={tx.id} style={{borderBottom:`1px solid ${T.border}20`}}>
              <td style={{padding:"9px 0",color:T.accent,fontSize:10,fontFamily:"monospace",fontWeight:600}}>{tx.flag?"⚑ ":""}{tx.id}</td>
              <td style={{padding:"9px 0",color:T.text,fontSize:11}}>{tx.from}</td>
              <td style={{padding:"9px 0",color:T.text,fontSize:11}}>{tx.to}</td>
              <td style={{padding:"9px 0",color:T.text,fontSize:11,fontFamily:"monospace"}}>${tx.amount}</td>
              <td style={{padding:"9px 0",color:T.muted,fontSize:10}}>{tx.currency}</td>
              <td style={{padding:"9px 0"}}><Badge s={tx.status}/></td>
              <td style={{padding:"9px 0",color:T.muted,fontSize:10}}>{tx.time}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────
function Transactions() {
  const [sel,setSel] = useState(null);
  const [filter,setFilter] = useState("all");
  const filtered = filter==="all"?txList:txList.filter(t=>t.status===filter);
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)",display:"flex",gap:16}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {["all","settled","pending","flagged","processing"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{
              background:filter===f?T.accentGlow:"transparent",color:filter===f?T.accent:T.muted,
              border:`1px solid ${filter===f?T.accent+"35":T.border}`,
              padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:10,fontWeight:600,textTransform:"capitalize"
            }}>{f==="all"?"All Transactions":f}</button>
          ))}
          <div style={{flex:1}}/>
          <input placeholder="Search by ID, entity, hash..." style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"5px 12px",borderRadius:7,fontSize:10,width:240,outline:"none"}}/>
        </div>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
            <thead><tr style={{background:T.sidebar}}>
              {["TX ID","Originator","Beneficiary","Amount","Asset","Status","Time"].map(h=>(
                <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map(tx=>(
              <tr key={tx.id} onClick={()=>setSel(sel?.id===tx.id?null:tx)} style={{borderBottom:`1px solid ${T.border}20`,cursor:"pointer",background:sel?.id===tx.id?T.accentGlow:"transparent",transition:"background 0.1s"}}>
                <td style={{padding:"10px 14px",color:T.accent,fontSize:10,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap"}}>{tx.flag?"⚑ ":""}{tx.id}</td>
                <td style={{padding:"10px 14px",color:T.text,fontSize:11,whiteSpace:"nowrap"}}>{tx.from}</td>
                <td style={{padding:"10px 14px",color:T.text,fontSize:11,whiteSpace:"nowrap"}}>{tx.to}</td>
                <td style={{padding:"10px 14px",color:T.text,fontSize:11,fontFamily:"monospace",fontWeight:600,whiteSpace:"nowrap"}}>${tx.amount}</td>
                <td style={{padding:"10px 14px",color:T.muted,fontSize:10,whiteSpace:"nowrap"}}>{tx.currency}</td>
                <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}><Badge s={tx.status}/></td>
                <td style={{padding:"10px 14px",color:T.muted,fontSize:10,whiteSpace:"nowrap"}}>{tx.time}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{color:T.muted,fontSize:10,marginTop:10}}>{filtered.length} transactions · Page 1 of 24</div>
      </div>
      {sel && (
        <div style={{width:300,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px",position:"sticky",top:0,alignSelf:"flex-start",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{color:T.text,fontWeight:600,fontSize:12}}>Transaction Detail</div>
            <button onClick={()=>setSel(null)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1}}>×</button>
          </div>
          <Badge s={sel.status}/>
          <div style={{marginTop:14}}>
            {[["TX ID",sel.id],["From",sel.from],["To",sel.to],["Amount","$"+sel.amount],["Asset",sel.currency],["Network",sel.network],["Hash",sel.hash],["Time",sel.time],["Settlement","18.4 seconds"],["Gas Fee",sel.fee],["FATF Rule",sel.fatf+" Compliant"],["Sanctions",sel.sanctions+" Clear"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}20`}}>
                <span style={{color:T.muted,fontSize:10,flexShrink:0,marginRight:8}}>{k}</span>
                <span style={{color:T.text,fontSize:10,fontFamily:["TX ID","Hash"].includes(k)?"monospace":"inherit",textAlign:"right",wordBreak:"break-all"}}>{v}</span>
              </div>
            ))}
          </div>
          {sel.flag && (
            <div style={{marginTop:14,background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:8,padding:"12px"}}>
              <div style={{color:T.red,fontWeight:700,fontSize:11,marginBottom:6}}>⚑ Compliance Flag Active</div>
              <div style={{color:T.text,fontSize:10,lineHeight:1.5}}>Potential sanctions match detected. Requires Compliance Officer review before release.</div>
              <div style={{display:"flex",gap:6,marginTop:10}}>
                <button style={{flex:1,background:T.red,color:"#fff",border:"none",borderRadius:6,padding:"6px",cursor:"pointer",fontSize:10,fontWeight:700}}>Freeze TX</button>
                <button style={{flex:1,background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,borderRadius:6,padding:"6px",cursor:"pointer",fontSize:10,fontWeight:700}}>Clear Flag</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WALLETS ──────────────────────────────────────────────────────
function Wallets() {
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20}}>
        {wallets.map(w=>(
          <div key={w.currency} style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",cursor:"pointer",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${w.color}15,transparent)`}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <span style={{fontSize:22}}>{w.logo}</span><Badge s="approved"/>
            </div>
            <div style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5}}>{w.currency} · {w.network}</div>
            <div style={{color:T.text,fontSize:22,fontWeight:700,fontFamily:"monospace",letterSpacing:"-0.5px"}}>{w.balance}</div>
            <div style={{color:w.color,fontSize:11,marginTop:4}}>{w.change} today</div>
            <div style={{color:T.dim,fontSize:9,fontFamily:"monospace",marginTop:8}}>{w.addr}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:12,marginBottom:14}}>Vault Activity</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Type","Amount","Asset","Counterparty","Time","Status"].map(h=>(
              <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",paddingBottom:8,borderBottom:`1px solid ${T.border}`,fontWeight:600}}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {[{type:"Received",amount:"+4,250,000",asset:"USDC",cp:"Rosneft Trading SA",time:"2m ago",s:"settled"},
                {type:"Sent",amount:"-1,890,000",asset:"AE Coin",cp:"Emirates Fertilizers",time:"8m ago",s:"settled"},
                {type:"On-Ramp",amount:"+7,100,000",asset:"USDT",cp:"OpenPayd Gateway",time:"1h ago",s:"settled"},
                {type:"Off-Ramp",amount:"-3,420,000",asset:"USDC",cp:"Corporate Bank AE",time:"3h ago",s:"pending"},
                {type:"Received",amount:"+12,750,000",asset:"USDC",cp:"Norilsk Nickel",time:"5h ago",s:"settled"},
              ].map((r,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}20`}}>
                  <td style={{padding:"8px 0",color:T.muted,fontSize:11}}>{r.type}</td>
                  <td style={{padding:"8px 0",color:r.amount.startsWith("+")?T.accent:T.red,fontSize:11,fontFamily:"monospace",fontWeight:600}}>{r.amount}</td>
                  <td style={{padding:"8px 0",color:T.muted,fontSize:10}}>{r.asset}</td>
                  <td style={{padding:"8px 0",color:T.text,fontSize:11}}>{r.cp}</td>
                  <td style={{padding:"8px 0",color:T.muted,fontSize:10}}>{r.time}</td>
                  <td style={{padding:"8px 0"}}><Badge s={r.s}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:12,marginBottom:14}}>Vault Security (MPC)</div>
          {[["Custody Type","Fireblocks MPC",true],["Key Threshold","3-of-5 Shards",true],["Encryption","AES-256 at rest",true],["Transport","TLS 1.3",true],["Standard","SOC 2 Type II",true],["Insurance","$100M coverage",true],["Smart Contract Audit","Passed Jan 2026",true],["Last Pentest","Feb 2026",true]].map(([l,v,ok])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}20`}}>
              <span style={{color:T.muted,fontSize:10}}>{l}</span>
              <span style={{color:ok?T.accent:T.red,fontSize:10,fontWeight:600}}>{v}</span>
            </div>
          ))}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:14}}>
            <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:11,fontWeight:600}}>+ Initiate On-Ramp (RUB/AED)</button>
            <button style={{background:"transparent",color:T.muted,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:11}}>↓ Request Off-Ramp</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── COMPLIANCE ───────────────────────────────────────────────────
function Compliance() {
  const [tab,setTab] = useState("kyb");
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20}}>
        <Stat label="KYB Pending" value="14" sub="4 require escalation" icon="📋" neg/>
        <Stat label="AML Alerts" value="3" sub="1 critical — immediate action" icon="⚑" neg/>
        <Stat label="Sanctions Screens Today" value="2,847" sub="All clear — 0 hard blocks" icon="🔍" pos/>
        <Stat label="FATF Compliance" value="99.97%" sub="Travel Rule enforced" icon="⚖️" pos/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[{id:"kyb",l:"KYB Queue"},{id:"aml",l:"AML Alerts"},{id:"sanctions",l:"Sanctions Engine"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>
      {tab==="kyb" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
            <thead><tr style={{background:T.sidebar}}>
              {["Company","Country","Sector","UBOs","Revenue","Submitted","Risk","Status","Actions"].map(h=>(
                <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{kybQueue.map(k=>(
              <tr key={k.company} style={{borderBottom:`1px solid ${T.border}20`}}>
                <td style={{padding:"11px 14px",color:T.text,fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>{k.company}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:11,whiteSpace:"nowrap"}}>{k.country}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:11,whiteSpace:"nowrap"}}>{k.type}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:11,whiteSpace:"nowrap"}}>{k.ubo}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:10,fontFamily:"monospace",whiteSpace:"nowrap"}}>{k.revenue}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:11,whiteSpace:"nowrap"}}>{k.submitted}</td>
                <td style={{padding:"11px 14px",whiteSpace:"nowrap"}}><Badge s={k.risk}/></td>
                <td style={{padding:"11px 14px",whiteSpace:"nowrap"}}><Badge s={k.status}/></td>
                <td style={{padding:"11px 14px",whiteSpace:"nowrap"}}>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"3px 9px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Review</button>
                    <button style={{background:"transparent",color:T.muted,border:`1px solid ${T.border}`,padding:"3px 9px",borderRadius:5,cursor:"pointer",fontSize:9}}>Docs</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {tab==="aml" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {amlAlerts.map(a=>(
            <div key={a.id} style={{background:T.card,border:`1px solid ${a.severity==="critical"?T.red+"45":a.severity==="high"?T.gold+"45":T.border}`,borderRadius:12,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <Badge s={a.severity}/>
                  <div>
                    <div style={{color:T.text,fontWeight:700,fontSize:13}}>{a.type}</div>
                    <div style={{color:T.muted,fontSize:10,marginTop:2}}>{a.id} · TX: {a.tx} · Assigned: {a.assigned}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button style={{background:"#F0443815",color:T.red,border:`1px solid ${T.red}30`,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>Freeze</button>
                  <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>Investigate</button>
                </div>
              </div>
              <div style={{marginTop:10,color:T.text,fontSize:11,lineHeight:1.6,background:T.sidebar,padding:"10px 12px",borderRadius:7}}>{a.desc}</div>
            </div>
          ))}
        </div>
      )}
      {tab==="sanctions" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
            {[{l:"OFAC SDN",m:0,t:"2 min ago"},{l:"UN Security Council",m:0,t:"2 min ago"},{l:"EU Consolidated",m:0,t:"5 min ago"},{l:"UK HMT Sanctions",m:0,t:"5 min ago"},{l:"Rosfinmonitoring",m:0,t:"10 min ago"},{l:"VARA Watchlist",m:1,t:"14 min ago"}].map(s=>(
              <div key={s.l} style={{background:T.sidebar,border:`1px solid ${s.m>0?T.gold+"40":T.border}`,borderRadius:8,padding:"12px"}}>
                <div style={{color:T.text,fontSize:11,fontWeight:600,marginBottom:5}}>{s.l}</div>
                <div style={{color:s.m>0?T.gold:T.accent,fontSize:18,fontWeight:700,fontFamily:"monospace"}}>{s.m} match{s.m!==1?"es":""}</div>
                <div style={{color:T.muted,fontSize:9,marginTop:3}}>Last scan: {s.t}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.sidebar,borderRadius:8,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:T.muted,fontSize:11}}>Next auto-scan in <span style={{color:T.accent,fontFamily:"monospace"}}>00:47</span> · 2,847 entities screened today</div>
            <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>Run Manual Scan Now</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRADE FINANCE ────────────────────────────────────────────────
function TradeFinance() {
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20}}>
        <Stat label="Active Escrows" value="23" sub="$47.2M locked in smart contracts" icon="🔒"/>
        <Stat label="Pending BoL Release" value="$12.8M" sub="3 contracts awaiting docs" icon="📦" pos/>
        <Stat label="Released Today" value="$28.4M" sub="↑ 12 contracts settled" icon="✅" pos/>
        <Stat label="Disputed" value="1" sub="Arbitration in progress" icon="⚖️" neg/>
      </div>
      <div style={{color:T.text,fontWeight:600,fontSize:12,marginBottom:14}}>Active Smart Contract Escrows</div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {escrows.map(e=>(
          <div key={e.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <span style={{color:T.accent,fontFamily:"monospace",fontWeight:700,fontSize:12}}>{e.id}</span>
                  <Badge s={e.status}/>
                  <span style={{color:T.dim,fontSize:9,fontFamily:"monospace"}}>Contract: {e.contract}</span>
                </div>
                <div style={{color:T.text,fontSize:14,fontWeight:700}}>{e.product}</div>
                <div style={{color:T.muted,fontSize:11,marginTop:2}}>{e.buyer} <span style={{color:T.dim}}>→</span> {e.seller}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:T.text,fontSize:20,fontWeight:700,fontFamily:"monospace"}}>{e.value}</div>
                <div style={{color:T.muted,fontSize:10}}>Locked in escrow</div>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{color:T.muted,fontSize:10}}>Settlement Progress</span>
                <span style={{color:e.progress===100?T.accent:T.gold,fontSize:10,fontWeight:700,fontFamily:"monospace"}}>{e.progress}%</span>
              </div>
              <div style={{background:T.dim,borderRadius:4,height:5}}>
                <div style={{width:`${e.progress}%`,height:"100%",background:e.progress===100?T.accent:`linear-gradient(90deg,${T.accent},${T.gold})`,borderRadius:4,transition:"width 0.4s"}}/>
              </div>
            </div>
            <div style={{background:T.sidebar,borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <div style={{minWidth:0}}>
                <span style={{color:T.muted,fontSize:10}}>Release Condition: </span>
                <span style={{color:T.text,fontSize:10}}>{e.condition}</span>
              </div>
              {e.progress<100 ? (
                <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Upload Document</button>
              ) : (
                <button style={{background:T.accent,color:T.bg,border:"none",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>✓ Release Funds</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [step,setStep] = useState(1);
  const [email,setEmail] = useState("treasury@rosneft.ru");
  const [pass,setPass] = useState("••••••••••••");
  const [mfa,setMfa] = useState("");
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border}60 1px,transparent 1px),linear-gradient(90deg,${T.border}60 1px,transparent 1px)`,backgroundSize:"40px 40px"}}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% -10%,${T.accent}10,transparent 55%)`}}/>
      <div style={{width:400,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"36px",position:"relative",zIndex:1,boxShadow:`0 0 80px ${T.accent}10,0 30px 60px #00000050`}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,background:`linear-gradient(135deg,${T.accent},#0088CC)`,borderRadius:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:10}}>⬡</div>
          <div style={{color:T.text,fontWeight:700,fontSize:20,letterSpacing:"0.3px"}}>AegisLedger</div>
          <div style={{color:T.muted,fontSize:11,marginTop:3}}>Institutional B2B Settlement Gateway</div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8}}>
            {["VARA Licensed","ISO 27001","SOC 2 Type II"].map(l=><span key={l} style={{background:T.dim+"60",color:T.muted,fontSize:9,padding:"2px 7px",borderRadius:20,border:`1px solid ${T.border}`}}>{l}</span>)}
          </div>
        </div>
        {step===1 && <>
          {[["Corporate Email",email,setEmail,"text","treasury@company.com"],["Password",pass,setPass,"password","••••••••••••"]].map(([lbl,val,set,type,ph])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5,display:"block",fontWeight:600}}>{lbl}</label>
              <input value={val} onChange={e=>set(e.target.value)} type={type} placeholder={ph} style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:T.text,padding:"10px 12px",borderRadius:7,fontSize:12,boxSizing:"border-box",outline:"none"}}/>
            </div>
          ))}
          <button onClick={()=>setStep(2)} style={{width:"100%",background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontSize:12,fontWeight:700,letterSpacing:"0.5px",marginTop:6}}>CONTINUE →</button>
        </>}
        {step===2 && <>
          <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px",marginBottom:18,textAlign:"center"}}>
            <div style={{color:T.muted,fontSize:10,marginBottom:6}}>FIDO2 / WebAuthn MFA Required</div>
            <div style={{fontSize:28,marginBottom:4}}>🔑</div>
            <div style={{color:T.text,fontSize:11}}>Enter your 6-digit authenticator code</div>
          </div>
          <input value={mfa} onChange={e=>setMfa(e.target.value)} placeholder="000 000" maxLength={7} style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:T.accent,padding:"12px",borderRadius:7,fontSize:22,textAlign:"center",fontFamily:"monospace",letterSpacing:"10px",boxSizing:"border-box",outline:"none",marginBottom:14}}/>
          <button onClick={onLogin} style={{width:"100%",background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontSize:12,fontWeight:700}}>AUTHENTICATE & ENTER</button>
        </>}
        <div style={{textAlign:"center",marginTop:16}}>
          <span style={{color:T.dim,fontSize:10}}>🔒 AES-256 · TLS 1.3 · MPC Custody · ISO 27001</span>
        </div>
        <div style={{marginTop:14,padding:"12px",background:T.sidebar,borderRadius:8,border:`1px solid ${T.border}`}}>
          <div style={{color:T.muted,fontSize:10,textAlign:"center"}}>New corporate client? <span style={{color:T.accent,cursor:"pointer",fontWeight:600}}>Apply for Institutional KYB Access →</span></div>
          <div style={{color:T.dim,fontSize:9,textAlign:"center",marginTop:2}}>B2B entities only · Annual revenue &gt; AED 10M required</div>
        </div>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn,setLoggedIn] = useState(false);
  const [screen,setScreen] = useState("dashboard");
  const [role,setRole] = useState("treasury");
  useEffect(()=>{
    const l=document.createElement("link");
    l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    document.body.style.cssText="margin:0;padding:0;font-family:'Plus Jakarta Sans',sans-serif;background:#04101E;";
  },[]);
  if(!loggedIn) return <Login onLogin={()=>setLoggedIn(true)}/>;
  return (
    <div style={{display:"flex",background:T.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <Sidebar active={screen} setActive={setScreen} role={role} setRole={setRole}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <Header screen={screen}/>
        {screen==="dashboard"    && <Dashboard role={role}/>}
        {screen==="transactions" && <Transactions/>}
        {screen==="wallets"      && <Wallets/>}
        {screen==="compliance"   && <Compliance/>}
        {screen==="trade"        && <TradeFinance/>}
      </div>
    </div>
  );
}
