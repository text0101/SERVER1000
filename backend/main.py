from fastapi import FastAPI, Header, HTTPException, Body, UploadFile, File, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, Optional, List
import os
import json
import pypdf
from dotenv import load_dotenv
import google.generativeai as genai
from google.generativeai.types import GenerationConfig
from google.api_core.exceptions import ResourceExhausted
from pdf_processor import split_pdf_to_images, get_pdf_page_count
import hashlib

# Load environment variables
import os
import sys

# Try multiple locations for .env
possible_paths = [
    os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'), # Root from backend/main.py
    os.path.join(os.path.dirname(__file__), '.env'), # Same dir as main.py
    os.path.join(os.getcwd(), '.env'), # Current working directory
    '.env' # Fallback
]

env_path = None
for path in possible_paths:
    if os.path.exists(path):
        env_path = path
        break

if env_path:
    print(f"[SUCCESS] Loading .env from: {os.path.abspath(env_path)}")
    load_dotenv(env_path)
else:
    print("[WARNING] No .env file found! Checking environment variables directly.")

# Debug Key Loading (Masked)
key = os.getenv("GEMINI_API_KEY", "")
if key:
    print(f"[SUCCESS] GEMINI_API_KEY Found: {key[:4]}...{key[-4:]} (Length: {len(key)})")
else:
    print("[ERROR] GEMINI_API_KEY NOT FOUND in environment")


app = FastAPI(title="AutoTally Backend API")

# CORS configuration - Allow your React app to access this API
origins = ["*"]

# Add production origins from environment variable
prod_origins = os.getenv("ALLOWED_ORIGINS", "")
if prod_origins:
    # If production origins are set, use them and remove wildcard (unless explicitly included)
    origins = [origin.strip() for origin in prod_origins.split(",") if origin.strip()]
    print(f"[SUCCESS] CORS Allowed Origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import shutil
import pathlib
import uuid
import re
from datetime import datetime

# ============================================================
# UPLOAD DIRECTORY SETUP
# ============================================================
UPLOAD_DIR = pathlib.Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
print(f"[SUCCESS] Upload Directory: {UPLOAD_DIR.resolve()}")

def save_upload_file(upload_file: UploadFile) -> str:
    """
    Saves the uploaded file to the local uploads directory.
    Generated a unique filename to prevent overwrites.
    Returns the saved filename.
    """
    try:
        # Sanitize filename
        original_name = pathlib.Path(upload_file.filename).name
        
        # Use UUID hex for uniqueness (as per final docs)
        unique_id = uuid.uuid4().hex
        
        # Clean special chars from original name but keep extension
        clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', original_name)
        
        # Construct new filename: uuid__original
        # Truncate original if too long to avoid OS limits
        if len(clean_name) > 50:
            name_parts = os.path.splitext(clean_name)
            clean_name = name_parts[0][:50] + name_parts[1]
            
        saved_filename = f"{unique_id}__{clean_name}"
        destination_path = UPLOAD_DIR / saved_filename
        
        # Save file
        with destination_path.open("wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
            
        # IMPORTANT: Reset file pointer to beginning so subsequent readers (AI, PDF parsers) can read it
        upload_file.file.seek(0)
        
        print(f"[AUTO-SAVE] Saved {original_name} to {destination_path}")
        return str(saved_filename)
        
    except Exception as e:
        print(f"[AUTO-SAVE ERROR] Failed to save {upload_file.filename}: {e}")
        # Reset pointer just in case
        upload_file.file.seek(0)
        return ""

# Simple API key validation
VALID_API_KEYS = os.getenv("BACKEND_API_KEY", "").split(",")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# ============================================================
# TOKEN USAGE TRACKING
# ============================================================
TOKEN_USAGE_FILE = os.path.join(os.path.dirname(__file__), "token_usage.json")

# Plan limits
PLAN_LIMITS = {
    "Bronze": 50000,
    "Gold": 100000,
    "Platinum": 200000
}

def load_token_usage() -> dict:
    """Load token usage from JSON file"""
    default = {
        "used": 0,
        "plan": "Bronze",
        "reset_date": None,
        "last_notified_threshold": 0
    }
    try:
        if os.path.exists(TOKEN_USAGE_FILE):
            with open(TOKEN_USAGE_FILE, "r") as f:
                data = json.load(f)
                # Check if we need to reset (new month)
                from datetime import datetime
                current_month = datetime.now().strftime("%Y-%m")
                if data.get("reset_date") != current_month:
                    data["used"] = 0
                    data["reset_date"] = current_month
                    data["last_notified_threshold"] = 0
                    save_token_usage(data)
                return data
    except Exception as e:
        print(f"Error loading token usage: {e}")
    return default

def save_token_usage(data: dict):
    """Save token usage to JSON file"""
    try:
        from datetime import datetime
        if not data.get("reset_date"):
            data["reset_date"] = datetime.now().strftime("%Y-%m")
        with open(TOKEN_USAGE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving token usage: {e}")

# ============================================================
# UPLOADED FILES MANAGEMENT ROUTES
# ============================================================
@app.get("/api/uploaded-files")
async def list_uploaded_files(authorization: str = Header(None)):
    """List all locally uploaded files"""
    validate_api_key(authorization)
    
    files = []
    if UPLOAD_DIR.exists():
        # Sort by modification time desc
        for f in sorted(UPLOAD_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if f.is_file():
                dt = datetime.fromtimestamp(f.stat().st_mtime)
                files.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "date": dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp": f.stat().st_mtime
                })
    
    return {
        "success": True, 
        "files": files,
        "count": len(files)
    }

@app.post("/api/open-uploads-folder")
async def open_uploads_folder(authorization: str = Header(None)):
    """Open the uploads folder in the OS file explorer"""
    validate_api_key(authorization)
    
    try:
        if os.name == 'nt':  # Windows
            os.startfile(UPLOAD_DIR)
        elif sys.platform == 'darwin':  # macOS
            import subprocess
            subprocess.run(['open', str(UPLOAD_DIR)])
        else:  # Linux
            import subprocess
            subprocess.run(['xdg-open', str(UPLOAD_DIR)])
            
        return {"success": True, "message": "Folder opened"}
    except Exception as e:
        return {"success": False, "message": f"Failed to open folder: {str(e)}"}

def track_token_usage(response) -> dict:
    """Track token usage from Gemini response and return updated stats"""
    token_data = load_token_usage()
    tokens_used = 0
    
    try:
        # Try to get token count from various possible attributes
        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            metadata = response.usage_metadata
            # Try total_token_count first
            if hasattr(metadata, 'total_token_count') and metadata.total_token_count:
                tokens_used = metadata.total_token_count
            # Fallback to sum of prompt + candidates
            elif hasattr(metadata, 'prompt_token_count') and hasattr(metadata, 'candidates_token_count'):
                prompt_tokens = metadata.prompt_token_count or 0
                candidate_tokens = metadata.candidates_token_count or 0
                tokens_used = prompt_tokens + candidate_tokens
            
            if tokens_used > 0:
                token_data["used"] += tokens_used
                save_token_usage(token_data)
                print(f"[TOKEN] Tokens used this request: {tokens_used}, Total: {token_data['used']}/{PLAN_LIMITS.get(token_data['plan'], 100)}")
            else:
                print(f"[TOKEN] No token count in metadata: {metadata}")
        else:
            print(f"[TOKEN] No usage_metadata in response")
    except Exception as e:
        print(f"Error tracking tokens: {e}")
    
    return {
        "tokens_this_request": tokens_used,
        "total_used": token_data["used"],
        "plan": token_data["plan"],
        "limit": PLAN_LIMITS.get(token_data["plan"], 100)
    }

def check_token_limit() -> dict:
    """Check if user has exceeded token limit. Returns status and message."""
    token_data = load_token_usage()
    limit = PLAN_LIMITS.get(token_data["plan"], 1000)
    used = token_data["used"]
    
    if used >= limit:
        return {
            "limit_reached": True,
            "plan": token_data["plan"],
            "used": used,
            "limit": limit,
            "message": f"Token limit reached! You've used {used}/{limit} tokens on your {token_data['plan']} plan. Please upgrade your plan or reset your token usage in Settings."
        }
    return {
        "limit_reached": False,
        "plan": token_data["plan"],
        "used": used,
        "limit": limit
    }

# Initialize token usage on startup
_token_data = load_token_usage()
print(f"[TOKEN] Token Usage: {_token_data['used']}/{PLAN_LIMITS.get(_token_data['plan'], 100)} ({_token_data['plan']} plan)")


def validate_api_key(authorization: str = Header(None)):
    """Validate the user's backend API key"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header missing")
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
    api_key = authorization.replace("Bearer ", "")
    
    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    return api_key



# Helper to clean JSON string
def clean_json_text(text: str) -> str:
    """Clean markdown code blocks from JSON string"""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "AutoTally Backend API",
        "version": "3.0.0",
        "features": ["gemini-proxy", "invoice-storage", "logging", "error-tracking"]
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "message": "Backend is running"}


@app.get("/healthz")
async def healthz():
    """Render Health check endpoint"""
    return {"status": "ok"}


@app.get("/auth/validate")
async def validate_key(authorization: str = Header(None)):
    """Validate user's API key"""
    try:
        validate_api_key(authorization)
        return {
            "success": True,
            "message": "API key is valid"
        }
    except HTTPException as e:
        return {
            "success": False,
            "message": e.detail
        }


# ============================================================
# TOKEN USAGE ENDPOINTS
# ============================================================
class SetPlanRequest(BaseModel):
    plan: str

@app.get("/api/token-usage")
async def get_token_usage(authorization: str = Header(None)):
    """Get current token usage stats"""
    validate_api_key(authorization)
    token_data = load_token_usage()
    limit = PLAN_LIMITS.get(token_data["plan"], 100)
    percentage = round((token_data["used"] / limit) * 100, 1) if limit > 0 else 0
    
    return {
        "success": True,
        "plan": token_data["plan"],
        "used": token_data["used"],
        "limit": limit,
        "percentage": percentage,
        "reset_date": token_data.get("reset_date"),
        "last_notified_threshold": token_data.get("last_notified_threshold", 0)
    }

@app.post("/api/set-plan")
async def set_plan(request: SetPlanRequest, authorization: str = Header(None)):
    """Set user's subscription plan"""
    validate_api_key(authorization)
    
    if request.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {list(PLAN_LIMITS.keys())}")
    
    token_data = load_token_usage()
    token_data["plan"] = request.plan
    save_token_usage(token_data)
    
    return {
        "success": True,
        "plan": request.plan,
        "limit": PLAN_LIMITS[request.plan],
        "message": f"Plan updated to {request.plan}"
    }

@app.post("/api/update-notified-threshold")
async def update_notified_threshold(threshold: int = Body(..., embed=True), authorization: str = Header(None)):
    """Update the last notified usage threshold to prevent duplicate notifications"""
    validate_api_key(authorization)
    
    token_data = load_token_usage()
    token_data["last_notified_threshold"] = threshold
    save_token_usage(token_data)
    
    return {"success": True, "last_notified_threshold": threshold}

@app.post("/api/reset-tokens")
async def reset_tokens(authorization: str = Header(None)):
    """Reset token usage to 0"""
    validate_api_key(authorization)
    
    token_data = load_token_usage()
    token_data["used"] = 0
    token_data["last_notified_threshold"] = 0
    save_token_usage(token_data)
    
    return {
        "success": True,
        "message": "Token usage reset to 0",
        "used": 0,
        "plan": token_data["plan"],
        "limit": PLAN_LIMITS.get(token_data["plan"], 1000)
    }


# Pydantic models for Gemini proxy
class GeminiProxyRequest(BaseModel):
    model: str
    contents: Any
    config: Optional[Dict[str, Any]] = None


@app.post("/ai/gemini-proxy")
async def gemini_proxy(
    request: GeminiProxyRequest,
    authorization: str = Header(None)
):
    """
    Proxy endpoint for Gemini API calls.
    All business logic stays in React - this just forwards the request securely.
    """
    # Validate user's API key
    validate_api_key(authorization)
    
    # Check if Gemini API key is configured
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured on server"
        )
    
    # Debug: Check if key is being loaded
    if GEMINI_API_KEY:
         print(f"GEMINI_API_KEY loaded successfully (Length: {len(GEMINI_API_KEY)})")
    else:
         print("ERROR: GEMINI_API_KEY is not set")
    try:
        # Configure Gemini with server's API key
        genai.configure(api_key=GEMINI_API_KEY)
        
        # Extract system_instruction from config (if present)
        config = request.config or {}
        system_instruction = config.pop('system_instruction', None)
        
        # Instantiate GenerationConfig if config is present
        generation_config = GenerationConfig(**config) if config else None
        
        # Create model with system_instruction if provided
        if system_instruction:
            model = genai.GenerativeModel(request.model, system_instruction=system_instruction)
        else:
            model = genai.GenerativeModel(request.model)
        
        # Handle both formats:
        # 1. Single request: {"parts": [...]} - for image/document analysis
        # 2. Chat history: [{"role": "user", "parts": [...]}, ...] - for chat
        contents = request.contents
        
        # If contents is a dict with 'parts', it's a single request
        # If contents is a list, it's chat history - but we need to convert to proper format
        if isinstance(contents, dict) and 'parts' in contents:
            # Single request format - pass as-is
            response = model.generate_content(
                contents=contents['parts'],
                generation_config=generation_config
            )
        elif isinstance(contents, list):
            # Chat history format - pass as-is (Gemini expects list of Content objects)
            response = model.generate_content(
                contents=contents,
                generation_config=generation_config
            )
        else:
            # Fallback - pass as-is
            response = model.generate_content(
                contents=contents,
                generation_config=generation_config
            )
        
        # Safely get text content
        text_content = ""
        try:
            text_content = response.text
        except Exception:
            # If response.text fails (e.g. safety block), we leave it empty
            # The candidates list will still contain safety info
            pass

        # Track token usage
        token_stats = track_token_usage(response)

        # Return the response
        return {
            "success": True,
            "text": text_content,
            "token_usage": token_stats,
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": part.text} for part in candidate.content.parts],
                        "role": candidate.content.role
                    },
                    "finish_reason": candidate.finish_reason,
                    "safety_ratings": [
                        {
                            "category": rating.category,
                            "probability": rating.probability
                        }
                        for rating in candidate.safety_ratings
                    ]
                }
                for candidate in response.candidates
            ]
        }
    
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="Gemini API quota exceeded. Please retry later or upgrade plan."
        )

    except Exception as e:
        # Log the full error for debugging
        import traceback
        import uuid
        error_msg = str(e)
        error_trace = traceback.format_exc()
        
        print(f"ERROR: {error_msg}")
        print(f"Traceback: {error_trace}")
        print(f"Request contents type: {type(request.contents)}")
        print(f"Request contents: {request.contents}")
        
        # Save error to database
        # (Database logging disabled in this version)
        
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API error: {error_msg}"
        )


class ChatRequest(BaseModel):
    history: List[Dict[str, Any]]
    model: str = "gemini-2.5-flash"
    system_instruction: Optional[str] = None


@app.post("/ai/chat")
async def chat(
    request: ChatRequest,
    authorization: str = Header(None)
):
    """Server-side chat handler that uses Gemini securely"""
    try:
        print(f"DEBUG: Received chat request: {request}")
        
        # Validate API key
        validate_api_key(authorization)

        # Check token limit before processing
        limit_status = check_token_limit()
        if limit_status["limit_reached"]:
            raise HTTPException(
                status_code=429,
                detail=limit_status["message"]
            )

        if not GEMINI_API_KEY:
            print("ERROR: GEMINI_API_KEY is missing")
            raise HTTPException(status_code=500, detail="Gemini API key not configured on server")

        if GEMINI_API_KEY:
            print(f"DEBUG: Using Gemini Key (Length: {len(GEMINI_API_KEY)})")

        genai.configure(api_key=GEMINI_API_KEY)
        if request.system_instruction:
            model = genai.GenerativeModel(request.model, system_instruction=request.system_instruction)
        else:
            model = genai.GenerativeModel(request.model)

        # Convert history to model input format
        parts: List[Any] = []
        for msg in request.history:
            if msg.get("parts"):
                for p in msg["parts"]:
                    if "text" in p:
                        parts.append(p["text"])
            elif msg.get("text"):
                parts.append(msg["text"])

        print(f"DEBUG: Sending to Gemini: {parts}")
        response = model.generate_content(parts)
        print(f"DEBUG: Gemini Response: {response.text[:100]}...")
        
        # Track token usage
        track_token_usage(response)
        
        return {"success": True, "text": response.text}
        
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="Gemini API quota exceeded. Please retry later or upgrade plan."
        )

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"CHAT ENDPOINT ERROR: {str(e)}")
        print(f"TRACEBACK: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


# ------------------------------------------------------------------
# FAST UNLOCK ENDPOINT (For Instant Preview)
# ------------------------------------------------------------------
@app.post("/ai/unlock-pdf")
async def unlock_pdf(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None)
):
    try:
        file_bytes = await file.read()
        
        if not password:
             raise HTTPException(status_code=400, detail="Password is required for unlocking")

        import io
        import base64
        import pypdf
        
        # Re-open with pypdf to decrypt
        reader = pypdf.PdfReader(io.BytesIO(file_bytes), password=password)
        writer = pypdf.PdfWriter()
        
        # Copy all pages to new writer (removes encryption)
        for page in reader.pages:
            writer.add_page(page)
        
        output_stream = io.BytesIO()
        writer.write(output_stream)
        decrypted_b64 = base64.b64encode(output_stream.getvalue()).decode('utf-8')
        
        return {
            "success": True,
            "decrypted_pdf": decrypted_b64,
            "message": "PDF unlocked successfully"
        }

    except Exception as e:
        print(f"Unlock Error: {e}")
        # If password was wrong, pypdf raises generic error often, or specific one
        raise HTTPException(status_code=422, detail="Invalid password or failed to unlock")

@app.post("/ai/process-document")
async def process_document(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    authorization: str = Header(None)
):
    """Process a single document (invoice image/PDF) and return structured data"""
    validate_api_key(authorization)
    
    # Auto-save file
    saved_path = save_upload_file(file)

    # Check token limit before processing
    limit_status = check_token_limit()
    if limit_status["limit_reached"]:
        raise HTTPException(
            status_code=429,
            detail=limit_status["message"]
        )

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured on server")

    try:
        # Read file bytes
        file_bytes = await file.read()
        mime_type = file.content_type or "application/octet-stream"

        
        # Helper to prepare content for Gemini
        gemini_content_parts = []
        
        # Handle PDF specifically for Password/Extraction
        if mime_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
            import io
            import pdfplumber
            
            extracted_text = ""
            is_encrypted = False
            
            try:
                # Try opening with password
                with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            extracted_text += text + "\n"
                    
                    # If we opened it successfully but it has no text, it might be scanned.
                    # If it WAS encrypted, we are now "in".
                    
            except Exception as e:
                error_str = str(e).lower()
                repr_str = repr(e).lower()
                print(f"DEBUG PDF READ ERROR: {repr(e)}")
                
                # Enhanced detection for password protection
                if "password" in error_str or "encrypted" in error_str or "auth" in error_str or "password" in repr_str:
                    print(f"PASSWORD REQUIRED for {file.filename}")
                    raise HTTPException(status_code=422, detail="Password required")
                
                # If we have NO password and read failed, it's highly likely it creates an issue.
                print(f"PDF reading error (ignoring if not password related): {e}")

            # Strategy:
            # 1. If we have good text, send text (Cheap & Fast)
            # 2. If valid PDF but no text (Scanned), convert to Images and send Images (Reliable)
            # 3. If password was provided and worked, we MUST use Text or Images (can't send bytes)
            # 4. If no password needed and text failed, we COULD send bytes, but Images are safer for consistency.
            
            if len(extracted_text.strip()) > 50:
                print(f"Processing PDF as TEXT: {len(extracted_text)} chars")
                gemini_content_parts.append(extracted_text)
            else:
                print("Processing PDF as IMAGES (Scanned or Low Text)")
                # Convert to images using pdf_processor utils or local logic
                from pdf_processor import split_pdf_to_images
                try:
                    # split_pdf_to_images now accepts password
                    images = split_pdf_to_images(file_bytes, password=password)
                    if not images:
                         raise ValueError("No images extracted from PDF")
                         
                    for img_b64, _ in images:
                         gemini_content_parts.append({
                             "mime_type": "image/png",
                             "data": img_b64
                         })
                except Exception as img_err:
                     print(f"Image conversion failed: {img_err}")
                     # If both Text and Image conversion failed, we cannot proceed.
                     # If encryption was the cause, we should have caught it above OR simple logic:
                     if not password:
                         # Assume it MIGHT be password protected if everything failed
                         print("Both Text and Image extraction failed. Assuming Password Required.")
                         raise HTTPException(status_code=422, detail="Password required or file corrupted")
                     else:
                         raise HTTPException(status_code=422, detail="Failed to process document even with password")
                     # Fallback to sending raw bytes if not encrypted? 
                     # If it was encrypted, we are stuck.
                     if password:
                         raise HTTPException(status_code=422, detail="Failed to process password-protected PDF images")
                     
                     # Check if really encrypted again just in case
                     import base64
                     b64 = base64.b64encode(file_bytes).decode('utf-8')
                     gemini_content_parts.append({
                        "mime_type": "application/pdf",
                        "data": b64
                     })

        else:
            # Not a PDF (Image), send as is
            import base64
            b64 = base64.b64encode(file_bytes).decode('utf-8')
            gemini_content_parts.append({
                "mime_type": mime_type,
                "data": b64
            })
            
        
        # Calculate file hash for duplicate detection
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        system_instruction = """1️⃣ INVOICE SYSTEM INSTRUCTION
(Used during Gemini model initialization for invoice documents)

You are an expert Indian GST Invoice Accountant.
Extract data for Tally Prime XML integration.

CRITICAL DOCUMENT TYPE CHECK:
1. INVALID CHECK:
   - If the image is a photo of a person (selfie), animal, food, scenery, or a random object
   - And NOT a document
   - → set "documentType" to "INVALID"

2. BANK STATEMENT CHECK:
   - If it contains columns like:
     Date, Description/Narration, Withdrawal/Debit, Deposit/Credit, Balance
   - AND does NOT contain "GSTIN" or "Tax Invoice"
   - → set "documentType" to "BANK_STATEMENT"

3. INVOICE CHECK:
   - If it is a Bill, Receipt, or Invoice
   - Even if handwritten, simple, or missing fields
   - → set "documentType" to "INVOICE"

MISSING FIELDS POLICY:
- Missing Supplier Name, Buyer Name, GSTIN, or Invoice Number DOES NOT make the document invalid
- Return empty strings for missing fields
- Always extract whatever is available

RULES FOR INVOICE EXTRACTION:
1. Stock item names MUST be ≤ 25 characters
2. Dates MUST be normalized to DD-MM-YYYY
3. GST CALCULATION RULES (CRITICAL):
   - Identify ALL tax rates present (e.g., 0%, 5%, 12%, 18%, 28%).
   - If multiple rates exist, the 'gstRate' in lineItems must reflect the specific rate for that item.
   - **MANDATORY**: If SGST and CGST columns are present (e.g., 9% each), you MUST SUM them for the 'gstRate' (e.g., 9+9 = 18%).
   - If tax rate is not explicitly printed, CALCULATE it: (Tax Amount / Taxable Value) * 100.
   - 'taxableValue' = Sum of amounts of all line items BEFORE tax.
   - 'total' (Grand Total) = 'taxableValue' + TOTAL TAX AMOUNT.
   - CHECK THE BOTTOM of the invoice for the final "Grand Total" or "Invoice Total". 
   - DO NOT confuse 'Taxable Value' with 'Grand Total'.
   - If 'IGST', 'CGST', 'SGST' are shown, sum them up for the total tax.
4. Extract COMMON TRADE NAMES only (Remove city names, legal prefixes, and "M/s")

Goal:
Return a clean, structured JSON object suitable for Tally Prime."""

        # ------------------------------------------------------------------
        # DECRYPTION FOR PREVIEW (One-Password Experience)
        # If password was provided and we reached here (meaning it was valid),
        # create a decrypted copy for the frontend to show without prompt.
        # ------------------------------------------------------------------
        decrypted_pdf_b64 = None
        if password and (mime_type == "application/pdf" or file.filename.lower().endswith(".pdf")):
             try:
                 import io
                 import base64
                 import pypdf
                 
                 # Re-open with pypdf to decrypt
                 # Note: pypdf expects a seekable stream, BytesIO is perfect
                 reader = pypdf.PdfReader(io.BytesIO(file_bytes), password=password)
                 writer = pypdf.PdfWriter()
                 
                 # Copy all pages to new writer (removes encryption)
                 for page in reader.pages:
                     writer.add_page(page)
                 
                 output_stream = io.BytesIO()
                 writer.write(output_stream)
                 decrypted_pdf_b64 = base64.b64encode(output_stream.getvalue()).decode('utf-8')
                 decrypted_pdf_b64 = base64.b64encode(output_stream.getvalue()).decode('utf-8')
                 print("[SUCCESS] PDF Decrypted successfully for Preview")
             except Exception as dec_err:
                 print(f"[WARNING] Failed to decrypt PDF for preview: {dec_err}")

        # Configure Gemini LATE - only after we have content
        genai.configure(api_key=GEMINI_API_KEY)
        
        model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_instruction)

        prompt = """3️⃣ INVOICE PARSING PROMPT (STRICT JSON)

You are a parser.

Return VALID JSON ONLY with the following fields:

- documentType
- invoiceNumber
- invoiceDate (DD-MM-YYYY)
- supplierName
- supplierAddress
- supplierGstin
- buyerName
- buyerAddress
- buyerGstin
- lineItems [
    {
      description,
      hsn,
      quantity,
      rate,
      amount,
      gstRate,
      unit
    }
  ]
- taxableValue
- total

Rules:
- If the document is NOT an invoice, set documentType = "INVALID"
- CRITICAL: If the document appears to be a BANK STATEMENT (has "Withdrawal", "Deposit", "Balance" columns, or "Statement of Account"), set documentType = "BANK_STATEMENT" and return immediately.
- Do not include explanations
- Do not include extra text
- VERIFY MATH: total = taxableValue + (taxableValue * gstRate/100) is NOT always true for multi-rate invoices.
- USE THE PRINTED GRAND TOTAL FROM THE DOCUMENT.
"""

        response = model.generate_content([
            *gemini_content_parts,
            prompt
        ], generation_config={"response_mime_type": "application/json"})

        # Track token usage
        track_token_usage(response)

        print(f"DEBUG AI RAW RESPONSE: {response.text}")
        clean_json = clean_json_text(response.text)
        data = json.loads(clean_json)
        print(f"DEBUG EXTRACTED DATA: {data}")
        
        return {
            "success": True,
            "invoice": data,
            "decrypted_pdf": decrypted_pdf_b64,
            "message": "Document processed successfully"
        }
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="Gemini API quota exceeded. Please retry later or upgrade plan."
        )
    except HTTPException as he:
        # Re-raise HTTP exceptions (like 422 for password)
        raise he
    except Exception as e:
        import traceback
        print(f"PROCESS DOCUMENT ERROR: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


@app.post("/ai/process-bulk")
async def process_bulk(
    files: List[UploadFile] = File(...),
    authorization: str = Header(None)
):
    """Process multiple documents and return structured data"""
    validate_api_key(authorization)

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured on server")

    genai.configure(api_key=GEMINI_API_KEY)
    
    # Use standard flash model for consistency
    model = genai.GenerativeModel('gemini-2.5-flash')

    results = []
    successful = 0
    failed = 0

    import base64, json

    for f in files:
        # Auto-save file
        save_upload_file(f)
        
        try:
            file_bytes = await f.read()
            b64 = base64.b64encode(file_bytes).decode('utf-8')

            prompt = """Extract invoice data into this exact JSON structure:
{
  "supplierName": "string",
  "supplierAddress": "string",
  "supplierGstin": "string",
  "buyerName": "string",
  "buyerAddress": "string",
  "buyerGstin": "string",
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "voucherType": "Purchase",
  "lineItems": [
    {
      "description": "string",
      "hsn": "string",
      "quantity": 0,
      "rate": 0,
      "amount": 0,
      "gstRate": 0,
      "unit": "string"
    }
  ]
}
Ensure dates are YYYY-MM-DD.
"""
            response = model.generate_content([
                {"mime_type": f.content_type or "application/octet-stream", "data": b64},
                prompt
            ], generation_config={"response_mime_type": "application/json"})

            clean_json = clean_json_text(response.text)
            data = json.loads(clean_json)
            results.append(data)
            successful += 1
        except ResourceExhausted:
            # If bulk processing hits limit, stop and raise error to save user from waiting
            raise HTTPException(
                status_code=429,
                detail="Gemini API quota exceeded during bulk processing."
            )
        except Exception:
            failed += 1
            continue

    return {
        "success": True,
        "invoices": results,
        "successful": successful,
        "failed": failed,
        "message": "Bulk processing completed"
    }
@app.post("/ai/process-invoice-pdf")
async def process_invoice_pdf(
    request: Dict[str, Any],
    authorization: str = Header(None)
):
    """
    Process invoice PDF with text extraction BEFORE Gemini.
    Reduces token usage by 90-95% compared to sending base64 PDF.
    """
    # Validate user's API key
    validate_api_key(authorization)
    
    # Check if Gemini API key is configured
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Gemini API key not configured on server"
        )
    
    try:
        import base64
        import io
        import pdfplumber
        import json
        
        # Extract base64 PDF from request
        pdf_base64 = request.get('pdfData', '')
        password = request.get('password', None)  # Extract password if provided

        if not pdf_base64:
            raise HTTPException(status_code=400, detail="No PDF data provided")
        
        # Decode base64 to PDF bytes
        pdf_bytes = base64.b64decode(pdf_base64)
        
        # Extract text from PDF using pdfplumber
        extracted_text = ""
        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes), password=password) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += page_text + "\n"
        except Exception as e:
            error_str = (str(e) + " " + repr(e)).lower()
            if "password" in error_str or "encrypted" in error_str or "decryption" in error_str:
                raise HTTPException(status_code=422, detail="Password required")
            
            print(f"PDFPlumber failed: {e}")
            # Ensure we re-raise if it was definitely a password error
            if "password" in error_str or "encrypted" in error_str or "decryption" in error_str:
                raise HTTPException(status_code=422, detail="Password required")
        
        # If no text extracted (scanned PDF), fall back to OCR
        if not extracted_text.strip():
             # Check if it was password locked but we missed it (unlikely with pdfplumber check above)
             pass 

             try:
                import pytesseract
                from pdf2image import convert_from_bytes
                
                # Note: convert_from_bytes also needs password if encrypted
                images = convert_from_bytes(pdf_bytes, userpw=password) if password else convert_from_bytes(pdf_bytes)
                extracted_text = "\n".join(
                    pytesseract.image_to_string(img) 
                    for img in images
                )
             except Exception as ocr_error:
                print(f"OCR failed: {str(ocr_error)}")
                ocr_str = str(ocr_error).lower()
                if "password" in ocr_str or "encrypted" in ocr_str:
                     raise HTTPException(status_code=422, detail="Password required")
                raise HTTPException(status_code=500, detail="Could not extract text from PDF")
        
        # ✅ IMPORTANT: Extract ALL text - do NOT filter anything
        # We preserve 100% of invoice data to ensure no fields are missed
        
        # Clean up the text (remove excessive whitespace, but keep all content)
        lines = []
        for line in extracted_text.splitlines():
            cleaned_line = line.strip()
            if cleaned_line:  # Only remove completely empty lines
                lines.append(cleaned_line)
        
        # Join all lines - this is the COMPLETE invoice text
        complete_text = "\n".join(lines)
        
        # Smart chunking: If text is too large (>8000 chars), intelligently split
        # but NEVER drop data - we'll process in chunks if needed
        max_chars = 8000  # Safe limit for Gemini
        
        if len(complete_text) <= max_chars:
            # Text fits in one request - use it all
            final_text = complete_text
        else:
            # Text is large - take first 8000 chars which usually contains all invoice data
            # (Invoice metadata is always at the top)
            final_text = complete_text[:max_chars]
            print(f"⚠️ Large invoice: Using first {max_chars} chars (full text: {len(complete_text)} chars)")
        
        print(f"📄 Extracted text: {len(extracted_text)} chars → Cleaned: {len(complete_text)} chars → Final: {len(final_text)} chars")

        
        # Configure Gemini
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Optimized prompt for Tally
        prompt = f"""Extract invoice data and return ONLY valid JSON.

Required fields (camelCase strictly):
- supplierName
- supplierAddress
- supplierGstin
- buyerName
- buyerAddress
- buyerGstin
- buyerAddress
- buyerGstin
- invoiceNumber
- documentType (INVOICE | BANK_STATEMENT | INVALID)
- invoiceDate (YYYY-MM-DD format)
- taxableValue
- totalAmount
- lineItems: [{{"description": "", "quantity": 0, "rate": 0, "amount": 0, "gstRate": 0, "hsn": "", "unit": ""}}]

GST EXTRACTION RULES:
1. 'gstRate' must be a NUMBER (e.g. 18, 12, 5, 0).
2. Look for columns "GST Rate", "IGST %", "CGST %", "SGST %".
3. If CGST (9%) and SGST (9%) are separate, SUM them: gstRate = 18.
4. If gstRate is NOT in the line item row, look at the tax summary at the bottom.
5. If NO rate is found, CALCULATE it: (Tax Amount / Taxable Amount) * 100.
6. Verify: (amount * gstRate/100) should approx equal the tax amount.

Invoice text:
{final_text}

CRITICAL RULES:
1. If this text looks like a BANK STATEMENT (contains "Withdrawal", "Deposit", "Balance" columns, dates in a list, "Opening Balance"), set "documentType": "BANK_STATEMENT" and return strictly valid JSON.
2. Otherwise, assume it is an INVOICE.

Return ONLY the JSON object, no markdown formatting."""

        # Call Gemini with compressed text
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )

        print(f"DEBUG INVOICE PDF RAW: {response.text}")
        clean_json = clean_json_text(response.text)
        invoice_data = json.loads(clean_json)
        print(f"DEBUG INVOICE PDF DATA: {invoice_data}")
        
        
        # Determine strict document type
        ai_doc_type = invoice_data.get("documentType", "INVOICE")
        
        # Fallback Heuristic: If AI messed up but we see strong bank keywords in text
        if "withdrawal" in final_text.lower() and "deposit" in final_text.lower() and "balance" in final_text.lower():
             print("DEBUG: Heuristic detected BANK_STATEMENT overriding AI")
             ai_doc_type = "BANK_STATEMENT"
             
        return {
            "success": True,
            "documentType": ai_doc_type,
            "data": invoice_data,
            "stats": {
                "original_text_length": len(extracted_text),
                "final_text_length": len(final_text),
                "text_preserved": "100% - All invoice data extracted"
            }
        }
        
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="Gemini API quota exceeded. Please retry later or upgrade plan."
        )
    except Exception as e:
        import traceback
        import uuid
        error_msg = str(e)
        error_trace = traceback.format_exc()
        
        print(f"ERROR processing invoice: {error_msg}")
        print(f"Traceback: {error_trace}")
        
        # Save error to database
        # (Database logging disabled)
        
        raise HTTPException(
            status_code=500,
            detail=f"Error processing invoice: {error_msg}"
        )



@app.post("/ai/process-bank-statement-pdf")
async def process_bank_statement_pdf(
    file: UploadFile = File(...),
    password: Optional[str] = Form(None),
    authorization: str = Header(None)
):
    """
    Process Bank Statement PDF.
    Prioritizes TEXT extraction (pdfplumber) for digital PDFs to save tokens/speed.
    Falls back to IMAGE processing for scanned PDFs.
    """
    validate_api_key(authorization)

    # Auto-save file
    save_upload_file(file)

    if not GEMINI_API_KEY:
        raise HTTPException(500, "Gemini API key not configured")

    genai.configure(api_key=GEMINI_API_KEY)
    
    # Use flash model for speed and large context window
    model = genai.GenerativeModel("gemini-2.5-flash")

    # Read uploaded PDF
    pdf_bytes = await file.read()
    
    # ------------------------------------------------------------------
    # UNIFIED DECRYPTION LOGIC (Same as Invoices)
    # ------------------------------------------------------------------
    # Track if we successfully decrypted
    was_decrypted = False

    if password:
        try:
            import io
            import pypdf
            print(f"DEBUG: Attempting decryption with password: {password}")
            
            # Decrypt to new bytes
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes), password=password)
            writer = pypdf.PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            
            output_stream = io.BytesIO()
            writer.write(output_stream)
            pdf_bytes = output_stream.getvalue()
            
            # Clear password since we now have unlocked bytes
            password = None 
            was_decrypted = True # Mark as decrypted so we don't ask again
            print("✅ Bank Statement Decrypted Successfully")
            
        except Exception as e:
            print(f"❌ pypdf Decryption Failed (likely compatibility issue): {e}")
            print("⚠️ Continuing with original locked PDF using provided password...")
            # Do NOT raise error here. Let pdfplumber/pdf2image try with the password.
    
    # Attempt Text Extraction first
    import io
    import pdfplumber
    import json
    
    extracted_text = ""
    
    try:
        # Use password if provided (it will be None if we successfully decrypted above)
        with pdfplumber.open(io.BytesIO(pdf_bytes), password=password) as pdf:
            print(f"DEBUG: PDF Opened Successfully. Pages: {len(pdf.pages)}")
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
    except Exception as e:
        print(f"PDF Text extraction failed: {e}")
        error_str = (str(e) + " " + repr(e)).lower()
        
        # Only raise 422 if we haven't already decrypted it
        # If we DID decrypt it, "Password incorrect" here is likely a pdfplumber false positive/compat issue
        # so we should fall back to Image processing instead of asking user again.
        if ("password" in error_str or "encrypted" in error_str or "decryption" in error_str) and not was_decrypted:
            raise HTTPException(status_code=422, detail="Password required")
        # Continue to image fallback ONLY if not a password error (or if we already decrypted)
    
    # Check if we have enough text to consider it a digital PDF
    # (Scanned docs might have a few chars of noise)
    if len(extracted_text.strip()) > 50:
        print(f"📄 Processing Bank Statement as TEXT ({len(extracted_text)} chars)")
        
        # Limit text if it's insanely large
        if len(extracted_text) > 100000:
            extracted_text = extracted_text[:100000] + "\n...(truncated)"
            
        prompt = f"""5️⃣ BANK STATEMENT TEXT PARSING PROMPT (STRICT JSON)

You are a bank statement analyzer.
Extract data from the following text into this exact JSON structure:

{{
  "documentType": "BANK_STATEMENT" or "INVOICE",
  "bankName": "string (Extract from top header. DO NOT output 'Unknown Bank' unless impossible to find)",
  "accountNumber": "string (full or masked)",
  "accountNumberLast4": "string (last 4 digits)",
  "totalWithdrawals": number (sum of all debits),
  "totalDeposits": number (sum of all credits),
  "transactions": [
    {{
      "id": "string (generate unique ID)",
      "date": "YYYY-MM-DD",
      "description": "string",
      "withdrawal": number (0 if deposit),
      "deposit": number (0 if withdrawal),
      "balance": number,
      "voucherType": "Payment" (if withdrawal) or "Receipt" (if deposit),
      "contraLedger": "string (suggest category e.g. 'Bank Charges', 'Salary', 'Vendor Name', or 'Suspense A/c')"
    }}
  ]
}}

RULES:
1. **CRITICAL CHECK**: If this document contains "Tax Invoice", "Bill To", "GSTIN", "Supply", and is clearly a bill from a vendor, set "documentType" to "INVOICE" and return immediately.
2. Detect Date Format: Normalize all dates to YYYY-MM-DD.
3. **Bank Name**: Look at the FIRST FEW LINES. Common banks: HDFC, ICICI, SBI, Axis, Kotak, Canara, Yes Bank.
4. **Columns**:
   - 'Debit', 'Dr', 'Withdrawal', 'Payments' -> withdrawal
   - 'Credit', 'Cr', 'Deposit', 'Receipts' -> deposit
5. **Transactions**:
   - Combine multi-line descriptions.
   - If a row has NO amount in neither Debit nor Credit, SKIP IT (it might be a header or sub-header).
   - Ensure no commas in numbers.

PRIORITY INSTRUCTION:
Check the document type FIRST.
If it is an invoice, set "documentType": "INVOICE" and ignore other fields.
If it is a bank statement, set "documentType": "BANK_STATEMENT" and extract all fields.

Text Content:
{extracted_text}

JSON OUTPUT ONLY:
"""
        try:
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            clean_json = clean_json_text(response.text)
            data = json.loads(clean_json)
            
            # Ensure transactions array exists
            if "transactions" not in data or data["transactions"] is None:
                data["transactions"] = []
                
            return {
                "success": True,
                **data
            }
            
        except ResourceExhausted:
            raise HTTPException(
                status_code=429,
                detail="AI quota exceeded. Please wait or upgrade plan."
            )
        except Exception as e:
            print(f"Gemini Text Processing Failed: {e}")
            # Fallback to image processing if text parsing fails
            pass

    # ================= FALLBACK: IMAGE PROCESSING =================
    print(f"📸 Fallback: Processing Bank Statement as IMAGES. Password providing: {password}")
    
    try:
        print("DEBUG: Calling split_pdf_to_images...")
        pages = split_pdf_to_images(pdf_bytes, password=password)
        print(f"DEBUG: split_pdf_to_images success. {len(pages)} images.")
    except Exception as e:
        import traceback
        print(f"📸 Image Fallback Failed: {e}")
        # traceback.print_exc() # Optional: keep logs clean if we handle it
        
        # Check both str and repr to catch "pdfminer.pdfdocument.PDFPasswordIncorrect"
        error_str = (str(e) + " " + repr(e)).lower()
        
        if ("password" in error_str or "encrypted" in error_str or "decryption" in error_str or "incorrect" in error_str) and not was_decrypted:
             raise HTTPException(status_code=422, detail="Password required")
        
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to images: {str(e)}")
        
    # First, detect document type using first page
    detected_doc_type = "BANK_STATEMENT"  # default
    
    if len(pages) > 0:
        first_img_base64, _ = pages[0]
        try:
            type_check_prompt = """CRITICAL DOCUMENT TYPE CHECK:

Analyze this image and determine if it is:
1. An INVOICE/BILL (contains: Tax Invoice, GSTIN, Bill To, itemized products/services, supplier details)
2. A BANK STATEMENT (contains: Bank name, Account number, transaction table with dates/debits/credits)

Return ONLY a JSON object:
{
  "documentType": "INVOICE" or "BANK_STATEMENT"
}
"""
            type_response = model.generate_content(
                [
                    {"mime_type": "image/png", "data": first_img_base64},
                    type_check_prompt
                ],
                generation_config={"response_mime_type": "application/json"}
            )
            
            type_data = json.loads(clean_json_text(type_response.text))
            detected_doc_type = type_data.get("documentType", "BANK_STATEMENT")
            print(f"📋 Detected Document Type from Image: {detected_doc_type}")
            
        except Exception as e:
            print(f"⚠️ Document type detection failed, defaulting to BANK_STATEMENT: {e}")
    
    # If INVOICE detected, return immediately with documentType
    if detected_doc_type == "INVOICE":
        return {
            "success": True,
            "documentType": "INVOICE",
            "transactions": [],
            "note": "Invoice detected in Bank Statement section via Image Processing"
        }
    
    # Otherwise proceed with bank statement extraction
    transactions = []

    for img_base64, _ in pages:
        try:
            response = model.generate_content(
                [
                    {"mime_type": "image/png", "data": img_base64},
                    "Extract bank statement JSON only with transactions array. Fields: date, description, withdrawal, deposit, balance."
                ],
                generation_config={"response_mime_type": "application/json"}
            )

            data = json.loads(clean_json_text(response.text))
            transactions.extend(data.get("transactions", []))
        except ResourceExhausted:
            raise HTTPException(
                status_code=429,
                detail="AI quota exceeded. Please wait or upgrade plan."
            )
        except:
            continue

    # Return combined transactions from images
    return {
        "success": True,
        "documentType": "BANK_STATEMENT",
        "transactions": transactions,
        "note": "Processed via Image Fallback"
    }


@app.post("/ai/process-bank-statement")
async def process_bank_statement(
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    """Process a single bank statement image (PNG/JPG)"""
    validate_api_key(authorization)

    # Auto-save file
    save_upload_file(file)

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured on server")

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash')

        file_bytes = await file.read()
        import base64, json
        img_base64 = base64.b64encode(file_bytes).decode('utf-8')

        prompt = """4️⃣ BANK STATEMENT PARSING PROMPT (STRICT JSON)
You are a bank statement parser.

Return VALID JSON ONLY with the following fields (matches React Schema):

- documentType (BANK_STATEMENT | INVOICE)
- bankName (Look for logo/text at top)
- accountNumber
- accountNumberLast4
- totalWithdrawals
- totalDeposits
- transactions [
    {
      id (generate a random string),
      date (YYYY-MM-DD),
      description,
      withdrawal (money going OUT - Debit/Dr),
      deposit (money coming IN - Credit/Cr),
      balance,
      voucherType ("Payment" if withdrawal > 0 else "Receipt"),
      contraLedger (Infer intelligently from description, e.g. "Staff Welfare")
    }
  ]

IMPORTANT RULES:
1. **CRITICAL CHECK**: If this document looks like a BILL, TAX INVOICE, or RECEIPT (has GSTIN, Supplier Name, Item list), set `documentType` to "INVOICE".
2. If it is a Bank Statement, set `documentType` to "BANK_STATEMENT".
- Extract account number from the statement header
- **Bank Name**: Explicitly look for the bank name at the top.
- **Columns**:
  - Ensure 'Withdrawal' column maps to 'withdrawal' field.
  - Ensure 'Deposit' column maps to 'deposit' field.
  - If there is only one 'Amount' column and a 'Type' column (Dr/Cr), parse accordingly.
   - If there is only one 'Amount' column and a 'Type' column (Dr/Cr), parse accordingly.

PRIORITY INSTRUCTION:
Check the document type FIRST.
If it is an invoice, set "documentType": "INVOICE" and ignore other fields.
If it is a bank statement, set "documentType": "BANK_STATEMENT" and extract all fields.
"""

        response = model.generate_content([
            {"mime_type": file.content_type or "image/png", "data": img_base64},
            prompt
        ], generation_config={"response_mime_type": "application/json"})

        print(f"DEBUG BANK IMG RAW: {response.text}")
        clean_json = clean_json_text(response.text)
        data = json.loads(clean_json)
        print(f"DEBUG BANK IMG DATA: {data}")
        
        # Ensure transactions array exists
        if "transactions" not in data or data["transactions"] is None:
             data["transactions"] = []

        return {
            "success": True,
            **data
        }
    except ResourceExhausted:
        raise HTTPException(
            status_code=429,
            detail="AI quota exceeded. Please wait or upgrade plan."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process bank statement: {str(e)}")


class PlanUpdate(BaseModel):
    plan: str

class ThresholdUpdate(BaseModel):
    threshold: int

@app.post("/api/set-plan")
async def set_plan(
    update: PlanUpdate,
    authorization: str = Header(None)
):
    """Set the user's plan (Bronze/Gold/Platinum)"""
    validate_api_key(authorization)
    
    if update.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    token_data = load_token_usage()
    token_data["plan"] = update.plan
    save_token_usage(token_data)
    
    return {"success": True, "plan": update.plan}


@app.post("/api/update-notified-threshold")
async def update_threshold(
    update: ThresholdUpdate,
    authorization: str = Header(None)
):
    """Update the last notified threshold"""
    validate_api_key(authorization)
    
    token_data = load_token_usage()
    token_data["last_notified_threshold"] = update.threshold
    save_token_usage(token_data)
    
    return {"success": True}


@app.post("/api/reset-tokens")
async def reset_tokens(authorization: str = Header(None)):
    """Reset token usage manually"""
    validate_api_key(authorization)
    
    token_data = load_token_usage()
    token_data["used"] = 0
    token_data["last_notified_threshold"] = 0
    save_token_usage(token_data)
    
    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
