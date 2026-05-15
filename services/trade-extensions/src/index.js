/**
 * AegisLedger - Trade Extensions
 * Digital LC · BoL NFT (ERC-1155) · Shipment tracking
 * Quality inspection oracle · Partial tranche escrow · Dispute arbitration
 * Trade analytics · Proforma invoice generator · Multi-currency escrow
 */
const express = require("express");
const { Pool } = require("pg");
const jwt     = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const crypto  = require("crypto");
const app = express();
app.use(express.json());
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── LETTER OF CREDIT ─────────────────────────────────────────────
app.get("/lc", requireAuth, async (req,res) => {
  const {rows} = await db.query("SELECT * FROM letters_of_credit WHERE company_id=$1 ORDER BY created_at DESC",[req.user.company]);
  res.json(rows);
});
app.post("/lc", requireAuth, requireRole("treasury","admin"), async (req,res) => {
  const {beneficiary_company,amount,asset,expiry_date,conditions,incoterms,description} = req.body;
  const lcRef = `LC-${Date.now()}`;
  const {rows} = await db.query(`INSERT INTO letters_of_credit (reference,company_id,beneficiary_company,amount,asset,expiry_date,conditions,incoterms,description,status,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,NOW()) RETURNING *`,
    [lcRef,req.user.company,beneficiary_company,amount,asset,expiry_date,JSON.stringify(conditions||[]),incoterms||"CIF",description,req.user.sub]);
  res.status(201).json(rows[0]);
});
app.post("/lc/:id/activate", requireAuth, requireRole("treasury","admin"), async (req,res) => {
  await db.query("UPDATE letters_of_credit SET status='active',activated_at=NOW() WHERE id=$1",[req.params.id]);
  res.json({message:"LC activated"});
});
app.post("/lc/:id/draw", requireAuth, async (req,res) => {
  const {drawAmount,documents} = req.body;
  const {rows} = await db.query("SELECT * FROM letters_of_credit WHERE id=$1",[req.params.id]);
  if (!rows[0]) return res.status(404).json({error:"LC not found"});
  
  // Fix 56: Check ownership - only the beneficiary company can draw on the LC
  if (rows[0].beneficiary_company !== req.user.company && req.user.role !== 'admin') {
    return res.status(403).json({error:"Only the beneficiary company can draw on this LC"});
  }

  if (rows[0].status !== "active") return res.status(400).json({error:"LC not active"});
  if (parseFloat(drawAmount) > parseFloat(rows[0].amount)) return res.status(400).json({error:"Draw exceeds LC value"});
  await db.query("INSERT INTO lc_drawings (lc_id,amount,documents,status,created_by,created_at) VALUES ($1,$2,$3,'pending',$4,NOW())",[req.params.id,drawAmount,JSON.stringify(documents||[]),req.user.sub]);
  res.json({message:"LC drawing submitted for compliance review"});
});

// ─── BOL NFT MINTING (ERC-1155) ───────────────────────────────────
app.post("/bol/mint", requireAuth, requireRole("treasury","admin"), async (req,res) => {
  const {shipmentId,blNumber,shipper,consignee,description,portOfLoading,portOfDischarge,grossWeight,packageCount} = req.body;
  const tokenId = crypto.createHash("sha256").update(blNumber+shipmentId).digest("hex").slice(0,16);
  const metadata = {
    name:`Bill of Lading #${blNumber}`,
    description:`B/L for shipment ${shipmentId}`,
    attributes:[{trait_type:"BL Number",value:blNumber},{trait_type:"Shipper",value:shipper},{trait_type:"Consignee",value:consignee},{trait_type:"Port of Loading",value:portOfLoading},{trait_type:"Port of Discharge",value:portOfDischarge},{trait_type:"Gross Weight",value:grossWeight},{trait_type:"Packages",value:packageCount},{trait_type:"Issued",value:new Date().toISOString()}]
  };
  await db.query(`INSERT INTO bol_nfts (token_id,shipment_id,bl_number,metadata,owner_company,status,minted_at) VALUES ($1,$2,$3,$4,$5,'minted',NOW()) ON CONFLICT (bl_number) DO UPDATE SET status='reminted',minted_at=NOW()`,
    [tokenId,shipmentId,blNumber,JSON.stringify(metadata),req.user.company]);
  // In prod: call ADX chain ERC-1155 contract via Fireblocks
  res.json({tokenId,contractAddress:"0xAEGIS_TRADE_NFT_CONTRACT_PLACEHOLDER",metadata,mintedAt:new Date().toISOString(),chain:"adx",note:"In production this mints on ADX chain via Fireblocks"});
});
app.post("/bol/:tokenId/transfer", requireAuth, async (req,res) => {
  const {toCompanyId} = req.body;
  
  // Fix 55: Check ownership before allowing transfer
  const {rows} = await db.query("SELECT owner_company FROM bol_nfts WHERE token_id=$1", [req.params.tokenId]);
  if (!rows[0]) return res.status(404).json({error:"BoL NFT not found"});
  if (rows[0].owner_company !== req.user.company && req.user.role !== 'admin') {
    return res.status(403).json({error:"Not the owner of this BoL NFT"});
  }

  await db.query("UPDATE bol_nfts SET owner_company=$1,transferred_at=NOW() WHERE token_id=$2",[toCompanyId,req.params.tokenId]);
  res.json({message:"BoL NFT ownership transferred",tokenId:req.params.tokenId,newOwner:toCompanyId});
});

// ─── SHIPMENT TRACKING ────────────────────────────────────────────
app.get("/shipments/:id/tracking", requireAuth, async (req,res) => {
  // Mock TradeLens/GT Nexus tracking API
  res.json({
    shipmentId:req.params.id,
    vesselName:"MV Pacific Trader",
    imo:"9876543",
    events:[
      {type:"GATE_OUT",location:"Port of Novorossiysk",country:"RU",timestamp:"2026-02-20T08:00:00Z",status:"completed"},
      {type:"VESSEL_DEPARTURE",location:"Port of Novorossiysk",country:"RU",timestamp:"2026-02-20T22:00:00Z",status:"completed"},
      {type:"AT_SEA",location:"Black Sea",timestamp:"2026-02-22T12:00:00Z",status:"completed"},
      {type:"VESSEL_ARRIVAL",location:"Port of Jebel Ali",country:"AE",timestamp:"2026-03-04T06:00:00Z",status:"completed"},
      {type:"CUSTOMS_CLEARANCE",location:"Dubai Customs",country:"AE",timestamp:"2026-03-04T14:00:00Z",status:"in_progress"},
      {type:"GATE_IN_DESTINATION",location:"JAFZA Free Zone",country:"AE",timestamp:null,status:"pending"},
    ],
    eta:"2026-03-05T10:00:00Z",
    status:"CUSTOMS_CLEARANCE",
    source:"TradeLens Mock API",
  });
});

// ─── QUALITY INSPECTION ORACLE ────────────────────────────────────
app.post("/inspections/verify", requireAuth, async (req,res) => {
  const {inspectionId,escrowId,certificateUrl} = req.body;
  // Mock SGS/Bureau Veritas API response
  const result = {
    inspectionId,certificateNumber:`SGS-${Date.now()}`,inspector:"SGS Société Générale de Surveillance",
    outcome:"PASSED",findings:{quality:"Grade A",purity:"99.7%",moisture:"0.3%",contamination:"None detected"},
    verifiedAt:new Date().toISOString(),signatureHash:crypto.randomBytes(16).toString("hex"),
  };
  if (escrowId) {
    await db.query("INSERT INTO escrow_oracle_verifications (escrow_id,type,result,verified_at) VALUES ($1,'quality_inspection',$2,NOW())",[escrowId,JSON.stringify(result)]);
    await db.query("UPDATE trade_escrow_conditions SET fulfilled=true,fulfilled_at=NOW(),evidence=$1 WHERE escrow_id=$2 AND condition_type='quality_inspection'",[JSON.stringify(result),escrowId]);
  }
  res.json(result);
});

// ─── PARTIAL TRANCHE ESCROW ───────────────────────────────────────
app.post("/escrows/:id/release-tranche", requireAuth, async (req,res) => {
  const {trancheId,amount,reason} = req.body;
  const {rows} = await db.query("SELECT * FROM trade_escrows WHERE id=$1",[req.params.id]);
  if (!rows[0]) return res.status(404).json({error:"Escrow not found"});
  const {rows:tranche} = await db.query("SELECT * FROM escrow_tranches WHERE id=$1 AND escrow_id=$2",[trancheId,req.params.id]);
  if (!tranche[0]) return res.status(404).json({error:"Tranche not found"});
  await db.query("UPDATE escrow_tranches SET status='released',released_at=NOW(),released_by=$1,release_reason=$2 WHERE id=$3",[req.user.sub,reason,trancheId]);
  await db.query("INSERT INTO audit_logs (user_id,action,ip_address,details,created_at) VALUES ($1,'ESCROW_TRANCHE_RELEASED',$2,$3,NOW())",[req.user.sub,req.ip,JSON.stringify({escrowId:req.params.id,trancheId,amount})]);
  res.json({message:"Tranche released",trancheId,amount,releasedAt:new Date().toISOString()});
});

// ─── DISPUTE ARBITRATION ──────────────────────────────────────────
app.post("/escrows/:id/dispute", requireAuth, async (req,res) => {
  const {reason,evidence,requestedResolution} = req.body;
  const disputeRef = `DISP-${Date.now()}`;
  const {rows} = await db.query(`INSERT INTO escrow_disputes (reference,escrow_id,raised_by,reason,evidence,requested_resolution,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'open',NOW()) RETURNING *`,
    [disputeRef,req.params.id,req.user.sub,reason,JSON.stringify(evidence||[]),requestedResolution]);
  res.status(201).json({...rows[0],message:"Dispute opened. Arbitrator will be assigned within 24 hours."});
});
app.get("/disputes", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {rows} = await db.query("SELECT d.*,e.value as escrow_value FROM escrow_disputes d JOIN trade_escrows e ON e.id=d.escrow_id ORDER BY d.created_at DESC");
  res.json(rows);
});
app.post("/disputes/:id/resolve", requireAuth, requireRole("compliance","admin"), async (req,res) => {
  const {resolution,winner,notes} = req.body;
  await db.query("UPDATE escrow_disputes SET status='resolved',resolution=$1,winner=$2,notes=$3,resolved_by=$4,resolved_at=NOW() WHERE id=$5",
    [resolution,winner,notes,req.user.sub,req.params.id]);
  res.json({message:"Dispute resolved"});
});

// ─── PROFORMA INVOICE GENERATOR ───────────────────────────────────
app.post("/invoices/proforma", requireAuth, async (req,res) => {
  const {buyer,seller,lineItems,currency,incoterms,paymentTerms,validUntil} = req.body;
  const invRef = `PI-${Date.now()}`;
  const subtotal = lineItems.reduce((s,i)=>s+i.quantity*i.unitPrice,0);
  const tax = subtotal * 0.05; // 5% UAE VAT
  const total = subtotal + tax;
  const pdf = await genProformaPDF({ref:invRef,buyer,seller,lineItems,subtotal,tax,total,currency,incoterms,paymentTerms,validUntil});
  res.set({"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="Proforma_${invRef}.pdf"`});
  res.send(pdf);
});

async function genProformaPDF(inv) {
  return new Promise(resolve => {
    const chunks=[]; const doc=new PDFDocument({size:"A4",margin:50});
    doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks)));
    const W=doc.page.width;
    doc.rect(0,0,W,doc.page.height).fill([4,16,30]);
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#00E5B0").text("PROFORMA INVOICE",50,40);
    doc.font("Helvetica").fontSize(10).fillColor("#4A6A88").text(`Reference: ${inv.ref}  ·  ${new Date().toLocaleDateString()}  ·  Valid until: ${inv.validUntil||"30 days"}`,50,66);
    doc.moveTo(50,82).lineTo(W-50,82).strokeColor("#112235").lineWidth(1).stroke();
    let y=96;
    [["SELLER",inv.seller],["BUYER",inv.buyer]].forEach(([t,p],i)=>{
      const x=i===0?50:W/2;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#4A6A88").text(t,x,y);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#E2EAF4").text(p?.name||"",x,y+12);
      doc.font("Helvetica").fontSize(9).fillColor("#4A6A88").text(p?.address||"",x,y+26,{width:(W/2)-60});
    });
    y+=70;
    doc.moveTo(50,y).lineTo(W-50,y).strokeColor("#112235").lineWidth(1).stroke(); y+=10;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#4A6A88");
    [["Description",200],["Qty",40],["Unit Price",70],["Total",70]].reduce((x,[h,w])=>{doc.text(h,x,y,{width:w});return x+w+10;},50);
    y+=16; doc.moveTo(50,y).lineTo(W-50,y).strokeColor("#112235").lineWidth(1).stroke(); y+=8;
    for (const item of (inv.lineItems||[])) {
      const total=(item.quantity*item.unitPrice).toLocaleString("en-US",{minimumFractionDigits:2});
      doc.font("Helvetica").fontSize(9).fillColor("#E2EAF4");
      doc.text(item.description,50,y,{width:200});
      doc.text(item.quantity,260,y,{width:40});
      doc.text(item.unitPrice.toLocaleString("en-US",{minimumFractionDigits:2}),310,y,{width:70});
      doc.text(total,390,y,{width:70}); y+=16;
    }
    y+=8; doc.moveTo(50,y).lineTo(W-50,y).strokeColor("#112235").lineWidth(1).stroke(); y+=10;
    [["Subtotal",inv.subtotal],["VAT (5%)",inv.tax],["TOTAL",inv.total]].forEach(([l,v])=>{
      doc.font("Helvetica-Bold").fontSize(l==="TOTAL"?12:9).fillColor(l==="TOTAL"?"#00E5B0":"#E2EAF4");
      doc.text(l,W-180,y); doc.text(`${inv.currency||"USD"} ${v.toLocaleString("en-US",{minimumFractionDigits:2})}`,W-100,y); y+=l==="TOTAL"?20:14;
    });
    doc.font("Helvetica").fontSize(8).fillColor("#4A6A88").text(`Incoterms: ${inv.incoterms||"CIF"}  ·  Payment: ${inv.paymentTerms||"30 days"}  ·  AegisLedger Settlement Platform`,50,y+10,{width:W-100});
    doc.end();
  });
}

// ─── TRADE ANALYTICS ─────────────────────────────────────────────
app.get("/trade/analytics", requireAuth, async (req,res) => {
  const [escrows,settlements,latency] = await Promise.all([
    db.query("SELECT status,COUNT(*) as cnt,SUM(value) as vol FROM trade_escrows WHERE created_at>NOW()-INTERVAL '30 days' GROUP BY status"),
    db.query("SELECT DATE_TRUNC('day',released_at) as day,COUNT(*) as cnt,SUM(value) as vol FROM trade_escrows WHERE released_at IS NOT NULL AND released_at>NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day"),
    db.query("SELECT AVG(EXTRACT(EPOCH FROM (released_at-created_at))/86400) as avg_days FROM trade_escrows WHERE released_at IS NOT NULL"),
  ]);
  res.json({escrowsByStatus:escrows.rows,dailySettlements:settlements.rows,avgDaysToRelease:parseFloat(latency.rows[0].avg_days||7).toFixed(1)});
});

function requireAuth(req,res,next){const t=req.headers.authorization?.slice(7);if(!t)return res.status(401).json({error:"Unauthorized"});try{req.user=jwt.verify(t,process.env.JWT_SECRET||"dev_secret");next();}catch{res.status(401).json({error:"Invalid token"});}}
function requireRole(...roles){return(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({error:"Forbidden"});next();};}
app.get("/health",(req,res)=>res.json({status:"ok",service:"trade-extensions"}));
app.listen(process.env.PORT||3014,()=>console.log("Trade Extensions on port 3014"));
module.exports={app};
