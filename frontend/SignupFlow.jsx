import { useState, useEffect, useRef } from "react";

// ─── THEME ────────────────────────────────────────────────────────
const T = {
  bg: "#04101E", card: "#0A1828", cardHover: "#0D1F35",
  border: "#112235", accent: "#00E5B0", accentGlow: "#00E5B012",
  gold: "#F0B429", red: "#F04438", blue: "#4A8FE2", purple: "#8B5CF6",
  text: "#E2EAF4", muted: "#4A6A88", dim: "#1A3050", white: "#FFFFFF",
  sidebar: "#060F1C",
};

// ─── DATA ─────────────────────────────────────────────────────────
const BANNED_COUNTRIES = ["Afghanistan","Algeria","Bangladesh","China","Egypt","Iraq","Kuwait","Nepal","North Macedonia","Tunisia","Morocco"];
const LEGAL_COUNTRIES  = ["United Arab Emirates","United States","United Kingdom","Germany","France","Singapore","Japan","Australia","Switzerland","Canada","Portugal","Malta","South Korea","Brazil","Vietnam","South Africa","New Zealand","Netherlands","Sweden","Norway"];
const ALL_COUNTRIES = [...new Set([...BANNED_COUNTRIES, ...LEGAL_COUNTRIES,
  "Russia","India","Turkey","Indonesia","Saudi Arabia","Qatar","Nigeria","Pakistan",
  "Ukraine","Poland","Italy","Spain","Mexico","Argentina","Thailand","Malaysia",
  "Philippines","Israel","Kenya","Ghana","Egypt","Jordan","Bahrain","Oman","Kuwait",
])].sort();

const STABLECOINS = [
  { id:"USDC_ETH",  label:"USDC",    network:"Ethereum",  logo:"💵", desc:"USD Coin · Circle · $1 peg" },
  { id:"USDT_POLY", label:"USDT",    network:"Polygon",   logo:"💲", desc:"Tether · Polygon · $1 peg" },
  { id:"AE_COIN",   label:"AE Coin", network:"ADX Chain", logo:"🇦🇪", desc:"AED-backed · CBUAE regulated" },
  { id:"USDC_SOL",  label:"USDC",    network:"Solana",    logo:"⚡", desc:"USD Coin · Solana · Low fees" },
];

const FIAT_CURRENCIES = [
  { id:"RUB", label:"Russian Ruble",    symbol:"₽", flag:"🇷🇺" },
  { id:"AED", label:"UAE Dirham",       symbol:"د.إ", flag:"🇦🇪" },
  { id:"USD", label:"US Dollar",        symbol:"$",  flag:"🇺🇸" },
  { id:"EUR", label:"Euro",             symbol:"€",  flag:"🇪🇺" },
  { id:"GBP", label:"British Pound",    symbol:"£",  flag:"🇬🇧" },
  { id:"CNH", label:"Chinese Yuan",     symbol:"¥",  flag:"🇨🇳" },
];

const DOC_TYPES = [
  { id:"cert_inc",    label:"Certificate of Incorporation",  icon:"📜", required:true },
  { id:"trade_lic",   label:"Trade License",                 icon:"🏢", required:true },
  { id:"ubo_decl",    label:"UBO Declaration",               icon:"👥", required:true },
  { id:"bank_stmt",   label:"Bank Statement (3 months)",     icon:"🏦", required:true },
  { id:"passport",    label:"Director Passport / ID",        icon:"🪪", required:true },
  { id:"utility",     label:"Proof of Address",              icon:"📮", required:false },
];

// OCR mock extraction results
const MOCK_OCR = {
  cert_inc:  { extracted: { "Company Name":"Rosneft Trading SA", "Reg. Number":"1023501049274", "Jurisdiction":"Russian Federation", "Incorporation Date":"12 Mar 2003" }, confidence:96 },
  trade_lic: { extracted: { "License No":"DMCC-123456", "Activity":"Commodity Trading", "Expiry":"31 Dec 2026", "Issuer":"DMCC Authority" }, confidence:94 },
  ubo_decl:  { extracted: { "UBO Name":"Alexei Petrov", "Ownership":"67.4%", "Nationality":"Russian", "DOB":"15 Jun 1971" }, confidence:91 },
  bank_stmt: { extracted: { "Bank":"VTB Bank", "Account":"40702810...4521", "Balance":"₽ 847,200,000", "Period":"Oct–Dec 2024" }, confidence:98 },
  passport:  { extracted: { "Full Name":"Alexei Petrov", "Passport No":"724816392", "Nationality":"Russian", "Expiry":"22 Aug 2029" }, confidence:97 },
  utility:   { extracted: { "Name":"Rosneft Trading SA", "Address":"Moscow, Sofiyskaya Emb 26/1", "Date":"Nov 2024" }, confidence:88 },
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────
const Input = ({ label, value, onChange, type="text", placeholder="", required=false, hint="" }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
      <span style={{ color:T.muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600 }}>
        {label}{required && <span style={{ color:T.red }}> *</span>}
      </span>
      {hint && <span style={{ color:T.dim, fontSize:10 }}>{hint}</span>}
    </label>
    <input value={value} onChange={e=>onChange(e.target.value)} type={type} placeholder={placeholder}
      style={{ width:"100%", background:T.sidebar, border:`1px solid ${T.border}`, color:T.text,
        padding:"10px 12px", borderRadius:7, fontSize:12, boxSizing:"border-box", outline:"none",
        transition:"border-color 0.2s" }}
      onFocus={e=>e.target.style.borderColor=T.accent}
      onBlur={e=>e.target.style.borderColor=T.border}
    />
  </div>
);

const Select = ({ label, value, onChange, options, required=false }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ color:T.muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, display:"block", marginBottom:5 }}>
      {label}{required && <span style={{ color:T.red }}> *</span>}
    </label>
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{ width:"100%", background:T.sidebar, border:`1px solid ${T.border}`, color:value?T.text:T.muted,
        padding:"10px 12px", borderRadius:7, fontSize:12, outline:"none", cursor:"pointer" }}>
      <option value="">Select {label}…</option>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);

const Btn = ({ children, onClick, variant="primary", disabled=false, fullWidth=false, small=false }) => {
  const styles = {
    primary: { background:`linear-gradient(135deg,${T.accent},#0088CC)`, color:T.bg, border:"none" },
    secondary: { background:"transparent", color:T.muted, border:`1px solid ${T.border}` },
    danger: { background:"#F0443815", color:T.red, border:`1px solid ${T.red}30` },
    gold: { background:`linear-gradient(135deg,${T.gold},#E07B00)`, color:T.bg, border:"none" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...styles[variant], borderRadius:8, padding:small?"6px 14px":"11px 20px",
        cursor:disabled?"not-allowed":"pointer", fontSize:small?10:12, fontWeight:700,
        letterSpacing:"0.4px", opacity:disabled?0.5:1,
        width:fullWidth?"100%":"auto", transition:"opacity 0.2s" }}>
      {children}
    </button>
  );
};

const StepDot = ({ n, current, done }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
    <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700,
      background: done ? T.accent : current ? T.accentGlow : T.dim+"80",
      border: `2px solid ${done ? T.accent : current ? T.accent : T.dim}`,
      color: done ? T.bg : current ? T.accent : T.muted,
      boxShadow: current ? `0 0 12px ${T.accent}60` : "none", transition:"all 0.3s" }}>
      {done ? "✓" : n}
    </div>
  </div>
);

const Tag = ({ children, color=T.accent }) => (
  <span style={{ background:`${color}15`, color, border:`1px solid ${color}30`, padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:700 }}>
    {children}
  </span>
);

// ─── STEP 1: COMPANY DETAILS ──────────────────────────────────────
function Step1({ data, setData, onNext }) {
  const [errors, setErrors] = useState({});
  const validate = () => {
    const e = {};
    if (!data.companyName) e.companyName = "Required";
    if (!data.regNumber) e.regNumber = "Required";
    if (!data.country) e.country = "Required";
    if (!data.email || !data.email.includes("@")) e.email = "Valid corporate email required";
    if (!data.phone) e.phone = "Required";
    if (!data.revenue) e.revenue = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const isBanned = BANNED_COUNTRIES.includes(data.country);

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Company Information</div>
        <div style={{ color:T.muted, fontSize:12 }}>Tell us about your organisation. All fields marked * are required by VARA KYB regulations.</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <div style={{ gridColumn:"1/-1" }}>
          <Input label="Legal Company Name" value={data.companyName} onChange={v=>setData({...data,companyName:v})} required placeholder="e.g. Rosneft Trading SA" />
        </div>
        <Input label="Registration Number" value={data.regNumber} onChange={v=>setData({...data,regNumber:v})} required placeholder="e.g. 1023501049274" />
        <Input label="VAT / Tax ID" value={data.vatId||""} onChange={v=>setData({...data,vatId:v})} placeholder="Optional" />
        <div style={{ gridColumn:"1/-1" }}>
          <Select label="Country of Incorporation" value={data.country} onChange={v=>setData({...data,country:v})} options={ALL_COUNTRIES} required />
        </div>
        {isBanned && (
          <div style={{ gridColumn:"1/-1", background:"#F0B42912", border:`1px solid ${T.gold}40`, borderRadius:8, padding:"12px 14px", marginBottom:10 }}>
            <div style={{ color:T.gold, fontWeight:700, fontSize:12, marginBottom:4 }}>⚠️ Restricted Jurisdiction Detected</div>
            <div style={{ color:T.text, fontSize:11, lineHeight:1.6 }}>
              <strong>{data.country}</strong> currently restricts cryptocurrency activities. You may still register, but you will need to provide a valid bank account held in a country where crypto is fully legal. This will be required in a later step.
            </div>
          </div>
        )}
        <Select label="Industry / Sector" value={data.sector||""} onChange={v=>setData({...data,sector:v})}
          options={["Energy / Oil & Gas","Metals & Mining","Agricultural Commodities","Manufacturing","Freight & Logistics","Financial Services","Technology","Real Estate","Other"]} required />
        <Select label="Annual Revenue (USD)" value={data.revenue||""} onChange={v=>setData({...data,revenue:v})}
          options={[{value:"<1M",label:"Under $1M"},{value:"1-10M",label:"$1M – $10M"},{value:"10-50M",label:"$10M – $50M"},{value:"50-200M",label:"$50M – $200M"},{value:"200M+",label:"Over $200M"}]} required />
        <Input label="Corporate Email" value={data.email||""} onChange={v=>setData({...data,email:v})} type="email" required placeholder="treasury@yourcompany.com" />
        <Input label="Phone Number" value={data.phone||""} onChange={v=>setData({...data,phone:v})} placeholder="+7 495 000 0000" required />
        <div style={{ gridColumn:"1/-1" }}>
          <Input label="Registered Address" value={data.address||""} onChange={v=>setData({...data,address:v})} required placeholder="Full legal address" />
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div style={{ background:"#F0443812", border:`1px solid ${T.red}30`, borderRadius:7, padding:"10px 12px", marginBottom:14 }}>
          <div style={{ color:T.red, fontSize:11 }}>Please fill in all required fields: {Object.keys(errors).join(", ")}</div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:6 }}>
        <Btn onClick={()=>{ if(validate()) onNext(); }}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── STEP 2: EMAIL OTP ────────────────────────────────────────────
function Step2({ email, onNext, onBack }) {
  const [otp, setOtp] = useState(["","","","","",""]);
  const [sent, setSent] = useState(false);
  const [timer, setTimer] = useState(600); // 10 min
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef([]);
  const MAX_ATTEMPTS = 5;
  const CORRECT_OTP = "482916"; // Mock correct OTP

  useEffect(() => {
    setSent(true);
    const interval = setInterval(() => setTimer(t => { if(t<=1){clearInterval(interval);return 0;} return t-1; }), 1000);
    return () => clearInterval(interval);
  }, []);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const handleDigit = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[i] = val;
    setOtp(next);
    if (val && i < 5) inputRefs.current[i+1]?.focus();
  };

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) { inputRefs.current[i-1]?.focus(); }
    if (e.key === "ArrowLeft" && i > 0) inputRefs.current[i-1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputRefs.current[i+1]?.focus();
  };

  const handlePaste = e => {
    const p = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6).split("");
    if (p.length === 6) { setOtp(p); inputRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  const verify = () => {
    if (locked) return;
    const code = otp.join("");
    if (code.length < 6) { setError("Please enter all 6 digits."); return; }
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    if (code === CORRECT_OTP) {
      setVerified(true); setError("");
      setTimeout(() => onNext(), 1200);
    } else {
      if (newAttempts >= MAX_ATTEMPTS) { setLocked(true); setError("Too many attempts. Account locked for 30 minutes."); }
      else { setError(`Incorrect code. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS-newAttempts===1?"":"s"} remaining.`); }
      setOtp(["","","","","",""]);
      inputRefs.current[0]?.focus();
    }
  };

  const resend = () => { setTimer(600); setAttempts(0); setLocked(false); setError(""); setOtp(["","","","","",""]); };

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Verify Your Email</div>
        <div style={{ color:T.muted, fontSize:12 }}>We sent a 6-digit code to <span style={{ color:T.accent, fontWeight:600 }}>{email}</span>. Enter it below to continue.</div>
      </div>

      <div style={{ background:T.sidebar, border:`1px solid ${T.border}`, borderRadius:10, padding:"20px", marginBottom:20, textAlign:"center" }}>
        <div style={{ color:T.muted, fontSize:10, letterSpacing:"1px", textTransform:"uppercase", marginBottom:4 }}>For demo — use code</div>
        <div style={{ color:T.accent, fontFamily:"monospace", fontSize:28, fontWeight:700, letterSpacing:"12px" }}>482916</div>
      </div>

      {/* OTP Inputs */}
      <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:18 }}>
        {otp.map((d,i) => (
          <input key={i} ref={el=>inputRefs.current[i]=el}
            value={d} onChange={e=>handleDigit(i,e.target.value)}
            onKeyDown={e=>handleKey(i,e)} onPaste={handlePaste} maxLength={1} type="text" inputMode="numeric"
            style={{ width:46, height:56, textAlign:"center", fontSize:24, fontWeight:700, fontFamily:"monospace",
              background: verified?"#00E5B015" : d?T.card:T.sidebar,
              border:`2px solid ${verified?T.accent:d?T.blue:T.border}`,
              color: verified?T.accent:T.text, borderRadius:10, outline:"none",
              boxShadow: d?`0 0 8px ${T.blue}30`:"none", transition:"all 0.15s" }} />
        ))}
      </div>

      {/* Timer */}
      <div style={{ textAlign:"center", marginBottom:14 }}>
        {verified ? (
          <div style={{ color:T.accent, fontWeight:700, fontSize:14 }}>✓ Email verified successfully!</div>
        ) : timer > 0 ? (
          <div style={{ color:T.muted, fontSize:11 }}>Code expires in <span style={{ color:timer<60?T.red:T.gold, fontFamily:"monospace", fontWeight:700 }}>{fmt(timer)}</span></div>
        ) : (
          <div style={{ color:T.red, fontSize:11 }}>Code expired. <span onClick={resend} style={{ color:T.accent, cursor:"pointer", fontWeight:600 }}>Send new code →</span></div>
        )}
      </div>

      {/* Attempt counter */}
      {attempts > 0 && !verified && (
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginBottom:12 }}>
          {Array.from({length:MAX_ATTEMPTS}).map((_,i)=>(
            <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:i<attempts?T.red:T.dim, transition:"background 0.2s" }}/>
          ))}
        </div>
      )}

      {error && <div style={{ background:"#F0443812", border:`1px solid ${T.red}30`, borderRadius:7, padding:"9px 12px", marginBottom:12, color:T.red, fontSize:11, textAlign:"center" }}>{error}</div>}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <div style={{ display:"flex", gap:10 }}>
          {timer === 0 && !locked && <Btn variant="secondary" onClick={resend} small>Resend Code</Btn>}
          <Btn onClick={verify} disabled={locked||otp.join("").length<6||verified||timer===0}>Verify Email →</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 3: DOCUMENT UPLOAD + OCR ───────────────────────────────
function Step3({ country, onNext, onBack }) {
  const [uploads, setUploads] = useState({});
  const [scanning, setScanning] = useState({});
  const [results, setResults] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null);
  const isBanned = BANNED_COUNTRIES.includes(country);

  const simulateUpload = (docId) => {
    setUploads(u=>({...u,[docId]:{name:`${docId}_document.pdf`,size:"2.4 MB",status:"uploading"}}));
    setTimeout(()=>{
      setUploads(u=>({...u,[docId]:{...u[docId],status:"uploaded"}}));
      setScanning(s=>({...s,[docId]:true}));
      setTimeout(()=>{
        setScanning(s=>({...s,[docId]:false}));
        setResults(r=>({...r,[docId]:MOCK_OCR[docId]||{extracted:{},confidence:85}}));
      }, 2000 + Math.random()*1500);
    }, 1000);
  };

  const requiredDocs = DOC_TYPES.filter(d=>d.required);
  const allRequired = requiredDocs.every(d=>results[d.id]);
  const score = Math.round((Object.keys(results).length / DOC_TYPES.length) * 100);

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Document Verification</div>
        <div style={{ color:T.muted, fontSize:12, lineHeight:1.6 }}>
          Upload official corporate documents. Our system uses <Tag>AI OCR</Tag> to auto-extract data, followed by <Tag color={T.blue}>Manual Review</Tag> by a Compliance Officer and <Tag color={T.purple}>Sumsub API</Tag> verification.
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background:T.sidebar, borderRadius:8, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ color:T.muted, fontSize:10 }}>Verification completeness</span>
            <span style={{ color:T.accent, fontSize:10, fontWeight:700 }}>{Object.keys(results).length}/{DOC_TYPES.length} docs</span>
          </div>
          <div style={{ background:T.dim, borderRadius:4, height:4 }}>
            <div style={{ width:`${score}%`, height:"100%", background:`linear-gradient(90deg,${T.accent},${T.blue})`, borderRadius:4, transition:"width 0.4s" }}/>
          </div>
        </div>
        <div style={{ color:allRequired?T.accent:T.gold, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
          {allRequired?"✓ Required docs met":"Required docs missing"}
        </div>
      </div>

      {/* Document Cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
        {DOC_TYPES.map(doc => {
          const uploaded = uploads[doc.id];
          const isScanning = scanning[doc.id];
          const result = results[doc.id];
          return (
            <div key={doc.id} style={{ background:T.sidebar, border:`1px solid ${result?T.accent+"40":T.border}`, borderRadius:10, padding:"14px 16px", transition:"border-color 0.3s" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{doc.icon}</span>
                  <div>
                    <div style={{ color:T.text, fontSize:12, fontWeight:600 }}>
                      {doc.label} {doc.required && <span style={{ color:T.red, fontSize:10 }}>*</span>}
                    </div>
                    {uploaded && <div style={{ color:T.muted, fontSize:10, marginTop:2 }}>{uploaded.name} · {uploaded.size}</div>}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {result && <Tag>✓ Extracted</Tag>}
                  {isScanning && <div style={{ color:T.gold, fontSize:10, animation:"pulse 1s infinite" }}>⟳ Scanning…</div>}
                  {!uploaded && !isScanning && (
                    <button onClick={()=>simulateUpload(doc.id)}
                      style={{ background:T.accentGlow, color:T.accent, border:`1px solid ${T.accent}30`, padding:"5px 12px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:700 }}>
                      Upload
                    </button>
                  )}
                  {uploaded && !result && !isScanning && <Tag color={T.gold}>Scanning…</Tag>}
                  {result && (
                    <button onClick={()=>setPreviewDoc(previewDoc===doc.id?null:doc.id)}
                      style={{ background:"transparent", color:T.blue, border:`1px solid ${T.blue}30`, padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:10 }}>
                      {previewDoc===doc.id?"Hide":"View"}
                    </button>
                  )}
                </div>
              </div>

              {/* OCR Result Panel */}
              {result && previewDoc===doc.id && (
                <div style={{ marginTop:12, background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                    <div style={{ color:T.text, fontSize:11, fontWeight:600 }}>AI OCR Extraction Results</div>
                    <div style={{ display:"flex", gap:6 }}>
                      <Tag color={T.accent}>Confidence: {result.confidence}%</Tag>
                      <Tag color={T.blue}>Sumsub: Queued</Tag>
                      <Tag color={T.gold}>Manual Review: Pending</Tag>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {Object.entries(result.extracted).map(([k,v])=>(
                      <div key={k} style={{ background:T.sidebar, borderRadius:6, padding:"7px 10px" }}>
                        <div style={{ color:T.muted, fontSize:9, textTransform:"uppercase", letterSpacing:"0.5px" }}>{k}</div>
                        <div style={{ color:T.text, fontSize:11, fontWeight:600, marginTop:2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:10, padding:"8px 10px", background:"#F0B42908", border:`1px solid ${T.gold}30`, borderRadius:6 }}>
                    <div style={{ color:T.gold, fontSize:10 }}>⏳ A Compliance Officer will manually verify this document within 1–2 business days before your account is activated.</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={!allRequired}>{allRequired?"Continue →":"Upload required docs first"}</Btn>
      </div>
    </div>
  );
}

// ─── STEP 4: BANNED COUNTRY — FOREIGN BANK ───────────────────────
function Step4({ country, data, setData, onNext, onBack }) {
  const isBanned = BANNED_COUNTRIES.includes(country);
  const [errors, setErrors] = useState({});

  const validate = () => {
    if (!isBanned) return true;
    const e = {};
    if (!data.bankCountry) e.bankCountry = "Required";
    if (!data.bankName) e.bankName = "Required";
    if (!data.accountNumber) e.accountNumber = "Required";
    if (!data.swiftCode) e.swiftCode = "Required";
    if (!data.accountHolder) e.accountHolder = "Required";
    if (data.bankCountry && BANNED_COUNTRIES.includes(data.bankCountry)) e.bankCountry = "Bank must be in a crypto-legal country";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  if (!isBanned) {
    return (
      <div>
        <div style={{ textAlign:"center", padding:"30px 20px" }}>
          <div style={{ fontSize:48, marginBottom:14 }}>✅</div>
          <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:8 }}>Jurisdiction Check Passed</div>
          <div style={{ color:T.muted, fontSize:12, lineHeight:1.7 }}>
            Your country (<strong style={{ color:T.accent }}>{country}</strong>) permits cryptocurrency and stablecoin operations. No additional banking verification is required at this step.
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <Btn variant="secondary" onClick={onBack}>← Back</Btn>
          <Btn onClick={onNext}>Continue →</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Foreign Bank Account Required</div>
        <div style={{ background:"#F0443812", border:`1px solid ${T.red}30`, borderRadius:8, padding:"12px 14px", marginBottom:14 }}>
          <div style={{ color:T.red, fontWeight:700, fontSize:12, marginBottom:4 }}>⚑ Restricted Jurisdiction: {country}</div>
          <div style={{ color:T.text, fontSize:11, lineHeight:1.6 }}>
            Cryptocurrency activities are heavily restricted or banned in <strong>{country}</strong>. To proceed, you must provide a valid bank account held in a country where crypto is fully legal. This account will be used for all fiat settlements and on/off-ramp operations.
          </div>
        </div>
        <div style={{ color:T.muted, fontSize:12 }}>Accepted countries include: {LEGAL_COUNTRIES.slice(0,6).join(", ")} and others.</div>
      </div>

      <Select label="Bank Country" value={data.bankCountry||""} onChange={v=>setData({...data,bankCountry:v})}
        options={LEGAL_COUNTRIES} required />
      {errors.bankCountry && <div style={{ color:T.red, fontSize:10, marginTop:-10, marginBottom:10 }}>{errors.bankCountry}</div>}

      {data.bankCountry && BANNED_COUNTRIES.includes(data.bankCountry) && (
        <div style={{ background:"#F0443812", border:`1px solid ${T.red}30`, borderRadius:7, padding:"9px 12px", marginBottom:10 }}>
          <div style={{ color:T.red, fontSize:11 }}>⚑ {data.bankCountry} is a restricted country. Please select a fully crypto-legal jurisdiction.</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
        <Input label="Bank Name" value={data.bankName||""} onChange={v=>setData({...data,bankName:v})} required placeholder="e.g. Emirates NBD" />
        <Input label="SWIFT / BIC Code" value={data.swiftCode||""} onChange={v=>setData({...data,swiftCode:v})} required placeholder="e.g. EBILAEAD" />
        <div style={{ gridColumn:"1/-1" }}>
          <Input label="Account Holder Name" value={data.accountHolder||""} onChange={v=>setData({...data,accountHolder:v})} required placeholder="Must match your company name" />
        </div>
        <Input label="Account Number / IBAN" value={data.accountNumber||""} onChange={v=>setData({...data,accountNumber:v})} required placeholder="AE070331234567890123456" />
        <Input label="Routing / Sort Code" value={data.routingCode||""} onChange={v=>setData({...data,routingCode:v})} placeholder="Optional" />
      </div>

      <div style={{ background:T.sidebar, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px 14px", marginBottom:14 }}>
        <div style={{ color:T.gold, fontSize:11, fontWeight:600, marginBottom:4 }}>📋 What you'll need to prove</div>
        <div style={{ color:T.muted, fontSize:11, lineHeight:1.7 }}>
          ① Bank statement (last 3 months) showing account in your name<br/>
          ② Proof that account is in a crypto-legal jurisdiction<br/>
          ③ Account must be corporate (not personal) to comply with KYB requirements
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div style={{ background:"#F0443812", border:`1px solid ${T.red}30`, borderRadius:7, padding:"9px 12px", marginBottom:12 }}>
          <div style={{ color:T.red, fontSize:11 }}>Please correct: {Object.keys(errors).join(", ")}</div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={()=>{ if(validate()) onNext(); }}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── STEP 5: CURRENCY PREFERENCES ────────────────────────────────
function Step5({ data, setData, onNext, onBack }) {
  const toggle = (arr, key, id) => {
    const cur = data[key]||[];
    setData({...data,[key]: cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]});
  };

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Settlement Preferences</div>
        <div style={{ color:T.muted, fontSize:12 }}>Choose your preferred digital assets and fiat currencies. You can change these anytime from your profile.</div>
      </div>

      {/* Stablecoin selection */}
      <div style={{ marginBottom:20 }}>
        <div style={{ color:T.muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, marginBottom:10 }}>Preferred Stablecoins</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {STABLECOINS.map(coin => {
            const sel = (data.stablecoins||[]).includes(coin.id);
            return (
              <div key={coin.id} onClick={()=>toggle(data,"stablecoins",coin.id)}
                style={{ background:sel?T.accentGlow:T.sidebar, border:`1.5px solid ${sel?T.accent:T.border}`,
                  borderRadius:10, padding:"12px 14px", cursor:"pointer", transition:"all 0.15s",
                  boxShadow:sel?`0 0 12px ${T.accent}20`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:18 }}>{coin.logo}</span>
                  {sel && <span style={{ color:T.accent, fontSize:14 }}>✓</span>}
                </div>
                <div style={{ color:T.text, fontWeight:700, fontSize:13 }}>{coin.label}</div>
                <div style={{ color:T.muted, fontSize:10, marginTop:2 }}>{coin.network}</div>
                <div style={{ color:T.dim, fontSize:9, marginTop:3 }}>{coin.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fiat currencies */}
      <div style={{ marginBottom:20 }}>
        <div style={{ color:T.muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, marginBottom:10 }}>Fiat Currencies for On/Off-Ramp</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {FIAT_CURRENCIES.map(fiat => {
            const sel = (data.fiats||[]).includes(fiat.id);
            return (
              <div key={fiat.id} onClick={()=>toggle(data,"fiats",fiat.id)}
                style={{ background:sel?`${T.gold}12`:T.sidebar, border:`1.5px solid ${sel?T.gold:T.border}`,
                  borderRadius:8, padding:"10px 12px", cursor:"pointer", textAlign:"center", transition:"all 0.15s" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{fiat.flag}</div>
                <div style={{ color:T.text, fontSize:11, fontWeight:700 }}>{fiat.id}</div>
                <div style={{ color:T.muted, fontSize:9 }}>{fiat.symbol} {fiat.label}</div>
                {sel && <div style={{ color:T.gold, fontSize:10, marginTop:3 }}>✓ Selected</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction settings */}
      <div style={{ marginBottom:20 }}>
        <div style={{ color:T.muted, fontSize:10, textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, marginBottom:10 }}>Transaction Settings</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
          <Select label="Default Settlement Asset" value={data.defaultAsset||""} onChange={v=>setData({...data,defaultAsset:v})}
            options={STABLECOINS.map(s=>({value:s.id,label:`${s.label} (${s.network})`}))} />
          <Select label="Preferred Settlement Speed" value={data.speed||""} onChange={v=>setData({...data,speed:v})}
            options={[{value:"instant",label:"Instant (higher gas)"},{value:"standard",label:"Standard (optimized)"},{value:"batch",label:"Batch (lowest cost)"}]} />
        </div>
        <Select label="Daily Transfer Limit" value={data.dailyLimit||""} onChange={v=>setData({...data,dailyLimit:v})}
          options={[{value:"1M",label:"Up to $1M"},{value:"10M",label:"Up to $10M"},{value:"50M",label:"Up to $50M"},{value:"unlimited",label:"No limit (requires enhanced KYB)"}]} />
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext} disabled={!(data.stablecoins||[]).length||!(data.fiats||[]).length}>
          {!(data.stablecoins||[]).length||!(data.fiats||[]).length?"Select at least one asset + currency":"Continue →"}
        </Btn>
      </div>
    </div>
  );
}

// ─── STEP 6: REVIEW & SUBMIT ──────────────────────────────────────
function Step6({ allData, onSubmit, onBack }) {
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => { setSubmitted(true); setTimeout(onSubmit, 1800); };
  const { company, bank, prefs } = allData;
  const isBanned = BANNED_COUNTRIES.includes(company?.country);

  if (submitted) {
    return (
      <div style={{ textAlign:"center", padding:"20px 0" }}>
        <div style={{ width:60, height:60, borderRadius:"50%", background:T.accentGlow, border:`2px solid ${T.accent}`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:26, marginBottom:16, boxShadow:`0 0 20px ${T.accent}40` }}>
          ✓
        </div>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:8 }}>Application Submitted!</div>
        <div style={{ color:T.muted, fontSize:12, lineHeight:1.7, marginBottom:16 }}>
          Your KYB application is now under review. A Compliance Officer will verify your documents and respond within <strong style={{ color:T.accent }}>1–2 business days</strong>.
        </div>
        <div style={{ display:"inline-flex", gap:8, background:T.sidebar, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px 20px" }}>
          <span style={{ color:T.muted, fontSize:11 }}>Reference ID:</span>
          <span style={{ color:T.accent, fontFamily:"monospace", fontWeight:700, fontSize:11 }}>KYB-2026-{Math.random().toString(36).slice(2,8).toUpperCase()}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom:18 }}>
        <div style={{ color:T.text, fontWeight:700, fontSize:18, marginBottom:5 }}>Review & Submit</div>
        <div style={{ color:T.muted, fontSize:12 }}>Please review your application before submitting.</div>
      </div>

      {/* Summary sections */}
      {[
        { title:"Company Details", icon:"🏢", items:[
          ["Company",company?.companyName],["Country",company?.country],["Sector",company?.sector],
          ["Revenue",company?.revenue],["Email",company?.email],["Registration",company?.regNumber],
        ]},
        ...(isBanned?[{ title:"Foreign Bank Account", icon:"🏦", items:[
          ["Bank Country",bank?.bankCountry],["Bank Name",bank?.bankName],["SWIFT",bank?.swiftCode],["Account",bank?.accountNumber?.replace(/./g,(c,i)=>i>4?"*":c)],
        ]}]:[]),
        { title:"Settlement Preferences", icon:"⚙️", items:[
          ["Stablecoins",(prefs?.stablecoins||[]).join(", ")||"None selected"],
          ["Fiat Currencies",(prefs?.fiats||[]).join(", ")||"None selected"],
          ["Default Asset",prefs?.defaultAsset||"—"],["Daily Limit",prefs?.dailyLimit||"—"],
        ]},
      ].map(section=>(
        <div key={section.title} style={{ background:T.sidebar, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ color:T.text, fontWeight:600, fontSize:12, marginBottom:10 }}>{section.icon} {section.title}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {section.items.map(([k,v])=>v&&(
              <div key={k} style={{ display:"flex", gap:8 }}>
                <span style={{ color:T.muted, fontSize:10, whiteSpace:"nowrap" }}>{k}:</span>
                <span style={{ color:T.text, fontSize:10, fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Verification pipeline info */}
      <div style={{ background:`${T.blue}10`, border:`1px solid ${T.blue}30`, borderRadius:8, padding:"12px 14px", marginBottom:14 }}>
        <div style={{ color:T.blue, fontWeight:700, fontSize:11, marginBottom:8 }}>🔍 Verification Pipeline</div>
        <div style={{ display:"flex", gap:8 }}>
          {[{l:"AI OCR",c:T.accent,s:"Complete"},{l:"Sumsub API",c:T.purple,s:"Queued"},{l:"Officer Review",c:T.gold,s:"Pending"},{l:"VARA Screening",c:T.blue,s:"Pending"}].map(s=>(
            <div key={s.l} style={{ flex:1, background:T.card, borderRadius:6, padding:"7px 8px", textAlign:"center" }}>
              <div style={{ color:s.c, fontSize:10, fontWeight:700 }}>{s.l}</div>
              <div style={{ color:T.muted, fontSize:9, marginTop:2 }}>{s.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Agreement */}
      <div onClick={()=>setAgreed(!agreed)} style={{ display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer", marginBottom:16, padding:"10px 12px", background:agreed?T.accentGlow:T.sidebar, border:`1px solid ${agreed?T.accent+"40":T.border}`, borderRadius:7, transition:"all 0.15s" }}>
        <div style={{ width:16, height:16, border:`2px solid ${agreed?T.accent:T.muted}`, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, background:agreed?T.accent:"transparent", transition:"all 0.15s" }}>
          {agreed && <span style={{ color:T.bg, fontSize:10, fontWeight:700 }}>✓</span>}
        </div>
        <div style={{ color:T.muted, fontSize:11, lineHeight:1.6 }}>
          I confirm that all information provided is accurate and complete. I agree to AegisLedger's <span style={{ color:T.accent }}>Terms of Service</span>, <span style={{ color:T.accent }}>Privacy Policy</span>, and <span style={{ color:T.accent }}>VARA Compliance Requirements</span>.
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <Btn variant="secondary" onClick={onBack}>← Back</Btn>
        <Btn variant="gold" onClick={handleSubmit} disabled={!agreed}>Submit Application →</Btn>
      </div>
    </div>
  );
}

// ─── MAIN SIGNUP FLOW ─────────────────────────────────────────────
export default function SignupFlow({ onBackToLogin }) {
  const [step, setStep] = useState(1);
  const [companyData, setCompanyData] = useState({ companyName:"", regNumber:"", country:"", email:"", phone:"" });
  const [bankData, setBankData] = useState({});
  const [prefData, setPrefData] = useState({ stablecoins:[], fiats:[] });
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.cssText = "margin:0;padding:0;font-family:'Plus Jakarta Sans',sans-serif;background:#04101E;";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  const STEPS = [
    { n:1, label:"Company" },
    { n:2, label:"Email OTP" },
    { n:3, label:"Documents" },
    { n:4, label:"Banking" },
    { n:5, label:"Preferences" },
    { n:6, label:"Review" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", position:"relative", overflow:"hidden", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      {/* Background grid */}
      <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(${T.border}50 1px,transparent 1px),linear-gradient(90deg,${T.border}50 1px,transparent 1px)`, backgroundSize:"48px 48px" }}/>
      <div style={{ position:"absolute", inset:0, background:`radial-gradient(ellipse at 30% 0%,${T.accent}08,transparent 50%),radial-gradient(ellipse at 80% 100%,${T.blue}06,transparent 50%)` }}/>

      <div style={{ width:"100%", maxWidth:600, position:"relative", zIndex:1 }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ width:36, height:36, background:`linear-gradient(135deg,${T.accent},#0088CC)`, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⬡</div>
            <div style={{ color:T.text, fontWeight:700, fontSize:20 }}>AegisLedger</div>
          </div>
          <div style={{ color:T.muted, fontSize:11 }}>Corporate KYB Registration · B2B Settlement Gateway</div>
        </div>

        {/* Step indicator */}
        {!done && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20, gap:0 }}>
            {STEPS.map((s,i) => (
              <div key={s.n} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <StepDot n={s.n} current={step===s.n} done={step>s.n}/>
                  <span style={{ color:step===s.n?T.accent:step>s.n?T.accent:T.muted, fontSize:9, fontWeight:step===s.n?700:400, whiteSpace:"nowrap" }}>{s.label}</span>
                </div>
                {i<STEPS.length-1 && (
                  <div style={{ width:40, height:2, background:step>s.n?T.accent:T.dim, margin:"0 4px", marginBottom:14, transition:"background 0.3s" }}/>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Card */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:"28px 30px", boxShadow:`0 0 60px ${T.accent}08,0 24px 48px #00000040` }}>
          {step===1 && <Step1 data={companyData} setData={setCompanyData} onNext={()=>setStep(2)}/>}
          {step===2 && <Step2 email={companyData.email} onNext={()=>setStep(3)} onBack={()=>setStep(1)}/>}
          {step===3 && <Step3 country={companyData.country} onNext={()=>setStep(4)} onBack={()=>setStep(2)}/>}
          {step===4 && <Step4 country={companyData.country} data={bankData} setData={setBankData} onNext={()=>setStep(5)} onBack={()=>setStep(3)}/>}
          {step===5 && <Step5 data={prefData} setData={setPrefData} onNext={()=>setStep(6)} onBack={()=>setStep(4)}/>}
          {step===6 && <Step6 allData={{company:companyData,bank:bankData,prefs:prefData}} onSubmit={()=>setDone(true)} onBack={()=>setStep(5)}/>}
          {done && (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:52, marginBottom:14 }}>🎉</div>
              <div style={{ color:T.text, fontWeight:700, fontSize:20, marginBottom:8 }}>You're on the waitlist!</div>
              <div style={{ color:T.muted, fontSize:12, lineHeight:1.7, marginBottom:20 }}>Your KYB application is under review. Our compliance team will contact you at <span style={{ color:T.accent }}>{companyData.email}</span> within 1–2 business days.</div>
              <button onClick={onBackToLogin||(() => setStep(1))}
                style={{ background:`linear-gradient(135deg,${T.accent},#0088CC)`, color:T.bg, border:"none", borderRadius:8, padding:"10px 24px", cursor:"pointer", fontSize:12, fontWeight:700 }}>
                Back to Login
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div style={{ textAlign:"center", marginTop:14 }}>
            <span style={{ color:T.dim, fontSize:10 }}>Already have an account? </span>
            <span onClick={onBackToLogin} style={{ color:T.accent, fontSize:10, cursor:"pointer", fontWeight:600 }}>Sign in →</span>
          </div>
        )}
        <div style={{ textAlign:"center", marginTop:8 }}>
          <span style={{ color:T.dim, fontSize:9 }}>🔒 AES-256 · VARA Licensed · ISO 27001 · SOC 2 Type II</span>
        </div>
      </div>
    </div>
  );
}
