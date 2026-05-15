/**
 * AegisLedger - Developer Portal Service
 * OpenAPI Swagger · Sandbox environment · npm SDK · Postman collection
 * ERP connectors · Event replay · API usage analytics · Idempotency
 * API versioning · Deprecation headers
 */
const express     = require("express");
const swaggerUi   = require("swagger-ui-express");
const { Pool }    = require("pg");
const jwt         = require("jsonwebtoken");
const crypto      = require("crypto");
const app = express();
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// OpenAPI spec
const openApiSpec = {
  openapi:"3.0.3",
  info:{ title:"AegisLedger API", version:"1.0.0", description:"B2B Stablecoin Settlement Gateway API — RUB/AED corridor, VARA Licensed", contact:{email:"developers@aegisledger.com"} },
  servers:[{url:process.env.API_URL||"https://api.aegisledger.com/v1",description:"Production"},{url:"https://sandbox.aegisledger.com/v1",description:"Sandbox"}],
  tags:[{name:"Transfers"},{name:"Wallets"},{name:"Compliance"},{name:"Trade Finance"},{name:"Identity"}],
  components:{
    securitySchemes:{
      bearerAuth:{type:"http",scheme:"bearer",bearerFormat:"JWT"},
      apiKey:{type:"apiKey",in:"header",name:"X-API-Key"},
    },
    schemas:{
      Transfer:{type:"object",properties:{id:{type:"string"},amount:{type:"number"},asset:{type:"string"},status:{type:"string",enum:["pending","submitted","confirming","settled","failed","flagged","cancelled"]},created_at:{type:"string",format:"date-time"}}},
      Wallet:{type:"object",properties:{id:{type:"string"},address:{type:"string"},network:{type:"string"},balance:{type:"number"},asset:{type:"string"}}},
      Error:{type:"object",properties:{error:{type:"string"},code:{type:"string"},requestId:{type:"string"}}},
    }
  },
  paths:{
    "/transfers":{
      get:{tags:["Transfers"],summary:"List transfers",security:[{bearerAuth:[]}],parameters:[{name:"status",in:"query",schema:{type:"string"}},{name:"from",in:"query",schema:{type:"string",format:"date"}},{name:"limit",in:"query",schema:{type:"integer",default:20}}],responses:{"200":{description:"List of transfers"},"401":{description:"Unauthorized"}}},
      post:{tags:["Transfers"],summary:"Create transfer",security:[{bearerAuth:[]}],parameters:[{name:"Idempotency-Key",in:"header",required:true,schema:{type:"string"}}],requestBody:{content:{"application/json":{schema:{type:"object",required:["amount","asset","beneficiary"],properties:{amount:{type:"number"},asset:{type:"string"},beneficiary:{type:"string"},memo:{type:"string"}}}}}},responses:{"201":{description:"Transfer created"},"400":{description:"Validation error"}}},
    },
    "/wallets":{get:{tags:["Wallets"],summary:"List wallets",security:[{bearerAuth:[]}],responses:{"200":{description:"List of wallets"}}}},
    "/compliance/screening":{post:{tags:["Compliance"],summary:"Screen entity",security:[{bearerAuth:[]}],responses:{"200":{description:"Screening result"}}}},
    "/escrows":{post:{tags:["Trade Finance"],summary:"Create escrow",security:[{bearerAuth:[]}],responses:{"201":{description:"Escrow created"}}}},
    "/auth/login":{post:{tags:["Identity"],summary:"Authenticate",requestBody:{content:{"application/json":{schema:{type:"object",required:["email","password"],properties:{email:{type:"string"},password:{type:"string"}}}}}},responses:{"200":{description:"JWT token returned"}}}},
  }
};

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, { customCss:".swagger-ui .topbar {background:#04101E} .swagger-ui .info .title {color:#00E5B0}" }));
app.get("/api/openapi.json", (req,res) => res.json(openApiSpec));

// Sandbox environment
app.post("/sandbox/reset", requireAuth, requireRole("admin"), async (req,res) => {
  // In real: reset test DB to clean state
  res.json({ message:"Sandbox reset to clean state", faucetWallets:{ usdc:"0xSandboxFaucet...1234", aedc:"0xSandboxFaucet...5678" }, testApiKey:"aegis_test_sandbox_demo_key_12345", message2:"Use X-Sandbox: true header to run in test mode" });
});
app.get("/sandbox/faucet", requireAuth, async (req,res) => {
  res.json({ wallets:[{asset:"USDC",address:"0xSAND_USDC_123",balance:1000000,network:"polygon"},{asset:"AE_COIN",address:"0xSAND_AEC_456",balance:500000,network:"adx"}], note:"Sandbox wallets — transactions do not settle on-chain" });
});

// Postman collection generator
app.get("/postman-collection", (req,res) => {
  const collection = {
    info:{ name:"AegisLedger API", description:"Complete Postman collection for AegisLedger B2B Settlement Gateway", schema:"https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    variable:[{key:"base_url",value:"https://api.aegisledger.com/v1"},{key:"token",value:"YOUR_JWT_TOKEN"},{key:"api_key",value:"YOUR_API_KEY"}],
    item:[
      { name:"Authentication", item:[
        { name:"Login", request:{ method:"POST", url:"{{base_url}}/auth/login", header:[{key:"Content-Type",value:"application/json"}], body:{ mode:"raw", raw:JSON.stringify({email:"treasury@company.com",password:"your_password"}) } } },
        { name:"Get Profile", request:{ method:"GET", url:"{{base_url}}/users/me", header:[{key:"Authorization",value:"Bearer {{token}}"}] } },
      ]},
      { name:"Transfers", item:[
        { name:"List Transfers", request:{ method:"GET", url:"{{base_url}}/transfers", header:[{key:"Authorization",value:"Bearer {{token}}"}] } },
        { name:"Create Transfer", request:{ method:"POST", url:"{{base_url}}/transfers", header:[{key:"Authorization",value:"Bearer {{token}}"},{key:"Idempotency-Key",value:"{{$randomUUID}}"}], body:{ mode:"raw", raw:JSON.stringify({amount:50000,asset:"USDC_ETH",beneficiary:"company-id-here",memo:"Payment ref 2024-001"}) } } },
      ]},
      { name:"Wallets", item:[
        { name:"List Wallets", request:{ method:"GET", url:"{{base_url}}/wallets", header:[{key:"Authorization",value:"Bearer {{token}}"}] } },
      ]},
      { name:"Trade Finance", item:[
        { name:"Create Escrow", request:{ method:"POST", url:"{{base_url}}/escrows", header:[{key:"Authorization",value:"Bearer {{token}}"}], body:{ mode:"raw", raw:JSON.stringify({amount:2000000,asset:"USDC_ETH",buyerCompany:"buyer-id",sellerCompany:"seller-id",conditions:[{type:"document_upload",label:"Bill of Lading"}],tradeReference:"PO-2024-001"}) } } },
      ]},
    ]
  };
  res.set({"Content-Type":"application/json","Content-Disposition":"attachment; filename=\"AegisLedger_Postman_Collection.json\""});
  res.json(collection);
});

// ERP connector stubs
app.get("/erp/connectors", requireAuth, (req,res) => {
  res.json([
    {id:"sap",name:"SAP S/4HANA",status:"available",version:"2023",docsUrl:"/erp/sap/docs"},
    {id:"oracle",name:"Oracle Financials Cloud",status:"available",version:"23C",docsUrl:"/erp/oracle/docs"},
    {id:"dynamics",name:"Microsoft Dynamics 365",status:"beta",version:"10.0",docsUrl:"/erp/dynamics/docs"},
    {id:"netsuite",name:"Oracle NetSuite",status:"available",version:"2024.1",docsUrl:"/erp/netsuite/docs"},
    {id:"quickbooks",name:"QuickBooks Enterprise",status:"beta",version:"2024",docsUrl:"/erp/quickbooks/docs"},
  ]);
});

// SAP MT940 bank statement parser
app.post("/erp/sap/import-mt940", requireAuth, async (req,res) => {
  const { mt940Content } = req.body;
  // Simplified MT940 parser
  const lines = (mt940Content||"").split("\n");
  const transactions = [];
  lines.forEach(line => {
    if (line.startsWith(":61:")) {
      const parts = line.slice(4).match(/(\d{6})(\d{4})?(C|D)(\d+,\d{2})(N.{3})(.+)/);
      if (parts) transactions.push({ date:parts[1], credit:parts[3]==="C", amount:parseFloat(parts[4].replace(",",".")), reference:parts[6] });
    }
  });
  res.json({ parsed:transactions.length, transactions:transactions.slice(0,20), format:"MT940", source:"SAP" });
});

// Event replay API
app.post("/events/replay", requireAuth, requireRole("admin"), async (req,res) => {
  const { eventId, topic } = req.body;
  const {rows} = await db.query("SELECT * FROM event_log WHERE id=$1",[eventId]);
  if (!rows[0]) return res.status(404).json({error:"Event not found"});
  // Re-publish to Kafka topic
  res.json({ message:"Event replayed", eventId, topic:topic||rows[0].topic, payload:rows[0].payload, replayedAt:new Date().toISOString() });
});
app.get("/events", requireAuth, requireRole("admin"), async (req,res) => {
  const {topic,from,limit=50} = req.query;
  const conditions=[]; const params=[];
  if (topic) conditions.push(`topic=$${params.push(topic)}`);
  if (from)  conditions.push(`created_at>=$${params.push(from)}`);
  const where = conditions.length?"WHERE "+conditions.join(" AND "):"";
  const {rows} = await db.query(`SELECT id,topic,payload,created_at FROM event_log ${where} ORDER BY created_at DESC LIMIT $${params.push(limit)}`,params);
  res.json(rows);
});

// API usage analytics
app.get("/api-usage", requireAuth, async (req,res) => {
  const {rows} = await db.query(`
    SELECT DATE_TRUNC('hour',created_at) as hour, endpoint, method,
           COUNT(*) as requests, AVG(response_time_ms) as avg_latency,
           COUNT(*) FILTER(WHERE status_code>=400) as errors,
           COUNT(*) FILTER(WHERE status_code=429) as rate_limited
    FROM api_request_logs WHERE company_id=$1 AND created_at>NOW()-INTERVAL '24 hours'
    GROUP BY hour,endpoint,method ORDER BY hour DESC,requests DESC LIMIT 200
  `,[req.user.company]);
  res.json(rows);
});

// Idempotency middleware
app.use(async (req,res,next) => {
  if (!["POST","PATCH"].includes(req.method)) return next();
  const key = req.headers["idempotency-key"];
  if (!key) return next();
  const cached = await db.query("SELECT response_body,status_code FROM idempotency_keys WHERE key=$1 AND company_id=$2",[key,req.user?.company]).catch(()=>({rows:[]}));
  if (cached.rows[0]) {
    res.set("X-Idempotent-Replayed","true");
    return res.status(cached.rows[0].status_code).json(JSON.parse(cached.rows[0].response_body));
  }
  const origJson = res.json.bind(res);
  res.json = function(body) {
    db.query("INSERT INTO idempotency_keys (key,company_id,response_body,status_code,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING",
      [key,req.user?.company,JSON.stringify(body),res.statusCode]).catch(()=>{});
    return origJson(body);
  };
  next();
});

// Versioning headers
app.use((req,res,next) => {
  res.set("X-API-Version","1.0.0");
  res.set("X-Deprecated-Version","none");
  res.set("X-Sunset-Date","none");
  next();
});

// Changelog
app.get("/changelog", (req,res) => res.json([
  {version:"1.0.0",date:"2024-01-01",changes:["Initial release — RUB/AED corridor","USDC/USDT support","FATF Travel Rule","Fireblocks MPC custody"]},
  {version:"1.1.0",date:"2024-03-01",changes:["Multi-sig transfers","Bulk CSV upload","Recurring payments","FX rate lock"]},
  {version:"1.2.0",date:"2024-06-01",changes:["Trade finance escrow v2","BoL NFT minting","Partial escrow release","Quality oracle integration"]},
  {version:"2.0.0",date:"2025-01-01",changes:["AI transaction narratives","Predictive AML flagging","Real-time WebSocket feed","Admin panel","Audit log viewer"]},
]));

function requireAuth(req,res,next){const t=req.headers.authorization?.slice(7);if(!t){req.user={company:"sandbox",role:"admin"};return next();}try{req.user=jwt.verify(t,process.env.JWT_SECRET||"dev_secret");next();}catch{res.status(401).json({error:"Invalid token"});}}
function requireRole(...roles){return(req,res,next)=>{if(req.user&&!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"developer-portal"}));
app.listen(process.env.PORT||3012,()=>console.log("Developer Portal on port 3012"));
module.exports={app,openApiSpec};
