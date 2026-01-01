from pathlib import Path
import re
import threading

import torch
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, Pipeline, pipeline

MODEL_NAME = "sshleifer/distilbart-cnn-12-6"

MODEL_CACHE_DIR = Path("model-cache")
MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

MAX_INPUT_CHARS = 16000
SENTENCE_END_RE = re.compile(r"[.!?。！？]+")
TRAILING_INCOMPLETE_RE = re.compile(r"\b(and|or|but|because|so|to|with|of|in|for|at|by|from)\s*$", re.IGNORECASE)

app = FastAPI(title="Website Content Analyzer NLP API")

# Allow the Chrome extension side panel (chrome-extension://...) to call this local API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    # Keep this API debuggable in a local/offline workflow.
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


DEVICE = 0 if torch.cuda.is_available() else -1

_SUMMARIZER: Pipeline | None = None
_SUMMARIZER_LOCK = threading.Lock()


def get_summarizer() -> Pipeline:
    global _SUMMARIZER
    if _SUMMARIZER is not None:
        return _SUMMARIZER
    with _SUMMARIZER_LOCK:
        if _SUMMARIZER is not None:
            return _SUMMARIZER
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR))
        model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR))
        _SUMMARIZER = pipeline(
            "summarization",
            model=model,
            tokenizer=tokenizer,
            device=DEVICE,
        )
        return _SUMMARIZER
def summarize_text(text: str, min_length: int = 20, max_length: int = 50) -> str:
    if not text.strip():
        return ""

    # Prevent hard truncation in the generated text which can end mid-sentence.
    # We keep it deterministic (no sampling) and let beams find a clean end.
    summarizer = get_summarizer()
    output = summarizer(
        text,
        min_length=min_length,
        max_length=max_length,
        truncation=True,
        do_sample=False,
        num_beams=4,
        early_stopping=True,
        no_repeat_ngram_size=3,
        clean_up_tokenization_spaces=True,
    )
    if output and isinstance(output, list):
        return output[0].get("summary_text", "")
    return ""


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def truncate_at_boundary(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    text = str(text or "")
    if len(text) <= max_chars:
        return text

    cut = text[:max_chars]
    matches = list(SENTENCE_END_RE.finditer(cut))
    if matches:
        last_end = matches[-1].end()
        if last_end >= int(max_chars * 0.6):
            return cut[:last_end].strip()

    last_space = cut.rfind(" ")
    if last_space >= int(max_chars * 0.6):
        return cut[:last_space].strip()

    return cut.strip()


def clean_summary_text(summary: str) -> str:
    s = normalize_whitespace(summary)
    if not s:
        return ""

    # If the model stopped mid-thought (common when max_length is small),
    # trim to the last full sentence if available.
    if s[-1] not in ".!?。！？":
        last_punct = max(s.rfind("."), s.rfind("!"), s.rfind("?"), s.rfind("。"), s.rfind("！"), s.rfind("？"))
        if last_punct != -1 and last_punct >= int(len(s) * 0.5):
            s = s[: last_punct + 1].strip()

    s = TRAILING_INCOMPLETE_RE.sub("", s).strip()
    return s


class AnalyzeRequest(BaseModel):
    text: str
    task: str = "summary"
    min_length: int = Field(25, ge=5)
    max_length: int = Field(90, ge=10)


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    text = normalize_whitespace(req.text)
    if not text:
        return {"error": "Empty text"}

    if req.max_length < req.min_length:
        return {"error": "max_length must be >= min_length"}

    # Avoid cutting mid-sentence; model tokenization will also truncate if needed.
    text = truncate_at_boundary(text)

    if req.task == "summary":
        summary = summarize_text(text, min_length=req.min_length, max_length=req.max_length)
        if not summary:
            return {"error": "Unable to generate summary"}

        summary = clean_summary_text(summary)
        if not summary:
            return {"error": "Unable to generate clean summary"}

        return {"summary": summary}

    return {"error": "Unsupported task"}
