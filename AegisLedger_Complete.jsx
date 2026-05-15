import { useState, useEffect, useRef } from "react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── THEME ────────────────────────────────────────────────────────
const T = {
  bg: "#04101E", sidebar: "#060F1C", card: "#0A1828", cardHover: "#0D1F35",
  border: "#112235", accent: "#00E5B0", accentGlow: "#00E5B012",
  gold: "#F0B429", red: "#F04438", blue: "#4A8FE2", purple: "#8B5CF6",
  text: "#E2EAF4", muted: "#4A6A88", dim: "#1A3050", white: "#FFFFFF",
};

// ─── DASHBOARD MOCK DATA ──────────────────────────────────────────
const volumeData = [
  {m:"Jan",vol:12.4},{m:"Feb",vol:18.2},{m:"Mar",vol:15.8},
  {m:"Apr",vol:24.6},{m:"May",vol:31.2},{m:"Jun",vol:28.9},
  {m:"Jul",vol:38.4},{m:"Aug",vol:44.1},{m:"Sep",vol:41.7},
  {m:"Oct",vol:52.3},{m:"Nov",vol:48.9},{m:"Dec",vol:61.8},
];
const rateData = [
  {t:"00:00",r:3.674},{t:"04:00",r:3.671},{t:"08:00",r:3.678},
  {t:"12:00",r:3.682},{t:"16:00",r:3.676},{t:"20:00",r:3.679},{t:"24:00",r:3.681},
];
const txList = [
  {id:"TXN-2024-0847",from:"Rosneft Trading SA",to:"Gulf Petrochem FZE",amount:"4,250,000",currency:"USDC",status:"settled",time:"2m ago",flag:false,hash:"0x7f3a...4b2c",network:"Ethereum",fee:"$0.42",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0846",from:"PhosAgro PJSC",to:"Emirates Fertilizers",amount:"1,890,000",currency:"AE Coin",status:"pending",time:"8m ago",flag:false,hash:"0x2d1e...9f4a",network:"ADX Chain",fee:"$0.08",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0845",from:"Mechel PAO",to:"Dubal Holding",amount:"7,100,000",currency:"USDT",status:"flagged",time:"14m ago",flag:true,hash:"0xb3c7...1e8d",network:"Polygon",fee:"$0.12",fatf:"WARN",sanctions:"WARN"},
  {id:"TXN-2024-0844",from:"NLMK Group",to:"Emirates Steel",amount:"3,420,000",currency:"USDC",status:"settled",time:"31m ago",flag:false,hash:"0x9a2f...6c3b",network:"Ethereum",fee:"$0.38",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0843",from:"Norilsk Nickel",to:"DMCC Metals Hub",amount:"12,750,000",currency:"USDC",status:"settled",time:"47m ago",flag:false,hash:"0x4e8d...2a1f",network:"Ethereum",fee:"$0.91",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0842",from:"Severstal PAO",to:"Conares Metal Group",amount:"2,180,000",currency:"USDT",status:"processing",time:"1h ago",flag:false,hash:"0x6c4b...8d9e",network:"Polygon",fee:"$0.09",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0841",from:"TMK Group",to:"Stainless Steel FZE",amount:"5,640,000",currency:"AE Coin",status:"settled",time:"2h ago",flag:false,hash:"0x1b7e...3f5a",network:"ADX Chain",fee:"$0.21",fatf:"OK",sanctions:"OK"},
  {id:"TXN-2024-0840",from:"Gazprom Neft",to:"ADNOC Trading",amount:"18,200,000",currency:"USDC",status:"settled",time:"3h ago",flag:false,hash:"0x8d3c...5e7b",network:"Ethereum",fee:"$1.24",fatf:"OK",sanctions:"OK"},
];
const wallets = [
  {currency:"USDC",network:"Ethereum",balance:"24,847,320.00",change:"+2.4%",addr:"0x4A9f...3C2E",label:"USDC",color:"#2775CA"},
  {currency:"USDT",network:"Polygon",balance:"18,234,180.50",change:"+0.8%",addr:"0x8B3d...7F1A",label:"USDT",color:"#26A17B"},
  {currency:"AE Coin",network:"ADX Blockchain",balance:"6,412,750.00",change:"+1.2%",addr:"ae1q3...9p2k",label:"AEC",color:T.accent},
];
const kybQueue = [
  {company:"Urals Energy Group",country:"Russia",type:"Energy / Commodities",submitted:"2 days ago",risk:"medium",status:"review",ubo:"3 directors",revenue:"4.2B RUB"},
  {company:"Trans-Caspian Logistics",country:"UAE",type:"Freight / Logistics",submitted:"3 days ago",risk:"low",status:"pending",ubo:"1 director",revenue:"890M AED"},
  {company:"Siberian Grain Holdings",country:"Russia",type:"Agricultural",submitted:"5 days ago",risk:"high",status:"escalated",ubo:"7 directors",revenue:"1.1B RUB"},
  {company:"Dubai Metals & Commodities",country:"UAE",type:"Metals Trading",submitted:"1 week ago",risk:"low",status:"approved",ubo:"2 directors",revenue:"2.4B AED"},
  {company:"Polyus Gold PJSC",country:"Russia",type:"Mining",submitted:"2 weeks ago",risk:"medium",status:"review",ubo:"4 directors",revenue:"7.8B RUB"},
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
  admin:      [{id:"dashboard",icon:"grid",l:"Dashboard"},{id:"transactions",icon:"swap",l:"All Transactions"},{id:"wallets",icon:"vault",l:"Wallets"},{id:"compliance",icon:"flag",l:"Compliance"},{id:"trade",icon:"menu",l:"Trade Finance"}],
  treasury:   [{id:"dashboard",icon:"grid",l:"Dashboard"},{id:"transactions",icon:"swap",l:"Settlements"},{id:"wallets",icon:"vault",l:"Wallets"},{id:"trade",icon:"menu",l:"Trade Finance"}],
  compliance: [{id:"dashboard",icon:"grid",l:"Dashboard"},{id:"compliance",icon:"flag",l:"Compliance Center"},{id:"transactions",icon:"swap",l:"Transactions"}],
  operator:   [{id:"dashboard",icon:"grid",l:"Dashboard"},{id:"transactions",icon:"swap",l:"Payments"},{id:"trade",icon:"menu",l:"Documents"}],
  logistics:  [{id:"dashboard",icon:"grid",l:"Dashboard"},{id:"trade",icon:"menu",l:"Shipments"}],
};
const roleLabels = {admin:"Super Administrator",treasury:"Treasury Manager",compliance:"Compliance Officer",operator:"Corporate Operator",logistics:"Logistics Agent"};

// ─── SIGNUP DATA ──────────────────────────────────────────────────
const BANNED_COUNTRIES = ["Afghanistan","Algeria","Bangladesh","China","Egypt","Iraq","Kuwait","Nepal","North Macedonia","Tunisia","Morocco"];
const LEGAL_COUNTRIES  = ["United Arab Emirates","United States","United Kingdom","Germany","France","Singapore","Japan","Australia","Switzerland","Canada","Portugal","Malta","South Korea","Brazil","Vietnam","South Africa","New Zealand","Netherlands","Sweden","Norway"];
const ALL_COUNTRIES = [...new Set([
  ...BANNED_COUNTRIES,...LEGAL_COUNTRIES,
  "Russia","India","Turkey","Indonesia","Saudi Arabia","Qatar","Nigeria","Pakistan",
  "Ukraine","Poland","Italy","Spain","Mexico","Argentina","Thailand","Malaysia",
  "Philippines","Israel","Kenya","Ghana","Jordan","Bahrain","Oman",
])].sort();

const STABLECOINS = [
  {id:"USDC_ETH",  label:"USDC",    network:"Ethereum",  badge:"USD", desc:"USD Coin · Circle · $1 peg"},
  {id:"USDT_POLY", label:"USDT",    network:"Polygon",   badge:"TT",  desc:"Tether · Polygon · $1 peg"},
  {id:"AE_COIN",   label:"AE Coin", network:"ADX Chain", badge:"AE",  desc:"AED-backed · CBUAE regulated"},
  {id:"USDC_SOL",  label:"USDC",    network:"Solana",    badge:"SOL", desc:"USD Coin · Solana · Low fees"},
];
const FIAT_CURRENCIES = [
  {id:"RUB",label:"Russian Ruble",  symbol:"RUB"},
  {id:"AED",label:"UAE Dirham",     symbol:"AED"},
  {id:"USD",label:"US Dollar",      symbol:"USD"},
  {id:"EUR",label:"Euro",           symbol:"EUR"},
  {id:"GBP",label:"British Pound",  symbol:"GBP"},
  {id:"CNH",label:"Chinese Yuan",   symbol:"CNH"},
];
const DOC_TYPES = [
  {id:"cert_inc",  label:"Certificate of Incorporation", badge:"INC", required:true},
  {id:"trade_lic", label:"Trade License",                badge:"LIC", required:true},
  {id:"ubo_decl",  label:"UBO Declaration",              badge:"UBO", required:true},
  {id:"bank_stmt", label:"Bank Statement (3 months)",    badge:"BNK", required:true},
  {id:"passport",  label:"Director Passport / ID",       badge:"ID",  required:true},
  {id:"utility",   label:"Proof of Address",             badge:"ADR", required:false},
];
const MOCK_OCR = {
  cert_inc:  {extracted:{"Company Name":"Rosneft Trading SA","Reg. Number":"1023501049274","Jurisdiction":"Russian Federation","Incorporation Date":"12 Mar 2003"},confidence:96},
  trade_lic: {extracted:{"License No":"DMCC-123456","Activity":"Commodity Trading","Expiry":"31 Dec 2026","Issuer":"DMCC Authority"},confidence:94},
  ubo_decl:  {extracted:{"UBO Name":"Alexei Petrov","Ownership":"67.4%","Nationality":"Russian","DOB":"15 Jun 1971"},confidence:91},
  bank_stmt: {extracted:{"Bank":"VTB Bank","Account":"40702810...4521","Balance":"847,200,000 RUB","Period":"Oct-Dec 2024"},confidence:98},
  passport:  {extracted:{"Full Name":"Alexei Petrov","Passport No":"724816392","Nationality":"Russian","Expiry":"22 Aug 2029"},confidence:97},
  utility:   {extracted:{"Name":"Rosneft Trading SA","Address":"Moscow, Sofiyskaya Emb 26/1","Date":"Nov 2024"},confidence:88},
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────
const Badge = ({s}) => {
  const map = {
    settled:     {bg:"#00E5B015",c:"#00E5B0",t:"Settled"},
    pending:     {bg:"#4A8FE215",c:"#4A8FE2",t:"Pending"},
    flagged:     {bg:"#F0443815",c:"#F04438",t:"Flagged"},
    processing:  {bg:"#F0B42915",c:"#F0B429",t:"Processing"},
    releasing:   {bg:"#00E5B015",c:"#00E5B0",t:"Releasing"},
    awaiting_bol:{bg:"#F0B42915",c:"#F0B429",t:"Awaiting BoL"},
    doc_review:  {bg:"#4A8FE215",c:"#4A8FE2",t:"Doc Review"},
    review:      {bg:"#F0B42915",c:"#F0B429",t:"In Review"},
    escalated:   {bg:"#F0443815",c:"#F04438",t:"Escalated"},
    approved:    {bg:"#00E5B015",c:"#00E5B0",t:"Approved"},
    critical:    {bg:"#F0443825",c:"#F04438",t:"Critical"},
    high:        {bg:"#F0B42920",c:"#F0B429",t:"High"},
    medium:      {bg:"#4A8FE215",c:"#4A8FE2",t:"Medium"},
    low:         {bg:"#00E5B015",c:"#00E5B0",t:"Low"},
  };
  const st = map[s]||{bg:T.dim+"30",c:T.muted,t:s};
  return <span style={{background:st.bg,color:st.c,padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,letterSpacing:"0.6px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{st.t}</span>;
};

const Stat = ({label,value,sub,icon,pos,neg}) => (
  <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 20px",flex:1,minWidth:0}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
      <span style={{color:T.muted,fontSize:10,letterSpacing:"0.8px",textTransform:"uppercase",fontWeight:600}}>{label}</span>
      <span style={{background:T.dim,color:T.muted,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,letterSpacing:"0.5px"}}>{icon}</span>
    </div>
    <div style={{color:T.text,fontSize:22,fontWeight:700,fontFamily:"'Courier New',monospace",letterSpacing:"-0.5px"}}>{value}</div>
    {sub && <div style={{marginTop:5,fontSize:11,color:pos?T.accent:neg?T.red:T.muted}}>{sub}</div>}
    <div style={{marginTop:10,height:2,background:`linear-gradient(90deg,${pos?T.accent:neg?T.red:T.muted}60,transparent)`,borderRadius:1}}/>
  </div>
);

const Tag = ({children,color=T.accent}) => (
  <span style={{background:`${color}15`,color,border:`1px solid ${color}30`,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>
    {children}
  </span>
);

// Signup-specific shared components
const SInput = ({label,value,onChange,type="text",placeholder="",required=false,hint=""}) => (
  <div style={{marginBottom:14}}>
    <label style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
      <span style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>
        {label}{required && <span style={{color:T.red}}> *</span>}
      </span>
      {hint && <span style={{color:T.dim,fontSize:10}}>{hint}</span>}
    </label>
    <input value={value} onChange={e=>onChange(e.target.value)} type={type} placeholder={placeholder}
      style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:T.text,
        padding:"10px 12px",borderRadius:7,fontSize:12,boxSizing:"border-box",outline:"none",transition:"border-color 0.2s"}}
      onFocus={e=>e.target.style.borderColor=T.accent}
      onBlur={e=>e.target.style.borderColor=T.border}
    />
  </div>
);

const SSelect = ({label,value,onChange,options,required=false}) => (
  <div style={{marginBottom:14}}>
    <label style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600,display:"block",marginBottom:5}}>
      {label}{required && <span style={{color:T.red}}> *</span>}
    </label>
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:value?T.text:T.muted,
        padding:"10px 12px",borderRadius:7,fontSize:12,outline:"none",cursor:"pointer"}}>
      <option value="">Select {label}...</option>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);

const Btn = ({children,onClick,variant="primary",disabled=false,fullWidth=false,small=false}) => {
  const styles = {
    primary:   {background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none"},
    secondary: {background:"transparent",color:T.muted,border:`1px solid ${T.border}`},
    danger:    {background:"#F0443815",color:T.red,border:`1px solid ${T.red}30`},
    gold:      {background:`linear-gradient(135deg,${T.gold},#E07B00)`,color:T.bg,border:"none"},
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{...styles[variant],borderRadius:8,padding:small?"6px 14px":"11px 20px",
        cursor:disabled?"not-allowed":"pointer",fontSize:small?10:12,fontWeight:700,
        letterSpacing:"0.4px",opacity:disabled?0.5:1,width:fullWidth?"100%":"auto",transition:"opacity 0.2s"}}>
      {children}
    </button>
  );
};

const StepDot = ({n,current,done}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
    <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:11,fontWeight:700,
      background:done?T.accent:current?T.accentGlow:T.dim+"80",
      border:`2px solid ${done?T.accent:current?T.accent:T.dim}`,
      color:done?T.bg:current?T.accent:T.muted,
      boxShadow:current?`0 0 12px ${T.accent}60`:"none",transition:"all 0.3s"}}>
      {done?"done":n}
    </div>
  </div>
);

// ─── SIDEBAR ──────────────────────────────────────────────────────
function Sidebar({active,setActive,role,setRole}) {
  const items = navMap[role]||navMap.admin;
  return (
    <div style={{width:210,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
      <div style={{padding:"20px 16px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,background:`linear-gradient(135deg,${T.accent},#0077BB)`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,color:T.bg,fontWeight:700}}>A</div>
          <div>
            <div style={{color:T.text,fontWeight:700,fontSize:14,letterSpacing:"0.3px"}}>AegisLedger</div>
            <div style={{color:T.muted,fontSize:9,letterSpacing:"1.2px",textTransform:"uppercase"}}>B2B Settlement</div>
          </div>
        </div>
      </div>
      <div style={{padding:"10px 10px 0"}}>
        <div style={{fontSize:9,color:T.muted,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:5,paddingLeft:8}}>Demo Role</div>
        <select value={role} onChange={e=>setRole(e.target.value)}
          style={{width:"100%",background:T.card,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11,cursor:"pointer",outline:"none"}}>
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
            fontSize:12,fontWeight:active===item.id?600:400,marginBottom:2,transition:"all 0.12s"}}>
            <span style={{fontSize:13,width:16,textAlign:"center"}}>{item.icon}</span>{item.l}
          </button>
        ))}
      </nav>
      <div style={{padding:"14px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${T.dim},#0A1E35)`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.accent,fontWeight:700,
            border:`1px solid ${T.border}`,flexShrink:0}}>
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
        <div style={{color:T.muted,fontSize:10}}>RUB to AED Cross-Border Settlement Gateway · VARA Licensed</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,padding:"4px 10px",borderRadius:20}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:T.accent,display:"inline-block",boxShadow:`0 0 6px ${T.accent}`}}/>
          <span style={{color:T.accent,fontSize:10,fontWeight:700}}>LIVE</span>
        </div>
        <div style={{color:T.muted,fontSize:10,fontFamily:"monospace"}}>UTC+4 {time}</div>
        <div style={{position:"relative",cursor:"pointer"}}>
          <div style={{width:30,height:30,background:T.card,border:`1px solid ${T.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.muted,fontWeight:700}}>N</div>
          <div style={{position:"absolute",top:-4,right:-4,width:14,height:14,background:T.red,borderRadius:"50%",fontSize:8,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>3</div>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
function Dashboard() {
  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20}}>
        <Stat label="Total Settled (30d)" value="$418.7M" sub="+ 24.3% vs last month" icon="VOL" pos/>
        <Stat label="Active Settlements"  value="247"     sub="+ 18 in last hour"       icon="TX"  pos/>
        <Stat label="Avg Settlement Time" value="18.4s"   sub="- 3.1s faster than target" icon="SPD" pos/>
        <Stat label="Compliance Rate"     value="99.97%"  sub="3 flags need review"     icon="SEC" pos/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:20}}>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <div style={{color:T.text,fontWeight:600,fontSize:12}}>Settlement Volume — RUB to AED Corridor</div>
              <div style={{color:T.muted,fontSize:10}}>Monthly USD billions · 2024</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              {["1M","3M","1Y"].map(l=>(
                <button key={l} style={{background:l==="1Y"?T.accentGlow:"transparent",color:l==="1Y"?T.accent:T.muted,
                  border:`1px solid ${l==="1Y"?T.accent+"30":T.border}`,padding:"2px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:600}}>{l}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={volumeData}>
              <defs>
                <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={T.accent} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={T.accent} stopOpacity={0}/>
                </linearGradient>
              </defs>
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
          <span style={{color:T.accent,fontSize:11,cursor:"pointer"}}>View all -></span>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>{["TX ID","From","To","Amount","Asset","Status","Time"].map(h=>(
              <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",paddingBottom:8,borderBottom:`1px solid ${T.border}`,fontWeight:600}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>{txList.slice(0,5).map(tx=>(
            <tr key={tx.id} style={{borderBottom:`1px solid ${T.border}20`}}>
              <td style={{padding:"9px 0",color:T.accent,fontSize:10,fontFamily:"monospace",fontWeight:600}}>{tx.flag?"[!] ":""}{tx.id}</td>
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
              padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>
              {f==="all"?"All Transactions":f}
            </button>
          ))}
          <div style={{flex:1}}/>
          <input placeholder="Search by ID, entity, hash..." style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"5px 12px",borderRadius:7,fontSize:10,width:240,outline:"none"}}/>
        </div>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
            <thead>
              <tr style={{background:T.sidebar}}>
                {["TX ID","Originator","Beneficiary","Amount","Asset","Status","Time"].map(h=>(
                  <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{filtered.map(tx=>(
              <tr key={tx.id} onClick={()=>setSel(sel?.id===tx.id?null:tx)}
                style={{borderBottom:`1px solid ${T.border}20`,cursor:"pointer",background:sel?.id===tx.id?T.accentGlow:"transparent",transition:"background 0.1s"}}>
                <td style={{padding:"10px 14px",color:T.accent,fontSize:10,fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap"}}>{tx.flag?"[!] ":""}{tx.id}</td>
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
            <button onClick={()=>setSel(null)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1}}>x</button>
          </div>
          <Badge s={sel.status}/>
          <div style={{marginTop:14}}>
            {[["TX ID",sel.id],["From",sel.from],["To",sel.to],["Amount","$"+sel.amount],["Asset",sel.currency],
              ["Network",sel.network],["Hash",sel.hash],["Time",sel.time],["Settlement","18.4 seconds"],
              ["Gas Fee",sel.fee],["FATF Rule",sel.fatf+" Compliant"],["Sanctions",sel.sanctions+" Clear"]
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}20`}}>
                <span style={{color:T.muted,fontSize:10,flexShrink:0,marginRight:8}}>{k}</span>
                <span style={{color:T.text,fontSize:10,fontFamily:["TX ID","Hash"].includes(k)?"monospace":"inherit",textAlign:"right",wordBreak:"break-all"}}>{v}</span>
              </div>
            ))}
          </div>
          {sel.flag && (
            <div style={{marginTop:14,background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:8,padding:"12px"}}>
              <div style={{color:T.red,fontWeight:700,fontSize:11,marginBottom:6}}>[!] Compliance Flag Active</div>
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
              <span style={{background:T.dim,color:w.color,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:5}}>{w.label}</span>
              <Badge s="approved"/>
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
              {[
                {type:"Received",amount:"+4,250,000",asset:"USDC",cp:"Rosneft Trading SA",time:"2m ago",s:"settled"},
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
          {[
            ["Custody Type","Fireblocks MPC"],["Key Threshold","3-of-5 Shards"],
            ["Encryption","AES-256 at rest"],["Transport","TLS 1.3"],
            ["Standard","SOC 2 Type II"],["Insurance","$100M coverage"],
            ["Smart Contract Audit","Passed Jan 2026"],["Last Pentest","Feb 2026"],
          ].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}20`}}>
              <span style={{color:T.muted,fontSize:10}}>{l}</span>
              <span style={{color:T.accent,fontSize:10,fontWeight:600}}>{v}</span>
            </div>
          ))}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:14}}>
            <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:11,fontWeight:600}}>+ Initiate On-Ramp (RUB/AED)</button>
            <button style={{background:"transparent",color:T.muted,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px",cursor:"pointer",fontSize:11}}>Request Off-Ramp</button>
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
        <Stat label="KYB Pending"              value="14"     sub="4 require escalation"          icon="KYB" neg/>
        <Stat label="AML Alerts"               value="3"      sub="1 critical — immediate action" icon="AML" neg/>
        <Stat label="Sanctions Screens Today"  value="2,847"  sub="All clear — 0 hard blocks"     icon="SCN" pos/>
        <Stat label="FATF Compliance"          value="99.97%" sub="Travel Rule enforced"           icon="LAW" pos/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[{id:"kyb",l:"KYB Queue"},{id:"aml",l:"AML Alerts"},{id:"sanctions",l:"Sanctions Engine"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,
            border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,
            padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>
      {tab==="kyb" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
            <thead>
              <tr style={{background:T.sidebar}}>
                {["Company","Country","Sector","UBOs","Revenue","Submitted","Risk","Status","Actions"].map(h=>(
                  <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
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
            {[
              {l:"OFAC SDN",m:0,t:"2 min ago"},{l:"UN Security Council",m:0,t:"2 min ago"},
              {l:"EU Consolidated",m:0,t:"5 min ago"},{l:"UK HMT Sanctions",m:0,t:"5 min ago"},
              {l:"Rosfinmonitoring",m:0,t:"10 min ago"},{l:"VARA Watchlist",m:1,t:"14 min ago"},
            ].map(s=>(
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
        <Stat label="Active Escrows"    value="23"    sub="$47.2M locked in smart contracts" icon="ESC"/>
        <Stat label="Pending BoL"       value="$12.8M" sub="3 contracts awaiting docs"       icon="BOL" pos/>
        <Stat label="Released Today"    value="$28.4M" sub="12 contracts settled"            icon="REL" pos/>
        <Stat label="Disputed"          value="1"      sub="Arbitration in progress"          icon="DIS" neg/>
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
                <div style={{color:T.muted,fontSize:11,marginTop:2}}>{e.buyer} -> {e.seller}</div>
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
              {e.progress<100
                ? <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Upload Document</button>
                : <button style={{background:T.accent,color:T.bg,border:"none",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>Release Funds</button>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 1: COMPANY DETAILS ───────────────────────────────
function SignupStep1({data,setData,onNext}) {
  const [errors,setErrors] = useState({});
  const validate = () => {
    const e = {};
    if (!data.companyName) e.companyName = "Required";
    if (!data.regNumber)   e.regNumber   = "Required";
    if (!data.country)     e.country     = "Required";
    if (!data.email || !data.email.includes("@")) e.email = "Valid corporate email required";
    if (!data.phone)       e.phone       = "Required";
    if (!data.revenue)     e.revenue     = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const isBanned = BANNED_COUNTRIES.includes(data.country);
  return (
    <div>
      <div style={{marginBottom:22}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Company Information</div>
        <div style={{color:T.muted,fontSize:12}}>All fields marked * are required by VARA KYB regulations.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <div style={{gridColumn:"1/-1"}}>
          <SInput label="Legal Company Name" value={data.companyName} onChange={v=>setData({...data,companyName:v})} required placeholder="e.g. Rosneft Trading SA"/>
        </div>
        <SInput label="Registration Number" value={data.regNumber} onChange={v=>setData({...data,regNumber:v})} required placeholder="e.g. 1023501049274"/>
        <SInput label="VAT / Tax ID" value={data.vatId||""} onChange={v=>setData({...data,vatId:v})} placeholder="Optional"/>
        <div style={{gridColumn:"1/-1"}}>
          <SSelect label="Country of Incorporation" value={data.country} onChange={v=>setData({...data,country:v})} options={ALL_COUNTRIES} required/>
        </div>
        {isBanned && (
          <div style={{gridColumn:"1/-1",background:"#F0B42912",border:`1px solid ${T.gold}40`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
            <div style={{color:T.gold,fontWeight:700,fontSize:12,marginBottom:4}}>Restricted Jurisdiction Detected</div>
            <div style={{color:T.text,fontSize:11,lineHeight:1.6}}>
              <strong>{data.country}</strong> restricts cryptocurrency activities. You may still register, but you will need to provide a bank account in a crypto-legal country in a later step.
            </div>
          </div>
        )}
        <SSelect label="Industry / Sector" value={data.sector||""} onChange={v=>setData({...data,sector:v})} required
          options={["Energy / Oil & Gas","Metals & Mining","Agricultural Commodities","Manufacturing","Freight & Logistics","Financial Services","Technology","Real Estate","Other"]}/>
        <SSelect label="Annual Revenue (USD)" value={data.revenue||""} onChange={v=>setData({...data,revenue:v})} required
          options={[{value:"<1M",label:"Under $1M"},{value:"1-10M",label:"$1M - $10M"},{value:"10-50M",label:"$10M - $50M"},{value:"50-200M",label:"$50M - $200M"},{value:"200M+",label:"Over $200M"}]}/>
        <SInput label="Corporate Email" value={data.email||""} onChange={v=>setData({...data,email:v})} type="email" required placeholder="treasury@yourcompany.com"/>
        <SInput label="Phone Number" value={data.phone||""} onChange={v=>setData({...data,phone:v})} placeholder="+7 495 000 0000" required/>
        <div style={{gridColumn:"1/-1"}}>
          <SInput label="Registered Address" value={data.address||""} onChange={v=>setData({...data,address:v})} required placeholder="Full legal address"/>
        </div>
      </div>
      {Object.keys(errors).length>0 && (
        <div style={{background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:7,padding:"10px 12px",marginBottom:14}}>
          <div style={{color:T.red,fontSize:11}}>Please fill in: {Object.keys(errors).join(", ")}</div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
        <Btn onClick={()=>{ if(validate()) onNext(); }}>Continue -></Btn>
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 2: EMAIL OTP ──────────────────────────────────────
function SignupStep2({email,onNext,onBack}) {
  const [otp,setOtp]           = useState(["","","","","",""]);
  const [timer,setTimer]       = useState(600);
  const [attempts,setAttempts] = useState(0);
  const [locked,setLocked]     = useState(false);
  const [error,setError]       = useState("");
  const [verified,setVerified] = useState(false);
  const inputRefs = useRef([]);
  const MAX_ATTEMPTS = 5;
  const CORRECT_OTP  = "482916";

  useEffect(()=>{
    const interval = setInterval(()=>setTimer(t=>{if(t<=1){clearInterval(interval);return 0;}return t-1;}),1000);
    return ()=>clearInterval(interval);
  },[]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const handleDigit = (i,val) => {
    if (!/^\d?$/.test(val)) return;
    const next=[...otp]; next[i]=val; setOtp(next);
    if (val && i<5) inputRefs.current[i+1]?.focus();
  };
  const handleKey = (i,e) => {
    if (e.key==="Backspace" && !otp[i] && i>0) inputRefs.current[i-1]?.focus();
    if (e.key==="ArrowLeft"  && i>0) inputRefs.current[i-1]?.focus();
    if (e.key==="ArrowRight" && i<5) inputRefs.current[i+1]?.focus();
  };
  const handlePaste = e => {
    const p=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6).split("");
    if (p.length===6){setOtp(p);inputRefs.current[5]?.focus();}
    e.preventDefault();
  };
  const verify = () => {
    if (locked) return;
    const code=otp.join("");
    if (code.length<6){setError("Please enter all 6 digits.");return;}
    const na=attempts+1; setAttempts(na);
    if (code===CORRECT_OTP){
      setVerified(true);setError("");
      setTimeout(()=>onNext(),1200);
    } else {
      if (na>=MAX_ATTEMPTS){setLocked(true);setError("Too many attempts. Account locked for 30 minutes.");}
      else {setError(`Incorrect code. ${MAX_ATTEMPTS-na} attempt${MAX_ATTEMPTS-na===1?"":"s"} remaining.`);}
      setOtp(["","","","","",""]);
      inputRefs.current[0]?.focus();
    }
  };
  const resend = () => {setTimer(600);setAttempts(0);setLocked(false);setError("");setOtp(["","","","","",""]);};

  return (
    <div>
      <div style={{marginBottom:22}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Verify Your Email</div>
        <div style={{color:T.muted,fontSize:12}}>A 6-digit code was sent to <span style={{color:T.accent,fontWeight:600}}>{email}</span>.</div>
      </div>
      <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:10,padding:"20px",marginBottom:20,textAlign:"center"}}>
        <div style={{color:T.muted,fontSize:10,letterSpacing:"1px",textTransform:"uppercase",marginBottom:4}}>Demo code</div>
        <div style={{color:T.accent,fontFamily:"monospace",fontSize:28,fontWeight:700,letterSpacing:"12px"}}>482916</div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:18}}>
        {otp.map((d,i)=>(
          <input key={i} ref={el=>inputRefs.current[i]=el}
            value={d} onChange={e=>handleDigit(i,e.target.value)}
            onKeyDown={e=>handleKey(i,e)} onPaste={handlePaste} maxLength={1} type="text" inputMode="numeric"
            style={{width:46,height:56,textAlign:"center",fontSize:24,fontWeight:700,fontFamily:"monospace",
              background:verified?"#00E5B015":d?T.card:T.sidebar,
              border:`2px solid ${verified?T.accent:d?T.blue:T.border}`,
              color:verified?T.accent:T.text,borderRadius:10,outline:"none",
              boxShadow:d?`0 0 8px ${T.blue}30`:"none",transition:"all 0.15s"}}/>
        ))}
      </div>
      <div style={{textAlign:"center",marginBottom:14}}>
        {verified
          ? <div style={{color:T.accent,fontWeight:700,fontSize:14}}>done Email verified successfully!</div>
          : timer>0
            ? <div style={{color:T.muted,fontSize:11}}>Code expires in <span style={{color:timer<60?T.red:T.gold,fontFamily:"monospace",fontWeight:700}}>{fmt(timer)}</span></div>
            : <div style={{color:T.red,fontSize:11}}>Code expired. <span onClick={resend} style={{color:T.accent,cursor:"pointer",fontWeight:600}}>Send new code -></span></div>
        }
      </div>
      {attempts>0 && !verified && (
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:12}}>
          {Array.from({length:MAX_ATTEMPTS}).map((_,i)=>(
            <div key={i} style={{width:8,height:8,borderRadius:"50%",background:i<attempts?T.red:T.dim,transition:"background 0.2s"}}/>
          ))}
        </div>
      )}
      {error && <div style={{background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:7,padding:"9px 12px",marginBottom:12,color:T.red,fontSize:11,textAlign:"center"}}>{error}</div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <Btn variant="secondary" onClick={onBack}><- Back</Btn>
        <div style={{display:"flex",gap:10}}>
          {timer===0 && !locked && <Btn variant="secondary" onClick={resend} small>Resend Code</Btn>}
          <Btn onClick={verify} disabled={locked||otp.join("").length<6||verified||timer===0}>Verify Email -></Btn>
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 3: DOCUMENTS ──────────────────────────────────────
function SignupStep3({country,onNext,onBack}) {
  const [uploads,setUploads]   = useState({});
  const [scanning,setScanning] = useState({});
  const [results,setResults]   = useState({});
  const [previewDoc,setPreview] = useState(null);

  const simulateUpload = docId => {
    setUploads(u=>({...u,[docId]:{name:`${docId}_document.pdf`,size:"2.4 MB",status:"uploading"}}));
    setTimeout(()=>{
      setUploads(u=>({...u,[docId]:{...u[docId],status:"uploaded"}}));
      setScanning(s=>({...s,[docId]:true}));
      setTimeout(()=>{
        setScanning(s=>({...s,[docId]:false}));
        setResults(r=>({...r,[docId]:MOCK_OCR[docId]||{extracted:{},confidence:85}}));
      },2000+Math.random()*1500);
    },1000);
  };

  const requiredDocs = DOC_TYPES.filter(d=>d.required);
  const allRequired  = requiredDocs.every(d=>results[d.id]);
  const score = Math.round((Object.keys(results).length/DOC_TYPES.length)*100);

  return (
    <div>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Document Verification</div>
        <div style={{color:T.muted,fontSize:12,lineHeight:1.6}}>
          Upload official corporate documents. The system uses <Tag>AI OCR</Tag> to auto-extract data, followed by <Tag color={T.blue}>Manual Review</Tag> and <Tag color={T.purple}>Sumsub API</Tag> verification.
        </div>
      </div>
      <div style={{background:T.sidebar,borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:T.muted,fontSize:10}}>Verification completeness</span>
            <span style={{color:T.accent,fontSize:10,fontWeight:700}}>{Object.keys(results).length}/{DOC_TYPES.length} docs</span>
          </div>
          <div style={{background:T.dim,borderRadius:4,height:4}}>
            <div style={{width:`${score}%`,height:"100%",background:`linear-gradient(90deg,${T.accent},${T.blue})`,borderRadius:4,transition:"width 0.4s"}}/>
          </div>
        </div>
        <div style={{color:allRequired?T.accent:T.gold,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
          {allRequired?"Required docs met":"Required docs missing"}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {DOC_TYPES.map(doc=>{
          const uploaded  = uploads[doc.id];
          const isScanning = scanning[doc.id];
          const result    = results[doc.id];
          return (
            <div key={doc.id} style={{background:T.sidebar,border:`1px solid ${result?T.accent+"40":T.border}`,borderRadius:10,padding:"14px 16px",transition:"border-color 0.3s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{background:T.dim,color:T.muted,fontSize:9,fontWeight:700,padding:"3px 7px",borderRadius:4,letterSpacing:"0.5px"}}>{doc.badge}</span>
                  <div>
                    <div style={{color:T.text,fontSize:12,fontWeight:600}}>
                      {doc.label} {doc.required && <span style={{color:T.red,fontSize:10}}>*</span>}
                    </div>
                    {uploaded && <div style={{color:T.muted,fontSize:10,marginTop:2}}>{uploaded.name} · {uploaded.size}</div>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {result    && <Tag>Extracted</Tag>}
                  {isScanning && <div style={{color:T.gold,fontSize:10}}>Scanning...</div>}
                  {!uploaded && !isScanning && (
                    <button onClick={()=>simulateUpload(doc.id)}
                      style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>
                      Upload
                    </button>
                  )}
                  {uploaded && !result && !isScanning && <Tag color={T.gold}>Scanning...</Tag>}
                  {result && (
                    <button onClick={()=>setPreview(previewDoc===doc.id?null:doc.id)}
                      style={{background:"transparent",color:T.blue,border:`1px solid ${T.blue}30`,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontSize:10}}>
                      {previewDoc===doc.id?"Hide":"View"}
                    </button>
                  )}
                </div>
              </div>
              {result && previewDoc===doc.id && (
                <div style={{marginTop:12,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                    <div style={{color:T.text,fontSize:11,fontWeight:600}}>AI OCR Extraction Results</div>
                    <div style={{display:"flex",gap:6}}>
                      <Tag color={T.accent}>Confidence: {result.confidence}%</Tag>
                      <Tag color={T.blue}>Sumsub: Queued</Tag>
                      <Tag color={T.gold}>Manual Review: Pending</Tag>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {Object.entries(result.extracted).map(([k,v])=>(
                      <div key={k} style={{background:T.sidebar,borderRadius:6,padding:"7px 10px"}}>
                        <div style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.5px"}}>{k}</div>
                        <div style={{color:T.text,fontSize:11,fontWeight:600,marginTop:2}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:10,padding:"8px 10px",background:"#F0B42908",border:`1px solid ${T.gold}30`,borderRadius:6}}>
                    <div style={{color:T.gold,fontSize:10}}>A Compliance Officer will manually verify this document within 1-2 business days before your account is activated.</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn variant="secondary" onClick={onBack}><- Back</Btn>
        <Btn onClick={onNext} disabled={!allRequired}>{allRequired?"Continue ->":"Upload required docs first"}</Btn>
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 4: BANNED COUNTRY BANK CHECK ─────────────────────
function SignupStep4({country,data,setData,onNext,onBack}) {
  const isBanned = BANNED_COUNTRIES.includes(country);
  const [errors,setErrors] = useState({});

  const validate = () => {
    if (!isBanned) return true;
    const e = {};
    if (!data.bankCountry)    e.bankCountry    = "Required";
    if (!data.bankName)       e.bankName       = "Required";
    if (!data.accountNumber)  e.accountNumber  = "Required";
    if (!data.swiftCode)      e.swiftCode      = "Required";
    if (!data.accountHolder)  e.accountHolder  = "Required";
    if (data.bankCountry && BANNED_COUNTRIES.includes(data.bankCountry)) e.bankCountry = "Bank must be in a crypto-legal country";
    setErrors(e);
    return Object.keys(e).length===0;
  };

  if (!isBanned) {
    return (
      <div>
        <div style={{textAlign:"center",padding:"30px 20px"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:T.accentGlow,border:`2px solid ${T.accent}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:14,color:T.accent,fontWeight:700}}>done</div>
          <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:8}}>Jurisdiction Check Passed</div>
          <div style={{color:T.muted,fontSize:12,lineHeight:1.7}}>
            Your country (<strong style={{color:T.accent}}>{country}</strong>) permits cryptocurrency and stablecoin operations. No additional banking verification is required at this step.
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <Btn variant="secondary" onClick={onBack}><- Back</Btn>
          <Btn onClick={onNext}>Continue -></Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{marginBottom:16}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Foreign Bank Account Required</div>
        <div style={{background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:8,padding:"12px 14px",marginBottom:14}}>
          <div style={{color:T.red,fontWeight:700,fontSize:12,marginBottom:4}}>Restricted Jurisdiction: {country}</div>
          <div style={{color:T.text,fontSize:11,lineHeight:1.6}}>
            Cryptocurrency activities are restricted in <strong>{country}</strong>. You must provide a valid bank account in a country where crypto is fully legal. This account will be used for all fiat settlements.
          </div>
        </div>
        <div style={{color:T.muted,fontSize:12}}>Accepted countries include: {LEGAL_COUNTRIES.slice(0,6).join(", ")} and others.</div>
      </div>
      <SSelect label="Bank Country" value={data.bankCountry||""} onChange={v=>setData({...data,bankCountry:v})} options={LEGAL_COUNTRIES} required/>
      {errors.bankCountry && <div style={{color:T.red,fontSize:10,marginTop:-10,marginBottom:10}}>{errors.bankCountry}</div>}
      {data.bankCountry && BANNED_COUNTRIES.includes(data.bankCountry) && (
        <div style={{background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:7,padding:"9px 12px",marginBottom:10}}>
          <div style={{color:T.red,fontSize:11}}>{data.bankCountry} is a restricted country. Please select a crypto-legal jurisdiction.</div>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <SInput label="Bank Name" value={data.bankName||""} onChange={v=>setData({...data,bankName:v})} required placeholder="e.g. Emirates NBD"/>
        <SInput label="SWIFT / BIC Code" value={data.swiftCode||""} onChange={v=>setData({...data,swiftCode:v})} required placeholder="e.g. EBILAEAD"/>
        <div style={{gridColumn:"1/-1"}}>
          <SInput label="Account Holder Name" value={data.accountHolder||""} onChange={v=>setData({...data,accountHolder:v})} required placeholder="Must match your company name"/>
        </div>
        <SInput label="Account Number / IBAN" value={data.accountNumber||""} onChange={v=>setData({...data,accountNumber:v})} required placeholder="AE070331234567890123456"/>
        <SInput label="Routing / Sort Code" value={data.routingCode||""} onChange={v=>setData({...data,routingCode:v})} placeholder="Optional"/>
      </div>
      <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 14px",marginBottom:14}}>
        <div style={{color:T.gold,fontSize:11,fontWeight:600,marginBottom:4}}>What you will need to prove</div>
        <div style={{color:T.muted,fontSize:11,lineHeight:1.7}}>
          1. Bank statement (last 3 months) showing account in your company name<br/>
          2. Proof that the account is in a crypto-legal jurisdiction<br/>
          3. Account must be corporate — not personal — to comply with KYB requirements
        </div>
      </div>
      {Object.keys(errors).length>0 && (
        <div style={{background:"#F0443812",border:`1px solid ${T.red}30`,borderRadius:7,padding:"9px 12px",marginBottom:12}}>
          <div style={{color:T.red,fontSize:11}}>Please correct: {Object.keys(errors).join(", ")}</div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn variant="secondary" onClick={onBack}><- Back</Btn>
        <Btn onClick={()=>{ if(validate()) onNext(); }}>Continue -></Btn>
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 5: PREFERENCES ────────────────────────────────────
function SignupStep5({data,setData,onNext,onBack}) {
  const toggle = (key,id) => {
    const cur = data[key]||[];
    setData({...data,[key]: cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]});
  };
  return (
    <div>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Settlement Preferences</div>
        <div style={{color:T.muted,fontSize:12}}>Choose your preferred assets and currencies. You can change these anytime from your profile.</div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600,marginBottom:10}}>Preferred Stablecoins</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {STABLECOINS.map(coin=>{
            const sel=(data.stablecoins||[]).includes(coin.id);
            return (
              <div key={coin.id} onClick={()=>toggle("stablecoins",coin.id)}
                style={{background:sel?T.accentGlow:T.sidebar,border:`1.5px solid ${sel?T.accent:T.border}`,
                  borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"all 0.15s",
                  boxShadow:sel?`0 0 12px ${T.accent}20`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{background:T.dim,color:sel?T.accent:T.muted,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4}}>{coin.badge}</span>
                  {sel && <span style={{color:T.accent,fontSize:14,fontWeight:700}}>done</span>}
                </div>
                <div style={{color:T.text,fontWeight:700,fontSize:13}}>{coin.label}</div>
                <div style={{color:T.muted,fontSize:10,marginTop:2}}>{coin.network}</div>
                <div style={{color:T.dim,fontSize:9,marginTop:3}}>{coin.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600,marginBottom:10}}>Fiat Currencies for On/Off-Ramp</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {FIAT_CURRENCIES.map(fiat=>{
            const sel=(data.fiats||[]).includes(fiat.id);
            return (
              <div key={fiat.id} onClick={()=>toggle("fiats",fiat.id)}
                style={{background:sel?`${T.gold}12`:T.sidebar,border:`1.5px solid ${sel?T.gold:T.border}`,
                  borderRadius:8,padding:"10px 12px",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}>
                <div style={{color:sel?T.gold:T.muted,fontSize:18,fontWeight:700,marginBottom:4}}>{fiat.symbol}</div>
                <div style={{color:T.text,fontSize:11,fontWeight:700}}>{fiat.id}</div>
                <div style={{color:T.muted,fontSize:9}}>{fiat.label}</div>
                {sel && <div style={{color:T.gold,fontSize:10,marginTop:3}}>Selected</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600,marginBottom:10}}>Transaction Settings</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
          <SSelect label="Default Settlement Asset" value={data.defaultAsset||""} onChange={v=>setData({...data,defaultAsset:v})}
            options={STABLECOINS.map(s=>({value:s.id,label:`${s.label} (${s.network})`}))}/>
          <SSelect label="Settlement Speed" value={data.speed||""} onChange={v=>setData({...data,speed:v})}
            options={[{value:"instant",label:"Instant (higher gas)"},{value:"standard",label:"Standard (optimized)"},{value:"batch",label:"Batch (lowest cost)"}]}/>
        </div>
        <SSelect label="Daily Transfer Limit" value={data.dailyLimit||""} onChange={v=>setData({...data,dailyLimit:v})}
          options={[{value:"1M",label:"Up to $1M"},{value:"10M",label:"Up to $10M"},{value:"50M",label:"Up to $50M"},{value:"unlimited",label:"No limit (requires enhanced KYB)"}]}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn variant="secondary" onClick={onBack}><- Back</Btn>
        <Btn onClick={onNext} disabled={!(data.stablecoins||[]).length||!(data.fiats||[]).length}>
          {!(data.stablecoins||[]).length||!(data.fiats||[]).length?"Select at least one asset + currency":"Continue ->"}
        </Btn>
      </div>
    </div>
  );
}

// ─── SIGNUP STEP 6: REVIEW & SUBMIT ───────────────────────────────
function SignupStep6({allData,onSubmit,onBack}) {
  const [agreed,setAgreed]     = useState(false);
  const [submitted,setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setSubmitted(true);
    try {
      await fetch("http://localhost:8080/api/kyb/submit",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          companyName:        allData.company.companyName,
          registrationNumber: allData.company.regNumber,
          jurisdiction:       allData.company.country,
          annualRevenue:      allData.company.revenue,
          directors:[],
          ubos:[],
          bankAccount:        allData.bank,
          preferences:        allData.prefs,
        }),
      });
    } catch(err) {
      console.log("[DEV] API not running, submission mocked:",err.message);
    }
    setTimeout(onSubmit,1800);
  };

  const {company,bank,prefs} = allData;
  const isBanned = BANNED_COUNTRIES.includes(company?.country);

  if (submitted) {
    return (
      <div style={{textAlign:"center",padding:"20px 0"}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:T.accentGlow,border:`2px solid ${T.accent}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:26,marginBottom:16,color:T.accent,fontWeight:700,boxShadow:`0 0 20px ${T.accent}40`}}>done</div>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:8}}>Application Submitted</div>
        <div style={{color:T.muted,fontSize:12,lineHeight:1.7,marginBottom:16}}>
          Your KYB application is under review. A Compliance Officer will respond within <strong style={{color:T.accent}}>1-2 business days</strong> to <span style={{color:T.accent}}>{company?.email}</span>.
        </div>
        <div style={{display:"inline-flex",gap:8,background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 20px"}}>
          <span style={{color:T.muted,fontSize:11}}>Reference ID:</span>
          <span style={{color:T.accent,fontFamily:"monospace",fontWeight:700,fontSize:11}}>KYB-2026-{Math.random().toString(36).slice(2,8).toUpperCase()}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:5}}>Review and Submit</div>
        <div style={{color:T.muted,fontSize:12}}>Please review your application before submitting.</div>
      </div>
      {[
        {title:"Company Details",items:[
          ["Company",company?.companyName],["Country",company?.country],["Sector",company?.sector],
          ["Revenue",company?.revenue],["Email",company?.email],["Registration",company?.regNumber],
        ]},
        ...(isBanned?[{title:"Foreign Bank Account",items:[
          ["Bank Country",bank?.bankCountry],["Bank Name",bank?.bankName],["SWIFT",bank?.swiftCode],
          ["Account",bank?.accountNumber?.replace(/./g,(c,i)=>i>4?"*":c)],
        ]}]:[]),
        {title:"Settlement Preferences",items:[
          ["Stablecoins",(prefs?.stablecoins||[]).join(", ")||"None selected"],
          ["Fiat Currencies",(prefs?.fiats||[]).join(", ")||"None selected"],
          ["Default Asset",prefs?.defaultAsset||"—"],["Daily Limit",prefs?.dailyLimit||"—"],
        ]},
      ].map(section=>(
        <div key={section.title} style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
          <div style={{color:T.text,fontWeight:600,fontSize:12,marginBottom:10}}>{section.title}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {section.items.map(([k,v])=>v&&(
              <div key={k} style={{display:"flex",gap:8}}>
                <span style={{color:T.muted,fontSize:10,whiteSpace:"nowrap"}}>{k}:</span>
                <span style={{color:T.text,fontSize:10,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{background:`${T.blue}10`,border:`1px solid ${T.blue}30`,borderRadius:8,padding:"12px 14px",marginBottom:14}}>
        <div style={{color:T.blue,fontWeight:700,fontSize:11,marginBottom:8}}>Verification Pipeline</div>
        <div style={{display:"flex",gap:8}}>
          {[{l:"AI OCR",c:T.accent,s:"Complete"},{l:"Sumsub API",c:T.purple,s:"Queued"},{l:"Officer Review",c:T.gold,s:"Pending"},{l:"VARA Screening",c:T.blue,s:"Pending"}].map(s=>(
            <div key={s.l} style={{flex:1,background:T.card,borderRadius:6,padding:"7px 8px",textAlign:"center"}}>
              <div style={{color:s.c,fontSize:10,fontWeight:700}}>{s.l}</div>
              <div style={{color:T.muted,fontSize:9,marginTop:2}}>{s.s}</div>
            </div>
          ))}
        </div>
      </div>
      <div onClick={()=>setAgreed(!agreed)}
        style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer",marginBottom:16,padding:"10px 12px",
          background:agreed?T.accentGlow:T.sidebar,border:`1px solid ${agreed?T.accent+"40":T.border}`,borderRadius:7,transition:"all 0.15s"}}>
        <div style={{width:16,height:16,border:`2px solid ${agreed?T.accent:T.muted}`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,background:agreed?T.accent:"transparent",transition:"all 0.15s"}}>
          {agreed && <span style={{color:T.bg,fontSize:10,fontWeight:700}}>done</span>}
        </div>
        <div style={{color:T.muted,fontSize:11,lineHeight:1.6}}>
          I confirm all information is accurate. I agree to AegisLedger's <span style={{color:T.accent}}>Terms of Service</span>, <span style={{color:T.accent}}>Privacy Policy</span>, and <span style={{color:T.accent}}>VARA Compliance Requirements</span>.
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <Btn variant="secondary" onClick={onBack}><- Back</Btn>
        <Btn variant="gold" onClick={handleSubmit} disabled={!agreed}>Submit Application -></Btn>
      </div>
    </div>
  );
}

// ─── SIGNUP FLOW CONTAINER ─────────────────────────────────────────
function SignupFlow({onBackToLogin}) {
  const [step,setStep]           = useState(1);
  const [companyData,setCompany] = useState({companyName:"",regNumber:"",country:"",email:"",phone:""});
  const [bankData,setBank]       = useState({});
  const [prefData,setPrefs]      = useState({stablecoins:[],fiats:[]});
  const [done,setDone]           = useState(false);

  const STEPS = [
    {n:1,label:"Company"},{n:2,label:"Email OTP"},{n:3,label:"Documents"},
    {n:4,label:"Banking"},{n:5,label:"Preferences"},{n:6,label:"Review"},
  ];

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border}50 1px,transparent 1px),linear-gradient(90deg,${T.border}50 1px,transparent 1px)`,backgroundSize:"48px 48px"}}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 30% 0%,${T.accent}08,transparent 50%),radial-gradient(ellipse at 80% 100%,${T.blue}06,transparent 50%)`}}/>
      <div style={{width:"100%",maxWidth:600,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,background:`linear-gradient(135deg,${T.accent},#0088CC)`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:T.bg,fontWeight:700}}>A</div>
            <div style={{color:T.text,fontWeight:700,fontSize:20}}>AegisLedger</div>
          </div>
          <div style={{color:T.muted,fontSize:11}}>Corporate KYB Registration · B2B Settlement Gateway</div>
        </div>
        {!done && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,gap:0}}>
            {STEPS.map((s,i)=>(
              <div key={s.n} style={{display:"flex",alignItems:"center"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <StepDot n={s.n} current={step===s.n} done={step>s.n}/>
                  <span style={{color:step===s.n?T.accent:step>s.n?T.accent:T.muted,fontSize:9,fontWeight:step===s.n?700:400,whiteSpace:"nowrap"}}>{s.label}</span>
                </div>
                {i<STEPS.length-1 && (
                  <div style={{width:40,height:2,background:step>s.n?T.accent:T.dim,margin:"0 4px",marginBottom:14,transition:"background 0.3s"}}/>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"28px 30px",boxShadow:`0 0 60px ${T.accent}08,0 24px 48px #00000040`}}>
          {step===1 && <SignupStep1 data={companyData} setData={setCompany} onNext={()=>setStep(2)}/>}
          {step===2 && <SignupStep2 email={companyData.email} onNext={()=>setStep(3)} onBack={()=>setStep(1)}/>}
          {step===3 && <SignupStep3 country={companyData.country} onNext={()=>setStep(4)} onBack={()=>setStep(2)}/>}
          {step===4 && <SignupStep4 country={companyData.country} data={bankData} setData={setBank} onNext={()=>setStep(5)} onBack={()=>setStep(3)}/>}
          {step===5 && <SignupStep5 data={prefData} setData={setPrefs} onNext={()=>setStep(6)} onBack={()=>setStep(4)}/>}
          {step===6 && <SignupStep6 allData={{company:companyData,bank:bankData,prefs:prefData}} onSubmit={()=>setDone(true)} onBack={()=>setStep(5)}/>}
          {done && (
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{width:60,height:60,borderRadius:"50%",background:T.accentGlow,border:`2px solid ${T.accent}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:24,color:T.accent,fontWeight:700,marginBottom:16}}>done</div>
              <div style={{color:T.text,fontWeight:700,fontSize:20,marginBottom:8}}>Application Submitted</div>
              <div style={{color:T.muted,fontSize:12,lineHeight:1.7,marginBottom:20}}>
                Your KYB application is under review. Our compliance team will contact you at <span style={{color:T.accent}}>{companyData.email}</span> within 1-2 business days.
              </div>
              <button onClick={onBackToLogin||(() => setStep(1))}
                style={{background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none",borderRadius:8,padding:"10px 24px",cursor:"pointer",fontSize:12,fontWeight:700}}>
                Back to Login
              </button>
            </div>
          )}
        </div>
        {!done && (
          <div style={{textAlign:"center",marginTop:14}}>
            <span style={{color:T.dim,fontSize:10}}>Already have an account? </span>
            <span onClick={onBackToLogin} style={{color:T.accent,fontSize:10,cursor:"pointer",fontWeight:600}}>Sign in -></span>
          </div>
        )}
        <div style={{textAlign:"center",marginTop:8}}>
          <span style={{color:T.dim,fontSize:9}}>AES-256 · VARA Licensed · ISO 27001 · SOC 2 Type II</span>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────
function Login({onLogin,onSignup,onForgotPassword}) {
  const [step,setStep] = useState(1);
  const [email,setEmail] = useState("treasury@rosneft.ru");
  const [pass,setPass]   = useState("............");
  const [mfa,setMfa]     = useState("");
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border}60 1px,transparent 1px),linear-gradient(90deg,${T.border}60 1px,transparent 1px)`,backgroundSize:"40px 40px"}}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% -10%,${T.accent}10,transparent 55%)`}}/>
      <div style={{width:400,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"36px",position:"relative",zIndex:1,boxShadow:`0 0 80px ${T.accent}10,0 30px 60px #00000050`}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,background:`linear-gradient(135deg,${T.accent},#0088CC)`,borderRadius:12,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:20,marginBottom:10,color:T.bg,fontWeight:700}}>A</div>
          <div style={{color:T.text,fontWeight:700,fontSize:20,letterSpacing:"0.3px"}}>AegisLedger</div>
          <div style={{color:T.muted,fontSize:11,marginTop:3}}>Institutional B2B Settlement Gateway</div>
          <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:8}}>
            {["VARA Licensed","ISO 27001","SOC 2 Type II"].map(l=>(
              <span key={l} style={{background:T.dim+"60",color:T.muted,fontSize:9,padding:"2px 7px",borderRadius:20,border:`1px solid ${T.border}`}}>{l}</span>
            ))}
          </div>
        </div>
        {step===1 && <>
          {[["Corporate Email",email,setEmail,"text","treasury@company.com"],["Password",pass,setPass,"password",""]].map(([lbl,val,set,type,ph])=>(
            <div key={lbl} style={{marginBottom:14}}>
              <label style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5,display:"block",fontWeight:600}}>{lbl}</label>
              <input value={val} onChange={e=>set(e.target.value)} type={type} placeholder={ph}
                style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:T.text,padding:"10px 12px",borderRadius:7,fontSize:12,boxSizing:"border-box",outline:"none"}}/>
            </div>
          ))}
          <button onClick={()=>setStep(2)} style={{width:"100%",background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontSize:12,fontWeight:700,letterSpacing:"0.5px",marginTop:6}}>
            CONTINUE ->
          </button>
          <div style={{textAlign:"right",marginTop:8}}>
            <span onClick={onForgotPassword} style={{color:T.muted,fontSize:10,cursor:"pointer"}}>Forgot password?</span>
          </div>
        </>}
        {step===2 && <>
          <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px",marginBottom:18,textAlign:"center"}}>
            <div style={{color:T.muted,fontSize:10,marginBottom:6}}>FIDO2 / WebAuthn MFA Required</div>
            <div style={{color:T.text,fontWeight:700,fontSize:14,marginBottom:4}}>[ MFA ]</div>
            <div style={{color:T.text,fontSize:11}}>Enter your 6-digit authenticator code</div>
          </div>
          <input value={mfa} onChange={e=>setMfa(e.target.value)} placeholder="000 000" maxLength={7}
            style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,color:T.accent,padding:"12px",borderRadius:7,fontSize:22,textAlign:"center",fontFamily:"monospace",letterSpacing:"10px",boxSizing:"border-box",outline:"none",marginBottom:14}}/>
          <button onClick={onLogin} style={{width:"100%",background:`linear-gradient(135deg,${T.accent},#0088CC)`,color:T.bg,border:"none",borderRadius:8,padding:"11px",cursor:"pointer",fontSize:12,fontWeight:700}}>
            AUTHENTICATE AND ENTER
          </button>
        </>}
        <div style={{textAlign:"center",marginTop:16}}>
          <span style={{color:T.dim,fontSize:10}}>AES-256 · TLS 1.3 · MPC Custody · ISO 27001</span>
        </div>
        <div style={{marginTop:14,padding:"12px",background:T.sidebar,borderRadius:8,border:`1px solid ${T.border}`}}>
          <div style={{color:T.muted,fontSize:10,textAlign:"center"}}>
            New corporate client?{" "}
            <span onClick={onSignup} style={{color:T.accent,cursor:"pointer",fontWeight:600}}>
              Apply for Institutional KYB Access ->
            </span>
          </div>
          <div style={{color:T.dim,fontSize:9,textAlign:"center",marginTop:2}}>B2B entities only · Annual revenue above AED 10M required</div>
        </div>
      </div>
    </div>
  );
}

// ─── PASSWORD RESET SCREEN ────────────────────────────────────────
function PasswordReset({onBack}) {
  const [step,setStep]       = useState("request"); // request | sent | reset | done
  const [email,setEmail]     = useState("");
  const [token,setToken]     = useState("");
  const [newPass,setNewPass] = useState("");
  const [confirm,setConfirm] = useState("");
  const [error,setError]     = useState("");

  const rules = [
    {label:"12+ characters",    ok: newPass.length >= 12},
    {label:"Uppercase letter",  ok: /[A-Z]/.test(newPass)},
    {label:"Number",            ok: /\d/.test(newPass)},
    {label:"Special character", ok: /[^a-zA-Z0-9]/.test(newPass)},
  ];
  const strong = rules.every(r=>r.ok);

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.border}60 1px,transparent 1px),linear-gradient(90deg,${T.border}60 1px,transparent 1px)`,backgroundSize:"40px 40px"}}/>
      <div style={{width:420,background:T.card,border:`1px solid ${T.border}`,borderRadius:16,padding:"36px",position:"relative",zIndex:1,boxShadow:`0 0 80px ${T.accent}08`}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{width:44,height:44,background:`linear-gradient(135deg,${T.accent},#0088CC)`,borderRadius:11,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:18,color:T.bg,fontWeight:700,marginBottom:10}}>A</div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Reset Password</div>
          <div style={{color:T.muted,fontSize:11,marginTop:3}}>AegisLedger Account Recovery</div>
        </div>

        {step==="request" && <>
          <div style={{color:T.muted,fontSize:12,marginBottom:14}}>Enter the corporate email address associated with your account.</div>
          <SInput label="Corporate Email" value={email} onChange={setEmail} type="email" required placeholder="treasury@company.com"/>
          {error && <div style={{color:T.red,fontSize:11,marginBottom:10}}>{error}</div>}
          <Btn fullWidth onClick={()=>{if(!email.includes("@")){setError("Enter a valid email");return;}setStep("sent");}}>Send Reset Link -></Btn>
          <div style={{textAlign:"center",marginTop:14}}><span onClick={onBack} style={{color:T.accent,fontSize:11,cursor:"pointer"}}>Back to Login</span></div>
        </>}

        {step==="sent" && <>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:T.accentGlow,border:`2px solid ${T.accent}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,color:T.accent,fontWeight:700,marginBottom:14}}>@</div>
            <div style={{color:T.text,fontWeight:700,fontSize:15,marginBottom:8}}>Reset link sent</div>
            <div style={{color:T.muted,fontSize:12,lineHeight:1.7,marginBottom:20}}>If an account exists for <span style={{color:T.accent}}>{email}</span>, a password reset link has been sent. Check your inbox and spam folder.</div>
            <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",marginBottom:20}}>
              <div style={{color:T.muted,fontSize:10,marginBottom:4}}>Demo — paste token to continue</div>
              <SInput label="Reset Token" value={token} onChange={setToken} placeholder="Paste token from email"/>
            </div>
            <Btn onClick={()=>{if(!token){return;}setStep("reset");}}>Continue with Token -></Btn>
          </div>
        </>}

        {step==="reset" && <>
          <div style={{color:T.muted,fontSize:12,marginBottom:14}}>Choose a strong new password for your account.</div>
          <SInput label="New Password" value={newPass} onChange={setNewPass} type="password" required/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {rules.map(r=>(
              <div key={r.label} style={{display:"flex",gap:6,alignItems:"center"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:r.ok?T.accent:T.dim,transition:"background 0.2s"}}/>
                <span style={{color:r.ok?T.accent:T.muted,fontSize:10}}>{r.label}</span>
              </div>
            ))}
          </div>
          <SInput label="Confirm Password" value={confirm} onChange={setConfirm} type="password" required/>
          {confirm && confirm!==newPass && <div style={{color:T.red,fontSize:10,marginBottom:8}}>Passwords do not match</div>}
          {error && <div style={{color:T.red,fontSize:11,marginBottom:10}}>{error}</div>}
          <Btn fullWidth disabled={!strong||newPass!==confirm} onClick={()=>setStep("done")}>Set New Password -></Btn>
        </>}

        {step==="done" && <>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:T.accentGlow,border:`2px solid ${T.accent}`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:22,color:T.accent,fontWeight:700,marginBottom:14}}>done</div>
            <div style={{color:T.text,fontWeight:700,fontSize:15,marginBottom:8}}>Password updated</div>
            <div style={{color:T.muted,fontSize:12,lineHeight:1.7,marginBottom:20}}>Your password has been changed and all other sessions have been revoked for security.</div>
            <Btn onClick={onBack}>Back to Login</Btn>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────
function Profile({role}) {
  const [tab,setTab]           = useState("preferences");
  const [stablecoins,setCoins] = useState(["USDC_ETH","AE_COIN"]);
  const [fiats,setFiats]       = useState(["RUB","AED"]);
  const [speed,setSpeed]       = useState("standard");
  const [limit,setLimit]       = useState("10M");
  const [currentPw,setCurPw]   = useState("");
  const [newPw,setNewPw]       = useState("");
  const [confirmPw,setConfPw]  = useState("");
  const [saved,setSaved]       = useState(false);
  const [showCodes,setShowCodes] = useState(false);
  const [codesGenerated,setCodes] = useState(false);

  const MOCK_BACKUP_CODES = ["A1B2C-3D4E5","F6G7H-8I9J0","K1L2M-3N4O5","P6Q7R-8S9T0","U1V2W-3X4Y5","Z6A7B-8C9D0","E1F2G-3H4I5","J6K7L-8M9N0","O1P2Q-3R4S5","T6U7V-8W9X0"];

  const pwRules = [
    {label:"12+ characters",ok:newPw.length>=12},
    {label:"Uppercase",ok:/[A-Z]/.test(newPw)},
    {label:"Number",ok:/\d/.test(newPw)},
    {label:"Special char",ok:/[^a-zA-Z0-9]/.test(newPw)},
  ];
  const pwStrong = pwRules.every(r=>r.ok);

  const COINS  = [{id:"USDC_ETH",l:"USDC / Ethereum"},{id:"USDT_POLY",l:"USDT / Polygon"},{id:"AE_COIN",l:"AE Coin / ADX"},{id:"USDC_SOL",l:"USDC / Solana"}];
  const FIATS  = [{id:"RUB",l:"Russian Ruble"},{id:"AED",l:"UAE Dirham"},{id:"USD",l:"US Dollar"},{id:"EUR",l:"Euro"},{id:"GBP",l:"GBP"},{id:"CNH",l:"Chinese Yuan"}];

  const toggle = (arr,setArr,id) => setArr(cur => cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]);

  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),2500); };

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",gap:14,marginBottom:20,alignItems:"flex-start"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},${T.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:T.bg,fontWeight:700,flexShrink:0}}>
          {role?.charAt(0)?.toUpperCase()}
        </div>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Alexei Petrov</div>
          <div style={{color:T.muted,fontSize:12}}>treasury@rosneft.ru</div>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <Tag>{role === "treasury" ? "Treasury Manager" : role}</Tag>
            <Tag color={T.blue}>Rosneft Trading SA</Tag>
            <Tag color={T.gold}>KYB Approved</Tag>
          </div>
        </div>
        {saved && <div style={{marginLeft:"auto",background:T.accentGlow,border:`1px solid ${T.accent}40`,color:T.accent,padding:"8px 14px",borderRadius:8,fontSize:11,fontWeight:700}}>Saved</div>}
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{id:"preferences",l:"Settlement Preferences"},{id:"security",l:"Security & 2FA"},{id:"password",l:"Change Password"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>

      {tab==="preferences" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Preferred Stablecoins</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {COINS.map(c=>{
                const sel=stablecoins.includes(c.id);
                return <div key={c.id} onClick={()=>toggle(stablecoins,setCoins,c.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:sel?T.accentGlow:T.sidebar,border:`1px solid ${sel?T.accent+"40":T.border}`,borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:14,height:14,border:`2px solid ${sel?T.accent:T.muted}`,borderRadius:3,background:sel?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.bg,fontWeight:700,flexShrink:0}}>{sel?"done":""}</div>
                  <span style={{color:T.text,fontSize:12}}>{c.l}</span>
                </div>;
              })}
            </div>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Fiat Currencies</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
              {FIATS.map(f=>{
                const sel=fiats.includes(f.id);
                return <div key={f.id} onClick={()=>toggle(fiats,setFiats,f.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:sel?`${T.gold}10`:T.sidebar,border:`1px solid ${sel?T.gold+"40":T.border}`,borderRadius:8,cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:14,height:14,border:`2px solid ${sel?T.gold:T.muted}`,borderRadius:3,background:sel?T.gold:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.bg,fontWeight:700,flexShrink:0}}>{sel?"done":""}</div>
                  <span style={{color:T.text,fontSize:12}}>{f.l}</span>
                </div>;
              })}
            </div>
            <SSelect label="Settlement Speed" value={speed} onChange={setSpeed} options={[{value:"instant",label:"Instant"},{value:"standard",label:"Standard"},{value:"batch",label:"Batch"}]}/>
            <SSelect label="Daily Limit" value={limit} onChange={setLimit} options={[{value:"1M",label:"Up to $1M"},{value:"10M",label:"Up to $10M"},{value:"50M",label:"Up to $50M"},{value:"unlimited",label:"Unlimited"}]}/>
          </div>
          <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={save}>Save Preferences</Btn>
          </div>
        </div>
      )}

      {tab==="security" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:4}}>Two-Factor Authentication</div>
            <div style={{color:T.muted,fontSize:11,marginBottom:14}}>TOTP via authenticator app (Google Authenticator, Authy)</div>
            <div style={{background:T.accentGlow,border:`1px solid ${T.accent}40`,borderRadius:8,padding:"12px 14px",marginBottom:14,display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:T.accent}}/>
              <div>
                <div style={{color:T.accent,fontSize:11,fontWeight:700}}>2FA Active</div>
                <div style={{color:T.muted,fontSize:10}}>Enabled since 12 Jan 2026</div>
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Backup Codes</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:8}}>
                <div>
                  <div style={{color:T.text,fontSize:12}}>Recovery Codes</div>
                  <div style={{color:codesGenerated?T.accent:T.gold,fontSize:10}}>{codesGenerated?"10 codes active — 10 remaining":"No codes generated yet"}</div>
                </div>
                <Btn small onClick={()=>{setCodes(true);setShowCodes(true);}}>
                  {codesGenerated?"View Codes":"Generate"}
                </Btn>
              </div>
              {showCodes && codesGenerated && (
                <div style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px"}}>
                  <div style={{color:T.red,fontSize:10,fontWeight:700,marginBottom:10}}>Save these codes — they will not be shown again after leaving this page</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                    {MOCK_BACKUP_CODES.map(c=>(
                      <div key={c} style={{background:T.card,borderRadius:5,padding:"5px 8px",color:T.accent,fontFamily:"monospace",fontSize:11,fontWeight:700}}>{c}</div>
                    ))}
                  </div>
                  <Btn small variant="secondary" onClick={()=>setShowCodes(false)}>Hide Codes</Btn>
                </div>
              )}
            </div>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:4}}>Login History</div>
            <div style={{color:T.muted,fontSize:11,marginBottom:14}}>Recent account access</div>
            {[
              {device:"Chrome / Windows",loc:"Moscow, RU",time:"Just now",current:true},
              {device:"Safari / iPhone 15",loc:"Moscow, RU",time:"2 hours ago",current:false},
              {device:"Chrome / MacBook",loc:"Dubai, AE",time:"Yesterday",current:false},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:s.current?T.accentGlow:T.sidebar,border:`1px solid ${s.current?T.accent+"40":T.border}`,borderRadius:8,marginBottom:8}}>
                <div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{color:T.text,fontSize:11,fontWeight:600}}>{s.device}</span>
                    {s.current && <Tag>Current</Tag>}
                  </div>
                  <div style={{color:T.muted,fontSize:10,marginTop:2}}>{s.loc} · {s.time}</div>
                </div>
                {!s.current && <button style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Revoke</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="password" && (
        <div style={{maxWidth:420}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Change Password</div>
            <SInput label="Current Password" value={currentPw} onChange={setCurPw} type="password" required/>
            <SInput label="New Password" value={newPw} onChange={setNewPw} type="password" required/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
              {pwRules.map(r=>(
                <div key={r.label} style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:r.ok?T.accent:T.dim,transition:"background 0.2s"}}/>
                  <span style={{color:r.ok?T.accent:T.muted,fontSize:10}}>{r.label}</span>
                </div>
              ))}
            </div>
            <SInput label="Confirm New Password" value={confirmPw} onChange={setConfPw} type="password" required/>
            {confirmPw && confirmPw!==newPw && <div style={{color:T.red,fontSize:10,marginBottom:8}}>Passwords do not match</div>}
            <Btn onClick={save} disabled={!pwStrong||newPw!==confirmPw||!currentPw}>Update Password</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SESSION MANAGER SCREEN ───────────────────────────────────────
function Sessions() {
  const [sessions,setSessions] = useState([
    {id:"s1",device:"Chrome 121 / Windows 11",   type:"Desktop", ip:"185.72.44.12",  loc:"Moscow, RU",       loginTime:"2026-03-04 09:14",lastActive:"Just now",   current:true},
    {id:"s2",device:"Safari 17 / iPhone 15 Pro", type:"Mobile",  ip:"185.72.44.18",  loc:"Moscow, RU",       loginTime:"2026-03-04 07:31",lastActive:"2h ago",     current:false},
    {id:"s3",device:"Chrome 121 / MacBook Pro",  type:"Desktop", ip:"82.195.104.33", loc:"Dubai, AE",        loginTime:"2026-03-03 16:45",lastActive:"Yesterday",  current:false},
    {id:"s4",device:"Firefox 122 / Ubuntu",      type:"Desktop", ip:"10.0.0.55",     loc:"Internal Network", loginTime:"2026-03-02 11:00",lastActive:"2 days ago", current:false},
  ]);

  const revoke = (id) => setSessions(s=>s.filter(x=>x.id!==id));
  const revokeAll = () => setSessions(s=>s.filter(x=>x.current));

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Active Sessions</div>
          <div style={{color:T.muted,fontSize:12}}>Manage devices that have access to your account</div>
        </div>
        <Btn variant="danger" onClick={revokeAll}>Revoke All Other Sessions</Btn>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {sessions.map(s=>(
          <div key={s.id} style={{background:T.card,border:`1px solid ${s.current?T.accent+"40":T.border}`,borderRadius:12,padding:"18px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              <div style={{width:40,height:40,background:s.type==="Mobile"?`${T.blue}15`:T.accentGlow,border:`1px solid ${s.type==="Mobile"?T.blue+"30":T.accent+"30"}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,color:s.type==="Mobile"?T.blue:T.accent,fontWeight:700}}>
                {s.type==="Mobile"?"M":"D"}
              </div>
              <div>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                  <span style={{color:T.text,fontWeight:600,fontSize:13}}>{s.device}</span>
                  {s.current && <Tag>Current Session</Tag>}
                </div>
                <div style={{color:T.muted,fontSize:11}}>{s.ip} · {s.loc}</div>
                <div style={{color:T.muted,fontSize:10,marginTop:2}}>Signed in: {s.loginTime} · Last active: {s.lastActive}</div>
              </div>
            </div>
            {!s.current && (
              <button onClick={()=>revoke(s.id)} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"7px 16px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{background:`${T.gold}08`,border:`1px solid ${T.gold}30`,borderRadius:10,padding:"14px 16px",marginTop:16}}>
        <div style={{color:T.gold,fontWeight:700,fontSize:12,marginBottom:4}}>Security Tip</div>
        <div style={{color:T.muted,fontSize:11,lineHeight:1.6}}>If you see a session you do not recognise, revoke it immediately and change your password. Contact security@aegisledger.com if you suspect unauthorised access.</div>
      </div>
    </div>
  );
}

// ─── AUDIT LOG SCREEN ─────────────────────────────────────────────
function AuditLog({role}) {
  const [filter,setFilter]   = useState("all");
  const [search,setSearch]   = useState("");
  const [expanded,setExpanded] = useState(null);

  const MOCK_LOGS = [
    {id:"AL-1042",user:"alexei.petrov@rosneft.ru",action:"TRANSFER_SUBMITTED",     ip:"185.72.44.12",loc:"Moscow, RU",       time:"2026-03-04 09:31",details:{txId:"TXN-2024-0847",amount:"4250000",currency:"USDC"},severity:"info"},
    {id:"AL-1041",user:"ivan.sokolov@compliance",action:"KYB_APPROVED",            ip:"195.14.32.88", loc:"Moscow, RU",      time:"2026-03-04 09:14",details:{company:"Urals Energy Group",reviewer:"Ivan Sokolov"},severity:"info"},
    {id:"AL-1040",user:"alexei.petrov@rosneft.ru",action:"PASSWORD_CHANGED",       ip:"185.72.44.12",loc:"Moscow, RU",       time:"2026-03-04 08:55",details:{},severity:"warning"},
    {id:"AL-1039",user:"system",                  action:"AML_FLAG_AUTO",          ip:"10.0.0.1",    loc:"Internal",         time:"2026-03-04 08:47",details:{txId:"TXN-2024-0845",score:88,reason:"Sanctions match"},severity:"critical"},
    {id:"AL-1038",user:"alexei.petrov@rosneft.ru",action:"LOGIN_SUCCESS",          ip:"82.195.104.33",loc:"Dubai, AE",       time:"2026-03-03 16:45",details:{device:"Chrome/MacBook",mfa:true},severity:"info"},
    {id:"AL-1037",user:"unknown",                 action:"LOGIN_FAILED",           ip:"91.245.12.99", loc:"Unknown, RU",     time:"2026-03-03 14:22",details:{email:"alexei.petrov@rosneft.ru",attempt:3},severity:"warning"},
    {id:"AL-1036",user:"natasha.admin@aegis",     action:"ADMIN_SETTINGS_UPDATED", ip:"192.168.1.10",loc:"Internal",         time:"2026-03-03 11:00",details:{keys:["platform_fee","daily_limit_default"]},severity:"warning"},
    {id:"AL-1035",user:"alexei.petrov@rosneft.ru",action:"BACKUP_CODES_GENERATED", ip:"185.72.44.12",loc:"Moscow, RU",       time:"2026-03-02 17:30",details:{count:10},severity:"info"},
    {id:"AL-1034",user:"alexei.petrov@rosneft.ru",action:"SESSION_REVOKED",        ip:"185.72.44.12",loc:"Moscow, RU",       time:"2026-03-02 17:28",details:{revokedSessionId:"s-old-4421"},severity:"info"},
    {id:"AL-1033",user:"system",                  action:"SANCTIONS_SCAN_COMPLETE",ip:"10.0.0.1",    loc:"Internal",         time:"2026-03-02 09:00",details:{entities:2847,matches:0,duration:"1.2s"},severity:"info"},
  ];

  const severityColor = {info:T.blue,warning:T.gold,critical:T.red};
  const filters = ["all","critical","warning","info","LOGIN","TRANSFER","KYB","AML","ADMIN"];

  const filtered = MOCK_LOGS.filter(l=>{
    if (filter==="all") return true;
    if (["critical","warning","info"].includes(filter)) return l.severity===filter;
    return l.action.includes(filter);
  }).filter(l=>!search || l.user.includes(search) || l.action.includes(search.toUpperCase()) || l.id.includes(search));

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Audit Log</div>
        <div style={{color:T.muted,fontSize:12}}>Immutable record of all account and platform activity</div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {filters.map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?T.accentGlow:"transparent",color:filter===f?T.accent:T.muted,border:`1px solid ${filter===f?T.accent+"35":T.border}`,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>{f}</button>
          ))}
        </div>
        <div style={{flex:1}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search user, action, ID..." style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"5px 12px",borderRadius:7,fontSize:10,width:220,outline:"none"}}/>
      </div>
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:T.sidebar}}>
              {["ID","User","Action","Severity","IP / Location","Time","Details"].map(h=>(
                <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(log=>(
              <>
                <tr key={log.id} onClick={()=>setExpanded(expanded===log.id?null:log.id)} style={{borderBottom:`1px solid ${T.border}20`,cursor:"pointer",background:expanded===log.id?T.accentGlow:"transparent",transition:"background 0.1s"}}>
                  <td style={{padding:"10px 14px",color:T.accent,fontSize:10,fontFamily:"monospace",whiteSpace:"nowrap"}}>{log.id}</td>
                  <td style={{padding:"10px 14px",color:T.text,fontSize:10,whiteSpace:"nowrap"}}>{log.user}</td>
                  <td style={{padding:"10px 14px",color:T.text,fontSize:10,fontFamily:"monospace",fontWeight:600,whiteSpace:"nowrap"}}>{log.action}</td>
                  <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}>
                    <span style={{background:`${severityColor[log.severity]}15`,color:severityColor[log.severity],padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{log.severity}</span>
                  </td>
                  <td style={{padding:"10px 14px",color:T.muted,fontSize:10,whiteSpace:"nowrap"}}>{log.ip} · {log.loc}</td>
                  <td style={{padding:"10px 14px",color:T.muted,fontSize:10,whiteSpace:"nowrap"}}>{log.time}</td>
                  <td style={{padding:"10px 14px",color:T.muted,fontSize:10}}>
                    <span style={{color:T.accent,fontSize:9}}>{expanded===log.id?"Hide":"Expand"}</span>
                  </td>
                </tr>
                {expanded===log.id && (
                  <tr key={log.id+"_exp"} style={{background:T.sidebar}}>
                    <td colSpan={7} style={{padding:"12px 16px 14px 48px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
                        {Object.entries(log.details).map(([k,v])=>(
                          <div key={k} style={{background:T.card,borderRadius:6,padding:"7px 10px"}}>
                            <div style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.5px"}}>{k}</div>
                            <div style={{color:T.text,fontSize:10,fontWeight:600,marginTop:2,wordBreak:"break-all"}}>{typeof v==="object"?JSON.stringify(v):String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{color:T.muted,fontSize:10,marginTop:10}}>Showing {filtered.length} of {MOCK_LOGS.length} log entries · Audit logs are immutable and tamper-proof</div>
    </div>
  );
}

// ─── ADMIN PANEL SCREEN ───────────────────────────────────────────
function AdminPanel() {
  const [tab,setTab] = useState("overview");
  const [feeRate,setFeeRate] = useState("0.15");
  const [dailyLimit,setDailyLimit] = useState("50000000");
  const [saved,setSaved] = useState(false);

  const MOCK_USERS = [
    {id:"u1",email:"alexei.petrov@rosneft.ru",  company:"Rosneft Trading SA",       role:"treasury",   kyb:"approved", lastLogin:"Just now",  status:"active"},
    {id:"u2",email:"ivan.sokolov@compliance",    company:"AegisLedger Internal",     role:"compliance", kyb:"approved", lastLogin:"1h ago",    status:"active"},
    {id:"u3",email:"maria.volkov@translogistics",company:"Trans-Caspian Logistics",  role:"operator",   kyb:"pending",  lastLogin:"3h ago",    status:"active"},
    {id:"u4",email:"dmitry.kim@sibgrain",        company:"Siberian Grain Holdings",  role:"operator",   kyb:"review",   lastLogin:"2 days ago",status:"suspended"},
    {id:"u5",email:"chen.wei@dmcc",              company:"Dubai Metals & Commodities",role:"treasury",  kyb:"approved", lastLogin:"1 hour ago",status:"active"},
  ];

  const STATS = [
    {l:"Total Companies",   v:"47",     s:"+ 3 this week",   color:T.accent},
    {l:"Active Users",      v:"183",    s:"12 pending KYB",  color:T.blue},
    {l:"Volume (30d)",      v:"$418.7M",s:"+ 24.3%",         color:T.gold},
    {l:"AML Flags (7d)",    v:"3",      s:"1 critical open", color:T.red},
    {l:"Platform Fee Revenue",v:"$628K",s:"This month",      color:T.accent},
    {l:"Uptime",            v:"99.98%", s:"30-day average",  color:T.accent},
  ];

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Super Admin Panel</div>
        <div style={{color:T.muted,fontSize:12}}>Platform-wide management, settings and monitoring</div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{id:"overview",l:"Overview"},{id:"users",l:"Users"},{id:"settings",l:"Platform Settings"},{id:"kyb",l:"KYB Queue"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>

      {tab==="overview" && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {STATS.map(s=>(
              <div key={s.l} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
                <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>{s.l}</div>
                <div style={{color:T.text,fontSize:22,fontWeight:700,fontFamily:"monospace"}}>{s.v}</div>
                <div style={{color:s.color,fontSize:10,marginTop:4}}>{s.s}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>System Health</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                {l:"Identity Service",  v:"Healthy", port:"3001",latency:"12ms"},
                {l:"Wallet Service",    v:"Healthy", port:"3002",latency:"18ms"},
                {l:"Compliance Service",v:"Healthy", port:"3003",latency:"24ms"},
                {l:"Trade Service",     v:"Healthy", port:"3004",latency:"15ms"},
                {l:"Fiat Service",      v:"Healthy", port:"3005",latency:"31ms"},
                {l:"Notification Svc",  v:"Healthy", port:"3006",latency:"8ms"},
                {l:"WebSocket Svc",     v:"Healthy", port:"3007",latency:"3ms"},
                {l:"PostgreSQL",        v:"Healthy", port:"5432",latency:"2ms"},
              ].map(s=>(
                <div key={s.l} style={{background:T.sidebar,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:T.muted,fontSize:9}}>{s.l}</span>
                    <div style={{width:6,height:6,borderRadius:"50%",background:T.accent}}/>
                  </div>
                  <div style={{color:T.text,fontSize:10,fontWeight:600}}>{s.v}</div>
                  <div style={{color:T.muted,fontSize:9}}>:{s.port} · {s.latency}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab==="users" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:T.sidebar}}>
                {["Email","Company","Role","KYB Status","Last Login","Status","Actions"].map(h=>(
                  <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_USERS.map(u=>(
                <tr key={u.id} style={{borderBottom:`1px solid ${T.border}20`}}>
                  <td style={{padding:"11px 14px",color:T.text,fontSize:11}}>{u.email}</td>
                  <td style={{padding:"11px 14px",color:T.muted,fontSize:11}}>{u.company}</td>
                  <td style={{padding:"11px 14px"}}><Tag color={T.blue}>{u.role}</Tag></td>
                  <td style={{padding:"11px 14px"}}><Badge s={u.kyb}/></td>
                  <td style={{padding:"11px 14px",color:T.muted,fontSize:10}}>{u.lastLogin}</td>
                  <td style={{padding:"11px 14px"}}>
                    <span style={{color:u.status==="active"?T.accent:T.red,fontSize:10,fontWeight:700}}>{u.status}</span>
                  </td>
                  <td style={{padding:"11px 14px"}}>
                    <div style={{display:"flex",gap:5}}>
                      <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Edit</button>
                      <button style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>
                        {u.status==="active"?"Suspend":"Restore"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==="settings" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Fee Configuration</div>
            <SInput label="Platform Fee Rate (%)" value={feeRate} onChange={setFeeRate} hint="Default: 0.15% (15 bps)"/>
            <SSelect label="Fee Cap" value="1" onChange={()=>{}} options={[{value:"0.5",label:"0.50%"},{value:"1",label:"1.00% (VARA max)"},{value:"2",label:"2.00%"}]}/>
            <SInput label="Minimum Escrow Amount (USD)" value="1000" onChange={()=>{}} hint="VARA minimum"/>
            <SInput label="Maximum Escrow Duration (days)" value="180" onChange={()=>{}} hint="VARA maximum"/>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Transfer Limits</div>
            <SInput label="Default Daily Limit (USD)" value={dailyLimit} onChange={setDailyLimit}/>
            <SInput label="Maker-Checker Threshold (USD)" value="500000" onChange={()=>{}} hint="Dual approval required above this"/>
            <SInput label="FATF Travel Rule Threshold (USD)" value="1000" onChange={()=>{}} hint="FATF Recommendation 16"/>
            <SSelect label="Mock Mode" value="all_mock" onChange={()=>{}} options={[{value:"all_mock",label:"All services mocked (dev)"},{value:"blockchain_only",label:"Blockchain real, others mocked"},{value:"production",label:"All real (production)"}]}/>
          </div>
          <div style={{gridColumn:"1/-1",display:"flex",justifyContent:"flex-end",gap:10}}>
            <Btn variant="secondary">Reset to Defaults</Btn>
            <Btn variant="gold" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2500);}}>
              {saved?"Saved":"Save Settings"}
            </Btn>
          </div>
        </div>
      )}

      {tab==="kyb" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",background:T.sidebar,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
            <span style={{color:T.text,fontWeight:600,fontSize:12}}>All KYB Applications</span>
            <div style={{display:"flex",gap:6}}>
              <Tag color={T.red}>3 escalated</Tag>
              <Tag color={T.gold}>8 pending</Tag>
              <Tag>12 approved</Tag>
            </div>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:T.sidebar}}>
                {["Company","Country","Risk","Status","Submitted","Actions"].map(h=>(
                  <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kybQueue.map(k=>(
                <tr key={k.company} style={{borderBottom:`1px solid ${T.border}20`}}>
                  <td style={{padding:"11px 14px",color:T.text,fontWeight:600,fontSize:12}}>{k.company}</td>
                  <td style={{padding:"11px 14px",color:T.muted,fontSize:11}}>{k.country}</td>
                  <td style={{padding:"11px 14px"}}><Badge s={k.risk}/></td>
                  <td style={{padding:"11px 14px"}}><Badge s={k.status}/></td>
                  <td style={{padding:"11px 14px",color:T.muted,fontSize:10}}>{k.submitted}</td>
                  <td style={{padding:"11px 14px"}}>
                    <div style={{display:"flex",gap:5}}>
                      <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Approve</button>
                      <button style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ANALYTICS DEEP-DIVE SCREEN ──────────────────────────────────
function Analytics() {
  const [period,setPeriod] = useState("30d");
  const [corridor,setCorridor] = useState("all");

  const volumeData = [
    {d:"Mar 1",v:12.4,tx:84},{d:"Mar 2",v:9.1,tx:61},{d:"Mar 3",v:18.7,tx:132},
    {d:"Mar 4",v:15.2,tx:103},{d:"Mar 5",v:22.8,tx:158},{d:"Mar 6",v:11.3,tx:77},
    {d:"Mar 7",v:26.4,tx:187},{d:"Mar 8",v:19.9,tx:142},{d:"Mar 9",v:8.7,tx:55},
    {d:"Mar 10",v:31.2,tx:219}
  ];
  const corridors = [
    {route:"RUB→AED",vol:"$218.4M",share:52,txns:1847,avg:"$118.2K",latency:"14.2s",color:T.accent},
    {route:"USD→AED",vol:"$124.1M",share:30,txns:962,avg:"$129.0K",latency:"11.8s",color:T.blue},
    {route:"EUR→AED",vol:"$58.7M",share:14,txns:441,avg:"$133.1K",latency:"12.1s",color:T.gold},
    {route:"RUB→USD",vol:"$17.5M",share:4,txns:187,avg:"$93.6K",latency:"16.3s",color:"#8B5CF6"},
  ];
  const topCounterparties = [
    {name:"Emirates National Oil Co",vol:"$84.2M",txns:312,kyb:"approved",trend:"+12%"},
    {name:"Rosneft Trading SA",vol:"$67.8M",txns:248,kyb:"approved",trend:"+8%"},
    {name:"Dubai Metals & Commodities",vol:"$43.1M",txns:187,kyb:"approved",trend:"+31%"},
    {name:"Trans-Caspian Logistics",vol:"$31.5M",txns:142,kyb:"approved",trend:"-4%"},
    {name:"Siberian Grain Holdings",vol:"$28.9M",txns:118,kyb:"approved",trend:"+19%"},
  ];

  const maxVol = Math.max(...volumeData.map(d=>d.v));

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Transaction Analytics</div>
          <div style={{color:T.muted,fontSize:12}}>Volume, corridors, counterparties and settlement performance</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {["7d","30d","90d","1y"].map(p=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{background:period===p?T.accentGlow:"transparent",color:period===p?T.accent:T.muted,border:`1px solid ${period===p?T.accent+"40":T.border}`,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:600}}>{p}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Total Volume",v:"$418.7M",d:"+24.3%",color:T.accent},
          {l:"Transactions",v:"3,437",d:"+18.1%",color:T.blue},
          {l:"Avg Settlement",v:"14.2s",d:"-2.1s",color:T.gold},
          {l:"Avg TX Size",v:"$121.8K",d:"+5.4%",color:T.accent},
          {l:"Platform Revenue",v:"$628K",d:"+22.7%",color:T.gold},
        ].map(s=>(
          <div key={s.l} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
            <div style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6}}>{s.l}</div>
            <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:2}}>{s.v}</div>
            <div style={{color:s.color,fontSize:10}}>{s.d} vs prior period</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16}}>
        {/* Volume chart */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:16}}>Daily Settlement Volume (USD millions)</div>
          <div style={{display:"flex",gap:3,alignItems:"flex-end",height:120}}>
            {volumeData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",background:`linear-gradient(180deg,${T.accent},${T.blue})`,borderRadius:"3px 3px 0 0",height:`${(d.v/maxVol)*100}px`,minHeight:4,transition:"height 0.3s"}}/>
                <span style={{color:T.muted,fontSize:8,transform:"rotate(-45deg)",transformOrigin:"top center",whiteSpace:"nowrap"}}>{d.d}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:14}}>
            {["$0","$10M","$20M","$30M"].map(l=><span key={l} style={{color:T.muted,fontSize:9}}>{l}</span>)}
          </div>
        </div>

        {/* Corridor breakdown */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Volume by Corridor</div>
          {corridors.map(c=>(
            <div key={c.route} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:T.text,fontSize:11,fontWeight:600}}>{c.route}</span>
                <span style={{color:T.muted,fontSize:10}}>{c.vol} · {c.share}%</span>
              </div>
              <div style={{height:6,background:T.sidebar,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${c.share}%`,background:c.color,borderRadius:3,transition:"width 0.5s"}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Settlement latency vs SWIFT */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Settlement Latency vs SWIFT</div>
          {[
            {l:"AegisLedger avg",v:14.2,max:120,color:T.accent,unit:"seconds"},
            {l:"SWIFT (same-day)",v:86400,max:86400,color:T.red,unit:"seconds"},
            {l:"Target SLA",v:30,max:120,color:T.gold,unit:"seconds"},
          ].map(s=>(
            <div key={s.l} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:T.text,fontSize:11}}>{s.l}</span>
                <span style={{color:s.color,fontSize:11,fontWeight:700}}>{s.v<3600?`${s.v}s`:`${(s.v/3600).toFixed(1)}h`}</span>
              </div>
              <div style={{height:8,background:T.sidebar,borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(100,(s.v/s.max)*100)}%`,background:s.color,borderRadius:4}}/>
              </div>
            </div>
          ))}
          <div style={{background:T.accentGlow,border:`1px solid ${T.accent}30`,borderRadius:8,padding:"10px 12px",marginTop:14}}>
            <div style={{color:T.accent,fontWeight:700,fontSize:11}}>6,085x faster than SWIFT</div>
            <div style={{color:T.muted,fontSize:10}}>Average 14.2 seconds vs 24+ hours</div>
          </div>
        </div>

        {/* Top counterparties */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
          <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Top Counterparties (30d)</div>
          {topCounterparties.map((c,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<topCounterparties.length-1?`1px solid ${T.border}20`:"none"}}>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <span style={{width:20,height:20,background:T.accentGlow,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",color:T.accent,fontSize:9,fontWeight:700}}>{i+1}</span>
                <div>
                  <div style={{color:T.text,fontSize:11,fontWeight:600}}>{c.name}</div>
                  <div style={{color:T.muted,fontSize:9}}>{c.txns} transactions</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:T.text,fontSize:11,fontWeight:700}}>{c.vol}</div>
                <div style={{color:c.trend.startsWith("+")?T.accent:T.red,fontSize:9}}>{c.trend}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── COMPLIANCE RULES ENGINE SCREEN ──────────────────────────────
function ComplianceRules() {
  const [rules,setRules] = useState([
    {id:"r1",name:"Large Transaction Flag",enabled:true,conditions:[{field:"amount",operator:"gte",value:"1000000"}],action:"review",severity:"high",triggers:47},
    {id:"r2",name:"Sanctioned Jurisdiction Block",enabled:true,conditions:[{field:"counterparty_country",operator:"in",value:["IR","KP","SY"]}],action:"block",severity:"critical",triggers:3},
    {id:"r3",name:"Rapid Velocity Alert",enabled:true,conditions:[{field:"tx_count_24h",operator:"gte",value:"20"}],action:"flag",severity:"medium",triggers:12},
    {id:"r4",name:"Round Amount Pattern",enabled:false,conditions:[{field:"amount",operator:"eq",value:"round_number"}],action:"flag",severity:"low",triggers:89},
    {id:"r5",name:"New Counterparty Large TX",enabled:true,conditions:[{field:"counterparty_first_tx",operator:"eq",value:"true"},{field:"amount",operator:"gte",value:"500000"}],action:"review",severity:"high",triggers:8},
  ]);
  const [showNew,setShowNew] = useState(false);
  const [newRule,setNewRule] = useState({name:"",action:"flag",severity:"medium",conditions:[{field:"amount",operator:"gte",value:""}]});

  const sevColor = {critical:T.red,high:T.gold,medium:T.blue,low:T.muted};
  const actColor = {block:T.red,review:T.gold,flag:T.blue};

  const toggleRule = (id) => setRules(r=>r.map(x=>x.id===id?{...x,enabled:!x.enabled}:x));
  const deleteRule = (id) => setRules(r=>r.filter(x=>x.id!==id));
  const addCondition = () => setNewRule(r=>({...r,conditions:[...r.conditions,{field:"amount",operator:"gte",value:""}]}));

  const FIELDS    = ["amount","counterparty_country","tx_count_24h","risk_score","counterparty_first_tx","asset","corridor","time_of_day"];
  const OPERATORS = ["gte","lte","gt","lt","eq","neq","in","not_in","contains"];

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>AML Rules Engine</div>
          <div style={{color:T.muted,fontSize:12}}>Configure automated transaction monitoring rules</div>
        </div>
        <Btn onClick={()=>setShowNew(!showNew)}>+ New Rule</Btn>
      </div>

      {showNew && (
        <div style={{background:T.card,border:`1px solid ${T.accent}40`,borderRadius:12,padding:"20px",marginBottom:16}}>
          <div style={{color:T.accent,fontWeight:700,fontSize:13,marginBottom:14}}>New AML Rule</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginBottom:12}}>
            <SInput label="Rule Name" value={newRule.name} onChange={v=>setNewRule(r=>({...r,name:v}))}/>
            <SSelect label="Action" value={newRule.action} onChange={v=>setNewRule(r=>({...r,action:v}))} options={[{value:"flag",label:"Flag"},{value:"review",label:"Review"},{value:"block",label:"Block"}]}/>
            <SSelect label="Severity" value={newRule.severity} onChange={v=>setNewRule(r=>({...r,severity:v}))} options={[{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"},{value:"critical",label:"Critical"}]}/>
          </div>
          <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:8}}>Conditions (ALL must match)</div>
          {newRule.conditions.map((c,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 2fr auto",gap:8,marginBottom:8}}>
              <select value={c.field} onChange={e=>{const nc=[...newRule.conditions];nc[i]={...nc[i],field:e.target.value};setNewRule(r=>({...r,conditions:nc}));}} style={{background:T.sidebar,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11}}>
                {FIELDS.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
              <select value={c.operator} onChange={e=>{const nc=[...newRule.conditions];nc[i]={...nc[i],operator:e.target.value};setNewRule(r=>({...r,conditions:nc}));}} style={{background:T.sidebar,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11}}>
                {OPERATORS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
              <input value={c.value} onChange={e=>{const nc=[...newRule.conditions];nc[i]={...nc[i],value:e.target.value};setNewRule(r=>({...r,conditions:nc}));}} placeholder="value" style={{background:T.sidebar,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11,outline:"none"}}/>
              <button onClick={()=>setNewRule(r=>({...r,conditions:r.conditions.filter((_,j)=>j!==i)}))} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,borderRadius:5,padding:"0 10px",cursor:"pointer",fontSize:12}}>✕</button>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn small variant="secondary" onClick={addCondition}>+ Add Condition</Btn>
            <Btn small onClick={()=>{setRules(r=>[...r,{id:`r${Date.now()}`,triggers:0,...newRule}]);setShowNew(false);setNewRule({name:"",action:"flag",severity:"medium",conditions:[{field:"amount",operator:"gte",value:""}]});}}>Save Rule</Btn>
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {rules.map(r=>(
          <div key={r.id} style={{background:T.card,border:`1px solid ${r.enabled?T.border:T.border+"60"}`,borderRadius:12,padding:"16px 18px",opacity:r.enabled?1:0.6,transition:"opacity 0.2s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                  <span style={{color:T.text,fontWeight:700,fontSize:13}}>{r.name}</span>
                  <span style={{background:`${actColor[r.action]}15`,color:actColor[r.action],padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{r.action}</span>
                  <span style={{background:`${sevColor[r.severity]}15`,color:sevColor[r.severity],padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{r.severity}</span>
                  <span style={{color:T.muted,fontSize:10}}>{r.triggers} triggers (30d)</span>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {r.conditions.map((c,i)=>(
                    <div key={i} style={{background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 8px",fontSize:10,color:T.text}}>
                      <span style={{color:T.muted}}>{c.field}</span> <span style={{color:T.accent}}>{c.operator}</span> <span style={{color:T.gold}}>{Array.isArray(c.value)?c.value.join(", "):c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginLeft:12}}>
                <div onClick={()=>toggleRule(r.id)} style={{width:36,height:20,background:r.enabled?T.accent:T.dim,borderRadius:10,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:r.enabled?18:2,width:16,height:16,background:"#fff",borderRadius:"50%",transition:"left 0.2s"}}/>
                </div>
                <button onClick={()=>deleteRule(r.id)} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RECURRING PAYMENTS SCREEN ────────────────────────────────────
function RecurringPayments() {
  const [schedules,setSchedules] = useState([
    {id:"rp1",name:"Monthly Oil Royalty",recipient:"ENOC Refinery AE",amount:"2400000",asset:"USDC_ETH",freq:"Monthly",nextRun:"Apr 1 2026",status:"active",runs:3},
    {id:"rp2",name:"Quarterly Logistics Fee",recipient:"Trans-Caspian LLC",amount:"180000",asset:"USDT_POLY",freq:"Quarterly",nextRun:"Jun 15 2026",status:"active",runs:1},
    {id:"rp3",name:"Weekly Grain Advance",recipient:"Siberian Grain",amount:"450000",asset:"USDC_ETH",freq:"Weekly",nextRun:"Mar 10 2026",status:"paused",runs:8},
  ]);
  const [showNew,setShowNew] = useState(false);

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Recurring Payments</div>
          <div style={{color:T.muted,fontSize:12}}>Scheduled standing orders and recurring transfers</div>
        </div>
        <Btn onClick={()=>setShowNew(!showNew)}>+ New Schedule</Btn>
      </div>

      {showNew && (
        <div style={{background:T.card,border:`1px solid ${T.accent}40`,borderRadius:12,padding:"20px",marginBottom:16}}>
          <div style={{color:T.accent,fontWeight:700,fontSize:13,marginBottom:14}}>New Recurring Payment</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <SInput label="Schedule Name" value="" onChange={()=>{}}/>
            <SInput label="Recipient Address / Name" value="" onChange={()=>{}}/>
            <SInput label="Amount (USD)" value="" onChange={()=>{}} type="number"/>
            <SSelect label="Asset" value="USDC_ETH" onChange={()=>{}} options={[{value:"USDC_ETH",label:"USDC / Ethereum"},{value:"USDT_POLY",label:"USDT / Polygon"}]}/>
            <SSelect label="Frequency" value="monthly" onChange={()=>{}} options={[{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"quarterly",label:"Quarterly"}]}/>
            <SInput label="Start Date" value="" onChange={()=>{}} type="date"/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <Btn>Create Schedule</Btn>
            <Btn variant="secondary" onClick={()=>setShowNew(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {schedules.map(s=>(
          <div key={s.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                <span style={{color:T.text,fontWeight:700,fontSize:13}}>{s.name}</span>
                <Tag color={s.status==="active"?T.accent:T.muted}>{s.status}</Tag>
              </div>
              <div style={{color:T.muted,fontSize:11}}>To: {s.recipient} · {s.freq} · {s.runs} runs completed</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:T.text,fontWeight:700,fontSize:16}}>${parseInt(s.amount).toLocaleString()}</div>
              <div style={{color:T.muted,fontSize:10}}>{s.asset} · Next: {s.nextRun}</div>
            </div>
            <div style={{display:"flex",gap:6,marginLeft:16}}>
              <button onClick={()=>setSchedules(ss=>ss.map(x=>x.id===s.id?{...x,status:x.status==="active"?"paused":"active"}:x))} style={{background:s.status==="active"?`${T.gold}12`:T.accentGlow,color:s.status==="active"?T.gold:T.accent,border:`1px solid ${s.status==="active"?T.gold+"30":T.accent+"30"}`,padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>
                {s.status==="active"?"Pause":"Resume"}
              </button>
              <button onClick={()=>setSchedules(ss=>ss.filter(x=>x.id!==s.id))} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700}}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ADDRESS BOOK SCREEN ──────────────────────────────────────────
function AddressBook() {
  const [search,setSearch]   = useState("");
  const [showAdd,setShowAdd] = useState(false);
  const [contacts,setContacts] = useState([
    {id:"ab1",name:"Emirates National Oil Co",address:"0x1234...abcd",asset:"USDC_ETH",country:"AE",kyb:"verified",tag:"Oil & Gas",used:47},
    {id:"ab2",name:"Rosneft Trading SA",address:"0x5678...ef01",asset:"USDC_ETH",country:"RU",kyb:"verified",tag:"Energy",used:31},
    {id:"ab3",name:"Dubai Metals & Commodities",address:"0x9abc...2345",asset:"USDT_POLY",country:"AE",kyb:"verified",tag:"Metals",used:18},
    {id:"ab4",name:"Trans-Caspian Logistics",address:"0xdef0...6789",asset:"USDC_ETH",country:"KZ",kyb:"pending",tag:"Logistics",used:12},
    {id:"ab5",name:"Siberian Grain Holdings",address:"0x1357...90ab",asset:"USDC_ETH",country:"RU",kyb:"verified",tag:"Agriculture",used:9},
  ]);

  const filtered = contacts.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())||c.address.includes(search));

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:T.text,fontWeight:700,fontSize:18}}>Address Book</div>
          <div style={{color:T.muted,fontSize:12}}>Saved, named beneficiaries with KYB verification status</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts..." style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"7px 12px",borderRadius:7,fontSize:11,outline:"none",width:200}}/>
          <Btn onClick={()=>setShowAdd(!showAdd)}>+ Add Contact</Btn>
        </div>
      </div>

      {showAdd && (
        <div style={{background:T.card,border:`1px solid ${T.accent}40`,borderRadius:12,padding:"20px",marginBottom:16}}>
          <div style={{color:T.accent,fontWeight:700,fontSize:13,marginBottom:14}}>New Contact</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <SInput label="Company Name" value="" onChange={()=>{}}/>
            <SInput label="Wallet Address" value="" onChange={()=>{}} placeholder="0x..."/>
            <SSelect label="Asset" value="USDC_ETH" onChange={()=>{}} options={[{value:"USDC_ETH",label:"USDC / Ethereum"},{value:"USDT_POLY",label:"USDT / Polygon"}]}/>
            <SInput label="Tag / Category" value="" onChange={()=>{}}/>
            <SSelect label="Country" value="AE" onChange={()=>{}} options={[{value:"AE",label:"UAE"},{value:"RU",label:"Russia"},{value:"US",label:"USA"},{value:"EU",label:"EU"}]}/>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <Btn>Save Contact</Btn>
            <Btn variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:T.sidebar}}>
              {["Company","Wallet Address","Asset","Country","KYB","Tag","Used","Actions"].map(h=>(
                <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c=>(
              <tr key={c.id} style={{borderBottom:`1px solid ${T.border}20`}}>
                <td style={{padding:"11px 14px",color:T.text,fontWeight:600,fontSize:11}}>{c.name}</td>
                <td style={{padding:"11px 14px",color:T.accent,fontFamily:"monospace",fontSize:10}}>{c.address}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:10}}>{c.asset}</td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:10}}>{c.country}</td>
                <td style={{padding:"11px 14px"}}><Badge s={c.kyb}/></td>
                <td style={{padding:"11px 14px"}}><Tag>{c.tag}</Tag></td>
                <td style={{padding:"11px 14px",color:T.muted,fontSize:10}}>{c.used}x</td>
                <td style={{padding:"11px 14px"}}>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Pay</button>
                    <button onClick={()=>setContacts(cs=>cs.filter(x=>x.id!==c.id))} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DEVELOPER PORTAL SCREEN ─────────────────────────────────────
function DeveloperPortal() {
  const [tab,setTab]     = useState("keys");
  const [showKey,setShowKey] = useState(false);
  const [keys,setKeys]   = useState([
    {id:"ak1",name:"Production Treasury Integration",key:"ak_live_•••••••••••••••••••XK7Q",env:"live",perms:["transfers:read","transfers:write","wallets:read"],created:"2026-01-15",lastUsed:"2 mins ago",requests:"47,291"},
    {id:"ak2",name:"ERP Reconciliation Service",key:"ak_live_•••••••••••••••••••M2PL",env:"live",perms:["transfers:read","wallets:read"],created:"2026-02-03",lastUsed:"1 hour ago",requests:"12,847"},
    {id:"ak3",name:"Sandbox Testing",key:"ak_test_•••••••••••••••••••T9XR",env:"test",perms:["transfers:read","transfers:write","wallets:read","wallets:write"],created:"2026-02-20",lastUsed:"3 days ago",requests:"8,441"},
  ]);

  const ENDPOINTS = [
    {method:"POST",path:"/v1/transfers",desc:"Initiate a new stablecoin transfer"},
    {method:"GET", path:"/v1/transfers/:id",desc:"Get transfer status and details"},
    {method:"GET", path:"/v1/wallets",desc:"List all company wallets"},
    {method:"POST",path:"/v1/escrow",desc:"Create a trade finance escrow"},
    {method:"PATCH",path:"/v1/escrow/:id/release",desc:"Release escrow tranche"},
    {method:"GET", path:"/v1/rates",desc:"Get current exchange rates"},
    {method:"GET", path:"/v1/compliance/status",desc:"Get company compliance status"},
    {method:"POST",path:"/v1/webhooks",desc:"Register a webhook endpoint"},
  ];

  const methodColor = {GET:T.accent,POST:T.blue,PATCH:T.gold,DELETE:T.red};

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:20}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Developer Portal</div>
        <div style={{color:T.muted,fontSize:12}}>API keys, documentation, sandbox, usage analytics</div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{id:"keys",l:"API Keys"},{id:"docs",l:"API Reference"},{id:"usage",l:"Usage Analytics"},{id:"webhooks",l:"Webhooks"},{id:"sandbox",l:"Sandbox"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>

      {tab==="keys" && (
        <>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
            <Btn onClick={()=>setShowKey(!showKey)}>+ Create API Key</Btn>
          </div>
          {showKey && (
            <div style={{background:T.card,border:`1px solid ${T.accent}40`,borderRadius:12,padding:"20px",marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
                <SInput label="Key Name" value="" onChange={()=>{}} placeholder="e.g. SAP Integration"/>
                <SSelect label="Environment" value="test" onChange={()=>{}} options={[{value:"test",label:"Sandbox / Test"},{value:"live",label:"Production"}]}/>
              </div>
              <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.7px",margin:"12px 0 8px"}}>Permissions</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
                {["transfers:read","transfers:write","wallets:read","wallets:write","compliance:read","admin:read"].map(p=>(
                  <div key={p} style={{display:"flex",gap:6,alignItems:"center",padding:"5px 10px",background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}>
                    <div style={{width:10,height:10,border:`2px solid ${T.accent}`,borderRadius:2,background:T.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:T.bg,fontWeight:700}}>done</div>
                    <span style={{color:T.text,fontSize:10}}>{p}</span>
                  </div>
                ))}
              </div>
              <Btn>Generate Key</Btn>
            </div>
          )}
          {keys.map(k=>(
            <div key={k.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px 20px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <span style={{color:T.text,fontWeight:700,fontSize:13}}>{k.name}</span>
                    <Tag color={k.env==="live"?T.accent:T.blue}>{k.env}</Tag>
                  </div>
                  <div style={{color:T.accent,fontFamily:"monospace",fontSize:11,marginBottom:4}}>{k.key}</div>
                  <div style={{color:T.muted,fontSize:10}}>Created: {k.created} · Last used: {k.lastUsed} · {k.requests} requests</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Rotate</button>
                  <button onClick={()=>setKeys(ks=>ks.filter(x=>x.id!==k.id))} style={{background:"#F0443812",color:T.red,border:`1px solid ${T.red}30`,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Revoke</button>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {k.perms.map(p=><Tag key={p} color={T.muted}>{p}</Tag>)}
              </div>
            </div>
          ))}
        </>
      )}

      {tab==="docs" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",background:T.sidebar,borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:T.text,fontWeight:600,fontSize:12}}>AegisLedger API v1 — OpenAPI 3.0</span>
            <div style={{display:"flex",gap:6}}>
              <Tag color={T.accent}>v1.4.2</Tag>
              <a href="#" style={{color:T.accent,fontSize:10}}>Download Postman Collection</a>
            </div>
          </div>
          {ENDPOINTS.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:14,alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${T.border}20`}}>
              <span style={{background:`${methodColor[e.method]}15`,color:methodColor[e.method],padding:"2px 8px",borderRadius:4,fontSize:9,fontWeight:700,fontFamily:"monospace",width:44,textAlign:"center",flexShrink:0}}>{e.method}</span>
              <span style={{color:T.accent,fontFamily:"monospace",fontSize:11,width:220,flexShrink:0}}>{e.path}</span>
              <span style={{color:T.muted,fontSize:11}}>{e.desc}</span>
            </div>
          ))}
        </div>
      )}

      {tab==="usage" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            {l:"Requests Today",v:"4,291",s:"↑ 12% vs yesterday",color:T.accent},
            {l:"Error Rate",v:"0.04%",s:"↓ 0.01% improved",color:T.gold},
            {l:"Avg Latency",v:"84ms",s:"p50 across all endpoints",color:T.blue},
            {l:"Rate Limit Hits",v:"3",s:"Past 24 hours",color:T.red},
            {l:"Active Keys",v:"3",s:"2 live, 1 sandbox",color:T.accent},
            {l:"Webhook Success",v:"99.7%",s:"Past 7 days",color:T.accent},
          ].map(s=>(
            <div key={s.l} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
              <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6}}>{s.l}</div>
              <div style={{color:T.text,fontSize:22,fontWeight:700,fontFamily:"monospace"}}>{s.v}</div>
              <div style={{color:s.color,fontSize:10,marginTop:4}}>{s.s}</div>
            </div>
          ))}
        </div>
      )}

      {tab==="webhooks" && (
        <div>
          <div style={{background:`${T.blue}08`,border:`1px solid ${T.blue}30`,borderRadius:10,padding:"14px 16px",marginBottom:14}}>
            <div style={{color:T.blue,fontWeight:700,fontSize:12,marginBottom:4}}>Webhook Events Available</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["transfer.settled","transfer.flagged","kyb.approved","kyb.rejected","escrow.released","aml.alert","wallet.balance_low"].map(e=>(
                <Tag key={e} color={T.blue}>{e}</Tag>
              ))}
            </div>
          </div>
          {[
            {url:"https://erp.rosneft.ru/hooks/aegis",events:["transfer.settled","transfer.flagged"],success:"99.8%",lastTriggered:"2 mins ago"},
            {url:"https://accounting.rosneft.ru/ledger",events:["transfer.settled"],success:"100%",lastTriggered:"14 mins ago"},
          ].map((w,i)=>(
            <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{color:T.accent,fontFamily:"monospace",fontSize:11}}>{w.url}</span>
                <span style={{color:T.accent,fontSize:10}}>Success: {w.success}</span>
              </div>
              <div style={{display:"flex",gap:6}}>
                {w.events.map(e=><Tag key={e} color={T.blue}>{e}</Tag>)}
              </div>
              <div style={{color:T.muted,fontSize:10,marginTop:6}}>Last triggered: {w.lastTriggered}</div>
            </div>
          ))}
          <Btn>+ Register Webhook</Btn>
        </div>
      )}

      {tab==="sandbox" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:4}}>Sandbox Environment</div>
            <div style={{color:T.muted,fontSize:11,marginBottom:14}}>Test the full API with faucet wallets and mock KYB approvals. No real funds involved.</div>
            <div style={{background:`${T.gold}08`,border:`1px solid ${T.gold}30`,borderRadius:8,padding:"12px",marginBottom:14}}>
              <div style={{color:T.gold,fontWeight:700,fontSize:11,marginBottom:4}}>Sandbox Base URL</div>
              <code style={{color:T.text,fontSize:11,fontFamily:"monospace"}}>https://sandbox-api.aegisledger.com/v1</code>
            </div>
            {[{l:"Faucet USDC Balance",v:"10,000,000 USDC",color:T.accent},{l:"Faucet USDT Balance",v:"10,000,000 USDT",color:T.accent},{l:"Sandbox Companies",v:"5 pre-approved",color:T.blue},{l:"Reset Frequency",v:"Every 24h",color:T.muted}].map(s=>(
              <div key={s.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}20`}}>
                <span style={{color:T.muted,fontSize:11}}>{s.l}</span>
                <span style={{color:s.color,fontSize:11,fontWeight:600}}>{s.v}</span>
              </div>
            ))}
            <Btn style={{marginTop:14}}>Generate Sandbox API Key</Btn>
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Quick Test</div>
            <div style={{background:"#0A1E35",borderRadius:8,padding:"14px",fontFamily:"monospace",fontSize:10,color:"#64B5F6",lineHeight:1.7}}>
              <span style={{color:"#4A6A88"}}>// Test transfer</span><br/>
              <span style={{color:"#A5D6A7"}}>curl</span> -X POST \<br/>
              &nbsp;&nbsp;https://sandbox-api.aegisledger.com/v1/transfers \<br/>
              &nbsp;&nbsp;-H <span style={{color:"#F0B429"}}>"Authorization: Bearer ak_test_..."</span> \<br/>
              &nbsp;&nbsp;-H <span style={{color:"#F0B429"}}>"Content-Type: application/json"</span> \<br/>
              &nbsp;&nbsp;-d <span style={{color:"#F0B429"}}>'{`{"amount":"50000","asset":"USDC_ETH","to":"0x..."}`}'</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BILLING & SUBSCRIPTION SCREEN ───────────────────────────────
function Billing() {
  const [tab,setTab] = useState("subscription");
  const tiers = [
    {id:"starter",name:"Starter",price:"$2,500",period:"/month",limit:"Up to $10M/month",features:["5 users","2 API keys","Basic AML screening","Email support","Standard settlement"],current:false,color:T.muted},
    {id:"growth",name:"Growth",price:"$8,500",period:"/month",limit:"Up to $100M/month",features:["25 users","10 API keys","Advanced AML + EDD","Priority support","Smart contract escrow","Recurring payments","Webhook delivery"],current:true,color:T.accent},
    {id:"enterprise",name:"Enterprise",price:"Custom",period:"",limit:"Unlimited",features:["Unlimited users","Unlimited API keys","Full compliance suite","Dedicated account manager","Custom SLA","White-label option","HSM key storage","VARA reporting suite"],current:false,color:T.gold},
  ];

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:20}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Billing & Subscription</div>
        <div style={{color:T.muted,fontSize:12}}>Manage your plan, usage, and invoices</div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[{id:"subscription",l:"Subscription"},{id:"usage",l:"Usage & Fees"},{id:"invoices",l:"Invoices"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?T.accentGlow:"transparent",color:tab===t.id?T.accent:T.muted,border:`1px solid ${tab===t.id?T.accent+"35":T.border}`,padding:"6px 14px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:600}}>{t.l}</button>
        ))}
      </div>

      {tab==="subscription" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
          {tiers.map(tier=>(
            <div key={tier.id} style={{background:tier.current?T.accentGlow:T.card,border:`2px solid ${tier.current?T.accent:T.border}`,borderRadius:14,padding:"24px",position:"relative"}}>
              {tier.current && <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:`linear-gradient(135deg,${T.accent},${T.blue})`,color:T.bg,padding:"3px 14px",borderRadius:20,fontSize:9,fontWeight:700}}>CURRENT PLAN</div>}
              <div style={{color:tier.color,fontWeight:700,fontSize:15,marginBottom:6}}>{tier.name}</div>
              <div style={{color:T.text,fontSize:26,fontWeight:700,marginBottom:2}}>{tier.price}<span style={{color:T.muted,fontSize:12,fontWeight:400}}>{tier.period}</span></div>
              <div style={{color:T.muted,fontSize:11,marginBottom:16}}>{tier.limit}</div>
              <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:20}}>
                {tier.features.map(f=>(
                  <div key={f} style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:tier.color,fontWeight:700,fontSize:11}}>done</span>
                    <span style={{color:T.text,fontSize:11}}>{f}</span>
                  </div>
                ))}
              </div>
              {!tier.current && <Btn variant={tier.id==="enterprise"?"gold":"secondary"} fullWidth>{tier.id==="enterprise"?"Contact Sales":"Upgrade"}</Btn>}
            </div>
          ))}
        </div>
      )}

      {tab==="usage" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>This Month Usage</div>
            {[
              {l:"Settlement Volume",v:"$41.8M",limit:"$100M",pct:42},
              {l:"API Requests",v:"68,441",limit:"500,000",pct:14},
              {l:"Active Users",v:"8",limit:"25",pct:32},
              {l:"Webhook Deliveries",v:"2,847",limit:"Unlimited",pct:0},
            ].map(u=>(
              <div key={u.l} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{color:T.text,fontSize:11}}>{u.l}</span>
                  <span style={{color:T.muted,fontSize:10}}>{u.v} / {u.limit}</span>
                </div>
                {u.pct>0 && <div style={{height:6,background:T.sidebar,borderRadius:3}}>
                  <div style={{height:"100%",width:`${u.pct}%`,background:u.pct>80?T.red:u.pct>60?T.gold:T.accent,borderRadius:3}}/>
                </div>}
              </div>
            ))}
          </div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px"}}>
            <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Fee Breakdown</div>
            {[
              {l:"Subscription fee",v:"$8,500.00"},
              {l:"Settlement fees (0.15%)",v:"$627.00"},
              {l:"FX spread income",v:"$1,240.00"},
              {l:"Total this month",v:"$10,367.00",bold:true},
            ].map(f=>(
              <div key={f.l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${T.border}20`}}>
                <span style={{color:T.muted,fontSize:11}}>{f.l}</span>
                <span style={{color:f.bold?T.accent:T.text,fontWeight:f.bold?700:400,fontSize:f.bold?13:11}}>{f.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="invoices" && (
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:T.sidebar}}>
                {["Invoice #","Period","Amount","Status","Actions"].map(h=>(
                  <th key={h} style={{textAlign:"left",color:T.muted,fontSize:9,letterSpacing:"0.6px",textTransform:"uppercase",padding:"10px 14px",fontWeight:600,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {id:"INV-2026-003",period:"March 2026",amount:"$10,367.00",status:"pending"},
                {id:"INV-2026-002",period:"February 2026",amount:"$9,841.00",status:"paid"},
                {id:"INV-2026-001",period:"January 2026",amount:"$8,916.00",status:"paid"},
              ].map(inv=>(
                <tr key={inv.id} style={{borderBottom:`1px solid ${T.border}20`}}>
                  <td style={{padding:"11px 14px",color:T.accent,fontFamily:"monospace",fontSize:11}}>{inv.id}</td>
                  <td style={{padding:"11px 14px",color:T.text,fontSize:11}}>{inv.period}</td>
                  <td style={{padding:"11px 14px",color:T.text,fontWeight:700,fontSize:11}}>{inv.amount}</td>
                  <td style={{padding:"11px 14px"}}><Badge s={inv.status}/></td>
                  <td style={{padding:"11px 14px"}}>
                    <button style={{background:T.accentGlow,color:T.accent,border:`1px solid ${T.accent}30`,padding:"4px 10px",borderRadius:5,cursor:"pointer",fontSize:9,fontWeight:700}}>Download PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── TREASURY FORECAST SCREEN ─────────────────────────────────────
function TreasuryForecast() {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"];
  const inflows =  [12.4, 18.7, 22.1, 24.5, 19.8, 28.3, 31.2, 26.8, 34.1];
  const outflows = [8.2,  14.3, 16.8, 18.1, 15.2, 21.4, 24.7, 20.1, 26.8];
  const maxVal = Math.max(...inflows, ...outflows);
  const isForecast = (i) => i >= 6;

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:20}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Treasury Cash Flow Forecast</div>
        <div style={{color:T.muted,fontSize:12}}>90-day projected inflows and outflows based on scheduled transfers and active escrows</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          {l:"Current Balance",v:"$24.8M",color:T.accent},
          {l:"Scheduled Inflows (90d)",v:"$92.1M",color:T.accent},
          {l:"Scheduled Outflows (90d)",v:"$71.6M",color:T.red},
          {l:"Forecast Net Position",v:"+$21.3M",color:T.gold},
        ].map(s=>(
          <div key={s.l} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px"}}>
            <div style={{color:T.muted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6}}>{s.l}</div>
            <div style={{color:s.color,fontWeight:700,fontSize:20,fontFamily:"monospace"}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:18}}>
          <div style={{color:T.text,fontWeight:600,fontSize:13}}>Monthly Cash Flow (USD millions)</div>
          <div style={{display:"flex",gap:12}}>
            {[{l:"Inflows",c:T.accent},{l:"Outflows",c:T.red},{l:"Forecast",c:T.gold}].map(l=>(
              <div key={l.l} style={{display:"flex",gap:5,alignItems:"center"}}>
                <div style={{width:10,height:4,background:l.c,borderRadius:2}}/>
                <span style={{color:T.muted,fontSize:10}}>{l.l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"flex-end",height:140}}>
          {months.map((m,i)=>(
            <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:120}}>
                <div style={{flex:1,background:isForecast(i)?`${T.accent}50`:`${T.accent}`,borderRadius:"3px 3px 0 0",height:`${(inflows[i]/maxVal)*110}px`,border:isForecast(i)?`1px dashed ${T.accent}`:undefined}}/>
                <div style={{flex:1,background:isForecast(i)?`${T.red}50`:`${T.red}`,borderRadius:"3px 3px 0 0",height:`${(outflows[i]/maxVal)*110}px`,border:isForecast(i)?`1px dashed ${T.red}`:undefined}}/>
              </div>
              <span style={{color:isForecast(i)?T.gold:T.muted,fontSize:8,fontWeight:isForecast(i)?700:400}}>{m}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"18px"}}>
        <div style={{color:T.text,fontWeight:600,fontSize:13,marginBottom:14}}>Upcoming Cash Events</div>
        {[
          {date:"Mar 10, 2026",type:"Escrow Release",counterparty:"Emirates National Oil Co",amount:"+$2,400,000",status:"confirmed"},
          {date:"Mar 15, 2026",type:"Recurring Payment",counterparty:"Trans-Caspian Logistics",amount:"-$180,000",status:"scheduled"},
          {date:"Apr 1, 2026",type:"Recurring Payment",counterparty:"ENOC Refinery AE",amount:"-$2,400,000",status:"scheduled"},
          {date:"Apr 12, 2026",type:"Escrow Expiry",counterparty:"Siberian Grain Holdings",amount:"+$1,800,000",status:"pending"},
        ].map((e,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}20`}}>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{color:T.muted,fontSize:10,width:80,flexShrink:0}}>{e.date}</span>
              <div>
                <div style={{color:T.text,fontSize:11,fontWeight:600}}>{e.counterparty}</div>
                <div style={{color:T.muted,fontSize:10}}>{e.type}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <Tag color={e.status==="confirmed"?T.accent:T.muted}>{e.status}</Tag>
              <span style={{color:e.amount.startsWith("+")?T.accent:T.red,fontWeight:700,fontSize:12,fontFamily:"monospace"}}>{e.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CASE MANAGEMENT SCREEN ───────────────────────────────────────
function CaseManagement() {
  const [filter,setFilter] = useState("all");
  const [selected,setSelected] = useState(null);

  const CASES = [
    {id:"CASE-2026-A4F2B1",entity:"Trans-Caspian Logistics",type:"Suspicious Transaction",severity:"critical",status:"open",assigned:"Ivan Sokolov",created:"Mar 4 09:14",desc:"Transaction TXN-2024-0845 flagged with AML score 88. Possible sanctions proximity via correspondent bank in secondary jurisdiction.",notes:[{author:"Ivan Sokolov",time:"09:22",text:"Initiated enhanced due diligence. Requesting account statements for Q4 2025."},{author:"System",time:"09:14",text:"Auto-flagged by Rule: Sanctions proximity score > 80."}]},
    {id:"CASE-2026-B3E9C2",entity:"Unknown Corp Ltd",type:"KYB Document Discrepancy",severity:"high",status:"open",assigned:"Maria Compliance",created:"Mar 3 14:30",desc:"Submitted registration documents show discrepancy in UBO declaration versus Companies House records.",notes:[]},
    {id:"CASE-2026-C7D1A5",entity:"Siberian Grain Holdings",type:"Adverse Media Alert",severity:"medium",status:"review",assigned:"Ivan Sokolov",created:"Mar 2 11:00",desc:"Adverse media screening returned 3 articles referencing potential VAT fraud investigation in 2023.",notes:[]},
    {id:"CASE-2026-D2F8B3",entity:"Dubai Metals & Commodities",type:"Large Cash Transaction",severity:"low",status:"closed",assigned:"Maria Compliance",created:"Feb 28 16:00",desc:"$8.2M transaction flagged for manual review. Confirmed legitimate commodity hedging activity.",notes:[]},
  ];

  const filtered = filter==="all"?CASES:CASES.filter(c=>c.status===filter||c.severity===filter);
  const sevColor = {critical:T.red,high:T.gold,medium:T.blue,low:T.muted};

  return (
    <div style={{padding:"24px",overflowY:"auto",height:"calc(100vh - 56px)"}}>
      <div style={{marginBottom:18}}>
        <div style={{color:T.text,fontWeight:700,fontSize:18,marginBottom:4}}>Case Management</div>
        <div style={{color:T.muted,fontSize:12}}>AML investigation cases from alert to resolution</div>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {["all","open","review","closed","critical","high","medium"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?T.accentGlow:"transparent",color:filter===f?T.accent:T.muted,border:`1px solid ${filter===f?T.accent+"35":T.border}`,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>{f}</button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:selected?"1fr 1fr":"1fr",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(c=>(
            <div key={c.id} onClick={()=>setSelected(selected?.id===c.id?null:c)} style={{background:selected?.id===c.id?T.accentGlow:T.card,border:`1px solid ${selected?.id===c.id?T.accent+"40":T.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{color:T.accent,fontFamily:"monospace",fontSize:10}}>{c.id}</span>
                  <span style={{background:`${sevColor[c.severity]}15`,color:sevColor[c.severity],padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,textTransform:"uppercase"}}>{c.severity}</span>
                  <Badge s={c.status}/>
                </div>
                <span style={{color:T.muted,fontSize:10}}>{c.created}</span>
              </div>
              <div style={{color:T.text,fontWeight:700,fontSize:12,marginBottom:2}}>{c.entity}</div>
              <div style={{color:T.muted,fontSize:11}}>{c.type} · Assigned: {c.assigned}</div>
            </div>
          ))}
        </div>

        {selected && (
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",height:"fit-content"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
              <div>
                <div style={{color:T.accent,fontFamily:"monospace",fontSize:10,marginBottom:4}}>{selected.id}</div>
                <div style={{color:T.text,fontWeight:700,fontSize:14}}>{selected.entity}</div>
              </div>
              <button onClick={()=>setSelected(null)} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{background:T.sidebar,borderRadius:8,padding:"12px",marginBottom:14}}>
              <div style={{color:T.muted,fontSize:10,marginBottom:4}}>Description</div>
              <div style={{color:T.text,fontSize:11,lineHeight:1.6}}>{selected.desc}</div>
            </div>
            <div style={{color:T.muted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:8}}>Investigation Notes</div>
            {selected.notes.map((n,i)=>(
              <div key={i} style={{background:T.sidebar,borderRadius:8,padding:"10px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{color:T.accent,fontSize:10,fontWeight:700}}>{n.author}</span>
                  <span style={{color:T.muted,fontSize:9}}>{n.time}</span>
                </div>
                <div style={{color:T.text,fontSize:11}}>{n.text}</div>
              </div>
            ))}
            <textarea placeholder="Add investigation note..." style={{width:"100%",background:T.sidebar,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",color:T.text,fontSize:11,resize:"vertical",minHeight:70,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6}}>
              <Btn small>Add Note</Btn>
              <Btn small variant="secondary">Generate SAR</Btn>
              {selected.status!=="closed" && <Btn small variant="danger">Close Case</Btn>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UPDATED SIDEBAR with new nav items ──────────────────────────
const navMapV2 = {
  admin:      [
    {id:"dashboard",icon:"G",l:"Dashboard"},{id:"transactions",icon:"S",l:"Transactions"},
    {id:"wallets",icon:"V",l:"Wallets"},{id:"compliance",icon:"F",l:"Compliance"},
    {id:"rules",icon:"R",l:"AML Rules"},{id:"cases",icon:"C",l:"Case Mgmt"},
    {id:"trade",icon:"T",l:"Trade Finance"},{id:"analytics",icon:"A",l:"Analytics"},
    {id:"forecast",icon:"F",l:"Forecast"},{id:"recurring",icon:"S",l:"Recurring"},
    {id:"addressbook",icon:"B",l:"Address Book"},{id:"developer",icon:"D",l:"Developer"},
    {id:"billing",icon:"$",l:"Billing"},{id:"admin",icon:"X",l:"Admin Panel"},
    {id:"audit",icon:"L",l:"Audit Log"},{id:"sessions",icon:"D",l:"Sessions"},
    {id:"profile",icon:"P",l:"Profile"}
  ],
  treasury:   [
    {id:"dashboard",icon:"G",l:"Dashboard"},{id:"transactions",icon:"S",l:"Settlements"},
    {id:"wallets",icon:"V",l:"Wallets"},{id:"trade",icon:"T",l:"Trade Finance"},
    {id:"analytics",icon:"A",l:"Analytics"},{id:"forecast",icon:"F",l:"Forecast"},
    {id:"recurring",icon:"S",l:"Recurring"},{id:"addressbook",icon:"B",l:"Address Book"},
    {id:"developer",icon:"D",l:"Developer"},{id:"billing",icon:"$",l:"Billing"},
    {id:"sessions",icon:"D",l:"Sessions"},{id:"profile",icon:"P",l:"Profile"}
  ],
  compliance: [
    {id:"dashboard",icon:"G",l:"Dashboard"},{id:"compliance",icon:"F",l:"Compliance Center"},
    {id:"rules",icon:"R",l:"AML Rules"},{id:"cases",icon:"C",l:"Case Mgmt"},
    {id:"transactions",icon:"S",l:"Transactions"},{id:"analytics",icon:"A",l:"Analytics"},
    {id:"audit",icon:"L",l:"Audit Log"},{id:"sessions",icon:"D",l:"Sessions"},
    {id:"profile",icon:"P",l:"Profile"}
  ],
  operator:   [
    {id:"dashboard",icon:"G",l:"Dashboard"},{id:"transactions",icon:"S",l:"Payments"},
    {id:"trade",icon:"T",l:"Documents"},{id:"addressbook",icon:"B",l:"Address Book"},
    {id:"recurring",icon:"S",l:"Recurring"},{id:"sessions",icon:"D",l:"Sessions"},
    {id:"profile",icon:"P",l:"Profile"}
  ],
  logistics:  [
    {id:"dashboard",icon:"G",l:"Dashboard"},{id:"trade",icon:"T",l:"Shipments"},
    {id:"profile",icon:"P",l:"Profile"}
  ],
};

const screenNames = {
  dashboard:"Platform Overview",transactions:"Settlement History",wallets:"Digital Asset Vaults",
  compliance:"Compliance Center",rules:"AML Rules Engine",cases:"Case Management",
  trade:"Trade Finance & Escrow",analytics:"Transaction Analytics",forecast:"Treasury Forecast",
  recurring:"Recurring Payments",addressbook:"Address Book",developer:"Developer Portal",
  billing:"Billing & Subscription",admin:"Admin Panel",audit:"Audit Log",
  sessions:"Active Sessions",profile:"My Profile",
};

// ─── ROOT APP ────────────────────────────────────────────────────
export default function App() {
  const [loggedIn,setLoggedIn]   = useState(false);
  const [showSignup,setSignup]   = useState(false);
  const [showReset,setReset]     = useState(false);
  const [screen,setScreen]       = useState("dashboard");
  const [role,setRole]           = useState("admin");

  useEffect(()=>{
    const l=document.createElement("link");
    l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    document.body.style.cssText="margin:0;padding:0;font-family:'Plus Jakarta Sans',sans-serif;background:#04101E;";
  },[]);

  if (!loggedIn) {
    if (showSignup) return <SignupFlow onBackToLogin={()=>setSignup(false)}/>;
    if (showReset)  return <PasswordReset onBack={()=>setReset(false)}/>;
    return <Login onLogin={()=>setLoggedIn(true)} onSignup={()=>setSignup(true)} onForgotPassword={()=>setReset(true)}/>;
  }

  const items = navMapV2[role] || navMapV2.admin;

  return (
    <div style={{display:"flex",background:T.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      {/* Sidebar */}
      <div style={{width:210,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
        <div style={{padding:"20px 16px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,background:`linear-gradient(135deg,${T.accent},#0077BB)`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:T.bg,fontWeight:700,flexShrink:0}}>A</div>
            <div>
              <div style={{color:T.text,fontWeight:700,fontSize:14}}>AegisLedger</div>
              <div style={{color:T.muted,fontSize:9,letterSpacing:"1px",textTransform:"uppercase"}}>B2B Settlement</div>
            </div>
          </div>
        </div>
        <div style={{padding:"10px 10px 0"}}>
          <select value={role} onChange={e=>setRole(e.target.value)} style={{width:"100%",background:T.card,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",fontSize:11,cursor:"pointer",outline:"none"}}>
            {Object.entries(roleLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <nav style={{flex:1,padding:"14px 10px",overflowY:"auto"}}>
          {items.map(item=>(
            <button key={item.id} onClick={()=>setScreen(item.id)} style={{
              width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,
              background:screen===item.id?T.accentGlow:"transparent",
              border:screen===item.id?`1px solid ${T.accent}25`:"1px solid transparent",
              color:screen===item.id?T.accent:T.muted,cursor:"pointer",textAlign:"left",
              fontSize:12,fontWeight:screen===item.id?600:400,marginBottom:2,transition:"all 0.12s"}}>
              <span style={{width:18,height:18,borderRadius:4,background:screen===item.id?`${T.accent}20`:T.dim,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0}}>{item.icon}</span>
              {item.l}
            </button>
          ))}
        </nav>
        <div style={{padding:"14px",borderTop:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${T.dim},#0A1E35)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.accent,fontWeight:700,border:`1px solid ${T.border}`,flexShrink:0}}>
              {roleLabels[role]?.charAt(0)}
            </div>
            <div style={{overflow:"hidden",flex:1}}>
              <div style={{color:T.text,fontSize:11,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{roleLabels[role]}</div>
              <div style={{color:T.accent,fontSize:9,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>Online
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{background:T.sidebar,borderBottom:`1px solid ${T.border}`,padding:"0 24px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,flexShrink:0}}>
          <div>
            <div style={{color:T.text,fontWeight:600,fontSize:14}}>{screenNames[screen]||"AegisLedger"}</div>
            <div style={{color:T.muted,fontSize:10}}>RUB to AED Cross-Border Settlement · VARA Licensed</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,padding:"4px 10px",borderRadius:20}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:T.accent,display:"inline-block",boxShadow:`0 0 6px ${T.accent}`}}/>
              <span style={{color:T.accent,fontSize:10,fontWeight:700}}>LIVE</span>
            </div>
            <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setScreen("sessions")}>
              <div style={{width:30,height:30,background:T.card,border:`1px solid ${T.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.muted,fontWeight:700}}>S</div>
            </div>
            <div style={{position:"relative",cursor:"pointer"}}>
              <div style={{width:30,height:30,background:T.card,border:`1px solid ${T.border}`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.muted,fontWeight:700}}>N</div>
              <div style={{position:"absolute",top:-4,right:-4,width:14,height:14,background:T.red,borderRadius:"50%",fontSize:8,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>3</div>
            </div>
          </div>
        </div>

        {/* Screens */}
        {screen==="dashboard"    && <Dashboard/>}
        {screen==="transactions" && <Transactions/>}
        {screen==="wallets"      && <Wallets/>}
        {screen==="compliance"   && <Compliance/>}
        {screen==="rules"        && <ComplianceRules/>}
        {screen==="cases"        && <CaseManagement/>}
        {screen==="trade"        && <TradeFinance/>}
        {screen==="analytics"    && <Analytics/>}
        {screen==="forecast"     && <TreasuryForecast/>}
        {screen==="recurring"    && <RecurringPayments/>}
        {screen==="addressbook"  && <AddressBook/>}
        {screen==="developer"    && <DeveloperPortal/>}
        {screen==="billing"      && <Billing/>}
        {screen==="profile"      && <Profile role={role}/>}
        {screen==="sessions"     && <Sessions/>}
        {screen==="audit"        && <AuditLog role={role}/>}
        {screen==="admin"        && role==="admin" && <AdminPanel/>}
      </div>
    </div>
  );
}
